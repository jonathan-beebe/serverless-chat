import { useCallback, useEffect, useRef, useState } from 'react'
import { acceptAnswer, acceptOffer, ChatMessage, ConnectionState, createOffer } from '../core/rtc'

// The hook is the imperative shell: it owns the live RTCPeerConnection,
// the data channel, and the chat transcript. UI components subscribe to
// state via the returned object and never touch the connection directly.

export interface ChatSession {
  state: ConnectionState
  error: string | null
  /** Encoded offer URL payload, populated once we've gathered ICE as the offerer. */
  encodedLocal: string | null
  messages: ChatMessage[]
  startAsOfferer: () => Promise<void>
  startAsAnswerer: (offerCode: string) => Promise<void>
  submitAnswer: (answerCode: string) => Promise<void>
  send: (text: string) => void
  reset: () => void
}

// IDs are used purely as React `key` props on rendered messages, so we just
// need uniqueness within a session. `crypto.randomUUID` is available in all
// evergreen browsers (secure contexts) and Node ≥ 19, and avoids module-level
// state that would otherwise leak across sessions and tests.
function nextId(): string {
  return crypto.randomUUID()
}

export function useChatSession(): ChatSession {
  const [state, setState] = useState<ConnectionState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [encodedLocal, setEncodedLocal] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])

  const pcRef = useRef<RTCPeerConnection | null>(null)
  const channelRef = useRef<RTCDataChannel | null>(null)

  const teardown = useCallback(() => {
    channelRef.current?.close()
    pcRef.current?.close()
    channelRef.current = null
    pcRef.current = null
  }, [])

  // Tear down the active connection if the component unmounts mid-session
  // (e.g. user navigates away). Without this we leak a PeerConnection.
  useEffect(() => () => teardown(), [teardown])

  const wireChannel = useCallback((channel: RTCDataChannel) => {
    channelRef.current = channel
    // For the offerer the channel is freshly created and guaranteed to be in
    // `'connecting'`, but the answerer receives it via `pc.ondatachannel`,
    // which the browser may dispatch *after* the transport has already
    // transitioned to `'open'` (slow device, GC pause, paused devtools
    // breakpoint). Short-circuit when readyState is already 'open' so the
    // handoff doesn't strand the session on the spinner.
    if (channel.readyState === 'open') {
      setState('connected')
    } else {
      channel.onopen = () => setState('connected')
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
      setState((prev) => {
        if (prev === 'idle' || prev === 'failed' || prev === 'closed') return prev
        return prev === 'connected' ? 'closed' : 'failed'
      })
    channel.onmessage = (event) => {
      const text = typeof event.data === 'string' ? event.data : '[binary message]'
      setMessages((prev) => [...prev, { id: nextId(), from: 'them', text, at: Date.now() }])
    }
  }, [])

  const wirePc = useCallback((pc: RTCPeerConnection) => {
    pc.onconnectionstatechange = () => {
      // `failed` is terminal; ICE has given up. Surface it to the UI so the
      // user knows they need a fresh invite exchange (per spike §7.5).
      if (pc.connectionState === 'failed') setState('failed')
    }
  }, [])

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
    setState('gathering')
    try {
      const session = await createOffer()
      pcRef.current = session.pc
      if (session.channel) wireChannel(session.channel)
      wirePc(session.pc)
      setEncodedLocal(session.encodedLocal)
      setState('awaiting-answer')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setState('failed')
    }
  }, [state, wireChannel, wirePc])

  const startAsAnswerer = useCallback(
    async (offerCode: string) => {
      if (state !== 'idle') return
      setError(null)
      setState('gathering')
      try {
        const session = await acceptOffer(offerCode, wireChannel)
        pcRef.current = session.pc
        wirePc(session.pc)
        setEncodedLocal(session.encodedLocal)
        // We don't transition to 'connected' here — the channel's `onopen`
        // does that once Alice has set our answer as her remote description.
        setState('connecting')
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
        setState('failed')
      }
    },
    [state, wireChannel, wirePc],
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
      setState('connecting')
      try {
        await acceptAnswer(pcRef.current, answerCode)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
        setState('failed')
      }
    },
    [state],
  )

  const send = useCallback((text: string) => {
    const trimmed = text.trim()
    if (!trimmed) return
    const channel = channelRef.current
    if (!channel || channel.readyState !== 'open') return
    channel.send(trimmed)
    setMessages((prev) => [...prev, { id: nextId(), from: 'me', text: trimmed, at: Date.now() }])
  }, [])

  const reset = useCallback(() => {
    teardown()
    setEncodedLocal(null)
    setMessages([])
    setError(null)
    setState('idle')
  }, [teardown])

  return { state, error, encodedLocal, messages, startAsOfferer, startAsAnswerer, submitAnswer, send, reset }
}
