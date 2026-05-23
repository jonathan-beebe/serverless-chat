import LZString from 'lz-string'

// SDP blobs are 2-4 KB of text. Compressing first then base64url-encoding
// keeps them small enough to paste into a URL fragment without exceeding
// browser/IM limits. URI-component encoding here is reversible and safe
// to embed in `location.hash`.

export function encode(value: unknown): string {
  return LZString.compressToEncodedURIComponent(JSON.stringify(value))
}

export function decode<T>(payload: string): T {
  const json = LZString.decompressFromEncodedURIComponent(payload.trim())
  if (json === null || json === '') {
    throw new Error('Could not decode payload — string is empty or malformed.')
  }
  return JSON.parse(json) as T
}
