import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  define: {
    __COMMIT_HASH__: JSON.stringify('test'),
  },
  resolve: {
    alias: {
      'virtual:pwa-register/react': resolve(__dirname, 'src/__mocks__/virtual-pwa-register-react.ts'),
    },
  },
  test: {
    // CR-013: split the test environment by path. `src/core/**` is pure
    // utility code with no DOM dependency, so those tests run in `node`
    // — much cheaper than standing up jsdom for every worker. Everything
    // else (components, screens, top-level UI) stays on jsdom.
    //
    // Vitest 4 removed `environmentMatchGlobs`; the supported replacement
    // is `projects`. Files that live under `src/core/**` but still need
    // the DOM (e.g. `clipboard.test.ts`) opt back into jsdom with a
    // `// @vitest-environment jsdom` pragma at the top of the file.
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    // CR-014: don't tear down the JS env between test files in the same
    // worker. jsdom + setupFiles + module graph are re-built ~26 times by
    // default; with `isolate: false` a worker pays that cost once and reuses
    // it across the files it owns. Safe here because the leak-sensitive bits
    // are already scrubbed per-test:
    //   - `storage.test.ts` / `useConversations.test.ts` replace
    //     `globalThis.indexedDB` and call `__resetForTests()` in `beforeEach`.
    //   - tests that flip `vi.useFakeTimers()` restore real timers in
    //     `afterEach` (or `finally`).
    //   - `vi.restoreAllMocks()` runs in `afterEach` where spies are used.
    //   - Testing Library auto-cleans DOM between tests.
    //   - `useConversations` listeners are unsubscribed in React effect
    //     cleanup, which Testing Library's auto-unmount triggers.
    isolate: false,
    projects: [
      {
        extends: true,
        test: {
          name: 'core',
          environment: 'node',
          include: ['src/core/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'dom',
          environment: 'jsdom',
          include: ['src/**/*.test.{ts,tsx}'],
          exclude: ['src/core/**/*.test.ts'],
        },
      },
    ],
  },
})
