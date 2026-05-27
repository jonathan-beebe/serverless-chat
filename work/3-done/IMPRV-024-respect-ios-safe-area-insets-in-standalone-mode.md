---
id: IMPRV-024
type: improvement
status: resolved
created: 2026-05-27
---

# IMPRV-024: respect ios safe area insets in standalone mode

## Problem

`index.html:8` sets `viewport-fit=cover` but no rule in `/workspace/src/`
consumes `env(safe-area-inset-*)` (grep returns zero hits across `src/`).
Concrete consequences:

- **Top inset:** every screen's `<ScreenContainer>` uses `px-4 py-12`
  (Home.tsx:573, NotFound.tsx:17, Joiner.tsx:188, Offerer.tsx:246/300) or
  `px-4 pt-6 pb-1` for the connected shell (Offerer.tsx:200, Joiner.tsx:126). In
  iOS standalone the status-bar/notch sits behind that padding; the `<h1>` and
  the connected transcript's first row clip under the notch.
- **Bottom inset on `UpdatePrompt.tsx:36-38`:**
  `fixed inset-x-0 bottom-0 ... py-3`. In standalone the home-indicator pill
  sits on top of the Update/Dismiss buttons.
- **Bottom inset on the connected chat:** Offerer.tsx:200 / Joiner.tsx:126 wrap
  the surface in `h-[var(--vvh)] ... pb-1`, and `Chat.tsx:428` renders the
  composer as the last flex child. `useVisualViewportHeight`
  (hooks/useVisualViewportHeight.ts:33-37) writes `vv.height` in px to `--vvh`
  but does NOT subtract `safe-area-inset-bottom`. In standalone with the
  keyboard down, the composer baseline sits flush with `vv.height`, which on
  iPhone falls under the home indicator.
- **Side insets in landscape** (iPhone notched devices push a left/right inset
  into the layout): screens use `mx-auto max-w-xl px-4` — at the max-xl width
  the side insets are absorbed by the gutter, but `px-4` on narrow viewports
  puts content flush to the rounded edge.

## Outcome

When the PWA is installed and launched in iOS standalone mode, every screen's
heading and primary content render fully below the status-bar/notch; the fixed
Update banner's tap targets sit fully above the home-indicator pill; and the
chat composer's bottom edge is reachable above the home indicator both with the
soft keyboard up and down. Behaviour in browser tabs and on non-notched devices
is unchanged.

## Why it matters

Standalone-install is the canonical "real app" experience for this PWA. A
clipped heading and a composer/Send button under the home indicator make the app
feel unfinished and, on the composer, force the user to tap a target the OS is
already biased to swallow as a system-gesture. Bottom-pinned banners (and,
downstream, any future toast/snackbar) inherit the same fix once the pattern is
established.

## Discovery notes

- Tailwind v4 exposes arbitrary values, so `pt-[env(safe-area-inset-top)]` /
  `pb-[env(safe-area-inset-bottom)]` /
  `pb-[max(env(safe-area-inset-bottom),0.25rem)]` work today without a plugin.
- The connected shell already uses `h-[var(--vvh)]` — the hook
  (useVisualViewportHeight.ts:34) can subtract `env(safe-area-inset-bottom)` via
  `calc()` written into `--vvh`, or the wrapper can keep its current height and
  add `pb-[env(safe-area-inset-bottom)]`. The latter is cleaner because the
  hook's pixel value is already the _visual_ viewport (not including the
  home-indicator strip in some iOS configs).
- `index.css:60-71` sets the body background — the area behind the safe-area
  insets will paint with this colour, so no additional theming is required to
  avoid a white strip behind the notch.
- `display-mode: standalone` is the standard gate for "installed PWA" if a
  scoped-only treatment is desired; insets are zero in browser tabs anyway, so
  gating is optional cosmetic insurance, not a correctness requirement.

## Recommendation

- Apply Tailwind v4 arbitrary utilities directly at the points that own the
  relevant edge:
  - `ScreenContainer` (components/ScreenChrome.tsx): add
    `pt-[env(safe-area-inset-top)]` and `pb-[env(safe-area-inset-bottom)]` to
    the rendered `<main>`/region root so every screen inherits the inset without
    touching each call site. The existing `py-12` / `pt-6 pb-1` then stack above
    the inset.
  - `UpdatePrompt` (components/UpdatePrompt.tsx:38): replace `py-3` with
    `pt-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]` (or equivalent `calc`)
    so the banner keeps its current visual padding in-browser and lifts above
    the home indicator in standalone.
  - For the connected chat shell, prefer adjusting `useVisualViewportHeight` to
    write `--vvh` as `calc(${vv.height}px - env(safe-area-inset-bottom))`, OR
    add `pb-[env(safe-area-inset-bottom)]` to the Offerer/Joiner connected
    wrappers (Offerer.tsx:200, Joiner.tsx:126). Pick one; doing both
    double-counts.
  - Left/right insets are low-priority — `px-4` is acceptable, but
    `px-[max(env(safe-area-inset-left),1rem)]` /
    `px-[max(env(safe-area-inset-right),1rem)]` on `ScreenContainer` covers
    landscape notched devices for free.
- No need to gate on `display-mode: standalone` — `env(safe-area-inset-*)` is
  `0px` in browser tabs and on non-notched hardware, so the rules are inert
  outside the standalone-iPhone case.
- Add a regression note alongside `--vvh` in `index.css` so future authors see
  why the calc subtracts the inset.

## Related work

- IMPRV-017 — bound the connected shell to `visualViewport.height` (`--vvh`
  mechanism that this ticket must dovetail with).
- IMPRV-020 — connected chat container fills `--vvh` and pins composer to bottom
  (the surface that bottoms-out under the home indicator today).
- IMPRV-021 — hides the chat copy-transcript toolbar below `sm` (mobile-only
  context where the inset matters most).

## Working

### Cascade reality check

Before shipping, I ran the actual Tailwind v4 CLI against the proposed
`pt-[env(safe-area-inset-top)]` utility on a `<main class="py-12 ...">` and
inspected the emitted CSS. Tailwind v4 emits `padding-top` longhand AFTER
`padding-block` (which is what `py-*` compiles to), so a padding-based inset
utility on `ScreenContainer` would WIN the cascade against every consumer's
`py-12` and clobber it to `0px` in browser tabs (where `env(...)` is `0px`).
That's a visual regression in the dominant case, not the "stacks above"
behaviour the recommendation assumed.

The fix: express the inset as MARGIN on `ScreenContainer`'s root. Margin sits
outside the padding box and doesn't fight the cascade, so the consumer's
existing padding stays fully intact AND the inset still pushes the element down
past the notch in iOS standalone.

### Approach chosen for the connected-chat bottom inset

Wrapper-padding, per the ticket recommendation. `useVisualViewportHeight`
remains a bare-pixel writer; the Offerer/Joiner connected `<ScreenContainer>`
each replaced their `pb-1` with `pb-[max(env(safe-area-inset-bottom),0.25rem)]`.
The `max()` form preserves the original 0.25rem breathing room in browser tabs
(where `env(...)` is `0px`) and lifts to ~34px in iOS standalone so the composer
clears the home indicator. Doing this in only one place avoids the double-count
the ticket flags.

### Final surface area

- `components/ScreenChrome.tsx` — `ScreenContainer` now emits
  `mt-[env(safe-area-inset-top)] ml-[env(safe-area-inset-left)] mr-[env(safe-area-inset-right)]`
  on its rendered root (both the `<main>` and the demoted `<div role="region">`
  branch). Bottom is intentionally omitted to avoid double-counting the
  connected wrapper's own bottom inset.
- `screens/Offerer.tsx` + `screens/Joiner.tsx` — connected wrappers' `pb-1` →
  `pb-[max(env(safe-area-inset-bottom),0.25rem)]`.
- `components/UpdatePrompt.tsx` — symmetric `py-3` →
  `pt-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]`.
- `index.css` — added a regression note alongside the `--vvh` `:root` fallback
  explaining that the hook stays a bare-pixel writer and the inset is owned by
  the connected wrapper.
- `components/ScreenChrome.test.tsx` — new test file, four tests covering the
  `<main>` branch, the demoted region branch, the left/right side insets, and
  the negative guard that the bottom inset is NOT on `ScreenContainer` itself.
- `mobile-responsive.test.tsx` — extended with three new tests (connected
  wrapper `pb-[max(...)]`, hook stays bare-pixel, UpdatePrompt
  `pt-3 pb-[max(...)]`) and updated the existing connected-padding test to
  reflect the new bottom utility.

`npm run ci` is green.
