import { useCallback, useEffect, useRef, useState } from 'react'

// FEAT-015: PWA install prompt capture + replay.
//
// Chromium-based browsers (Chrome desktop/Android, Edge, Brave, Samsung
// Internet) fire `beforeinstallprompt` once when their heuristic-driven
// install criteria are met. The default behavior is the URL-bar install
// affordance; calling `preventDefault()` defers that so the app can re-prompt
// later via `evt.prompt()` from within a user gesture (a button click).
//
// The captured event is consumable exactly once — after `userChoice` resolves
// (accepted OR dismissed), the same event can't be re-prompted. The hook
// drops it from state in both branches so the CTA disappears until the
// browser fires the event again on a future visit.
//
// `appinstalled` is the reliable post-install signal across all PWA-capable
// browsers. The user may install via the browser's own UI (URL-bar icon,
// browser menu) while the CTA is up; this listener tears down the CTA in that
// path too.

// Minimal local shape — the lib.dom.d.ts type isn't declared in TS yet.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export interface InstallPromptApi {
  canInstall: boolean
  promptInstall: () => Promise<void>
}

export function useInstallPrompt(): InstallPromptApi {
  const [canInstall, setCanInstall] = useState(false)
  // Hold the captured event in a ref (not state) so re-renders don't reset
  // it and so the click handler always reads the latest value.
  const eventRef = useRef<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      eventRef.current = e as BeforeInstallPromptEvent
      setCanInstall(true)
    }
    const onAppInstalled = () => {
      eventRef.current = null
      setCanInstall(false)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onAppInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onAppInstalled)
    }
  }, [])

  const promptInstall = useCallback(async () => {
    const evt = eventRef.current
    if (!evt) return
    await evt.prompt()
    // userChoice resolves to { outcome: 'accepted' | 'dismissed' }. Either
    // way the event is spent; clear so the CTA hides until a future visit.
    try {
      await evt.userChoice
    } finally {
      eventRef.current = null
      setCanInstall(false)
    }
  }, [])

  return { canInstall, promptInstall }
}
