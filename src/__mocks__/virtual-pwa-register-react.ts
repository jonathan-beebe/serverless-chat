import { useEffect, useState } from 'react'

// vite-plugin-pwa exposes `virtual:pwa-register/react`. Vitest can't resolve
// virtual modules, so vitest.config.ts aliases imports to this stub. This file
// is only ever loaded under vitest — production code reaches the real virtual
// module through the plugin.
//
// IMPRV-022: the mock now backs `useRegisterSW` with module-level state plus a
// listener set, so tests can flip `needRefresh` (and observe
// `updateServiceWorker` calls) from outside React. `__pwaTest` is the test
// driver surface — `setNeedRefresh(true)` notifies every mounted hook and
// triggers a re-render via the React `setState` listeners. Wrap mutations in
// `act(...)` in tests so React batches the resulting renders correctly.

let needRefreshValue = false
const listeners = new Set<(value: boolean) => void>()
const updateServiceWorkerCalls: Array<boolean | undefined> = []

export function useRegisterSW(_options?: unknown): {
  needRefresh: readonly [boolean, (v: boolean) => void]
  offlineReady: readonly [boolean, (v: boolean) => void]
  updateServiceWorker: (reloadPage?: boolean) => Promise<void>
} {
  void _options
  const [need, setNeed] = useState<boolean>(needRefreshValue)
  useEffect(() => {
    const listener = (next: boolean) => setNeed(next)
    listeners.add(listener)
    // Sync against the latest module-level value at mount in case a setter
    // ran between render and effect-commit.
    setNeed(needRefreshValue)
    return () => {
      listeners.delete(listener)
    }
  }, [])
  return {
    needRefresh: [need, () => {}] as readonly [boolean, (v: boolean) => void],
    offlineReady: [false, () => {}] as readonly [boolean, (v: boolean) => void],
    updateServiceWorker: async (reloadPage?: boolean) => {
      updateServiceWorkerCalls.push(reloadPage)
    },
  }
}

export const __pwaTest = {
  setNeedRefresh(value: boolean) {
    needRefreshValue = value
    listeners.forEach((l) => l(value))
  },
  updateServiceWorkerCalls() {
    return updateServiceWorkerCalls.slice()
  },
  reset() {
    needRefreshValue = false
    updateServiceWorkerCalls.length = 0
  },
}
