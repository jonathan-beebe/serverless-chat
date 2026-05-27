import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { InstallPrompt } from './InstallPrompt'

// FEAT-015: integration test for the install CTA. Drives the real
// `beforeinstallprompt` + `appinstalled` window events and the matchMedia
// surface; asserts the CTA appears only when the browser offers install AND
// the app isn't already standalone, and disappears after accept / appinstalled.

interface FakeInstallEvent extends Event {
  prompt: ReturnType<typeof vi.fn>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function fireBeforeInstallPrompt(outcome: 'accepted' | 'dismissed' = 'accepted'): FakeInstallEvent {
  // `cancelable: true` so the hook's `evt.preventDefault()` works (Event
  // defaults to non-cancelable). Real BeforeInstallPromptEvent is cancelable.
  const e = new Event('beforeinstallprompt', { cancelable: true }) as FakeInstallEvent
  e.prompt = vi.fn(() => Promise.resolve())
  e.userChoice = Promise.resolve({ outcome })
  window.dispatchEvent(e)
  return e
}

interface MockMediaQueryList {
  matches: boolean
  media: string
  addEventListener: () => void
  removeEventListener: () => void
}

function installMatchMedia(matches: boolean) {
  const mql: MockMediaQueryList = {
    matches,
    media: '(display-mode: standalone)',
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  ;(window as unknown as { matchMedia: (q: string) => MockMediaQueryList }).matchMedia = () => mql
}

describe('InstallPrompt (FEAT-015)', () => {
  const originalMatchMedia = window.matchMedia
  const originalNavStandalone = (navigator as unknown as { standalone?: boolean }).standalone

  beforeEach(() => {
    installMatchMedia(false)
    delete (navigator as unknown as { standalone?: boolean }).standalone
  })

  afterEach(() => {
    ;(window as unknown as { matchMedia: typeof window.matchMedia }).matchMedia = originalMatchMedia
    if (originalNavStandalone === undefined) {
      delete (navigator as unknown as { standalone?: boolean }).standalone
    } else {
      ;(navigator as unknown as { standalone?: boolean }).standalone = originalNavStandalone
    }
  })

  it('does not render the CTA before the browser fires beforeinstallprompt (iOS Safari / Firefox / unsupported)', () => {
    render(<InstallPrompt />)
    expect(screen.queryByRole('button', { name: /install/i })).not.toBeInTheDocument()
  })

  it('renders the Install button after beforeinstallprompt fires (Chrome/Edge desktop or Android)', () => {
    render(<InstallPrompt />)
    act(() => {
      fireBeforeInstallPrompt()
    })
    expect(screen.getByRole('button', { name: /install/i })).toBeInTheDocument()
  })

  it('clicking Install invokes the captured event prompt() and removes the CTA once userChoice resolves', async () => {
    const user = userEvent.setup()
    render(<InstallPrompt />)
    const captured: { event: FakeInstallEvent | null } = { event: null }
    act(() => {
      captured.event = fireBeforeInstallPrompt('accepted')
    })
    const installButton = screen.getByRole('button', { name: /install/i })
    await user.click(installButton)
    expect(captured.event?.prompt).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: /install/i })).not.toBeInTheDocument()
  })

  it('removes the CTA when the window fires appinstalled, even without a click (install happened via browser UI)', () => {
    render(<InstallPrompt />)
    act(() => {
      fireBeforeInstallPrompt()
    })
    expect(screen.getByRole('button', { name: /install/i })).toBeInTheDocument()
    act(() => {
      window.dispatchEvent(new Event('appinstalled'))
    })
    expect(screen.queryByRole('button', { name: /install/i })).not.toBeInTheDocument()
  })

  it('does not render the CTA when the app is already running in standalone mode (matchMedia)', () => {
    installMatchMedia(true)
    render(<InstallPrompt />)
    act(() => {
      fireBeforeInstallPrompt()
    })
    expect(screen.queryByRole('button', { name: /install/i })).not.toBeInTheDocument()
  })

  it('does not render the CTA when navigator.standalone is true (iOS installed PWA)', () => {
    ;(navigator as unknown as { standalone?: boolean }).standalone = true
    render(<InstallPrompt />)
    // Even if a stray beforeinstallprompt fires (it won't on iOS, but defense-in-depth).
    act(() => {
      fireBeforeInstallPrompt()
    })
    expect(screen.queryByRole('button', { name: /install/i })).not.toBeInTheDocument()
  })

  it('announces "Install available" via a polite live region when the CTA appears', () => {
    render(<InstallPrompt />)
    act(() => {
      fireBeforeInstallPrompt()
    })
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent(/install available/i)
    expect(status).toHaveAttribute('aria-live', 'polite')
  })
})
