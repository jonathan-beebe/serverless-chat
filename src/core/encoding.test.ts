import { describe, expect, it } from 'vitest'
import { decode, encode } from './encoding'

describe('encoding', () => {
  it('round-trips a simple object', () => {
    const original = { type: 'offer', sdp: 'v=0\r\no=- 123 IN IP4 0.0.0.0\r\n' }
    const encoded = encode(original)
    expect(decode(encoded)).toEqual(original)
  })

  it('compresses long repeating strings', () => {
    const fat = { sdp: 'a=ice-options:trickle\n'.repeat(50) }
    const encoded = encode(fat)
    // The raw JSON is ~1.1KB; compressed/base64url should be substantially smaller.
    expect(encoded.length).toBeLessThan(JSON.stringify(fat).length / 2)
  })

  it('produces URL-safe characters only', () => {
    const encoded = encode({ hello: 'world & friends?' })
    expect(encoded).toMatch(/^[A-Za-z0-9_\-+$*()!.~']*$/)
  })

  it('throws on garbage input', () => {
    expect(() => decode('not-real-lz-string-data!!!@@@')).toThrow()
  })

  it('throws on empty input', () => {
    expect(() => decode('')).toThrow()
  })
})
