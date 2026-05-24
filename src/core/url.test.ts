// @vitest-environment jsdom
// CR-013: `src/core/**` runs under `node` by default; the `currentOfferUrl`
// suite below exercises the thin wrapper that reads global `location.origin`,
// so this file opts back into jsdom explicitly.
import { describe, expect, it, vi } from 'vitest'
import { buildOfferUrl, currentOfferUrl, readHashParam } from './url'

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

  it('appends a conversationId as &conv= when provided (FEAT-012)', () => {
    expect(buildOfferUrl('https://example.com', '/', 'PAYLOAD', 'uuid-1')).toBe(
      'https://example.com/#offer=PAYLOAD&conv=uuid-1',
    )
  })

  it('omits the conv param when conversationId is null/undefined', () => {
    expect(buildOfferUrl('https://example.com', '/', 'PAYLOAD', null)).toBe('https://example.com/#offer=PAYLOAD')
    expect(buildOfferUrl('https://example.com', '/', 'PAYLOAD')).toBe('https://example.com/#offer=PAYLOAD')
  })
})

describe('readHashParam reads conv alongside offer (FEAT-012)', () => {
  it('returns the conv value from a hash with both offer and conv params', () => {
    expect(readHashParam('#offer=ABC&conv=uuid-1', 'conv')).toBe('uuid-1')
    expect(readHashParam('#offer=ABC&conv=uuid-1', 'offer')).toBe('ABC')
  })

  it('returns null when conv is absent', () => {
    expect(readHashParam('#offer=ABC', 'conv')).toBeNull()
  })
})

describe('currentOfferUrl', () => {
  // This wrapper exists so view components don't have to read `location.origin`
  // or `import.meta.env.BASE_URL` themselves — env access stays inside core/url.
  // jsdom's default `location.origin` is `http://localhost:3000` and Vite's
  // default `BASE_URL` is `'/'`, which together produce the assertion below.
  it('joins the ambient origin + BASE_URL + offer payload', () => {
    expect(currentOfferUrl('PAYLOAD')).toBe('http://localhost:3000/#offer=PAYLOAD')
  })

  it('reads BASE_URL from import.meta.env at call time', () => {
    // Verify the helper doesn't snapshot BASE_URL at import time. We stub
    // import.meta.env via vi.stubEnv so a deploy under a non-root base path
    // (e.g. GitHub Pages project site) produces the correct URL.
    vi.stubEnv('BASE_URL', '/p2p/')
    try {
      expect(currentOfferUrl('X')).toBe('http://localhost:3000/p2p/#offer=X')
    } finally {
      vi.unstubAllEnvs()
    }
  })
})
