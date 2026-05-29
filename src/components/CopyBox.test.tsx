import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CopyBox } from './CopyBox'

describe('CopyBox copy behavior', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
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

  it('A11Y-020: "Copied!" persists well past the former 1500ms auto-dismiss window (Timing Adjustable, WCAG 2.2.1)', async () => {
    setClipboardWriteText(vi.fn().mockResolvedValue(undefined))

    render(<CopyBox value="payload-value" label="Answer code" />)
    fireEvent.click(screen.getByRole('button', { name: /copy/i }))

    // The async clipboard promise must resolve before the confirmation appears.
    await waitFor(() => {
      expect(screen.getByText('Copied!')).toBeInTheDocument()
    })

    // Switch to fake timers after the async path has settled. The contract is
    // that no wall-clock dismissal fires — advancing the clock far past the
    // former 1500ms hard-coded timer must not remove the confirmation.
    vi.useFakeTimers()
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(screen.getByText('Copied!')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    expect(screen.getByText('Copied!')).toBeInTheDocument()
  })

  it('A11Y-020: clicking Copy again clears prior "Copied!" state before the new outcome is rendered', async () => {
    // First click succeeds; second click fails both clipboard paths so the
    // component would render the manual-copy warning instead of "Copied!".
    // The prior success confirmation must not linger alongside the new failure.
    let writeTextImpl: (text: string) => Promise<void> = vi.fn().mockResolvedValue(undefined)
    setClipboardWriteText((text) => writeTextImpl(text))

    render(<CopyBox value="payload-value" label="Answer code" />)
    fireEvent.click(screen.getByRole('button', { name: /copy/i }))
    await waitFor(() => {
      expect(screen.getByText('Copied!')).toBeInTheDocument()
    })

    // Swap in a failing implementation, plus a failing execCommand fallback.
    writeTextImpl = vi.fn().mockRejectedValue(new Error('blocked'))
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: vi.fn().mockReturnValue(false),
    })

    fireEvent.click(screen.getByRole('button', { name: /copy/i }))

    await waitFor(() => {
      // New outcome: the manual-copy warning is shown.
      expect(screen.getByText(/Ctrl\+C/)).toBeInTheDocument()
    })
    // And the stale "Copied!" from the previous attempt must be gone.
    expect(screen.queryByText('Copied!')).not.toBeInTheDocument()
  })

  it('A11Y-020: changing the `value` prop clears a previous "Copied!" confirmation', async () => {
    setClipboardWriteText(vi.fn().mockResolvedValue(undefined))

    const { rerender } = render(<CopyBox value="first-value" label="Answer code" />)
    fireEvent.click(screen.getByRole('button', { name: /copy/i }))

    await waitFor(() => {
      expect(screen.getByText('Copied!')).toBeInTheDocument()
    })

    // The thing in the box is no longer the thing on the clipboard. The
    // confirmation must clear so the user is not misled about what was copied.
    rerender(<CopyBox value="second-value" label="Answer code" />)
    expect(screen.queryByText('Copied!')).not.toBeInTheDocument()
  })
})

describe('CopyBox web share behavior (FEAT-014)', () => {
  const originalShare = (navigator as { share?: unknown }).share
  const originalCanShare = (navigator as { canShare?: unknown }).canShare

  afterEach(() => {
    vi.restoreAllMocks()
    // Restore the original share/canShare slots so each test sees a clean nav.
    if (originalShare === undefined) {
      delete (navigator as { share?: unknown }).share
    } else {
      Object.defineProperty(navigator, 'share', { configurable: true, value: originalShare })
    }
    if (originalCanShare === undefined) {
      delete (navigator as { canShare?: unknown }).canShare
    } else {
      Object.defineProperty(navigator, 'canShare', { configurable: true, value: originalCanShare })
    }
  })

  function stubShare(share: (data: ShareData) => Promise<void>, canShare: (data: ShareData) => boolean = () => true) {
    Object.defineProperty(navigator, 'share', { configurable: true, value: share })
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: canShare })
  }

  function removeShare() {
    delete (navigator as { share?: unknown }).share
    delete (navigator as { canShare?: unknown }).canShare
  }

  it('renders a Share button when navigator.share + canShare both signal support and `share` prop is set', () => {
    stubShare(vi.fn().mockResolvedValue(undefined))

    render(
      <CopyBox
        value="https://example.test/#offer=abc"
        label="Invite URL"
        share={{ title: 'Invite a friend', text: 'Join my chat', url: 'https://example.test/#offer=abc' }}
      />,
    )

    expect(screen.getByRole('button', { name: /share/i })).toBeInTheDocument()
    // Copy MUST still be present — share is additive, not a replacement.
    expect(screen.getByRole('button', { name: /^copy$/i })).toBeInTheDocument()
  })

  it('does NOT render the Share button when `share` prop is omitted (existing copy affordance unchanged)', () => {
    stubShare(vi.fn().mockResolvedValue(undefined))

    render(<CopyBox value="payload-value" label="Answer code" />)

    expect(screen.queryByRole('button', { name: /share/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^copy$/i })).toBeInTheDocument()
  })

  it('does NOT render Share when navigator.share is missing (desktop Firefox / unsupported)', () => {
    removeShare()

    render(
      <CopyBox
        value="https://example.test/#offer=abc"
        label="Invite URL"
        share={{ url: 'https://example.test/#offer=abc' }}
      />,
    )

    expect(screen.queryByRole('button', { name: /share/i })).not.toBeInTheDocument()
    // The existing Copy affordance must remain unchanged.
    expect(screen.getByRole('button', { name: /^copy$/i })).toBeInTheDocument()
  })

  it('does NOT render Share when navigator.canShare returns false for the payload', () => {
    stubShare(vi.fn().mockResolvedValue(undefined), () => false)

    render(
      <CopyBox
        value="https://example.test/#offer=abc"
        label="Invite URL"
        share={{ url: 'https://example.test/#offer=abc' }}
      />,
    )

    expect(screen.queryByRole('button', { name: /share/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^copy$/i })).toBeInTheDocument()
  })

  it('calls navigator.share with the supplied payload when Share is clicked', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    stubShare(share)
    const payload = { title: 'Invite a friend', text: 'Join my chat', url: 'https://example.test/#offer=abc' }

    render(<CopyBox value={payload.url} label="Invite URL" share={payload} />)
    fireEvent.click(screen.getByRole('button', { name: /share/i }))

    await waitFor(() => {
      expect(share).toHaveBeenCalledWith(payload)
    })
  })

  it('invokes navigator.share synchronously in the click handler (preserves transient user activation)', () => {
    // The Web Share API requires a transient user activation; any awaited work
    // between the click and `navigator.share(...)` drops the activation on
    // Safari/iOS. Assert the call happens before the click handler returns.
    const share = vi.fn().mockResolvedValue(undefined)
    stubShare(share)

    render(
      <CopyBox
        value="https://example.test/#offer=abc"
        label="Invite URL"
        share={{ url: 'https://example.test/#offer=abc' }}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /share/i }))

    // No `await waitFor` — must already have been called by the time click returns.
    expect(share).toHaveBeenCalledTimes(1)
  })

  it('focuses Copy (not Share) on mount when autoFocus is set and Share is supported (A11Y-044)', () => {
    // A11Y-044: Share is the visual primary on mobile (FEAT-014), but it
    // must NOT claim initial keyboard focus. Copy is the durable,
    // in-document, cross-browser default across every CopyBox instance in
    // the app — the invite branch is the one place where Share availability
    // would otherwise contradict that. Keyboard / AT users on browsers that
    // expose navigator.share (now including Chrome desktop) must land on
    // Copy when the screen settles.
    stubShare(vi.fn().mockResolvedValue(undefined))

    render(
      <CopyBox
        value="https://example.test/#offer=abc"
        label="Invite URL"
        autoFocus
        share={{ title: 'Invite a friend', text: 'Join my chat', url: 'https://example.test/#offer=abc' }}
      />,
    )

    expect(screen.getByRole('button', { name: /^copy$/i })).toHaveFocus()
    expect(screen.getByRole('button', { name: /^share$/i })).not.toHaveFocus()
  })

  it('still focuses Copy on mount when autoFocus is set and Share is unsupported (baseline pairing for A11Y-044)', () => {
    removeShare()

    render(
      <CopyBox
        value="https://example.test/#offer=abc"
        label="Invite URL"
        autoFocus
        share={{ url: 'https://example.test/#offer=abc' }}
      />,
    )

    expect(screen.getByRole('button', { name: /^copy$/i })).toHaveFocus()
    expect(screen.queryByRole('button', { name: /^share$/i })).not.toBeInTheDocument()
  })

  it('swallows AbortError (user dismissed the share sheet) without surfacing an error', async () => {
    const abort = Object.assign(new Error('Share canceled'), { name: 'AbortError' })
    const share = vi.fn().mockRejectedValue(abort)
    stubShare(share)

    render(
      <CopyBox
        value="https://example.test/#offer=abc"
        label="Invite URL"
        share={{ url: 'https://example.test/#offer=abc' }}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /share/i }))

    // Wait for the rejected promise to settle. The test-setup wrapper turns
    // any `console.error` into a thrown error, so an unhandled / surfaced
    // AbortError would have already crashed the test by the time we get here.
    await waitFor(() => {
      expect(share).toHaveBeenCalled()
    })

    // No visible error UI — Copy remains the durable fallback.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
