import { useEffect, useState } from 'react'
import { DesignSystem } from './design-system/DesignSystem'
import { Home } from './screens/Home'
import { Offerer } from './screens/Offerer'
import { Joiner } from './screens/Joiner'
import { clearHash, readHashParam } from './core/url'
import { useChatSession } from './hooks/useChatSession'

type Route = { kind: 'home' } | { kind: 'offerer' } | { kind: 'joiner'; offerCode: string } | { kind: 'design-system' }

function routeFromHash(): Route {
  const hash = location.hash.startsWith('#') ? location.hash.slice(1) : location.hash
  if (hash === 'design-system') return { kind: 'design-system' }
  const offer = readHashParam(location.hash, 'offer')
  return offer ? { kind: 'joiner', offerCode: offer } : { kind: 'home' }
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
      if (next.kind === 'joiner' || next.kind === 'design-system' || next.kind === 'home') {
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
      return <Home onStart={() => setRoute({ kind: 'offerer' })} />
    case 'offerer':
      return <Offerer session={session} onCancel={goHome} />
    case 'joiner':
      return <Joiner session={session} offerCode={route.offerCode} onCancel={goHome} />
    case 'design-system':
      return <DesignSystem />
  }
}
