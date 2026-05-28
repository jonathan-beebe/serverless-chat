---
id: A11Y-037
type: a11y
status: resolved
created: 2026-05-28
---

# A11Y-037: pending delivery glyph contrast on outgoing bubbles fails 1.4.11

## Problem

In `src/components/ChatTranscript.tsx:467-479`, outgoing message bubbles render
a delivery-state glyph (`✓`) whose Pending state uses `text-sky-100/60` over
`bg-sky-700` and whose Delivered state uses `text-white` over the same
background. The Pending tint is sky-100 (~#e0f2fe) at 60% alpha against sky-700
(~#0369a1). The resulting contrast between the two states (Pending vs Delivered)
is well under 3:1, and the Pending glyph's contrast against the bubble
background is roughly 1.3-1.5:1. The glyph is the sole sighted-user indicator
that a message has not yet been acknowledged by the peer.

## Outcome

The Pending and Delivered states of the outgoing-message delivery indicator are
visually distinguishable to sighted users at all viewports and in both color
schemes, with each state's glyph clearing WCAG 1.4.11 (Non-text Contrast, 3:1)
against the bubble background.

## Why it matters

WCAG 1.4.11 requires 3:1 contrast for graphical elements that carry information.
Delivery state is semantically meaningful (the user needs to know whether their
message reached the peer); the AT path is covered via
`aria-label="Pending" | "Delivered"`, but low-vision sighted users (incl. anyone
in bright sunlight or with a contrast-reducing display profile) currently cannot
tell the two states apart by sight. They wait for an acknowledgement they think
they're not getting, or assume delivery succeeded when it hasn't.

## Discovery notes

The hollow-then-filled metaphor was chosen so the bubble doesn't reflow when the
receipt lands — both glyphs are `✓`, only the fill changes. That constraint can
stay; the fix is on the color tokens, not the glyph choice. The Delivered tone
(white on sky-700) is itself ~4.88:1 — passing for text but only marginal for a
graphic; consider whether the Delivered tone should also be reinforced (e.g.
doubled glyph, weight change, or a different filled mark) so the "delivered"
signal is robust independent of contrast.

## Recommendation

Replace `text-sky-100/60` with a tone that clears 3:1 against `bg-sky-700` (e.g.
`text-sky-200` at full alpha measures ~3.2:1, or move to a different glyph for
Pending — a hollow circle / outlined check — so the differentiator isn't just
opacity). Verify both light- and dark-mode paint (the bubble color is
unconditional `bg-sky-700`, so the glyph treatment can be a single token).
Re-run the A11Y-014/A11Y-015 contrast spot-checks against the new tokens.

## Related work

- A11Y-014 (primary brand sky-600 fails contrast)
- A11Y-015 (chat timestamp size and contrast)
- FEAT-010 (delivery indicator introduction)

## Working

- `ChatTranscript.tsx:476` carried `text-sky-100/60` for the Pending state — a
  pale tint at 60% alpha against `bg-sky-700`, well below the 3:1 floor.
- Replaced with `text-sky-200` at full alpha. Measured `#bae6fd` (L≈0.742) over
  `#0369a1` (L≈0.126) gives 4.5:1, clearing WCAG 1.4.11.
- Delivered glyph stays `text-white` (≈9:1 vs `bg-sky-700`). Same `✓` glyph
  either way preserves the no-reflow constraint when the receipt lands.
- No new test added — per the type guidance, asserting Tailwind class names on a
  single glyph is brittle and offers no regression coverage that the existing
  aria-label tests don't already give. Existing FEAT-010 tests pass unchanged.
- Full suite: 504/504 green.
