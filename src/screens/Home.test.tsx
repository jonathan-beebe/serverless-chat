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
  it('focuses the "Start a chat" button on mount under the default ScreenChrome context', async () => {
    render(<Home onStart={() => {}} />)
    const startButton = screen.getByRole('button', { name: /start a chat/i })

    await waitFor(() => {
      expect(document.activeElement).toBe(startButton)
    })
  })

  it('does NOT focus the "Start a chat" button when rendered inside a showcase context with suppressInitialFocus: true (A11Y-022)', async () => {
    render(
      <ScreenChromeContext.Provider value={SHOWCASE_CHROME}>
        <Home onStart={() => {}} />
      </ScreenChromeContext.Provider>,
    )
    const startButton = screen.getByRole('button', { name: /start a chat/i })

    await waitFor(() => {
      expect(startButton).toBeInTheDocument()
    })

    expect(document.activeElement).not.toBe(startButton)
    expect(document.activeElement?.closest('[role="region"]')).toBeNull()
  })
})
