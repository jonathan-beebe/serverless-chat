import { useEffect } from 'react'

// IMPRV-017: bind a bounded-height surface (the connected chat shell) to the
// browser's *visual* viewport rather than its layout viewport, so iOS Safari
// can't pan the page beneath the soft keyboard.
//
// FEAT-013 set `interactive-widget=resizes-content` and switched the shell to
// `100dvh`, which works on Safari 17.4+. On earlier WebKit (and even on
// supporting Safari, where the visual viewport is independently pannable),
// `dvh` alone does not keep the composer pinned above the keyboard.
//
// The supported signal is `window.visualViewport` — `height` is the currently
// visible rectangle. Subscribing to its `resize` + `scroll` events covers
// keyboard open/close, orientation changes, and iOS's pan-under-keyboard
// gesture in a single hook.
//
// The hook writes `vv.height` (in `px`) to `--vvh` on `:root`. The connected
// shell consumes it as `h-[var(--vvh)]` (IMPRV-020 dropped the `-3rem` slack).
// `:root { --vvh: 100dvh }` in `index.css` is the unmounted/unsupported
// fallback.
//
// `window.scrollTo(0, 0)` on each update cancels iOS's visual-viewport pan
// over the layout viewport. Body is `overflow: hidden` globally, so this is
// a no-op for the app's own scrolling content (which lives in `#root`).
// Scoped to the connected shell anyway — pass `active=false` to keep the
// hook mounted (hook rules) without producing the side effect.

export function useVisualViewportHeight(active: boolean = true) {
  useEffect(() => {
    if (!active) return
    const vv = window.visualViewport
    if (!vv) return
    const root = document.documentElement
    const apply = () => {
      root.style.setProperty('--vvh', `${vv.height}px`)
      window.scrollTo(0, 0)
    }
    apply()
    vv.addEventListener('resize', apply)
    vv.addEventListener('scroll', apply)
    return () => {
      vv.removeEventListener('resize', apply)
      vv.removeEventListener('scroll', apply)
      root.style.removeProperty('--vvh')
    }
  }, [active])
}
