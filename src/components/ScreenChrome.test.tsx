import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ScreenChromeContext, ScreenContainer } from './ScreenChrome'

// IMPRV-024: every screen's root needs to honor `env(safe-area-inset-*)` so the
// status-bar/notch (top) and the rounded landscape edges (left/right) don't
// clip content in iOS standalone. The inset utilities are emitted as MARGINS
// rather than paddings because Tailwind v4 emits `padding-top`/`padding-bottom`
// longhand AFTER `padding-block` (which is what `py-*` compiles to), so a
// padding-based inset utility would CLOBBER each consumer's existing `py-12`
// in browser tabs (where `env(...)` is `0px`). Margin sidesteps that conflict
// entirely — `env(...)` is `0px` in browser tabs and on non-notched hardware,
// so the rules are inert outside the standalone-iPhone case (no
// `display-mode: standalone` gating needed).
//
// The bottom inset is intentionally NOT applied here. For most screens the
// existing `py-12` already keeps content well above the home indicator; for
// the connected chat (where the composer is pinned to the bottom of the visual
// viewport) the Offerer/Joiner connected wrappers apply their own bottom
// inset via `pb-[max(env(safe-area-inset-bottom),0.25rem)]`. Doing it both
// here and there would double-count the inset (see ticket "pick one" rule).

describe('ScreenContainer (IMPRV-024 safe-area insets)', () => {
  it('renders the default <main> root with a top safe-area-inset margin so every screen inherits the inset without touching each call site', () => {
    render(
      <ScreenContainer label="Home" className="px-4 py-12">
        <h1>Home</h1>
      </ScreenContainer>,
    )
    const main = screen.getByRole('main')
    const className = main.className
    expect(className).toMatch(/\bmt-\[env\(safe-area-inset-top\)\]/)
    // The consumer's own padding must still be present — the margin sits
    // above (outside) the padding, it does not replace it.
    expect(className).toMatch(/\bpx-4\b/)
    expect(className).toMatch(/\bpy-12\b/)
  })

  it('renders the inset margin on the <div role="region"> branch too, so demoted previews in the design-system showcase still clear the notch', () => {
    render(
      <ScreenChromeContext.Provider value={{ landmark: 'region', headingLevelOffset: 1 }}>
        <ScreenContainer label="Home preview" className="px-4 py-12">
          <h2>Home</h2>
        </ScreenContainer>
      </ScreenChromeContext.Provider>,
    )
    const region = screen.getByRole('region', { name: 'Home preview' })
    const className = region.className
    expect(className).toMatch(/\bmt-\[env\(safe-area-inset-top\)\]/)
  })

  it('also emits left/right safe-area-inset margins so landscape notched devices keep content off the rounded edges', () => {
    render(
      <ScreenContainer label="Home" className="px-4 py-12">
        <h1>Home</h1>
      </ScreenContainer>,
    )
    const main = screen.getByRole('main')
    const className = main.className
    expect(className).toMatch(/\bml-\[env\(safe-area-inset-left\)\]/)
    expect(className).toMatch(/\bmr-\[env\(safe-area-inset-right\)\]/)
  })

  it('does NOT apply a bottom safe-area-inset on its root — the connected chat owns its own bottom inset via wrapper padding so the two would otherwise double-count', () => {
    render(
      <ScreenContainer label="Home" className="px-4 py-12">
        <h1>Home</h1>
      </ScreenContainer>,
    )
    const main = screen.getByRole('main')
    const className = main.className
    expect(className).not.toMatch(/safe-area-inset-bottom/)
  })
})
