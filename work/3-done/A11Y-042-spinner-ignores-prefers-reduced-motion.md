---
id: A11Y-042
type: a11y
status: open
created: 2026-05-28
---

# A11Y-042: spinner ignores prefers-reduced-motion

## Problem

In `src/components/Spinner.tsx:14`, the SVG spinner applies the Tailwind class
`animate-spin` unconditionally. The class translates to a continuous 1s rotation
animation with no `motion-reduce:` variant. The spinner is rendered alongside
the "Preparing your invite / reply (gathering network candidates)…" callouts in
`Joiner.tsx` and `Offerer.tsx`, where ICE gathering on a poor network can run
for several seconds — well past the WCAG 2.2.2 5-second threshold for moving
content.

## Outcome

Users who set `prefers-reduced-motion: reduce` see a non-animated spinner (a
static glyph or no glyph) wherever the Spinner component is rendered, on every
viewport and in both color schemes.

## Why it matters

WCAG 2.3.3 (AAA, Animation from Interactions) and the spirit of 2.2.2 (Level A,
Pause/Stop/Hide) both call for respecting reduced-motion preferences. Users with
vestibular disorders, photosensitive epilepsy, or migraine triggers actively opt
into `prefers-reduced-motion`; ignoring it removes the only system-wide control
they have. The live region from A11Y-012 already carries the AT-side
announcement ("Preparing your invite") so the spinner is purely a sighted-user
motion cue — turning it off for opted-in users costs nothing.

## Discovery notes

Tailwind's `motion-reduce:` variant is the canonical fix and composes with
`animate-spin` directly. The component is rendered as a static-positioned inline
SVG; replacing the spin with no motion (or with a subtle pulse via
`motion-reduce:animate-pulse` if a still glyph reads as broken) is a one-class
change. Verify the same treatment for any other `animate-*` usage in the design
system (a project grep is worth running while in the area).

## Recommendation

Add `motion-reduce:animate-none` to the existing className composition in
`Spinner.tsx`. If a still glyph reads as "stuck" rather than "thinking,"
consider `motion-reduce:animate-pulse` instead — it still respects
reduced-motion (pulse is a tiny opacity transition, not a rotation) while
signalling activity. The hard requirement is "no rotation under reduced-motion";
the visual replacement is a polish call.

## Related work

- A11Y-012 (connection state not announced — established the AT path the spinner
  is decorating)
