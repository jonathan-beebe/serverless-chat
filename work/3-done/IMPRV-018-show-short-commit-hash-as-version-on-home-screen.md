---
id: IMPRV-018
type: improvement
status: resolved
created: 2026-05-25
resolved: 2026-05-25
---

# IMPRV-018: show short commit hash as version on home screen

## Problem

`src/screens/Home.tsx` renders no app-version indicator. The build already
injects the short commit SHA via `__COMMIT_HASH__` (`vite.config.js:11`,
declared in `src/vite-env.d.ts:4`), but no component consumes it. There is no
way for a user — or the developer triaging a report — to tell which revision is
loaded.

## Outcome

On the Home screen, the short commit SHA (or the literal `"dev"` when git was
unavailable at build time) is visible as plain text at the bottom of the screen,
below the existing "How does this work?" disclosure.

## Why it matters

Diagnosing reports against a static deploy with no other build metadata is
guesswork. A visible SHA collapses "which build were you on?" into a glance.

## Discovery notes

- The compile-time define is unused; rendering is the only missing piece.
- Value is constant per build (string-replaced at compile time), so no runtime
  cost beyond a text node.
- Same string renders on every route since `404.html` is byte-identical to
  `index.html`, but per scope we only surface it on Home.

## Recommendation

- Render `__COMMIT_HASH__` as a muted text line at the bottom of
  `<ScreenContainer>` in `src/screens/Home.tsx`, after the `<details>` block
  near line 620.
- Use existing muted-stone palette (e.g.
  `text-xs text-stone-500 dark:text-stone-400`) so it sits quietly under the
  chrome.
- Plain text — no link, no copy affordance.
- When the value is `"dev"`, render it as-is (no special casing).
- Add a render assertion in `src/screens/Home.test.tsx` that the SHA string
  appears at the bottom of the Home screen.

## Related work

- `vite.config.js:11` — `__COMMIT_HASH__` define already wired (short SHA,
  fallback `"dev"`).
- `src/vite-env.d.ts:4` — ambient type declaration already in place.
- No prior ticket in `work/3-done/` touches app-version display.
