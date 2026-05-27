import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Chat } from './Chat'
import type { ChatMessage } from '../core/rtc'

// RFCTR-003: Chat is a thin shell — the load-bearing behaviors live in
// ChatCopyToolbar.test.tsx, ChatTranscript.test.tsx, and ChatComposer.test.tsx.
// This file keeps only the contracts that concern the *composition* itself:
// the CR-007 outer wrapper classes, the tab-order between children, and that
// composing the children does not regress the FEAT-002 initial focus rule.

// Deterministic fixed timestamp so FEAT-006 assertions on rendered
// time/date strings are stable. Using UTC anchor avoids
// host-clock drift; tests that care about day-rollover use local-time
// constructors instead, which guarantee `toDateString()` differs across
// the boundary regardless of host timezone.
const DEFAULT_AT = Date.UTC(2026, 4, 22, 17, 23) // 2026-05-22T17:23:00Z

function msg(id: string, text: string, from: ChatMessage['from'] = 'them', at: number = DEFAULT_AT): ChatMessage {
  return { id, from, text, at }
}

describe('Chat outer wrapper layout contract (CR-007)', () => {
  // JSDOM doesn't lay out scrollable elements, so a "document didn't scroll"
  // assertion isn't reliably testable here. Instead we pin the *class
  // contract* that callers (Offerer/Joiner connected screens) depend on:
  // <Chat>'s outer wrapper must be a flex-1 + min-h-0 child of its
  // bounded flex-column parent so the transcript — not the document — is
  // the scroll surface. A regression to `h-full` (the previous shape) lets
  // intrinsic content push the wrapper past its slot and the document
  // gains a viewport-level scrollbar.
  it('outer wrapper participates in the parent flex column via flex-1 + min-h-0 (not h-full)', () => {
    render(<Chat messages={[msg('a', 'hi', 'them')]} onSend={() => {}} />)
    // Walk up from the transcript (role="log") to its parent — that's the
    // outer wrapper this contract describes.
    const transcript = screen.getByRole('log', { name: /chat transcript/i })
    const wrapper = transcript.parentElement as HTMLElement
    expect(wrapper).toBeTruthy()
    expect(wrapper.className).toContain('flex-1')
    expect(wrapper.className).toContain('min-h-0')
    // Explicit regression guard against the previous (broken) shape.
    expect(wrapper.className).not.toMatch(/(^|\s)h-full(\s|$)/)
  })
})

describe('Chat tab order (toolbar → transcript → composer)', () => {
  it('places the transcript tab stop before the composer in source order (A11Y-021)', () => {
    // Tab traversal in JSDOM is unreliable, but source-order is the contract:
    // a natural tab stop on the transcript should land before the composer.
    render(<Chat messages={[msg('a', 'hi', 'them')]} onSend={() => {}} />)
    const log = screen.getByRole('log', { name: /chat transcript/i })
    const composer = screen.getByLabelText(/message/i)
    // Bitmask 4 = DOCUMENT_POSITION_FOLLOWING — composer follows the log in source order.
    expect(log.compareDocumentPosition(composer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('places the copy toolbar before the transcript in source order (FEAT-011)', () => {
    render(<Chat messages={[msg('a', 'hi', 'them')]} onSend={() => {}} />)
    const copyBtn = screen.getByRole('button', { name: /^copy$/i })
    const transcript = screen.getByRole('log', { name: /chat transcript/i })
    expect(copyBtn.compareDocumentPosition(transcript) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('does not steal initial focus from the composer (A11Y-021 regression of FEAT-002)', () => {
    // The composer-focus useEffect should still run; the transcript becoming
    // a tab stop does not change initial-focus policy.
    render(<Chat messages={[msg('a', 'hi', 'them')]} onSend={() => {}} />)
    expect(screen.getByLabelText(/message/i)).toHaveFocus()
  })
})
