import { useEffect, useState } from 'react'

// FEAT-015: cross-browser "is the app running as an installed PWA" detector.
//
// `matchMedia('(display-mode: standalone)').matches` is the standard signal —
// honored by Chromium-based browsers, Firefox installs (when the user has
// installed via a feature flag), and recent Safari. iOS Safari's home-screen
// "installed" web app exposes the non-standard `navigator.standalone` boolean
// instead; combining the two with `||` covers every PWA-capable browser.
//
// Subscribes to the media query's `change` event so subscribers re-render
// when display mode flips mid-session (rare but possible — Chromium fires
// `change` immediately after an in-tab install completes).
//
// `navigator.standalone` doesn't have a corresponding event surface; for iOS
// the value is set at app start so the initial read is sufficient.
export function useDisplayModeStandalone(): boolean {
  const [standalone, setStandalone] = useState<boolean>(() => readStandalone())

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mql = window.matchMedia('(display-mode: standalone)')
    const onChange = (e: MediaQueryListEvent) => {
      // Recompute the full predicate so a flip away from standalone in the
      // media query still respects an iOS `navigator.standalone` of true.
      setStandalone(e.matches || readNavigatorStandalone())
    }
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  return standalone
}

function readStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const mqMatches = typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches
  return mqMatches || readNavigatorStandalone()
}

function readNavigatorStandalone(): boolean {
  if (typeof navigator === 'undefined') return false
  return Boolean((navigator as unknown as { standalone?: boolean }).standalone)
}
