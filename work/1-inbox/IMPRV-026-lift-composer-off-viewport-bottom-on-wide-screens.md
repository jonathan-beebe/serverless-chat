---
id: IMPRV-026
type: improvement
status: open
created: 2026-05-27
---

# IMPRV-026: lift composer off viewport bottom on wide screens

## Problem

On the connected chat surface, the `ScreenContainer` wrapper is sized
`h-[var(--vvh)]` (`Offerer.tsx:207`, `Joiner.tsx:133`). `--vvh` resolves to
`visualViewport.height` while connected (`useVisualViewportHeight.ts:34-37`) and
falls back to `100dvh` (`index.css:42`). On a desktop / wide-viewport browser
the visual viewport equals the layout viewport, so `h-[var(--vvh)]` makes the
chat shell fill the window vertically, and the composer (`ChatComposer`, the
last flex child) is pinned flush to the bottom edge of the browser window with
no breathing room — uncomfortable on a desktop browser where the rest of the app
reads as a relaxed card-style layout.

## Outcome

On viewports ≥ 640px (Tailwind `sm`) the chat composer sits with visible
breathing room above the bottom edge of the viewport — not glued to the window's
bottom. On viewports < 640px the composer remains flush to the visual-viewport
bottom so the iOS keyboard-pin behaviour from IMPRV-017 / IMPRV-020 is
unchanged.

## Why it matters

Wide-screen polish. Today the connected chat is the only surface where an
interactive control (the composer) sits flush against the browser's chrome — on
desktop browsers this reads as unfinished. Pairs with BUG-010 (wide-screen
centering) and IMPRV-027 (mobile border) to round out the responsive layout
story.

## Discovery notes

- The simpler shape (decided 2026-05-27): leave the `ScreenContainer` wrapper at
  `h-[var(--vvh)]` unchanged; lift just the composer off the bottom on wide
  screens. Net visual: the wrapper still extends to the viewport bottom, but the
  composer has air below it. The wrapper's background (page bg) shows in the gap
  — acceptable because the gap is small and the bg blends with the surrounding
  chrome.
- The inner `Chat` (`Chat.tsx:30`) uses `flex min-h-0 flex-1 flex-col gap-3` —
  `ChatTranscript` consumes `flex-1` so it grows up to whatever space the
  composer leaves. Adding `sm:mb-N` to the composer (or its `<form>` wrapper)
  shrinks the composer's effective slot from the bottom; the transcript adapts
  automatically.
- A previous draft of this ticket (filename
  `float-connected-chat-on-wide-screens`) proposed capping the wrapper height so
  the whole surface read as a floating card. Rejected as more code, more test
  churn, and an interaction with `--vvh` that requires care. The user's
  preference is the simpler symptom-fix.
- `pb-[max(env(safe-area-inset-bottom),0.25rem)]` is currently on the wrapper
  (IMPRV-024); it remains there because it's about the iOS home-indicator
  clearance for the wrapper's own bottom edge, which is a separate concern from
  the composer's bottom margin within the wrapper.
- Static class assertions in `src/mobile-responsive.test.tsx` currently pin
  `h-[var(--vvh)]` and `pt-6 pb-[max(...)]` on the wrapper — those assertions
  stay green under this design. A new positive assertion is needed for the
  composer's `sm:mb-N` utility.

## Recommendation

Add `sm:mb-4` (or `sm:mb-6`) to the composer `<form>` element inside
`src/components/ChatComposer.tsx`. One element, one utility, gated to `sm:`.
Tailwind v4 will emit `margin-bottom: 1rem` (or `1.5rem`) only above the `sm`
breakpoint; below it, no rule applies and mobile is unchanged. Verify by
inspecting the connected chat in a desktop browser ≥640px wide — composer should
sit with `1rem` (≈16px) of breathing space below it. Add one new behavior
assertion in `src/mobile-responsive.test.tsx` that renders the connected
`ChatComposer` (or `<Chat>` with stub session) and reads the composer form's
className for `sm:mb-*` presence.

## Related work

- IMPRV-017 — `useVisualViewportHeight` hook; writes `--vvh` while connected.
- IMPRV-020 — dropped slack to `h-[var(--vvh)]` + `pt-6 pb-1`; this ticket adds
  composer breathing room on top of that baseline without changing wrapper
  height.
- IMPRV-021 — established `sm:` (≥640px) as the phone-vs-larger line.
- IMPRV-024 — `pb-[max(env(safe-area-inset-bottom),0.25rem)]` on the connected
  wrapper; unrelated edge (wrapper-vs-viewport), preserved.
- BUG-010 — wide-screen centering; orthogonal, lands separately.
- RFCTR-003 — Chat split; `ChatComposer` is now an independent file and is the
  natural home for the new utility.
- FEAT-013 — original `100dvh` + `interactive-widget=resizes-content` posture.
