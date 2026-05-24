# IMPRV-014: Enable `test.isolate: false` to reuse the test env across files

**Status:** Resolved **Severity:** Low (developer-experience / tooling)
**Location:** `vitest.config.ts`

## Problem

Vitest's default is `isolate: true`: between test files in the same worker, it
tears down the JS environment and re-runs `setupFiles` + module imports. With 26
test files and ~5 workers, that means jsdom (or whatever env),
`@testing-library/jest-dom/vitest`, and `fake-indexeddb/auto` are re-initialised
on the order of 26 times.

Current breakdown (`time npm test` on `main`, ~15.2s wall):

| Phase                   | Cumulative across workers |
| ----------------------- | ------------------------- |
| environment (jsdom)     | 72.86s                    |
| setup                   | 9.11s                     |
| import                  | 5.59s                     |
| **tests (actual work)** | **5.82s**                 |

So roughly two-thirds of cumulative time is overhead replayed per file.
`isolate: false` is the standard knob for cutting that.

Note: this ticket assumes IMPRV-013 (env split for `src/core/**` → `node`) has
already landed. The baseline numbers above will be smaller once that ships; this
ticket should be measured against the post-IMPRV-013 baseline.

## Intended behavior

Tests still pass and still behave identically — but a worker that runs files A,
B, C in sequence only sets up its environment once, not three times. End-to-end
`time npm test` drops further. No source-file behavior changes.

## Suggested fix

```ts
// vitest.config.ts
test: {
  // ...existing config...
  isolate: false,
}
```

That's the entire diff. The risk is cross-file state leakage. Audit what
`src/test-setup.ts` and the test files do that could leak:

1. **`@testing-library/jest-dom/vitest`** — extends `expect` with custom
   matchers. Idempotent: re-importing in a non-isolated env is a no-op.
2. **`fake-indexeddb/auto`** — installs `indexedDB`, `IDBKeyRange`, etc. on the
   global scope at import time. Re-importing in the same worker is a no-op (ES
   module caching). The interesting question is whether IDB _state_ leaks
   between files in the same worker.
   - Checked: `src/core/storage.test.ts:19-24` already does
     `globalThis.indexedDB = new IDBFactory()` in `beforeEach` and calls
     `__resetForTests()`. That replaces the factory entirely on every test, so
     any state from a prior file is wiped before the first `beforeEach` of the
     next file.
   - The other core tests don't touch IDB.
3. **Module-level mutable state in product code** — e.g. caches, singletons.
   Spot-check `src/core/storage.ts` (`__resetForTests` exists, good),
   `src/core/wire.ts`, `src/core/rtc.ts` for any module-level `let` that could
   carry across files.
4. **jsdom global pollution** — DOM tests render into `document.body`.
   Testing-library typically auto-cleans, but with `isolate: false` we depend on
   that working reliably. If we see flaky "element already present" failures,
   that's the smoking gun.

## Acceptance criteria

- All tests pass on the first run after the change.
- `npm test` run 5x in a row passes every time (catches order-dependent
  flakiness that non-isolation would surface).
- `time npm test` shows a meaningful additional speedup vs the post-IMPRV-013
  baseline (record the delta when closing).
- If any pre-existing test relies on isolation to mask a real bug, treat that as
  a finding worth surfacing — file a follow-up ticket rather than reverting this
  one.

## Working notes

- Land **after** IMPRV-013 so the speedup is measured cleanly on top of the env
  split, and so any flakiness can be attributed to non-isolation rather than the
  env change.
- If a specific file truly needs isolation, opt back in per-file with
  `// @vitest-isolation true` (or move that file into a separate project with
  its own config). Prefer fixing the leak.
- Related: IMPRV-015 (jsdom → happy-dom). That's an independent lever and can
  land in either order relative to this one, but if both are enabled the
  cumulative speedup should be measured against the same starting point to keep
  the numbers honest.

### Resolution (2026-05-24)

**Change applied:** added `isolate: false` at the root of `test:` in
`vitest.config.ts` (Vitest 4 inline `projects` inherit it via `extends: true`,
so it propagates to both the `core` and `dom` projects without per-project
duplication).

**One unanticipated side effect required a setup change.** With
`isolate: false`, `@testing-library/react`'s import-time `afterEach(cleanup)`
only registers against the _first_ test file that imports it in a worker — every
subsequent file in the same worker accumulated rendered DOM between tests,
tripping `getByRole(...)` with "multiple elements found" (21/343 failures, all
in the `dom` project: `App.test.tsx`, `Chat.test.tsx`, `CopyBox.test.tsx`,
`Offerer.test.tsx`, `Joiner.test.tsx`).

Vitest re-executes `setupFiles` per test file even with isolation off, so the
supported fix is to register cleanup there. Added to `src/test-setup.ts`:

```ts
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(() => {
  cleanup()
})
```

This also runs in the `core` (node) project, which is harmless: `cleanup`
inspects `document.body`, which jsdom supplies for `dom` and which simply isn't
touched (no `render()` calls) under node — the function is a no-op there.

**Wall-clock delta** (`time npm test`, same machine):

- Post-IMPRV-013 baseline (two runs): 12.03s, 12.11s → ~12.07s.
- After IMPRV-014 (five consecutive runs): 6.62s, 6.32s, 6.32s, 6.52s, 6.53s →
  ~6.46s avg.
- **Delta: ~5.6s wall-clock reduction (~46% faster)**. Vitest's own Duration
  drops from ~11.65s to ~6.10s; cumulative `environment` time is unchanged (~53s
  — same number of workers × jsdom inits) but `setup`, `import`, and the
  per-file teardown overhead vanish from the wall-clock critical path because
  they no longer block worker reuse.

**Acceptance criteria status:**

- All 343 tests pass on the first run after the change.
- 5/5 consecutive `npm test` runs pass (343/343 every time). No order-dependent
  flakiness or hidden leaks surfaced.
- Wall-clock target ("meaningful additional speedup") comfortably met.
- No follow-up ticket needed: the only fragility uncovered was RTL's cleanup
  registration pattern, which the setupFile hook addresses directly rather than
  masking a product bug.
