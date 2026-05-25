---
id: IMPRV-020
type: improvement
status: resolved
created: 2026-05-25
resolved: 2026-05-25
---

# IMPRV-020: connected-chat container fills --vvh and pins composer to viewport bottom

## Problem

At Offerer.tsx:200 and Joiner.tsx:126 the connected `ScreenContainer` uses
`h-[calc(var(--vvh)-3rem)] ... px-4 py-6`. The `-3rem` (48px) leaves the
container short of the visible viewport bottom, and `py-6` adds another 24px
below the composer, so the chat input floats ~72px above the iOS keyboard (or
the window bottom on desktop) instead of sitting just above it.

## Outcome

On the connected chat surface, the composer's bottom edge is within ~4–8px of
the visible viewport bottom — i.e. the keyboard top on iOS Safari / Android
Chrome, and the window bottom on desktop. The container fills the full `--vvh`
height; there is no dead space below the container.

## Why it matters

The dominant usage mode is phone-with-keyboard-up. IMPRV-017 anchored the
surface to the visual viewport correctly, but kept FEAT-013's chrome-margin math
layered on top, so ~72px of vertical real-estate is still wasted between the
composer and the keyboard. The chat surface feels short and the composer feels
visually detached from the input it competes with.

## Discovery notes

- `--vvh` is already accurate (set by `useVisualViewportHeight` on the connected
  branch). The bottom gap is not a viewport-binding bug; it is chrome math
  layered on top.
- The `-3rem` and `py-6` together produce 24 + 48 = 72px of dead vertical space
  below the composer.
- On desktop `--vvh === 100dvh`, so removing `-3rem` also removes desktop's
  bottom breathing room. Per scoping dialogue, that is the intent — apply the
  tightening everywhere.
- The Offerer/Joiner connected shells still share the identical class string;
  the "consider extracting a shared component" note from IMPRV-017 still applies
  but should not be bundled here.

## Recommendation

- Change `h-[calc(var(--vvh)-3rem)]` to `h-[var(--vvh)]` on Offerer.tsx:200 and
  Joiner.tsx:126 so `main` fills the visible viewport.
- Replace symmetric `py-6` with asymmetric padding that keeps header breathing
  room but tightens the bottom: e.g. `pt-6 pb-1` (top 24px, bottom 4px). Adjust
  to `pb-2` if 4px reads too flush in the device check.
- Update `src/mobile-responsive.test.tsx` assertions from
  `h-[calc(var(--vvh)-3rem)]` to `h-[var(--vvh)]`, and from `py-6` to whatever
  asymmetric pair is chosen. Keep the `:root --vvh: 100dvh` fallback assertion.
- Verify in a real iOS Safari session (the IMPRV-017 fix and this one both
  depend on `visualViewport`, which JSDOM/Happy-DOM only stub).

## Related work

- FEAT-013 (4dc22a3) — original mobile-keyboard / 100dvh fix; introduced the
  `-3rem` and `py-6` shape this ticket walks back.
- IMPRV-017 — `--vvh` binding via `useVisualViewportHeight`; this ticket builds
  on it.
- IMPRV-007 — body-lock + #root-scroll pattern that the connected shell still
  relies on.

## Working

- Code paths from the ticket were nominal — the connected `ScreenContainer`
  class strings lived at `src/screens/Offerer.tsx:200` and
  `src/screens/Joiner.tsx:126` (ticket dropped the `src/screens/` prefix), and
  the only other `var(--vvh)` references were doc comments in `src/index.css`
  and `src/hooks/useVisualViewportHeight.ts`.
- TDD red step: extended the existing IMPRV-017 assertion in
  `src/mobile-responsive.test.tsx` to require `h-[var(--vvh)]` and added a new
  test for the asymmetric `pt-6 pb-1` pair, both with negative guards for the
  pre-IMPRV-020 shapes (`calc(var(--vvh)-3rem)`, `py-6`). Test run failed 2/7
  before the fix.
- Applied the change verbatim per the recommendation: `h-[var(--vvh)]` and
  `pt-6 pb-1` on both connected branches. Picked `pb-1` (4px) over `pb-2` (8px)
  per the ticket's "adjust if 4px reads too flush in the device check" wording —
  kept the tighter default; a follow-up device check can loosen if needed.
- Updated the doc-comment references to `h-[calc(var(--vvh)-3rem)]` in
  `src/index.css` and `src/hooks/useVisualViewportHeight.ts` to the new shape so
  future readers don't grep their way to the wrong expression.
- `DesignSystemChat` mounts `Offerer` directly, so the design-system/chat route
  inherits the fix without a separate edit. Verified by grep — no other call
  sites or duplicate class strings.
- Final: `npm test` → 396/396, `npm run lint` and `npm run typecheck` clean.
- Real-device verification (iOS Safari / Android Chrome) is still required per
  the ticket — JSDOM can't exercise `visualViewport`. Not blocking commit; the
  static tests guard the class strings, and IMPRV-017's binding is unchanged.
