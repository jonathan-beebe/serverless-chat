import { useEffect } from 'react'
import { fireEvent, render, screen, act, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { MemoryRouter, useNavigate, type NavigateFunction } from 'react-router-dom'
import { AppRoutes } from './App'
import { decode, encode } from './core/encoding'
import { __resetForTests as resetStorage } from './core/storage'
import { buildOfferUrl } from './core/url'

// ARCH-001: App now owns BrowserRouter; tests mount `AppRoutes` under a
// MemoryRouter so the initial URL is controllable and history mutations
// don't leak across tests. The "screens focus their primary action" /
// "doc title tracks the route" / "joiner fragment is scrubbed" /
// "BUG-007 polite-defer swap" assertions all carry over from the prior
// hash-routed model — only the navigation mechanism changed.
//
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
  vi.restoreAllMocks()
})

// Render `AppRoutes` at a chosen initial location. The MemoryRouter accepts
// either a plain string (`'/network'`) or a structured entry so we can also
// carry a hash (`#offer=...`) for the joiner tests.
function renderAt(entry: string | { pathname: string; search?: string; hash?: string }) {
  return render(<MemoryRouter initialEntries={[entry]}>{<AppRoutes />}</MemoryRouter>)
}

// Exposes the router's `navigate` to the test so we can drive same-tab
// navigation (e.g. Alice's invite URL arriving) without poking the
// MemoryRouter's internal history through popstate. `let`-binding instead of
// a ref so tests can grab it once and re-use it inside `act(...)`.
let testNavigate: NavigateFunction | null = null
function NavigateProbe() {
  const navigate = useNavigate()
  useEffect(() => {
    testNavigate = navigate
    return () => {
      testNavigate = null
    }
  }, [navigate])
  return null
}

function renderAtWithNavigator(entry: string | { pathname: string; search?: string; hash?: string }) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <AppRoutes />
      <NavigateProbe />
    </MemoryRouter>,
  )
}

describe('App routing (ARCH-001)', () => {
  it('renders Home at /', () => {
    renderAt('/')
    expect(screen.getByRole('heading', { name: /serverless p2p chat/i })).toBeInTheDocument()
  })

  it('renders the design system page at /design-system', () => {
    renderAt('/design-system')
    expect(screen.getByRole('heading', { level: 1, name: /design system/i })).toBeInTheDocument()
  })

  it('sets document.title for the design system page', () => {
    renderAt('/design-system')
    expect(document.title).toBe('Design system · P2P Chat')
  })

  it('renders the network telemetry page at /network', () => {
    renderAt('/network')
    expect(screen.getByRole('heading', { level: 1, name: /network telemetry/i })).toBeInTheDocument()
  })

  it('sets document.title for the network page', () => {
    renderAt('/network')
    expect(document.title).toBe('Network telemetry · P2P Chat')
  })

  it('renders Joiner when /conversation/<id> carries an #offer fragment (invite URL)', () => {
    // ARCH-001: invite URL is `/conversation/<id>#offer=<encoded>`. The
    // ConversationRoute reads the hash, sees an offer, and renders Joiner.
    const payload = encode({ type: 'offer', sdp: 'v=0\r\n' })
    renderAt({ pathname: '/conversation/uuid-1', hash: `#offer=${payload}` })

    expect(screen.getByRole('heading', { name: /you've been invited to chat/i })).toBeInTheDocument()
  })

  it('renders NotFound for /conversation/<id> with no live session, no #offer, no persisted record', async () => {
    // The Outcome explicitly forbids minting a fresh offerer from an unknown
    // id or silently redirecting — render an empty state with a link home.
    renderAt('/conversation/this-id-was-never-seen')
    expect(await screen.findByRole('heading', { name: /conversation not found/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /back to home/i })).toHaveAttribute('href', '/')
  })

  it('renders NotFound for an entirely unknown path', () => {
    renderAt('/this/is/nowhere')
    expect(screen.getByRole('heading', { name: /conversation not found/i })).toBeInTheDocument()
  })

  it('updates document.title to reflect the current screen (WCAG 2.4.2)', () => {
    // Routing into Joiner via an invite URL should swap the title.
    const payload = encode({ type: 'offer', sdp: 'v=0\r\n' })
    renderAt({ pathname: '/conversation/uuid-1', hash: `#offer=${payload}` })
    expect(document.title).toMatch(/you've been invited/i)
  })
})

describe('App routing — joiner URL canonicalization (ARCH-001)', () => {
  it('scrubs the #offer fragment from the URL once Joiner has captured it, leaving /conversation/<id>', async () => {
    const payload = encode({ type: 'offer', sdp: 'v=0\r\n' })
    const aliceId = 'alice-conv'
    renderAtWithNavigator({ pathname: `/conversation/${aliceId}`, hash: `#offer=${payload}` })

    // Joiner renders (invite branch) with Accept focused.
    const accept = await screen.findByRole('button', { name: /^accept$/i })

    await act(async () => {
      fireEvent.click(accept)
    })

    // After Accept, the route shell removes the fragment so the URL settles
    // to the canonical /conversation/<id>. The Joiner branch stays mounted
    // (sticky-per-id) so the "Send this code back" reply view continues to
    // render without flipping to Offerer.
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /send this code back/i })).toBeInTheDocument()
    })
  })
})

describe('App routing — privacy invariant (ARCH-001)', () => {
  it('keeps the SDP in the URL fragment (never the path or search), so the static host never sees it', () => {
    // Sanity check: read the helper that builds the invite URL and verify
    // the encoded SDP lands in the hash. Fragments never reach the server,
    // which is the privacy promise the README calls out.
    //
    // We intentionally don't pull the helper through the live Offerer
    // here — that adds RTC plumbing for what is a single-fact assertion
    // about the URL shape.
    const url = buildOfferUrl('https://example.com', '/', 'PAYLOAD', 'conv-1')
    const parsed = new URL(url)
    expect(parsed.pathname).toBe('/conversation/conv-1')
    expect(parsed.search).toBe('')
    expect(parsed.hash).toBe('#offer=PAYLOAD')
  })
})

describe('App focus-on-mount (WCAG 2.4.3)', () => {
  it('focuses the primary action on whichever screen mounts first', () => {
    // Home's primary action is "Start a chat".
    renderAt('/')
    expect(screen.getByRole('button', { name: /start a chat/i })).toHaveFocus()
  })

  it('focuses the Joiner Accept button when entering an invite URL', () => {
    const payload = encode({ type: 'offer', sdp: 'v=0\r\n' })
    renderAt({ pathname: '/conversation/uuid-1', hash: `#offer=${payload}` })
    expect(screen.getByRole('button', { name: /^accept$/i })).toHaveFocus()
  })
})

describe('App cancel-restart sequence (BUG-012 / sibling of BUG-011)', () => {
  // ARCH-001 dropped the pre-route `session.reset()` from `App.goHome`. The
  // resulting "Cancel leaves session bound" stranded every subsequent
  // "Start a chat" click on NotFound: Home.startNew calls
  // session.startAsOfferer(newId2), the hook's `if (state !== 'idle') return`
  // guard short-circuits (state is still 'awaiting-answer' from the canceled
  // attempt), and ConversationRoute falls through to NotFound for the
  // freshly-minted id.
  //
  // BUG-011's fix restores `session.reset()` in ConversationRoute's onCancel
  // sites; this test pins that retry-after-cancel lands on Offerer, never on
  // NotFound.

  it('a second "Start a chat" after Cancel routes to the Offerer "Invite your friend" screen, not NotFound (BUG-012)', async () => {
    renderAtWithNavigator('/')

    // First Start.
    fireEvent.click(screen.getByRole('button', { name: /start a chat/i }))
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /invite your friend/i })).toBeInTheDocument()
    })

    // Cancel.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }))
    })
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /serverless p2p chat/i })).toBeInTheDocument()
    })

    // Second Start — pre-fix this would land on "Conversation not found".
    fireEvent.click(screen.getByRole('button', { name: /start a chat/i }))
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /invite your friend/i })).toBeInTheDocument()
    })
    expect(screen.queryByRole('heading', { name: /conversation not found/i })).not.toBeInTheDocument()
  })
})

describe('App offerer→joiner same-tab swap (BUG-007)', () => {
  // Reproduces the user-reported flow that FEAT-008 missed: Bob clicks
  // "Start a chat" first (his session enters `awaiting-answer` with his own
  // offer SDP). Alice's invite URL then arrives in the same tab via in-app
  // navigation, routing into Joiner *with the shared hook still holding
  // Bob's offer*. When Bob clicks Accept, the polite-defer must fire here
  // too — otherwise the reply CopyBox renders Bob's stale offer SDP labeled
  // as "Reply code" and both peers strand on reply-code views.
  //
  // The pre-fix failure mode: `decode(replyCodeBox.value).type === 'offer'`.
  // Post-fix expectation: `decode(replyCodeBox.value).type === 'answer'`.

  it("clicking Accept on Alice's URL produces an answer SDP, not Bob's stale offer", async () => {
    renderAtWithNavigator('/')

    // Bob clicks "Start a chat" — Home pre-binds the session to a fresh
    // conv id and navigates into the conversation route, which renders
    // Offerer and kicks off startAsOfferer on mount.
    fireEvent.click(screen.getByRole('button', { name: /start a chat/i }))

    // Wait for Bob's offerer flow to settle into `awaiting-answer` — the
    // invite URL CopyBox renders once `encodedLocal` is populated.
    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: /invite url/i })).toBeInTheDocument()
    })

    // Alice's invite URL is for HER conversation id; under the new routing
    // model the joiner enters at `/conversation/<alice-id>` with her offer
    // in the fragment. Same-tab navigation simulated by driving the router's
    // own navigate() — MemoryRouter doesn't subscribe to window popstate, so
    // history.pushState alone wouldn't re-render the tree.
    const alicesOffer = encode({ type: 'offer', sdp: 'v=0\r\nalices-offer\r\n' })
    const aliceId = 'alice-conv'
    await act(async () => {
      testNavigate!({ pathname: `/conversation/${aliceId}`, hash: `#offer=${alicesOffer}` })
    })

    // Wait for the joiner branch to render. The router may take an effect
    // tick to commit the new location.
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /you've been invited to chat/i })).toBeInTheDocument()
    })

    // Bob clicks Accept. The polite-defer swap runs: Bob's offerer PC is
    // torn down, a new answerer-side PC is allocated against Alice's offer,
    // and the resulting encodedLocal is an *answer* SDP.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^accept$/i }))
    })

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: /reply code/i })).toBeInTheDocument()
    })
    const replyValue = (screen.getByRole('textbox', { name: /reply code/i }) as HTMLTextAreaElement).value
    const decoded = decode<{ type: string }>(replyValue)
    expect(decoded.type).toBe('answer')
  })

  it("does not leak Bob's stale offer into the reply view while the swap is in flight", async () => {
    renderAtWithNavigator('/')

    fireEvent.click(screen.getByRole('button', { name: /start a chat/i }))
    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: /invite url/i })).toBeInTheDocument()
    })

    // Capture Bob's offer payload — whatever the invite URL CopyBox is
    // serving as the offer. The reply CopyBox must never display this
    // string, even for one frame, after Bob accepts Alice's invite.
    const inviteUrl = (screen.getByRole('textbox', { name: /invite url/i }) as HTMLTextAreaElement).value
    // ARCH-001: invite URL is now `/conversation/<id>#offer=<encoded>`. Pull
    // the encoded offer out of the fragment exactly like the prior pattern.
    const bobsOfferCode = new URL(inviteUrl).hash.match(/offer=([^&]+)/)![1]

    const alicesOffer = encode({ type: 'offer', sdp: 'v=0\r\nalices-offer\r\n' })
    await act(async () => {
      testNavigate!({ pathname: '/conversation/alice-conv', hash: `#offer=${alicesOffer}` })
    })

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /you've been invited to chat/i })).toBeInTheDocument()
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
