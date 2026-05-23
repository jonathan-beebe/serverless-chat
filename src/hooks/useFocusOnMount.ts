import { useEffect, useRef, type DependencyList } from 'react'

// SPA route/state transitions in this app swap whole subtrees on a button
// click. The button is unmounted with the old screen, so browsers drop focus
// to <body>. Keyboard users then have to Tab from the top of the document,
// and screen-reader users get no signal that the page changed (WCAG 2.4.3).
//
// This hook returns a ref to attach to a meaningful starting point on the
// new screen — typically the `<h1>`, which should also carry `tabIndex={-1}`
// so it can receive programmatic focus without becoming part of the natural
// tab order.
//
// Pass `deps` to refocus when an in-component branch swaps the rendered
// heading (e.g. Offerer's gathering view → connected view). Omit for a
// one-shot focus when the whole screen mounts.
//
// `preventScroll: true` keeps the viewport stable; React already commits the
// new tree at the top, and we don't want the focus call to fight that.
//
// `options.skip` lets a caller opt out of the focus call without changing the
// returned ref. Used by screens rendering inside a showcase / preview context
// so they don't steal focus from the host page. The hook still reads `skip`
// fresh on every effect run, so a screen that flips its branch (Offerer
// invite → connected) while inside a showcase stays skipped. See A11Y-022.
interface Options {
  skip?: boolean
}

export function useFocusOnMount<T extends HTMLElement>(deps: DependencyList = [], options: Options = {}) {
  const ref = useRef<T | null>(null)
  const { skip } = options
  useEffect(() => {
    if (skip) return
    ref.current?.focus({ preventScroll: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return ref
}
