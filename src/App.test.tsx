import { render, screen, act } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import { encode } from './core/encoding'

// JSDOM ships with neither RTCPeerConnection nor the bits of `navigator` that
// the chat session uses. We don't exercise WebRTC here — these tests are
// strictly about *routing* into the Joiner screen.
class FakePeerConnection {
  iceGatheringState = 'complete'
  createDataChannel() {
    return { readyState: 'connecting', close() {} }
  }
  createOffer() {
    return Promise.resolve({ type: 'offer' as const, sdp: '' })
  }
  setLocalDescription() {
    return Promise.resolve()
  }
  addEventListener() {}
  removeEventListener() {}
  close() {}
}

beforeAll(() => {
  // @ts-expect-error stubbing minimal subset for jsdom
  globalThis.RTCPeerConnection = FakePeerConnection
})

afterEach(() => {
  // Reset between tests so one test's hash doesn't leak into the next.
  history.replaceState(null, '', '/')
  vi.restoreAllMocks()
})

describe('App routing', () => {
  it('renders Joiner when the page loads with #offer= already in the URL', () => {
    const payload = encode({ type: 'offer', sdp: 'v=0\r\n' })
    history.replaceState(null, '', `/#offer=${payload}`)

    render(<App />)

    // The Joiner's accept screen should be visible.
    expect(screen.getByRole('heading', { name: /you've been invited to chat/i })).toBeInTheDocument()
  })

  it('routes into Joiner when the hash changes AFTER mount (same-tab navigation)', () => {
    // Start on the home screen.
    render(<App />)
    expect(screen.getByRole('heading', { name: /serverless p2p chat/i })).toBeInTheDocument()

    // Now the OS opens the invite URL into this tab — only the hash changes.
    const payload = encode({ type: 'offer', sdp: 'v=0\r\n' })
    act(() => {
      history.replaceState(null, '', `/#offer=${payload}`)
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })

    expect(screen.getByRole('heading', { name: /you've been invited to chat/i })).toBeInTheDocument()
  })

  it('moves focus to the new screen heading on navigation (WCAG 2.4.3)', () => {
    // Home renders → its h1 should receive programmatic focus so keyboard /
    // screen-reader users land on a meaningful starting point.
    render(<App />)
    expect(screen.getByRole('heading', { name: /serverless p2p chat/i })).toHaveFocus()

    // Routing into Joiner via the hash should move focus to that screen's h1.
    const payload = encode({ type: 'offer', sdp: 'v=0\r\n' })
    act(() => {
      history.replaceState(null, '', `/#offer=${payload}`)
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    expect(screen.getByRole('heading', { name: /you've been invited to chat/i })).toHaveFocus()
  })

  it('scrubs the URL fragment on a same-tab joiner→joiner hashchange', () => {
    // Start with a joiner offer already in the URL — the initial render will
    // route into Joiner and (correctly) scrub the fragment.
    const firstPayload = encode({ type: 'offer', sdp: 'v=0\r\nfirst\r\n' })
    history.replaceState(null, '', `/#offer=${firstPayload}`)
    render(<App />)
    expect(location.hash).toBe('')

    // Now the OS opens a fresh invite URL into this same tab — only the hash
    // changes, and `route.kind` stays `'joiner'`. The fragment must still be
    // scrubbed so that a refresh doesn't re-enter the joiner flow with a
    // now-stale offer.
    const secondPayload = encode({ type: 'offer', sdp: 'v=0\r\nsecond\r\n' })
    act(() => {
      history.replaceState(null, '', `/#offer=${secondPayload}`)
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })

    expect(location.hash).toBe('')
  })

  it('updates document.title to reflect the current screen (WCAG 2.4.2)', () => {
    // Home keeps the base title.
    render(<App />)
    expect(document.title).toBe('P2P Chat')

    // Routing into Joiner via the hash should swap the title.
    const payload = encode({ type: 'offer', sdp: 'v=0\r\n' })
    act(() => {
      history.replaceState(null, '', `/#offer=${payload}`)
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    expect(document.title).toMatch(/you've been invited/i)
  })
})
