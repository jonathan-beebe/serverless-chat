import { act, renderHook } from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { useChatSession } from './useChatSession'

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
})

describe('useChatSession message ids', () => {
  it('assigns a unique, non-empty string id to each sent message', async () => {
    const { result } = renderHook(() => useChatSession())
    await act(async () => {
      await result.current.startAsOfferer()
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
        await result.current.startAsOfferer()
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
      await result.current.startAsOfferer()
    })
    act(() => lastChannel!.open())
    act(() => result.current.send('before'))
    const before = result.current.messages[0].id

    act(() => result.current.reset())
    expect(result.current.messages).toHaveLength(0)

    await act(async () => {
      await result.current.startAsOfferer()
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
      await result.current.startAsOfferer()
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
      await result.current.startAsOfferer()
    })
    expect(result.current.state).toBe('failed')
    expect(result.current.error).toBe('boom')
    expect(result.current.encodedLocal).toBeNull()
  })

  it('channel onopen transitions state to "connected"', async () => {
    const { result } = renderHook(() => useChatSession())
    await act(async () => {
      await result.current.startAsOfferer()
    })
    expect(result.current.state).toBe('awaiting-answer')

    act(() => lastChannel!.open())
    expect(result.current.state).toBe('connected')
  })

  it('pc.onconnectionstatechange with "failed" transitions state to "failed"', async () => {
    const { result } = renderHook(() => useChatSession())
    await act(async () => {
      await result.current.startAsOfferer()
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
      await result.current.startAsAnswerer(offerCode)
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
      await result.current.startAsOfferer()
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
      await result.current.startAsOfferer()
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
      await result.current.startAsOfferer()
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
  it('appends an incoming string message with from: "them"', async () => {
    const { result } = renderHook(() => useChatSession())
    await act(async () => {
      await result.current.startAsOfferer()
    })
    act(() => lastChannel!.open())

    act(() => lastChannel!.onmessage?.({ data: 'hi there' }))

    expect(result.current.messages).toHaveLength(1)
    const [msg] = result.current.messages
    expect(msg.from).toBe('them')
    expect(msg.text).toBe('hi there')
  })

  it('renders a non-string payload as "[binary message]"', async () => {
    const { result } = renderHook(() => useChatSession())
    await act(async () => {
      await result.current.startAsOfferer()
    })
    act(() => lastChannel!.open())

    act(() => lastChannel!.onmessage?.({ data: new ArrayBuffer(8) }))

    expect(result.current.messages).toHaveLength(1)
    expect(result.current.messages[0].text).toBe('[binary message]')
    expect(result.current.messages[0].from).toBe('them')
  })

  it('send() drops empty / whitespace-only input as a no-op', async () => {
    const { result } = renderHook(() => useChatSession())
    await act(async () => {
      await result.current.startAsOfferer()
    })
    act(() => lastChannel!.open())

    act(() => result.current.send(''))
    act(() => result.current.send('   '))

    expect(result.current.messages).toHaveLength(0)
    expect(lastChannel!.sent).toHaveLength(0)
  })

  it('send() is a no-op when the channel is not open', async () => {
    const { result } = renderHook(() => useChatSession())
    await act(async () => {
      await result.current.startAsOfferer()
    })
    // Deliberately do NOT call lastChannel.open(); readyState stays 'connecting'.
    expect(lastChannel!.readyState).toBe('connecting')

    act(() => result.current.send('queued?'))

    expect(result.current.messages).toHaveLength(0)
    expect(lastChannel!.sent).toHaveLength(0)
  })

  it('send() with an open channel calls channel.send and appends from: "me"', async () => {
    const { result } = renderHook(() => useChatSession())
    await act(async () => {
      await result.current.startAsOfferer()
    })
    act(() => lastChannel!.open())

    act(() => result.current.send('hello'))

    expect(lastChannel!.sent).toEqual(['hello'])
    expect(result.current.messages).toHaveLength(1)
    expect(result.current.messages[0]).toMatchObject({ from: 'me', text: 'hello' })
  })
})

describe('useChatSession teardown', () => {
  it('reset() clears state and closes both pc and channel', async () => {
    const { result } = renderHook(() => useChatSession())
    await act(async () => {
      await result.current.startAsOfferer()
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
      await result.current.startAsOfferer()
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
      await result.current.startAsOfferer()
    })
    const firstPc = lastPc
    expect(result.current.state).toBe('awaiting-answer')
    expect(pcStats.constructorCount).toBe(1)

    // Second call once we're already in `awaiting-answer` — should be a no-op.
    await act(async () => {
      await result.current.startAsOfferer()
    })

    expect(pcStats.constructorCount).toBe(1)
    expect(lastPc).toBe(firstPc)
    expect(result.current.state).toBe('awaiting-answer')
  })

  it('startAsAnswerer called after startAsOfferer is in flight is a no-op', async () => {
    const { result } = renderHook(() => useChatSession())

    await act(async () => {
      await result.current.startAsOfferer()
    })
    const offererPc = lastPc!
    expect(result.current.state).toBe('awaiting-answer')
    expect(pcStats.constructorCount).toBe(1)

    const { encode } = await import('../core/encoding')
    const offerCode = encode({ type: 'offer', sdp: 'v=0\r\n' })

    await act(async () => {
      await result.current.startAsAnswerer(offerCode)
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
      await result.current.startAsOfferer()
    })
    act(() => lastChannel!.open())
    act(() => lastChannel!.onmessage?.({ data: 'hello from the other side' }))
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
      await result.current.startAsAnswerer(offerCode)
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
      await result.current.startAsOfferer()
    })
    expect(pcStats.constructorCount).toBe(1)

    act(() => result.current.reset())
    expect(result.current.state).toBe('idle')

    await act(async () => {
      await result.current.startAsOfferer()
    })

    expect(pcStats.constructorCount).toBe(2)
    expect(result.current.state).toBe('awaiting-answer')
  })
})
