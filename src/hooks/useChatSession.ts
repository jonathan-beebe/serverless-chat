import { useCallback, useEffect, useRef, useState } from 'react'
import { acceptAnswer, acceptOffer, ChatMessage, ConnectionState, createOffer } from '../core/rtc'
import { decode, deriveSync, encode, type WireEnvelope } from '../core/wire'

// The hook is the imperative shell: it owns the live RTCPeerConnection,
// the data channel, and the chat transcript. UI components subscribe to
// state via the returned object and never touch the connection directly.

export interface ChatSession {
  state: ConnectionState
  error: string | null
  /** Encoded offer URL payload, populated once we've gathered ICE as the offerer. */
  encodedLocal: string | null
  messages: ChatMessage[]
  /** FEAT-010: live network telemetry for the current session. */
  telemetry: NetworkTelemetry
  startAsOfferer: () => Promise<void>
  startAsAnswerer: (offerCode: string) => Promise<void>
  submitAnswer: (answerCode: string) => Promise<void>
  /**
   * Polite-peer recovery (FEAT-008): the user pasted another *offer* into
   * the reply box instead of an answer. Tear down our own pending offer and
   * become the answerer of the pasted offer so the other peer's existing
   * flow can finish the handshake. Only valid while `state === 'awaiting-answer'`.
   */
  politelyAcceptOffer: (offerCode: string) => Promise<void>
  send: (text: string) => void
  reset: () => void
}

/**
 * FEAT-010: per-session network telemetry. Lives entirely in memory; resets
 * on every reload or new session (no persistence). The `samples` buffer is a
 * capped ring (last 500 entries) of wire events the `#network` page renders
 * for a "is the connection slow?" diagnostic.
 */
export interface NetworkTelemetry {
  /** Date.now() when the channel transitioned to `open`. Null until connected. */
  connectedAt: number | null
  /** NTP-style sync result. Null until the probe → ack → done handshake completes
   *  (or the 5-second probe timeout fires — sync stays null, chat continues). */
  sync: { t1: number; t2: number; t3: number; t4: number; rtt: number; offset: number } | null
  /** Ring buffer of wire events. Capped at SAMPLE_CAP entries. */
  samples: TelemetrySample[]
  /** Median / p95 / current-RTT rollups computed from `samples`. */
  summary: TelemetrySummary
}

export interface TelemetrySummary {
  /** Number of round-trip samples observed (sync RTT + every chat receipt). */
  sampleCount: number
  /** Most recent round-trip latency in ms, or null if none observed. */
  currentRttMs: number | null
  medianRttMs: number | null
  p95RttMs: number | null
}

export type TelemetrySample =
  | { kind: 'sent'; at: number; messageId: string; sentAt: number }
  | { kind: 'received'; at: number; messageId: string; sentAt: number; transitMs: number | null }
  | { kind: 'receipt'; at: number; messageId: string; rttMs: number }
  | { kind: 'state-change'; at: number; state: ConnectionState }

const SAMPLE_CAP = 500
const SYNC_TIMEOUT_MS = 5000

// IDs are used purely as React `key` props on rendered messages, so we just
// need uniqueness within a session. `crypto.randomUUID` is available in all
// evergreen browsers (secure contexts) and Node ≥ 19, and avoids module-level
// state that would otherwise leak across sessions and tests.
function nextId(): string {
  return crypto.randomUUID()
}

function emptyTelemetry(): NetworkTelemetry {
  return {
    connectedAt: null,
    sync: null,
    samples: [],
    summary: { sampleCount: 0, currentRttMs: null, medianRttMs: null, p95RttMs: null },
  }
}

function computeSummary(samples: TelemetrySample[], syncRtt: number | null): TelemetrySummary {
  const rtts: number[] = []
  if (syncRtt !== null) rtts.push(syncRtt)
  for (const s of samples) if (s.kind === 'receipt') rtts.push(s.rttMs)
  const sorted = [...rtts].sort((a, b) => a - b)
  const median = sorted.length === 0 ? null : sorted[Math.floor(sorted.length / 2)]
  // p95 = the 95th percentile; on tiny sample counts this collapses to the max,
  // which is the right "spike-detection" answer for a session that's only seen
  // a handful of probes.
  const p95 = sorted.length === 0 ? null : sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]
  const current = rtts.length === 0 ? null : rtts[rtts.length - 1]
  return { sampleCount: rtts.length, currentRttMs: current, medianRttMs: median, p95RttMs: p95 }
}

export function useChatSession(): ChatSession {
  const [state, setState] = useState<ConnectionState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [encodedLocal, setEncodedLocal] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [telemetry, setTelemetry] = useState<NetworkTelemetry>(emptyTelemetry)

  const pcRef = useRef<RTCPeerConnection | null>(null)
  const channelRef = useRef<RTCDataChannel | null>(null)
  // FEAT-010: ring buffer for wire events. Lives in a ref so high-frequency
  // appends don't trigger re-renders. The `telemetry` state object is updated
  // by `commitTelemetry()` only when a *visible* signal changes (sync
  // completes, receipt arrives, state transitions) — which also recomputes the
  // summary against the ref's current contents.
  const samplesRef = useRef<TelemetrySample[]>([])
  const syncRef = useRef<NetworkTelemetry['sync']>(null)
  const connectedAtRef = useRef<number | null>(null)
  // Tracks the in-flight clock-sync probe (offerer side) so the timeout can
  // bail out cleanly if the ack never arrives.
  const pendingSyncRef = useRef<{ id: string; t1: number; timer: ReturnType<typeof setTimeout> } | null>(null)
  // FEAT-008: marks a deliberate teardown (polite-defer swap) so the channel's
  // async `onclose` doesn't reclassify the in-progress role swap as `'failed'`.
  // Cleared once the new answerer-side wiring is in place.
  const deliberateTeardownRef = useRef(false)
  // FEAT-010: differentiates which side of the handshake we are. Offerers
  // initiate the sync probe on `open`; answerers wait passively for one.
  const roleRef = useRef<'offerer' | 'answerer' | null>(null)

  const pushSample = useCallback((sample: TelemetrySample) => {
    const buf = samplesRef.current
    buf.push(sample)
    if (buf.length > SAMPLE_CAP) {
      // Drop oldest first — the diagnostic page cares about the latest
      // behavior, and 500 entries already covers many minutes of chat.
      buf.splice(0, buf.length - SAMPLE_CAP)
    }
  }, [])

  const commitTelemetry = useCallback(() => {
    setTelemetry({
      connectedAt: connectedAtRef.current,
      sync: syncRef.current,
      samples: samplesRef.current.slice(),
      summary: computeSummary(samplesRef.current, syncRef.current?.rtt ?? null),
    })
  }, [])

  // Transition setter that also appends a state-change sample. Replaces direct
  // `setState` calls for transitions we want represented in the timeline so
  // the `#network` page can show "Gathering: 1.2s; Connecting: 340ms; …".
  const transition = useCallback(
    (next: ConnectionState | ((prev: ConnectionState) => ConnectionState)) => {
      setState((prev) => {
        const resolved = typeof next === 'function' ? next(prev) : next
        if (resolved === prev) return prev
        pushSample({ kind: 'state-change', at: Date.now(), state: resolved })
        if (resolved === 'connected' && connectedAtRef.current === null) {
          connectedAtRef.current = Date.now()
        }
        // We don't `commitTelemetry()` here directly — React batches multiple
        // state setters together, and `setTelemetry` from within `setState`'s
        // updater would be a double-batched render. Instead schedule via the
        // microtask queue so it lands after the current React batch.
        queueMicrotask(commitTelemetry)
        return resolved
      })
    },
    [pushSample, commitTelemetry],
  )

  const teardown = useCallback(() => {
    channelRef.current?.close()
    pcRef.current?.close()
    channelRef.current = null
    pcRef.current = null
    if (pendingSyncRef.current) {
      clearTimeout(pendingSyncRef.current.timer)
      pendingSyncRef.current = null
    }
  }, [])

  // Tear down the active connection if the component unmounts mid-session
  // (e.g. user navigates away). Without this we leak a PeerConnection.
  useEffect(() => () => teardown(), [teardown])

  // FEAT-010: send a sync-probe envelope. Only the offerer initiates one.
  // Stores the in-flight probe so the timeout can clean up if the ack
  // never arrives.
  const initiateSync = useCallback(() => {
    const channel = channelRef.current
    if (!channel || channel.readyState !== 'open') return
    const probeId = nextId()
    const t1 = Date.now()
    const probe: WireEnvelope = { v: 1, t: 'sync-probe', id: probeId, sentAt: t1 }
    channel.send(encode(probe))
    const timer = setTimeout(() => {
      // Sync didn't complete in time. Chat is unaffected — telemetry.sync
      // stays null and the #network page renders the empty-sync state.
      console.warn('[telemetry] sync probe timed out after', SYNC_TIMEOUT_MS, 'ms')
      pendingSyncRef.current = null
    }, SYNC_TIMEOUT_MS)
    pendingSyncRef.current = { id: probeId, t1, timer }
  }, [])

  const handleEnvelope = useCallback(
    (env: WireEnvelope) => {
      const channel = channelRef.current
      if (!channel) return
      switch (env.t) {
        case 'chat': {
          const receivedAt = Date.now()
          // One-way transit estimate uses the sync offset if available. Until
          // sync completes we can still render the bubble — we just can't
          // compute a transit time, which the Network page renders as "—".
          const transitMs = syncRef.current === null ? null : receivedAt - env.sentAt - syncRef.current.offset
          setMessages((prev) => [...prev, { id: env.id, from: 'them', text: env.text, at: receivedAt }])
          pushSample({ kind: 'received', at: receivedAt, messageId: env.id, sentAt: env.sentAt, transitMs })
          // Auto-fire a delivered receipt. Receipt is fire-and-forget; no
          // retry, no UI rendering on the receiver side (parity with
          // WhatsApp's single grey check — the *sender* sees the indicator,
          // not the receiver).
          const receipt: WireEnvelope = {
            v: 1,
            t: 'receipt',
            id: nextId(),
            sentAt: Date.now(),
            replyTo: env.id,
            messageReceivedAt: receivedAt,
          }
          if (channel.readyState === 'open') channel.send(encode(receipt))
          commitTelemetry()
          return
        }
        case 'sync-probe': {
          // Answerer side. Echo the four-timestamp ack and let the offerer
          // forward us the full quad in a follow-up sync-done.
          const probeReceivedAt = Date.now()
          const ack: WireEnvelope = {
            v: 1,
            t: 'sync-ack',
            id: nextId(),
            sentAt: Date.now(),
            replyTo: env.id,
            probeReceivedAt,
          }
          if (channel.readyState === 'open') channel.send(encode(ack))
          // Stash t1/t2/t3 on the answerer so it can derive its own sync
          // when sync-done arrives carrying t4. t1 came from the probe's
          // sentAt; t2 is what we just observed; t3 is the ack's sentAt.
          pendingSyncRef.current = {
            id: ack.id,
            t1: env.sentAt,
            // Re-use the timer field for cleanup; answerer has no timeout
            // of its own — if the offerer never sends sync-done, the
            // answerer simply stays with sync=null.
            timer: setTimeout(() => {
              pendingSyncRef.current = null
            }, SYNC_TIMEOUT_MS),
          }
          // Carry t2/t3 on a closure-local object so sync-done can read them.
          // Store on the ref via an extension property.
          ;(pendingSyncRef.current as unknown as { t2: number; t3: number }).t2 = probeReceivedAt
          ;(pendingSyncRef.current as unknown as { t2: number; t3: number }).t3 = ack.sentAt
          return
        }
        case 'sync-ack': {
          // Offerer side. We have t1 (stored), t2 (env.probeReceivedAt),
          // t3 (env.sentAt). Capture t4 now, derive (rtt, offset), and
          // round-trip the four timestamps in a sync-done so the answerer
          // can do the same math.
          const pending = pendingSyncRef.current
          if (!pending || pending.id !== env.replyTo) {
            // Stale ack or a confused peer — drop quietly.
            return
          }
          clearTimeout(pending.timer)
          pendingSyncRef.current = null
          const t1 = pending.t1
          const t2 = env.probeReceivedAt
          const t3 = env.sentAt
          const t4 = Date.now()
          const { rtt, offset } = deriveSync(t1, t2, t3, t4)
          syncRef.current = { t1, t2, t3, t4, rtt, offset }
          const done: WireEnvelope = {
            v: 1,
            t: 'sync-done',
            id: nextId(),
            sentAt: Date.now(),
            replyTo: env.id,
            t1,
            t2,
            t3,
            t4,
          }
          if (channel.readyState === 'open') channel.send(encode(done))
          commitTelemetry()
          return
        }
        case 'sync-done': {
          // Answerer side. Use the four timestamps the offerer collected to
          // derive (rtt, offset) from the answerer's vantage. Per NTP the
          // answerer's offset is the negation of the offerer's — both peers
          // end up with consistent magnitudes and opposite signs.
          const { rtt, offset } = deriveSync(env.t1, env.t2, env.t3, env.t4)
          syncRef.current = { t1: env.t1, t2: env.t2, t3: env.t3, t4: env.t4, rtt, offset: -offset }
          if (pendingSyncRef.current) {
            clearTimeout(pendingSyncRef.current.timer)
            pendingSyncRef.current = null
          }
          commitTelemetry()
          return
        }
        case 'receipt': {
          const arrivedAt = Date.now()
          // Compute the RTT off the sample we stamped at send time (rather
          // than the message's `at`), so a peer with a wildly skewed clock
          // doesn't make our RTT negative. The sample buffer is the source
          // of truth — if we don't have a matching 'sent' sample, the
          // receipt is for a message we never sent.
          const sentSample = samplesRef.current.find(
            (s): s is Extract<TelemetrySample, { kind: 'sent' }> => s.kind === 'sent' && s.messageId === env.replyTo,
          )
          if (!sentSample) {
            console.warn('[telemetry] receipt for unknown message id', env.replyTo)
            return
          }
          const rttMs = arrivedAt - sentSample.sentAt
          setMessages((prev) =>
            prev.map((m) => (m.id === env.replyTo && m.from === 'me' ? { ...m, delivery: 'delivered' } : m)),
          )
          pushSample({ kind: 'receipt', at: arrivedAt, messageId: env.replyTo, rttMs })
          commitTelemetry()
          return
        }
      }
    },
    [pushSample, commitTelemetry],
  )

  const wireChannel = useCallback(
    (channel: RTCDataChannel) => {
      channelRef.current = channel
      const onOpen = () => {
        transition('connected')
        // Offerer initiates the sync probe; answerer waits passively for one.
        // Only the offerer creates the channel; the answerer receives it via
        // ondatachannel. We track role on the hook itself.
        if (roleRef.current === 'offerer') {
          // Defer one tick so the state transition and connectedAt commit
          // before we start mutating telemetry from a wire send.
          queueMicrotask(initiateSync)
        }
      }
      // For the offerer the channel is freshly created and guaranteed to be in
      // `'connecting'`, but the answerer receives it via `pc.ondatachannel`,
      // which the browser may dispatch *after* the transport has already
      // transitioned to `'open'` (slow device, GC pause, paused devtools
      // breakpoint). Short-circuit when readyState is already 'open' so the
      // handoff doesn't strand the session on the spinner.
      if (channel.readyState === 'open') {
        onOpen()
      } else {
        channel.onopen = onOpen
      }
      // A close splits into two terminal states depending on whether we'd ever
      // reached `'connected'`:
      //   - prev === 'connected'  → 'closed' (post-connect drop; chat was live)
      //   - any other non-terminal → 'failed' (pre-connect, ICE/setup gave up)
      // Terminal states ('idle' after teardown, plus 'failed'/'closed' already)
      // are preserved so a deliberate reset() isn't clobbered into a spurious
      // error screen and a redundant close event doesn't downgrade 'closed' to
      // 'failed'. See BUG-002 (pre-connect escalation) and BUG-005 (separate
      // closed state so the UI can render a "Connection lost" view instead of
      // the stale invite/reply setup screen).
      channel.onclose = () =>
        transition((prev) => {
          if (prev === 'idle' || prev === 'failed' || prev === 'closed') return prev
          // FEAT-008: a deliberate polite-defer teardown happens while we're in
          // `awaiting-answer`; the new answerer wiring has already moved the
          // hook forward, so the late-arriving onclose for the abandoned
          // offerer channel must not regress to `'failed'`.
          if (deliberateTeardownRef.current) return prev
          return prev === 'connected' ? 'closed' : 'failed'
        })
      channel.onmessage = (event) => {
        if (typeof event.data !== 'string') {
          // FEAT-010: the wire is JSON-only post-envelope. A binary payload is
          // either a future feature (file chunks) or junk — drop quietly so
          // the session isn't corrupted by a confused peer.
          console.warn('[wire] dropping non-string payload (binary not supported in v1)')
          return
        }
        const env = decode(event.data)
        if (env === null) return // wire-layer warning already emitted
        handleEnvelope(env)
      }
    },
    [transition, initiateSync, handleEnvelope],
  )

  const wirePc = useCallback(
    (pc: RTCPeerConnection) => {
      pc.onconnectionstatechange = () => {
        // `failed` is terminal; ICE has given up. Surface it to the UI so the
        // user knows they need a fresh invite exchange (per spike §7.5).
        if (pc.connectionState === 'failed') transition('failed')
      }
    },
    [transition],
  )

  // State-machine guards (CR-006): the controller owns its state machine and
  // refuses operations that aren't valid for the current state. Without these,
  // a second start-call before the first resolves overwrites `pcRef.current`
  // and leaks the previous RTCPeerConnection (its STUN bindings and candidate
  // gathering keep running until GC), and a re-fired `submitAnswer` while
  // already 'connected' calls `setRemoteDescription` on a stable signaling
  // state — the browser rejects with InvalidStateError and the catch branch
  // kills the live chat. The view-side guards in Offerer/Joiner stay (they
  // drive UI affordances), but they're no longer the only line of defense.

  const startAsOfferer = useCallback(async () => {
    if (state !== 'idle') return
    setError(null)
    transition('gathering')
    try {
      roleRef.current = 'offerer'
      const session = await createOffer()
      pcRef.current = session.pc
      if (session.channel) wireChannel(session.channel)
      wirePc(session.pc)
      setEncodedLocal(session.encodedLocal)
      transition('awaiting-answer')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      transition('failed')
    }
  }, [state, transition, wireChannel, wirePc])

  const startAsAnswerer = useCallback(
    async (offerCode: string) => {
      if (state !== 'idle') return
      setError(null)
      transition('gathering')
      try {
        roleRef.current = 'answerer'
        const session = await acceptOffer(offerCode, wireChannel)
        pcRef.current = session.pc
        wirePc(session.pc)
        setEncodedLocal(session.encodedLocal)
        // We don't transition to 'connected' here — the channel's `onopen`
        // does that once Alice has set our answer as her remote description.
        transition('connecting')
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
        transition('failed')
      }
    },
    [state, transition, wireChannel, wirePc],
  )

  const submitAnswer = useCallback(
    async (answerCode: string) => {
      // The cold-start case (no pcRef yet) keeps its existing user-facing
      // error so the dedicated test for it stays green. Other invalid states
      // ('connected', 'connecting', 'gathering', terminal) silently no-op —
      // these are programmer errors, not user errors.
      if (!pcRef.current) {
        setError('No active connection — start a chat first.')
        return
      }
      if (state !== 'awaiting-answer') return
      setError(null)
      transition('connecting')
      try {
        await acceptAnswer(pcRef.current, answerCode)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
        transition('failed')
      }
    },
    [state, transition],
  )

  // FEAT-008: polite-peer recovery for the "we both clicked Start" mistake.
  // The user pasted another offer into the reply box. Abandon our own
  // pending offer and answer the pasted offer so the other peer's
  // unchanged Offerer flow can finish the handshake. Only valid while
  // we're holding an unanswered offer (`awaiting-answer`); other states
  // no-op so a stray call from a stale event handler can't tear down a
  // live chat or restart an in-flight gather.
  const politelyAcceptOffer = useCallback(
    async (offerCode: string) => {
      if (state !== 'awaiting-answer') return
      // Mark the teardown as deliberate BEFORE closing the channel so the
      // async `onclose` fired by `channel.close()` short-circuits in the
      // state setter and doesn't surface a spurious `'failed'` screen.
      deliberateTeardownRef.current = true
      teardown()
      setError(null)
      setEncodedLocal(null)
      transition('gathering')
      try {
        roleRef.current = 'answerer'
        const session = await acceptOffer(offerCode, wireChannel)
        pcRef.current = session.pc
        wirePc(session.pc)
        setEncodedLocal(session.encodedLocal)
        // Mirror startAsAnswerer's terminal-state semantics: we don't enter
        // 'connected' here — the channel's `onopen` does that once the
        // other peer sets our answer as their remote description.
        transition('connecting')
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
        transition('failed')
      } finally {
        // Clear the flag whether we succeeded or failed; any further
        // channel-close events refer to the new answerer-side channel and
        // should be classified normally.
        deliberateTeardownRef.current = false
      }
    },
    [state, transition, teardown, wireChannel, wirePc],
  )

  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim()
      if (!trimmed) return
      const channel = channelRef.current
      if (!channel || channel.readyState !== 'open') return
      const id = nextId()
      const sentAt = Date.now()
      const env: WireEnvelope = { v: 1, t: 'chat', id, sentAt, text: trimmed }
      channel.send(encode(env))
      setMessages((prev) => [...prev, { id, from: 'me', text: trimmed, at: sentAt, delivery: 'pending' }])
      pushSample({ kind: 'sent', at: sentAt, messageId: id, sentAt })
      commitTelemetry()
    },
    [pushSample, commitTelemetry],
  )

  const reset = useCallback(() => {
    teardown()
    setEncodedLocal(null)
    setMessages([])
    setError(null)
    samplesRef.current = []
    syncRef.current = null
    connectedAtRef.current = null
    roleRef.current = null
    setTelemetry(emptyTelemetry())
    transition('idle')
  }, [teardown, transition])

  return {
    state,
    error,
    encodedLocal,
    messages,
    telemetry,
    startAsOfferer,
    startAsAnswerer,
    submitAnswer,
    politelyAcceptOffer,
    send,
    reset,
  }
}
