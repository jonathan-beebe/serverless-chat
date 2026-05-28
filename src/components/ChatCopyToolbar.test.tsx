import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ChatCopyToolbar } from './ChatCopyToolbar'
import type { ChatMessage } from '../core/rtc'

const DEFAULT_AT = Date.UTC(2026, 4, 22, 17, 23) // 2026-05-22T17:23:00Z

function msg(id: string, text: string, from: ChatMessage['from'] = 'them', at: number = DEFAULT_AT): ChatMessage {
  return { id, from, text, at }
}

describe('ChatCopyToolbar (FEAT-011)', () => {
  // Clipboard / execCommand stubs: jsdom doesn't implement either, so each
  // test wires the impl it cares about. `restoreAllMocks` in afterEach is
  // enough to reset spies between tests, but the navigator.clipboard /
  // document.execCommand `defineProperty` writes need an explicit teardown
  // (configurable: true ensures re-defining works).
  function setClipboardWriteText(impl: (text: string) => Promise<void>) {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: impl },
    })
  }

  function setExecCommand(impl: (cmd: string) => boolean) {
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: impl,
    })
  }

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('renders the copy toolbar (checkbox + button) above the transcript', () => {
    render(<ChatCopyToolbar messages={[msg('a', 'hi', 'them')]} />)
    const checkbox = screen.getByRole('checkbox', { name: /include timestamps/i })
    const copyBtn = screen.getByRole('button', { name: /^copy$/i })
    expect(checkbox).toBeInTheDocument()
    expect(copyBtn).toBeInTheDocument()
  })

  it('checkbox defaults to checked (timestamps on by default)', () => {
    render(<ChatCopyToolbar messages={[msg('a', 'hi', 'them')]} />)
    expect(screen.getByRole('checkbox', { name: /include timestamps/i })).toBeChecked()
  })

  // A11Y-029: Tailwind v4 preflight resets the browser default outline; the
  // checkbox needs the canonical focus-visible ring tokens (A11Y-017) so a
  // keyboard user can see when focus lands on it. `accent-sky-700` only
  // colors the check fill, not the focus state.
  it('Include-timestamps checkbox is keyboard-focusable so the A11Y-029 focus ring lands somewhere visible', () => {
    render(<ChatCopyToolbar messages={[msg('a', 'hi', 'them')]} />)
    const checkbox = screen.getByRole('checkbox', { name: /include timestamps/i })
    checkbox.focus()
    expect(checkbox).toHaveFocus()
    // A11Y-029 visible focus ring (focus-visible:ring-2 / ring-sky-400 /
    // ring-offset-2 / ring-offset-stone-50 / dark:ring-offset-stone-900,
    // with focus-visible:outline-none replacing the UA outline) is owned by
    // ChatCopyToolbar.tsx. The ring rendering is verified by visual
    // regression — Tailwind utilities do not produce computed styles in jsdom.
  })

  // A11Y-034: superseded "Copy button is disabled" assertion. The toolbar
  // (checkbox + button) is now hidden entirely while messages is empty so
  // SR users tabbing through controls don't land on a dimmed Copy button
  // with no programmatic explanation for the disabled state.
  it('Copy toolbar is hidden when messages is empty and appears once the first message arrives (A11Y-034)', () => {
    const { rerender } = render(<ChatCopyToolbar messages={[]} />)
    expect(screen.queryByRole('button', { name: /^copy$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /include timestamps/i })).not.toBeInTheDocument()

    rerender(<ChatCopyToolbar messages={[msg('a', 'hi', 'them')]} />)
    expect(screen.getByRole('button', { name: /^copy$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^copy$/i })).not.toBeDisabled()
    expect(screen.getByRole('checkbox', { name: /include timestamps/i })).toBeInTheDocument()
  })

  it('clicking Copy with toggle ON writes the timestamped markdown to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    setClipboardWriteText(writeText)

    const messages: ChatMessage[] = [msg('a', 'hello', 'me'), msg('b', 'hi back', 'them')]
    render(<ChatCopyToolbar messages={messages} />)

    fireEvent.click(screen.getByRole('button', { name: /^copy$/i }))

    await waitFor(() => expect(writeText).toHaveBeenCalled())
    const written = writeText.mock.calls[0][0] as string
    // Timestamped form: starts with `# ` and includes `**You** · ` / `**Them** · `.
    expect(written).toMatch(/^# /)
    expect(written).toContain('**You** · ')
    expect(written).toContain('**Them** · ')
    expect(written).toContain('hello')
    expect(written).toContain('hi back')
  })

  it('clicking Copy with toggle OFF writes the names-only markdown to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    setClipboardWriteText(writeText)

    const messages: ChatMessage[] = [msg('a', 'hello', 'me')]
    render(<ChatCopyToolbar messages={messages} />)

    fireEvent.click(screen.getByRole('checkbox', { name: /include timestamps/i }))
    expect(screen.getByRole('checkbox', { name: /include timestamps/i })).not.toBeChecked()

    fireEvent.click(screen.getByRole('button', { name: /^copy$/i }))

    await waitFor(() => expect(writeText).toHaveBeenCalled())
    const written = writeText.mock.calls[0][0] as string
    expect(written).not.toMatch(/^# /)
    expect(written).not.toContain('·')
    expect(written).toContain('**You**\nhello')
  })

  it('shows the "Copied!" badge after a successful clipboard write and clears it after ~1500ms', async () => {
    // Fake timers from the start so the setTimeout scheduled inside the
    // click handler is captured by `vi.advanceTimersByTime` below. The async
    // clipboard promise resolves on the microtask queue, which `await
    // Promise.resolve()` (and `waitFor` with `vi.advanceTimersByTimeAsync`)
    // flushes — but here we use the simpler explicit pattern: schedule fake
    // timers, click, then drain microtasks and advance.
    vi.useFakeTimers({ shouldAdvanceTime: true })
    setClipboardWriteText(vi.fn().mockResolvedValue(undefined))

    render(<ChatCopyToolbar messages={[msg('a', 'hi', 'me')]} />)
    fireEvent.click(screen.getByRole('button', { name: /^copy$/i }))

    await waitFor(() => expect(screen.getByText('Copied!')).toBeInTheDocument())

    // The badge auto-dismisses ~1500ms later (FEAT-011 AC #13).
    act(() => {
      vi.advanceTimersByTime(1500)
    })
    expect(screen.queryByText('Copied!')).not.toBeInTheDocument()
  })

  it('falls back to document.execCommand("copy") when writeText rejects, and still flashes "Copied!"', async () => {
    setClipboardWriteText(vi.fn().mockRejectedValue(new Error('blocked')))
    const execCommand = vi.fn().mockReturnValue(true)
    setExecCommand(execCommand)

    render(<ChatCopyToolbar messages={[msg('a', 'hi', 'me')]} />)
    fireEvent.click(screen.getByRole('button', { name: /^copy$/i }))

    await waitFor(() => expect(screen.getByText('Copied!')).toBeInTheDocument())
    expect(execCommand).toHaveBeenCalledWith('copy')
  })

  it('renders the warning callout when both clipboard paths fail', async () => {
    setClipboardWriteText(vi.fn().mockRejectedValue(new Error('blocked')))
    setExecCommand(vi.fn().mockReturnValue(false))

    render(<ChatCopyToolbar messages={[msg('a', 'hi', 'me')]} />)
    fireEvent.click(screen.getByRole('button', { name: /^copy$/i }))

    await waitFor(() => expect(screen.getByText(/Ctrl\+C/)).toBeInTheDocument())
    expect(screen.queryByText('Copied!')).not.toBeInTheDocument()
  })

  it('invokes onCopySuccess after a successful copy (parent refocuses composer)', async () => {
    setClipboardWriteText(vi.fn().mockResolvedValue(undefined))
    const onCopySuccess = vi.fn()

    render(<ChatCopyToolbar messages={[msg('a', 'hi', 'me')]} onCopySuccess={onCopySuccess} />)
    fireEvent.click(screen.getByRole('button', { name: /^copy$/i }))

    await waitFor(() => expect(onCopySuccess).toHaveBeenCalledTimes(1))
  })

  it('does NOT invoke onCopySuccess when both clipboard paths fail', async () => {
    setClipboardWriteText(vi.fn().mockRejectedValue(new Error('blocked')))
    setExecCommand(vi.fn().mockReturnValue(false))
    const onCopySuccess = vi.fn()

    render(<ChatCopyToolbar messages={[msg('a', 'hi', 'me')]} onCopySuccess={onCopySuccess} />)
    fireEvent.click(screen.getByRole('button', { name: /^copy$/i }))

    await waitFor(() => expect(screen.getByText(/Ctrl\+C/)).toBeInTheDocument())
    expect(onCopySuccess).not.toHaveBeenCalled()
  })

  it('announces "Transcript copied to clipboard" via the live region on success', async () => {
    setClipboardWriteText(vi.fn().mockResolvedValue(undefined))

    render(<ChatCopyToolbar messages={[msg('a', 'hi', 'me')]} />)
    fireEvent.click(screen.getByRole('button', { name: /^copy$/i }))

    await waitFor(() => {
      // LiveRegion is a `role="status"` paragraph; check it carries the text.
      const live = document.querySelector('[role="status"]') as HTMLElement
      expect(live).toBeTruthy()
      expect(live.textContent).toMatch(/transcript copied to clipboard/i)
    })
  })

  it('keeps the "Copied!" badge aria-hidden (live region is the AT surface)', async () => {
    setClipboardWriteText(vi.fn().mockResolvedValue(undefined))

    render(<ChatCopyToolbar messages={[msg('a', 'hi', 'me')]} />)
    fireEvent.click(screen.getByRole('button', { name: /^copy$/i }))

    const badge = await screen.findByText('Copied!')
    expect(badge).toHaveAttribute('aria-hidden', 'true')
  })
})
