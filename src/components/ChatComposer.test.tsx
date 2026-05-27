import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ChatComposer } from './ChatComposer'

describe('ChatComposer input focus (FEAT-002)', () => {
  it('focuses #chat-input on initial mount when enabled (initial connect)', () => {
    render(<ChatComposer onSend={() => {}} />)
    expect(screen.getByLabelText(/message/i)).toHaveFocus()
  })

  it('keeps focus on #chat-input after submitting via Enter', () => {
    const onSend = vi.fn()
    render(<ChatComposer onSend={onSend} />)
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
    render(<ChatComposer onSend={onSend} />)
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
    const { rerender } = render(<ChatComposer onSend={() => {}} disabled />)
    const input = screen.getByLabelText(/message/i)
    // Disabled inputs can't receive focus, so it's elsewhere (body).
    expect(input).not.toHaveFocus()

    rerender(<ChatComposer onSend={() => {}} disabled={false} />)
    expect(input).toHaveFocus()
  })

  it('does not steal focus on disabled→enabled if the user has focused another element', () => {
    const { rerender } = render(
      <div>
        <button>Other</button>
        <ChatComposer onSend={() => {}} disabled />
      </div>,
    )
    const other = screen.getByRole('button', { name: /other/i })
    other.focus()
    expect(other).toHaveFocus()

    rerender(
      <div>
        <button>Other</button>
        <ChatComposer onSend={() => {}} disabled={false} />
      </div>,
    )

    // The user's explicit focus on the other button must be preserved.
    expect(other).toHaveFocus()
  })
})

describe('ChatComposer Enter / Shift+Enter (FEAT-004)', () => {
  function getComposer() {
    return screen.getByLabelText(/message/i) as HTMLTextAreaElement
  }

  it('renders a multi-line <textarea> composer (not a single-line <input>)', () => {
    render(<ChatComposer onSend={() => {}} />)
    expect(getComposer().tagName).toBe('TEXTAREA')
  })

  it('Enter sends (trimmed) and clears the draft', () => {
    const onSend = vi.fn()
    render(<ChatComposer onSend={onSend} />)
    const composer = getComposer()
    fireEvent.change(composer, { target: { value: '  hello world  ' } })

    fireEvent.keyDown(composer, { key: 'Enter' })

    expect(onSend).toHaveBeenCalledWith('hello world')
    expect(composer.value).toBe('')
  })

  it('Shift+Enter does NOT send (newline-insert path)', () => {
    const onSend = vi.fn()
    render(<ChatComposer onSend={onSend} />)
    const composer = getComposer()
    fireEvent.change(composer, { target: { value: 'line one' } })

    fireEvent.keyDown(composer, { key: 'Enter', shiftKey: true })

    expect(onSend).not.toHaveBeenCalled()
  })

  it('Enter with empty / whitespace-only draft does nothing', () => {
    const onSend = vi.fn()
    render(<ChatComposer onSend={onSend} />)
    const composer = getComposer()
    fireEvent.change(composer, { target: { value: '   \n   ' } })

    fireEvent.keyDown(composer, { key: 'Enter' })

    expect(onSend).not.toHaveBeenCalled()
  })

  it('Enter while `disabled` does nothing', () => {
    const onSend = vi.fn()
    render(<ChatComposer onSend={onSend} disabled />)
    const composer = getComposer()
    expect(composer).toBeDisabled()

    // Even if a keydown reaches the handler, the guard rejects it.
    fireEvent.keyDown(composer, { key: 'Enter' })

    expect(onSend).not.toHaveBeenCalled()
  })

  it('Enter during IME composition does NOT send', () => {
    const onSend = vi.fn()
    render(<ChatComposer onSend={onSend} />)
    const composer = getComposer()
    fireEvent.change(composer, { target: { value: 'hi' } })

    fireEvent.keyDown(composer, { key: 'Enter', isComposing: true })

    expect(onSend).not.toHaveBeenCalled()
  })
})

describe('ChatComposer wide-screen breathing room (IMPRV-026)', () => {
  it("the composer's <form> carries a `sm:mb-4` utility so on viewports ≥640px there's visible breathing room between the composer and the viewport bottom edge", () => {
    // Mobile (<640px): no mb-* rule applies and the composer remains flush
    // with the visual-viewport bottom for the IMPRV-017 / IMPRV-020 keyboard-
    // pin behavior. Larger viewports get 1rem (16px) of clearance.
    render(<ChatComposer onSend={() => {}} />)
    const composer = screen.getByLabelText(/message/i)
    // The form is the composer's parent — Textarea is the labelled element,
    // and the form is the direct ancestor of both the textarea and the
    // Send button (see ChatComposer.tsx render).
    const form = composer.closest('form')
    expect(form, 'expected to find the composer <form>').toBeTruthy()
    expect(form!.className).toMatch(/\bsm:mb-4\b/)
    // Negative guard: a bare `mb-4` (not sm-gated) would apply on phones
    // and re-introduce the IMPRV-017 keyboard-pin regression.
    expect(form!.className).not.toMatch(/(^|\s)mb-4(\s|$)/)
  })
})
