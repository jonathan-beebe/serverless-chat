import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Offerer } from './Offerer'
import { ScreenChromeContext, type ScreenChromeValue } from '../components/ScreenChrome'
import { encode } from '../core/encoding'
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
    telemetry: {
      connectedAt: null,
      sync: null,
      samples: [],
      summary: { sampleCount: 0, currentRttMs: null, medianRttMs: null, p95RttMs: null },
    },
    startAsOfferer: vi.fn().mockResolvedValue(undefined),
    startAsAnswerer: vi.fn().mockResolvedValue(undefined),
    submitAnswer: vi.fn().mockResolvedValue(undefined),
    politelyAcceptOffer: vi.fn().mockResolvedValue(undefined),
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

describe('Offerer focus-on-mount (A11Y-005 + A11Y-022)', () => {
  const SHOWCASE_CHROME: ScreenChromeValue = {
    landmark: 'region',
    headingLevelOffset: 1,
    suppressInitialFocus: true,
  }

  it('focuses the CopyBox Copy button on the invite branch (primary action)', async () => {
    const session = makeSession({ state: 'awaiting-answer', encodedLocal: 'OFFER-PAYLOAD' })
    render(<Offerer session={session} onCancel={() => {}} />)
    const copyButton = screen.getByRole('button', { name: /^copy$/i })

    await waitFor(() => {
      expect(document.activeElement).toBe(copyButton)
    })
  })

  it('focuses the "Start a new chat" button on the closed branch', async () => {
    const session = makeSession({ state: 'closed', encodedLocal: 'STALE' })
    render(<Offerer session={session} onCancel={() => {}} />)
    const restart = screen.getByRole('button', { name: /start a new chat/i })

    await waitFor(() => {
      expect(document.activeElement).toBe(restart)
    })
  })

  it('does NOT focus any element inside a showcase context with suppressInitialFocus: true (A11Y-022)', async () => {
    const session = makeSession({ state: 'awaiting-answer', encodedLocal: 'OFFER-PAYLOAD' })
    render(
      <ScreenChromeContext.Provider value={SHOWCASE_CHROME}>
        <Offerer session={session} onCancel={() => {}} />
      </ScreenChromeContext.Provider>,
    )
    const copyButton = screen.getByRole('button', { name: /^copy$/i })

    await waitFor(() => {
      expect(copyButton).toBeInTheDocument()
    })

    expect(document.activeElement).not.toBe(copyButton)
    expect(document.activeElement?.closest('[role="region"]')).toBeNull()
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

describe('Offerer polite-peer defer (FEAT-008)', () => {
  // The Offerer screen is in `awaiting-answer` with a generated offer. When
  // the user pastes another *offer* into the reply box (because both peers
  // pressed "Start a new chat"), the screen detects the SDP type and routes
  // through the hook's `politelyAcceptOffer` instead of `submitAnswer`.

  function renderInAwaitingAnswer(overrides: Partial<ChatSession> = {}) {
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

  it('routes an answer-SDP paste to submitAnswer (regression guard)', () => {
    const session = renderInAwaitingAnswer()
    const answerCode = encode({ type: 'answer', sdp: 'v=0\r\n' })

    fireEvent.change(getTextarea(), { target: { value: answerCode } })
    fireEvent.click(screen.getByRole('button', { name: /^connect$/i }))

    expect(session.submitAnswer).toHaveBeenCalledWith(answerCode)
    expect(session.politelyAcceptOffer).not.toHaveBeenCalled()
  })

  it('routes an offer-SDP paste to politelyAcceptOffer with the bare code', () => {
    const session = renderInAwaitingAnswer()
    const offerCode = encode({ type: 'offer', sdp: 'v=0\r\n' })

    fireEvent.change(getTextarea(), { target: { value: offerCode } })
    fireEvent.click(screen.getByRole('button', { name: /^connect$/i }))

    expect(session.politelyAcceptOffer).toHaveBeenCalledWith(offerCode)
    expect(session.submitAnswer).not.toHaveBeenCalled()
  })

  it('extracts the offer param when the user pastes a full invite URL', () => {
    // AC #7: pasting `https://…/#offer=<code>` should be equivalent to
    // pasting the bare code. Whitespace must also be trimmed.
    const session = renderInAwaitingAnswer()
    const offerCode = encode({ type: 'offer', sdp: 'v=0\r\n' })
    const url = `  https://chat.example.com/#offer=${offerCode}  `

    fireEvent.change(getTextarea(), { target: { value: url } })
    fireEvent.click(screen.getByRole('button', { name: /^connect$/i }))

    expect(session.politelyAcceptOffer).toHaveBeenCalledWith(offerCode)
  })

  it('also routes an offer-SDP submission via Enter to politelyAcceptOffer', () => {
    // FEAT-003 coordination: the Enter keyboard path must take the polite-defer
    // branch too — no way to bypass detection by pressing Enter.
    const session = renderInAwaitingAnswer()
    const offerCode = encode({ type: 'offer', sdp: 'v=0\r\n' })

    fireEvent.change(getTextarea(), { target: { value: offerCode } })
    fireEvent.keyDown(getTextarea(), { key: 'Enter' })

    expect(session.politelyAcceptOffer).toHaveBeenCalledWith(offerCode)
  })

  it('surfaces malformed input via the existing error Callout path (no special handling)', () => {
    // AC #1: decoding errors land in the existing error path. The simplest
    // safe behavior here is to delegate to submitAnswer, which already
    // produces a user-facing error via the hook for unrecognised payloads.
    const session = renderInAwaitingAnswer()

    fireEvent.change(getTextarea(), { target: { value: 'not-a-real-code' } })
    fireEvent.click(screen.getByRole('button', { name: /^connect$/i }))

    // Whichever path it takes, it must NOT silently swallow the input — at
    // least one of submitAnswer / politelyAcceptOffer is invoked so the hook
    // can surface the decode error.
    expect(
      (session.submitAnswer as ReturnType<typeof vi.fn>).mock.calls.length +
        (session.politelyAcceptOffer as ReturnType<typeof vi.fn>).mock.calls.length,
    ).toBeGreaterThanOrEqual(1)
  })

  it('renders the "Send this code back" reply view after polite-defer', () => {
    // AC #3: post-defer the screen mirrors the Joiner reply-code view. We
    // simulate the post-defer state by mounting in `awaiting-answer` (the
    // hook moves through `connecting → awaiting-answer` for the answerer's
    // own offer/answer exchange; here we just verify the screen reacts to a
    // user-driven polite-defer by swapping into the reply branch).
    const offerCode = encode({ type: 'offer', sdp: 'v=0\r\n' })
    // Pre-load the session with the offer payload so submitting paints the
    // form, then the user pastes another offer.
    const session = makeSession({ state: 'awaiting-answer', encodedLocal: 'OFFER-PAYLOAD' })
    render(<Offerer session={session} onCancel={() => {}} />)

    fireEvent.change(screen.getByRole('textbox', { name: /paste their reply code/i }), { target: { value: offerCode } })
    fireEvent.click(screen.getByRole('button', { name: /^connect$/i }))

    // After polite-defer, the screen presents a reply-code view (same heading
    // shape as the Joiner reply branch). The previous "Invite your friend"
    // heading must be gone.
    expect(screen.getByRole('heading', { name: /send this code back/i })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /invite your friend/i })).not.toBeInTheDocument()
  })

  it('shows the polite-defer info Callout above the reply CopyBox', () => {
    // Open question recommendation: a single info Callout explains why the
    // screen changed for sighted users, mirroring the live-region message.
    const offerCode = encode({ type: 'offer', sdp: 'v=0\r\n' })
    const session = makeSession({ state: 'awaiting-answer', encodedLocal: 'OFFER-PAYLOAD' })
    render(<Offerer session={session} onCancel={() => {}} />)

    fireEvent.change(screen.getByRole('textbox', { name: /paste their reply code/i }), { target: { value: offerCode } })
    fireEvent.click(screen.getByRole('button', { name: /^connect$/i }))

    // The visible info Callout and the polite LiveRegion both surface the
    // same explanation — assert at least one (the Callout) is visible to
    // sighted users via getAllByText.
    const matches = screen.getAllByText(/that's an invite, not a reply/i)
    expect(matches.length).toBeGreaterThanOrEqual(1)
    // And the visible Callout (the one without aria-live="polite") is
    // present in the rendered DOM.
    const visibleMatches = matches.filter((el) => !el.hasAttribute('aria-live'))
    expect(visibleMatches.length).toBeGreaterThanOrEqual(1)
  })

  it('renders the new reply CopyBox once the hook produces an answer encodedLocal', () => {
    // The polite-defer reply view depends on the session's `encodedLocal`
    // becoming the freshly-encoded answer code. With our seeded session
    // already in `awaiting-answer` + `encodedLocal`, after the swap the
    // CopyBox should show *the new* code (we simulate by passing the same
    // session — what matters is that the reply CopyBox is rendered).
    const offerCode = encode({ type: 'offer', sdp: 'v=0\r\n' })
    const replyCode = 'NEW-ANSWER-PAYLOAD'
    const session = makeSession({ state: 'awaiting-answer', encodedLocal: replyCode })
    render(<Offerer session={session} onCancel={() => {}} />)

    fireEvent.change(screen.getByRole('textbox', { name: /paste their reply code/i }), { target: { value: offerCode } })
    fireEvent.click(screen.getByRole('button', { name: /^connect$/i }))

    // The polite-defer view should display the reply code in a CopyBox
    // labeled like the Joiner's reply view.
    expect(screen.getByRole('textbox', { name: /reply code/i })).toBeInTheDocument()
  })

  it('focuses the new reply CopyBox Copy button after the polite-defer swap', async () => {
    // AC #5: the newly mounted reply view's primary action (Copy) receives
    // focus, matching the Joiner reply branch behaviour.
    const offerCode = encode({ type: 'offer', sdp: 'v=0\r\n' })
    const session = makeSession({ state: 'awaiting-answer', encodedLocal: 'REPLY-CODE' })
    render(<Offerer session={session} onCancel={() => {}} />)

    fireEvent.change(screen.getByRole('textbox', { name: /paste their reply code/i }), { target: { value: offerCode } })
    fireEvent.click(screen.getByRole('button', { name: /^connect$/i }))

    const copyButton = await screen.findByRole('button', { name: /^copy$/i })
    await waitFor(() => {
      expect(document.activeElement).toBe(copyButton)
    })
  })
})
