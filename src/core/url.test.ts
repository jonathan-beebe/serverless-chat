import { describe, expect, it } from 'vitest'
import { buildOfferUrl, readHashParam } from './url'

describe('readHashParam', () => {
  it('reads a param from a hash fragment', () => {
    expect(readHashParam('#offer=abc123', 'offer')).toBe('abc123')
  })

  it('handles missing leading #', () => {
    expect(readHashParam('offer=abc123', 'offer')).toBe('abc123')
  })

  it('returns null when key is absent', () => {
    expect(readHashParam('#other=value', 'offer')).toBeNull()
  })

  it('returns null on empty hash', () => {
    expect(readHashParam('', 'offer')).toBeNull()
  })

  it('returns null for empty value', () => {
    expect(readHashParam('#offer=', 'offer')).toBeNull()
  })
})

describe('buildOfferUrl', () => {
  it('joins origin + base + offer payload', () => {
    expect(buildOfferUrl('https://example.com', '/', 'PAYLOAD')).toBe('https://example.com/#offer=PAYLOAD')
  })

  it('normalizes a base path without trailing slash', () => {
    expect(buildOfferUrl('https://example.com', '/p2p', 'X')).toBe('https://example.com/p2p/#offer=X')
  })

  it('keeps a base path with trailing slash', () => {
    expect(buildOfferUrl('https://example.com', '/p2p/', 'X')).toBe('https://example.com/p2p/#offer=X')
  })
})
