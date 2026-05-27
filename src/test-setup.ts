import '@testing-library/jest-dom/vitest'
// FEAT-012: in-memory IndexedDB so `src/core/storage.ts` round-trips in
// jsdom. `fake-indexeddb/auto` installs polyfills on the global scope at
// import time; the storage module's `typeof indexedDB === 'undefined'`
// guard then short-circuits to "available" in tests.
import 'fake-indexeddb/auto'

// IMPRV-030: jsdom doesn't implement IntersectionObserver, but ChatTranscript
// (and anything that renders Chat) now constructs one on mount. Install a
// no-op global polyfill so components don't crash on `new IntersectionObserver`.
// Tests that need to drive intersection entries (ChatTranscript.test.tsx) install
// a richer per-file mock via `vi.stubGlobal` which transparently overrides this.
if (typeof globalThis.IntersectionObserver === 'undefined') {
  class NoopIntersectionObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords(): IntersectionObserverEntry[] {
      return []
    }
  }
  ;(globalThis as { IntersectionObserver: unknown }).IntersectionObserver = NoopIntersectionObserver
}

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

// Buffer non-error console output per-test and only flush to the real
// console when the test fails. Production logs like `[telemetry] receipt
// for unknown message id ...` and `[storage] culled empty conversation
// ...` are useful when debugging a failure but pure noise on a green run.
// `console.error` is intentionally excluded — it's already a test failure
// above, and we want its message on stderr immediately.
const QUIET_METHODS = ['log', 'info', 'warn', 'debug'] as const
type QuietMethod = (typeof QUIET_METHODS)[number]
const originalQuiet = {} as Record<QuietMethod, (...args: unknown[]) => void>
let consoleBuffer: Array<{ method: QuietMethod; args: unknown[] }> = []

beforeEach(() => {
  consoleBuffer = []
  for (const method of QUIET_METHODS) {
    originalQuiet[method] = console[method]
    console[method] = (...args: unknown[]) => {
      consoleBuffer.push({ method, args })
    }
  }
})
afterEach((ctx) => {
  for (const method of QUIET_METHODS) {
    console[method] = originalQuiet[method]
  }
  if (ctx.task.result?.state === 'fail') {
    for (const { method, args } of consoleBuffer) {
      originalQuiet[method](...args)
    }
  }
  consoleBuffer = []
})
