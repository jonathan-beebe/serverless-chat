---
id: A11Y-044
type: a11y
status: resolved
created: 2026-05-28
---

# A11Y-044: offerer invite copybox default focus lands on share, not copy

## Problem

On the Offerer invite branch (`src/screens/Offerer.tsx:293-311`), the CopyBox
mounts with `autoFocus={!suppressInitialFocus}`. Inside CopyBox
(`src/components/CopyBox.tsx:51-52`), when the browser supports Web Share
(`navigator.share` + `navigator.canShare`),
`shareButtonRef = useFocusOnMount(..., { skip: !autoFocus || !shareSupported })`
claims initial focus and the Copy button —
`copyButtonRef = useFocusOnMount(..., { skip: !autoFocus || shareSupported })` —
is skipped. For keyboard, screen-reader, switch-control, and screen-magnifier
users on browsers that expose `navigator.share` (now including Chrome desktop),
the default focused element on the invite screen is therefore Share rather than
the affordance the rest of the app's CopyBox instances treat as default.

## Outcome

When the invite (offerer) screen settles — `offerUrl` resolves and CopyBox
mounts — the Copy button is the default focused element on the screen,
regardless of whether the browser exposes the Web Share API. Share is still
rendered and remains reachable in the tab order, but does not receive initial
focus.

## Why it matters

WCAG 2.4.3 (Focus Order) and 2.4.7 (Focus Visible) put the burden on the page to
land focus somewhere meaningful and predictable for keyboard / AT users.
Default-focusing Share violates the page's own established pattern: every other
CopyBox in the app (Joiner reply-code, Offerer polite-defer reply-code) focuses
Copy because those instances don't pass a `share` prop. Users who rely on
programmatic focus to orient themselves get an inconsistent landing point on the
one screen where Copy is the primary action, and the OS share sheet that
triggers from Share is an out-of-document modal whose dismissal isn't exposed
through the page's accessibility tree. Copy is the durable, cross-browser,
in-document affordance and should be the default for AT users.

## Discovery notes

- FEAT-014's intent was visual: "Share is the primary affordance on mobile" —
  the layout decision that put Share to the left of Copy. The initial-focus
  assignment was a side-effect of the same skip-rule, not an independent
  decision; this ticket separates them.
- The Joiner reply-code and Offerer polite-defer CopyBoxes do NOT pass a `share`
  prop, so `shareSupported` is false there and Copy already focuses — no change
  needed on those surfaces.
- The Share button still needs to be reachable by Tab; the focus ring and tab
  order on Share must stay intact (existing A11Y-021-style focus-visible
  treatment).

## Recommendation

- Flip the focus skip-rule inside CopyBox so Copy always wins when `autoFocus`
  is set, even with `share` supplied:
  `shareButtonRef = useFocusOnMount(..., { skip: true })`,
  `copyButtonRef = useFocusOnMount(..., { skip: !autoFocus })`. Or — if other
  call sites might want Share-as-default later — add an explicit
  `focusOn?: 'copy' | 'share'` prop (default `'copy'`) on CopyBox and let
  Offerer omit it. Keep the visual order (Share | Copy) intact.
- Regression test in `src/components/CopyBox.test.tsx`: render with
  `autoFocus={true}` AND `share={...}` AND `navigator.share` /
  `navigator.canShare` stubbed-supported, then assert
  `expect(screen.getByRole('button', { name: /copy/i })).toHaveFocus()`. Mirror
  the existing autoFocus tests so the contract is paired with its Share-absent
  counterpart.
- Optional: pin the same expectation at the screen level in
  `src/screens/Offerer.test.tsx` so a future FEAT-014-style change cannot
  silently re-introduce Share-as-default.

## Related work

- FEAT-014 — introduced Share button + the shareButtonRef focus-on-mount path
- A11Y-041 — adjacent CopyBox focus change (drop auto-select on textarea focus)
- A11Y-022 — `suppressInitialFocus` showcase escape hatch read by autoFocus
- A11Y-005 — focus-on-navigation pattern useFocusOnMount implements
- A11Y-021 — focus-visible ring treatment Share must retain
- BUG-004 — CopyBox clipboard fallback (same component, different concern)

## Working

- Wrote the failing regression test first: `expect(copyButton).toHaveFocus()`
  with `autoFocus` + `share` + stubbed-supported `navigator.share`. It failed
  against current code with focus landing on Share — confirming the bug.
- Took the recommendation's primary path (flip the skip-rule, no new prop). At
  `CopyBox.tsx:51-52`:
  - `shareButtonRef = useFocusOnMount(..., { skip: true })` — Share never
    auto-focuses.
  - `copyButtonRef = useFocusOnMount(..., { skip: !autoFocus })` — Copy always
    wins when the caller opts in.
- Updated the comment block above to record A11Y-044's reasoning so the next
  person doesn't reintroduce the Share-as-default skip-rule from FEAT-014's
  wording.
- Did NOT add the optional `focusOn?: 'copy' | 'share'` prop — YAGNI: no current
  call site wants Share-as-default. If one ever appears, the prop can be added
  without a test regression because the existing callers (Offerer invite +
  reply, Joiner reply) all pass `autoFocus` and want Copy.
- Paired the A11Y-044 test with a "Share-absent baseline" case so both branches
  of the contract are pinned together. Existing FEAT-014 Share- render /
  Share-click tests pass unchanged — only the focus assignment is reversed.
- Measurement: `expect(document.activeElement)` is the Copy button (verified by
  `toHaveFocus()` in the regression test); Share is in the document but not
  focused. Did NOT add a screen-level pin in Offerer.test.tsx — the CopyBox
  unit-level pair is sufficient regression coverage and the screen test would
  just re-render the component to re-assert the same shape.
- Full suite: 571/571 (+2) green.
