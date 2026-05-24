# IMPRV-015: Switch DOM test environment from jsdom to happy-dom

**Status:** Resolved (reverted — see working notes) **Severity:** Low
(developer-experience / tooling) **Location:** `vitest.config.ts`,
`package.json` (devDependencies)

## Problem

Vitest's `environment: 'jsdom'` is the biggest single overhead source in the
test run. Current numbers on `main`:

| Phase                | Cumulative across workers |
| -------------------- | ------------------------- |
| environment (jsdom)  | **72.86s**                |
| setup                | 9.11s                     |
| import               | 5.59s                     |
| tests (actual work)  | 5.82s                     |
| **Total wall-clock** | **~15.2s**                |

`happy-dom` is a from-scratch implementation of browser APIs designed for speed;
it's typically 2-3× faster than jsdom on equivalent workloads. Cutting the
environment-setup line item by half would meaningfully shrink the run,
particularly for `*.test.tsx` files that have to stand up the DOM.

## Intended behavior

All 343 tests still pass. `npm test` is faster (target: noticeable wall-clock
drop on top of whichever baseline this lands against). Developer experience is
otherwise identical.

## Suggested fix

1. `npm uninstall jsdom && npm install -D happy-dom`
2. `vitest.config.ts`:

```ts
test: {
  environment: 'happy-dom',
  // ...other config unchanged...
}
```

If IMPRV-013 ships first, the `environmentMatchGlobs` override stays intact —
only the default jsdom is replaced. (`src/core/**` still runs in `node` and is
unaffected.)

## Risk areas to verify

happy-dom has known gaps vs jsdom. Real surfaces in this codebase that touch the
rough edges:

- `.focus()` calls in DOM tests — `src/components/Chat.test.tsx:107,150,623`,
  `src/design-system/DesignSystem.test.tsx:374`, and `src/screens/Home.tsx:124`.
  happy-dom supports `.focus()` but `document.activeElement` tracking has
  historically had edge cases.
- `getComputedStyle` / CSS layout — happy-dom doesn't run a real layout engine;
  tests that assert on computed styles or measured dimensions can break.
- Portals / focus traps — none in this repo today, but worth keeping in mind for
  future tests.
- `Range` and selection APIs — partial coverage in happy-dom; this repo doesn't
  appear to use them.

## Acceptance criteria

- `npm test` passes — all 343 tests green.
- `time npm test` is faster than the baseline this ticket lands against (record
  the delta when closing).
- If a test fails purely because of a happy-dom semantic gap, prefer adjusting
  the test (or filing a finding) over reverting. If a real product bug surfaces
  because happy-dom is stricter, that's a win — file a follow-up bug.
- If multiple genuine compat issues surface, revert and document the gaps in
  working notes for a future attempt.

## Working notes

- Independent of IMPRV-013 and IMPRV-014 — orthogonal lever. Can land before or
  after either. To keep speedup numbers honest, measure before/after against the
  same baseline.
- `package-lock.json` will change. That's expected; commit it.
- If we ever need to opt one stubborn test file back into jsdom, the per-file
  `// @vitest-environment jsdom` pragma is the escape hatch (and `jsdom` would
  have to be re-added as a dep). Strong preference: fix the test, don't split.

### Attempt 1 — 2026-05-24 — REVERTED

**Baseline (post-IMPRV-014, jsdom):** 3-run avg `npm test` wall-clock ≈ 6.61s
(6.62 / 6.76 / 6.45). `environment` line ≈ 54–56s cumulative across workers.

**Change:** `npm uninstall jsdom && npm install -D happy-dom@^20.9.0`. Flipped
the `dom` project's `environment: 'jsdom'` → `'happy-dom'`. Updated the two
`// @vitest-environment jsdom` pragmas (`src/core/clipboard.test.ts`,
`src/core/url.test.ts`) to `happy-dom`.

**Result:** 6 failures across 4 files (337 / 343 pass). Speed-wise the run
finished in ~5.9s with the failures (`environment` ≈ 21s — roughly the 2-3× win
the ticket projected), so the lever is real. But the failures span four distinct
happy-dom compat gaps:

1. **`window.confirm` is `undefined` in happy-dom** — breaks
   `vi.spyOn(window, 'confirm')` in `src/screens/Home.test.tsx` (Delete
   confirm/cancel cases, 2 failures). Fix would be to assign a stub:
   `window.confirm = vi.fn().mockReturnValue(true)`.
2. **`textarea.rows` returns the string `'4'` instead of the number `4`** in
   happy-dom (`src/components/Textarea.test.tsx`, 1 failure). HTML spec says
   `.rows` is a number; happy-dom returns the attribute string. Fix: assert
   `toHaveAttribute('rows', '4')` instead of `el.rows`.
3. **`Node.compareDocumentPosition` returns `0`** for
   unrelated-but-actually-related nodes in happy-dom
   (`src/components/Chat.test.tsx` A11Y-021, 1 failure). Fix: walk the tree
   manually or use `Node.DOCUMENT_POSITION_*` flags differently — or rewrite the
   test to compare DOM indices.
4. **`history.replaceState()` fires an async `hashchange`** in happy-dom (via
   `setTimeout`-deferred dispatch in `happy-dom/lib/location/Location.js:260`).
   Real browsers per HTML spec do NOT fire hashchange for
   `pushState`/`replaceState`; jsdom matches that. The `App.tsx` BUG-007 flow
   relies on the spec behaviour: the route handler calls `clearHash()` (which is
   `replaceState` to strip the fragment) immediately after the joiner route
   mounts; in happy-dom that re-fires hashchange, the handler re-reads the
   now-empty hash, and the App routes back to `home` — so the Accept-click flow
   never reaches the reply CopyBox. This is **happy-dom diverging from the HTML
   spec**, not happy-dom being stricter; it would mask real production behaviour
   in tests. 2 failures in `src/App.test.tsx` (BUG-007 same-tab swap).

Per the ticket's escape valve ("If multiple genuine compat issues surface,
revert and document the gaps in working notes for a future attempt"), reverted
the swap. Items 1-3 are individually small test tweaks; item 4 is the real
blocker — it requires either a per-test stub of `history.replaceState`
(intrusive), a fork of the App routing to avoid `clearHash` (production change
for a test-env quirk, not justified), or a fixed happy-dom release.

**Status:** Lever is real (~6.6s → ~5.9s wall-clock with failures, environment
line down ~60%). Re-attempt when happy-dom either matches the spec on
history-API hashchange dispatch, or when a happy-dom test util ships to suppress
the async event. Until then: stay on jsdom.

**Reverted artefacts:** `package.json` (jsdom back, happy-dom removed),
`vitest.config.ts` (`dom.environment: 'jsdom'`), `src/core/clipboard.test.ts` +
`src/core/url.test.ts` pragmas back to `jsdom`. `package-lock.json`
re-reconciled via `npm install` after revert. 343/343 green again at baseline
timing (~6.4s).
