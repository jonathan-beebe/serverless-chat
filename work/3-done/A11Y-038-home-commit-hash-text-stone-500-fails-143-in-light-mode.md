---
id: A11Y-038
type: a11y
status: resolved
created: 2026-05-28
---

# A11Y-038: home commit hash text-stone-500 fails 1.4.3 in light mode

## Problem

In `src/screens/Home.tsx:124`, the commit-hash footer renders the build
identifier (`__COMMIT_HASH__`) at `text-xs` with
`text-stone-500 dark:text-stone-400` on the page background (`stone-50` light /
`stone-900` dark). In light mode, `stone-500` (#78716c) on `stone-50` (#fafaf9)
measures ~4.38:1 — below WCAG 1.4.3's 4.5:1 threshold for normal text. Dark mode
(`stone-400` on `stone-900`) measures ~7.18:1 and passes.

## Outcome

The commit-hash footer text in Home meets WCAG 1.4.3 (Contrast Minimum) in both
light and dark themes, while preserving its "quiet status surface" visual weight
(it should still read as secondary, not body).

## Why it matters

The commit hash is an explicit triage anchor (IMPRV-018 comment: "no link, no
copy affordance — so it sits quietly as a triage anchor"). Users who need to
read it off to diagnose a bug must actually be able to read it; ~4.38:1 contrast
at 12px fails the population that 1.4.3 is calibrated for (low-vision, older
readers, low-quality displays). The dark-mode path is fine — only the light-mode
token needs to move.

## Discovery notes

`stone-600` on `stone-50` measures ~7.78:1 and still reads as "secondary"
relative to body text (`stone-900`), preserving the muted treatment. Verify the
dark-mode token still clears 4.5:1 if both modes are re-tokenized for
consistency; the existing `stone-400` on `stone-900` is fine.

## Recommendation

Bump the light-mode token from `text-stone-500` to `text-stone-600` (~7.78:1).
Leave `dark:text-stone-400` alone. No layout or font-size change — the fix is
one token.

## Related work

- A11Y-010 (chat empty-state contrast)
- A11Y-011 (chat input placeholder contrast)
- A11Y-014 (primary brand contrast)
- IMPRV-018 (commit hash surface introduction)

## Working

- `Home.tsx:124` carried `text-stone-500` for the commit-hash footer — ~4.38:1
  on `stone-50` in light mode, just under WCAG 1.4.3's 4.5:1 floor.
- Bumped to `text-stone-600` (~7.78:1) per the ticket recommendation. Dark token
  `dark:text-stone-400` left alone (~7.18:1 on `stone-900`, already passing).
- Still reads as secondary relative to body `text-stone-700`; "quiet status
  surface" weight preserved.
- No new test — token swap with no behavior change. Existing Home suite passes
  unchanged.
- Full suite: 504/504 green.
