// Thin wrapper around RTCPeerConnection for the offer/answer flow described
// in §4 and §6 of the spike doc. We use *non-trickle* ICE — gather all
// candidates locally before handing the SDP off to the user — because the
// signaling channel is a human pasting a string into Teams, not a socket.

import { decode, encode } from './encoding'
import { attachRtcDiagnostics } from './rtcDiagnostics'

// Cloudflare primary, Google fallback. Browser races them; see §3.2. Always
// present; a configured TURN entry is appended below when env vars are set.
const BASE_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: 'stun:stun.l.google.com:19302' },
]

// Optional TURN relay for traversing symmetric NATs (VPN exits, corporate
// guest Wi-Fi, carrier-grade NAT). Pasted from a provider's dashboard into
// `.env.local`; see `.env.example` for the schema. When unset the app
// behaves exactly as before — STUN-only — so contributors without TURN
// creds can still run the spike on home networks.
//
// SECURITY: VITE_* env vars are bundled into the client JS. For `npm run
// dev` on localhost the creds never leave the machine. If this app is ever
// built and deployed publicly with these env vars set, the credentials
// leak to anyone viewing source and can be used to consume bandwidth on
// your TURN account. The production-shaped fix is a small server that
// mints short-lived per-session creds — see step 3 of
// docs/known_limitations.md.
function buildIceServers(): RTCIceServer[] {
  const urlsRaw = import.meta.env.VITE_TURN_URLS
  const username = import.meta.env.VITE_TURN_USERNAME
  const credential = import.meta.env.VITE_TURN_CREDENTIAL
  if (!urlsRaw || !username || !credential) return BASE_ICE_SERVERS
  const urls = urlsRaw
    .split(',')
    .map((u) => u.trim())
    .filter(Boolean)
  if (urls.length === 0) return BASE_ICE_SERVERS
  return [...BASE_ICE_SERVERS, { urls, username, credential }]
}

export const ICE_CONFIG: RTCConfiguration = { iceServers: buildIceServers() }

// `failed` covers pre-connect failures (ICE never converged, setup blew up).
// `closed` covers post-connect drops (channel was open, then went away — peer
// closed the tab, transport died mid-session). The screens render different
// UI for each: "Try a different network" for setup failures, "Connection
// lost — return home" for runtime drops. See BUG-005.
export type ConnectionState =
  | 'idle'
  | 'gathering'
  | 'awaiting-answer'
  | 'connecting'
  | 'connected'
  | 'failed'
  | 'closed'

export interface ChatMessage {
  id: string
  from: 'me' | 'them'
  text: string
  at: number
  /**
   * FEAT-010: only set on outgoing (`from: 'me'`) messages. Starts as
   * `'pending'` the moment the bubble appears (the chat envelope has been
   * handed to the data channel); flips to `'delivered'` when a `receipt`
   * envelope for this id arrives from the peer. Incoming messages leave
   * this undefined — receipts on the receiver side fire automatically and
   * never render.
   */
  delivery?: 'pending' | 'delivered'
}

export interface PeerSession {
  pc: RTCPeerConnection
  channel: RTCDataChannel | null
  /** The encoded offer or answer ready to share, depending on role. */
  encodedLocal: string
}

// If gathering stalls (STUN blocked, network change, browser quirk), we
// resolve anyway after this many ms with whatever candidates the local
// description has so far. The downstream `connectionState === 'failed'`
// listener will surface a recoverable error if that partial set can't connect.
const ICE_GATHERING_TIMEOUT_MS = 5000

export function waitForIceComplete(pc: RTCPeerConnection, timeoutMs: number = ICE_GATHERING_TIMEOUT_MS): Promise<void> {
  return new Promise((resolve) => {
    if (pc.iceGatheringState === 'complete') return resolve()
    const cleanup = () => {
      pc.removeEventListener('icegatheringstatechange', handle)
      clearTimeout(timer)
    }
    const handle = () => {
      if (pc.iceGatheringState === 'complete') {
        cleanup()
        resolve()
      }
    }
    pc.addEventListener('icegatheringstatechange', handle)
    const timer = setTimeout(() => {
      cleanup()
      resolve()
    }, timeoutMs)
  })
}

/**
 * Alice's side — creates a data channel locally and produces an offer SDP.
 * Caller is responsible for wiring `pc.onconnectionstatechange` and the
 * channel's `onopen`/`onmessage` listeners before awaiting the returned
 * promise so no events are missed.
 */
export async function createOffer(): Promise<PeerSession> {
  const pc = new RTCPeerConnection(ICE_CONFIG)
  attachRtcDiagnostics(pc, 'offerer')
  const channel = pc.createDataChannel('chat', { ordered: true })

  await pc.setLocalDescription(await pc.createOffer())
  await waitForIceComplete(pc)

  if (!pc.localDescription) throw new Error('Local description missing after ICE gathering')
  return { pc, channel, encodedLocal: encode(pc.localDescription) }
}

/** Alice's side — finalize the connection by accepting Bob's answer code. */
export async function acceptAnswer(pc: RTCPeerConnection, answerCode: string): Promise<void> {
  const answer = decode<RTCSessionDescriptionInit>(answerCode)
  await pc.setRemoteDescription(answer)
}

/**
 * Bob's side — accept Alice's offer URL payload and produce an answer code.
 * The data channel arrives asynchronously via `ondatachannel`. We register
 * `pc.ondatachannel` before the SDP exchange to minimise the race window,
 * but the browser may still deliver the event *after* the channel has
 * already transitioned to `'open'` on a starved JS queue. Callers must
 * therefore check `channel.readyState` inside `onChannel` rather than relying
 * solely on the `open` event firing.
 */
export async function acceptOffer(
  offerCode: string,
  onChannel: (channel: RTCDataChannel) => void,
): Promise<PeerSession> {
  const pc = new RTCPeerConnection(ICE_CONFIG)
  attachRtcDiagnostics(pc, 'answerer')
  const offer = decode<RTCSessionDescriptionInit>(offerCode)

  let channel: RTCDataChannel | null = null
  pc.ondatachannel = (event) => {
    channel = event.channel
    onChannel(event.channel)
  }

  await pc.setRemoteDescription(offer)
  await pc.setLocalDescription(await pc.createAnswer())
  await waitForIceComplete(pc)

  if (!pc.localDescription) throw new Error('Local description missing after ICE gathering')
  return { pc, channel, encodedLocal: encode(pc.localDescription) }
}
