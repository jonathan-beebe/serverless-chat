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

  it("moves focus to each screen's primary action on navigation (WCAG 2.4.3)", () => {
    // Each screen focuses its primary action button (or primary form field)
    // on mount so keyboard users can act immediately instead of landing on
    // <body>. Home's primary action is "Start a chat"; Joiner's invite branch
    // primary action is "Accept".
    render(<App />)
    expect(screen.getByRole('button', { name: /start a chat/i })).toHaveFocus()

    const payload = encode({ type: 'offer', sdp: 'v=0\r\n' })
    act(() => {
      history.replaceState(null, '', `/#offer=${payload}`)
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    expect(screen.getByRole('button', { name: /^accept$/i })).toHaveFocus()
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

  it('renders the design system page when the hash is #design-system on mount', () => {
    history.replaceState(null, '', '/#design-system')
    render(<App />)
    expect(screen.getByRole('heading', { level: 1, name: /design system/i })).toBeInTheDocument()
  })

  it('routes into the design system when the hash changes to #design-system after mount', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: /serverless p2p chat/i })).toBeInTheDocument()

    act(() => {
      history.replaceState(null, '', '/#design-system')
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })

    expect(screen.getByRole('heading', { level: 1, name: /design system/i })).toBeInTheDocument()
  })

  it('does NOT scrub the hash when entering #design-system (user wants to bookmark / refresh there)', () => {
    history.replaceState(null, '', '/#design-system')
    render(<App />)
    expect(location.hash).toBe('#design-system')
  })

  it('returns to Home when the hash is cleared after a #design-system visit', () => {
    history.replaceState(null, '', '/#design-system')
    render(<App />)
    expect(screen.getByRole('heading', { level: 1, name: /design system/i })).toBeInTheDocument()

    act(() => {
      history.replaceState(null, '', '/')
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })

    expect(screen.getByRole('heading', { name: /serverless p2p chat/i })).toBeInTheDocument()
  })

  it('sets document.title for the design system page', () => {
    history.replaceState(null, '', '/#design-system')
    render(<App />)
    expect(document.title).toBe('Design system · P2P Chat')
  })

  it('renders the network telemetry page when the hash is #network on mount (FEAT-010)', () => {
    history.replaceState(null, '', '/#network')
    render(<App />)
    expect(screen.getByRole('heading', { level: 1, name: /network telemetry/i })).toBeInTheDocument()
  })

  it('routes into #network when the hash changes after mount (FEAT-010)', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: /serverless p2p chat/i })).toBeInTheDocument()

    act(() => {
      history.replaceState(null, '', '/#network')
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })

    expect(screen.getByRole('heading', { level: 1, name: /network telemetry/i })).toBeInTheDocument()
  })

  it('does NOT scrub the hash when entering #network — page is bookmarkable (FEAT-010)', () => {
    history.replaceState(null, '', '/#network')
    render(<App />)
    expect(location.hash).toBe('#network')
  })

  it('sets document.title for the network page (FEAT-010)', () => {
    history.replaceState(null, '', '/#network')
    render(<App />)
    expect(document.title).toBe('Network telemetry · P2P Chat')
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
