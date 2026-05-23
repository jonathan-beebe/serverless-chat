// Hash fragments (`#offer=...`) are never sent to the server, which is exactly
// what we want for signaling payloads — Cloudflare Pages / GitHub Pages will
// never see them in their access logs.

export function readHashParam(hash: string, key: string): string | null {
  const cleaned = hash.startsWith('#') ? hash.slice(1) : hash
  const params = new URLSearchParams(cleaned)
  const value = params.get(key)
  return value && value.length > 0 ? value : null
}

// FEAT-012: invite URLs now optionally carry a `conv=<uuid>` param so the
// receiving peer can mirror the conversation locally. The encoded SDP stays
// in `offer=` exactly as before; the conversation ID is its own param so
// the URL parser doesn't have to decode the SDP to read it.
export function buildOfferUrl(
  origin: string,
  basePath: string,
  encodedOffer: string,
  conversationId?: string | null,
): string {
  const normalizedBase = basePath.endsWith('/') ? basePath : `${basePath}/`
  const suffix = conversationId ? `&conv=${conversationId}` : ''
  return `${origin}${normalizedBase}#offer=${encodedOffer}${suffix}`
}

// Thin imperative shell over `buildOfferUrl`: reads the two ambient inputs
// (browser origin + Vite's configured base path) so view components don't
// have to touch `location` or `import.meta.env` themselves. The pure builder
// stays separately testable.
export function currentOfferUrl(encodedOffer: string, conversationId?: string | null): string {
  return buildOfferUrl(location.origin, import.meta.env.BASE_URL, encodedOffer, conversationId)
}

export function clearHash(): void {
  // Strip the fragment without reloading or pushing a new history entry —
  // we don't want "back" to take the user into a stale signaling state.
  history.replaceState(null, '', `${location.pathname}${location.search}`)
}
