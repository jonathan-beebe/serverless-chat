# FEAT-013: Mobile-responsive chat — avoid the keyboard, no zoom-on-focus

**Status:** Resolved **Type:** Feature **Area:** `index.html`, `src/index.css`,
`src/screens/Offerer.tsx`, `src/screens/Joiner.tsx` (+ tests)

## Summary

On a phone, the connected chat surface today has two showstopping bugs:

1. **Focusing any form field zooms the page.** iOS Safari auto-zooms when a
   focused `<input>` or `<textarea>` renders at a font-size below 16px. Our
   `Textarea` primitive uses `text-sm` (14px), so tapping the message composer
   or the reply-code box on iPhone yanks the layout up and to the side.
2. **The soft keyboard covers the composer.** The connected screens size
   themselves with `h-[calc(100vh-3rem)]`. On iOS, `100vh` is the _layout_
   viewport — it stays the same when the on-screen keyboard appears, so the chat
   extends underneath the keyboard and the composer (the thing you're typing
   into) is hidden behind it.

This ticket fixes both. After the change, opening the chat on a phone keeps the
page at 1× zoom on focus, and the composer + the last few messages stay visible
above the soft keyboard.

## Acceptance criteria

1. **No zoom-on-focus on touch devices.** Inputs and textareas render at ≥ 16px
   on touch-primary devices (`@media (hover: none) and (pointer: coarse)`),
   which is the threshold iOS Safari uses to decide whether to auto-zoom on
   focus. Desktop visual rhythm is unchanged.

2. **Viewport hint resizes content when the keyboard is open.** The
   `<meta name="viewport">` tag gains `interactive-widget=resizes-content`, so
   on browsers that honor the hint (iOS Safari 16.4+, Chrome 108+) the layout
   viewport shrinks when the soft keyboard appears.

3. **Connected chat uses the dynamic viewport.** The Offerer/Joiner connected
   branches swap `h-[calc(100vh-3rem)]` for `h-[calc(100dvh-3rem)]` so the chat
   surface shrinks in lockstep with `interactive-widget`. Desktop is unchanged
   (`100dvh === 100vh` when there is no dynamic browser chrome).

4. **No accessibility regressions.** No `maximum-scale`, no `user-scalable=no`.
   The user can still pinch-zoom the page.

5. **Tests:**
   - `src/mobile-responsive.test.tsx` (new) — asserts the viewport meta contains
     `interactive-widget=resizes-content`, asserts `src/index.css` carries the
     16px touch-device font-size rule, asserts the connected `Offerer`/`Joiner`
     screens size with `100dvh` (not `100vh`).

6. **`npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` all
   pass.**

## Working notes

- The 16px rule is scoped to `@media (hover: none) and (pointer: coarse)` so the
  desktop's denser `text-sm` (14px) inputs stay unchanged. Targeting only the
  touch context matches the actual trigger: iOS Safari auto-zoom only fires on
  touch.
- `interactive-widget=resizes-content` (vs. the default `resizes-visual`) is
  what makes `100dvh` actually shrink under the keyboard on iOS. Without it,
  `dvh` only tracks the URL-bar collapse, not the keyboard.
- The Offerer/Joiner setup branches (invite, reply, closed) already use `py-12`
  with `ScreenContainer` and scroll inside `#root` per the `overflow-hidden`
  body lock — they're not bounded-height like the connected branch, so they need
  no change.
- Safe-area insets weren't part of the visible bug report so they're out of
  scope here; the existing `py-6` on the connected container leaves room for the
  iOS home indicator on most phones, and a follow-up can layer
  `env(safe-area-inset-*)` if a tester finds it bites.
