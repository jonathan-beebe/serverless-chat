// ARCH-001: invite URLs are now path-based. The conversation id lives in the
// path (`/conversation/<id>`) and the encoded SDP stays in the fragment
// (`#offer=<encoded>`). Fragments still never reach the static host, so the
// privacy property the README calls out is preserved — the path identifies
// the conversation; the SDP that bootstraps it stays client-side.

export function readHashParam(hash: string, key: string): string | null {
  const cleaned = hash.startsWith('#') ? hash.slice(1) : hash
  const params = new URLSearchParams(cleaned)
  const value = params.get(key)
  return value && value.length > 0 ? value : null
}

export function buildOfferUrl(origin: string, basePath: string, encodedOffer: string, conversationId: string): string {
  const normalizedBase = basePath.endsWith('/') ? basePath : `${basePath}/`
  return `${origin}${normalizedBase}conversation/${conversationId}#offer=${encodedOffer}`
}

// Thin imperative shell over `buildOfferUrl`: reads the two ambient inputs
// (browser origin + Vite's configured base path) so view components don't
// have to touch `location` or `import.meta.env` themselves. The pure builder
// stays separately testable.
export function currentOfferUrl(encodedOffer: string, conversationId: string): string {
  return buildOfferUrl(location.origin, import.meta.env.BASE_URL, encodedOffer, conversationId)
}

export function clearHash(): void {
  // Strip the fragment without reloading or pushing a new history entry —
  // we don't want "back" to take the user into a stale signaling state.
  history.replaceState(null, '', `${location.pathname}${location.search}`)
}
