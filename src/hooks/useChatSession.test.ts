import { act, renderHook } from '@testing-library/react'
import { beforeAll, describe, expect, it } from 'vitest'
import { useChatSession } from './useChatSession'

// Minimal stubs for the slice of WebRTC the hook touches via `createOffer`.
// We don't exercise real ICE here — these tests are strictly about the
// message-id contract: every message gets a unique, non-empty string id,
// even across hook instances and across `reset()`.
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
  send(data: string) {
    this.sent.push(data)
  }
  close() {
    this.readyState = 'closed'
  }
  /** Test helper: simulate the underlying transport opening. */
  open() {
    this.readyState = 'open'
    this.onopen?.()
  }
}

// Capture the most recent data channel so tests can flip it to 'open' after
// the hook constructs the peer connection inside `createOffer`.
let lastChannel: FakeDataChannel | null = null

class FakePeerConnection {
  iceGatheringState: RTCIceGatheringState = 'complete'
  localDescription = { type: 'offer' as const, sdp: 'v=0\r\n' }
  onconnectionstatechange: (() => void) | null = null
  createDataChannel() {
    lastChannel = new FakeDataChannel()
    return lastChannel
  }
  createOffer() {
    return Promise.resolve({ type: 'offer' as const, sdp: 'v=0\r\n' })
  }
  setLocalDescription() {
    return Promise.resolve()
  }
  addEventListener() {}
  removeEventListener() {}
  close() {}
}

beforeAll(() => {
  // @ts-expect-error stubbing minimal subset for jsdom
  globalThis.RTCPeerConnection = FakePeerConnection
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
