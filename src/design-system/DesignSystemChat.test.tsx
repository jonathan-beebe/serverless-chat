import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { DesignSystemChat } from './DesignSystemChat'

// IMPRV-030: the design-system mock chat route exists to give reviewers a
// way to *see* the read-cursor visual without negotiating SDPs between two
// devices. The fixture pre-seeds the cursor on the second-to-last message
// so the "Last read" divider renders above the newest one on first paint.
// `markRead` is intentionally a no-op in this stub — every fixture bubble
// is visible on mount, so any forward advancement would immediately hide
// the divider the route exists to demonstrate. This test guards against
// either of those guarantees regressing.
describe('DesignSystemChat read-cursor demo (IMPRV-030)', () => {
  function renderRoute() {
    return render(
      <MemoryRouter initialEntries={['/design-system/chat']}>
        <Routes>
          <Route path="/design-system/chat" element={<DesignSystemChat />} />
        </Routes>
      </MemoryRouter>,
    )
  }

  it('renders the "Last read" divider on initial mount so the route demos the IMPRV-030 marker visually', () => {
    renderRoute()
    const marker = document.querySelector('[data-testid="last-read-marker"]')
    expect(marker).toBeTruthy()
    expect(marker?.textContent).toMatch(/last read/i)
  })

  it('positions the marker BETWEEN the second-to-last message (ds-4) and the newest (ds-5)', () => {
    renderRoute()
    const list = screen.getByRole('list')
    // Walk the <li>s in DOM order and collect a sequence of message-id /
    // divider-id labels so the assertion describes the actual layout.
    const sequence = Array.from(list.children).map((li) => {
      if (li.getAttribute('data-testid') === 'last-read-marker') return 'last-read'
      const msgId = li.getAttribute('data-message-id')
      if (msgId) return `msg:${msgId}`
      if (li.getAttribute('data-testid') === 'date-header') return 'date-header'
      return 'other'
    })
    // The fixture spans two local days, so a date-header divides ds-1..ds-4
    // from ds-5; the "Last read" marker must sit immediately after ds-4 and
    // before the day-2 date header that introduces ds-5.
    const lastReadIdx = sequence.indexOf('last-read')
    expect(lastReadIdx).toBeGreaterThan(-1)
    expect(sequence[lastReadIdx - 1]).toBe('msg:ds-4')
    // What follows the marker is either ds-5 directly or the day-2 date
    // header (depending on host timezone — fixture spans local-day rollover).
    // Either way, ds-5 must come AFTER the marker, never before.
    const ds5Idx = sequence.indexOf('msg:ds-5')
    expect(ds5Idx).toBeGreaterThan(lastReadIdx)
  })
})
