---
id: BUG-009
type: bug
status: resolved
created: 2026-05-27
---

# BUG-009: jsdom scrollTo stderr noise in mobile-responsive test

## Problem

Running `npm test` emits two `Not implemented: Window's scrollTo() method` lines
to stderr. They originate from `src/mobile-responsive.test.tsx:152` ("the
connected branches of Offerer and Joiner mount `useVisualViewportHeight`
(IMPRV-017)"), which installs a fake `window.visualViewport` to drive the hook
but does not stub `window.scrollTo`. The hook calls `window.scrollTo(0, 0)` on
every `apply()` (the iOS pan-cancellation side effect,
`src/hooks/useVisualViewportHeight.ts:36`). jsdom does not implement `scrollTo`,
so each mount writes one "Not implemented" line directly to stderr. Two lines =
Offerer mount + Joiner mount in the same test.

The BUG-007 `console.error` guard does not catch this because jsdom routes the
warning through `virtualConsole.emit('jsdomError', …)`, which writes to
`process.stderr` directly rather than through `console.error`.

## Outcome

`npm test` produces zero "Not implemented: Window's scrollTo()" lines on stderr.

## Why it matters

Two stderr lines per test run is exactly the ambient-noise pattern the
2026-05-25 retro flagged as a "less of" — noise floors drift, and the cost is
small per occurrence but accumulates. The pattern for handling this is already
in-tree at `useVisualViewportHeight.test.ts:27-34`; the IMPRV-017 test in
`mobile-responsive.test.tsx` was added later and missed the stub.

## Discovery notes

- The hook calls `window.scrollTo(0, 0)` synchronously inside `apply()` at
  `useVisualViewportHeight.ts:36`.
- The hook's own test file (`src/hooks/useVisualViewportHeight.test.ts:27-34`)
  replaces `window.scrollTo` with a `vi.fn()` spy in `beforeEach` and restores
  the original in `afterEach`. That stub keeps the suite clean.
- The IMPRV-017 mount-side-effect test in `mobile-responsive.test.tsx:152`
  installs `window.visualViewport` but does not stub `window.scrollTo`. The hook
  fires `apply()` once per mount; the test mounts Offerer then Joiner, so two
  stderr lines.
- jsdom's `virtualConsole` routes "Not implemented" warnings to `process.stderr`
  directly, bypassing the BUG-007 `console.error` guard. Fixing at the call site
  is cheaper than reconfiguring the virtualConsole.
- No other production callsite of `window.scrollTo` exists in `src/` (grep
  confirmed).

## Recommendation

Adopt the `useVisualViewportHeight.test.ts` pattern in the IMPRV-017 test inside
`mobile-responsive.test.tsx`: save the original `window.scrollTo`, replace it
with `vi.fn()` for the duration of the test, restore in `finally` alongside the
`visualViewport` restoration that already exists there.

## Related work

- IMPRV-017 — introduced the hook and its scrollTo side effect.
- BUG-007 — established the `console.error` test-noise guard (which doesn't
  reach jsdom's virtualConsole, hence this leak).
- RFCTR-002 — rewrote the IMPRV-017 file-content test as a behavior test, which
  is when the missing `scrollTo` stub appeared (the prior file-content version
  never mounted the component, so the hook never fired).

## Working

- Confirmed two stderr lines reproducible via
  `npm test --silent 2>&1 | grep -i "not implemented\|scrollTo"`.
- Confirmed BUG-007's `console.error` guard doesn't catch jsdom's virtualConsole
  emissions, which is why the noise leaks instead of failing the suite.
- Fix: save `window.scrollTo`, replace with no-op for the test duration, restore
  in `finally` alongside the existing `visualViewport` restoration. Mirrors the
  stub pattern already in `useVisualViewportHeight.test.ts:27-34`.
- After the fix: `npm test --silent 2>&1 | grep -i "not implemented"` returns
  zero matches. Suite green, 449 tests.
