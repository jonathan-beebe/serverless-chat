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
    telemetry: {
      connectedAt: null,
      sync: null,
      samples: [],
      summary: { sampleCount: 0, currentRttMs: null, medianRttMs: null, p95RttMs: null },
    },
    // FEAT-012: session shape gains conversationId + hasResumed + bindConversation.
    conversationId: null,
    hasResumed: false,
    bindConversation: vi.fn().mockResolvedValue(undefined),
    startAsOfferer: vi.fn().mockResolvedValue(undefined),
    startAsAnswerer: vi.fn().mockResolvedValue(undefined),
    submitAnswer: vi.fn().mockResolvedValue(undefined),
    politelyAcceptOffer: vi.fn().mockResolvedValue(undefined),
    send: vi.fn(),
    reset: vi.fn(),
    ...overrides,
  }
}

// FEAT-012: the Joiner now also takes a `conversationId` prop — null is the
// pre-FEAT-012 invite case where Joiner mints a fresh UUID locally. Tests
// pass null so they continue to exercise the legacy URL shape.
const TEST_CONV_ID: string | null = null

describe('Joiner focus-on-mount (A11Y-005 + A11Y-022)', () => {
  const SHOWCASE_CHROME: ScreenChromeValue = {
    landmark: 'region',
    headingLevelOffset: 1,
    suppressInitialFocus: true,
  }

  it('focuses the Accept button on the invite branch (primary action)', async () => {
    const session = makeSession({ state: 'idle' })
    render(<Joiner session={session} offerCode="OFFER" conversationId={TEST_CONV_ID} onCancel={() => {}} />)
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
    render(<Joiner session={session} offerCode="OFFER" conversationId={TEST_CONV_ID} onCancel={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /^accept$/i }))

    const copyButton = await screen.findByRole('button', { name: /^copy$/i })
    await waitFor(() => {
      expect(document.activeElement).toBe(copyButton)
    })
  })

  it('focuses the "Return home" button on the closed branch', async () => {
    const session = makeSession({ state: 'closed' })
    render(<Joiner session={session} offerCode="OFFER" conversationId={TEST_CONV_ID} onCancel={() => {}} />)
    const restart = screen.getByRole('button', { name: /return home/i })

    await waitFor(() => {
      expect(document.activeElement).toBe(restart)
    })
  })

  it('does NOT focus any element inside a showcase context with suppressInitialFocus: true (A11Y-022)', async () => {
    const session = makeSession({ state: 'idle' })
    render(
      <ScreenChromeContext.Provider value={SHOWCASE_CHROME}>
        <Joiner session={session} offerCode="OFFER" conversationId={TEST_CONV_ID} onCancel={() => {}} />
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

describe('Joiner polite-defer on Accept (BUG-007)', () => {
  // App.tsx hoists `useChatSession` and shares it across routes — when the user
  // already started as offerer and then loads the other peer's invite URL in
  // the same tab, the Joiner mounts onto a non-idle session that still holds
  // its own offer's `encodedLocal`. Accepting on that screen must politely
  // defer (tear down our offer, become the answerer of the pasted offer)
  // instead of no-op'ing under the old `state === 'idle'` guard, otherwise the
  // reply CopyBox renders Bob's stale offer SDP labeled as "Reply code" and
  // both peers strand on reply-code screens.

  it('idle session: Accept calls startAsAnswerer (regression — original happy path)', () => {
    const session = makeSession({ state: 'idle' })
    render(<Joiner session={session} offerCode="ALICE_OFFER" conversationId={TEST_CONV_ID} onCancel={() => {}} />)

    fireEvent.click(screen.getByRole('button', { name: /^accept$/i }))

    expect(session.startAsAnswerer).toHaveBeenCalledTimes(1)
    expect(session.startAsAnswerer).toHaveBeenCalledWith('ALICE_OFFER', expect.any(String))
    expect(session.politelyAcceptOffer).not.toHaveBeenCalled()
  })

  it('awaiting-answer session: Accept calls politelyAcceptOffer with the offer + conv id', () => {
    // Bob's session is still in `awaiting-answer` from his own startAsOfferer
    // when Alice's URL routes him into Joiner. The shared hook means
    // session.state never returned to 'idle', so the old guard stranded the
    // reply flow on Bob's stale `encodedLocal`. Polite-defer is the recovery.
    const session = makeSession({
      state: 'awaiting-answer',
      encodedLocal: 'BOBS_STALE_OFFER',
    })
    render(<Joiner session={session} offerCode="ALICE_OFFER" conversationId={TEST_CONV_ID} onCancel={() => {}} />)

    fireEvent.click(screen.getByRole('button', { name: /^accept$/i }))

    expect(session.politelyAcceptOffer).toHaveBeenCalledTimes(1)
    expect(session.politelyAcceptOffer).toHaveBeenCalledWith('ALICE_OFFER', expect.any(String))
    expect(session.startAsAnswerer).not.toHaveBeenCalled()
  })

  it('awaiting-answer session: passes a stable conv id (matching the Joiner-side effectiveConvId)', () => {
    // The hook needs a non-null conv id so its FEAT-012 history exchange
    // can run against the right key — null'ing it (the pre-FEAT-012 invite
    // case) must still produce a usable id.
    const session = makeSession({
      state: 'awaiting-answer',
      encodedLocal: 'BOBS_STALE_OFFER',
    })
    render(<Joiner session={session} offerCode="ALICE_OFFER" conversationId={null} onCancel={() => {}} />)

    fireEvent.click(screen.getByRole('button', { name: /^accept$/i }))

    const calls = (session.politelyAcceptOffer as ReturnType<typeof vi.fn>).mock.calls
    expect(calls).toHaveLength(1)
    const [, convId] = calls[0]
    expect(typeof convId).toBe('string')
    expect(convId.length).toBeGreaterThan(0)
  })

  it('does NOT announce "Reply code ready" in the live region while still on the invite branch', () => {
    // BUG-007 polish: when the shared hook has leaked `awaiting-answer` from a
    // prior offerer flow, the Joiner's live region must not announce
    // "Reply code ready" to AT users — the visible content is still the
    // "You've been invited" page, and the misleading status copy would lead
    // screen-reader users to look for a code that doesn't exist yet.
    const session = makeSession({
      state: 'awaiting-answer',
      encodedLocal: 'BOBS_STALE_OFFER',
    })
    render(<Joiner session={session} offerCode="ALICE_OFFER" conversationId={TEST_CONV_ID} onCancel={() => {}} />)

    expect(screen.queryByText(/reply code ready/i)).not.toBeInTheDocument()
  })
})

describe('Joiner post-connect drop (BUG-005)', () => {
  it('renders a "Connection lost" view when state === "closed"', () => {
    const staleReply = 'STALE-ENCODED-ANSWER-PAYLOAD'
    const session = makeSession({ state: 'closed', encodedLocal: staleReply })

    render(<Joiner session={session} offerCode="ignored" conversationId={TEST_CONV_ID} onCancel={() => {}} />)

    expect(screen.getByRole('heading', { name: /connection lost/i })).toBeInTheDocument()

    // No stale CopyBox / setup CTAs.
    expect(screen.queryByRole('heading', { name: /send this code back/i })).not.toBeInTheDocument()
    expect(screen.queryByText(new RegExp(staleReply))).not.toBeInTheDocument()
    expect(screen.queryByText(/try a different network/i)).not.toBeInTheDocument()
  })

  it('"Return home" button calls onCancel', () => {
    const onCancel = vi.fn()
    const session = makeSession({ state: 'closed', encodedLocal: 'STALE' })

    render(<Joiner session={session} offerCode="ignored" conversationId={TEST_CONV_ID} onCancel={onCancel} />)

    fireEvent.click(screen.getByRole('button', { name: /return home/i }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})
