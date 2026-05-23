import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { waitForIceComplete } from './rtc'

// A minimal fake of the slice of RTCPeerConnection that waitForIceComplete
// touches. We only need state + event listener wiring; nothing else.
class FakePeerConnection {
  iceGatheringState: RTCIceGatheringState = 'gathering'
  private listeners: Array<() => void> = []
  addEventListener(_event: string, handler: () => void) {
    this.listeners.push(handler)
  }
  removeEventListener(_event: string, handler: () => void) {
    this.listeners = this.listeners.filter((h) => h !== handler)
  }
  /** Simulate gathering finishing. */
  finishGathering() {
    this.iceGatheringState = 'complete'
    this.listeners.forEach((h) => h())
  }
  listenerCount() {
    return this.listeners.length
  }
}

describe('waitForIceComplete', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('resolves immediately when gathering is already complete', async () => {
    const pc = new FakePeerConnection()
    pc.iceGatheringState = 'complete'
    await expect(waitForIceComplete(pc as unknown as RTCPeerConnection)).resolves.toBeUndefined()
  })

  it('resolves when gathering completes before the timeout', async () => {
    const pc = new FakePeerConnection()
    const promise = waitForIceComplete(pc as unknown as RTCPeerConnection, 5000)

    // Let the listener register.
    await Promise.resolve()
    expect(pc.listenerCount()).toBe(1)

    pc.finishGathering()
    await expect(promise).resolves.toBeUndefined()
    // Listener should be cleaned up after resolution.
    expect(pc.listenerCount()).toBe(0)
  })

  it('resolves anyway when gathering stalls past the timeout', async () => {
    const pc = new FakePeerConnection()
    // Stays in 'gathering' for the whole test.
    const promise = waitForIceComplete(pc as unknown as RTCPeerConnection, 5000)

    // Before the timeout fires, the promise is still pending.
    await vi.advanceTimersByTimeAsync(4999)
    expect(pc.listenerCount()).toBe(1)

    // After the timeout fires, the promise resolves and the listener is removed.
    await vi.advanceTimersByTimeAsync(1)
    await expect(promise).resolves.toBeUndefined()
    expect(pc.listenerCount()).toBe(0)
  })
})
