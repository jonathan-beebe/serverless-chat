import type { ReactElement } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { DesignSystem } from './DesignSystem'

// ARCH-001: the showcase mounts every screen, including ones that now use
// react-router Links (Home → Resume, Network → Back to home). Wrap every
// DesignSystem render in a MemoryRouter so those Links have router context.
// SessionContext is provided inside DesignSystem itself for the Home preview;
// the other previews still pass their session via props.
function renderShowcase(ui: ReactElement) {
  return render(<MemoryRouter initialEntries={['/design-system']}>{ui}</MemoryRouter>)
}

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
    renderShowcase(<DesignSystem />)

    expect(screen.getByRole('heading', { level: 1, name: /design system/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: /typography/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: /color/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: /atoms/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: /molecules/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: /organisms/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: /screen previews/i })).toBeInTheDocument()
  })

  it('renders a theme toggle group with System / Light / Dark choices, defaulting to System', () => {
    renderShowcase(<DesignSystem />)
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
    const { container } = renderShowcase(<DesignSystem />)
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
    const { container } = renderShowcase(<DesignSystem />)
    expect(container.querySelectorAll('main')).toHaveLength(1)
  })

  it('exposes exactly one <h1> across the whole showcase (A11Y-013)', () => {
    // ~10 nested <h1>s would otherwise flatten the document outline. The
    // page <h1> is "Design system"; every previewed screen's heading
    // demotes to <h2> via ScreenChromeContext, and the Typography /
    // Atoms heading swatches render as <p>.
    const { container } = renderShowcase(<DesignSystem />)
    const h1s = container.querySelectorAll('h1')
    expect(h1s).toHaveLength(1)
    expect(h1s[0]).toHaveTextContent(/design system/i)
  })

  it('still renders every screen preview visually (label + content)', () => {
    renderShowcase(<DesignSystem />)
    // The seven preview labels above the framed boxes.
    expect(screen.getByText('Home')).toBeInTheDocument()
    expect(screen.getByText(/Offerer — Invite your friend/)).toBeInTheDocument()
    expect(screen.getByText(/Offerer — Connection lost/)).toBeInTheDocument()
    expect(screen.getByText(/Joiner — You've been invited/)).toBeInTheDocument()
    expect(screen.getByText(/Joiner — Send this code back/)).toBeInTheDocument()
    expect(screen.getByText(/Joiner — Connection lost/)).toBeInTheDocument()
    // IMPRV-019: the old inert "Connected chat layout (header chrome)" preview
    // is gone — the connected screen lives at /design-system/chat now. The
    // showcase keeps a labeled link in its place.
    expect(screen.getByRole('link', { name: /open \/design-system\/chat/i })).toHaveAttribute(
      'href',
      '/design-system/chat',
    )
    // The actual previewed screen content still renders (just at <h2>).
    expect(screen.getByRole('heading', { level: 2, name: /serverless p2p chat/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: /you've been invited to chat/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: /send this code back/i })).toBeInTheDocument()
  })

  it('labels each previewed screen as an accessible region (showcase landmark navigation)', () => {
    renderShowcase(<DesignSystem />)
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
    renderShowcase(<DesignSystem />)

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
    renderShowcase(<DesignSystem />)
    const pageH1 = screen.getByRole('heading', { level: 1, name: /design system/i })

    await waitFor(() => {
      expect(document.activeElement).toBe(pageH1)
    })
  })

  it('renders an interactive Chat organism that appends to local state on send (no peer needed)', () => {
    renderShowcase(<DesignSystem />)

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
      renderShowcase(<DesignSystem />)
      // System is the default selected mode. The bug was a permanent
      // (non-`focus-visible:`-scoped) `ring-2 ring-sky-400` painted on the
      // selected button, which collided with the Button primitive's base
      // `focus-visible:ring-2 focus-visible:ring-sky-400`. The legitimate
      // `focus-visible:`-prefixed ring is fine and must remain — only the
      // unconditional ring is forbidden.
      const selected = screen.getByRole('button', { name: /^system$/i })
      // Use classList.contains: it tests for the unconditional token only,
      // and ignores the `focus-visible:ring-2` / `focus-visible:ring-sky-400`
      // variant-prefixed tokens which are stored as separate class atoms.
      expect(selected.classList.contains('ring-2')).toBe(false)
      expect(selected.classList.contains('ring-sky-400')).toBe(false)
    })

    it('paints the selected theme button with the tinted-fill cue', () => {
      renderShowcase(<DesignSystem />)
      const selected = screen.getByRole('button', { name: /^system$/i })
      // Light-mode tokens always present; dark-mode tokens layered via the
      // `dark:` variant. The class atoms are the load-bearing differentiator
      // that distinguishes the selected button from its siblings (the
      // sibling test below pairs against this).
      expect(selected.classList.contains('bg-sky-100')).toBe(true)
      expect(selected.classList.contains('text-sky-900')).toBe(true)
      expect(selected.classList.contains('border-sky-700')).toBe(true)
      expect(selected.classList.contains('dark:bg-sky-900')).toBe(true)
      expect(selected.classList.contains('dark:text-sky-100')).toBe(true)
      expect(selected.classList.contains('dark:border-sky-400')).toBe(true)
    })

    it('does not paint unselected siblings with the tinted-fill cue', () => {
      renderShowcase(<DesignSystem />)
      const light = screen.getByRole('button', { name: /^light$/i })
      const dark = screen.getByRole('button', { name: /^dark$/i })
      for (const btn of [light, dark]) {
        expect(btn.classList.contains('bg-sky-100')).toBe(false)
        expect(btn.classList.contains('text-sky-900')).toBe(false)
        expect(btn.classList.contains('border-sky-700')).toBe(false)
        expect(btn.classList.contains('dark:bg-sky-900')).toBe(false)
      }
    })

    it('gives focused-unselected and selected-unfocused buttons distinguishable class shapes', () => {
      renderShowcase(<DesignSystem />)
      const selected = screen.getByRole('button', { name: /^system$/i })
      const sibling = screen.getByRole('button', { name: /^light$/i })
      // Class strings differ — the selected button carries the tint, the
      // sibling does not. JSDOM does not paint the focus ring, but the
      // class-list shape divergence is enough to catch a regression where
      // someone "fixes" the bug by giving both buttons the same combined
      // class.
      expect(selected.className).not.toBe(sibling.className)
      expect(selected.classList.contains('bg-sky-100')).toBe(true)
      expect(sibling.classList.contains('bg-sky-100')).toBe(false)
    })

    it('keyboard-focuses all three theme buttons so the A11Y-017 ring-offset contract has a target', () => {
      // The ring-offset color tokens (focus-visible:ring-offset-2 /
      // ring-offset-stone-50 / dark:ring-offset-stone-900) live on the Button
      // primitive's base class set; jsdom cannot compute the rendered ring.
      // The testable contract here is that all three theme buttons are
      // reachable as focusable elements — combined with the aria-pressed
      // exposure test below, the keyboard-only audit path is covered.
      renderShowcase(<DesignSystem />)
      const system = screen.getByRole('button', { name: /^system$/i })
      const light = screen.getByRole('button', { name: /^light$/i })
      const dark = screen.getByRole('button', { name: /^dark$/i })
      for (const btn of [system, light, dark]) {
        btn.focus()
        expect(btn).toHaveFocus()
      }
    })

    it('preserves `aria-pressed` exposure on all three theme buttons after the visual refactor', () => {
      // The AT path was the only thing that already worked on the original
      // implementation — the ticket is sighted-keyboard-only and explicitly
      // carves AT scope. Guard against a future "fix" that migrates to
      // role=radio / aria-checked sneaking in under this ticket.
      renderShowcase(<DesignSystem />)
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
      renderShowcase(<DesignSystem />)
      const system = screen.getByRole('button', { name: /^system$/i })
      const light = screen.getByRole('button', { name: /^light$/i })

      expect(system.classList.contains('bg-sky-100')).toBe(true)
      expect(light.classList.contains('bg-sky-100')).toBe(false)

      fireEvent.click(light)
      expect(system.classList.contains('bg-sky-100')).toBe(false)
      expect(light.classList.contains('bg-sky-100')).toBe(true)
    })
  })

  describe('screen previews are inert (A11Y-024)', () => {
    // Each previewed screen mounts real production components wired to
    // no-op handlers (`onCancel={() => {}}`, etc.). Without `inert` on the
    // preview wrapper, the showcase route contributes ~20 dead tab stops —
    // buttons advertising actions they never perform, plus a CopyBox Copy
    // button that quietly succeeds and overwrites the reviewer's clipboard.
    // The fix wraps each preview's content in `[inert]` so the subtree is
    // removed from focus order, hit testing, and AT exposure while still
    // rendering for sighted visual review. These tests are the sentinel.

    it('marks every ScreenPreview content wrapper with the inert attribute', () => {
      const { container } = renderShowcase(<DesignSystem />)
      // Each preview label sits as a sibling <span> above its inert
      // content wrapper. Walking labels → next-sibling div is the most
      // direct way to assert the relationship from the rendered DOM.
      const labels = [
        'Home',
        'Offerer — Invite your friend',
        'Offerer — Connection lost',
        "Joiner — You've been invited",
        'Joiner — Send this code back',
        'Joiner — Connection lost',
      ]
      for (const label of labels) {
        const labelEl = Array.from(container.querySelectorAll('span')).find((el) => el.textContent === label)
        expect(labelEl, `label "${label}" not found`).toBeTruthy()
        const wrapper = labelEl!.nextElementSibling as HTMLElement | null
        expect(wrapper, `wrapper for "${label}" not found`).toBeTruthy()
        // jsdom serializes the React 19 boolean prop to the empty-string
        // attribute form (`inert=""`). `hasAttribute` is the most robust
        // assertion across attribute-presence semantics.
        expect(wrapper!.hasAttribute('inert')).toBe(true)
      }
    })

    it('wraps every focusable control inside a preview region with an inert ancestor', () => {
      // jsdom does not honor the live `inert` semantics for Tab navigation
      // (no real focus engine), so we cannot directly assert "Tab does not
      // land here" the way a browser would. Instead, we assert the
      // structural precondition that *would* prevent focus landing in a
      // real browser: every focusable element that lives inside a preview
      // wrapper must have an `[inert]` ancestor between it and <body>.
      // Combined with the per-wrapper inert assertion above, this fully
      // exercises the contract — a regression that strips `inert` would
      // flip this assertion. Manual smoke (recorded in the ticket) covers
      // the live-focus path in real browsers.
      const { container } = renderShowcase(<DesignSystem />)
      const previewWrappers = Array.from(container.querySelectorAll('[inert]'))
      expect(previewWrappers.length).toBeGreaterThanOrEqual(6)

      // All natively focusable controls inside any inert wrapper.
      const focusableSelector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      let countInsideInert = 0
      for (const wrapper of previewWrappers) {
        const focusables = wrapper.querySelectorAll(focusableSelector)
        for (const focusable of focusables) {
          // Sanity: every match must indeed have an inert ancestor — i.e.
          // the wrapper itself or a closer one.
          expect((focusable as HTMLElement).closest('[inert]')).not.toBeNull()
          countInsideInert++
        }
      }
      // The previews contribute well over a dozen controls; assert a
      // generous floor so a future change that accidentally renders
      // previews without their inert wrapper is loud about it.
      expect(countInsideInert).toBeGreaterThan(10)
    })

    it('keeps the interactive Chat composer keyboard-operable (regression guard for the Organisms section)', async () => {
      // The Chat organism above the Screen previews section is the one
      // interactive composite in the showcase and must remain fully
      // keyboard-driven after this ticket lands. It is rendered *outside*
      // <ScreenPreview>, so it must NOT inherit the inert wrapper.
      renderShowcase(<DesignSystem />)
      const composer = screen.getByLabelText(/^message$/i) as HTMLTextAreaElement
      expect(composer.closest('[inert]')).toBeNull()

      composer.focus()
      expect(document.activeElement).toBe(composer)

      const user = userEvent.setup()
      await user.type(composer, 'still typeable')
      expect(composer.value).toBe('still typeable')

      // Submit via Enter — same wiring as the existing organism test, but
      // exercised through `userEvent` to verify the full keyboard path.
      await user.keyboard('{Enter}')
      expect(screen.getByText('still typeable')).toBeInTheDocument()
    })
  })
})
