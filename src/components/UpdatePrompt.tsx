import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { Button } from './Button'
import { Callout } from './Callout'
import { LiveRegion } from './LiveRegion'

// IMPRV-022: surfaces vite-plugin-pwa's `needRefresh` state as an in-app
// banner so users can opt into the new build instead of waiting for every
// tab to close. `registerType: 'prompt'` in vite.config.js leaves the waiting
// SW parked until `updateServiceWorker(true)` is called, which is the click
// handler on the Update button.
//
// Gated to the Home route on purpose — the connected chat surface is a live
// WebRTC session and the setup branches sit inside a handshake flow; either
// would lose state on the reload Update triggers. Home is the "between
// chats" surface where a reload is safe.
//
// Dismiss state is component-local (no localStorage). The next page load
// re-evaluates `needRefresh`, so a dismissed banner returns if the user still
// hasn't updated.
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({ immediate: true })
  const [dismissed, setDismissed] = useState(false)
  const location = useLocation()

  const visible = needRefresh && !dismissed && location.pathname === '/'

  return (
    <>
      <LiveRegion>{visible ? 'App update available' : ''}</LiveRegion>
      {visible && (
        <aside
          aria-label="App update available"
          // IMPRV-024: the symmetric 0.75rem vertical padding splits into a
          // fixed `pt-3` (top) and a safe-area-aware
          // `pb-[max(env(safe-area-inset-bottom),0.75rem)]` (bottom), so the
          // Update/Dismiss tap targets sit above the iOS home-indicator pill
          // in PWA standalone while preserving the original 0.75rem bottom
          // padding in browser tabs (where `env(safe-area-inset-bottom)` is
          // `0px`). Comma-no-space form is required — Tailwind v4 parses
          // arbitrary values as space-significant, and `max(env(...), 0.75rem)`
          // with a space after the comma can fail to compile.
          className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-w-xl items-center justify-between gap-3 border-t border-stone-300 bg-stone-50 px-4 pt-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] shadow-md dark:border-stone-700 dark:bg-stone-900">
          <Callout variant="info">A new version is available.</Callout>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => setDismissed(true)}>
              Dismiss
            </Button>
            <Button variant="primary" size="sm" onClick={() => void updateServiceWorker(true)}>
              Update
            </Button>
          </div>
        </aside>
      )}
    </>
  )
}
