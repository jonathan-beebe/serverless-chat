import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Offerer } from './Offerer'
import type { ChatSession } from '../hooks/useChatSession'
import type { ConnectionState } from '../core/rtc'

// Build a minimal ChatSession stub the screen can consume. Each test seeds
// the state machine to whatever transition we're exercising; the imperative
// methods are spy-able no-ops since the hook itself has dedicated tests.
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

describe('Offerer reply-code Enter-submit (FEAT-003)', () => {
  // The Connect form renders once `encodedLocal` is non-null AND the screen
  // hasn't routed into the connected/closed branches — `awaiting-answer` is
  // the natural state for "we have an offer, waiting on the joiner".
  function renderWithReplyForm(overrides: Partial<ChatSession> = {}) {
    const session = makeSession({
      state: 'awaiting-answer',
      encodedLocal: 'OFFER-PAYLOAD',
      ...overrides,
    })
    render(<Offerer session={session} onCancel={() => {}} />)
    return session
  }

  function getTextarea(): HTMLTextAreaElement {
    return screen.getByRole('textbox', { name: /paste their reply code/i }) as HTMLTextAreaElement
  }

  it('submits the form when Enter is pressed with a non-empty draft', () => {
    const session = renderWithReplyForm()
    const textarea = getTextarea()
    fireEvent.change(textarea, { target: { value: 'reply-code' } })

    fireEvent.keyDown(textarea, { key: 'Enter' })

    expect(session.submitAnswer).toHaveBeenCalledWith('reply-code')
  })

  it('does NOT submit when Shift+Enter is pressed (newline-insert path)', () => {
    const session = renderWithReplyForm()
    const textarea = getTextarea()
    fireEvent.change(textarea, { target: { value: 'reply-code' } })

    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true })

    expect(session.submitAnswer).not.toHaveBeenCalled()
  })

  it('does NOT submit when the draft is empty or whitespace-only', () => {
    const session = renderWithReplyForm()
    const textarea = getTextarea()
    fireEvent.change(textarea, { target: { value: '   \n  ' } })

    fireEvent.keyDown(textarea, { key: 'Enter' })

    expect(session.submitAnswer).not.toHaveBeenCalled()
  })

  it('does NOT submit while state === "connecting" (prevents double-submit)', () => {
    const session = renderWithReplyForm({ state: 'connecting' })
    const textarea = getTextarea()
    fireEvent.change(textarea, { target: { value: 'reply-code' } })

    fireEvent.keyDown(textarea, { key: 'Enter' })

    expect(session.submitAnswer).not.toHaveBeenCalled()
  })

  it('does NOT submit while the IME is composing (e.g. CJK input)', () => {
    const session = renderWithReplyForm()
    const textarea = getTextarea()
    fireEvent.change(textarea, { target: { value: 'reply-code' } })

    // React surfaces `nativeEvent.isComposing` via the underlying KeyboardEvent.
    fireEvent.keyDown(textarea, { key: 'Enter', isComposing: true })

    expect(session.submitAnswer).not.toHaveBeenCalled()
  })

  it('still submits when the Connect button is clicked (regression guard)', () => {
    const session = renderWithReplyForm()
    const textarea = getTextarea()
    fireEvent.change(textarea, { target: { value: 'reply-code' } })

    fireEvent.click(screen.getByRole('button', { name: /^connect$/i }))

    expect(session.submitAnswer).toHaveBeenCalledWith('reply-code')
  })
})

describe('Offerer post-connect drop (BUG-005)', () => {
  it('renders a "Connection lost" view when state === "closed"', () => {
    // Encode any opaque payload — the closed view must NOT show this.
    const staleEncoded = 'STALE-ENCODED-OFFER-PAYLOAD'
    const session = makeSession({ state: 'closed', encodedLocal: staleEncoded })

    render(<Offerer session={session} onCancel={() => {}} />)

    // Dedicated post-mortem heading + copy.
    expect(screen.getByRole('heading', { name: /connection lost/i })).toBeInTheDocument()

    // The setup-time CTAs / inputs must be gone.
    expect(screen.queryByRole('textbox', { name: /paste their reply code/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^connect$/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/try a different network/i)).not.toBeInTheDocument()
    // And no stale invite payload should leak into the DOM.
    expect(screen.queryByText(new RegExp(staleEncoded))).not.toBeInTheDocument()
  })

  it('"Start a new chat" button calls onCancel (which resets the session and routes home)', () => {
    const onCancel = vi.fn()
    const session = makeSession({ state: 'closed', encodedLocal: 'STALE' })

    render(<Offerer session={session} onCancel={onCancel} />)

    fireEvent.click(screen.getByRole('button', { name: /start a new chat/i }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('keeps the setup-failure copy for state === "failed" (pre-connect)', () => {
    // Regression guard: BUG-002's `'failed'` path must still render the
    // "Try a different network" amber message — only post-connect drops
    // route to the new closed view.
    const session = makeSession({ state: 'failed', encodedLocal: 'STALE' })
    render(<Offerer session={session} onCancel={() => {}} />)

    expect(screen.getByText(/try a different network/i)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /connection lost/i })).not.toBeInTheDocument()
  })
})
