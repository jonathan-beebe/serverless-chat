---
id: IMPRV-027
type: improvement
status: open
created: 2026-05-27
---

# IMPRV-027: hide chat transcript border below sm breakpoint

## Problem

`ChatTranscript.tsx:137` puts
`rounded-md border border-stone-300 ... dark:border-stone-700` on the wrapper
`<div>` that is the transcript's scroll surface. On phone-width viewports this
draws a visible 1px stone-300/700 outline framing the chat window. Element: the
`role="log" aria-label="Chat transcript"` wrapper inside `Chat.tsx` (the middle
of three children: ChatCopyToolbar, ChatTranscript, ChatComposer).

## Outcome

On viewports < 640px (Tailwind `sm`) the transcript wrapper renders with no
border (and no rounded corners reading as a card); on viewports ≥ 640px the
`border border-stone-300 ... dark:border-stone-700 rounded-md` framing is
unchanged.

## Why it matters

Reclaims ~2px on each horizontal edge and removes the boxed-card look on phones
where the chat surface should read edge-to-edge with the screen chrome —
consistent with the mobile direction IMPRV-020 (vvh-fill) and IMPRV-021 (hide
toolbar) already established. The card outline reads as design noise inside an
already-cramped phone viewport.

## Discovery notes

- Only one `border` utility lives on the chat surface: `ChatTranscript.tsx:137`.
  ChatComposer and ChatCopyToolbar carry no `border-*` classes; the `Chat`
  wrapper (`Chat.tsx:30`) is layout-only (`flex min-h-0 flex-1 flex-col gap-3`).
  Offerer/Joiner connected `ScreenContainer` is also borderless.
- The border is purely cosmetic. It frames a card but does not separate
  scrollable content from the composer — `flex-1 overflow-y-auto` (same line)
  owns the scroll affordance; `gap-3` on the Chat wrapper owns the composer
  separation. Removing it on mobile loses nothing structural.
- Focus ring (`focus-visible:ring-2 focus-visible:ring-sky-400`, A11Y-021) is
  independent of the border — it still renders on keyboard focus even when the
  border is gone, since it's a ring, not a border-color swap.
- The `rounded-md` reads as card chrome that exists _because of_ the border; on
  mobile, with no border, the rounded corners over the `bg-white/50` tint would
  look orphaned. Drop both at `< sm`.
- IMPRV-021 precedent (the exact responsive-hide idiom in this codebase):
  `className="hidden sm:flex items-center justify-end gap-3"`
  (`ChatCopyToolbar.tsx:106`). Toggles whole-element visibility at the `sm`
  breakpoint; mobile-first default.

## Recommendation

On `ChatTranscript.tsx:137`, replace
`rounded-md border border-stone-300 ... dark:border-stone-700` with the sm-gated
form:
`sm:rounded-md sm:border sm:border-stone-300 ... dark:sm:border-stone-700`. Keep
`bg-white/50 dark:bg-stone-900/50`, `p-3`, scroll/focus utilities as-is. Net
effect: phones get a clean borderless, square-cornered transcript that bleeds
into the screen padding; tablets/desktops are byte-identical to today.

## Related work

- IMPRV-021 — hide `ChatCopyToolbar` `< sm` via `hidden sm:flex` on the
  toolbar's inner `<div>` (`ChatCopyToolbar.tsx:106`). Precedent for the
  responsive-hide direction.
- IMPRV-020 — connected Chat shell binds to `--vvh`; mobile real-estate context.
- FEAT-013 — original mobile responsive chat baseline this walks back.
- BUG-010 — wide-screen centering; orthogonal, do not merge.
- IMPRV-026 — wide-screen floating-card; complementary mobile/wide story.
