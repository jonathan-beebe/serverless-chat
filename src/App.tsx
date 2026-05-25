import { BrowserRouter, Outlet, Route, Routes } from 'react-router-dom'
import { DesignSystem } from './design-system/DesignSystem'
import { DesignSystemChat } from './design-system/DesignSystemChat'
import { Home } from './screens/Home'
import { NotFound } from './screens/NotFound'
import { Network } from './network/Network'
import { ConversationRoute } from './routes/ConversationRoute'
import { SessionContext, useSession } from './SessionContext'
import { useChatSession } from './hooks/useChatSession'

// ARCH-001: the chat session lives one layer above the routes so a
// `useChatSession()` instance survives navigation between /conversation/:id,
// /network, and /. The previous hash-router model owned routing in App and
// passed the session as props; the BrowserRouter does the routing, and
// SessionContext makes the session reachable from any nested route.
function AppShell() {
  const session = useChatSession()
  return (
    <SessionContext.Provider value={session}>
      <Outlet />
    </SessionContext.Provider>
  )
}

// Thin wrapper so /network reads the session from context the same way the
// other routes do, instead of being passed the session as a prop.
function NetworkRoute() {
  const session = useSession()
  return <Network session={session} />
}

// Exported separately from `App` so tests can mount the routes under a
// MemoryRouter (initial-entry control, no real history mutation) while
// production wraps them in BrowserRouter.
export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<Home />} />
        <Route path="/conversation/:id" element={<ConversationRoute />} />
        <Route path="/design-system" element={<DesignSystem />} />
        <Route path="/design-system/chat" element={<DesignSystemChat />} />
        <Route path="/network" element={<NetworkRoute />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}

export function App() {
  // Vite's BASE_URL becomes react-router's basename so deploys under a
  // sub-path (e.g. GitHub Pages project sites) keep working. The leading
  // slash is preserved; react-router strips any trailing slash internally.
  const basename = (import.meta.env.BASE_URL || '/').replace(/\/$/, '') || '/'
  return (
    <BrowserRouter basename={basename}>
      <AppRoutes />
    </BrowserRouter>
  )
}
