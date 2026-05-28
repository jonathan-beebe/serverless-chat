---
id: MAINT-001
type: maintenance
status: resolved
created: 2026-05-28
---

# MAINT-001: silence vite/lightning-css warnings from tailwind scanning env(...) shorthand in comments

## Problem

`vite build` emits two Lightning CSS warnings: `Unexpected token Delim('.')`
inside `env(...)` for `.mr-\[env\(\.\.\.\)\]` and `.ml-\[env\(\.\.\.\)\]`.
Tailwind v4's content scanner picks up the literal candidate strings
`ml-[env(...)]` and `mr-[env(...)]` from two source comments (`src/index.css:90`
and `src/components/ScreenChrome.tsx:56`) that document — for historical context
from BUG-010 / IMPRV-024 — the margin utilities that were removed. Tailwind
materializes them into real rules with `env(...)` as the value; Lightning CSS
chokes on the literal ellipsis. The generated rules are also dead weight in the
shipped CSS — nothing in the DOM uses those class names.

## Outcome

`npm run build` completes with no Lightning CSS warnings; the generated
`dist/assets/index-*.css` contains no `.ml-\[env\(...\)\]` or
`.mr-\[env\(...\)\]` rules; the BUG-010 / IMPRV-024 rationale remains
discoverable in the source.

## Why it matters

Build noise erodes trust in CI signal — real warnings hide among ignored ones.
The dead utilities also add a small amount of bloat to the production CSS
bundle.

## Discovery notes

Tailwind v4's candidate scanner is content-aware but not syntax-aware — it does
not exclude comment text. The match is whole-token: `mt-/ml-/mr-[env(...)]` in
`index.css:90` matches only the final `mr-[env(...)]` segment, which is why the
warning shows two cases (one each from `ScreenChrome.tsx:56`'s separately
backticked `ml-` and `mr-` mentions, plus the `mr-` from `index.css:90`
collapsing into the same generated rule).

## Recommendation

Reword the two comments so they no longer contain a contiguous
`m{l,r,t}-[env(...)]` token the scanner can extract. Options: (a) replace the
ellipsis with prose — e.g. `mt-/ml-/mr-[env(safe-area-inset-*)] utilities` is
still a candidate, so prefer
`safe-area-inset margin utilities (mt-, ml-, mr-) referencing env()` which
breaks the bracket form; (b) break the bracket pair with whitespace inside the
class name reference (`m{l,r}-[ env(...) ]`); (c) drop the literal class form
entirely and describe the construct in prose. Verify by rebuilding and grepping
`dist/assets/index-*.css` for `ml-\[env` / `mr-\[env`.

## Related work

- [BUG-010](../3-done/BUG-010-restore-wide-screen-centering-broken-by-imprv-024.md)
- [IMPRV-024](../3-done/IMPRV-024-respect-ios-safe-area-insets-in-standalone-mode.md)

## Working

- Root cause was broader than the ticket described: the literal
  `mr-[env(safe-area-inset-right)]` and `ml-[env(...)]` candidates were scanned
  out of `work/3-done/BUG-010-...md` and `work/3-done/IMPRV-024-...md` as well
  as the two source comments. Tailwind v4's content scanner reads markdown by
  default; archived tickets that quote utility names verbatim hit the same
  warning every time a similar shorthand is mentioned in future tickets.
- Took a structural fix instead of just rephrasing comments: added
  `@source not "../work"` to `src/index.css` so Tailwind no longer scans the
  ticket archive at all. work/ is documentation; nothing under it ships, so the
  exclusion is safe and prevents this class of bug from recurring.
- Also reworded the two source comments (`src/index.css:90` and
  `src/components/ScreenChrome.tsx:56`) plus the test comment at
  `src/components/ScreenChrome.test.tsx:15` so the literal tokens are gone from
  source too — defense in depth even if someone removes the `@source not`
  directive later.
- Verification: `npm run build` is now warning-free; `grep ml-\[env` against
  `dist/assets/index-*.css` is empty.
- Full suite: 545/545 green.
