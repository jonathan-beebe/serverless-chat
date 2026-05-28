---
id: A11Y-040
type: a11y
status: resolved
created: 2026-05-28
---

# A11Y-040: network per-message timeline announces its name twice on entry

## Problem

In `src/network/Network.tsx:166-200`, the per-message timeline carries two
nearly-duplicate accessible names. The outer scroll wrapper at line 177-182 is
`<div role="region" aria-label="Per-message timeline (scrollable)" tabIndex={0}>`.
The `<table>` inside it (line 182) uses
`aria-labelledby="net-timeline-heading"`, which targets the `<h2>` "Per-message
timeline (last N)". A screen-reader user entering the region hears the long
label and then immediately the table's near-identical name as they move inward.
The two names describe the same nested element from two angles.

## Outcome

The per-message timeline exposes a single, unambiguous accessible name on the
keyboard-scrollable surface; assistive tech does not announce two near-duplicate
names when traversing into the table.

## Why it matters

WCAG 2.4.6 (Headings and Labels) requires labels to be descriptive but not
redundant. The current shape is technically conformant (each element has a valid
name) but creates verbal noise that obscures the table's actual data. The
"scrollable" qualifier on the region was added by A11Y-028 to convey the
keyboard-scroll affordance on Firefox/Safari — that information is still useful,
but does not require a parallel name. A SR user navigating by landmarks then
headings already discovers the region and the heading separately; restating the
heading text on the region is double work.

## Discovery notes

Several shapes can resolve the duplication without losing the A11Y-028
keyboard-scroll fix. The region could carry no `aria-label` (the table caption /
heading already names the content), or it could carry a name that describes the
_interaction_ rather than the _content_ ("Scroll region" / similar). The table's
`aria-labelledby` should be preserved — it's the authoritative content name. The
`tabIndex={0}` and focus ring stay regardless.

## Recommendation

Drop the `aria-label="Per-message timeline (scrollable)"` from the outer
wrapper. Keep `role="region"` so it remains a navigable landmark, and keep
`tabIndex={0}` so keyboard users can scroll on Firefox/Safari per A11Y-028. The
table's `aria-labelledby="net-timeline-heading"` is the canonical name; the
wrapper does not need to restate it. If a region without a name fails
landmark-detection in the team's chosen AT, fall back to a non-redundant name
like "Per-message timeline scroll".

## Related work

- A11Y-027 (network timeline table no accessible name no th scope)
- A11Y-028 (network timeline scroll container not keyboard scrollable)

## Working

- `Network.tsx:177-181` wrapper carried `role="region"` +
  `aria-label="Per- message timeline (scrollable)"`, duplicating the heading
  that the inner `<table>` already names via
  `aria-labelledby="net-timeline-heading"`.
- Took the recommendation's primary path: dropped both `role` and `aria-label`
  on the wrapper. Landmark navigation is already provided by the parent
  `<section aria-labelledby="net-timeline-heading">`, so no landmark is lost.
- Kept `tabIndex={0}`, `overflow-x-auto`, and the focus-visible ring — the
  A11Y-028 keyboard-scroll requirements are unchanged.
- Added `data-testid="net-timeline-scroll"` to give the regression test a stable
  selector now that the role-based query no longer matches; rewrote the test to
  assert the wrapper is focusable AND that the duplicate names are gone
  (`hasAttribute('role')` / `hasAttribute('aria-label')` both false).
- Full suite: 504/504 green.
