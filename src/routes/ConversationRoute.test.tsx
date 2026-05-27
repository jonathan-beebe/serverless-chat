// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { ConversationRoute } from './ConversationRoute'
import { SessionContext } from '../SessionContext'
import { makeStubSession } from '../test-utils'
import type { ChatSession } from '../hooks/useChatSession'

// BUG-011 / BUG-012: ARCH-001 replaced `goHome` (which called `session.reset()`
// before navigating) with bare `() => navigate('/')` callbacks in
// ConversationRoute. The regression manifests in two ways:
//   - BUG-011: peer A's "End chat" / Cancel / Return home doesn't tear down
//     its own PC, so peer B never sees the channel close.
//   - BUG-012: a second "Start a chat" after a Cancel routes to NotFound
//     because the session is still bound to the canceled id.
// Both fix by restoring `session.reset()` before `navigate('/')` in the three
// `onCancel` sites in ConversationRoute.

const CONV_ID = 'conv-1'

function LocationProbe({ onChange }: { onChange: (path: string) => void }) {
  const location = useLocation()
  onChange(location.pathname)
  return null
}

function renderRoute(session: ChatSession, locationSink?: (path: string) => void) {
  return render(
    <MemoryRouter initialEntries={[`/conversation/${CONV_ID}`]}>
      <SessionContext.Provider value={session}>
        <Routes>
          <Route path="/conversation/:id" element={<ConversationRoute />} />
          <Route path="/" element={<div data-testid="home" />} />
        </Routes>
        {locationSink ? <LocationProbe onChange={locationSink} /> : null}
      </SessionContext.Provider>
    </MemoryRouter>,
  )
}

describe('ConversationRoute onCancel — BUG-011 / BUG-012 regression', () => {
  it('the live-session-bound Offerer Cancel button calls session.reset() before navigating home (BUG-011, BUG-012)', async () => {
    const reset = vi.fn()
    const session = makeStubSession({
      state: 'awaiting-answer',
      conversationId: CONV_ID,
      encodedLocal: 'fake-offer',
      reset,
    })
    let lastPath = `/conversation/${CONV_ID}`
    renderRoute(session, (p) => {
      lastPath = p
    })

    // Invite branch on Offerer renders a "Cancel" button.
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }))

    expect(reset).toHaveBeenCalledTimes(1)
    await waitFor(() => {
      expect(lastPath).toBe('/')
    })
  })

  it('the connected Offerer End chat button calls session.reset() before navigating home (BUG-011)', async () => {
    const reset = vi.fn()
    const session = makeStubSession({
      state: 'connected',
      conversationId: CONV_ID,
      reset,
    })
    let lastPath = `/conversation/${CONV_ID}`
    renderRoute(session, (p) => {
      lastPath = p
    })

    // Connected branch shows "End chat".
    fireEvent.click(screen.getByRole('button', { name: /end chat/i }))

    expect(reset).toHaveBeenCalledTimes(1)
    await waitFor(() => {
      expect(lastPath).toBe('/')
    })
  })

  it('the closed Offerer Return home button calls session.reset() before navigating home (BUG-011)', async () => {
    const reset = vi.fn()
    const session = makeStubSession({
      state: 'closed',
      conversationId: CONV_ID,
      reset,
    })
    let lastPath = `/conversation/${CONV_ID}`
    renderRoute(session, (p) => {
      lastPath = p
    })

    fireEvent.click(screen.getByRole('button', { name: /return home/i }))

    expect(reset).toHaveBeenCalledTimes(1)
    await waitFor(() => {
      expect(lastPath).toBe('/')
    })
  })

  it('the joiner-branch (sticky offer) Decline button calls session.reset() before navigating home (BUG-011)', async () => {
    const reset = vi.fn()
    const session = makeStubSession({ state: 'idle', reset })
    const offerPayload = 'OFFER-PAYLOAD'
    let lastPath = `/conversation/${CONV_ID}#offer=${offerPayload}`
    render(
      <MemoryRouter initialEntries={[{ pathname: `/conversation/${CONV_ID}`, hash: `#offer=${offerPayload}` }]}>
        <SessionContext.Provider value={session}>
          <Routes>
            <Route path="/conversation/:id" element={<ConversationRoute />} />
            <Route path="/" element={<div data-testid="home" />} />
          </Routes>
          <LocationProbe
            onChange={(p) => {
              lastPath = p
            }}
          />
        </SessionContext.Provider>
      </MemoryRouter>,
    )

    // Joiner invite branch renders "Decline" (it's onCancel).
    fireEvent.click(screen.getByRole('button', { name: /decline/i }))

    expect(reset).toHaveBeenCalledTimes(1)
    await waitFor(() => {
      expect(lastPath).toBe('/')
    })
  })
})
