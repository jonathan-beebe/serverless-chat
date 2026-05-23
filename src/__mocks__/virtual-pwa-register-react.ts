// vite-plugin-pwa exposes `virtual:pwa-register/react`. Vitest can't resolve
// virtual modules, so vitest.config.ts aliases imports to this stub.
export function useRegisterSW() {
  return {
    needRefresh: [false, () => {}] as const,
    offlineReady: [false, () => {}] as const,
    updateServiceWorker: async () => {},
  }
}
