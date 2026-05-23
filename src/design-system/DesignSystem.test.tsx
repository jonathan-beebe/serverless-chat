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

  describe('theme toggle selected vs focus styling (A11Y-023)', () => {
    // The selected theme button used to carry `ring-2 ring-sky-400` — the
    // exact same ring the Button primitive emits on `focus-visible`. That
    // collision defeated focus visibility (WCAG 2.4.7) on every sighted
    // keyboard user: tabbing onto an unselected sibling produced two
    // ring-matched buttons with no way to disambiguate selected from focused.
    // The fix differentiates the cues: selected uses a tinted fill + border
    // + text recolor; focus keeps the standard ring. These tests are the
    // sentinel against re-conflation.

    it('does not put an unconditional `ring-2 ring-sky-400` on the selected theme button', () => {
      render(<DesignSystem />)
      // System is the default selected mode. The bug was a permanent
      // (non-`focus-visible:`-scoped) `ring-2 ring-sky-400` painted on the
      // selected button, which collided with the Button primitive's base
      // `focus-visible:ring-2 focus-visible:ring-sky-400`. The legitimate
      // `focus-visible:`-prefixed ring is fine and must remain — only the
      // unconditional ring is forbidden.
      const selected = screen.getByRole('button', { name: /^system$/i })
      // Match `ring-2` only when NOT preceded by `focus-visible:` (or any
      // other variant prefix ending in `:`).
      expect(selected.className).not.toMatch(/(?<![:-])ring-2\b/)
      expect(selected.className).not.toMatch(/(?<![:-])ring-sky-400\b/)
    })

    it('paints the selected theme button with the tinted-fill cue', () => {
      render(<DesignSystem />)
      const selected = screen.getByRole('button', { name: /^system$/i })
      // Light-mode tokens always present; dark-mode tokens layered via the
      // `dark:` variant. We assert the raw class string carries both halves
      // — Tailwind decides which one paints based on the active theme.
      expect(selected).toHaveClass('bg-sky-100')
      expect(selected).toHaveClass('text-sky-900')
      expect(selected).toHaveClass('border-sky-700')
      expect(selected.className).toMatch(/\bdark:bg-sky-900\b/)
      expect(selected.className).toMatch(/\bdark:text-sky-100\b/)
      expect(selected.className).toMatch(/\bdark:border-sky-400\b/)
    })

    it('does not paint unselected siblings with the tinted-fill cue', () => {
      render(<DesignSystem />)
      const light = screen.getByRole('button', { name: /^light$/i })
      const dark = screen.getByRole('button', { name: /^dark$/i })
      for (const btn of [light, dark]) {
        expect(btn.className).not.toMatch(/\bbg-sky-100\b/)
        expect(btn.className).not.toMatch(/\btext-sky-900\b/)
        expect(btn.className).not.toMatch(/\bborder-sky-700\b/)
        expect(btn.className).not.toMatch(/\bdark:bg-sky-900\b/)
      }
    })

    it('gives focused-unselected and selected-unfocused buttons distinguishable class shapes', () => {
      render(<DesignSystem />)
      const selected = screen.getByRole('button', { name: /^system$/i })
      const sibling = screen.getByRole('button', { name: /^light$/i })
      // Class strings differ — the selected button carries the tint, the
      // sibling does not. JSDOM does not paint the focus ring, but the
      // class-list shape divergence is enough to catch a regression where
      // someone "fixes" the bug by giving both buttons the same combined
      // class.
      expect(selected.className).not.toBe(sibling.className)
      expect(selected.className).toMatch(/\bbg-sky-100\b/)
      expect(sibling.className).not.toMatch(/\bbg-sky-100\b/)
    })

    it('applies the focus-ring offset to all three theme buttons so combined focused+selected stays legible', () => {
      // Matches the A11Y-017 pattern (ring-offset colored to page bg so the
      // gap reads as page surface, not as a halo). When the selected button
      // gains focus, the offset keeps the ring clearly outside the tinted
      // fill rather than abutting the border.
      render(<DesignSystem />)
      const system = screen.getByRole('button', { name: /^system$/i })
      const light = screen.getByRole('button', { name: /^light$/i })
      const dark = screen.getByRole('button', { name: /^dark$/i })
      for (const btn of [system, light, dark]) {
        expect(btn.className).toMatch(/\bfocus-visible:ring-offset-2\b/)
        expect(btn.className).toMatch(/\bfocus-visible:ring-offset-slate-50\b/)
        expect(btn.className).toMatch(/\bdark:focus-visible:ring-offset-slate-900\b/)
      }
    })

    it('preserves `aria-pressed` exposure on all three theme buttons after the visual refactor', () => {
      // The AT path was the only thing that already worked on the original
      // implementation — the ticket is sighted-keyboard-only and explicitly
      // carves AT scope. Guard against a future "fix" that migrates to
      // role=radio / aria-checked sneaking in under this ticket.
      render(<DesignSystem />)
      const system = screen.getByRole('button', { name: /^system$/i })
      const light = screen.getByRole('button', { name: /^light$/i })
      const dark = screen.getByRole('button', { name: /^dark$/i })
      expect(system).toHaveAttribute('aria-pressed', 'true')
      expect(light).toHaveAttribute('aria-pressed', 'false')
      expect(dark).toHaveAttribute('aria-pressed', 'false')

      // Selection moves with state and aria-pressed tracks it.
      fireEvent.click(dark)
      expect(system).toHaveAttribute('aria-pressed', 'false')
      expect(light).toHaveAttribute('aria-pressed', 'false')
      expect(dark).toHaveAttribute('aria-pressed', 'true')
    })

    it('moves the tinted-fill cue to whichever theme button is currently selected', () => {
      // Functional sanity: clicking re-targets the selection cue. Pairs with
      // the aria-pressed test above and guards against the ternary becoming
      // always-truthy or pinned to the initial mode.
      render(<DesignSystem />)
      const system = screen.getByRole('button', { name: /^system$/i })
      const light = screen.getByRole('button', { name: /^light$/i })

      expect(system.className).toMatch(/\bbg-sky-100\b/)
      expect(light.className).not.toMatch(/\bbg-sky-100\b/)

      fireEvent.click(light)
      expect(system.className).not.toMatch(/\bbg-sky-100\b/)
      expect(light.className).toMatch(/\bbg-sky-100\b/)
    })
  })
})
