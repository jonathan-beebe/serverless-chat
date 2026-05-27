---
id: IMPRV-029
type: improvement
status: open
created: 2026-05-27
---

# IMPRV-029: New-messages button surfaces when scrolled back and new messages arrive

## Problem

After IMPRV-028 (bottom-anchored transcript), the IMPRV-005 anti-yank behavior
holds visible older messages in place when a new message arrives while the user
is scrolled up reading history. There is currently no visual affordance in
`src/components/ChatTranscript.tsx` signaling to the user that newer messages
have arrived below the viewport — they remain invisible until the user manually
scrolls to the bottom or notices the polite live-region announcement.

## Outcome

- While the user is scrolled back (not within the 32px near-bottom threshold)
  and at least one new message has arrived since they scrolled away from the
  bottom, a "N new messages" button is visible inside the chat surface,
  positioned at the bottom edge of the transcript area just above the composer.
- The button shows the running count of messages that have arrived since the
  user scrolled away from the bottom (e.g. "1 new message", "3 new messages").
- Activating the button (click, tap, or keyboard) scrolls the transcript to the
  newest message (adjacent to the composer) and dismisses the button.
- The button is the only thing that dismisses it: if the user manually scrolls
  back to the newest message without tapping the button, the button remains
  visible until tapped.
- The button does not appear when the user is already at the bottom and a new
  message arrives (the anti-yank condition is not triggered, so there is nothing
  to surface).
- The button is reachable in keyboard tab order with an accessible name
  conveying the count.
- The button does not occlude the composer input or prevent sending a reply.
- The existing `role="log"` / `aria-live="polite"` behavior (A11Y-018) continues
  to fire on every incoming message regardless of button visibility.

## Why it matters

Without a visible affordance, users reading older history have no in-app signal
that the conversation has advanced — they must periodically scroll to the bottom
to check. On mobile, where scrollbars are absent and the visual viewport hides
scroll position, the lack of signal is especially acute. A persistent
count-bearing button collapses the "did anything happen?" question into a single
glance and a single tap.

## Discovery notes

- Visibility condition composes two states: (a) `wasNearBottomRef` is false
  (user scrolled beyond the 32px threshold at
  `src/components/ChatTranscript.tsx:96-108`) AND (b) at least one new message
  arrived since `wasNearBottomRef` became false.
- Count resets on button activation. If the user is scrolled back, taps, then
  scrolls back up again, the count restarts from the next arrival.
- Edge case under the chosen dismissal policy: if the user manually scrolls all
  the way to the newest message without tapping the button, the button lingers
  despite the newest message being on screen. `/work-start` may want to revisit
  this once the affordance can be felt; the literal scope is "only tap
  dismisses."
- The button must render as a sibling of the transcript scroll container (not
  inside the `<ol>`) so it stays pinned visually inside the transcript region
  without scrolling with message content. `ChatCopyToolbar` sits in the same
  surface layer at the top — analogous structural slot at the bottom.
- The visualViewport-pinned composer (IMPRV-020) means the button's bottom
  anchor must respect `--vvh` and sit above the composer's top edge, so the iOS
  keyboard does not slide it under the keyboard.

## Recommendation

- Render the button as a sibling of the transcript scroll container (not a child
  of the `<ol>`), absolutely positioned at the bottom of the transcript area
  just above the composer, horizontally centered. Pinned visually inside the
  transcript, but outside the scroll content.
- Track a `newMessagesSinceScrollAway` counter in `ChatTranscript` state:
  increment when a new message arrives while `!wasNearBottomRef.current`; reset
  to 0 on button activation.
- Visibility = `count > 0`. Per the chosen dismissal policy, do NOT also gate on
  `wasNearBottomRef.current` — that would auto-hide on manual scroll-to-bottom,
  which the user explicitly opted out of.
- Use a real `<button type="button">` with visible text "N new message(s)"
  (singular/plural). Reuse the existing focus-visible ring treatment for
  consistency.
- Verify in the design-system mock chat route (per IMPRV-019): scrolled-back +
  new arrival, tap to dismiss + scrolls to newest, manual scroll without tap
  (button persists), repeat arrivals while scrolled back (count increments and
  pluralizes).

## Related work

- IMPRV-028 — bottom-anchored transcript (this ticket assumes that anchoring)
- IMPRV-005 — chat auto-scroll yanks scrollback (the anti-yank condition under
  which this button surfaces)
- IMPRV-020 — connected chat container fills vvh, pins composer bottom (informs
  button's bottom anchor on mobile)
- A11Y-018 — chat transcript `aria-live` on `<ol>` instead of `role="log"`
  (continues to handle SR announcements; button is a visual affordance, not a
  replacement)
- A11Y-021 — chat transcript not keyboard focusable (button joins the same tab
  flow)
