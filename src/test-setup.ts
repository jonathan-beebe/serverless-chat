import '@testing-library/jest-dom/vitest'
// FEAT-012: in-memory IndexedDB so `src/core/storage.ts` round-trips in
// jsdom. `fake-indexeddb/auto` installs polyfills on the global scope at
// import time; the storage module's `typeof indexedDB === 'undefined'`
// guard then short-circuits to "available" in tests.
import 'fake-indexeddb/auto'

// CR-014: with `test.isolate: false`, the JS env (and module graph) is
// reused across test files in a worker, so `@testing-library/react`'s
// import-time `afterEach(cleanup)` only registers against the first file
// that imports it. From the second file onward, rendered DOM accumulates
// between tests and `screen.getByRole(...)` trips "multiple elements
// found". Re-registering cleanup here — which Vitest re-executes per
// test file even with isolation off — restores the per-test DOM reset.
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach } from 'vitest'

afterEach(() => {
  cleanup()
})

// BUG-007: keep the suite's stderr clean and catch future React `act(...)`
// regressions (and unhandled promise warnings, deprecations, etc.) at the
// source by failing any test that emits a `console.error`. Production code
// in this repo doesn't legitimately call console.error, so the only signal
// here is real noise. Tests that *want* to assert on console.error can opt
// out via `vi.spyOn(console, 'error').mockImplementation(...)` — that
// replaces the wrapper for the duration of the spy. The wrapper logs the
// original message first so the stderr block still shows up in CI output
// alongside the failure.
const originalConsoleError = console.error
beforeEach(() => {
  console.error = (...args: unknown[]) => {
    originalConsoleError(...args)
    throw new Error(
      `console.error called during test: ${args
        .map((a) => (a instanceof Error ? a.message : typeof a === 'string' ? a : JSON.stringify(a)))
        .join(' ')}`,
    )
  }
})
afterEach(() => {
  console.error = originalConsoleError
})
