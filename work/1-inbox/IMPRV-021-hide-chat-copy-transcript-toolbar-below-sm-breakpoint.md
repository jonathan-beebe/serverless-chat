---
id: IMPRV-021
type: improvement
status: open
created: 2026-05-25
---

# IMPRV-021: hide chat copy-transcript toolbar below sm breakpoint

## Problem

The chat copy-transcript toolbar at Chat.tsx:254-284 (Include-timestamps
toggle + Copy button) renders unconditionally above the transcript whenever
messages exist. On phone-width viewports the toolbar row eats ~36-40px of
vertical space that the transcript needs more than the user needs an in-chat
copy affordance — Home already exposes Copy transcript per row (IMPRV-009).

## Outcome

On viewports < 640px (Tailwind's `sm` breakpoint), neither the
Include-timestamps checkbox nor the Copy button render on the connected chat
surface; the transcript expands to occupy the freed row. On viewports ≥ 640px
the toolbar renders exactly as today (subject to the existing A11Y-034 "hide
when empty" rule). The Home conversation-row `⋯` menu's "Copy transcript" item
remains available at every viewport size, so small-screen users still have a
one-click copy path.

## Why it matters

Phone is the dominant usage mode. Every vertical pixel competes with the iOS
keyboard and the transcript; an in-chat duplicate of an affordance that already
exists on Home is the cheapest row to give back. This pairs with IMPRV-020's
bottom-padding tightening — both walk back FEAT-013-era padding that doesn't pay
for itself on a phone.

## Discovery notes

- The IMPRV-009 Home row-menu copy uses
  `formatTranscript(messages, { includeTimestamps: true })` with no toggle UI.
  Hiding the in-chat toggle on small screens does not regress any small-screen
  feature — small-screen users always got "with timestamps" via Home anyway.
- The toolbar wrapper at Chat.tsx:254 is already a `messages.length > 0 &&`
  gated `<div className="flex items-center justify-end gap-3">`. The hide rule
  layers cleanly on top of the existing gate.
- `<Chat>` is also mounted by the `/design-system/chat` preview (IMPRV-019).
  Verify the preview still shows the toolbar at desktop widths and is consistent
  with what the real connected chat renders.

## Recommendation

- On the toolbar wrapper at Chat.tsx:254, swap
  `flex items-center justify-end gap-3` for
  `hidden sm:flex items-center justify-end gap-3` so the row is `display: none`
  below 640px and the existing flex layout above it.
- Leave the manual-copy fallback Callout (Chat.tsx:285) and the hidden fallback
  textarea unconditioned — they're zero-height when idle and matter only on
  `onCopy`, which can't fire when the button isn't rendered.
- Add a test in `Chat.test.tsx` (or `mobile-responsive.test.tsx`) asserting the
  toolbar wrapper carries the `hidden sm:flex` class string, plus a positive
  test that the Home row-menu "Copy transcript" item is still present at any
  viewport (it's viewport-independent today, but worth a guard).
- Consider whether `/design-system/chat` should render at a known viewport in
  its preview frame so the toolbar visibility is observable in the showcase;
  don't bundle if it's awkward.

## Related work

- FEAT-011 (copy transcript in chat) — introduced the toolbar this ticket hides
  on small screens.
- IMPRV-009 — added "Copy transcript" to the Home row `⋯` menu; this ticket
  relies on it as the small-screen path.
- A11Y-034 — toolbar already hidden when transcript is empty; this ticket
  extends that conditional with a viewport-width rule.
- IMPRV-020 — sibling small-screen vertical-space reclaim on the same connected
  chat surface.
