import { describe, expect, it } from 'vitest'
import { encode } from './encoding'
import { classifyPastedCode, extractOfferCode } from './inviteCode'

// RFCTR-005: focused coverage for the polite-defer helpers that used to
// live inside Offerer.tsx. The full-render Offerer.test.tsx still exercises
// the screen wiring; these cases pin the helpers in isolation so a future
// regression surfaces at the unit boundary.

describe('extractOfferCode', () => {
  it('returns a bare payload unchanged', () => {
    expect(extractOfferCode('ABC123')).toBe('ABC123')
  })

  it('trims surrounding whitespace from a bare payload', () => {
    expect(extractOfferCode('   ABC123\n')).toBe('ABC123')
  })

  it('pulls the encoded payload out of a full invite URL', () => {
    const url = 'https://example.com/conversation/abc#offer=ENCODED-PAYLOAD'
    expect(extractOfferCode(url)).toBe('ENCODED-PAYLOAD')
  })

  it('pulls the encoded payload out of a URL with extra hash params', () => {
    const url = 'https://example.com/conversation/abc#offer=ENCODED-PAYLOAD&other=foo'
    expect(extractOfferCode(url)).toBe('ENCODED-PAYLOAD')
  })

  it('accepts a free-floating offer=… fragment without a URL scheme', () => {
    expect(extractOfferCode('offer=BARE-FRAG')).toBe('BARE-FRAG')
    expect(extractOfferCode('#offer=BARE-FRAG')).toBe('BARE-FRAG')
  })

  it('falls back to the bare input when URL parses but has no offer param', () => {
    // The URL is well-formed but has no #offer= — treat the input itself as
    // the candidate code (the downstream decoder will surface the error).
    expect(extractOfferCode('https://example.com/conversation/abc')).toBe('https://example.com/conversation/abc')
  })

  it('returns the trimmed input when neither URL nor offer= fragment matches', () => {
    expect(extractOfferCode('  not-a-url-and-no-fragment  ')).toBe('not-a-url-and-no-fragment')
  })
})

describe('classifyPastedCode', () => {
  it('returns "answer" for a valid encoded answer SDP', () => {
    const code = encode({ type: 'answer', sdp: 'v=0\no=...\n' })
    expect(classifyPastedCode(code)).toBe('answer')
  })

  it('returns "offer" for a valid encoded offer SDP (FEAT-008 polite-defer trigger)', () => {
    const code = encode({ type: 'offer', sdp: 'v=0\no=...\n' })
    expect(classifyPastedCode(code)).toBe('offer')
  })

  it('returns null and does not throw on undecodable garbage', () => {
    expect(() => classifyPastedCode('not-a-real-encoded-string-!!!')).not.toThrow()
    expect(classifyPastedCode('not-a-real-encoded-string-!!!')).toBeNull()
  })

  it('returns null and does not throw on an empty string', () => {
    expect(() => classifyPastedCode('')).not.toThrow()
    expect(classifyPastedCode('')).toBeNull()
  })

  it('returns null when the decoded payload is not an SDP-shaped object', () => {
    const notSdp = encode({ hello: 'world' })
    expect(classifyPastedCode(notSdp)).toBeNull()
  })

  it('returns null when decoded type is something other than offer/answer', () => {
    const weird = encode({ type: 'pranswer' })
    expect(classifyPastedCode(weird)).toBeNull()
  })

  it('returns null when decoded payload is null', () => {
    const nullPayload = encode(null)
    expect(classifyPastedCode(nullPayload)).toBeNull()
  })
})
