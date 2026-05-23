import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Joiner } from './Joiner'
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
    send: vi.fn(),
    reset: vi.fn(),
    ...overrides,
  }
}

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
