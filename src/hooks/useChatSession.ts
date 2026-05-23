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

let messageCounter = 0
function nextId(): string {
  messageCounter += 1
  return `${Date.now()}-${messageCounter}`
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
    channel.onopen = () => setState('connected')
    channel.onclose = () => setState((prev) => (prev === 'connected' ? 'failed' : prev))
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

  const startAsOfferer = useCallback(async () => {
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
  }, [wireChannel, wirePc])

  const startAsAnswerer = useCallback(
    async (offerCode: string) => {
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
    [wireChannel, wirePc],
  )

  const submitAnswer = useCallback(async (answerCode: string) => {
    if (!pcRef.current) {
      setError('No active connection — start a chat first.')
      return
    }
    setError(null)
    setState('connecting')
    try {
      await acceptAnswer(pcRef.current, answerCode)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setState('failed')
    }
  }, [])

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
