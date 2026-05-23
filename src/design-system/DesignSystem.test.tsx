import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { DesignSystem } from './DesignSystem'

describe('DesignSystem showcase', () => {
  // Several previewed screens reach into the live WebRTC stack on mount.
  // Stub the bits jsdom doesn't ship so we can render the full showcase.
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

  let originalRTC: unknown
  beforeAll(() => {
    originalRTC = (globalThis as { RTCPeerConnection?: unknown }).RTCPeerConnection
    // @ts-expect-error stubbing minimal subset for jsdom
    globalThis.RTCPeerConnection = FakePeerConnection
  })
  afterAll(() => {
    // @ts-expect-error restore
    globalThis.RTCPeerConnection = originalRTC
  })

  it('renders the page heading + section headings (Typography, Color, Atoms, Molecules, Organisms, Screen previews)', () => {
    render(<DesignSystem />)

    expect(screen.getByRole('heading', { level: 1, name: /design system/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: /typography/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: /color/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: /atoms/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: /molecules/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: /organisms/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: /screen previews/i })).toBeInTheDocument()
  })

  it('renders a theme toggle group with System / Light / Dark choices, defaulting to System', () => {
    render(<DesignSystem />)
    const group = screen.getByRole('group', { name: /theme/i })
    expect(group).toBeInTheDocument()

    const system = screen.getByRole('button', { name: /^system$/i })
    const light = screen.getByRole('button', { name: /^light$/i })
    const dark = screen.getByRole('button', { name: /^dark$/i })

    expect(system).toHaveAttribute('aria-pressed', 'true')
    expect(light).toHaveAttribute('aria-pressed', 'false')
    expect(dark).toHaveAttribute('aria-pressed', 'false')
  })

  it('applies a `.dark` class to the showcase root when the Dark toggle is active', () => {
    const { container } = render(<DesignSystem />)
    const root = container.firstElementChild as HTMLElement
    expect(root.classList.contains('dark')).toBe(false)
    expect(root.classList.contains('light')).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: /^dark$/i }))
    expect(root.classList.contains('dark')).toBe(true)
    expect(root.classList.contains('light')).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: /^light$/i }))
    expect(root.classList.contains('light')).toBe(true)
    expect(root.classList.contains('dark')).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: /^system$/i }))
    expect(root.classList.contains('dark')).toBe(false)
    expect(root.classList.contains('light')).toBe(false)
  })

  it('exposes exactly one <main> landmark across the whole showcase (A11Y-013)', () => {
    // The showcase mounts seven real screens for side-by-side review. Each
    // screen normally renders its own <main>; inside the showcase they
    // must demote to labelled regions so the host page keeps a single
    // top-level landmark. Landmark navigation breaks otherwise.
    const { container } = render(<DesignSystem />)
    expect(container.querySelectorAll('main')).toHaveLength(1)
  })

  it('exposes exactly one <h1> across the whole showcase (A11Y-013)', () => {
    // ~10 nested <h1>s would otherwise flatten the document outline. The
    // page <h1> is "Design system"; every previewed screen's heading
    // demotes to <h2> via ScreenChromeContext, and the Typography /
    // Atoms heading swatches render as <p>.
    const { container } = render(<DesignSystem />)
    const h1s = container.querySelectorAll('h1')
    expect(h1s).toHaveLength(1)
    expect(h1s[0]).toHaveTextContent(/design system/i)
  })

  it('still renders every screen preview visually (label + content)', () => {
    render(<DesignSystem />)
    // The seven preview labels above the framed boxes.
    expect(screen.getByText('Home')).toBeInTheDocument()
    expect(screen.getByText(/Offerer — Invite your friend/)).toBeInTheDocument()
    expect(screen.getByText(/Offerer — Connection lost/)).toBeInTheDocument()
    expect(screen.getByText(/Joiner — You've been invited/)).toBeInTheDocument()
    expect(screen.getByText(/Joiner — Send this code back/)).toBeInTheDocument()
    expect(screen.getByText(/Joiner — Connection lost/)).toBeInTheDocument()
    expect(screen.getByText(/Connected chat layout/)).toBeInTheDocument()
    // The actual previewed screen content still renders (just at <h2>).
    expect(screen.getByRole('heading', { level: 2, name: /serverless p2p chat/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: /you've been invited to chat/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: /send this code back/i })).toBeInTheDocument()
  })

  it('labels each previewed screen as an accessible region (showcase landmark navigation)', () => {
    render(<DesignSystem />)
    // role=region only gets an accessible-landmark exposure when it has a
    // name — each real screen passes one via `ScreenContainer label=…`.
    // (The two inline previews — `ConnectedChromePreview` and
    // `JoinerReplyPreview` — render a plain <div> intentionally since
    // they don't go through `ScreenContainer`.)
    expect(screen.getByRole('region', { name: /home/i })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: /invite your friend/i })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: /you've been invited to chat/i })).toBeInTheDocument()
    // The Joiner reply branch is reached through the *real* Joiner only by
    // clicking Accept — so the showcase preview for it is the inline
    // `JoinerReplyPreview` component and not a `ScreenContainer`-wrapped
    // region. The h2 still renders.
    expect(screen.getByRole('heading', { level: 2, name: /send this code back/i })).toBeInTheDocument()
  })

  it('does not let any previewed screen steal initial focus into a region (A11Y-022)', async () => {
    // Six top-level screens mount under the showcase. Each one normally
    // calls `useFocusOnMount` on its <h1>; without the showcase opt-out the
    // last preview to commit its effect wins the focus race and teleports
    // keyboard / AT users deep inside a preview region, past the page <h1>.
    // The `suppressInitialFocus` flag on `SHOWCASE_CHROME` must keep every
    // preview out of the race.
    render(<DesignSystem />)

    // Wait for all preview mount effects to settle.
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: /design system/i })).toBeInTheDocument()
    })

    const active = document.activeElement as HTMLElement | null
    // The active element must not be nested inside any preview region.
    expect(active?.closest('[role="region"]')).toBeNull()
  })

  it("focuses the page's own <h1> on mount (A11Y-022)", async () => {
    // The page <h1> sits outside the showcase ScreenChromeContext provider,
    // so it sees the default context (suppressInitialFocus: false) and its
    // own `useFocusOnMount` call fires normally. Consistent with every
    // other route in the app per A11Y-005.
    render(<DesignSystem />)
    const pageH1 = screen.getByRole('heading', { level: 1, name: /design system/i })

    await waitFor(() => {
      expect(document.activeElement).toBe(pageH1)
    })
  })

  it('renders an interactive Chat organism that appends to local state on send (no peer needed)', () => {
    render(<DesignSystem />)

    // Showcase wires the Chat composer to local state so reviewers can type without a peer.
    const composer = screen.getByLabelText(/^message$/i) as HTMLTextAreaElement
    fireEvent.change(composer, { target: { value: 'showcase message' } })
    fireEvent.keyDown(composer, { key: 'Enter' })

    // The new message should appear in the transcript.
    expect(screen.getByText('showcase message')).toBeInTheDocument()
  })
})
