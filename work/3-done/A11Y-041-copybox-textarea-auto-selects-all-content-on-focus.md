---
id: A11Y-041
type: a11y
status: resolved
created: 2026-05-28
---

# A11Y-041: copybox textarea auto-selects all content on focus

## Problem

In `src/components/CopyBox.tsx:137`, the readonly textarea that displays the
invite URL or reply code calls `e.currentTarget.select()` on every focus event.
A keyboard user who Tabs into the textarea (or a screen-reader user moving focus
in browse mode) immediately has the entire content selected. Any subsequent
printable keystroke replaces the contents — and although the textarea is
`readOnly`, the visual "everything is selected" cue is jarring and unexpected
for a non-input control. On Safari/iOS in particular, the auto-select also yanks
the soft keyboard's selection handles into view.

## Outcome

A user who focuses the CopyBox textarea sees a stable, unselected (or
cursor-only) state by default; selection of the contents only occurs as a direct
consequence of a user action (the Copy button, or an explicit user gesture like
Ctrl+A).

## Why it matters

WCAG 3.2.1 (On Focus): receiving focus should not initiate a change of context
or substantively alter the visible state of the focused component without user
input. A textarea that auto-selects its content on focus is at minimum
surprising and at worst misleading — keyboard users routinely Tab through forms
to orient themselves, and a "you've selected something" state where they
expected only "I have focus here" creates friction and (when combined with the
fallback `execCommand('copy')` path) opens the door to accidental clipboard
writes or content overwrites in adjacent fields.

## Discovery notes

The original intent of `select()` is to make a manual Ctrl+C / Cmd+C fallback
work with a single keystroke after focus. That's only needed when the modern +
legacy clipboard paths both fail (the `needsManualCopy` branch). In the happy
path, the Copy button does the work; selecting on focus is decorative. There are
also two `useFocusOnMount` paths in this component (`shareButtonRef`,
`copyButtonRef`) that already drive initial focus to the primary action button —
so on the autoFocus screens the textarea is not the focus target anyway. The
collateral damage is when a user Shift+Tabs _backward_ into the textarea, or
Tabs in from the help text below.

## Recommendation

Move the `select()` call out of `onFocus` and into the fallback branch of
`onCopy` — i.e., only select the textarea when both clipboard paths have failed
and the user must press Ctrl+C / Cmd+C themselves. The
`setNeedsManualCopy(true)` branch already runs at exactly that moment, and the
manual-copy Callout's `aria-describedby` association announces the instruction
on the textarea. Drop `onFocus={(e) => e.currentTarget.select()}` from the JSX.
Verify the fallback path still selects the textarea before reaching
`setNeedsManualCopy`.

## Related work

- A11Y-019 (copybox warning callout aria-hidden)
- A11Y-020 (copybox copied callout auto-dismiss 1500ms)
- A11Y-001 (copybox invalid html ids)

## Working

- `CopyBox.tsx:137` carried `onFocus={(e) => e.currentTarget.select()}` — every
  focus event auto-selected the textarea content.
- Dropped the handler entirely. The manual-copy fallback inside `onCopy` (lines
  91-102) already calls `el.select()` before flipping
  `setNeedsManualCopy(true)`, so a Ctrl+C / Cmd+C keystroke in the manual- copy
  callout still works exactly as before — the selection just happens in response
  to the click rather than incidentally on focus.
- Added a comment above the `<Textarea>` explaining why `onFocus` is
  intentionally absent (cites WCAG 3.2.1 and points at the fallback's own
  `select()`).
- No new test — the existing manual-copy fallback test already exercises the
  path that performs the selection.
- Full suite: 504/504 green.
