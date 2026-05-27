---
id: IMPRV-025
type: improvement
status: resolved
created: 2026-05-27
---

# IMPRV-025: mobile native touch css polish

## Problem

The PWA has no mobile-native touch CSS. Four concrete gaps:

1. `src/index.css` declares no `overscroll-behavior` anywhere. The
   connected-chat transcript (`src/components/Chat.tsx:330-339`, the
   `role="log"` wrapper with `flex-1 overflow-y-auto`) is the only internal
   scroller; scroll-chaining from its top edge bubbles to `#root`
   (`overflow-y: auto`, index.css:44-46). On Safari/Chrome iOS, pull-to-refresh
   on the transcript top reloads the document — destroying the live
   `RTCPeerConnection` and ending the chat.
2. No `-webkit-tap-highlight-color`. `Button.tsx`, `Textarea.tsx`, and the copy
   controls inside `CopyBox.tsx` / `Chat.tsx` flash the iOS default translucent
   grey on every tap, conflicting with the sky-700 / stone hover states the
   design system already defines.
3. No `touch-action: manipulation` on interactive primitives. Safari still
   reserves the 300ms double-tap-to-zoom window on `<button>` and `<a>` elements
   that don't opt out, adding perceptible lag to Send, Copy, toolbar toggles,
   and the header/back controls.
4. No `user-select` posture for chat messages. The `whitespace-pre-wrap` spans
   in `Chat.tsx:396-398` inherit the browser default; on iOS Safari a long-press
   inside a bubble engages text selection inconsistently (callout menu often
   misses the bubble bounds, and selection bleeds into timestamps/delivery
   glyphs).

## Outcome

- Pulling down at the top of the connected-chat transcript does NOT reload the
  page; the live session survives the gesture.
- Tapping Send, Copy, Connect, Back, theme toggle, etc. shows the component's
  own hover/active state with no iOS grey overlay flash.
- Tapping interactive primitives on iOS Safari registers without a perceptible
  300ms delay.
- Long-pressing a chat message bubble on iOS selects the message text cleanly
  (and only that bubble's text), enabling quote/copy via the native callout.
  Timestamps and delivery checks are excluded from the selection.

## Why it matters

Pull-to-refresh on the connected chat is catastrophic — it silently tears down
WebRTC state mid-conversation with no recovery path (setup screens / Home reload
non-destructively, so the treatment must be scoped). Tap flash

- 300ms delay are the two cheap tells that mark a "website pretending to be an
  app"; the PWA shell, vvh sizing (IMPRV-020), and keyboard-aware viewport
  (IMPRV-017) work above the fold are undermined by the gesture layer staying
  generic. Selectable bubbles are a low-cost affordance users expect from any
  modern chat surface.

## Discovery notes

- `overscroll-behavior` must apply (a) on the transcript wrapper in `Chat.tsx`
  to stop scroll-chaining from inside the chat, and (b) on `body` so a
  pull-to-refresh attempted _outside_ the transcript on the connected route
  still doesn't reload. Home / Setup screens already scroll via `#root` and
  reloading them is safe — but `body` is shared, so the simplest correct scope
  is `body { overscroll-behavior-y: contain }` globally; the cost is that
  pull-to-refresh becomes unavailable on Home too, which is acceptable for a
  PWA.
- `-webkit-tap-highlight-color: transparent` belongs on `html` (cheap,
  universal, no spec conflict) — every primitive inherits it and the
  design-system focus-visible/hover states remain the only feedback.
- `touch-action: manipulation` belongs on the Button/Textarea base class (and on
  the chat bubbles' interactive controls). Putting it on
  `button, [role="button"], a, input, textarea, select` in `index.css` is the
  smallest change with full coverage.
- `user-select` is dual: `user-select: text` on message-text spans, and
  `user-select: none` on timestamp/delivery glyph spans so they're excluded from
  the selection. Tailwind v4 ships `select-text` / `select-none` utilities.

## Recommendation

- Add to `src/index.css`:
  - `html { -webkit-tap-highlight-color: transparent; }`
  - `body { overscroll-behavior-y: contain; }`
  - a base rule (or `@layer base`) for
    `button, a, input, textarea, select, [role="button"] { touch-action: manipulation; }`
- In `Chat.tsx`, add `overscroll-contain` to the transcript wrapper (line 339)
  for belt-and-suspenders against scroll-chaining.
- In `Chat.tsx`, add `select-text` to the message-text `<span>` (line 396) and
  `select-none` to the time/delivery `<span>` (line 400).
- No changes needed in `Button.tsx` / `Textarea.tsx` / `CopyBox.tsx` if the
  global `touch-action` + `tap-highlight` rules land in `index.css`.

## Related work

- IMPRV-020 — connected chat container fills vvh, pins composer bottom.
- IMPRV-017 — bind chat surface to visualViewport on iOS keyboard.
- FEAT-013 — mobile responsive chat.

## Working

- 2026-05-27 — moved to `2-doing`; following TDD per
  `work-start/types/improvement.md`.
