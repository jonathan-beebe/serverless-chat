import { afterEach, describe, expect, it, vi } from 'vitest'
import { attachRtcDiagnostics } from './rtcDiagnostics'

// IMPRV-033: behavioural coverage for rtcDiagnostics.
//
// The module is dev-only (`import.meta.env.DEV`) and emits its observations
// via `console.info` / `console.warn`. Tests drive a `FakePeerConnection`
// that dispatches synthesized RTC events and assert on the spied console
// output — there's no React, no DOM, no live PC.
//
// The fake is intentionally NOT extracted to shared test-utils: IMPRV-003's
// "do not promote FakePeerConnection yet" decision still applies. The
// version in `rtc.test.ts` is too narrow (single listener list, no
// per-event dispatch), so we keep a slightly richer copy here.

type StatsReport = Map<string, unknown>

class FakePeerConnection {
  iceGatheringState: RTCIceGatheringState = 'new'
  iceConnectionState: RTCIceConnectionState = 'new'
  connectionState: RTCPeerConnectionState = 'new'
  signalingState: RTCSignalingState = 'stable'
  private listeners = new Map<string, Set<(ev: Event) => void>>()
  private config: RTCConfiguration | null
  private statsImpl: () => Promise<StatsReport> = () => Promise.resolve(new Map())

  constructor(config: RTCConfiguration | null = null) {
    this.config = config
  }
  getConfiguration(): RTCConfiguration | null {
    return this.config
  }
  addEventListener(event: string, handler: (ev: Event) => void) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set())
    this.listeners.get(event)!.add(handler)
  }
  removeEventListener(event: string, handler: (ev: Event) => void) {
    this.listeners.get(event)?.delete(handler)
  }
  dispatch(event: string, payload: Partial<Event> = {}) {
    const handlers = this.listeners.get(event)
    if (!handlers) return
    for (const h of [...handlers]) h(payload as Event)
  }
  getStats(): Promise<StatsReport> {
    return this.statsImpl()
  }
  setStats(impl: () => Promise<StatsReport>) {
    this.statsImpl = impl
  }
}

function spyConsole() {
  return {
    info: vi.spyOn(console, 'info').mockImplementation(() => {}),
    warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
  }
}

function makeCandidate(over: Partial<RTCIceCandidate> = {}): RTCIceCandidate {
  return {
    candidate: 'candidate:1 1 udp 1234 1.2.3.4 5678 typ host',
    type: 'host',
    protocol: 'udp',
    address: '1.2.3.4',
    port: 5678,
    relatedAddress: null,
    relatedPort: null,
    ...over,
  } as unknown as RTCIceCandidate
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('attachRtcDiagnostics — banner', () => {
  it('logs the iceServers banner with joined URLs when getConfiguration returns servers', () => {
    const spies = spyConsole()
    const pc = new FakePeerConnection({
      iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }],
    })
    attachRtcDiagnostics(pc as unknown as RTCPeerConnection, 'banner')
    expect(spies.info).toHaveBeenCalledWith(
      expect.stringMatching(
        /\[rtc:banner\] new RTCPeerConnection — iceServers: stun:stun\.l\.google\.com:19302,stun:stun1\.l\.google\.com:19302/,
      ),
    )
  })

  it('logs "(none)" when iceServers is absent / empty', () => {
    const spies = spyConsole()
    const pc = new FakePeerConnection({})
    attachRtcDiagnostics(pc as unknown as RTCPeerConnection, 'banner')
    expect(spies.info).toHaveBeenCalledWith(expect.stringMatching(/iceServers: \(none\)/))
  })

  it('does not throw when getConfiguration is missing on the PC', () => {
    spyConsole()
    const pc = new FakePeerConnection(null)
    delete (pc as { getConfiguration?: unknown }).getConfiguration
    expect(() => attachRtcDiagnostics(pc as unknown as RTCPeerConnection, 'banner')).not.toThrow()
  })
})

describe('attachRtcDiagnostics — icecandidate channel', () => {
  it('logs a candidate line per real candidate and ignores the empty-string sentinel', () => {
    const spies = spyConsole()
    const pc = new FakePeerConnection({})
    attachRtcDiagnostics(pc as unknown as RTCPeerConnection, 'cand')
    pc.dispatch('icecandidate', { candidate: makeCandidate({ type: 'host' }) } as unknown as Event)
    pc.dispatch('icecandidate', { candidate: null } as unknown as Event)
    pc.dispatch('icecandidate', { candidate: makeCandidate({ candidate: '' }) } as unknown as Event)

    const candidateLines = spies.info.mock.calls
      .map((args) => String(args[0]))
      .filter((line) => line.includes('] candidate '))
    expect(candidateLines).toHaveLength(1)
    expect(candidateLines[0]).toMatch(/\[rtc:cand\] candidate host udp 1\.2\.3\.4:5678/)
  })

  it('includes related address/port in the candidate description when present', () => {
    const spies = spyConsole()
    const pc = new FakePeerConnection({})
    attachRtcDiagnostics(pc as unknown as RTCPeerConnection, 'rel')
    pc.dispatch('icecandidate', {
      candidate: makeCandidate({ type: 'srflx', relatedAddress: '10.0.0.1', relatedPort: 9999 }),
    } as unknown as Event)
    expect(spies.info).toHaveBeenCalledWith(
      expect.stringMatching(/srflx udp 1\.2\.3\.4:5678 \(related 10\.0\.0\.1:9999\)/),
    )
  })
})

describe('attachRtcDiagnostics — icegatheringstatechange + tally', () => {
  function gatherTypes(pc: FakePeerConnection, types: string[]) {
    for (const type of types) {
      pc.dispatch('icecandidate', {
        candidate: makeCandidate({ type: type as RTCIceCandidateType }),
      } as unknown as Event)
    }
    pc.iceGatheringState = 'complete'
    pc.dispatch('icegatheringstatechange')
  }

  it('logs every iceGatheringState transition', () => {
    const spies = spyConsole()
    const pc = new FakePeerConnection({})
    attachRtcDiagnostics(pc as unknown as RTCPeerConnection, 'gs')
    pc.iceGatheringState = 'gathering'
    pc.dispatch('icegatheringstatechange')
    expect(spies.info).toHaveBeenCalledWith('[rtc:gs] iceGatheringState → gathering')
  })

  it('warns "no srflx/relay candidates" when gathering completes with only host candidates', () => {
    const spies = spyConsole()
    const pc = new FakePeerConnection({})
    attachRtcDiagnostics(pc as unknown as RTCPeerConnection, 'host-only')
    gatherTypes(pc, ['host', 'host'])

    const warns = spies.warn.mock.calls.map((args) => String(args[0]))
    expect(warns.some((m) => /ICE gathering complete.*2 host.*no srflx\/relay/.test(m))).toBe(true)
  })

  it('does NOT warn when at least one srflx candidate was tallied', () => {
    const spies = spyConsole()
    const pc = new FakePeerConnection({})
    attachRtcDiagnostics(pc as unknown as RTCPeerConnection, 'has-srflx')
    gatherTypes(pc, ['host', 'srflx'])

    expect(spies.warn).not.toHaveBeenCalled()
    expect(spies.info).toHaveBeenCalledWith(expect.stringMatching(/ICE gathering complete.*1 host, 1 srflx/))
  })

  it('does NOT warn when at least one relay candidate was tallied', () => {
    const spies = spyConsole()
    const pc = new FakePeerConnection({})
    attachRtcDiagnostics(pc as unknown as RTCPeerConnection, 'has-relay')
    gatherTypes(pc, ['host', 'relay'])

    expect(spies.warn).not.toHaveBeenCalled()
    expect(spies.info).toHaveBeenCalledWith(expect.stringMatching(/ICE gathering complete.*1 host, 1 relay/))
  })

  it('classifies unrecognised candidate types as "unknown" in the summary', () => {
    const spies = spyConsole()
    const pc = new FakePeerConnection({})
    attachRtcDiagnostics(pc as unknown as RTCPeerConnection, 'unk')
    gatherTypes(pc, ['mdns', 'srflx'])
    expect(spies.info).toHaveBeenCalledWith(expect.stringMatching(/ICE gathering complete.*1 srflx, 1 unknown/))
  })

  it('summarises "none" when no candidates were tallied', () => {
    const spies = spyConsole()
    const pc = new FakePeerConnection({})
    attachRtcDiagnostics(pc as unknown as RTCPeerConnection, 'empty')
    pc.iceGatheringState = 'complete'
    pc.dispatch('icegatheringstatechange')
    expect(spies.warn).toHaveBeenCalledWith(expect.stringMatching(/ICE gathering complete in \d+ms: none/))
  })
})

describe('attachRtcDiagnostics — icecandidateerror channel', () => {
  it('warns with code/url/text/host pulled off the error event', () => {
    const spies = spyConsole()
    const pc = new FakePeerConnection({})
    attachRtcDiagnostics(pc as unknown as RTCPeerConnection, 'err')
    pc.dispatch('icecandidateerror', {
      url: 'stun:stun.example.com',
      errorCode: 701,
      errorText: 'STUN allocate failed',
      hostCandidate: '1.2.3.4:5678',
    } as unknown as Event)

    expect(spies.warn).toHaveBeenCalledWith(
      expect.stringMatching(/url=stun:stun\.example\.com code=701 "STUN allocate failed" host=1\.2\.3\.4:5678/),
    )
  })

  it('renders ? placeholders for missing error fields', () => {
    const spies = spyConsole()
    const pc = new FakePeerConnection({})
    attachRtcDiagnostics(pc as unknown as RTCPeerConnection, 'err')
    pc.dispatch('icecandidateerror', {} as unknown as Event)
    expect(spies.warn).toHaveBeenCalledWith(expect.stringMatching(/url=\? code=\? ""/))
  })
})

describe('attachRtcDiagnostics — passive state-channel logging', () => {
  it('logs iceConnectionState transitions', () => {
    const spies = spyConsole()
    const pc = new FakePeerConnection({})
    attachRtcDiagnostics(pc as unknown as RTCPeerConnection, 'ice')
    pc.iceConnectionState = 'checking'
    pc.dispatch('iceconnectionstatechange')
    expect(spies.info).toHaveBeenCalledWith('[rtc:ice] iceConnectionState → checking')
  })

  it('logs signalingState transitions', () => {
    const spies = spyConsole()
    const pc = new FakePeerConnection({})
    attachRtcDiagnostics(pc as unknown as RTCPeerConnection, 'sig')
    pc.signalingState = 'have-local-offer'
    pc.dispatch('signalingstatechange')
    expect(spies.info).toHaveBeenCalledWith('[rtc:sig] signalingState → have-local-offer')
  })
})

describe('attachRtcDiagnostics — connectionstatechange side-effects', () => {
  it('warns about TURN need when connection state goes to "failed", including the tally', () => {
    const spies = spyConsole()
    const pc = new FakePeerConnection({})
    attachRtcDiagnostics(pc as unknown as RTCPeerConnection, 'fail')
    pc.dispatch('icecandidate', { candidate: makeCandidate({ type: 'host' }) } as unknown as Event)
    pc.connectionState = 'failed'
    pc.dispatch('connectionstatechange')

    expect(spies.warn).toHaveBeenCalledWith(
      expect.stringMatching(/connection failed — gathered 1 host\. .*TURN server/),
    )
  })

  it('logs the selected pair with RTT on connectionState=connected (success path)', async () => {
    const spies = spyConsole()
    const pc = new FakePeerConnection({})
    pc.setStats(() =>
      Promise.resolve(
        new Map<string, unknown>([
          [
            'pair-1',
            {
              type: 'candidate-pair',
              nominated: true,
              localCandidateId: 'L',
              remoteCandidateId: 'R',
              currentRoundTripTime: 0.042,
            },
          ],
          [
            'L',
            {
              type: 'local-candidate',
              id: 'L',
              candidateType: 'srflx',
              protocol: 'udp',
              address: '1.1.1.1',
              port: 1111,
            },
          ],
          [
            'R',
            {
              type: 'remote-candidate',
              id: 'R',
              candidateType: 'srflx',
              protocol: 'udp',
              address: '2.2.2.2',
              port: 2222,
            },
          ],
        ]),
      ),
    )
    attachRtcDiagnostics(pc as unknown as RTCPeerConnection, 'ok')
    pc.connectionState = 'connected'
    pc.dispatch('connectionstatechange')
    // Wait for the awaited getStats to resolve and the second console.info to fire.
    await Promise.resolve()
    await Promise.resolve()

    expect(spies.info).toHaveBeenCalledWith(
      '[rtc:ok] selected pair: local=srflx udp 1.1.1.1:1111 ↔ remote=srflx udp 2.2.2.2:2222 (rtt=42ms)',
    )
  })

  it('logs "no nominated candidate pair" when stats report has no nominated pair', async () => {
    const spies = spyConsole()
    const pc = new FakePeerConnection({})
    pc.setStats(() => Promise.resolve(new Map()))
    attachRtcDiagnostics(pc as unknown as RTCPeerConnection, 'empty-pair')
    pc.connectionState = 'connected'
    pc.dispatch('connectionstatechange')
    await Promise.resolve()
    await Promise.resolve()

    expect(spies.info).toHaveBeenCalledWith('[rtc:empty-pair] connected — no nominated candidate pair reported yet')
  })

  it('warns "getStats failed" when getStats rejects', async () => {
    const spies = spyConsole()
    const pc = new FakePeerConnection({})
    pc.setStats(() => Promise.reject(new Error('stats unavailable')))
    attachRtcDiagnostics(pc as unknown as RTCPeerConnection, 'fail-stats')
    pc.connectionState = 'connected'
    pc.dispatch('connectionstatechange')
    await Promise.resolve()
    await Promise.resolve()

    expect(spies.warn).toHaveBeenCalledWith('[rtc:fail-stats] getStats failed', expect.any(Error))
  })
})
