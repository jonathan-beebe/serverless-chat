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

function msg(id: string, text: string, from: ChatMessage['from'] = 'them'): ChatMessage {
  return { id, from, text, at: 0 }
}

function getTranscript() {
  return screen.getByRole('list', { name: /chat transcript/i }) as HTMLOListElement
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

    const transcript = getTranscript()
    // The bubble is the last <span> child of each <li>; assert it carries
    // the whitespace-pre-wrap class so `\n` renders as a real line break.
    const bubble = transcript.querySelector('li > span:last-child') as HTMLElement
    expect(bubble.className).toMatch(/whitespace-pre-wrap/)
    expect(bubble.textContent).toBe('line one\nline two')
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

  it('renders a visible speaker caption so authorship is not conveyed by color/alignment alone', () => {
    const messages: ChatMessage[] = [msg('a', 'hi', 'them'), msg('b', 'yo', 'me')]
    render(<Chat messages={messages} onSend={() => {}} />)

    // Captions are aria-hidden (the sr-only prefix carries the semantics),
    // so query by text directly within the transcript list.
    const transcript = getTranscript()
    expect(transcript.textContent).toContain('Them')
    expect(transcript.textContent).toContain('You')
  })
})
