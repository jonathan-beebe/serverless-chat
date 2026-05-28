import { describe, expect, it, vi } from 'vitest'
import { decode, deriveSync, encode, type WireEnvelope } from './wire'

// The wire module is a pure boundary: every payload that goes over the data
// channel after `open` is JSON of this shape. Tests pin the round-trip
// contract for each variant and the "drop-malformed-input" promise — the
// receiver must never throw on garbage, because RTCDataChannel reliability
// doesn't protect us from a future version, a debug message, or a confused
// peer (FEAT-010 AC#3).

describe('wire envelope encode/decode round-trip', () => {
  it('round-trips a chat envelope', () => {
    const env: WireEnvelope = {
      v: 1,
      t: 'chat',
      id: '11111111-1111-1111-1111-111111111111',
      sentAt: 1_700_000_000_000,
      text: 'hello world',
    }
    const back = decode(encode(env))
    expect(back).toEqual(env)
  })

  it('round-trips a chat envelope carrying a BUG-006 sender id', () => {
    const env: WireEnvelope = {
      v: 1,
      t: 'chat',
      id: '11111111-1111-1111-1111-111111111111',
      sentAt: 1_700_000_000_000,
      text: 'hello world',
      sender: '22222222-2222-2222-2222-222222222222',
    }
    const back = decode(encode(env))
    expect(back).toEqual(env)
    // Narrow + read defensively so the assertion fails cleanly if the wire
    // shape ever drifts back to non-optional / wrong-type.
    expect(back && back.t === 'chat' ? back.sender : null).toBe(env.sender)
  })

  it('round-trips a sync-probe envelope', () => {
    const env: WireEnvelope = {
      v: 1,
      t: 'sync-probe',
      id: 'probe-1',
      sentAt: 1_700_000_000_000,
    }
    expect(decode(encode(env))).toEqual(env)
  })

  it('round-trips a sync-ack envelope', () => {
    const env: WireEnvelope = {
      v: 1,
      t: 'sync-ack',
      id: 'ack-1',
      sentAt: 1_700_000_000_500,
      replyTo: 'probe-1',
      probeReceivedAt: 1_700_000_000_400,
    }
    expect(decode(encode(env))).toEqual(env)
  })

  it('round-trips a sync-done envelope', () => {
    const env: WireEnvelope = {
      v: 1,
      t: 'sync-done',
      id: 'done-1',
      sentAt: 1_700_000_000_900,
      replyTo: 'ack-1',
      t1: 1_700_000_000_000,
      t2: 1_700_000_000_400,
      t3: 1_700_000_000_500,
      t4: 1_700_000_000_800,
    }
    expect(decode(encode(env))).toEqual(env)
  })

  it('round-trips a receipt envelope', () => {
    const env: WireEnvelope = {
      v: 1,
      t: 'receipt',
      id: 'r-1',
      sentAt: 1_700_000_001_100,
      replyTo: 'chat-1',
      messageReceivedAt: 1_700_000_001_050,
    }
    expect(decode(encode(env))).toEqual(env)
  })

  it('round-trips a history envelope (FEAT-012)', () => {
    const env: WireEnvelope = {
      v: 1,
      t: 'history',
      id: 'history-1',
      sentAt: 1_700_000_002_000,
      conversationId: 'conv-uuid',
      messages: [
        { id: 'm1', from: 'me', text: 'hi', at: 1_700_000_000_000 },
        { id: 'm2', from: 'them', text: 'bye', at: 1_700_000_000_500 },
      ],
    }
    expect(decode(encode(env))).toEqual(env)
  })

  it('round-trips an empty history envelope (peer signaling "I have nothing")', () => {
    const env: WireEnvelope = {
      v: 1,
      t: 'history',
      id: 'history-empty',
      sentAt: 1_700_000_002_000,
      conversationId: 'conv-uuid',
      messages: [],
    }
    expect(decode(encode(env))).toEqual(env)
  })
})

describe('wire history envelope decode safety (FEAT-012)', () => {
  it('returns null when conversationId is missing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(decode(JSON.stringify({ v: 1, t: 'history', id: 'h1', sentAt: 1, messages: [] }))).toBeNull()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('returns null when messages is not an array', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(
      decode(JSON.stringify({ v: 1, t: 'history', id: 'h1', sentAt: 1, conversationId: 'c', messages: 'oops' })),
    ).toBeNull()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('drops individual malformed history-message entries but keeps well-formed ones', () => {
    const decoded = decode(
      JSON.stringify({
        v: 1,
        t: 'history',
        id: 'h1',
        sentAt: 1,
        conversationId: 'c',
        messages: [
          { id: 'good', from: 'me', text: 'ok', at: 1 },
          { id: 'badfrom', from: 'other', text: 'x', at: 1 },
          null,
          { id: 'badat', from: 'me', text: 'x', at: '1' },
          { id: 'good2', from: 'them', text: 'ok2', at: 2 },
        ],
      }),
    )
    expect(decoded).not.toBeNull()
    expect(decoded!.t).toBe('history')
    // @ts-expect-error narrowing
    expect(decoded.messages.map((m) => m.id)).toEqual(['good', 'good2'])
  })
})

describe('wire envelope decode safety', () => {
  // FEAT-010 AC#3: malformed payloads (non-JSON, missing required fields,
  // unknown `t`, mismatched `v`) are dropped to null with a console.warn so the
  // receiver never crashes on garbage.

  it('returns null on non-JSON input', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(decode('not-json')).toBeNull()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('returns null on JSON that is not an object', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(decode('42')).toBeNull()
    expect(decode('"hello"')).toBeNull()
    expect(decode('null')).toBeNull()
    expect(decode('[1, 2, 3]')).toBeNull()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('returns null on missing required envelope fields', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(decode(JSON.stringify({ v: 1, t: 'chat' }))).toBeNull() // missing id, sentAt, text
    expect(decode(JSON.stringify({ v: 1, t: 'chat', id: 'a', sentAt: 1 }))).toBeNull() // missing text
    expect(decode(JSON.stringify({ v: 1, t: 'sync-ack', id: 'a', sentAt: 1 }))).toBeNull() // missing replyTo / probeReceivedAt
    expect(decode(JSON.stringify({ v: 1, t: 'receipt', id: 'a', sentAt: 1, replyTo: 'b' }))).toBeNull() // missing messageReceivedAt
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('returns null on unknown envelope `t`', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(decode(JSON.stringify({ v: 1, t: 'nope', id: 'a', sentAt: 1 }))).toBeNull()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('returns null on version mismatch', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(decode(JSON.stringify({ v: 2, t: 'chat', id: 'a', sentAt: 1, text: 'hi' }))).toBeNull()
    expect(decode(JSON.stringify({ v: 0, t: 'chat', id: 'a', sentAt: 1, text: 'hi' }))).toBeNull()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('returns null on wrong field types', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(decode(JSON.stringify({ v: 1, t: 'chat', id: 123, sentAt: 1, text: 'hi' }))).toBeNull()
    expect(decode(JSON.stringify({ v: 1, t: 'chat', id: 'a', sentAt: '1', text: 'hi' }))).toBeNull()
    expect(decode(JSON.stringify({ v: 1, t: 'chat', id: 'a', sentAt: 1, text: 42 }))).toBeNull()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  // IMPRV-036: BUG-006 introduced `sender` as an OPTIONAL field on chat
  // envelopes for legacy-peer interop. The decode guard accepts only
  // string-typed senders and drops anything else to `undefined` while
  // keeping the surrounding envelope. These cases pin that exact shape so
  // a future tightening (e.g. "reject envelopes missing sender") can't
  // sneak past as a hook-level regression.
  it('decodes a chat envelope with sender absent to sender === undefined (BUG-006)', () => {
    const decoded = decode(JSON.stringify({ v: 1, t: 'chat', id: 'a', sentAt: 1, text: 'hi' }))
    expect(decoded).not.toBeNull()
    expect(decoded!.t).toBe('chat')
    expect(decoded!.t === 'chat' && decoded!.sender).toBeUndefined()
  })

  it('decodes a chat envelope with non-string sender to sender === undefined (BUG-006)', () => {
    const decoded = decode(JSON.stringify({ v: 1, t: 'chat', id: 'a', sentAt: 1, text: 'hi', sender: 42 }))
    expect(decoded).not.toBeNull()
    expect(decoded!.t).toBe('chat')
    expect(decoded!.t === 'chat' && decoded!.sender).toBeUndefined()
    // The surrounding envelope is retained — only the offending field is
    // sanitised, the message itself still flows.
    expect(decoded!.t === 'chat' ? decoded!.text : null).toBe('hi')
  })

  it('preserves an empty-string sender as-is (behavior pin, not a fix)', () => {
    // typeof '' === 'string', so the guard at wire.ts:156 lets '' through.
    // This is intentional: the wire layer doesn't decide what's a "useful"
    // sender — the hook layer does. Documenting it here means a later
    // refactor that wants to coerce '' → undefined has to update this case
    // explicitly rather than silently changing behavior.
    const decoded = decode(JSON.stringify({ v: 1, t: 'chat', id: 'a', sentAt: 1, text: 'hi', sender: '' }))
    expect(decoded).not.toBeNull()
    expect(decoded!.t === 'chat' ? decoded!.sender : null).toBe('')
  })
})

describe('wire envelope encode contract', () => {
  it('produces parseable JSON', () => {
    const env: WireEnvelope = {
      v: 1,
      t: 'chat',
      id: 'a',
      sentAt: 1,
      text: 'hi',
    }
    const s = encode(env)
    // Doesn't matter what shape the encoding takes, but it must be a string
    // that JSON.parse accepts.
    expect(typeof s).toBe('string')
    expect(() => JSON.parse(s)).not.toThrow()
  })
})

// IMPRV-034: deriveSync is the canonical NTP-style formula both peers use to
// derive offset + RTT from the FEAT-010 probe/ack/done quad. It's pure
// arithmetic — four number inputs, two number outputs — and was previously
// covered only indirectly through the useChatSession integration tests.
// These cases build each quad from a synthetic baseline + chosen latency +
// chosen offset so the expected outputs are computable by hand.
describe('deriveSync', () => {
  // Quad construction: peer's clock leads local by `offset` ms; one-way
  // latency is `oneWayMs`; the remote side spends `processingMs` between
  // receiving the probe and sending the ack. The resulting timestamps make
  // every test case readable as "given offset X and latency L, expect..."
  function quad(opts: { baseT1: number; oneWayMs: number; offsetMs: number; processingMs?: number }) {
    const processing = opts.processingMs ?? 0
    const t1 = opts.baseT1
    const t2 = t1 + opts.oneWayMs + opts.offsetMs
    const t3 = t2 + processing
    const t4 = t3 - opts.offsetMs + opts.oneWayMs
    return { t1, t2, t3, t4 }
  }

  it('identical clocks, zero latency: offset=0, rtt=elapsed', () => {
    const { t1, t2, t3, t4 } = quad({ baseT1: 1_000_000, oneWayMs: 0, offsetMs: 0, processingMs: 7 })
    const { rtt, offset } = deriveSync(t1, t2, t3, t4)
    expect(offset).toBe(0)
    expect(rtt).toBe(0)
  })

  it('symmetric latency, no clock skew: rtt = 2*one-way, offset = 0', () => {
    const { t1, t2, t3, t4 } = quad({ baseT1: 1_000_000, oneWayMs: 50, offsetMs: 0, processingMs: 5 })
    const { rtt, offset } = deriveSync(t1, t2, t3, t4)
    expect(rtt).toBe(100)
    expect(offset).toBe(0)
  })

  it('peer-ahead: positive offset', () => {
    const { t1, t2, t3, t4 } = quad({ baseT1: 1_000_000, oneWayMs: 100, offsetMs: 50 })
    const { offset } = deriveSync(t1, t2, t3, t4)
    expect(offset).toBe(50)
  })

  it('peer-behind: negative offset', () => {
    const { t1, t2, t3, t4 } = quad({ baseT1: 1_000_000, oneWayMs: 100, offsetMs: -75 })
    const { offset } = deriveSync(t1, t2, t3, t4)
    expect(offset).toBe(-75)
  })

  it('RTT is independent of clock offset (latency-only)', () => {
    const baseT1 = 1_000_000
    const oneWayMs = 80
    const a = deriveSync(
      ...(Object.values(quad({ baseT1, oneWayMs, offsetMs: 0 })) as [number, number, number, number]),
    )
    const b = deriveSync(
      ...(Object.values(quad({ baseT1, oneWayMs, offsetMs: 500 })) as [number, number, number, number]),
    )
    const c = deriveSync(
      ...(Object.values(quad({ baseT1, oneWayMs, offsetMs: -250 })) as [number, number, number, number]),
    )
    expect(a.rtt).toBe(160)
    expect(b.rtt).toBe(160)
    expect(c.rtt).toBe(160)
  })

  it('mirror invariant: swapping (t1↔t2) and (t3↔t4) negates both offset and rtt', () => {
    // The hook flips the offset sign on the answerer side; this is the
    // formula-level identity that makes that mirror correct. Both outputs
    // are antisymmetric under the swap — the answerer applies abs(rtt) (or
    // equivalent) and -offset to recover the physical pair-RTT and the
    // answerer-perspective skew.
    const { t1, t2, t3, t4 } = quad({ baseT1: 1_000_000, oneWayMs: 60, offsetMs: 42, processingMs: 3 })
    const original = deriveSync(t1, t2, t3, t4)
    const mirrored = deriveSync(t2, t1, t4, t3)
    expect(mirrored.offset).toBe(-original.offset)
    expect(mirrored.rtt).toBe(-original.rtt)
  })

  it('matches the useChatSession answerer-fixture inputs (regression anchor)', () => {
    // Same numeric anchors as useChatSession.test.ts:560-580. If this
    // expectation drifts, the hook fixture must drift in lockstep — and
    // either both move or both stay, never just one.
    const { rtt, offset } = deriveSync(1000, 1100, 1110, 1200)
    expect(offset).toBe(5)
    expect(rtt).toBe(190)
  })

  it('propagates NaN without throwing', () => {
    const { rtt, offset } = deriveSync(NaN, 1, 2, 3)
    expect(Number.isNaN(rtt)).toBe(true)
    expect(Number.isNaN(offset)).toBe(true)
  })

  it('propagates Infinity without throwing', () => {
    // rtt = t4 - t1 - (t3 - t2) = 0 - 0 - (0 - ∞) = +∞
    // offset = ((t2 - t1) + (t3 - t4)) / 2 = (∞ + 0) / 2 = +∞
    const { rtt, offset } = deriveSync(0, Number.POSITIVE_INFINITY, 0, 0)
    expect(rtt).toBe(Number.POSITIVE_INFINITY)
    expect(offset).toBe(Number.POSITIVE_INFINITY)
  })
})
