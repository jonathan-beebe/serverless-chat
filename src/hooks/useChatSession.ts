import { useCallback, useEffect, useRef, useState } from 'react'
import { acceptAnswer, acceptOffer, ChatMessage, ConnectionState, createOffer } from '../core/rtc'
import { decode, deriveSync, encode, type HistoryMessage, type WireEnvelope } from '../core/wire'
import * as storage from '../core/storage'

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
  /** FEAT-012: the conversation this session is bound to. Set by
   *  bindConversation/startAsOfferer/startAsAnswerer before any persistence
   *  happens. Null when no conversation is in scope (fresh hook, post-reset). */
  conversationId: string | null
  /**
   * FEAT-012: true once both sides of the resume handshake have had a chance
   *  to run — either the receiver got a `history` envelope, or the safety
   *  timeout fired. The Chat component reads this to decide whether to draw
   *  the "Resumed here" divider between persisted history and the live
   *  session's first message.
   */
  hasResumed: boolean
  /**
   * FEAT-012: load any locally-stored transcript for this conversation into
   *  `messages` before the data channel opens. Idempotent; safe to call from
   *  multiple effects.
   */
  bindConversation: (conversationId: string) => Promise<void>
  startAsOfferer: (conversationId: string) => Promise<void>
  startAsAnswerer: (offerCode: string, conversationId: string) => Promise<void>
  submitAnswer: (answerCode: string) => Promise<void>
  /**
   * Polite-peer recovery (FEAT-008): the user pasted another *offer* into
   * the reply box instead of an answer. Tear down our own pending offer and
   * become the answerer of the pasted offer so the other peer's existing
   * flow can finish the handshake. Only valid while `state === 'awaiting-answer'`.
   *
   * When `conversationId` is supplied, the hook rebinds to that conversation
   * before kicking off the answerer flow — used by the Joiner path (FEAT-008)
   * where Bob's offerer session was bound to his own conv id and the polite-
   * defer should follow Alice's invite into her conversation so the FEAT-012
   * history exchange sees a matching id on both ends. Omit on the Offerer-side
   * polite-defer where the existing binding is the right one to keep.
   */
  politelyAcceptOffer: (offerCode: string, conversationId?: string) => Promise<void>
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

/**
 * BUG-006: resolve a stored record's display attribution. Prefers the
 * absolute `senderId` against the local `selfPeerId`; falls back to the
 * legacy perspective-relative `from` when either is missing (records
 * written before the senderId rollout, or chat envelopes received from a
 * pre-fix peer). The two paths converge on the same `'me' | 'them'`
 * answer for in-session display, but only the senderId path is safe
 * across history-merge rounds.
 */
function resolveFrom(
  senderId: string | undefined,
  legacyFrom: 'me' | 'them',
  selfPeerId: string | null,
): 'me' | 'them' {
  if (senderId && selfPeerId) return senderId === selfPeerId ? 'me' : 'them'
  return legacyFrom
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
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [hasResumed, setHasResumed] = useState(false)
  // BUG-007: monotonic counter that `transition()` bumps from inside its
  // `setState` updater to *request* a telemetry commit without calling
  // `setTelemetry` from within another setter's updater. A `useEffect` below
  // reads this version and runs `commitTelemetry()` in the React commit
  // phase, which is naturally inside `act()` in tests and still batches with
  // surrounding renders in production. Replaces the previous
  // `queueMicrotask(commitTelemetry)` scheduling that escaped synchronous
  // `act(...)` blocks and surfaced as nine "not wrapped in act" warnings.
  const [telemetryCommitVersion, setTelemetryCommitVersion] = useState(0)

  const pcRef = useRef<RTCPeerConnection | null>(null)
  const channelRef = useRef<RTCDataChannel | null>(null)
  // FEAT-012: keeps the *current* conversation id reachable from non-React
  // callbacks (wireChannel.onmessage etc.) without re-binding the callback
  // identity on every state change.
  const conversationIdRef = useRef<string | null>(null)
  // BUG-006: per-conversation absolute identity for this device. Stamped
  // on every outgoing chat envelope as `sender` and on every stored
  // record's `senderId`, so the receiver stores the *same* senderId we do.
  // Display layer derives `from = m.senderId === selfPeerId ? 'me' : 'them'`,
  // making the history merge a pure dedupe-and-insert with no perspective
  // flip (the previous source of the BUG-006 "everyone shows as You"
  // corruption). Loaded from the conversation row at bind time; minted
  // fresh and persisted if the row has no `selfPeerId` yet.
  const selfPeerIdRef = useRef<string | null>(null)
  // FEAT-012: tracks the in-flight bindConversation read so a history payload
  // arriving before the local seed completes waits for the seed before
  // merging. Otherwise the merge can race against setMessages(loaded).
  const bindPromiseRef = useRef<Promise<void> | null>(null)
  // FEAT-012: ids the hook has already persisted via appendMessage. Lets a
  // late-arriving history envelope dedupe against locally-known ids even when
  // the React `messages` state hasn't flushed yet (e.g. inside a microtask
  // batch). Cleared on reset.
  const knownIdsRef = useRef<Set<string>>(new Set())
  // FEAT-012: latches "we've drawn the divider" so `setMessages` updates
  // from incoming chat don't keep re-firing the divider effect.
  const hasResumedRef = useRef(false)
  // FEAT-012: caches the snapshot we ship in our `history` envelope. The
  // snapshot is taken at the moment the channel opens so live messages that
  // arrive during the exchange window aren't double-sent (they're already
  // live envelopes; cf. AC#13).
  const historySnapshotRef = useRef<HistoryMessage[]>([])
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
        // BUG-007: bump a version counter to request a telemetry commit. The
        // companion `useEffect` below runs `commitTelemetry()` in the commit
        // phase — naturally wrapped by React's `act()` in tests and still
        // batched with the surrounding render in production. Calling
        // `setTelemetry` directly from inside this updater would be a setter
        // inside a setter, which is the bad pattern the previous
        // `queueMicrotask(commitTelemetry)` scheduling was working around.
        setTelemetryCommitVersion((v) => v + 1)
        return resolved
      })
    },
    [pushSample],
  )

  // BUG-007: commit telemetry during the React commit phase whenever
  // `transition()` has requested one. The dependency on
  // `telemetryCommitVersion` re-runs this on every bump; `commitTelemetry`
  // itself is stable (empty dep list). Skip the initial mount run — the
  // `useState(emptyTelemetry)` initializer already gives us the right
  // snapshot, and committing again would create a spurious second render
  // with an equivalent-but-not-identical object.
  useEffect(() => {
    if (telemetryCommitVersion === 0) return
    commitTelemetry()
  }, [telemetryCommitVersion, commitTelemetry])

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
          // FEAT-012: best-effort persistence. Failure logs and keeps the
          // UI moving so a quota-full or transient IDB error doesn't strand
          // the chat. BUG-006: also persist the peer's absolute identity
          // (`senderId = env.sender`) so resumes resolve attribution
          // without flipping perspective. A pre-fix peer omits `sender`;
          // we still write the legacy `from: 'them'` so display stays
          // correct in-session.
          const convId = conversationIdRef.current
          if (convId) {
            knownIdsRef.current.add(env.id)
            storage
              .appendMessage(convId, {
                id: env.id,
                from: 'them',
                senderId: env.sender,
                text: env.text,
                at: receivedAt,
              })
              .catch((err) => console.warn('[storage] appendMessage (recv) failed', err))
          }
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
        case 'history': {
          // FEAT-012: full-history merge. We wait on the in-flight
          // bindConversation read so the merge runs against the seeded local
          // set, not an empty list. Then:
          //   1. Verify conv ID matches the session's (drop on mismatch).
          //   2. Skip ids already locally known (the dedupe rule).
          //   3. Insert remainder into messages + storage in time order.
          //   4. Latch hasResumed so Chat draws the "Resumed here" divider.
          //
          // BUG-006: the merge no longer flips perspective when the
          // record carries `sender` (absolute identity from the original
          // sender's `selfPeerId`). Both peers store the same senderId for
          // the same message, so insertion is verbatim. The legacy
          // perspective flip is retained as a fallback for records shipped
          // by pre-fix peers (no `sender` field) — but those records still
          // came through the chat envelope earlier and so are usually
          // already in `knownIdsRef`, skipping the merge entirely.
          const expected = conversationIdRef.current
          if (!expected) {
            console.warn('[storage] history payload received but no conversationId is bound; dropping')
            return
          }
          if (env.conversationId !== expected) {
            console.warn('[storage] history conversationId mismatch; dropping payload')
            return
          }
          const apply = async () => {
            // Wait for any in-flight local bind so we don't dedupe against
            // a still-loading set.
            if (bindPromiseRef.current) {
              try {
                await bindPromiseRef.current
              } catch {
                // bindConversation already logged; carry on with whatever
                // local state we ended up with.
              }
            }
            const known = knownIdsRef.current
            const selfPeerId = selfPeerIdRef.current
            interface MergeRecord {
              id: string
              senderId: string | undefined
              from: 'me' | 'them'
              text: string
              at: number
            }
            const toMerge: MergeRecord[] = []
            for (const m of env.messages) {
              if (known.has(m.id)) continue
              // BUG-006: when `m.sender` is present we DON'T flip — the
              // senderId is absolute and we trust it verbatim. Display
              // attribution is then `m.sender === selfPeerId ? 'me' :
              // 'them'`. Legacy histories (no `sender`) fall back to the
              // previous perspective flip so cross-version peers still
              // produce sensible bubbles in-session.
              let resolvedFrom: 'me' | 'them'
              if (m.sender) {
                resolvedFrom = selfPeerId && m.sender === selfPeerId ? 'me' : 'them'
              } else {
                resolvedFrom = m.from === 'me' ? 'them' : 'me'
              }
              toMerge.push({ id: m.id, senderId: m.sender, from: resolvedFrom, text: m.text, at: m.at })
              known.add(m.id)
            }
            if (toMerge.length > 0) {
              // Merge into state in time order: union with current `messages`,
              // sort by `at` ascending so resumed entries land above any
              // live entries received during the exchange window.
              setMessages((prev) => {
                const next = [...prev, ...toMerge.map((m) => ({ id: m.id, from: m.from, text: m.text, at: m.at }))]
                next.sort((a, b) => a.at - b.at)
                return next
              })
              try {
                await storage.bulkInsertMessages(
                  expected,
                  toMerge.map((m) => ({
                    id: m.id,
                    from: m.from,
                    senderId: m.senderId,
                    text: m.text,
                    at: m.at,
                  })),
                )
              } catch (err) {
                console.warn('[storage] bulkInsertMessages failed', err)
              }
            }
            // Latch the divider — Chat reads `hasResumed`. We do this on
            // every received history, even an empty one, because the
            // *exchange* having happened is what justifies the divider:
            // when both sides have anything to compare, the live messages
            // below are conceptually a new session.
            if (!hasResumedRef.current) {
              hasResumedRef.current = true
              setHasResumed(true)
            }
          }
          void apply()
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
        // FEAT-012: send our full local transcript so the peer can merge any
        // gaps. Empty arrays are sent too so "we have nothing" is
        // distinguishable from "we're still loading" on the receiver side.
        // The snapshot was taken once during bindConversation/start; we
        // don't recompute on every render.
        const convId = conversationIdRef.current
        if (convId) {
          const history: WireEnvelope = {
            v: 1,
            t: 'history',
            id: nextId(),
            sentAt: Date.now(),
            conversationId: convId,
            messages: historySnapshotRef.current,
          }
          try {
            channel.send(encode(history))
          } catch (err) {
            // RTCDataChannel.send can throw on oversized payloads on some
            // implementations (maxMessageSize ~64KB). v1 logs and drops;
            // chunking is a follow-up per the ticket's "Out of scope" §5.
            console.warn('[storage] failed to send history envelope', err)
          }
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

  // FEAT-012: load any locally-stored transcript for `id` into both the
  // React state and the in-memory dedupe set. Resolves once the load is
  // committed so handleEnvelope can await it before merging. Also captures
  // the snapshot we'll ship in our `history` envelope at channel-open time
  // (so live messages during the exchange window aren't double-sent).
  //
  // BUG-006: callers (startAsOfferer / startAsAnswerer / politelyAcceptOffer)
  // fire this without awaiting so connection setup isn't blocked behind an
  // IDB round-trip. That leaves a window where a live `send()` or `chat`
  // envelope can land in `messages`/`knownIdsRef` *before* the seed commits.
  // The seed must therefore MERGE (union, sorted by `at`) rather than
  // REPLACE — otherwise the live entries get wiped from React state when the
  // setter finally runs, and their ids get dropped from the dedupe set when
  // `knownIdsRef.current` is reassigned. Mid-session re-binds (FEAT-008
  // polite-defer with a swap to the inviter's conv id) also rely on the
  // merge so we don't wipe live state when the previously-bound conv is
  // abandoned. Same conv id re-bind is idempotent; different conv id flips
  // `conversationIdRef.current` first, so subsequent live writes go to the
  // new conv and the merge here only adds the new conv's persisted history.
  const bindConversation = useCallback(async (id: string) => {
    setConversationId(id)
    conversationIdRef.current = id
    const load = (async () => {
      try {
        // Upsert a stub if missing so the conversation appears on Home even
        // if the user closes the tab before sending anything. BUG-006:
        // mint a `selfPeerId` on first bind and persist it on the conv
        // row, so this device's identity for this conversation is stable
        // across resumes and visible to the display layer (Home reads it
        // to translate stored `senderId`s into "You" vs "Them" labels).
        const existing = await storage.getConversation(id)
        const now = Date.now()
        if (!existing) {
          const selfPeerId = nextId()
          selfPeerIdRef.current = selfPeerId
          await storage.upsertConversation({ id, createdAt: now, lastActivityAt: now, selfPeerId })
        } else if (!existing.selfPeerId) {
          // Legacy conversation written before BUG-006 — adopt a fresh
          // selfPeerId so any new writes carry an absolute identity. Old
          // records keep their legacy `from` field and resolve through the
          // fallback path; new records get the new path.
          const selfPeerId = nextId()
          selfPeerIdRef.current = selfPeerId
          await storage.upsertConversation({ ...existing, selfPeerId })
        } else {
          selfPeerIdRef.current = existing.selfPeerId
        }
        const records = await storage.listMessages(id)
        // Snapshot for the outgoing `history` envelope reflects the persisted
        // store at bind time — live entries that arrived mid-bind are already
        // on the wire via the live `chat` path and would be double-sent if
        // we included them here. BUG-006: ship `sender` (the absolute
        // identity) alongside the legacy `from`. Records that pre-date the
        // fix have no `senderId`; they ship with `sender` undefined and the
        // peer's merge path falls back to the legacy `from`-and-flip route.
        historySnapshotRef.current = records.map((r) => ({
          id: r.id,
          from: r.from,
          sender: r.senderId,
          text: r.text,
          at: r.at,
        }))
        // Union the persisted records into knownIdsRef rather than replace.
        // A live send/chat-receive that landed during the bind already added
        // its id to the current set; we must not drop it.
        for (const r of records) knownIdsRef.current.add(r.id)
        // Merge persisted records into `messages` state. Skip any record
        // whose id has already been added to state by a live event during
        // the bind window; the rest land in time order. We sort the union
        // by `at` ascending so a persisted record that pre-dates a live
        // arrival shows above it, matching what the history-merge path does.
        setMessages((prev) => {
          const liveIds = new Set(prev.map((m) => m.id))
          const additions = records
            .filter((r) => !liveIds.has(r.id))
            .map<ChatMessage>((r) => ({
              id: r.id,
              from: resolveFrom(r.senderId, r.from, selfPeerIdRef.current),
              text: r.text,
              at: r.at,
            }))
          if (additions.length === 0) return prev
          const next = [...prev, ...additions]
          next.sort((a, b) => a.at - b.at)
          return next
        })
      } catch (err) {
        console.warn('[storage] bindConversation failed', err)
      }
    })()
    bindPromiseRef.current = load
    await load
  }, [])

  const startAsOfferer = useCallback(
    async (id: string) => {
      if (state !== 'idle') return
      setError(null)
      // FEAT-012: seed the local transcript and snapshot the history payload
      // before we kick off offer generation, so the user sees their prior
      // chat the instant they land on the Offerer screen. We don't `await`
      // the load — `bindConversation` stashes a promise on `bindPromiseRef`
      // that handleEnvelope awaits before merging. Awaiting here would block
      // offer generation behind an IDB read for no benefit (and would break
      // tests that run fake timers, because fake-indexeddb schedules via
      // setImmediate).
      void bindConversation(id)
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
    },
    [state, transition, wireChannel, wirePc, bindConversation],
  )

  const startAsAnswerer = useCallback(
    async (offerCode: string, id: string) => {
      if (state !== 'idle') return
      setError(null)
      // Fire-and-forget the local seed; see startAsOfferer for why we don't
      // await it.
      void bindConversation(id)
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
    [state, transition, wireChannel, wirePc, bindConversation],
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
    async (offerCode: string, nextConversationId?: string) => {
      if (state !== 'awaiting-answer') return
      // Mark the teardown as deliberate BEFORE closing the channel so the
      // async `onclose` fired by `channel.close()` short-circuits in the
      // state setter and doesn't surface a spurious `'failed'` screen.
      deliberateTeardownRef.current = true
      teardown()
      setError(null)
      setEncodedLocal(null)
      // FEAT-008: the Joiner path passes the offer's conversation id so the
      // session follows the inviter's conversation across the swap. Without
      // this, Bob's session stays bound to his old offerer conv id and
      // Alice's FEAT-012 history envelope is rejected with a mismatch warn.
      // Offerer-side polite-defer omits the arg and keeps its existing binding.
      if (nextConversationId && nextConversationId !== conversationIdRef.current) {
        void bindConversation(nextConversationId)
      }
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
    [state, transition, teardown, wireChannel, wirePc, bindConversation],
  )

  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim()
      if (!trimmed) return
      const channel = channelRef.current
      if (!channel || channel.readyState !== 'open') return
      const id = nextId()
      const sentAt = Date.now()
      // BUG-006: stamp our absolute identity onto the envelope so the peer
      // stores `senderId = selfPeerId` against this message id. History
      // merge on either side then doesn't need a perspective flip.
      const sender = selfPeerIdRef.current ?? undefined
      const env: WireEnvelope = { v: 1, t: 'chat', id, sentAt, text: trimmed, sender }
      channel.send(encode(env))
      setMessages((prev) => [...prev, { id, from: 'me', text: trimmed, at: sentAt, delivery: 'pending' }])
      // FEAT-012: persist as soon as the bubble shows up; failure is logged
      // but doesn't block the UI (AC#15).
      const convId = conversationIdRef.current
      if (convId) {
        knownIdsRef.current.add(id)
        storage
          .appendMessage(convId, { id, from: 'me', senderId: sender, text: trimmed, at: sentAt })
          .catch((err) => console.warn('[storage] appendMessage (send) failed', err))
      }
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
    // FEAT-012: clear the in-memory conversation binding. Crucially this does
    // NOT call storage.deleteConversation — the user's history survives a
    // reset (AC#17). Delete is its own explicit action from the Home list.
    setConversationId(null)
    conversationIdRef.current = null
    selfPeerIdRef.current = null
    knownIdsRef.current = new Set()
    historySnapshotRef.current = []
    bindPromiseRef.current = null
    hasResumedRef.current = false
    setHasResumed(false)
    setTelemetry(emptyTelemetry())
    transition('idle')
  }, [teardown, transition])

  return {
    state,
    error,
    encodedLocal,
    messages,
    telemetry,
    conversationId,
    hasResumed,
    bindConversation,
    startAsOfferer,
    startAsAnswerer,
    submitAnswer,
    politelyAcceptOffer,
    send,
    reset,
  }
}
