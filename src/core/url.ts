// Hash fragments (`#offer=...`) are never sent to the server, which is exactly
// what we want for signaling payloads — Cloudflare Pages / GitHub Pages will
// never see them in their access logs.

export function readHashParam(hash: string, key: string): string | null {
  const cleaned = hash.startsWith('#') ? hash.slice(1) : hash
  const params = new URLSearchParams(cleaned)
  const value = params.get(key)
  return value && value.length > 0 ? value : null
}

export function buildOfferUrl(origin: string, basePath: string, encodedOffer: string): string {
  const normalizedBase = basePath.endsWith('/') ? basePath : `${basePath}/`
  return `${origin}${normalizedBase}#offer=${encodedOffer}`
}

// Thin imperative shell over `buildOfferUrl`: reads the two ambient inputs
// (browser origin + Vite's configured base path) so view components don't
// have to touch `location` or `import.meta.env` themselves. The pure builder
// stays separately testable.
export function currentOfferUrl(encodedOffer: string): string {
  return buildOfferUrl(location.origin, import.meta.env.BASE_URL, encodedOffer)
}

export function clearHash(): void {
  // Strip the fragment without reloading or pushing a new history entry —
  // we don't want "back" to take the user into a stale signaling state.
  history.replaceState(null, '', `${location.pathname}${location.search}`)
}
