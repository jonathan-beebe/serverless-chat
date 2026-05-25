import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
// Import the test driver directly from the mock file. Production code imports
// from the `virtual:pwa-register/react` alias (typed by vite-plugin-pwa) which
// doesn't expose `__pwaTest`; the alias and this path resolve to the same
// module under vitest, so shared module-level state stays consistent.
import { __pwaTest } from '../__mocks__/virtual-pwa-register-react'
import { UpdatePrompt } from './UpdatePrompt'

// IMPRV-022: the banner is driven by `useRegisterSW`'s `needRefresh` flag
// (mocked at module scope by `src/__mocks__/virtual-pwa-register-react.ts`).
// Tests flip the flag via `__pwaTest.setNeedRefresh(true)` inside `act(...)`
// and assert the banner renders only on Home and only until the user
// dismisses it for the session.

describe('UpdatePrompt (IMPRV-022)', () => {
  beforeEach(() => {
    __pwaTest.reset()
  })
  afterEach(() => {
    __pwaTest.reset()
  })

  function renderAt(pathname: string) {
    return render(
      <MemoryRouter initialEntries={[pathname]}>
        <UpdatePrompt />
      </MemoryRouter>,
    )
  }

  it('does not render the banner when no waiting service worker exists', () => {
    renderAt('/')
    expect(screen.queryByRole('button', { name: /^update$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^dismiss$/i })).not.toBeInTheDocument()
  })

  it('renders the banner on Home once the SW reports `needRefresh`', () => {
    renderAt('/')
    expect(screen.queryByRole('button', { name: /^update$/i })).not.toBeInTheDocument()
    act(() => {
      __pwaTest.setNeedRefresh(true)
    })
    expect(screen.getByRole('button', { name: /^update$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^dismiss$/i })).toBeInTheDocument()
  })

  it('does not render the banner outside Home even when the SW reports `needRefresh`', () => {
    act(() => {
      __pwaTest.setNeedRefresh(true)
    })
    renderAt('/conversation/abc')
    expect(screen.queryByRole('button', { name: /^update$/i })).not.toBeInTheDocument()
  })

  it('does not render the banner on the connected-chat preview route either (mounts the connected branch)', () => {
    act(() => {
      __pwaTest.setNeedRefresh(true)
    })
    renderAt('/design-system/chat')
    expect(screen.queryByRole('button', { name: /^update$/i })).not.toBeInTheDocument()
  })

  it('clicking Update calls `updateServiceWorker(true)` so the waiting SW skips waiting and reloads onto the new build', async () => {
    const user = userEvent.setup()
    renderAt('/')
    act(() => {
      __pwaTest.setNeedRefresh(true)
    })
    await user.click(screen.getByRole('button', { name: /^update$/i }))
    expect(__pwaTest.updateServiceWorkerCalls()).toContain(true)
  })

  it('clicking Dismiss hides the banner for the rest of the session even though the SW is still waiting', async () => {
    const user = userEvent.setup()
    renderAt('/')
    act(() => {
      __pwaTest.setNeedRefresh(true)
    })
    expect(screen.getByRole('button', { name: /^update$/i })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^dismiss$/i }))
    expect(screen.queryByRole('button', { name: /^update$/i })).not.toBeInTheDocument()
    // Module-level `needRefresh` is still true — the next page load will
    // bring the banner back. We just dismissed the in-memory view of it.
  })

  it('announces "App update available" via a polite live region when the banner appears', () => {
    renderAt('/')
    act(() => {
      __pwaTest.setNeedRefresh(true)
    })
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent(/app update available/i)
    expect(status).toHaveAttribute('aria-live', 'polite')
  })
})
