import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ChatTranscript } from './ChatTranscript'
import type { ChatMessage } from '../core/rtc'

// JSDOM doesn't actually lay out scrollable elements. `scrollHeight` /
// `clientHeight` are always 0, and writes to `scrollTop` are real but
// unconstrained. We stub those three properties on the transcript element so
// the component can reason about "is the user near the bottom?" the same way
// it would in a real browser.
function stubScroll(el: Element, { scrollHeight, clientHeight }: { scrollHeight: number; clientHeight: number }) {
  Object.defineProperty(el, 'scrollHeight', { configurable: true, value: scrollHeight })
  Object.defineProperty(el, 'clientHeight', { configurable: true, value: clientHeight })
}

// Deterministic fixed timestamp so FEAT-006 assertions on rendered
// time/date strings are stable. Using UTC anchor avoids
// host-clock drift; tests that care about day-rollover use local-time
// constructors instead, which guarantee `toDateString()` differs across
// the boundary regardless of host timezone.
const DEFAULT_AT = Date.UTC(2026, 4, 22, 17, 23) // 2026-05-22T17:23:00Z

function msg(id: string, text: string, from: ChatMessage['from'] = 'them', at: number = DEFAULT_AT): ChatMessage {
  return { id, from, text, at }
}

function getTranscript() {
  // A11Y-018: the transcript surface is the wrapper <div role="log"> — also
  // the scroll container, so this is the right element for both AT-name and
  // scroll-metrics assertions.
  return screen.getByRole('log', { name: /chat transcript/i }) as HTMLDivElement
}

describe('ChatTranscript auto-scroll', () => {
  it('scrolls to bottom on the initial render (default pinned-to-bottom state)', () => {
    const messages: ChatMessage[] = [msg('a', 'hello'), msg('b', 'world')]
    const { rerender } = render(<ChatTranscript messages={messages} />)
    const transcript = getTranscript()
    stubScroll(transcript, { scrollHeight: 800, clientHeight: 200 })

    // Trigger a re-render so the auto-scroll effect runs against stubbed metrics.
    rerender(<ChatTranscript messages={[...messages, msg('c', '!')]} />)

    expect(transcript.scrollTop).toBe(transcript.scrollHeight)
  })

  it('auto-scrolls to bottom when a new message arrives and the user is pinned at the bottom', () => {
    const initial: ChatMessage[] = [msg('a', 'one'), msg('b', 'two')]
    const { rerender } = render(<ChatTranscript messages={initial} />)
    const transcript = getTranscript()

    // Simulate "user is at the bottom": scrollTop is at the very end.
    stubScroll(transcript, { scrollHeight: 400, clientHeight: 200 })
    transcript.scrollTop = 200 // 400 - 200 = 0px from bottom
    fireEvent.scroll(transcript)

    // New message grows the scroll height; effect should pin to the new bottom.
    stubScroll(transcript, { scrollHeight: 460, clientHeight: 200 })
    rerender(<ChatTranscript messages={[...initial, msg('c', 'three')]} />)

    expect(transcript.scrollTop).toBe(460)
  })

  it('does NOT auto-scroll when the user has scrolled up to read history', () => {
    const initial: ChatMessage[] = [msg('a', 'one'), msg('b', 'two')]
    const { rerender } = render(<ChatTranscript messages={initial} />)
    const transcript = getTranscript()

    // Simulate "user scrolled up": well above the bottom threshold.
    stubScroll(transcript, { scrollHeight: 400, clientHeight: 200 })
    transcript.scrollTop = 0 // 400px from bottom — clearly reading history
    fireEvent.scroll(transcript)

    // New message arrives; scroll position must be preserved.
    stubScroll(transcript, { scrollHeight: 460, clientHeight: 200 })
    rerender(<ChatTranscript messages={[...initial, msg('c', 'three')]} />)

    expect(transcript.scrollTop).toBe(0)
  })

  it('treats "within ~32px of the bottom" as still pinned (forgives small mis-scrolls)', () => {
    const initial: ChatMessage[] = [msg('a', 'one')]
    const { rerender } = render(<ChatTranscript messages={initial} />)
    const transcript = getTranscript()

    stubScroll(transcript, { scrollHeight: 400, clientHeight: 200 })
    transcript.scrollTop = 180 // 20px from bottom — still "near"
    fireEvent.scroll(transcript)

    stubScroll(transcript, { scrollHeight: 460, clientHeight: 200 })
    rerender(<ChatTranscript messages={[...initial, msg('b', 'two')]} />)

    expect(transcript.scrollTop).toBe(460)
  })
})

describe('ChatTranscript message rendering', () => {
  it('preserves embedded newlines in rendered message bubbles', () => {
    const messages: ChatMessage[] = [msg('a', 'line one\nline two', 'me')]
    render(<ChatTranscript messages={messages} />)

    // The text span (FEAT-006 wraps the message text in its own element so
    // the bubble can also hold the per-message <time>). Assert it carries
    // the whitespace-pre-wrap class so embedded `\n` renders as a real
    // line break.
    const textSpan = screen.getByTestId('message-text-a')
    expect(textSpan.className).toMatch(/whitespace-pre-wrap/)
    expect(textSpan.textContent).toBe('line one\nline two')
  })
})

describe('ChatTranscript speaker attribution (A11Y-004)', () => {
  it('includes a visually-hidden speaker prefix so the live-region announcement names who spoke', () => {
    const messages: ChatMessage[] = [msg('a', 'hi there', 'them'), msg('b', 'hello back', 'me')]
    render(<ChatTranscript messages={messages} />)

    const transcript = getTranscript()
    // The textContent of the transcript is what a screen reader on a polite
    // live region effectively reads out; assert both speakers are attributed.
    expect(transcript.textContent).toContain('They said: hi there')
    expect(transcript.textContent).toContain('You said: hello back')
  })
})

describe('ChatTranscript date headers + per-message timestamps (FEAT-006)', () => {
  function getDateHeaders(): HTMLElement[] {
    return Array.from(document.querySelectorAll('[data-testid="date-header"]')) as HTMLElement[]
  }

  it('removes the visible You / Them captions and renders an opening date header instead', () => {
    const at = Date.UTC(2026, 4, 22, 17, 23)
    const messages: ChatMessage[] = [msg('a', 'hi', 'them', at), msg('b', 'yo', 'me', at)]
    render(<ChatTranscript messages={messages} />)

    // The visible standalone "You" / "Them" captions must be gone. They used
    // to live as their own aria-hidden span inside each <li>. Anything that
    // looks like that span (a span whose textContent is exactly "You" or
    // "Them") is a regression.
    const transcript = getTranscript()
    const visibleAuthorSpans = Array.from(transcript.querySelectorAll('span')).filter(
      (s) => !s.classList.contains('sr-only') && (s.textContent === 'You' || s.textContent === 'Them'),
    )
    expect(visibleAuthorSpans).toEqual([])

    // The opening date header (locale-formatted full date) is present.
    const expectedHeader = new Intl.DateTimeFormat(undefined, { dateStyle: 'full' }).format(new Date(at))
    expect(transcript.textContent).toContain(expectedHeader)
  })

  it('renders a <time> element per message bubble with locale-short time, for both me and them', () => {
    const atA = Date.UTC(2026, 4, 22, 17, 23)
    const atB = atA + 60_000
    const messages: ChatMessage[] = [msg('a', 'hi', 'them', atA), msg('b', 'yo', 'me', atB)]
    render(<ChatTranscript messages={messages} />)

    const timeFmt = new Intl.DateTimeFormat(undefined, { timeStyle: 'short' })
    const expectedA = timeFmt.format(new Date(atA))
    const expectedB = timeFmt.format(new Date(atB))

    const bubbleTimes = Array.from(getTranscript().querySelectorAll('li time')).map((t) => t.textContent)
    expect(bubbleTimes).toContain(expectedA)
    expect(bubbleTimes).toContain(expectedB)
  })

  it('two messages on the same local day render exactly ONE date header (opener only)', () => {
    const at = Date.UTC(2026, 4, 22, 17, 23)
    const messages: ChatMessage[] = [msg('a', 'hi', 'them', at), msg('b', 'yo', 'me', at + 60_000)]
    render(<ChatTranscript messages={messages} />)
    expect(getDateHeaders()).toHaveLength(1)
  })

  it('two messages straddling local midnight render TWO date headers with the right labels', () => {
    // Local-time constructors guarantee `toDateString()` differs across the
    // boundary regardless of the host timezone.
    const day1At = new Date(2026, 4, 22, 23, 30).getTime() // May 22 23:30 local
    const day2At = new Date(2026, 4, 23, 0, 30).getTime() // May 23 00:30 local
    const messages: ChatMessage[] = [msg('a', 'late', 'them', day1At), msg('b', 'morning', 'me', day2At)]
    render(<ChatTranscript messages={messages} />)

    const headers = getDateHeaders()
    expect(headers).toHaveLength(2)

    const dateFmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'full' })
    expect(headers[0].textContent).toContain(dateFmt.format(new Date(day1At)))
    expect(headers[1].textContent).toContain(dateFmt.format(new Date(day2At)))
  })

  it('marks date headers and per-bubble <time>s as aria-hidden so live-region updates stay quiet', () => {
    const messages: ChatMessage[] = [msg('a', 'hi', 'them')]
    render(<ChatTranscript messages={messages} />)

    const header = getDateHeaders()[0]
    expect(header).toBeTruthy()
    expect(header.getAttribute('aria-hidden')).toBe('true')

    // Scope to the bubble — the date header also contains a <time> but its
    // hidden-ness comes from the parent <li>, not an attribute on the <time>.
    const time = getTranscript().querySelector('[data-testid="message-bubble"] time') as HTMLElement
    expect(time.getAttribute('aria-hidden')).toBe('true')
  })
})

describe('ChatTranscript log surface (A11Y-018)', () => {
  it('exposes the transcript as role="log" with the right live-region attributes', () => {
    render(<ChatTranscript messages={[msg('a', 'hi', 'them')]} />)

    const log = getTranscript()
    // Idiomatic chat/log surface: role="log" gives AT a typed signal to
    // specialize on, and the explicit attrs are belt-and-braces for older AT
    // that don't fully resolve role-implied values.
    expect(log.getAttribute('role')).toBe('log')
    expect(log.getAttribute('aria-label')).toMatch(/chat transcript/i)
    expect(log.getAttribute('aria-live')).toBe('polite')
    expect(log.getAttribute('aria-relevant')).toBe('additions')
    expect(log.getAttribute('aria-atomic')).toBe('false')
  })

  it('does NOT apply aria-live directly to the inner <ol>', () => {
    // A11Y-018 regression guard: the previous (broken) shape put aria-live on
    // the <ol> itself, which (a) exposed a "list" role instead of a "log" and
    // (b) put date dividers + the empty-state inside the live region.
    render(<ChatTranscript messages={[msg('a', 'hi', 'them')]} />)

    const list = screen.getByRole('list')
    expect(list.tagName).toBe('OL')
    expect(list.hasAttribute('aria-live')).toBe(false)
    expect(list.hasAttribute('role')).toBe(false)
  })

  it('renders the empty-state OUTSIDE the message <ol> and marked aria-hidden', () => {
    render(<ChatTranscript messages={[]} />)

    // No <ol> at all in the empty state — the live region is "quiet" until
    // the first real message arrives, which then mounts the <ol>.
    expect(screen.queryByRole('list')).toBeNull()

    const log = getTranscript()
    const emptyState = log.querySelector('p')
    expect(emptyState).toBeTruthy()
    expect(emptyState?.textContent).toMatch(/no messages yet/i)
    // aria-hidden so the placeholder isn't read as a live-region addition on
    // first paint or as a "removal" jitter when the first message arrives.
    expect(emptyState?.getAttribute('aria-hidden')).toBe('true')
  })

  it('marks date dividers role="presentation" + aria-hidden so they do not count toward list items', () => {
    // Two days, two messages → one <ol> with two date dividers + two bubbles.
    // Only the bubbles should count as <li>s exposed to AT.
    const day1At = new Date(2026, 4, 22, 23, 30).getTime()
    const day2At = new Date(2026, 4, 23, 0, 30).getTime()
    const messages: ChatMessage[] = [msg('a', 'late', 'them', day1At), msg('b', 'morning', 'me', day2At)]
    render(<ChatTranscript messages={messages} />)

    const dividers = Array.from(document.querySelectorAll('[data-testid="date-header"]')) as HTMLElement[]
    expect(dividers).toHaveLength(2)
    for (const d of dividers) {
      expect(d.getAttribute('role')).toBe('presentation')
      expect(d.getAttribute('aria-hidden')).toBe('true')
    }
  })

  it('preserves the A11Y-004 sr-only speaker prefix inside the log surface', () => {
    // The log announcement text is the sr-only prefix + the message text;
    // this assertion guards against a regression where the prefix is dropped
    // during the live-region rework.
    const messages: ChatMessage[] = [msg('a', 'hi there', 'them'), msg('b', 'hello back', 'me')]
    render(<ChatTranscript messages={messages} />)

    const log = getTranscript()
    expect(log.textContent).toContain('They said: hi there')
    expect(log.textContent).toContain('You said: hello back')
  })
})

describe('ChatTranscript keyboard focusability (A11Y-021)', () => {
  it('exposes the transcript as a keyboard tab stop (A11Y-021)', () => {
    // Without tabIndex={0}, Firefox/Safari users can't focus the scroll
    // container and therefore can't scroll history with the keyboard.
    // Chromium auto-promotes since M126 which masks the bug there.
    render(<ChatTranscript messages={[msg('a', 'hi', 'them')]} />)
    const log = getTranscript()
    expect(log.tabIndex).toBe(0)
  })

  it('carries the app focus-visible style (A11Y-021)', () => {
    // JSDOM can't render real focus styles, so we assert the Tailwind classes
    // are present (same pattern A11Y-007 / A11Y-017 tests use). Without a
    // visible focus ring, the new tab stop is functionally invisible to
    // sighted keyboard users.
    render(<ChatTranscript messages={[msg('a', 'hi', 'them')]} />)
    const log = getTranscript()
    expect(log.className).toContain('focus-visible:outline-none')
    expect(log.className).toContain('focus-visible:ring-2')
    expect(log.className).toContain('focus-visible:ring-sky-400')
  })
})

describe('ChatTranscript delivery indicator (FEAT-010)', () => {
  function outgoing(id: string, text: string, delivery?: ChatMessage['delivery']): ChatMessage {
    return { id, from: 'me', text, at: DEFAULT_AT, delivery }
  }

  it('renders a pending check next to the timestamp on a freshly-sent outgoing message', () => {
    render(<ChatTranscript messages={[outgoing('o1', 'hi', 'pending')]} />)
    const indicator = screen.getByTestId('delivery-o1')
    expect(indicator).toBeTruthy()
    expect(indicator.getAttribute('aria-label')).toBe('Pending')
    expect(indicator.textContent).toContain('✓')
  })

  it('flips the indicator to "Delivered" when the message.delivery state transitions', () => {
    const { rerender } = render(<ChatTranscript messages={[outgoing('o1', 'hi', 'pending')]} />)
    expect(screen.getByTestId('delivery-o1').getAttribute('aria-label')).toBe('Pending')

    rerender(<ChatTranscript messages={[outgoing('o1', 'hi', 'delivered')]} />)
    expect(screen.getByTestId('delivery-o1').getAttribute('aria-label')).toBe('Delivered')
  })

  it('does NOT render a delivery indicator on incoming messages', () => {
    const messages: ChatMessage[] = [{ id: 'i1', from: 'them', text: 'hi', at: DEFAULT_AT }]
    render(<ChatTranscript messages={messages} />)
    expect(screen.queryByTestId('delivery-i1')).toBeNull()
  })

  it('preserves the bubble timestamp alongside the indicator', () => {
    // The indicator must sit *next to* the time, not replace it.
    render(<ChatTranscript messages={[outgoing('o1', 'hi', 'pending')]} />)
    const bubble = screen.getByTestId('message-bubble')
    expect(bubble.querySelector('time')).toBeTruthy()
    expect(bubble.querySelector('[data-testid="delivery-o1"]')).toBeTruthy()
  })
})

describe('ChatTranscript bottom anchoring (IMPRV-028)', () => {
  it('makes the scroll container a flex column so flex auto-margins can anchor content to the bottom', () => {
    render(<ChatTranscript messages={[msg('a', 'hi', 'them')]} />)
    const log = getTranscript()
    expect(log.className).toMatch(/\bflex\b/)
    expect(log.className).toMatch(/\bflex-col\b/)
    // Negative guard: option 2 (`flex-col-reverse`) was explicitly rejected
    // in the ticket recommendation because it desyncs DOM order from visual
    // order and complicates the A11Y-018 live-region contract.
    expect(log.className).not.toMatch(/\bflex-col-reverse\b/)
  })

  it('pushes the message <ol> to the bottom of the transcript via mt-auto', () => {
    render(<ChatTranscript messages={[msg('a', 'one'), msg('b', 'two')]} />)
    const list = screen.getByRole('list')
    expect(list.className).toMatch(/\bmt-auto\b/)
  })

  it('pushes the empty-state placeholder to the bottom of the transcript via mt-auto', () => {
    render(<ChatTranscript messages={[]} />)
    const log = getTranscript()
    const placeholder = log.querySelector('p') as HTMLParagraphElement
    expect(placeholder).toBeTruthy()
    expect(placeholder.className).toMatch(/\bmt-auto\b/)
  })

  it('preserves chronological DOM order (oldest first, newest last) so A11Y-018 live-region additions remain correct', () => {
    const t1 = DEFAULT_AT
    const t2 = DEFAULT_AT + 60_000
    const t3 = DEFAULT_AT + 120_000
    const messages: ChatMessage[] = [
      msg('a', 'first', 'them', t1),
      msg('b', 'second', 'me', t2),
      msg('c', 'third', 'them', t3),
    ]
    render(<ChatTranscript messages={messages} />)

    const list = screen.getByRole('list')
    const bubbleTexts = Array.from(list.querySelectorAll('[data-testid^="message-text-"]')).map((el) => el.textContent)
    expect(bubbleTexts).toEqual(['first', 'second', 'third'])
  })
})

describe('ChatTranscript new-messages button (IMPRV-029)', () => {
  // Helper: mount, drop the user well above the bottom threshold so the
  // anti-yank state holds, and return the transcript element + a rerender
  // function so each test can simulate further message arrivals.
  function setupScrolledBack(initial: ChatMessage[]) {
    const { rerender } = render(<ChatTranscript messages={initial} />)
    const transcript = getTranscript()
    stubScroll(transcript, { scrollHeight: 400, clientHeight: 200 })
    transcript.scrollTop = 0 // 400px from bottom — clearly reading history
    fireEvent.scroll(transcript)
    return { transcript, rerender }
  }

  it('does not render the button on initial mount when no scrolled-back arrivals have occurred', () => {
    render(<ChatTranscript messages={[msg('a', 'hi', 'them')]} />)
    expect(screen.queryByRole('button', { name: /new message/i })).toBeNull()
  })

  it('does NOT render the button when a new message arrives while the user is pinned at the bottom', () => {
    const initial: ChatMessage[] = [msg('a', 'one'), msg('b', 'two')]
    const { rerender } = render(<ChatTranscript messages={initial} />)
    const transcript = getTranscript()

    // Simulate "user is at the bottom".
    stubScroll(transcript, { scrollHeight: 400, clientHeight: 200 })
    transcript.scrollTop = 200 // 0px from bottom
    fireEvent.scroll(transcript)

    stubScroll(transcript, { scrollHeight: 460, clientHeight: 200 })
    rerender(<ChatTranscript messages={[...initial, msg('c', 'three')]} />)

    expect(screen.queryByRole('button', { name: /new message/i })).toBeNull()
  })

  it('renders a singular "1 new message" button when one message arrives while scrolled back', () => {
    const initial: ChatMessage[] = [msg('a', 'one')]
    const { rerender } = setupScrolledBack(initial)

    rerender(<ChatTranscript messages={[...initial, msg('b', 'two')]} />)

    const btn = screen.getByRole('button', { name: /1 new message/i })
    expect(btn.tagName).toBe('BUTTON')
    expect(btn.getAttribute('type')).toBe('button')
    // Visible text reflects the count + singular noun.
    expect(btn.textContent).toMatch(/^\s*1 new message\s*$/)
  })

  it('pluralizes the label to "N new messages" when multiple messages arrive while scrolled back', () => {
    const initial: ChatMessage[] = [msg('a', 'one')]
    const { rerender } = setupScrolledBack(initial)

    rerender(<ChatTranscript messages={[...initial, msg('b', 'two')]} />)
    rerender(<ChatTranscript messages={[...initial, msg('b', 'two'), msg('c', 'three')]} />)
    rerender(<ChatTranscript messages={[...initial, msg('b', 'two'), msg('c', 'three'), msg('d', 'four')]} />)

    const btn = screen.getByRole('button', { name: /3 new messages/i })
    expect(btn.textContent).toMatch(/^\s*3 new messages\s*$/)
  })

  it('activating the button scrolls the transcript to the bottom AND dismisses itself', () => {
    const initial: ChatMessage[] = [msg('a', 'one')]
    const { transcript, rerender } = setupScrolledBack(initial)

    stubScroll(transcript, { scrollHeight: 460, clientHeight: 200 })
    rerender(<ChatTranscript messages={[...initial, msg('b', 'two')]} />)

    const btn = screen.getByRole('button', { name: /1 new message/i })
    fireEvent.click(btn)

    // Click jumps the transcript to the newest message (adjacent to composer).
    expect(transcript.scrollTop).toBe(460)
    // …and the button vanishes (count reset).
    expect(screen.queryByRole('button', { name: /new message/i })).toBeNull()
  })

  it('does NOT dismiss the button when the user manually scrolls to the bottom without tapping it', () => {
    const initial: ChatMessage[] = [msg('a', 'one')]
    const { transcript, rerender } = setupScrolledBack(initial)

    stubScroll(transcript, { scrollHeight: 460, clientHeight: 200 })
    rerender(<ChatTranscript messages={[...initial, msg('b', 'two')]} />)
    expect(screen.getByRole('button', { name: /1 new message/i })).toBeTruthy()

    // Simulate the user manually scrolling all the way to the newest message
    // (without clicking the button).
    transcript.scrollTop = 260 // 460 - 200 - 260 = 0px from bottom
    fireEvent.scroll(transcript)

    // The chosen dismissal policy: only the button itself dismisses it.
    expect(screen.queryByRole('button', { name: /1 new message/i })).toBeTruthy()
  })

  it('renders the button OUTSIDE the message <ol> so it stays pinned visually and not inside the scroll content', () => {
    const initial: ChatMessage[] = [msg('a', 'one')]
    const { rerender } = setupScrolledBack(initial)
    rerender(<ChatTranscript messages={[...initial, msg('b', 'two')]} />)

    const btn = screen.getByRole('button', { name: /1 new message/i })
    // Not a descendant of the <ol>: the button must not scroll with messages.
    expect(btn.closest('ol')).toBeNull()
    // Not a descendant of the role="log" scroll container either — the button
    // is a sibling, not a child, of the scroll surface (so the live region
    // doesn't include it).
    expect(btn.closest('[role="log"]')).toBeNull()
  })
})

describe('ChatTranscript responsive border (IMPRV-027)', () => {
  it('gates the border + rounded-corner card chrome behind `sm:` so phones get a clean edge-to-edge transcript while tablets/desktops keep the framed card', () => {
    // Below 640px: no border, no rounded corners — the surface reads
    // borderless against the surrounding chrome. The bg tint, padding,
    // and focus ring stay unchanged.
    render(<ChatTranscript messages={[]} />)
    const log = getTranscript()
    expect(log.className).toMatch(/\bsm:rounded-md\b/)
    expect(log.className).toMatch(/\bsm:border\b/)
    expect(log.className).toMatch(/\bsm:border-stone-300\b/)
    expect(log.className).toMatch(/\bdark:sm:border-stone-700\b/)
    // Negative guard: pre-IMPRV-027 unconditional border / rounded utilities
    // would apply on phones too.
    expect(log.className).not.toMatch(/(^|\s)border(\s|$)/)
    expect(log.className).not.toMatch(/(^|\s)border-stone-300(\s|$)/)
    expect(log.className).not.toMatch(/(^|\s)rounded-md(\s|$)/)
    expect(log.className).not.toMatch(/(^|\s)dark:border-stone-700(\s|$)/)
    // Preserved utilities — bg tint, padding, focus ring, scroll affordance.
    expect(log.className).toMatch(/\bbg-white\/50\b/)
    expect(log.className).toMatch(/\bp-3\b/)
    expect(log.className).toMatch(/\bfocus-visible:ring-2\b/)
    expect(log.className).toMatch(/\boverflow-y-auto\b/)
  })
})
