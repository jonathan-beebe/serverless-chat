import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { DesignSystemChat } from './DesignSystemChat'

// IMPRV-030: the design-system mock chat route exists to give reviewers a way
// to *see* the read-cursor visual without negotiating SDPs between two
// devices. The fixture pre-seeds the cursor on the second-to-last message so
// the "Last read" divider can render above the newest message.
//
// IMPRV-032: marker visibility is now scroll-gated — the divider is hidden
// while the user is at the bottom (since there's nothing to catch up to) and
// only renders when scrolled back. The route can no longer demo the marker on
// first paint; it surfaces after a manual scrollback. These tests assert both
// halves of that invariant: hidden on initial mount, visible (and correctly
// positioned) after scrollback.
describe('DesignSystemChat read-cursor demo (IMPRV-030 + IMPRV-032)', () => {
  function renderRoute() {
    return render(
      <MemoryRouter initialEntries={['/design-system/chat']}>
        <Routes>
          <Route path="/design-system/chat" element={<DesignSystemChat />} />
        </Routes>
      </MemoryRouter>,
    )
  }

  function getTranscript(): HTMLDivElement {
    return screen.getByRole('log', { name: /chat transcript/i }) as HTMLDivElement
  }

  function stubScroll(el: Element, { scrollHeight, clientHeight }: { scrollHeight: number; clientHeight: number }) {
    Object.defineProperty(el, 'scrollHeight', { configurable: true, value: scrollHeight })
    Object.defineProperty(el, 'clientHeight', { configurable: true, value: clientHeight })
  }

  function scrollBack(transcript: HTMLDivElement) {
    stubScroll(transcript, { scrollHeight: 800, clientHeight: 200 })
    transcript.scrollTop = 0 // 600px from bottom — clearly scrolled back
    fireEvent.scroll(transcript)
  }

  it('hides the "Last read" marker on initial mount (IMPRV-032 at-bottom gate)', () => {
    // Default render: the auto-scroll snaps to bottom, so `isNearBottom` is
    // true and the marker is suppressed even though the persisted cursor
    // (ds-4) is behind the newest message (ds-5).
    renderRoute()
    expect(document.querySelector('[data-testid="last-read-marker"]')).toBeNull()
  })

  it('positions the marker BETWEEN ds-4 and ds-5 once the user scrolls back', () => {
    renderRoute()
    scrollBack(getTranscript())

    const marker = document.querySelector('[data-testid="last-read-marker"]')
    expect(marker).toBeTruthy()
    expect(marker?.textContent).toMatch(/last read/i)

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
