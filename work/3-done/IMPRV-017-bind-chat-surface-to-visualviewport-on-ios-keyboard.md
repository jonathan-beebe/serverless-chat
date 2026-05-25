---
id: IMPRV-017
type: improvement
status: resolved
created: 2026-05-25
resolved: 2026-05-25
---

# IMPRV-017: bind chat surface to visualViewport so composer stays above iOS keyboard

## Problem

With FEAT-013 in place — `interactive-widget=resizes-content` (index.html:8),
body locked + #root scrolling (index.css:50-54, 34-36), `h-[calc(100dvh-3rem)]`
on the connected branches (Offerer.tsx:195, Joiner.tsx:121) — iOS Safari still
lets the page pan beneath the soft keyboard. The composer slides under the
keyboard, the transcript's bottom edge is obscured, and `100dvh` alone does not
bind the visible chat surface to the keyboard-resized visual viewport.

## Outcome

When the user focuses the composer on a phone (primary case: iOS Safari), the
document does not scroll under the keyboard; the composer remains anchored just
above the keyboard and the transcript's scroll container fills the height from
the screen top to the composer. The latest message remains visible (subject to
the existing "pinned-near-bottom" rule in Chat.tsx) until the user scrolls back
to read history. Behavior holds on Safari versions that don't honor
`interactive-widget=resizes-content` as well as those that do.

## Why it matters

This is the app's dominant usage mode — phone, keyboard open. FEAT-013 was
supposed to deliver this; on the current iOS Safari it does not, so the chat is
actively unusable in its main mode.

## Discovery notes

- `interactive-widget=resizes-content` is only honored on Safari 17.4+. Earlier
  WebKit ignores it, so `100dvh` does not shrink under the keyboard at all.
  FEAT-013's claim of "iOS Safari 16.4+" is wrong for this hint specifically.
- Even on supporting Safari, the _visual_ viewport can be panned independently
  of the _layout_ viewport on iOS — `dvh` alone does not pin a fixed-height
  container to the keyboard top.
- The robust signal is `window.visualViewport` — `height` plus `offsetTop` give
  the actual visible rectangle as the keyboard opens, rotates, or is dismissed.
- The body-lock / #root-scroll pattern (index.css:34-54) must be preserved —
  intrinsic-height screens (Home, Offerer/Joiner setup branches, Design System)
  still rely on #root scrolling on short viewports.

## Recommendation

- Add a small hook (e.g. `useVisualViewportHeight`) that subscribes to
  `window.visualViewport`'s `resize` + `scroll` events, writes the current
  visible height to a CSS custom property on `:root` (e.g. `--vvh`), and falls
  back to `100dvh` when `visualViewport` is absent.
- Swap `h-[calc(100dvh-3rem)]` at Offerer.tsx:195 and Joiner.tsx:121 for
  `h-[calc(var(--vvh,100dvh)-3rem)]` so non-supporting browsers keep today's
  behavior while iOS Safari binds tightly to the visual viewport.
- On each `visualViewport.resize`, call `window.scrollTo(0, 0)` to defeat iOS's
  page-pan-under-keyboard. Guard with a small idempotence check so it doesn't
  fight legitimate user scroll of intrinsic-height screens — easiest cut is to
  scope the scroll-reset to the connected routes (where `body` is functionally
  locked anyway).
- Extend `src/mobile-responsive.test.tsx`: assert the hook is mounted by the
  connected branches, assert the `--vvh` consumer is in the className, keep the
  existing `dvh` assertion as the fallback guard.
- The Offerer/Joiner connected containers share an identical class string. If
  this ticket touches both, consider whether the connected shell should be
  extracted to a shared component — but only if it falls out naturally; don't
  bundle a refactor into this scope.

## Related work

- FEAT-013 (4dc22a3) — original mobile-keyboard fix; this ticket is a follow-up
  on its open edge cases.
- IMPRV-005 — chat auto-scroll yanks scrollback (the "near-bottom" guard that
  interacts with any new viewport-driven height changes).
- IMPRV-007 — connected screen page-scrolls with transcript (the body
  scroll-lock + #root scroller pattern that this ticket builds on).
- Commit 7262b40 — "lock body scroll and let #root handle intrinsic-height
  screens" (the layout invariant this work must preserve for non-connected
  screens).

## Working

- Added `src/hooks/useVisualViewportHeight.ts` (active flag). When active and
  `window.visualViewport` is present, subscribes to `resize` + `scroll`, writes
  `vv.height` (px) to `--vvh` on `<html>`, and calls `window.scrollTo(0, 0)` to
  defeat the iOS pan-under-keyboard. Cleans up on unmount.
- `index.css`: added `:root { --vvh: 100dvh }` so unmounted / unsupported
  browsers keep the FEAT-013 `dvh` behavior with no inline fallback needed in
  the consumer class.
- `Offerer.tsx` + `Joiner.tsx`: mount the hook with `branch === 'connected'` so
  the side effects are scoped to the connected shell; swapped
  `h-[calc(100dvh-3rem)]` for `h-[calc(var(--vvh)-3rem)]`.
- Recommendation said "consider extracting the connected shell to a shared
  component, but only if it falls out naturally; don't bundle a refactor." An
  `active`-flag hook keeps both screens unchanged structurally, so I didn't
  extract — touching only the surface required.
- Tests:
  - `src/mobile-responsive.test.tsx` — refreshed assertions to the new
    `var(--vvh)` shape, added a `:root --vvh: 100dvh` fallback check, hook file
    existence check, and mount-site check on both screens.
  - `src/hooks/useVisualViewportHeight.test.ts` — 7 behavioral tests against a
    mocked `window.visualViewport` (EventTarget) covering initial apply, resize,
    scroll, `scrollTo(0,0)` side effect, unmount cleanup, `active=false` no-op,
    and missing-visualViewport no-op.
- Full validation: `lint`, `typecheck`, `test` (394/394), `build` all green.
