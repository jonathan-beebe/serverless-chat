import { useEffect, useState } from 'react'
import { Home } from './screens/Home'
import { Offerer } from './screens/Offerer'
import { Joiner } from './screens/Joiner'
import { clearHash, readHashParam } from './core/url'
import { useChatSession } from './hooks/useChatSession'

type Route = { kind: 'home' } | { kind: 'offerer' } | { kind: 'joiner'; offerCode: string }

function routeFromHash(): Route {
  const offer = readHashParam(location.hash, 'offer')
  return offer ? { kind: 'joiner', offerCode: offer } : { kind: 'home' }
}

export function App() {
  const [route, setRoute] = useState<Route>(() => routeFromHash())
  const session = useChatSession()

  // The hash is meaningful on first paint (it routes us into joiner mode),
  // but stale after that — once we've handed it to the session, scrub it so
  // a refresh doesn't re-enter the joiner flow with a dead offer.
  useEffect(() => {
    if (route.kind === 'joiner') clearHash()
  }, [route.kind])

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
  }
}
