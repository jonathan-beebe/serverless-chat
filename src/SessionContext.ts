import { createContext, useContext } from 'react'
import type { ChatSession } from './hooks/useChatSession'

// ARCH-001: a single `useChatSession()` instance lives at the app shell so
// the live PeerConnection survives route changes (e.g. /network ↔
// /conversation/:id). Routes read the session via this context — passing it
// through props would re-introduce the prop-drilling that hash routing was
// already doing.
export const SessionContext = createContext<ChatSession | null>(null)

export function useSession(): ChatSession {
  const session = useContext(SessionContext)
  if (!session) {
    throw new Error('useSession must be used within a SessionContext.Provider')
  }
  return session
}
