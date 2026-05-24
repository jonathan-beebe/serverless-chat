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
import { afterEach } from 'vitest'

afterEach(() => {
  cleanup()
})
