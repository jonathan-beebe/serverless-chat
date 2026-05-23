import '@testing-library/jest-dom/vitest'
// FEAT-012: in-memory IndexedDB so `src/core/storage.ts` round-trips in
// jsdom. `fake-indexeddb/auto` installs polyfills on the global scope at
// import time; the storage module's `typeof indexedDB === 'undefined'`
// guard then short-circuits to "available" in tests.
import 'fake-indexeddb/auto'
