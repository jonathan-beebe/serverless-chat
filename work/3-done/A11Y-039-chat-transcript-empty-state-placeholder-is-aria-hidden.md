---
id: A11Y-039
type: a11y
status: resolved
created: 2026-05-28
---

# A11Y-039: chat transcript empty-state placeholder is aria-hidden from SR users

## Problem

In `src/components/ChatTranscript.tsx:378-381`, the chat empty-state placeholder
("No messages yet. Say hello.") is rendered with `aria-hidden="true"` inside the
`role="log"` scroll container. Sighted users see the prompt; screen-reader users
entering the transcript surface hear the log's accessible name ("Chat
transcript") and then nothing — there is no announceable signal that the surface
is empty and waiting for input. The `aria-hidden` was added so the placeholder
would not be re-announced by the live region on first paint (A11Y-018), but the
over-correction silences the placeholder entirely.

## Outcome

A screen-reader user entering the empty chat transcript receives a clear,
non-live indication that the transcript is empty (e.g. the empty-state text
reaches the accessibility tree once on initial render without being subsequently
announced again as a live-region addition when the first real message arrives).

## Why it matters

WCAG 1.3.1 (Info and Relationships) and 4.1.2 (Name, Role, Value): the
empty-state communicates the current status of a user-facing surface and must be
perceivable by all users. Without it, a SR user is left to infer from silence
whether the transcript is empty, broken, or simply not yet read. The composer's
"Type a message" placeholder gives a partial hint, but the transcript's own
state should not be invisible.

## Discovery notes

The trade-off the original `aria-hidden` was solving — preventing the
placeholder from being read as a live-region addition when the first message
arrives — is real. The current `role="log"` wrapper has `aria-live="polite"` +
`aria-relevant="additions"`, so the placeholder's _removal_ is not announced
(only additions are), but its _initial paint_ could be picked up by some AT as
part of the log's initial content if exposed. Solutions to consider in
/work-start: render the placeholder as a sibling of (not inside) the
`role="log"` element; render it inside but with `aria-live="off"` only on that
element; or expose the empty-state via an `aria-describedby` on the log wrapper
that swaps out when messages arrive.

## Recommendation

Move the empty-state `<p>` out from inside the `role="log"` wrapper so it sits
as a sibling element above or below the live region. Drop `aria-hidden="true"`.
Visually keep it in the same screen position via the existing flex/`mt-auto`
chrome.

## Related work

- A11Y-018 (chat transcript aria-live on ol instead of role=log)
- A11Y-034 (chat copy button disabled without explanation)
- IMPRV-028 (transcript flex column with empty-state placeholder)
- IMPRV-029 (new-messages pill)

## Working

- `ChatTranscript.tsx:378-381` placeholder was `aria-hidden="true"` inside the
  `role="log"` wrapper — perfectly invisible to AT.
- Picked discovery-note option (2) "render inside with aria-live='off'-like
  semantics" over the recommendation's option (1) "move outside." `role="log"`
  already declares `aria-relevant="additions"`, which excludes both first-paint
  exposure (initial content is not an "addition") and the placeholder's later
  removal. Dropping `aria-hidden` is sufficient — no layout change, no
  absolute-positioning workarounds.
- Inverted the regression test at `ChatTranscript.test.tsx:282` from "marked
  aria-hidden" to "exposes it to AT" and added the reasoning inline.
- Comment block above the `role="log"` element updated to document the reasoning
  so the next person doesn't re-add `aria-hidden` defensively.
- Full suite: 504/504 green.
