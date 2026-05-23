import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CopyBox } from './CopyBox'

describe('CopyBox copy behavior', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  function setClipboardWriteText(impl: (text: string) => Promise<void>) {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: impl },
    })
  }

  it('shows "Copied!" when navigator.clipboard.writeText succeeds', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    setClipboardWriteText(writeText)

    render(<CopyBox value="https://example.test/#abc" label="Invite URL" />)
    fireEvent.click(screen.getByRole('button', { name: /copy/i }))

    await waitFor(() => {
      expect(screen.getByText('Copied!')).toBeInTheDocument()
    })
    expect(writeText).toHaveBeenCalledWith('https://example.test/#abc')
  })

  it('falls back to document.execCommand("copy") when writeText rejects, and still signals "Copied!"', async () => {
    setClipboardWriteText(vi.fn().mockRejectedValue(new Error('blocked')))
    const execCommand = vi.fn().mockReturnValue(true)
    // jsdom doesn't implement execCommand; assign one we can spy on.
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: execCommand,
    })

    render(<CopyBox value="payload-value" label="Answer code" />)
    fireEvent.click(screen.getByRole('button', { name: /copy/i }))

    await waitFor(() => {
      expect(screen.getByText('Copied!')).toBeInTheDocument()
    })
    expect(execCommand).toHaveBeenCalledWith('copy')
  })

  it('surfaces a manual-copy hint and selects the text when both clipboard paths fail', async () => {
    setClipboardWriteText(vi.fn().mockRejectedValue(new Error('blocked')))
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: vi.fn().mockReturnValue(false),
    })

    render(<CopyBox value="payload-value" label="Answer code" />)
    const textarea = screen.getByLabelText(/answer code/i) as HTMLTextAreaElement
    const selectSpy = vi.spyOn(textarea, 'select')

    fireEvent.click(screen.getByRole('button', { name: /copy/i }))

    await waitFor(() => {
      // Visible hint to the sighted user (literal "+C" disambiguates from the
      // sr-only AT message which spells out "Control C / Command C").
      expect(screen.getByText(/Ctrl\+C/)).toBeInTheDocument()
    })
    expect(selectSpy).toHaveBeenCalled()
    // "Copied!" must NOT appear — the clipboard was not actually written.
    expect(screen.queryByText('Copied!')).not.toBeInTheDocument()
  })

  it('exposes the manual-copy hint to assistive tech (A11Y-019: not aria-hidden, wired via aria-describedby)', async () => {
    setClipboardWriteText(vi.fn().mockRejectedValue(new Error('blocked')))
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: vi.fn().mockReturnValue(false),
    })

    render(<CopyBox value="payload-value" label="Answer code" />)
    const textarea = screen.getByLabelText(/answer code/i) as HTMLTextAreaElement

    // Before the failed-copy state: textarea has no dangling describedby reference.
    expect(textarea.getAttribute('aria-describedby')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /copy/i }))

    // The hint must be reachable via accessible text (regression guard against
    // a future `aria-hidden="true"` reintroduction — `getByText` would still
    // resolve the node, so we additionally assert the attribute is absent).
    const hint = await screen.findByText(/Ctrl\+C/)
    expect(hint).not.toHaveAttribute('aria-hidden', 'true')

    // The hint is wired to the textarea so screen readers announce it on focus.
    const describedBy = textarea.getAttribute('aria-describedby')
    expect(describedBy).toBeTruthy()
    expect(describedBy).toBe(hint.id)
  })

  it('keeps the success "Copied!" callout aria-hidden (out of scope for A11Y-019; success is a confirmation, not an instruction)', async () => {
    setClipboardWriteText(vi.fn().mockResolvedValue(undefined))

    render(<CopyBox value="payload-value" label="Answer code" />)
    fireEvent.click(screen.getByRole('button', { name: /copy/i }))

    const copied = await screen.findByText('Copied!')
    // The success callout's AT path is the live region; the visible callout
    // stays aria-hidden so SRs don't double-announce the confirmation.
    expect(copied).toHaveAttribute('aria-hidden', 'true')
  })
})
