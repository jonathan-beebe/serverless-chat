import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { Home } from './Home'
import { ScreenChromeContext, type ScreenChromeValue } from '../components/ScreenChrome'
import { __resetForTests as resetStorage, appendMessage, upsertConversation } from '../core/storage'
import { SessionContext } from '../SessionContext'
import { makeStubSession, renderWithProviders } from '../test-utils'

const SHOWCASE_CHROME: ScreenChromeValue = {
  landmark: 'region',
  headingLevelOffset: 1,
  suppressInitialFocus: true,
}

beforeEach(() => {
  // FEAT-012: fresh in-memory IDB so persistence side effects don't leak.
  // (`fake-indexeddb` declares the factory globals as writable.)
  ;(globalThis as { indexedDB: IDBFactory }).indexedDB = new IDBFactory()
  resetStorage()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Home focus-on-mount (A11Y-005 + A11Y-022)', () => {
  it('focuses the "Start a chat" button on mount under the default ScreenChrome context', async () => {
    renderWithProviders(<Home />)
    const startButton = screen.getByRole('button', { name: /start a chat/i })

    await waitFor(() => {
      expect(document.activeElement).toBe(startButton)
    })
  })

  it('does NOT focus the "Start a chat" button when rendered inside a showcase context with suppressInitialFocus: true (A11Y-022)', async () => {
    // ARCH-001: the showcase mounts Home below MemoryRouter + SessionContext
    // just like every other call site; the ScreenChrome wrapping rides on
    // top of that.
    render(
      <MemoryRouter>
        <SessionContext.Provider value={makeStubSession()}>
          <ScreenChromeContext.Provider value={SHOWCASE_CHROME}>
            <Home />
          </ScreenChromeContext.Provider>
        </SessionContext.Provider>
      </MemoryRouter>,
    )
    const startButton = screen.getByRole('button', { name: /start a chat/i })

    await waitFor(() => {
      expect(startButton).toBeInTheDocument()
    })

    expect(document.activeElement).not.toBe(startButton)
    expect(document.activeElement?.closest('[role="region"]')).toBeNull()
  })
})

describe('Home empty state (FEAT-012 AC#19)', () => {
  // AC#19: the marketing copy on Home drops the "no history" phrase since
  // history is now an opt-in-by-default local feature. The "no chat server,
  // no accounts" promise stays — that's the actual privacy stance.
  it('renders without the legacy "no history" copy', () => {
    renderWithProviders(<Home />)
    // The exact replacement wording is subject to PR-time bikeshedding, but
    // the AC is unambiguous about the word that must be gone.
    expect(screen.queryByText(/no history/i)).not.toBeInTheDocument()
    expect(screen.getByText(/no chat server, no accounts/i)).toBeInTheDocument()
  })

  it('renders no past-chats section when storage is empty', async () => {
    renderWithProviders(<Home />)
    // Wait for the async listConversations() to resolve and the hook to
    // commit the (empty) list. After A11Y-032 the section no longer carries
    // `aria-label="Past conversations"` (it didn't earn a landmark slot),
    // so the heading is the canonical anchor for "section is rendered."
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: /past chats/i })).not.toBeInTheDocument()
    })
  })

  // A11Y-032: the surrounding <section> previously claimed
  // aria-label="Past conversations" while the visible <h2> read "Past chats".
  // Two names disagreeing is a 2.5.3 / 1.3.1 mismatch and the section did
  // not earn a landmark slot — the heading is the canonical entry point.
  it('past-chats section is not a region landmark; the h2 is the entry point (A11Y-032)', async () => {
    await upsertConversation({
      id: 'aaa',
      createdAt: Date.now() - 60_000,
      lastActivityAt: Date.now() - 60_000,
      label: 'Lunch chat',
    })
    await appendMessage('aaa', { id: 'm-aaa', from: 'me', text: 'hi', at: Date.now() - 60_000 })
    renderWithProviders(<Home />)

    // The h2 "Past chats" is present and SR-navigable via heading shortcut.
    expect(await screen.findByRole('heading', { name: /^past chats$/i })).toBeInTheDocument()
    // The wrapping <section> must NOT be exposed as a region landmark.
    expect(screen.queryByRole('region', { name: /past conversations/i })).not.toBeInTheDocument()
  })
})

describe('Home culls empty conversations on mount (CR-011)', () => {
  it('does not render rows for conversations with zero messages (polite-defer reproducer)', async () => {
    // `inviter` has a message; `abandoned` is a polite-defer leftover stub.
    await upsertConversation({
      id: 'inviter',
      createdAt: Date.now() - 60_000,
      lastActivityAt: Date.now() - 60_000,
      label: 'Real chat',
    })
    await appendMessage('inviter', { id: 'm1', from: 'me', text: 'hello', at: Date.now() - 10_000 })
    await upsertConversation({
      id: 'abandoned',
      createdAt: Date.now() - 50_000,
      lastActivityAt: Date.now() - 50_000,
      label: 'Polite-defer leftover',
    })

    renderWithProviders(<Home />)

    // The kept row appears; the abandoned stub never does.
    await screen.findByTestId('conversation-row-inviter')
    expect(screen.queryByTestId('conversation-row-abandoned')).not.toBeInTheDocument()
  })
})

describe('Home "Start a chat" (FEAT-012 AC#25 / ARCH-001)', () => {
  it('pre-binds the session to a fresh UUID and navigates to /conversation/<id>', async () => {
    // ARCH-001: Home no longer routes via an `onStart` prop — it owns both
    // sides of the transition: bind the session to a freshly-minted conv id
    // (so ConversationRoute doesn't see "unknown id, render NotFound") and
    // then navigate to the canonical URL. We assert both halves: the spy on
    // the session captures the bind; the rendered location captures the nav.
    const startAsOfferer = vi.fn().mockResolvedValue(undefined)
    const session = makeStubSession({ startAsOfferer })

    // Render Home alongside a tiny "current URL" probe so we can observe the
    // navigation without depending on jsdom's address bar.
    function LocationProbe() {
      const loc = useLocation()
      return <div data-testid="location-pathname">{loc.pathname}</div>
    }
    renderWithProviders(
      <>
        <Home />
        <LocationProbe />
      </>,
      { session },
    )

    fireEvent.click(screen.getByRole('button', { name: /start a chat/i }))

    expect(startAsOfferer).toHaveBeenCalledTimes(1)
    const newId = startAsOfferer.mock.calls[0][0]
    expect(typeof newId).toBe('string')
    expect(newId.length).toBeGreaterThan(0)

    await waitFor(() => {
      expect(screen.getByTestId('location-pathname')).toHaveTextContent(`/conversation/${newId}`)
    })
  })
})

describe('Home build-version indicator (IMPRV-018)', () => {
  // vitest.config.ts:8 defines __COMMIT_HASH__ as the literal 'test' so the
  // build-time string-replace has a stable value under the test runner.
  it('renders the short commit hash as muted text at the bottom of the screen', () => {
    renderWithProviders(<Home />)
    expect(screen.getByText('test')).toBeInTheDocument()
  })
})
