import type { ReactElement, ReactNode } from 'react'
import { render, type RenderOptions, type RenderResult } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { SessionContext } from './SessionContext'
import type { ChatSession } from './hooks/useChatSession'

// ARCH-001: shared test helpers for the post-routing world.
//
// Most component tests now need two layers of context:
//   1. A router — anything that calls useNavigate / renders <Link>.
//   2. A SessionContext — Home (live-badge) and ConversationRoute consume it.
//
// `renderWithProviders` wraps the rendered tree in both. Tests that don't
// care about a specific session state can omit `session`; the default is an
// idle stub. Tests that need a particular path use `route`. Tests that need
// to assert on the rendered route shell (URL changed, redirect, etc.) can
// use `renderRoutes` instead, which mounts a Routes/Route tree under a
// MemoryRouter with the supplied entry.

export function makeStubSession(overrides: Partial<ChatSession> = {}): ChatSession {
  return {
    state: 'idle',
    error: null,
    encodedLocal: null,
    messages: [],
    telemetry: {
      connectedAt: null,
      sync: null,
      samples: [],
      summary: { sampleCount: 0, currentRttMs: null, medianRttMs: null, p95RttMs: null },
    },
    conversationId: null,
    hasResumed: false,
    bindConversation: async () => {},
    startAsOfferer: async () => {},
    startAsAnswerer: async () => {},
    submitAnswer: async () => {},
    politelyAcceptOffer: async () => {},
    send: () => {},
    reset: () => {},
    lastReadMessageId: null,
    markRead: () => {},
    ...overrides,
  }
}

interface ProviderOptions extends Omit<RenderOptions, 'wrapper'> {
  session?: ChatSession
  route?: string
}

export function renderWithProviders(ui: ReactElement, options: ProviderOptions = {}): RenderResult {
  const { session = makeStubSession(), route = '/', ...rest } = options
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[route]}>
      <SessionContext.Provider value={session}>{children}</SessionContext.Provider>
    </MemoryRouter>
  )
  return render(ui, { wrapper: Wrapper, ...rest })
}
