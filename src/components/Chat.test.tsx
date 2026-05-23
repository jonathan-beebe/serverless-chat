import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Chat } from './Chat'
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

describe('Chat auto-scroll', () => {
  it('scrolls to bottom on the initial render (default pinned-to-bottom state)', () => {
    const messages: ChatMessage[] = [msg('a', 'hello'), msg('b', 'world')]
    const { rerender } = render(<Chat messages={messages} onSend={() => {}} />)
    const transcript = getTranscript()
    stubScroll(transcript, { scrollHeight: 800, clientHeight: 200 })

    // Trigger a re-render so the auto-scroll effect runs against stubbed metrics.
    rerender(<Chat messages={[...messages, msg('c', '!')]} onSend={() => {}} />)

    expect(transcript.scrollTop).toBe(transcript.scrollHeight)
  })

  it('auto-scrolls to bottom when a new message arrives and the user is pinned at the bottom', () => {
    const initial: ChatMessage[] = [msg('a', 'one'), msg('b', 'two')]
    const { rerender } = render(<Chat messages={initial} onSend={() => {}} />)
    const transcript = getTranscript()

    // Simulate "user is at the bottom": scrollTop is at the very end.
    stubScroll(transcript, { scrollHeight: 400, clientHeight: 200 })
    transcript.scrollTop = 200 // 400 - 200 = 0px from bottom
    fireEvent.scroll(transcript)

    // New message grows the scroll height; effect should pin to the new bottom.
    stubScroll(transcript, { scrollHeight: 460, clientHeight: 200 })
    rerender(<Chat messages={[...initial, msg('c', 'three')]} onSend={() => {}} />)

    expect(transcript.scrollTop).toBe(460)
  })

  it('does NOT auto-scroll when the user has scrolled up to read history', () => {
    const initial: ChatMessage[] = [msg('a', 'one'), msg('b', 'two')]
    const { rerender } = render(<Chat messages={initial} onSend={() => {}} />)
    const transcript = getTranscript()

    // Simulate "user scrolled up": well above the bottom threshold.
    stubScroll(transcript, { scrollHeight: 400, clientHeight: 200 })
    transcript.scrollTop = 0 // 400px from bottom — clearly reading history
    fireEvent.scroll(transcript)

    // New message arrives; scroll position must be preserved.
    stubScroll(transcript, { scrollHeight: 460, clientHeight: 200 })
    rerender(<Chat messages={[...initial, msg('c', 'three')]} onSend={() => {}} />)

    expect(transcript.scrollTop).toBe(0)
  })

  it('treats "within ~32px of the bottom" as still pinned (forgives small mis-scrolls)', () => {
    const initial: ChatMessage[] = [msg('a', 'one')]
    const { rerender } = render(<Chat messages={initial} onSend={() => {}} />)
    const transcript = getTranscript()

    stubScroll(transcript, { scrollHeight: 400, clientHeight: 200 })
    transcript.scrollTop = 180 // 20px from bottom — still "near"
    fireEvent.scroll(transcript)

    stubScroll(transcript, { scrollHeight: 460, clientHeight: 200 })
    rerender(<Chat messages={[...initial, msg('b', 'two')]} onSend={() => {}} />)

    expect(transcript.scrollTop).toBe(460)
  })
})

describe('Chat input focus (FEAT-002)', () => {
  it('focuses #chat-input on initial mount when enabled (initial connect)', () => {
    render(<Chat messages={[]} onSend={() => {}} />)
    expect(screen.getByLabelText(/message/i)).toHaveFocus()
  })

  it('keeps focus on #chat-input after submitting via Enter', () => {
    const onSend = vi.fn()
    render(<Chat messages={[]} onSend={onSend} />)
    const input = screen.getByLabelText(/message/i) as HTMLTextAreaElement
    input.focus()
    fireEvent.change(input, { target: { value: 'hi' } })
    // FEAT-004: composer is a textarea, so Enter is handled by onKeyDown
    // rather than a native form submission.
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onSend).toHaveBeenCalledWith('hi')
    expect(input).toHaveFocus()
  })

  it('returns focus to #chat-input after clicking the Send button', () => {
    const onSend = vi.fn()
    render(<Chat messages={[]} onSend={onSend} />)
    const input = screen.getByLabelText(/message/i) as HTMLInputElement
    fireEvent.change(input, { target: { value: 'hello' } })

    const send = screen.getByRole('button', { name: /send/i })
    // The Send button is enabled now that the draft is non-empty.
    expect(send).not.toBeDisabled()
    fireEvent.click(send)

    expect(onSend).toHaveBeenCalledWith('hello')
    expect(input).toHaveFocus()
  })

  it('moves focus to #chat-input when `disabled` transitions from true to false (reconnect)', () => {
    const { rerender } = render(<Chat messages={[]} onSend={() => {}} disabled />)
    const input = screen.getByLabelText(/message/i)
    // Disabled inputs can't receive focus, so it's elsewhere (body).
    expect(input).not.toHaveFocus()

    rerender(<Chat messages={[]} onSend={() => {}} disabled={false} />)
    expect(input).toHaveFocus()
  })

  it('does not steal focus on disabled→enabled if the user has focused another element', () => {
    const { rerender } = render(
      <div>
        <button>Other</button>
        <Chat messages={[]} onSend={() => {}} disabled />
      </div>,
    )
    const other = screen.getByRole('button', { name: /other/i })
    other.focus()
    expect(other).toHaveFocus()

    rerender(
      <div>
        <button>Other</button>
        <Chat messages={[]} onSend={() => {}} disabled={false} />
      </div>,
    )

    // The user's explicit focus on the other button must be preserved.
    expect(other).toHaveFocus()
  })
})

describe('Chat composer Enter / Shift+Enter (FEAT-004)', () => {
  function getComposer() {
    return screen.getByLabelText(/message/i) as HTMLTextAreaElement
  }

  it('renders a multi-line <textarea> composer (not a single-line <input>)', () => {
    render(<Chat messages={[]} onSend={() => {}} />)
    expect(getComposer().tagName).toBe('TEXTAREA')
  })

  it('Enter sends (trimmed) and clears the draft', () => {
    const onSend = vi.fn()
    render(<Chat messages={[]} onSend={onSend} />)
    const composer = getComposer()
    fireEvent.change(composer, { target: { value: '  hello world  ' } })

    fireEvent.keyDown(composer, { key: 'Enter' })

    expect(onSend).toHaveBeenCalledWith('hello world')
    expect(composer.value).toBe('')
  })

  it('Shift+Enter does NOT send (newline-insert path)', () => {
    const onSend = vi.fn()
    render(<Chat messages={[]} onSend={onSend} />)
    const composer = getComposer()
    fireEvent.change(composer, { target: { value: 'line one' } })

    fireEvent.keyDown(composer, { key: 'Enter', shiftKey: true })

    expect(onSend).not.toHaveBeenCalled()
  })

  it('Enter with empty / whitespace-only draft does nothing', () => {
    const onSend = vi.fn()
    render(<Chat messages={[]} onSend={onSend} />)
    const composer = getComposer()
    fireEvent.change(composer, { target: { value: '   \n   ' } })

    fireEvent.keyDown(composer, { key: 'Enter' })

    expect(onSend).not.toHaveBeenCalled()
  })

  it('Enter while `disabled` does nothing', () => {
    const onSend = vi.fn()
    render(<Chat messages={[]} onSend={onSend} disabled />)
    const composer = getComposer()
    expect(composer).toBeDisabled()

    // Even if a keydown reaches the handler, the guard rejects it.
    fireEvent.keyDown(composer, { key: 'Enter' })

    expect(onSend).not.toHaveBeenCalled()
  })

  it('Enter during IME composition does NOT send', () => {
    const onSend = vi.fn()
    render(<Chat messages={[]} onSend={onSend} />)
    const composer = getComposer()
    fireEvent.change(composer, { target: { value: 'hi' } })

    fireEvent.keyDown(composer, { key: 'Enter', isComposing: true })

    expect(onSend).not.toHaveBeenCalled()
  })

  it('preserves embedded newlines in rendered message bubbles', () => {
    const messages: ChatMessage[] = [msg('a', 'line one\nline two', 'me')]
    render(<Chat messages={messages} onSend={() => {}} />)

    // The text span (FEAT-006 wraps the message text in its own element so
    // the bubble can also hold the per-message <time>). Assert it carries
    // the whitespace-pre-wrap class so embedded `\n` renders as a real
    // line break.
    const textSpan = screen.getByTestId('message-text-a')
    expect(textSpan.className).toMatch(/whitespace-pre-wrap/)
    expect(textSpan.textContent).toBe('line one\nline two')
  })
})

describe('Chat speaker attribution (A11Y-004)', () => {
  it('includes a visually-hidden speaker prefix so the live-region announcement names who spoke', () => {
    const messages: ChatMessage[] = [msg('a', 'hi there', 'them'), msg('b', 'hello back', 'me')]
    render(<Chat messages={messages} onSend={() => {}} />)

    const transcript = getTranscript()
    // The textContent of the transcript is what a screen reader on a polite
    // live region effectively reads out; assert both speakers are attributed.
    expect(transcript.textContent).toContain('They said: hi there')
    expect(transcript.textContent).toContain('You said: hello back')
  })
})

describe('Chat date headers + per-message timestamps (FEAT-006)', () => {
  function getDateHeaders(): HTMLElement[] {
    return Array.from(document.querySelectorAll('[data-testid="date-header"]')) as HTMLElement[]
  }

  it('removes the visible You / Them captions and renders an opening date header instead', () => {
    const at = Date.UTC(2026, 4, 22, 17, 23)
    const messages: ChatMessage[] = [msg('a', 'hi', 'them', at), msg('b', 'yo', 'me', at)]
    render(<Chat messages={messages} onSend={() => {}} />)

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
    render(<Chat messages={messages} onSend={() => {}} />)

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
    render(<Chat messages={messages} onSend={() => {}} />)
    expect(getDateHeaders()).toHaveLength(1)
  })

  it('two messages straddling local midnight render TWO date headers with the right labels', () => {
    // Local-time constructors guarantee `toDateString()` differs across the
    // boundary regardless of the host timezone.
    const day1At = new Date(2026, 4, 22, 23, 30).getTime() // May 22 23:30 local
    const day2At = new Date(2026, 4, 23, 0, 30).getTime() // May 23 00:30 local
    const messages: ChatMessage[] = [msg('a', 'late', 'them', day1At), msg('b', 'morning', 'me', day2At)]
    render(<Chat messages={messages} onSend={() => {}} />)

    const headers = getDateHeaders()
    expect(headers).toHaveLength(2)

    const dateFmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'full' })
    expect(headers[0].textContent).toContain(dateFmt.format(new Date(day1At)))
    expect(headers[1].textContent).toContain(dateFmt.format(new Date(day2At)))
  })

  it('marks date headers and per-bubble <time>s as aria-hidden so live-region updates stay quiet', () => {
    const messages: ChatMessage[] = [msg('a', 'hi', 'them')]
    render(<Chat messages={messages} onSend={() => {}} />)

    const header = getDateHeaders()[0]
    expect(header).toBeTruthy()
    expect(header.getAttribute('aria-hidden')).toBe('true')

    // Scope to the bubble — the date header also contains a <time> but its
    // hidden-ness comes from the parent <li>, not an attribute on the <time>.
    const time = getTranscript().querySelector('[data-testid="message-bubble"] time') as HTMLElement
    expect(time.getAttribute('aria-hidden')).toBe('true')
  })
})

describe('Chat transcript log surface (A11Y-018)', () => {
  it('exposes the transcript as role="log" with the right live-region attributes', () => {
    render(<Chat messages={[msg('a', 'hi', 'them')]} onSend={() => {}} />)

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
    render(<Chat messages={[msg('a', 'hi', 'them')]} onSend={() => {}} />)

    const list = screen.getByRole('list')
    expect(list.tagName).toBe('OL')
    expect(list.hasAttribute('aria-live')).toBe(false)
    expect(list.hasAttribute('role')).toBe(false)
  })

  it('renders the empty-state OUTSIDE the message <ol> and marked aria-hidden', () => {
    render(<Chat messages={[]} onSend={() => {}} />)

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
    render(<Chat messages={messages} onSend={() => {}} />)

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
    render(<Chat messages={messages} onSend={() => {}} />)

    const log = getTranscript()
    expect(log.textContent).toContain('They said: hi there')
    expect(log.textContent).toContain('You said: hello back')
  })
})
