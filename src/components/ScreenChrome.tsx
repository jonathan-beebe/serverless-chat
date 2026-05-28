import { createContext, useContext, type ReactNode } from 'react'

// Each screen (Home / Offerer / Joiner) renders exactly one `<main>` and one
// `<h1>` per route under normal operation (A11Y-002 + A11Y-005). The Design
// System showcase intentionally mounts many screens at once for side-by-side
// review, which would otherwise stamp out ~7 `<main>` landmarks and ~10 `<h1>`s
// into a single document (A11Y-013).
//
// This context lets a host page (the showcase) demote nested screens from
// top-level landmarks/headings into regions with sub-headings, without any
// production route having to think about it. Default values keep all real
// routes behaving exactly as before.

export interface ScreenChromeValue {
  // 'main' → screens render <main>. 'region' → screens render
  // <div role="region" aria-label={label}> so the host page's <main> stays the
  // sole top-level landmark.
  landmark: 'main' | 'region'
  // How many levels to bump heading semantics down. 0 = render as authored
  // (level=1 → <h1>). 1 = level=1 renders as <h2>, level=2 as <h3>, etc.
  // The visual size still tracks the authored `level` (or explicit `size`)
  // so the showcase still looks like the real screen.
  headingLevelOffset: 0 | 1 | 2
  // When true, the screen is rendering inside a showcase / preview context
  // and must NOT call programmatic focus on its <h1> on mount — the host
  // page owns initial focus. Production routes leave this unset (falsy) so
  // A11Y-005's screen-transition focus behavior continues to fire. Marked
  // optional so existing providers that pre-date A11Y-022 keep compiling
  // without forcing the explicit `false`.
  // See A11Y-022.
  suppressInitialFocus?: boolean
}

const DEFAULT: ScreenChromeValue = {
  landmark: 'main',
  headingLevelOffset: 0,
  suppressInitialFocus: false,
}

export const ScreenChromeContext = createContext<ScreenChromeValue>(DEFAULT)

export function useScreenChrome(): ScreenChromeValue {
  return useContext(ScreenChromeContext)
}

interface ScreenContainerProps {
  // Used as `aria-label` when the context demotes us to a region. Screens
  // should pass a short human-readable identifier (e.g. 'Home', 'Invite a
  // friend'). Ignored when rendering as <main>.
  label: string
  className?: string
  children?: ReactNode
}

// BUG-010: the safe-area-inset treatment lives in `src/index.css` on `body`
// (top/left/right padding). Putting horizontal margin utilities that
// referenced env() (ml- and mr- forms) on ScreenContainer (IMPRV-024)
// collided with each consumer's `mx-auto` — MAINT-001 reworded this so
// Tailwind's content scanner no longer materialises the dead classes.
// Tailwind emits `margin-left` / `margin-right` longhand AFTER `margin-inline`,
// so the inset utilities won the cascade and clamped every screen flush-left
// in browser tabs (where `env(...)` is `0px`). Body-level padding sidesteps the
// cascade entirely and `#root` sizes against body's content box, so every
// screen still clears the notch / curved edges. The bottom inset is owned by
// the connected wrapper (Offerer/Joiner) and by UpdatePrompt — keeping it off
// body preserves the IMPRV-024 "pick one" rule.

// Primitive replacement for the raw `<main>` tag inside Home / Offerer /
// Joiner. Renders <main> by default; renders a labelled region when the
// surrounding context says we're in a showcase that already owns the page's
// <main>.
export function ScreenContainer({ label, className, children }: ScreenContainerProps) {
  if (useScreenChrome().landmark === 'main') {
    return <main className={className}>{children}</main>
  }
  return (
    <div role="region" aria-label={label} className={className}>
      {children}
    </div>
  )
}
