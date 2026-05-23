import { fireEvent, render, screen, act, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { App } from './App'
import { decode, encode } from './core/encoding'
import { __resetForTests as resetStorage } from './core/storage'

// JSDOM ships with neither RTCPeerConnection nor the bits of `navigator` that
// the chat session uses. The base routing tests don't exercise WebRTC, but
// the BUG-007 integration test below drives both the offerer flow and the
// polite-defer swap end-to-end — so the fake PC tracks `localDescription`
// against whatever `setLocalDescription` last received (otherwise the test
// can't tell an offer-shaped fake-encoded payload from an answer-shaped one).
class FakeDataChannel {
  readyState: 'connecting' | 'open' | 'closing' | 'closed' = 'connecting'
  onopen: (() => void) | null = null
  onclose: (() => void) | null = null
  onmessage: ((event: { data: unknown }) => void) | null = null
  send() {}
  close() {
    const wasOpen = this.readyState === 'open'
    this.readyState = 'closed'
    if (wasOpen) this.onclose?.()
  }
}

class FakePeerConnection {
  iceGatheringState: RTCIceGatheringState = 'complete'
  localDescription: RTCSessionDescriptionInit | null = null
  connectionState: RTCPeerConnectionState = 'new'
  onconnectionstatechange: (() => void) | null = null
  ondatachannel: ((event: { channel: FakeDataChannel }) => void) | null = null
  createDataChannel() {
    return new FakeDataChannel()
  }
  createOffer() {
    return Promise.resolve({ type: 'offer' as const, sdp: 'v=0\r\nfake-offer\r\n' })
  }
  createAnswer() {
    return Promise.resolve({ type: 'answer' as const, sdp: 'v=0\r\nfake-answer\r\n' })
  }
  setLocalDescription(desc: RTCSessionDescriptionInit) {
    this.localDescription = desc
    return Promise.resolve()
  }
  setRemoteDescription() {
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

beforeEach(() => {
  // FEAT-012 storage uses IDB; the integration test below stubs a fresh
  // in-memory factory so each case starts with an empty conversation store.
  ;(globalThis as { indexedDB: IDBFactory }).indexedDB = new IDBFactory()
  resetStorage()
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

describe('App offerer→joiner same-tab swap (BUG-007)', () => {
  // Reproduces the user-reported flow that FEAT-008 missed: Bob clicks
  // "Start a chat" first (his session enters `awaiting-answer` with his own
  // offer SDP). Alice's invite URL then arrives in the same tab via the
  // hashchange listener, routing into Joiner *with the shared hook still
  // holding Bob's offer*. When Bob clicks Accept, the polite-defer must fire
  // here too — otherwise the reply CopyBox renders Bob's stale offer SDP
  // labeled as "Reply code" and both peers strand on reply-code views.
  //
  // The pre-fix failure mode: `decode(replyCodeBox.value).type === 'offer'`.
  // Post-fix expectation: `decode(replyCodeBox.value).type === 'answer'`.

  it("clicking Accept on Alice's URL produces an answer SDP, not Bob's stale offer", async () => {
    render(<App />)

    // Bob clicks "Start a chat" — Home routes into Offerer with a fresh
    // conv id, which kicks off startAsOfferer on mount.
    fireEvent.click(screen.getByRole('button', { name: /start a chat/i }))

    // Wait for Bob's offerer flow to settle into `awaiting-answer` — the
    // invite URL CopyBox renders once `encodedLocal` is populated.
    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: /invite url/i })).toBeInTheDocument()
    })

    // Alice's invite URL arrives in the same tab (paste-into-address-bar,
    // app-link, etc.). Only the hash changes; the App listener routes into
    // Joiner with the *same* useChatSession instance still in `awaiting-answer`.
    const alicesOffer = encode({ type: 'offer', sdp: 'v=0\r\nalices-offer\r\n' })
    await act(async () => {
      history.replaceState(null, '', `/#offer=${alicesOffer}`)
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })

    // Joiner mounts on the invite branch. Bob clicks Accept.
    expect(screen.getByRole('heading', { name: /you've been invited to chat/i })).toBeInTheDocument()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^accept$/i }))
    })

    // The polite-defer swap runs: Bob's offerer PC is torn down, a new
    // answerer-side PC is allocated against Alice's offer, and the resulting
    // encodedLocal is an *answer* SDP.
    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: /reply code/i })).toBeInTheDocument()
    })
    const replyValue = (screen.getByRole('textbox', { name: /reply code/i }) as HTMLTextAreaElement).value
    const decoded = decode<{ type: string }>(replyValue)
    expect(decoded.type).toBe('answer')
  })

  it("does not leak Bob's stale offer into the reply view while the swap is in flight", async () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: /start a chat/i }))
    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: /invite url/i })).toBeInTheDocument()
    })

    // Capture Bob's offer payload — whatever the invite URL CopyBox is
    // serving as the offer. The reply CopyBox must never display this
    // string, even for one frame, after Bob accepts Alice's invite.
    const inviteUrl = (screen.getByRole('textbox', { name: /invite url/i }) as HTMLTextAreaElement).value
    const bobsOfferCode = new URL(inviteUrl).hash.match(/offer=([^&]+)/)![1]

    const alicesOffer = encode({ type: 'offer', sdp: 'v=0\r\nalices-offer\r\n' })
    await act(async () => {
      history.replaceState(null, '', `/#offer=${alicesOffer}`)
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^accept$/i }))
    })

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: /reply code/i })).toBeInTheDocument()
    })

    const replyValue = (screen.getByRole('textbox', { name: /reply code/i }) as HTMLTextAreaElement).value
    expect(replyValue).not.toBe(bobsOfferCode)
    expect(decode<{ type: string }>(replyValue).type).toBe('answer')
  })
})
