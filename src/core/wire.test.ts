import { describe, expect, it, vi } from 'vitest'
import { decode, encode, type WireEnvelope } from './wire'

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
