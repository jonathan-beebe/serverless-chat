import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildIceServers, waitForIceComplete } from './rtc'

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

// IMPRV-035: cover every branch of the VITE_TURN_* env-var resolver. The
// production cost of a regression here is "the chat never connects on
// symmetric-NAT networks" — invisible on the no-env test path that
// module-level `ICE_CONFIG` captures at import.
//
// .env.local in this repo ships real metered.ca TURN creds (so the dev
// server actually works on symmetric NATs out of the box), which means
// every test starts from the all-three-set state. Each case re-stubs
// every var it cares about — including stubbing to '' to simulate "unset"
// — so the baseline is deterministic regardless of which `.env*` file
// happens to populate import.meta.env at module load.
describe('buildIceServers', () => {
  // STUN-only base set the module always returns when TURN env vars are
  // unset / partially set / parse to empty. Kept inline so a change in the
  // shape (URLs, count, order) trips this test instead of silently shipping.
  const STUN_ONLY: RTCIceServer[] = [
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: 'stun:stun.l.google.com:19302' },
  ]

  function clearTurnEnv() {
    vi.stubEnv('VITE_TURN_URLS', '')
    vi.stubEnv('VITE_TURN_USERNAME', '')
    vi.stubEnv('VITE_TURN_CREDENTIAL', '')
  }

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('returns the STUN-only base set when all three TURN env vars are unset', () => {
    clearTurnEnv()
    expect(buildIceServers()).toEqual(STUN_ONLY)
  })

  it('falls back to STUN-only when urls + username are set but credential is missing', () => {
    clearTurnEnv()
    vi.stubEnv('VITE_TURN_URLS', 'turn:turn.example.com:3478')
    vi.stubEnv('VITE_TURN_USERNAME', 'alice')
    expect(buildIceServers()).toEqual(STUN_ONLY)
  })

  it('falls back to STUN-only when urls + credential are set but username is missing', () => {
    clearTurnEnv()
    vi.stubEnv('VITE_TURN_URLS', 'turn:turn.example.com:3478')
    vi.stubEnv('VITE_TURN_CREDENTIAL', 'secret')
    expect(buildIceServers()).toEqual(STUN_ONLY)
  })

  it('falls back to STUN-only when username + credential are set but urls is missing', () => {
    clearTurnEnv()
    vi.stubEnv('VITE_TURN_USERNAME', 'alice')
    vi.stubEnv('VITE_TURN_CREDENTIAL', 'secret')
    expect(buildIceServers()).toEqual(STUN_ONLY)
  })

  it('appends a single-URL TURN entry when all three env vars are set', () => {
    clearTurnEnv()
    vi.stubEnv('VITE_TURN_URLS', 'turn:turn.example.com:3478')
    vi.stubEnv('VITE_TURN_USERNAME', 'alice')
    vi.stubEnv('VITE_TURN_CREDENTIAL', 'secret')
    const servers = buildIceServers()
    expect(servers).toHaveLength(3)
    expect(servers.slice(0, 2)).toEqual(STUN_ONLY)
    expect(servers[2]).toEqual({
      urls: ['turn:turn.example.com:3478'],
      username: 'alice',
      credential: 'secret',
    })
  })

  it('parses comma-separated URLs, trimming whitespace and dropping empty entries', () => {
    clearTurnEnv()
    vi.stubEnv('VITE_TURN_URLS', ' turn:a:3478 , turn:b:443 ,, turn:c:5349 ')
    vi.stubEnv('VITE_TURN_USERNAME', 'alice')
    vi.stubEnv('VITE_TURN_CREDENTIAL', 'secret')
    const servers = buildIceServers()
    expect(servers).toHaveLength(3)
    expect(servers[2]).toEqual({
      urls: ['turn:a:3478', 'turn:b:443', 'turn:c:5349'],
      username: 'alice',
      credential: 'secret',
    })
  })

  it('falls back to STUN-only when urls parses to an empty list (commas only)', () => {
    clearTurnEnv()
    vi.stubEnv('VITE_TURN_URLS', ',,,')
    vi.stubEnv('VITE_TURN_USERNAME', 'alice')
    vi.stubEnv('VITE_TURN_CREDENTIAL', 'secret')
    expect(buildIceServers()).toEqual(STUN_ONLY)
  })

  it('falls back to STUN-only when urls is whitespace only', () => {
    clearTurnEnv()
    vi.stubEnv('VITE_TURN_URLS', '   ')
    vi.stubEnv('VITE_TURN_USERNAME', 'alice')
    vi.stubEnv('VITE_TURN_CREDENTIAL', 'secret')
    expect(buildIceServers()).toEqual(STUN_ONLY)
  })
})
