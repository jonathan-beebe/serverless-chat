import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Joiner } from './Joiner'
import { ScreenChromeContext, type ScreenChromeValue } from '../components/ScreenChrome'
import type { ChatSession } from '../hooks/useChatSession'
import type { ConnectionState } from '../core/rtc'

// Mirror of the Offerer stub — see Offerer.test.tsx for rationale.
function makeSession(overrides: Partial<ChatSession> = {}): ChatSession {
  return {
    state: 'idle' as ConnectionState,
    error: null,
    encodedLocal: null,
    messages: [],
    startAsOfferer: vi.fn().mockResolvedValue(undefined),
    startAsAnswerer: vi.fn().mockResolvedValue(undefined),
    submitAnswer: vi.fn().mockResolvedValue(undefined),
    politelyAcceptOffer: vi.fn().mockResolvedValue(undefined),
    send: vi.fn(),
    reset: vi.fn(),
    ...overrides,
  }
}

describe('Joiner focus-on-mount (A11Y-005 + A11Y-022)', () => {
  const SHOWCASE_CHROME: ScreenChromeValue = {
    landmark: 'region',
    headingLevelOffset: 1,
    suppressInitialFocus: true,
  }

  it('focuses the Accept button on the invite branch (primary action)', async () => {
    const session = makeSession({ state: 'idle' })
    render(<Joiner session={session} offerCode="OFFER" onCancel={() => {}} />)
    const accept = screen.getByRole('button', { name: /^accept$/i })

    await waitFor(() => {
      expect(document.activeElement).toBe(accept)
    })
  })

  it('focuses the CopyBox Copy button on the reply branch (primary action)', async () => {
    // `awaiting-answer` + `encodedLocal` mimics the post-accept state where the
    // session has produced the reply code. Joiner gates the reply view on the
    // local `accepted` flag, so render directly into the post-accept shape by
    // clicking Accept first.
    const session = makeSession({ state: 'awaiting-answer', encodedLocal: 'REPLY-CODE' })
    render(<Joiner session={session} offerCode="OFFER" onCancel={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /^accept$/i }))

    const copyButton = await screen.findByRole('button', { name: /^copy$/i })
    await waitFor(() => {
      expect(document.activeElement).toBe(copyButton)
    })
  })

  it('focuses the "Start a new chat" button on the closed branch', async () => {
    const session = makeSession({ state: 'closed' })
    render(<Joiner session={session} offerCode="OFFER" onCancel={() => {}} />)
    const restart = screen.getByRole('button', { name: /start a new chat/i })

    await waitFor(() => {
      expect(document.activeElement).toBe(restart)
    })
  })

  it('does NOT focus any element inside a showcase context with suppressInitialFocus: true (A11Y-022)', async () => {
    const session = makeSession({ state: 'idle' })
    render(
      <ScreenChromeContext.Provider value={SHOWCASE_CHROME}>
        <Joiner session={session} offerCode="OFFER" onCancel={() => {}} />
      </ScreenChromeContext.Provider>,
    )
    const accept = screen.getByRole('button', { name: /^accept$/i })

    await waitFor(() => {
      expect(accept).toBeInTheDocument()
    })

    expect(document.activeElement).not.toBe(accept)
    expect(document.activeElement?.closest('[role="region"]')).toBeNull()
  })
})

describe('Joiner post-connect drop (BUG-005)', () => {
  it('renders a "Connection lost" view when state === "closed"', () => {
    const staleReply = 'STALE-ENCODED-ANSWER-PAYLOAD'
    const session = makeSession({ state: 'closed', encodedLocal: staleReply })

    render(<Joiner session={session} offerCode="ignored" onCancel={() => {}} />)

    expect(screen.getByRole('heading', { name: /connection lost/i })).toBeInTheDocument()

    // No stale CopyBox / setup CTAs.
    expect(screen.queryByRole('heading', { name: /send this code back/i })).not.toBeInTheDocument()
    expect(screen.queryByText(new RegExp(staleReply))).not.toBeInTheDocument()
    expect(screen.queryByText(/try a different network/i)).not.toBeInTheDocument()
  })

  it('"Start a new chat" button calls onCancel', () => {
    const onCancel = vi.fn()
    const session = makeSession({ state: 'closed', encodedLocal: 'STALE' })

    render(<Joiner session={session} offerCode="ignored" onCancel={onCancel} />)

    fireEvent.click(screen.getByRole('button', { name: /start a new chat/i }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})
