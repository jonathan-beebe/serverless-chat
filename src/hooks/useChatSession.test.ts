import { act, renderHook } from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { useChatSession } from './useChatSession'
import { __resetForTests as resetStorage } from '../core/storage'

// Minimal stubs for the slice of WebRTC the hook touches. We don't exercise
// real ICE here — these tests pin down the controller's state machine,
// message flow, and teardown contract using a fake PeerConnection + data
// channel.
//
// `createOffer` (in core/rtc) calls: new RTCPeerConnection, createDataChannel,
// createOffer, setLocalDescription, addEventListener('icegatheringstatechange'),
// then reads pc.localDescription. We synthesize a `complete` ICE state up-front
// so waitForIceComplete resolves immediately.

class FakeDataChannel {
  readyState: 'connecting' | 'open' | 'closing' | 'closed' = 'connecting'
  onopen: (() => void) | null = null
  onclose: (() => void) | null = null
  onmessage: ((event: { data: unknown }) => void) | null = null
  sent: string[] = []
  closeCalls = 0
  send(data: string) {
    this.sent.push(data)
  }
  close() {
    this.closeCalls += 1
    const wasOpen = this.readyState === 'open'
    this.readyState = 'closed'
    if (wasOpen) this.onclose?.()
  }
  /** Test helper: simulate the underlying transport opening. */
  open() {
    this.readyState = 'open'
    this.onopen?.()
  }
}

// Capture the most recent pc + channel so tests can drive transport events
// (open, message, connectionstatechange, close) after the hook constructs
// the peer connection inside `createOffer`.
let lastChannel: FakeDataChannel | null = null
let lastPc: FakePeerConnection | null = null
// Counts every `new RTCPeerConnection()` so the state-machine-guard tests can
// assert "the second call didn't allocate another PC" (a PC leak symptom).
// Wrapped in an object so the binding can stay `const` while the count mutates.
const pcStats = { constructorCount: 0 }

// Toggle to make `createOffer` (via setLocalDescription) reject, exercising
// the hook's offerer-failure branch.
let failNextSetLocalDescription = false

class FakePeerConnection {
  iceGatheringState: RTCIceGatheringState = 'complete'
  localDescription = { type: 'offer' as const, sdp: 'v=0\r\n' }
  connectionState: RTCPeerConnectionState = 'new'
  onconnectionstatechange: (() => void) | null = null
  ondatachannel: ((event: { channel: FakeDataChannel }) => void) | null = null
  setRemoteDescriptionCalls: RTCSessionDescriptionInit[] = []
  closeCalls = 0
  createDataChannel() {
    lastChannel = new FakeDataChannel()
    return lastChannel
  }
  createOffer() {
    return Promise.resolve({ type: 'offer' as const, sdp: 'v=0\r\n' })
  }
  createAnswer() {
    return Promise.resolve({ type: 'answer' as const, sdp: 'v=0\r\n' })
  }
  setLocalDescription() {
    if (failNextSetLocalDescription) {
      failNextSetLocalDescription = false
      return Promise.reject(new Error('boom'))
    }
    return Promise.resolve()
  }
  setRemoteDescription(desc: RTCSessionDescriptionInit) {
    this.setRemoteDescriptionCalls.push(desc)
    return Promise.resolve()
  }
  addEventListener() {}
  removeEventListener() {}
  close() {
    this.closeCalls += 1
  }
  /** Test helper: simulate the underlying ICE transport entering `failed`. */
  failConnection() {
    this.connectionState = 'failed'
    this.onconnectionstatechange?.()
  }
  /** Test helper: simulate the browser dispatching `ondatachannel` to the answerer. */
  emitDataChannel(channel: FakeDataChannel) {
    lastChannel = channel
    this.ondatachannel?.({ channel })
  }
}

beforeAll(() => {
  // Wrap the constructor so each `new RTCPeerConnection()` exposes its
  // instance via `lastPc`. (Plain `lastPc = this` in the class constructor
  // trips the no-this-alias lint rule.)
  function Ctor() {
    const instance = new FakePeerConnection()
    lastPc = instance
    pcStats.constructorCount += 1
    return instance
  }
  Ctor.prototype = FakePeerConnection.prototype
  // @ts-expect-error stubbing minimal subset for jsdom
  globalThis.RTCPeerConnection = Ctor
})

beforeEach(() => {
  lastChannel = null
  lastPc = null
  pcStats.constructorCount = 0
  failNextSetLocalDescription = false
  // FEAT-012: each test gets a fresh in-memory IDB so persistence side
  // effects from one case don't leak into the next.
  ;(globalThis as { indexedDB: IDBFactory }).indexedDB = new IDBFactory()
  resetStorage()
})

describe('useChatSession message ids', () => {
  it('assigns a unique, non-empty string id to each sent message', async () => {
    const { result } = renderHook(() => useChatSession())
    await act(async () => {
      await result.current.startAsOfferer('test-conv')
    })
    act(() => lastChannel!.open())

    act(() => result.current.send('hello'))
    act(() => result.current.send('world'))

    expect(result.current.messages).toHaveLength(2)
    const [a, b] = result.current.messages
    expect(typeof a.id).toBe('string')
    expect(a.id.length).toBeGreaterThan(0)
    expect(typeof b.id).toBe('string')
    expect(b.id.length).toBeGreaterThan(0)
    expect(a.id).not.toBe(b.id)
  })

  it('does not reuse ids across separate hook instances', async () => {
    // This guards against module-level shared state: two independent sessions
    // must not collide on the very first id they produce.
    const ids: string[] = []

    for (let i = 0; i < 2; i += 1) {
      const { result } = renderHook(() => useChatSession())
      await act(async () => {
        await result.current.startAsOfferer(`test-conv-${i}`)
      })
      act(() => lastChannel!.open())
      act(() => result.current.send(`msg-${i}`))
      ids.push(result.current.messages[0].id)
    }

    expect(ids[0]).not.toBe(ids[1])
  })

  it('continues to issue unique ids after reset()', async () => {
    const { result } = renderHook(() => useChatSession())
    await act(async () => {
      await result.current.startAsOfferer('test-conv-a')
    })
    act(() => lastChannel!.open())
    act(() => result.current.send('before'))
    const before = result.current.messages[0].id

    act(() => result.current.reset())
    expect(result.current.messages).toHaveLength(0)

    await act(async () => {
      // Use a different conversation so the seeded transcript from the prior
      // run doesn't push the new "after" message off index 0.
      await result.current.startAsOfferer('test-conv-b')
    })
    act(() => lastChannel!.open())
    act(() => result.current.send('after'))
    const after = result.current.messages[0].id

    expect(after).not.toBe(before)
    expect(typeof after).toBe('string')
    expect(after.length).toBeGreaterThan(0)
  })
})

describe('useChatSession lifecycle', () => {
  it('starts in idle with no error, no encodedLocal, no messages', () => {
    const { result } = renderHook(() => useChatSession())
    expect(result.current.state).toBe('idle')
    expect(result.current.error).toBeNull()
    expect(result.current.encodedLocal).toBeNull()
    expect(result.current.messages).toEqual([])
  })

  it('startAsOfferer transitions to awaiting-answer and populates encodedLocal', async () => {
    const { result } = renderHook(() => useChatSession())
    await act(async () => {
      await result.current.startAsOfferer('test-conv')
    })
    expect(result.current.state).toBe('awaiting-answer')
    expect(result.current.encodedLocal).toBeTypeOf('string')
    expect(result.current.encodedLocal!.length).toBeGreaterThan(0)
    expect(result.current.error).toBeNull()
  })

  it('startAsOfferer surfaces a failure as state="failed" and sets error', async () => {
    failNextSetLocalDescription = true
    const { result } = renderHook(() => useChatSession())
    await act(async () => {
      await result.current.startAsOfferer('test-conv')
    })
    expect(result.current.state).toBe('failed')
    expect(result.current.error).toBe('boom')
    expect(result.current.encodedLocal).toBeNull()
  })

  it('channel onopen transitions state to "connected"', async () => {
    const { result } = renderHook(() => useChatSession())
    await act(async () => {
      await result.current.startAsOfferer('test-conv')
    })
    expect(result.current.state).toBe('awaiting-answer')

    act(() => lastChannel!.open())
    expect(result.current.state).toBe('connected')
  })

  it('pc.onconnectionstatechange with "failed" transitions state to "failed"', async () => {
    const { result } = renderHook(() => useChatSession())
    await act(async () => {
      await result.current.startAsOfferer('test-conv')
    })

    act(() => lastPc!.failConnection())
    expect(result.current.state).toBe('failed')
  })

  it('transitions to "connected" when ondatachannel fires with an already-open channel', async () => {
    // Repros BUG-003: on the answerer the channel arrives via `ondatachannel`,
    // which the browser may dispatch *after* the underlying transport has
    // already transitioned to 'open' (slow device, GC pause, paused breakpoint).
    // If wireChannel only attaches `onopen` without checking `readyState`, the
    // event has already fired and state stays stuck on 'connecting' forever.
    // Wiring should short-circuit to 'connected' when readyState is already 'open'.
    const { encode } = await import('../core/encoding')
    const offerCode = encode({ type: 'offer', sdp: 'v=0\r\n' })
    const { result } = renderHook(() => useChatSession())
    await act(async () => {
      await result.current.startAsAnswerer(offerCode, 'test-conv')
    })
    expect(result.current.state).toBe('connecting')

    // Browser delivers `ondatachannel` late — by the time the event runs, the
    // channel has already opened, so the late-attached `onopen` would never fire.
    const channel = new FakeDataChannel()
    channel.readyState = 'open'
    act(() => lastPc!.emitDataChannel(channel))

    expect(result.current.state).toBe('connected')
  })

  it('channel onclose before onopen transitions state to "failed"', async () => {
    // Repros BUG-002: if the data channel closes while we're still pre-open
    // (e.g. ICE gives up on a symmetric NAT, or the SCTP transport dies during
    // setup), state must escalate to "failed" so the UI can offer a recovery
    // path instead of stranding the user on the spinner.
    const { result } = renderHook(() => useChatSession())
    await act(async () => {
      await result.current.startAsOfferer('test-conv')
    })
    expect(result.current.state).toBe('awaiting-answer')

    act(() => lastChannel!.onclose?.())
    expect(result.current.state).toBe('failed')
  })

  it('channel onclose after onopen transitions state to "closed", not "failed"', async () => {
    // Repros BUG-005: a post-connect drop must be distinguishable from a setup
    // failure so the screens can render a "Connection lost" view instead of
    // falling back to the now-stale invite/reply UI. We keep "failed" reserved
    // for pre-connect failures (BUG-002) and add a separate terminal "closed"
    // state for "we were connected, then the channel went away".
    const { result } = renderHook(() => useChatSession())
    await act(async () => {
      await result.current.startAsOfferer('test-conv')
    })
    act(() => lastChannel!.open())
    expect(result.current.state).toBe('connected')

    act(() => lastChannel!.onclose?.())
    expect(result.current.state).toBe('closed')
  })
})

describe('useChatSession submitAnswer', () => {
  it('without an active connection sets error and stays in idle', async () => {
    const { result } = renderHook(() => useChatSession())
    await act(async () => {
      await result.current.submitAnswer('whatever')
    })
    expect(result.current.error).toBe('No active connection — start a chat first.')
    expect(result.current.state).toBe('idle')
  })

  it('with an active connection calls setRemoteDescription and transitions to "connecting"', async () => {
    const { result } = renderHook(() => useChatSession())
    await act(async () => {
      await result.current.startAsOfferer('test-conv')
    })
    // Encode a real session description so the decoder inside acceptAnswer
    // doesn't reject. We import lazily here to avoid a top-level dep.
    const { encode } = await import('../core/encoding')
    const answerCode = encode({ type: 'answer', sdp: 'v=0\r\n' })

    await act(async () => {
      await result.current.submitAnswer(answerCode)
    })

    expect(result.current.state).toBe('connecting')
    expect(lastPc!.setRemoteDescriptionCalls).toHaveLength(1)
    expect(lastPc!.setRemoteDescriptionCalls[0].type).toBe('answer')
    expect(result.current.error).toBeNull()
  })
})

describe('useChatSession messages', () => {
  // FEAT-010: payloads are now JSON envelopes. Tests build a chat envelope
  // string for the incoming-message path.
  function chatEnvelope(id: string, text: string, sentAt = 1_700_000_000_000): string {
    return JSON.stringify({ v: 1, t: 'chat', id, sentAt, text })
  }

  it('appends an incoming chat envelope as a "them" message', async () => {
    const { result } = renderHook(() => useChatSession())
    await act(async () => {
      await result.current.startAsOfferer('test-conv')
    })
    act(() => lastChannel!.open())

    act(() => lastChannel!.onmessage?.({ data: chatEnvelope('m-1', 'hi there') }))

    expect(result.current.messages).toHaveLength(1)
    const [msg] = result.current.messages
    expect(msg.from).toBe('them')
    expect(msg.text).toBe('hi there')
    expect(msg.id).toBe('m-1')
  })

  it('drops non-string payloads (FEAT-010 wire is JSON-only post-envelope)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { result } = renderHook(() => useChatSession())
    await act(async () => {
      await result.current.startAsOfferer('test-conv')
    })
    act(() => lastChannel!.open())

    act(() => lastChannel!.onmessage?.({ data: new ArrayBuffer(8) }))

    // No spurious "[binary message]" placeholder anymore — the receiver
    // silently drops binary payloads (with a console.warn) since v1 doesn't
    // negotiate them.
    expect(result.current.messages).toHaveLength(0)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('drops malformed JSON payloads without crashing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { result } = renderHook(() => useChatSession())
    await act(async () => {
      await result.current.startAsOfferer('test-conv')
    })
    act(() => lastChannel!.open())

    act(() => lastChannel!.onmessage?.({ data: 'not-json' }))
    act(() => lastChannel!.onmessage?.({ data: JSON.stringify({ v: 2, t: 'chat', id: 'x', sentAt: 1, text: 'hi' }) }))

    expect(result.current.messages).toHaveLength(0)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('send() drops empty / whitespace-only input as a no-op', async () => {
    const { result } = renderHook(() => useChatSession())
    await act(async () => {
      await result.current.startAsOfferer('test-conv')
    })
    act(() => lastChannel!.open())

    act(() => result.current.send(''))
    act(() => result.current.send('   '))

    expect(result.current.messages).toHaveLength(0)
    // Channel.sent may contain a sync-probe (offerer initiates one on open).
    // No chat envelopes should be present.
    const chats = lastChannel!.sent.filter((s) => {
      try {
        return JSON.parse(s).t === 'chat'
      } catch {
        return false
      }
    })
    expect(chats).toHaveLength(0)
  })

  it('send() is a no-op when the channel is not open', async () => {
    const { result } = renderHook(() => useChatSession())
    await act(async () => {
      await result.current.startAsOfferer('test-conv')
    })
    // Deliberately do NOT call lastChannel.open(); readyState stays 'connecting'.
    expect(lastChannel!.readyState).toBe('connecting')

    act(() => result.current.send('queued?'))

    expect(result.current.messages).toHaveLength(0)
    expect(lastChannel!.sent).toHaveLength(0)
  })

  it('send() with an open channel wraps the text in a chat envelope and appends from: "me"', async () => {
    const { result } = renderHook(() => useChatSession())
    await act(async () => {
      await result.current.startAsOfferer('test-conv')
    })
    act(() => lastChannel!.open())

    act(() => result.current.send('hello'))

    // Find the chat envelope in everything the channel sent (offerer's
    // sync-probe will also be there).
    const chats = lastChannel!.sent
      .map((s) => {
        try {
          return JSON.parse(s)
        } catch {
          return null
        }
      })
      .filter((p) => p && p.t === 'chat')
    expect(chats).toHaveLength(1)
    expect(chats[0]).toMatchObject({ v: 1, t: 'chat', text: 'hello' })
    expect(typeof chats[0].id).toBe('string')
    expect(typeof chats[0].sentAt).toBe('number')

    expect(result.current.messages).toHaveLength(1)
    expect(result.current.messages[0]).toMatchObject({ from: 'me', text: 'hello', delivery: 'pending' })
  })
})

describe('useChatSession FEAT-010 telemetry, sync, receipts', () => {
  function envelope(obj: Record<string, unknown>): string {
    return JSON.stringify({ v: 1, ...obj })
  }
  function findSent(channel: FakeDataChannel, t: string): Record<string, unknown> | null {
    for (const raw of channel.sent) {
      try {
        const parsed = JSON.parse(raw)
        if (parsed.t === t) return parsed
      } catch {
        // skip
      }
    }
    return null
  }

  it('exposes an empty telemetry object on a fresh hook', () => {
    const { result } = renderHook(() => useChatSession())
    expect(result.current.telemetry.connectedAt).toBeNull()
    expect(result.current.telemetry.sync).toBeNull()
    expect(result.current.telemetry.samples).toEqual([])
    expect(result.current.telemetry.summary).toMatchObject({ sampleCount: 0, currentRttMs: null })
  })

  it('offerer initiates a sync-probe envelope as soon as the channel opens', async () => {
    const { result } = renderHook(() => useChatSession())
    await act(async () => {
      await result.current.startAsOfferer('test-conv')
    })
    await act(async () => {
      lastChannel!.open()
      // initiateSync is scheduled via queueMicrotask so we flush the queue.
      await Promise.resolve()
    })

    const probe = findSent(lastChannel!, 'sync-probe')
    expect(probe).not.toBeNull()
    expect(probe!.id).toBeTypeOf('string')
    expect(probe!.sentAt).toBeTypeOf('number')
  })

  it('offerer completes the sync handshake on sync-ack and populates telemetry.sync', async () => {
    const { result } = renderHook(() => useChatSession())
    await act(async () => {
      await result.current.startAsOfferer('test-conv')
    })
    await act(async () => {
      lastChannel!.open()
      await Promise.resolve()
    })
    const probe = findSent(lastChannel!, 'sync-probe')!
    const probeId = probe.id as string
    const t1 = probe.sentAt as number

    // Peer's clock is 100 ms ahead of ours; round-trip is ~50 ms.
    // Probe seen at t2 = t1 + 50 + 100 (transit + clock skew).
    // Ack sent at t3 = t2 + 10 (turnaround).
    // Ack arrives at t4 = t3 - 100 + 50 = t1 + 10 (in our clock).
    const t2 = t1 + 150
    const t3 = t2 + 10
    await act(async () => {
      lastChannel!.onmessage?.({
        data: envelope({ t: 'sync-ack', id: 'ack-1', sentAt: t3, replyTo: probeId, probeReceivedAt: t2 }),
      })
      // commitTelemetry runs synchronously in handleEnvelope.
      await Promise.resolve()
    })

    expect(result.current.telemetry.sync).not.toBeNull()
    const sync = result.current.telemetry.sync!
    expect(sync.t1).toBe(t1)
    expect(sync.t2).toBe(t2)
    expect(sync.t3).toBe(t3)
    // t4 is whatever Date.now() returned when the ack was processed; not
    // pinned, but rtt and offset should be derived from it.
    expect(typeof sync.rtt).toBe('number')
    expect(typeof sync.offset).toBe('number')

    // And the offerer sent a sync-done so the answerer can derive too.
    const done = findSent(lastChannel!, 'sync-done')
    expect(done).not.toBeNull()
    expect(done!.t1).toBe(t1)
    expect(done!.t2).toBe(t2)
    expect(done!.t3).toBe(t3)
  })

  it('answerer derives sync from a sync-done envelope (mirrored offset)', async () => {
    const { encode: encodeSdp } = await import('../core/encoding')
    const offerCode = encodeSdp({ type: 'offer', sdp: 'v=0\r\n' })
    const { result } = renderHook(() => useChatSession())
    await act(async () => {
      await result.current.startAsAnswerer(offerCode, 'test-conv')
    })
    // Answerer's channel arrives via `pc.ondatachannel`, not `createDataChannel`.
    const answererChannel = new FakeDataChannel()
    await act(async () => {
      lastPc!.emitDataChannel(answererChannel)
      answererChannel.open()
      await Promise.resolve()
    })

    // No sync-probe from the answerer side — only the offerer initiates.
    expect(lastChannel!.sent.filter((s) => s.includes('"sync-probe"'))).toHaveLength(0)

    // Simulate the full quad arriving as sync-done.
    const t1 = 1000
    const t2 = 1100
    const t3 = 1110
    const t4 = 1200
    await act(async () => {
      lastChannel!.onmessage?.({
        data: envelope({ t: 'sync-done', id: 'done-1', sentAt: t3, replyTo: 'ack-1', t1, t2, t3, t4 }),
      })
      await Promise.resolve()
    })

    const sync = result.current.telemetry.sync
    expect(sync).not.toBeNull()
    expect(sync!.t1).toBe(t1)
    expect(sync!.t4).toBe(t4)
    // Answerer's offset is the negation of the offerer's. For these inputs:
    // offerer offset = ((t2 - t1) + (t3 - t4)) / 2 = ((100) + (-90)) / 2 = 5
    // answerer offset = -5
    expect(sync!.offset).toBe(-5)
    // RTT is the same magnitude on both sides.
    expect(sync!.rtt).toBe(t4 - t1 - (t3 - t2))
  })

  it('sync timeout does not break chat — chat envelopes still flow with sync=null', async () => {
    vi.useFakeTimers()
    try {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const { result } = renderHook(() => useChatSession())
      await act(async () => {
        await result.current.startAsOfferer('test-conv')
      })
      await act(async () => {
        lastChannel!.open()
        await Promise.resolve()
      })

      // Advance past the 5s sync timeout.
      await act(async () => {
        vi.advanceTimersByTime(6000)
      })

      expect(result.current.telemetry.sync).toBeNull()

      // Chat still works — send a message and assert the channel got it.
      await act(async () => {
        result.current.send('still works')
      })
      expect(result.current.messages).toHaveLength(1)
      expect(result.current.messages[0].text).toBe('still works')
      warn.mockRestore()
    } finally {
      vi.useRealTimers()
    }
  })

  it('answerer auto-fires a receipt envelope for every incoming chat', async () => {
    const { encode: encodeSdp } = await import('../core/encoding')
    const offerCode = encodeSdp({ type: 'offer', sdp: 'v=0\r\n' })
    const { result: answerer } = renderHook(() => useChatSession())
    await act(async () => {
      await answerer.current.startAsAnswerer(offerCode, 'test-conv')
    })
    // Answerer's channel arrives via `pc.ondatachannel`, not `createDataChannel`.
    const answererChannel = new FakeDataChannel()
    await act(async () => {
      lastPc!.emitDataChannel(answererChannel)
      answererChannel.open()
      await Promise.resolve()
    })

    // Receiver sees an incoming chat envelope; it must turn around with a receipt.
    await act(async () => {
      lastChannel!.onmessage?.({
        data: envelope({ t: 'chat', id: 'chat-1', sentAt: 1000, text: 'ping' }),
      })
      await Promise.resolve()
    })

    const receipt = findSent(lastChannel!, 'receipt')
    expect(receipt).not.toBeNull()
    expect(receipt!.replyTo).toBe('chat-1')
    expect(typeof receipt!.messageReceivedAt).toBe('number')
  })

  it('outgoing chat starts as delivery:"pending" and flips to "delivered" when a receipt arrives', async () => {
    const { result } = renderHook(() => useChatSession())
    await act(async () => {
      await result.current.startAsOfferer('test-conv')
    })
    await act(async () => {
      lastChannel!.open()
      await Promise.resolve()
    })

    await act(async () => {
      result.current.send('hi')
    })
    const sent = result.current.messages[0]
    expect(sent.delivery).toBe('pending')

    // Peer sends a receipt referencing our message id.
    await act(async () => {
      lastChannel!.onmessage?.({
        data: envelope({
          t: 'receipt',
          id: 'r-1',
          sentAt: Date.now(),
          replyTo: sent.id,
          messageReceivedAt: Date.now(),
        }),
      })
      await Promise.resolve()
    })

    expect(result.current.messages[0].delivery).toBe('delivered')
    // A "receipt" sample is appended with an rtt.
    const receiptSamples = result.current.telemetry.samples.filter((s) => s.kind === 'receipt')
    expect(receiptSamples).toHaveLength(1)
    expect(typeof (receiptSamples[0] as { rttMs: number }).rttMs).toBe('number')
  })

  it('receipt for an unknown message id is ignored without crash', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { result } = renderHook(() => useChatSession())
    await act(async () => {
      await result.current.startAsOfferer('test-conv')
    })
    await act(async () => {
      lastChannel!.open()
      await Promise.resolve()
    })

    await act(async () => {
      lastChannel!.onmessage?.({
        data: envelope({
          t: 'receipt',
          id: 'r-stray',
          sentAt: Date.now(),
          replyTo: 'never-sent',
          messageReceivedAt: Date.now(),
        }),
      })
      await Promise.resolve()
    })

    // No state corruption: no messages added, no receipt sample appended.
    expect(result.current.messages).toHaveLength(0)
    expect(result.current.telemetry.samples.filter((s) => s.kind === 'receipt')).toHaveLength(0)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('state-change samples accumulate as the connection progresses', async () => {
    const { result } = renderHook(() => useChatSession())
    await act(async () => {
      await result.current.startAsOfferer('test-conv')
    })
    await act(async () => {
      lastChannel!.open()
      await Promise.resolve()
    })

    const states = result.current.telemetry.samples
      .filter((s): s is Extract<typeof s, { kind: 'state-change' }> => s.kind === 'state-change')
      .map((s) => s.state)
    // The offerer should pass through gathering → awaiting-answer → connected.
    expect(states).toContain('gathering')
    expect(states).toContain('awaiting-answer')
    expect(states).toContain('connected')
  })

  it('telemetry.connectedAt is set when the channel opens', async () => {
    const { result } = renderHook(() => useChatSession())
    await act(async () => {
      await result.current.startAsOfferer('test-conv')
    })
    expect(result.current.telemetry.connectedAt).toBeNull()
    await act(async () => {
      lastChannel!.open()
      await Promise.resolve()
    })
    expect(typeof result.current.telemetry.connectedAt).toBe('number')
  })

  // BUG-007 regression: state-change-driven telemetry commits must land
  // inside the synchronous act() block, not after it. Before the fix,
  // `transition()` scheduled commitTelemetry via queueMicrotask, which
  // resolved after the sync act() returned — producing both a "not wrapped
  // in act" warning *and* a stale `telemetry` snapshot until the next
  // render. We assert the new state-change sample is visible immediately
  // after a sync act() that drives a transition.
  it('telemetry samples reflect a state transition immediately after a sync act() block', async () => {
    const { result } = renderHook(() => useChatSession())
    await act(async () => {
      await result.current.startAsOfferer('test-conv')
    })
    const beforeCount = result.current.telemetry.samples.length
    act(() => lastChannel!.open())
    // No `await` and no microtask flush — the commit must already have
    // landed via the useEffect-driven commit path.
    const after = result.current.telemetry.samples
    const newStateChanges = after
      .slice(beforeCount)
      .filter((s): s is Extract<typeof s, { kind: 'state-change' }> => s.kind === 'state-change')
      .map((s) => s.state)
    expect(newStateChanges).toContain('connected')
    expect(typeof result.current.telemetry.connectedAt).toBe('number')
  })
})

describe('useChatSession teardown', () => {
  it('reset() clears state and closes both pc and channel', async () => {
    const { result } = renderHook(() => useChatSession())
    await act(async () => {
      await result.current.startAsOfferer('test-conv')
    })
    act(() => lastChannel!.open())
    act(() => result.current.send('hello'))

    const pc = lastPc!
    const channel = lastChannel!
    expect(result.current.messages).toHaveLength(1)
    expect(result.current.encodedLocal).not.toBeNull()

    act(() => result.current.reset())

    expect(result.current.state).toBe('idle')
    expect(result.current.messages).toEqual([])
    expect(result.current.encodedLocal).toBeNull()
    expect(result.current.error).toBeNull()
    expect(channel.closeCalls).toBeGreaterThanOrEqual(1)
    expect(pc.closeCalls).toBeGreaterThanOrEqual(1)
  })

  it('unmount closes both pc and channel', async () => {
    const { result, unmount } = renderHook(() => useChatSession())
    await act(async () => {
      await result.current.startAsOfferer('test-conv')
    })
    const pc = lastPc!
    const channel = lastChannel!

    unmount()

    expect(channel.closeCalls).toBeGreaterThanOrEqual(1)
    expect(pc.closeCalls).toBeGreaterThanOrEqual(1)
  })
})

describe('useChatSession state-machine guards', () => {
  // CR-006: the controller owns its state machine and must refuse operations
  // that aren't valid for the current state. Without these guards, re-entry
  // leaks the existing PeerConnection (the ref gets overwritten before the
  // previous one is closed) and a re-fired submitAnswer can tear down a live
  // chat by calling setRemoteDescription on a stable signaling state.

  it('startAsOfferer called twice in rapid succession only constructs one PeerConnection', async () => {
    const { result } = renderHook(() => useChatSession())

    await act(async () => {
      await result.current.startAsOfferer('test-conv')
    })
    const firstPc = lastPc
    expect(result.current.state).toBe('awaiting-answer')
    expect(pcStats.constructorCount).toBe(1)

    // Second call once we're already in `awaiting-answer` — should be a no-op.
    await act(async () => {
      await result.current.startAsOfferer('test-conv')
    })

    expect(pcStats.constructorCount).toBe(1)
    expect(lastPc).toBe(firstPc)
    expect(result.current.state).toBe('awaiting-answer')
  })

  it('startAsAnswerer called after startAsOfferer is in flight is a no-op', async () => {
    const { result } = renderHook(() => useChatSession())

    await act(async () => {
      await result.current.startAsOfferer('test-conv')
    })
    const offererPc = lastPc!
    expect(result.current.state).toBe('awaiting-answer')
    expect(pcStats.constructorCount).toBe(1)

    const { encode } = await import('../core/encoding')
    const offerCode = encode({ type: 'offer', sdp: 'v=0\r\n' })

    await act(async () => {
      await result.current.startAsAnswerer(offerCode, 'test-conv')
    })

    // No second PC, no setRemoteDescription on a fresh pc, state stayed on
    // the offerer track.
    expect(pcStats.constructorCount).toBe(1)
    expect(lastPc).toBe(offererPc)
    expect(offererPc.setRemoteDescriptionCalls).toHaveLength(0)
    expect(result.current.state).toBe('awaiting-answer')
  })

  it('submitAnswer while state is "connected" does not tear down the live chat', async () => {
    const { result } = renderHook(() => useChatSession())
    await act(async () => {
      await result.current.startAsOfferer('test-conv')
    })
    act(() => lastChannel!.open())
    // FEAT-010: incoming wire payloads are JSON envelopes now.
    act(() =>
      lastChannel!.onmessage?.({
        data: JSON.stringify({ v: 1, t: 'chat', id: 'm-other', sentAt: 1, text: 'hello from the other side' }),
      }),
    )
    expect(result.current.state).toBe('connected')
    expect(result.current.messages).toHaveLength(1)

    const { encode } = await import('../core/encoding')
    const answerCode = encode({ type: 'answer', sdp: 'v=0\r\n' })

    await act(async () => {
      await result.current.submitAnswer(answerCode)
    })

    // State stays connected, no second setRemoteDescription, transcript
    // preserved, no error surfaced.
    expect(result.current.state).toBe('connected')
    expect(lastPc!.setRemoteDescriptionCalls).toHaveLength(0)
    expect(result.current.messages).toHaveLength(1)
    expect(result.current.error).toBeNull()
  })

  it('submitAnswer while state is "gathering" does not regress to "connecting"', async () => {
    // We can't easily pause `startAsOfferer` mid-flight, but `startAsAnswerer`
    // leaves the hook in 'connecting' until the channel opens — and there's
    // no public hook into 'gathering' that resolves cleanly. Use the answerer
    // path: state is 'connecting' (still pre-open), submitAnswer must no-op.
    const { encode } = await import('../core/encoding')
    const offerCode = encode({ type: 'offer', sdp: 'v=0\r\n' })

    const { result } = renderHook(() => useChatSession())
    await act(async () => {
      await result.current.startAsAnswerer(offerCode, 'test-conv')
    })
    expect(result.current.state).toBe('connecting')
    // acceptOffer calls setRemoteDescription with the offer once; track baseline.
    const baselineCalls = lastPc!.setRemoteDescriptionCalls.length

    const answerCode = encode({ type: 'answer', sdp: 'v=0\r\n' })
    await act(async () => {
      await result.current.submitAnswer(answerCode)
    })

    // submitAnswer is only legal in 'awaiting-answer'. From 'connecting' it
    // must no-op: no extra setRemoteDescription, state unchanged.
    expect(result.current.state).toBe('connecting')
    expect(lastPc!.setRemoteDescriptionCalls.length).toBe(baselineCalls)
  })

  it('after reset() the controller accepts startAsOfferer again', async () => {
    // Regression guard: the guard keys on 'idle', and reset returns to 'idle'.
    const { result } = renderHook(() => useChatSession())
    await act(async () => {
      await result.current.startAsOfferer('test-conv')
    })
    expect(pcStats.constructorCount).toBe(1)

    act(() => result.current.reset())
    expect(result.current.state).toBe('idle')

    await act(async () => {
      await result.current.startAsOfferer('test-conv')
    })

    expect(pcStats.constructorCount).toBe(2)
    expect(result.current.state).toBe('awaiting-answer')
  })
})

describe('useChatSession politelyAcceptOffer (FEAT-008)', () => {
  // The polite-defer path: the user is on the Offerer screen in
  // `awaiting-answer`, but pastes another *offer* into the reply box. The hook
  // must tear down its own offer-side PC, start a fresh answerer flow against
  // the pasted offer, and surface a new `encodedLocal` (the answer code) — all
  // without misclassifying the deliberate teardown as a `'failed'` state.

  it('tears down the offerer PC and starts an answerer flow against the pasted offer', async () => {
    const { result } = renderHook(() => useChatSession())
    await act(async () => {
      await result.current.startAsOfferer('test-conv')
    })
    expect(result.current.state).toBe('awaiting-answer')
    const offererPc = lastPc!
    const offererChannel = lastChannel!
    expect(pcStats.constructorCount).toBe(1)

    const { encode } = await import('../core/encoding')
    const offerCode = encode({ type: 'offer', sdp: 'v=0\r\nremote\r\n' })

    await act(async () => {
      await result.current.politelyAcceptOffer(offerCode)
    })

    // Old PC + channel closed; a fresh PC allocated for the answerer flow.
    expect(offererPc.closeCalls).toBeGreaterThanOrEqual(1)
    expect(offererChannel.closeCalls).toBeGreaterThanOrEqual(1)
    expect(pcStats.constructorCount).toBe(2)
    expect(lastPc).not.toBe(offererPc)
    // Fresh PC saw the offer set as its remote description.
    expect(lastPc!.setRemoteDescriptionCalls).toHaveLength(1)
    expect(lastPc!.setRemoteDescriptionCalls[0].type).toBe('offer')
    // We're now answering — state moves to 'connecting' (waiting for channel.open).
    expect(result.current.state).toBe('connecting')
    // encodedLocal is the freshly produced answer code, not the abandoned offer.
    expect(result.current.encodedLocal).toBeTypeOf('string')
    expect(result.current.error).toBeNull()
  })

  it('does NOT transition to "failed" during the deliberate teardown', async () => {
    // BUG-002/BUG-005 guard: the channel.onclose handler would otherwise
    // reclassify the offerer's awaiting-answer → close as 'failed'. The new
    // method must short-circuit that path.
    const { result } = renderHook(() => useChatSession())
    await act(async () => {
      await result.current.startAsOfferer('test-conv')
    })
    expect(result.current.state).toBe('awaiting-answer')

    const { encode } = await import('../core/encoding')
    const offerCode = encode({ type: 'offer', sdp: 'v=0\r\n' })

    await act(async () => {
      await result.current.politelyAcceptOffer(offerCode)
    })

    expect(result.current.state).toBe('connecting')
    expect(result.current.error).toBeNull()
    // Even if the now-closed channel's onclose fires asynchronously, the
    // hook must not regress the fresh answerer flow into 'failed'.
    expect(result.current.state).not.toBe('failed')
  })

  it('is a no-op when called outside "awaiting-answer"', async () => {
    // The polite-defer path is only meaningful while we're holding an
    // outstanding offer. From idle, gathering, connecting, connected, failed,
    // or closed it must no-op — no rogue teardown, no new PC.
    const { result } = renderHook(() => useChatSession())

    const { encode } = await import('../core/encoding')
    const offerCode = encode({ type: 'offer', sdp: 'v=0\r\n' })

    await act(async () => {
      await result.current.politelyAcceptOffer(offerCode)
    })

    expect(pcStats.constructorCount).toBe(0)
    expect(result.current.state).toBe('idle')
    expect(result.current.error).toBeNull()
  })

  it('exposes a fresh encodedLocal after the swap (re-encoded from the new PC)', async () => {
    // The previously-rendered offer URL must not stay on screen during the
    // transition — once we polite-defer, the offer SDP is abandoned and the
    // new answerer-side PC produces its own `encodedLocal`. The fake PC
    // reuses the same `localDescription` fixture so we assert via the PC
    // identity rather than encoded-payload byte-equality.
    const { result } = renderHook(() => useChatSession())
    await act(async () => {
      await result.current.startAsOfferer('test-conv')
    })
    const offererPc = lastPc!
    expect(result.current.encodedLocal).toBeTypeOf('string')

    const { encode } = await import('../core/encoding')
    const offerCode = encode({ type: 'offer', sdp: 'v=0\r\n' })

    await act(async () => {
      await result.current.politelyAcceptOffer(offerCode)
    })

    // The PC the hook now holds is the freshly-allocated one (different
    // instance from the abandoned offerer PC). Its encodedLocal must be
    // populated; that's the answer code the user copies back.
    expect(lastPc).not.toBe(offererPc)
    expect(result.current.encodedLocal).toBeTypeOf('string')
    expect(result.current.encodedLocal!.length).toBeGreaterThan(0)
  })

  it("rebinds to the supplied conversationId so the inviter's history envelope is accepted (BUG-007)", async () => {
    // The Joiner-side polite-defer (BUG-007) passes Alice's conv id so the
    // session follows the inviter's conversation across the swap. Without
    // this rebind, the hook stays tied to Bob's old offerer conv id and
    // Alice's FEAT-012 history envelope is dropped on the conversationId
    // mismatch check.
    const { result } = renderHook(() => useChatSession())
    await act(async () => {
      await result.current.startAsOfferer('bob-conv')
    })
    expect(result.current.conversationId).toBe('bob-conv')

    const { encode } = await import('../core/encoding')
    const offerCode = encode({ type: 'offer', sdp: 'v=0\r\n' })

    await act(async () => {
      await result.current.politelyAcceptOffer(offerCode, 'alice-conv')
    })

    // Session is now bound to Alice's conversation, not Bob's.
    expect(result.current.conversationId).toBe('alice-conv')

    // And a history envelope for Alice's conversation is accepted (the
    // mismatch warn-and-drop in handleEnvelope must NOT fire).
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const answererChannel = new FakeDataChannel()
    await act(async () => {
      lastPc!.emitDataChannel(answererChannel)
      answererChannel.open()
      await Promise.resolve()
    })
    await act(async () => {
      lastChannel!.onmessage?.({
        data: JSON.stringify({
          v: 1,
          t: 'history',
          id: 'h1',
          sentAt: 1,
          conversationId: 'alice-conv',
          messages: [{ id: 'm1', from: 'me', text: 'from alice', at: 50 }],
        }),
      })
      // Allow the apply() microtask + bulkInsert IDB to settle.
      await new Promise((resolve) => setTimeout(resolve, 10))
    })

    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('mismatch'))
    expect(result.current.hasResumed).toBe(true)
    warn.mockRestore()
  })

  it('omitting conversationId keeps the existing binding (Offerer-side path unchanged)', async () => {
    const { result } = renderHook(() => useChatSession())
    await act(async () => {
      await result.current.startAsOfferer('keep-this-conv')
    })

    const { encode } = await import('../core/encoding')
    const offerCode = encode({ type: 'offer', sdp: 'v=0\r\n' })

    await act(async () => {
      await result.current.politelyAcceptOffer(offerCode)
    })

    expect(result.current.conversationId).toBe('keep-this-conv')
  })

  it('surfaces an error and lands in "failed" when the pasted code cannot be decoded', async () => {
    const { result } = renderHook(() => useChatSession())
    await act(async () => {
      await result.current.startAsOfferer('test-conv')
    })

    await act(async () => {
      await result.current.politelyAcceptOffer('not-a-valid-encoded-payload')
    })

    expect(result.current.state).toBe('failed')
    expect(result.current.error).toBeTypeOf('string')
    expect(result.current.error).not.toBe('')
  })
})

describe('useChatSession FEAT-012 resume', () => {
  // Helper: build a chat envelope string for the wire path.
  function chatEnvelope(id: string, text: string, sentAt = 1_700_000_000_000): string {
    return JSON.stringify({ v: 1, t: 'chat', id, sentAt, text })
  }
  function historyEnvelope(
    conversationId: string,
    messages: Array<{ id: string; from: 'me' | 'them'; text: string; at: number }>,
  ): string {
    return JSON.stringify({
      v: 1,
      t: 'history',
      id: 'history-1',
      sentAt: Date.now(),
      conversationId,
      messages,
    })
  }

  it('bindConversation seeds messages from local storage before the channel opens (AC#16)', async () => {
    // Seed storage with a prior transcript for conv 'c1'.
    const storage = await import('../core/storage')
    await storage.upsertConversation({ id: 'c1', createdAt: 1, lastActivityAt: 100 })
    await storage.appendMessage('c1', { id: 'm1', from: 'me', text: 'hi from yesterday', at: 50 })
    await storage.appendMessage('c1', { id: 'm2', from: 'them', text: 'oh hi', at: 75 })

    const { result } = renderHook(() => useChatSession())
    await act(async () => {
      await result.current.bindConversation('c1')
    })

    expect(result.current.messages).toHaveLength(2)
    expect(result.current.messages.map((m) => m.id)).toEqual(['m1', 'm2'])
    expect(result.current.conversationId).toBe('c1')
  })

  it('send persists the outgoing message via storage.appendMessage (AC#15)', async () => {
    const storage = await import('../core/storage')
    const { result } = renderHook(() => useChatSession())
    await act(async () => {
      await result.current.bindConversation('c2')
    })
    await act(async () => {
      await result.current.startAsOfferer('c2')
    })
    act(() => lastChannel!.open())

    act(() => result.current.send('persisted hello'))

    // Yield so the appendMessage IDB transaction resolves.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
    })

    // Read back from storage to assert the message landed.
    const stored = await storage.listMessages('c2')
    expect(stored).toHaveLength(1)
    expect(stored[0]).toMatchObject({ from: 'me', text: 'persisted hello' })
  })

  it('incoming chat envelope is persisted via storage.appendMessage (AC#15)', async () => {
    const storage = await import('../core/storage')
    const { result } = renderHook(() => useChatSession())
    await act(async () => {
      await result.current.bindConversation('c3')
    })
    await act(async () => {
      await result.current.startAsOfferer('c3')
    })
    act(() => lastChannel!.open())

    act(() => lastChannel!.onmessage?.({ data: chatEnvelope('inc-1', 'incoming') }))

    // Yield so the appendMessage IDB transaction resolves.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
    })

    const stored = await storage.listMessages('c3')
    const incoming = stored.find((m) => m.id === 'inc-1')
    expect(incoming).toBeDefined()
    expect(incoming!.from).toBe('them')
    expect(incoming!.text).toBe('incoming')
    void result
  })

  it('reset() clears messages and conversationId but does NOT delete from storage (AC#17)', async () => {
    const storage = await import('../core/storage')
    const { result } = renderHook(() => useChatSession())
    // Bind explicitly so we can await the stub upsert before the send fires.
    await act(async () => {
      await result.current.bindConversation('c4')
    })
    await act(async () => {
      await result.current.startAsOfferer('c4')
    })
    act(() => lastChannel!.open())
    act(() => result.current.send('keep me'))
    // Drain the appendMessage promise (and the IDB transaction it spawns).
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
    })

    act(() => result.current.reset())

    expect(result.current.messages).toEqual([])
    expect(result.current.conversationId).toBeNull()
    // Storage record survives the reset.
    expect(await storage.getConversation('c4')).not.toBeNull()
    expect((await storage.listMessages('c4')).length).toBeGreaterThan(0)
  })

  it('sends a history envelope as soon as the channel opens (AC#10)', async () => {
    const storage = await import('../core/storage')
    await storage.upsertConversation({ id: 'c5', createdAt: 1, lastActivityAt: 100 })
    await storage.appendMessage('c5', { id: 'h1', from: 'me', text: 'old', at: 50 })

    const { result } = renderHook(() => useChatSession())
    // Bind synchronously so the snapshot is populated before the channel
    // opens. Without this the open handler would ship an empty array.
    await act(async () => {
      await result.current.bindConversation('c5')
    })
    await act(async () => {
      await result.current.startAsOfferer('c5')
    })
    await act(async () => {
      lastChannel!.open()
      await Promise.resolve()
    })

    // Find the history envelope in the sent bytes.
    const history = lastChannel!.sent
      .map((s) => {
        try {
          return JSON.parse(s)
        } catch {
          return null
        }
      })
      .find((p) => p && p.t === 'history')
    expect(history).toBeTruthy()
    expect(history.conversationId).toBe('c5')
    expect(history.messages).toHaveLength(1)
    expect(history.messages[0].id).toBe('h1')
    void result
  })

  it('merges an incoming history envelope, flipping perspective and deduping by id (AC#11)', async () => {
    const storage = await import('../core/storage')
    await storage.upsertConversation({ id: 'c6', createdAt: 1, lastActivityAt: 100 })
    // Local already has m1 (sent by me).
    await storage.appendMessage('c6', { id: 'm1', from: 'me', text: 'local-mine', at: 50 })

    const { result } = renderHook(() => useChatSession())
    // Bind synchronously so the local seed has finished by the time the
    // history envelope arrives — otherwise the merge path's bindPromise
    // wait stretches past the test timeout.
    await act(async () => {
      await result.current.bindConversation('c6')
    })
    await act(async () => {
      await result.current.startAsOfferer('c6')
    })
    act(() => lastChannel!.open())

    // Peer sends a history with our m1 (from their perspective: 'them') plus
    // a new m2 (from their perspective: 'me' — they sent it).
    const incoming = [
      { id: 'm1', from: 'them' as const, text: 'local-mine', at: 50 },
      { id: 'm2', from: 'me' as const, text: 'their-message', at: 75 },
    ]
    await act(async () => {
      lastChannel!.onmessage?.({ data: historyEnvelope('c6', incoming) })
      // Apply runs after the bindPromise. Yield the event loop so the IDB
      // bulkInsert and setState resolve before we assert.
      await new Promise((resolve) => setTimeout(resolve, 10))
    })

    // After merge: m1 stayed local (not duplicated), m2 was inserted with
    // flipped perspective ('me' on peer → 'them' on us).
    expect(result.current.messages).toHaveLength(2)
    const m2 = result.current.messages.find((m) => m.id === 'm2')
    expect(m2).toBeDefined()
    expect(m2!.from).toBe('them')
    // hasResumed latched.
    expect(result.current.hasResumed).toBe(true)
  })

  it('drops a history envelope whose conversationId does not match the session', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { result } = renderHook(() => useChatSession())
    await act(async () => {
      await result.current.startAsOfferer('c-expected')
    })
    act(() => lastChannel!.open())
    await act(async () => {
      await Promise.resolve()
    })

    const initialCount = result.current.messages.length

    await act(async () => {
      lastChannel!.onmessage?.({
        data: historyEnvelope('c-wrong', [{ id: 'x', from: 'me', text: 'stale', at: 1 }]),
      })
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(result.current.messages).toHaveLength(initialCount)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('hasResumed stays false on a fresh conversation that never receives a history envelope', async () => {
    const { result } = renderHook(() => useChatSession())
    await act(async () => {
      await result.current.startAsOfferer('c-fresh')
    })
    act(() => lastChannel!.open())
    await act(async () => {
      await Promise.resolve()
    })

    expect(result.current.hasResumed).toBe(false)
  })

  // BUG-006: the user's report — copying a transcript from Home after a
  // mixed-author live session shows every message attributed to 'You'. The
  // tests below drive the full live arc (send + receive, alternating) and
  // then assert what `storage.listMessages` returns, since that's what
  // Home's "Copy transcript" feeds into `formatTranscript`. The failure
  // mode the ticket describes lives on the persistence path, not in
  // `formatTranscript`.

  it('BUG-006: a live alternating exchange persists each (from, at) verbatim', async () => {
    const storage = await import('../core/storage')
    const { result } = renderHook(() => useChatSession())
    await act(async () => {
      await result.current.startAsOfferer('bug6-mixed')
    })
    act(() => lastChannel!.open())

    // Stamp distinct moments on each turn so a "everything collapses to one
    // timestamp" bug shows up against the expected spread.
    const baseAt = 1_700_000_000_000
    const t0 = baseAt
    const t1 = baseAt + 60_000
    const t2 = baseAt + 120_000
    const t3 = baseAt + 180_000

    // Send a local message. The hook uses Date.now() for the at, so spy.
    const dateNow = vi.spyOn(Date, 'now')
    dateNow.mockReturnValue(t0)
    act(() => result.current.send('hello'))

    dateNow.mockReturnValue(t1)
    act(() =>
      lastChannel!.onmessage?.({
        data: JSON.stringify({ v: 1, t: 'chat', id: 'inc-1', sentAt: t1 - 100, text: 'hi back' }),
      }),
    )

    dateNow.mockReturnValue(t2)
    act(() => result.current.send('how are you'))

    dateNow.mockReturnValue(t3)
    act(() =>
      lastChannel!.onmessage?.({
        data: JSON.stringify({ v: 1, t: 'chat', id: 'inc-2', sentAt: t3 - 100, text: 'good' }),
      }),
    )

    // Yield so the appendMessage IDB transactions resolve.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
    })

    dateNow.mockRestore()

    const stored = await storage.listMessages('bug6-mixed')
    expect(stored).toHaveLength(4)
    // Each record kept the side that originated it and the moment it was
    // sent / received. If any of these fail, the persistence path collapsed
    // the perspective the way the bug ticket describes.
    expect(stored.map((m) => ({ from: m.from, at: m.at, text: m.text }))).toEqual([
      { from: 'me', at: t0, text: 'hello' },
      { from: 'them', at: t1, text: 'hi back' },
      { from: 'me', at: t2, text: 'how are you' },
      { from: 'them', at: t3, text: 'good' },
    ])
  })

  it('BUG-006: history merge does not overwrite locally-originated from:"me" records', async () => {
    // Hypothesis #1 from the ticket. The peer's history snapshot contains
    // our local sends from THEIR perspective (from: 'them'). The merge code
    // flips perspective, but the dedupe is supposed to skip ids we already
    // hold so the local `from: 'me'` records aren't overwritten with the
    // flipped value.
    const storage = await import('../core/storage')
    const { result } = renderHook(() => useChatSession())
    await act(async () => {
      await result.current.startAsOfferer('bug6-merge')
    })
    act(() => lastChannel!.open())

    const dateNow = vi.spyOn(Date, 'now')
    dateNow.mockReturnValue(1_700_000_000_000)
    act(() => result.current.send('local-1'))
    dateNow.mockReturnValue(1_700_000_060_000)
    act(() => result.current.send('local-2'))

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
    })

    // Grab the actual ids the hook minted so the history echo matches.
    const localIds = result.current.messages.map((m) => m.id)
    expect(localIds).toHaveLength(2)

    // Peer's history envelope: our two sends from THEIR perspective + a new
    // peer-originated message.
    const incoming = [
      { id: localIds[0], from: 'them' as const, text: 'local-1', at: 1_700_000_000_000 },
      { id: localIds[1], from: 'them' as const, text: 'local-2', at: 1_700_000_060_000 },
      { id: 'peer-new', from: 'me' as const, text: 'their-only', at: 1_700_000_090_000 },
    ]
    await act(async () => {
      lastChannel!.onmessage?.({
        data: JSON.stringify({
          v: 1,
          t: 'history',
          id: 'h-1',
          sentAt: 1_700_000_100_000,
          conversationId: 'bug6-merge',
          messages: incoming,
        }),
      })
      await new Promise((resolve) => setTimeout(resolve, 10))
    })

    dateNow.mockRestore()

    const stored = await storage.listMessages('bug6-merge')
    const byId = new Map(stored.map((m) => [m.id, m]))
    expect(byId.get(localIds[0])?.from).toBe('me')
    expect(byId.get(localIds[1])?.from).toBe('me')
    expect(byId.get('peer-new')?.from).toBe('them')
    expect(byId.get(localIds[0])?.at).toBe(1_700_000_000_000)
    expect(byId.get(localIds[1])?.at).toBe(1_700_000_060_000)
  })

  it('BUG-006 canonical: in-chat transcript matches Home-row transcript after the chat ends', async () => {
    // The user's exact arc: drive a live mixed exchange, capture the markdown
    // `formatTranscript(session.messages, ...)` would produce mid-session,
    // tear the session down, then read back from storage and re-format. The
    // two strings must be equal (modulo `delivery: 'pending'` which the
    // formatter ignores). This is the test the bug ticket calls out as
    // canonical — it walks the full live-session → end → read-from-storage
    // → format path that the unit tests don't.
    const storage = await import('../core/storage')
    const { formatTranscript } = await import('../core/transcript')
    const { result } = renderHook(() => useChatSession())
    await act(async () => {
      await result.current.startAsOfferer('bug6-e2e')
    })
    act(() => lastChannel!.open())

    const dateNow = vi.spyOn(Date, 'now')
    const baseAt = 1_700_000_000_000
    const times = [baseAt, baseAt + 60_000, baseAt + 120_000, baseAt + 180_000]

    dateNow.mockReturnValue(times[0])
    act(() => result.current.send('first from me'))

    dateNow.mockReturnValue(times[1])
    act(() =>
      lastChannel!.onmessage?.({
        data: JSON.stringify({ v: 1, t: 'chat', id: 'p-1', sentAt: times[1] - 100, text: 'reply from them' }),
      }),
    )

    dateNow.mockReturnValue(times[2])
    act(() => result.current.send('second from me'))

    dateNow.mockReturnValue(times[3])
    act(() =>
      lastChannel!.onmessage?.({
        data: JSON.stringify({ v: 1, t: 'chat', id: 'p-2', sentAt: times[3] - 100, text: 'second from them' }),
      }),
    )

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
    })

    // Capture mid-session: this is what Chat.tsx's toolbar Copy would emit.
    const midSessionMd = formatTranscript(result.current.messages, { includeTimestamps: true })

    // End the chat — what `goHome` does.
    act(() => result.current.reset())

    dateNow.mockRestore()

    // Read back from storage and re-format — this is what Home does on
    // Copy transcript.
    const stored = await storage.listMessages('bug6-e2e')
    const postEndMd = formatTranscript(
      stored.map((m) => ({ id: m.id, from: m.from, text: m.text, at: m.at })),
      { includeTimestamps: true },
    )

    expect(postEndMd).toBe(midSessionMd)
    // Spot-check both headings are present so a degenerate "both empty"
    // pass can't slip through.
    expect(postEndMd).toContain('**You**')
    expect(postEndMd).toContain('**Them**')
  })

  it('BUG-006: a chat envelope that arrives before bindConversation resolves still persists with from:"them"', async () => {
    // Hypothesis #3 from the ticket. Stall the local listMessages so the
    // bind is still in flight when the chat envelope arrives. The chat-
    // receive path adds the id to knownIdsRef *before* bind completes, but
    // bind then reassigns knownIdsRef to a fresh set — losing the id —
    // which is the suspected vector for a later history merge writing
    // from:'me' over the just-persisted from:'them' record.
    const storage = await import('../core/storage')
    const realListMessages = storage.listMessages
    const listSpy = vi.spyOn(storage, 'listMessages')
    let releaseBind: (() => void) | null = null
    const bindGate = new Promise<void>((resolve) => {
      releaseBind = resolve
    })
    listSpy.mockImplementationOnce(async (id: string) => {
      await bindGate
      return realListMessages(id)
    })

    const { result } = renderHook(() => useChatSession())
    // Start the bind without awaiting — bind is gated on the first list call.
    let bindPromise: Promise<void> | null = null
    act(() => {
      bindPromise = result.current.bindConversation('bug6-race')
    })
    // Drive the answerer side so a channel exists when we feed the message.
    const { encode } = await import('../core/encoding')
    const offerCode = encode({ type: 'offer', sdp: 'v=0\r\n' })
    await act(async () => {
      await result.current.startAsAnswerer(offerCode, 'bug6-race')
    })
    const channel = new FakeDataChannel()
    channel.readyState = 'open'
    act(() => lastPc!.emitDataChannel(channel))

    // Chat envelope arrives while bind is still gated.
    act(() =>
      channel.onmessage?.({
        data: JSON.stringify({ v: 1, t: 'chat', id: 'race-1', sentAt: 1_700_000_000_000, text: 'before-bind' }),
      }),
    )

    // Yield so the appendMessage IDB tx commits.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
    })

    // Release the bind so the rest of the flow can finish.
    await act(async () => {
      releaseBind!()
      await bindPromise
      // Also let the second listMessages (from startAsAnswerer's bind) finish.
      await new Promise((resolve) => setTimeout(resolve, 10))
    })

    listSpy.mockRestore()

    const stored = await storage.listMessages('bug6-race')
    const incoming = stored.find((m) => m.id === 'race-1')
    expect(incoming).toBeDefined()
    expect(incoming!.from).toBe('them')
  })

  // BUG-006 root cause: `bindConversation`'s deferred `setMessages(seeded)` and
  // `knownIdsRef.current = ids` setters unconditionally REPLACE state. If a
  // `send` or incoming `chat` envelope lands in `messages`/`knownIdsRef`
  // *between* the bind's IDB snapshot and the setter commit, the seed wipes
  // the live entry from React state AND drops its id from the dedupe set.
  // The user can then see a transcript that's missing turns; on a resume,
  // the missing id leaves the slot open for a later history merge to
  // `bulkInsertMessages.put()` over the locally-stored record with a flipped
  // perspective — the "all from You under one timestamp" symptom.
  it('BUG-006: bind seed must not clobber a live send that landed before the seed resolved', async () => {
    // Gate the bind's IDB read so we can deterministically order the seed
    // commit *after* a live `send()` has already updated state.
    const storage = await import('../core/storage')
    const realListMessages = storage.listMessages
    const listSpy = vi.spyOn(storage, 'listMessages')
    let releaseRead: ((records: Awaited<ReturnType<typeof realListMessages>>) => void) | null = null
    const readGate = new Promise<Awaited<ReturnType<typeof realListMessages>>>((resolve) => {
      releaseRead = resolve
    })
    listSpy.mockImplementationOnce(async () => readGate)

    const { result } = renderHook(() => useChatSession())
    await act(async () => {
      await result.current.startAsOfferer('bug6-clobber')
    })
    act(() => lastChannel!.open())

    // Live send: commits to messages + queues appendMessage.
    act(() => result.current.send('live send during bind'))
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
    })

    // Bind's listMessages resolves to the pre-send snapshot.
    await act(async () => {
      releaseRead!([])
      await new Promise((resolve) => setTimeout(resolve, 10))
    })

    listSpy.mockRestore()

    expect(result.current.messages.find((m) => m.text === 'live send during bind')).toBeDefined()
  })

  // BUG-006 reopened: the perspective-flip scheme was the root fragility.
  // The fix moves attribution to an absolute `senderId` on every record
  // and `sender` on every chat envelope, derived from a per-conversation
  // `selfPeerId` minted by the hook at bind time. These tests pin the
  // new contract so it can't silently regress.

  it('BUG-006: bindConversation mints a selfPeerId on a fresh conversation', async () => {
    const storage = await import('../core/storage')
    const { result } = renderHook(() => useChatSession())
    await act(async () => {
      await result.current.bindConversation('bug6-self-fresh')
    })
    const conv = await storage.getConversation('bug6-self-fresh')
    expect(conv?.selfPeerId).toBeTypeOf('string')
    expect(conv!.selfPeerId!.length).toBeGreaterThan(0)
  })

  it('BUG-006: bindConversation reuses an existing conv selfPeerId across re-binds', async () => {
    const storage = await import('../core/storage')
    const { result } = renderHook(() => useChatSession())
    await act(async () => {
      await result.current.bindConversation('bug6-self-resume')
    })
    const first = (await storage.getConversation('bug6-self-resume'))!.selfPeerId
    act(() => result.current.reset())
    await act(async () => {
      await result.current.bindConversation('bug6-self-resume')
    })
    const second = (await storage.getConversation('bug6-self-resume'))!.selfPeerId
    expect(second).toBe(first)
  })

  it('BUG-006: send stamps `sender` on the wire envelope and `senderId` on the stored record', async () => {
    const storage = await import('../core/storage')
    const { result } = renderHook(() => useChatSession())
    await act(async () => {
      await result.current.bindConversation('bug6-send-sender')
      await result.current.startAsOfferer('bug6-send-sender')
    })
    act(() => lastChannel!.open())
    act(() => result.current.send('hello'))
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
    })

    // Find the chat envelope on the wire.
    const chatEnv = lastChannel!.sent
      .map((s) => {
        try {
          return JSON.parse(s)
        } catch {
          return null
        }
      })
      .find((p) => p && p.t === 'chat')
    const conv = await storage.getConversation('bug6-send-sender')
    expect(chatEnv).toBeTruthy()
    expect(chatEnv.sender).toBe(conv?.selfPeerId)

    const stored = await storage.listMessages('bug6-send-sender')
    const sent = stored.find((m) => m.text === 'hello')
    expect(sent?.senderId).toBe(conv?.selfPeerId)
    expect(sent?.from).toBe('me')
  })

  it('BUG-006: incoming chat persists env.sender as senderId on the stored record', async () => {
    const storage = await import('../core/storage')
    const { result } = renderHook(() => useChatSession())
    await act(async () => {
      await result.current.bindConversation('bug6-recv-sender')
      await result.current.startAsOfferer('bug6-recv-sender')
    })
    act(() => lastChannel!.open())

    const peerId = 'peer-uuid-deadbeef'
    act(() =>
      lastChannel!.onmessage?.({
        data: JSON.stringify({
          v: 1,
          t: 'chat',
          id: 'inc-with-sender',
          sentAt: 1_700_000_000_000,
          text: 'hi from peer',
          sender: peerId,
        }),
      }),
    )
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
    })

    const stored = await storage.listMessages('bug6-recv-sender')
    const received = stored.find((m) => m.id === 'inc-with-sender')
    expect(received?.senderId).toBe(peerId)
    expect(received?.from).toBe('them')
  })

  it('BUG-006: history merge with `sender` field inserts records verbatim — no flip needed', async () => {
    // The repro that the perspective flip used to need: peer ships
    // history that includes our own send (from peer's perspective:
    // `from: 'them'`). With senderId the merge must NOT flip — it should
    // insert with the absolute senderId, and the resolved `from` should
    // match our own `selfPeerId` test (i.e. 'me' for our send).
    const storage = await import('../core/storage')
    const { result } = renderHook(() => useChatSession())
    await act(async () => {
      await result.current.bindConversation('bug6-merge-sender')
      await result.current.startAsOfferer('bug6-merge-sender')
    })
    act(() => lastChannel!.open())

    // Send one local so we have a known senderId on the wire.
    act(() => result.current.send('local-1'))
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
    })
    const local = result.current.messages.find((m) => m.text === 'local-1')!
    const localId = local.id
    const myPeerId = (await storage.getConversation('bug6-merge-sender'))!.selfPeerId!

    // Peer ships history that echoes our send (with the absolute senderId
    // = our `selfPeerId`) plus one new message of their own.
    const peerPeerId = 'peer-uuid-xyz'
    const incoming = [
      {
        id: localId,
        from: 'them' as const,
        sender: myPeerId, // absolute — original sender was us
        text: 'local-1',
        at: 1_700_000_000_000,
      },
      {
        id: 'peer-msg',
        from: 'me' as const,
        sender: peerPeerId, // absolute — original sender was peer
        text: 'theirs',
        at: 1_700_000_060_000,
      },
    ]
    await act(async () => {
      lastChannel!.onmessage?.({
        data: JSON.stringify({
          v: 1,
          t: 'history',
          id: 'h-merge-sender',
          sentAt: 1_700_000_100_000,
          conversationId: 'bug6-merge-sender',
          messages: incoming,
        }),
      })
      await new Promise((resolve) => setTimeout(resolve, 10))
    })

    const stored = await storage.listMessages('bug6-merge-sender')
    // Our send is unchanged (deduped).
    const ours = stored.find((m) => m.id === localId)
    expect(ours?.senderId).toBe(myPeerId)
    expect(ours?.from).toBe('me')
    // Peer's new message inserted with peer's senderId, resolved `from`
    // = 'them' because peerPeerId !== our selfPeerId.
    const theirs = stored.find((m) => m.id === 'peer-msg')
    expect(theirs?.senderId).toBe(peerPeerId)
    expect(theirs?.from).toBe('them')
  })

  it('BUG-006: history merge falls back to perspective flip for records with no `sender` (legacy peer)', async () => {
    // Pre-fix peers ship history with `from` only. The receiver must still
    // produce a sensible record so a mixed-version exchange isn't a hard
    // break; the legacy flip path stays as a fallback.
    const storage = await import('../core/storage')
    const { result } = renderHook(() => useChatSession())
    await act(async () => {
      await result.current.bindConversation('bug6-merge-legacy')
      await result.current.startAsOfferer('bug6-merge-legacy')
    })
    act(() => lastChannel!.open())

    await act(async () => {
      lastChannel!.onmessage?.({
        data: JSON.stringify({
          v: 1,
          t: 'history',
          id: 'h-legacy',
          sentAt: 1_700_000_100_000,
          conversationId: 'bug6-merge-legacy',
          // No `sender` field on these — pre-fix peer.
          messages: [
            { id: 'leg-1', from: 'me', text: 'theirs-1', at: 1_700_000_000_000 },
            { id: 'leg-2', from: 'them', text: 'mine-1', at: 1_700_000_060_000 },
          ],
        }),
      })
      await new Promise((resolve) => setTimeout(resolve, 10))
    })

    const stored = await storage.listMessages('bug6-merge-legacy')
    // peer's 'me' → ours 'them', peer's 'them' → ours 'me'. No senderId
    // (the peer didn't ship one), so the record reads through the legacy
    // `from` fallback.
    expect(stored.find((m) => m.id === 'leg-1')?.from).toBe('them')
    expect(stored.find((m) => m.id === 'leg-1')?.senderId).toBeUndefined()
    expect(stored.find((m) => m.id === 'leg-2')?.from).toBe('me')
    expect(stored.find((m) => m.id === 'leg-2')?.senderId).toBeUndefined()
  })
})
