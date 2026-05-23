import { useEffect, useState } from 'react'
import { DesignSystem } from './design-system/DesignSystem'
import { Home } from './screens/Home'
import { Offerer } from './screens/Offerer'
import { Joiner } from './screens/Joiner'
import { Network } from './network/Network'
import { clearHash, readHashParam } from './core/url'
import { useChatSession } from './hooks/useChatSession'

type Route =
  | { kind: 'home' }
  // FEAT-012: the Offerer route now carries the conversation id Home
  // generated (new chat) or selected (Resume). Stable across the screen's
  // lifetime — Home re-mounts on each navigation, so a new UUID would
  // otherwise be allocated every render.
  | { kind: 'offerer'; conversationId: string }
  | { kind: 'joiner'; offerCode: string; conversationId: string | null }
  | { kind: 'design-system' }
  | { kind: 'network' }

function routeFromHash(): Route {
  const hash = location.hash.startsWith('#') ? location.hash.slice(1) : location.hash
  if (hash === 'design-system') return { kind: 'design-system' }
  if (hash === 'network') return { kind: 'network' }
  const offer = readHashParam(location.hash, 'offer')
  if (offer) {
    // FEAT-012: the conv param may or may not be present (back-compat for
    // pre-FEAT-012 invites). Joiner generates a fresh id if it's missing.
    const conv = readHashParam(location.hash, 'conv')
    return { kind: 'joiner', offerCode: offer, conversationId: conv }
  }
  return { kind: 'home' }
}

export function App() {
  const [route, setRoute] = useState<Route>(() => routeFromHash())
  const session = useChatSession()

  // If Bob already had the app open and the OS opens the invite URL into the
  // same tab, only the hash changes — no reload. Without this listener we'd
  // sit on the Home screen and never route into Joiner. Same need applies to
  // the #design-system entrypoint and to clearing the hash back to home.
  useEffect(() => {
    const onHashChange = () => {
      const next = routeFromHash()
      if (next.kind === 'joiner' || next.kind === 'design-system' || next.kind === 'network' || next.kind === 'home') {
        setRoute(next)
      }
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  // Scrub the fragment once we've captured the offer in component state, so a
  // refresh doesn't try to re-enter the joiner flow with a now-stale offer.
  // Depend on `route` (not just `route.kind`) so a same-tab joiner→joiner
  // hashchange — which keeps `kind` constant but swaps `offerCode` — still
  // re-runs the scrub. The design-system branch is intentionally bookmark-able,
  // so the guard short-circuits on any non-joiner route.
  useEffect(() => {
    if (route.kind === 'joiner') clearHash()
  }, [route])

  const goHome = () => {
    session.reset()
    setRoute({ kind: 'home' })
  }

  switch (route.kind) {
    case 'home':
      // Home owns conversation-ID generation: new chats get a fresh UUID,
      // resumed chats reuse the row's existing id. Either way we forward
      // into the Offerer route.
      return <Home onStart={(conversationId) => setRoute({ kind: 'offerer', conversationId })} />
    case 'offerer':
      return <Offerer session={session} conversationId={route.conversationId} onCancel={goHome} />
    case 'joiner':
      return (
        <Joiner session={session} offerCode={route.offerCode} conversationId={route.conversationId} onCancel={goHome} />
      )
    case 'design-system':
      return <DesignSystem />
    case 'network':
      return <Network session={session} />
  }
}
