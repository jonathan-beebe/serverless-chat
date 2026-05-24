# IMPRV-013: Run pure-utility tests under `src/core/**` in the `node` environment

**Status:** Resolved **Severity:** Low (developer-experience / tooling)
**Location:** `vitest.config.ts`, test files under `src/core/**/*.test.ts`

## Problem

Every test file currently runs under jsdom — set globally by `vitest.config.ts`:

```ts
test: {
  environment: 'jsdom',
  globals: true,
  setupFiles: ['./src/test-setup.ts'],
}
```

Most files under `src/core/**` are pure-utility tests with no DOM dependency at
all (`storage.test.ts`, `transcript.test.ts`, `wire.test.ts`,
`clipboard.test.ts`, `url.test.ts`, `rtc.test.ts`, `encoding.test.ts` — ~8
files). They still pay the cost of standing up a jsdom environment because
that's the project default.

Measured on the current `main`:

- `time npm test` — ~15.2s wall-clock for 343 tests across 26 files
- Vitest's own breakdown:
  `environment 72.86s (cumulative across workers), setup 9.11s, import 5.59s, tests 5.82s`

So actual test work is **~5.8s**; the rest is per-file environment + setup
overhead replayed 26 times.

## Intended behavior

Tests in `src/core/**` run in the `node` environment; component / DOM tests
(`*.test.tsx`, `src/components/**`, `src/screens/**`, top-level UI tests like
`src/mobile-responsive.test.tsx` and `src/typography.test.tsx`) continue to use
jsdom. Behavior of any individual test is unchanged.

## Suggested fix

Use Vitest's `environmentMatchGlobs` to declare which paths get which env.
Tried-and-true pattern — the global default stays jsdom so any new file picks
the safe option, and the override carves out the node-only paths:

```ts
test: {
  environment: 'jsdom',
  environmentMatchGlobs: [
    ['src/core/**/*.test.ts', 'node'],
  ],
  globals: true,
  setupFiles: ['./src/test-setup.ts'],
}
```

Caveat: `setupFiles` runs in every environment. `src/test-setup.ts` currently
does two things:

1. `import '@testing-library/jest-dom/vitest'` — harmless under node (extends
   `expect` matchers, doesn't touch DOM).
2. `import 'fake-indexeddb/auto'` — installs `indexedDB` on the global scope.
   This is precisely what `storage.test.ts` needs, and node-environment is where
   it'll matter most (jsdom doesn't ship indexedDB either, so behavior is
   identical).

So no setup changes should be required. Validate by running `npm test` and
confirming all 343 tests still pass.

Alternative (less preferred): per-file `// @vitest-environment node` pragmas at
the top of each core test file. More invasive (touches 8 files), but more
explicit per-file. Use only if `environmentMatchGlobs` causes surprise behavior.

## Acceptance criteria

- All 343 tests still pass.
- `time npm test` is meaningfully faster (target: ≥1.5s wall-clock reduction;
  record the actual delta in working notes when closing).
- No new test files need annotation — the glob picks them up automatically.
- `vitest.config.ts` is the only source file changed (no behavioral changes to
  product code).

## Working notes

- Related tickets in this batch: `isolate: false` (worker reuse) and jsdom →
  happy-dom. Those are independent levers — this ticket should land first
  because it has zero behavior risk.
- If a `src/core/**` test later turns out to need the DOM (unlikely — that's the
  whole point of `src/core`), it can opt back into jsdom with
  `// @vitest-environment jsdom` at the top of the file.

### Resolution (2026-05-24)

**Deviation from suggested fix:** the ticket recommended
`environmentMatchGlobs`, but that option was **removed in Vitest 3** (we're on
`vitest@^4.1.7`). It is silently ignored — confirmed by experiment: applying it
changed cumulative environment time by 0s. The supported replacement in Vitest 4
is the inline `projects` API. Used two projects, both `extends: true`, sharing
`setupFiles`/`globals` from the root config:

- `core` — `environment: 'node'`, `include: ['src/core/**/*.test.ts']`
- `dom` — `environment: 'jsdom'`, `include: ['src/**/*.test.{ts,tsx}']`,
  `exclude: ['src/core/**/*.test.ts']`

**Two files needed the jsdom opt-back-in pragma** (one more than the ticket
anticipated):

- `src/core/clipboard.test.ts` — exercises `document.execCommand` /
  `navigator.clipboard` (already noted by the ticket as DOM-touching).
- `src/core/url.test.ts` — the `currentOfferUrl` suite calls a thin wrapper that
  reads global `location.origin`. Surfaced as
  `ReferenceError: location is not defined` under node. Added the same
  `// @vitest-environment jsdom` pragma.

**Wall-clock delta** (`time npm test`, same machine, two runs each):

- Baseline (jsdom everywhere): 14.55s, 14.54s → ~14.54s
- After: 12.50s, 12.15s → ~12.33s
- **Delta: ~2.2s wall-clock reduction** (~15% faster). Acceptance criterion was
  ≥1.5s; comfortably met.
- Per-project breakdown via verbose reporter: `|core|` 91 tests, `|dom|` 252
  tests = 343 total (matches baseline).
- Internal Vitest stats: cumulative `environment` time dropped from ~67–68s
  (jsdom on all 26 files) to ~53s (node on 7 files, jsdom on 19+2).

**Acceptance criteria status:** all met. 343/343 still pass; wall-clock target
hit; new files matching `src/core/**/*.test.ts` are picked up by the glob
automatically; only `vitest.config.ts` plus the two pragma additions to core
test files were touched — no product code changed.
