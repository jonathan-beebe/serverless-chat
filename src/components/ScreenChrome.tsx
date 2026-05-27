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

// IMPRV-024: every screen's outermost element must honor the device safe-area
// insets so that — in iOS standalone mode — the status-bar/notch (top) and the
// rounded landscape edges (left/right) never clip content. Baking the inset
// into `ScreenContainer` lets every existing call site (Home, Offerer, Joiner,
// NotFound, Network) inherit the fix without changing each `className`.
//
// The inset is expressed as MARGIN, not padding. The reason is Tailwind v4's
// emitted property order: `padding-top` / `padding-bottom` longhand utilities
// come AFTER `padding-block` (which is what `py-*` compiles to), so a
// `pt-[env(safe-area-inset-top)]` utility would WIN the cascade against every
// consumer's existing `py-12` and clobber it to `0px` in browser tabs (where
// `env(...)` is `0px`). Margin sidesteps that conflict entirely — it sits
// outside the padding box, doesn't fight the cascade, and the consumer's
// existing padding stays intact. `env(...)` is `0px` in browser tabs and on
// non-notched hardware, so the rules are inert outside the standalone-iPhone
// case (no `display-mode: standalone` gating needed).
//
// The bottom inset is intentionally OMITTED here. For most screens the
// existing `py-12` already keeps content well above the home indicator (48px
// padding vs ~34px home indicator); for the connected chat (where the
// composer is pinned to the bottom of the visual viewport) the Offerer/Joiner
// connected wrappers apply their own `pb-[max(env(safe-area-inset-bottom),0.25rem)]`.
// Doing it in both places would double-count the inset (ticket "pick one" rule).
const SAFE_AREA_CLASSES = 'mt-[env(safe-area-inset-top)] ml-[env(safe-area-inset-left)] mr-[env(safe-area-inset-right)]'

// Primitive replacement for the raw `<main>` tag inside Home / Offerer /
// Joiner. Renders <main> by default; renders a labelled region when the
// surrounding context says we're in a showcase that already owns the page's
// <main>.
export function ScreenContainer({ label, className, children }: ScreenContainerProps) {
  const { landmark } = useScreenChrome()
  const rootClassName = className ? `${SAFE_AREA_CLASSES} ${className}` : SAFE_AREA_CLASSES
  // In default mode we render a plain <main>. We deliberately don't add
  // aria-label to <main> — there's only one per page, the document <h1> is
  // the meaningful name, and adding a label here would change long-standing
  // behavior on every screen. The `label` argument is only used by the
  // region branch, where a labelled region is required for landmark
  // navigation (and to disambiguate the seven previews stacked in the
  // showcase).
  if (landmark === 'main') {
    return <main className={rootClassName}>{children}</main>
  }
  return (
    <div role="region" aria-label={label} className={rootClassName}>
      {children}
    </div>
  )
}
