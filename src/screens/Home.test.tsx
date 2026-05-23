import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Home } from './Home'
import { ScreenChromeContext, type ScreenChromeValue } from '../components/ScreenChrome'

const SHOWCASE_CHROME: ScreenChromeValue = {
  landmark: 'region',
  headingLevelOffset: 1,
  suppressInitialFocus: true,
}

describe('Home focus-on-mount (A11Y-005 + A11Y-022)', () => {
  it('focuses the <h1> on mount under the default ScreenChrome context (A11Y-005 regression guard)', async () => {
    render(<Home onStart={() => {}} />)
    const heading = screen.getByRole('heading', { level: 1, name: /serverless p2p chat/i })

    await waitFor(() => {
      expect(document.activeElement).toBe(heading)
    })
  })

  it('does NOT focus the heading when rendered inside a showcase context with suppressInitialFocus: true (A11Y-022)', async () => {
    render(
      <ScreenChromeContext.Provider value={SHOWCASE_CHROME}>
        <Home onStart={() => {}} />
      </ScreenChromeContext.Provider>,
    )
    // The heading exists (now demoted to <h2> by the showcase chrome).
    const heading = screen.getByRole('heading', { level: 2, name: /serverless p2p chat/i })

    // Effects flush — give react a chance to run mount effects.
    await waitFor(() => {
      expect(heading).toBeInTheDocument()
    })

    expect(document.activeElement).not.toBe(heading)
    expect(document.activeElement?.closest('[role="region"]')).toBeNull()
  })
})
