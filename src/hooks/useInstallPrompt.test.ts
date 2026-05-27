// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useInstallPrompt } from './useInstallPrompt'

// FEAT-015: the install prompt hook listens for `beforeinstallprompt`
// (Chromium-only), holds the captured event after `preventDefault()`, exposes
// `promptInstall()` which calls the event's `prompt()` and awaits `userChoice`,
// and clears state on `appinstalled` OR after `userChoice` resolves (either
// outcome).
//
// Tests dispatch real DOM events with the
// `BeforeInstallPromptEvent`-shaped surface attached. jsdom carries `Event`
// already; the `prompt()` and `userChoice` properties are spy-controlled per
// test.

interface FakeInstallEvent extends Event {
  prompt: ReturnType<typeof vi.fn>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function fireBeforeInstallPrompt(outcome: 'accepted' | 'dismissed' = 'accepted'): FakeInstallEvent {
  // `cancelable: true` so the hook's `evt.preventDefault()` flips
  // `defaultPrevented` (Event defaults to non-cancelable). The real
  // BeforeInstallPromptEvent ships cancelable.
  const e = new Event('beforeinstallprompt', { cancelable: true }) as FakeInstallEvent
  e.prompt = vi.fn(() => Promise.resolve())
  e.userChoice = Promise.resolve({ outcome })
  window.dispatchEvent(e)
  return e
}

describe('useInstallPrompt (FEAT-015)', () => {
  afterEach(() => {
    // Defense in depth — if a test forgot to drain the event, drop any latent
    // listeners by re-importing would be cleanest, but unmount in renderHook
    // handles it.
  })

  it('starts with canInstall=false until the browser fires beforeinstallprompt', () => {
    const { result } = renderHook(() => useInstallPrompt())
    expect(result.current.canInstall).toBe(false)
  })

  it('flips canInstall=true when the browser fires beforeinstallprompt', () => {
    const { result } = renderHook(() => useInstallPrompt())
    act(() => {
      fireBeforeInstallPrompt()
    })
    expect(result.current.canInstall).toBe(true)
  })

  it('calls preventDefault on the captured event so it can be re-prompted later', () => {
    const { result } = renderHook(() => useInstallPrompt())
    const captured: { event: FakeInstallEvent | null } = { event: null }
    act(() => {
      captured.event = fireBeforeInstallPrompt()
    })
    // The hook must call preventDefault so the browser defers to our UI.
    expect(captured.event?.defaultPrevented).toBe(true)
    expect(result.current.canInstall).toBe(true)
  })

  it('promptInstall() invokes the captured event prompt() and clears canInstall after userChoice resolves (accepted)', async () => {
    const { result } = renderHook(() => useInstallPrompt())
    const captured: { event: FakeInstallEvent | null } = { event: null }
    act(() => {
      captured.event = fireBeforeInstallPrompt('accepted')
    })
    expect(result.current.canInstall).toBe(true)

    await act(async () => {
      await result.current.promptInstall()
    })
    expect(captured.event?.prompt).toHaveBeenCalledTimes(1)
    expect(result.current.canInstall).toBe(false)
  })

  it('promptInstall() also clears canInstall on dismissed userChoice (event is single-use either way)', async () => {
    const { result } = renderHook(() => useInstallPrompt())
    act(() => {
      fireBeforeInstallPrompt('dismissed')
    })
    await act(async () => {
      await result.current.promptInstall()
    })
    expect(result.current.canInstall).toBe(false)
  })

  it('clears canInstall when the window fires appinstalled (successful install signal)', () => {
    const { result } = renderHook(() => useInstallPrompt())
    act(() => {
      fireBeforeInstallPrompt()
    })
    expect(result.current.canInstall).toBe(true)
    act(() => {
      window.dispatchEvent(new Event('appinstalled'))
    })
    expect(result.current.canInstall).toBe(false)
  })

  it('promptInstall() is a safe no-op when no event has been captured', async () => {
    const { result } = renderHook(() => useInstallPrompt())
    await expect(result.current.promptInstall()).resolves.toBeUndefined()
    expect(result.current.canInstall).toBe(false)
  })
})
