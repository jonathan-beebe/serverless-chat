// Verbose, dev-only logging for the WebRTC handshake. Wired into createOffer /
// acceptOffer so every PeerConnection in dev gets the same diagnostic surface:
//
//   - each ICE candidate as it's gathered (host / srflx / relay, udp / tcp)
//   - `icecandidateerror` (the smoking gun for STUN/TURN blocked by a VPN or
//     captive portal — error code + URL + host)
//   - iceGathering / iceConnection / connection / signaling state transitions
//   - a "gathering complete" summary with counts by candidate type, so a line
//     like "0 srflx, 0 relay" makes a symmetric-NAT / blocked-UDP diagnosis
//     obvious without digging through DevTools
//   - the selected candidate pair (and its RTT) once `connectionState` flips
//     to `connected`, so you can tell whether you ended up on a direct (srflx)
//     or relayed (relay) path
//
// Everything is gated by `import.meta.env.DEV` so the production bundle stays
// quiet. All output goes to `console.info` / `console.warn` — never
// `console.error`, which the test runner is configured to treat as a failure.

type CandidateType = 'host' | 'srflx' | 'prflx' | 'relay' | 'unknown'

interface GatheringTally {
  startedAt: number
  counts: Record<CandidateType, number>
}

function classifyType(raw: string | undefined | null): CandidateType {
  switch (raw) {
    case 'host':
    case 'srflx':
    case 'prflx':
    case 'relay':
      return raw
    default:
      return 'unknown'
  }
}

function formatCounts(counts: Record<CandidateType, number>): string {
  return (
    (['host', 'srflx', 'prflx', 'relay', 'unknown'] as const)
      .filter((k) => counts[k] > 0)
      .map((k) => `${counts[k]} ${k}`)
      .join(', ') || 'none'
  )
}

function describeCandidate(c: RTCIceCandidate): string {
  const type = c.type ?? 'unknown'
  const protocol = c.protocol ?? '?'
  const address = c.address ?? '?'
  const port = c.port ?? '?'
  const related = c.relatedAddress ? ` (related ${c.relatedAddress}:${c.relatedPort})` : ''
  return `${type} ${protocol} ${address}:${port}${related}`
}

// Structural shape for local-/remote-candidate stats. lib.dom.d.ts in this
// project doesn't export `RTCIceCandidateStats`, but the fields below are
// what every browser reports — typed loosely so we can read them without
// committing to a global type that may not exist.
interface IceCandidateStatsShape {
  id: string
  candidateType?: string
  protocol?: string
  address?: string
  port?: number
}

async function logSelectedPair(pc: RTCPeerConnection, label: string): Promise<void> {
  try {
    const stats = await pc.getStats()
    let pair: RTCIceCandidatePairStats | undefined
    const candidates = new Map<string, IceCandidateStatsShape>()
    stats.forEach((report) => {
      if (report.type === 'candidate-pair' && (report as RTCIceCandidatePairStats).nominated) {
        pair = report as RTCIceCandidatePairStats
      }
      if (report.type === 'local-candidate' || report.type === 'remote-candidate') {
        candidates.set(report.id, report as IceCandidateStatsShape)
      }
    })
    if (!pair) {
      console.info(`[rtc:${label}] connected — no nominated candidate pair reported yet`)
      return
    }
    const local = pair.localCandidateId ? candidates.get(pair.localCandidateId) : undefined
    const remote = pair.remoteCandidateId ? candidates.get(pair.remoteCandidateId) : undefined
    const describe = (c: IceCandidateStatsShape | undefined): string =>
      c ? `${c.candidateType ?? '?'} ${c.protocol ?? '?'} ${c.address ?? '?'}:${c.port ?? '?'}` : 'unknown'
    const rtt = pair.currentRoundTripTime !== undefined ? `${Math.round(pair.currentRoundTripTime * 1000)}ms` : 'n/a'
    console.info(`[rtc:${label}] selected pair: local=${describe(local)} ↔ remote=${describe(remote)} (rtt=${rtt})`)
  } catch (err) {
    console.warn(`[rtc:${label}] getStats failed`, err)
  }
}

/**
 * Attach verbose, dev-only diagnostic listeners to a freshly-constructed
 * RTCPeerConnection. Safe to call right after `new RTCPeerConnection(...)`;
 * no-op in production. Listeners are GC'd when the PC is closed, so the
 * caller doesn't have to manage teardown.
 */
export function attachRtcDiagnostics(pc: RTCPeerConnection, label: string): void {
  if (!import.meta.env.DEV) return

  // Tests stub RTCPeerConnection with a minimal class that doesn't implement
  // getConfiguration. Skip the banner there rather than crashing the caller.
  try {
    const config = pc.getConfiguration?.()
    if (config) {
      const servers = (config.iceServers ?? [])
        .map((s) => (Array.isArray(s.urls) ? s.urls.join(',') : s.urls))
        .join(' | ')
      console.info(`[rtc:${label}] new RTCPeerConnection — iceServers: ${servers || '(none)'}`)
    }
  } catch {
    // Non-browser PC (test fake / non-conformant impl) — diagnostics still
    // attach the listeners below; the fake just won't dispatch them.
  }

  const tally: GatheringTally = {
    startedAt: Date.now(),
    counts: { host: 0, srflx: 0, prflx: 0, relay: 0, unknown: 0 },
  }

  pc.addEventListener('icegatheringstatechange', () => {
    console.info(`[rtc:${label}] iceGatheringState → ${pc.iceGatheringState}`)
    if (pc.iceGatheringState === 'complete') {
      const elapsed = Date.now() - tally.startedAt
      const summary = formatCounts(tally.counts)
      const noReflexive = tally.counts.srflx === 0 && tally.counts.relay === 0
      const msg = `[rtc:${label}] ICE gathering complete in ${elapsed}ms: ${summary}`
      if (noReflexive) {
        console.warn(`${msg} — no srflx/relay candidates; STUN may be blocked or this is a same-host test`)
      } else {
        console.info(msg)
      }
    }
  })

  pc.addEventListener('icecandidate', (event: RTCPeerConnectionIceEvent) => {
    if (!event.candidate || event.candidate.candidate === '') {
      // The end-of-gathering sentinel; the gatheringstatechange handler
      // already prints the summary, so nothing extra to do here.
      return
    }
    const type = classifyType(event.candidate.type)
    tally.counts[type] += 1
    console.info(`[rtc:${label}] candidate ${describeCandidate(event.candidate)}`)
  })

  pc.addEventListener('icecandidateerror', (event: Event) => {
    // RTCPeerConnectionIceErrorEvent is not in all lib.dom.d.ts versions; cast
    // through unknown to read the fields we need without committing to a type.
    const e = event as unknown as {
      url?: string
      errorCode?: number
      errorText?: string
      address?: string
      port?: number
      hostCandidate?: string
    }
    console.warn(
      `[rtc:${label}] icecandidateerror url=${e.url ?? '?'} code=${e.errorCode ?? '?'} "${e.errorText ?? ''}"` +
        (e.hostCandidate ? ` host=${e.hostCandidate}` : ''),
    )
  })

  pc.addEventListener('iceconnectionstatechange', () => {
    console.info(`[rtc:${label}] iceConnectionState → ${pc.iceConnectionState}`)
  })

  pc.addEventListener('signalingstatechange', () => {
    console.info(`[rtc:${label}] signalingState → ${pc.signalingState}`)
  })

  pc.addEventListener('connectionstatechange', () => {
    console.info(`[rtc:${label}] connectionState → ${pc.connectionState}`)
    if (pc.connectionState === 'connected') {
      void logSelectedPair(pc, label)
    } else if (pc.connectionState === 'failed') {
      console.warn(
        `[rtc:${label}] connection failed — gathered ${formatCounts(tally.counts)}. ` +
          `If 0 relay candidates were gathered, the network likely needs a TURN server (see docs/known_limitations.md).`,
      )
    }
  })
}
