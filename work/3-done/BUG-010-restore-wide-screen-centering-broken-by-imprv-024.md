---
id: BUG-010
type: bug
status: resolved
created: 2026-05-27
resolved: 2026-05-27
---

# BUG-010: restore wide-screen centering broken by imprv-024 margin insets

## Problem

After IMPRV-024 (commit `8e79d97`), `src/components/ScreenChrome.tsx:78` applies
`mt-[env(safe-area-inset-top)] ml-[env(safe-area-inset-left)] mr-[env(safe-area-inset-right)]`
to every screen's root element. Consumers (`Home.tsx:64`, `Offerer.tsx`,
`Joiner.tsx`, `NotFound.tsx:17`) author their root className as e.g.
`mx-auto flex max-w-xl flex-col ... px-4 py-12`. When `ml-[env(...)]` and
`mr-[env(...)]` are concatenated alongside `mx-auto`, Tailwind's longhand
`margin-left` / `margin-right` utilities WIN the cascade over
`margin-inline: auto`. In browser tabs (where `env(...)` resolves to `0px`) this
becomes `margin-left: 0px; margin-right: 0px` which kills the auto-centering. On
viewports wider than the screen's `max-w-xl` (576px), Home / Offerer / Joiner /
NotFound content sits flush against the left edge instead of centered.

## Outcome

On a wide viewport (≥768px) every screen's content (Home heading + Start CTA +
past chats list; Offerer/Joiner setup branches; NotFound) is horizontally
centered within the viewport. On phone-width viewports (≤640px) the layout is
unchanged. iOS standalone safe-area-inset behavior (notch top, landscape
left/right edge clearance) still applies — no regression of IMPRV-024's
standalone wins.

## Why it matters

The desktop / wide-screen presentation is left-aligned and looks broken; this is
the first impression for anyone viewing the open-source project on a desktop
browser. IMPRV-024 fixed a real iOS standalone problem but stole the wide-screen
layout in the process — a "fixed A, broke B" regression. Affects every screen
because the offending utilities live in the shared `ScreenContainer` primitive.

## Discovery notes

- Tailwind v4 emits `ml-` / `mr-` as `margin-left` / `margin-right` longhand;
  `mx-auto` compiles to `margin-inline: auto` (shorthand). The longhand declared
  later in the cascade wins. Concatenating `mx-auto` BEFORE the safe-area
  classes in the string doesn't help — class-string ordering doesn't drive CSS
  specificity; the emitted rule order in the bundle does, and longhand utilities
  are emitted after `margin-inline`.
- IMPRV-024 specifically avoided using padding (would conflict with `py-12`) by
  choosing margin. Padding doesn't have the centering problem but does have
  IMPRV-024's original cascade problem on the top axis. The fix here can't just
  flip back to padding without re-introducing IMPRV-024's bug.
- `env(safe-area-inset-*)` is `0px` everywhere outside iOS-notched-standalone.
  So the regression is invisible there — it's the BROWSER TAB and DESKTOP case
  where `0px` longhand kills `auto`. iOS standalone-with-notch was never broken
  (insets were non-zero there).
- Candidate fixes: (a) move safe-area handling OUT of `ScreenContainer` and onto
  a higher-level wrapper (`body`, `#root`); (b) use
  `pl-[max(env(safe-area-inset-left),1rem)]` on screen consumers, replacing
  `px-4`; (c) wrap children in an inner div that holds the inset, leaving
  consumer's className on the OUTER `<main>` for centering.
- Option (a) is cleanest — single change, no interaction with any consumer, and
  `body { padding: env(safe-area-inset-*) }` is the canonical iOS PWA pattern.

## Recommendation

Move safe-area-inset handling out of `ScreenContainer` and apply it at the
`body` / `#root` level via raw CSS in `src/index.css` (consistent with the
existing `body { overflow: hidden }` / `#root { overflow-y: auto }` posture).
Remove `SAFE_AREA_CLASSES` from `ScreenContainer`. Update the IMPRV-024
mobile-responsive tests

- the ScreenChrome test that assert the margin utilities — re-point them at the
  new CSS rule via the postcss helper RFCTR-002 added. The connected-chat bottom
  inset (`pb-[max(env(safe-area-inset-bottom),0.25rem)]` on Offerer/Joiner
  connected wrappers) stays unchanged — that's a wrapper-local concern that
  doesn't touch centering. The `UpdatePrompt` banner's bottom inset is also
  unchanged. Verify on Home at ≥1024px (centered) and on iOS Safari standalone
  (notch top inset, no clipped content).

## Related work

- IMPRV-024 (commit `8e79d97`) — introduced the `SAFE_AREA_CLASSES` margin
  treatment that overrides consumer `mx-auto`.
- A11Y-002 — established `<main>` per screen; `ScreenContainer` is where the
  inset landed.
- FEAT-007 — design-system foundation; `ScreenContainer` is part of it.
- IMPRV-020 / IMPRV-021 — Offerer/Joiner connected wrapper layout.
- 2026-05-25 retro — flagged "fixed A broke B" regression patterns.
