// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDisplayModeStandalone } from './useDisplayModeStandalone'

// FEAT-015: standalone detection is cross-browser via
// `matchMedia('(display-mode: standalone)').matches`, plus iOS Safari's
// non-standard `navigator.standalone`. Tests drive both legs and the media
// query's `change` event so subscribers re-render when the user transitions
// to/from standalone mid-session.

interface MockMediaQueryList {
  matches: boolean
  media: string
  addEventListener: ReturnType<typeof vi.fn>
  removeEventListener: ReturnType<typeof vi.fn>
  dispatch: (matches: boolean) => void
}

function installMatchMedia(initialMatches: boolean): MockMediaQueryList {
  const listeners = new Set<(e: MediaQueryListEvent) => void>()
  const mql: MockMediaQueryList = {
    matches: initialMatches,
    media: '(display-mode: standalone)',
    addEventListener: vi.fn((_event: string, cb: (e: MediaQueryListEvent) => void) => {
      listeners.add(cb)
    }),
    removeEventListener: vi.fn((_event: string, cb: (e: MediaQueryListEvent) => void) => {
      listeners.delete(cb)
    }),
    dispatch(matches: boolean) {
      mql.matches = matches
      const e = { matches, media: mql.media } as MediaQueryListEvent
      listeners.forEach((l) => l(e))
    },
  }
  ;(window as unknown as { matchMedia: (q: string) => MockMediaQueryList }).matchMedia = () => mql
  return mql
}

describe('useDisplayModeStandalone (FEAT-015)', () => {
  const originalMatchMedia = window.matchMedia
  const originalNavStandalone = (navigator as unknown as { standalone?: boolean }).standalone

  beforeEach(() => {
    delete (navigator as unknown as { standalone?: boolean }).standalone
  })

  afterEach(() => {
    ;(window as unknown as { matchMedia: typeof window.matchMedia }).matchMedia = originalMatchMedia
    if (originalNavStandalone === undefined) {
      delete (navigator as unknown as { standalone?: boolean }).standalone
    } else {
      ;(navigator as unknown as { standalone?: boolean }).standalone = originalNavStandalone
    }
  })

  it('returns false when neither the media query matches nor navigator.standalone is set (tab mode)', () => {
    installMatchMedia(false)
    const { result } = renderHook(() => useDisplayModeStandalone())
    expect(result.current).toBe(false)
  })

  it('returns true when the media query matches (Chromium / Android standalone)', () => {
    installMatchMedia(true)
    const { result } = renderHook(() => useDisplayModeStandalone())
    expect(result.current).toBe(true)
  })

  it('returns true when navigator.standalone is true (iOS Safari home-screen install)', () => {
    installMatchMedia(false)
    ;(navigator as unknown as { standalone?: boolean }).standalone = true
    const { result } = renderHook(() => useDisplayModeStandalone())
    expect(result.current).toBe(true)
  })

  it('re-renders to true when the media query fires a change event flipping to standalone', () => {
    const mql = installMatchMedia(false)
    const { result } = renderHook(() => useDisplayModeStandalone())
    expect(result.current).toBe(false)
    act(() => {
      mql.dispatch(true)
    })
    expect(result.current).toBe(true)
  })

  it('unsubscribes the media-query change listener on unmount', () => {
    const mql = installMatchMedia(false)
    const { unmount } = renderHook(() => useDisplayModeStandalone())
    expect(mql.addEventListener).toHaveBeenCalledTimes(1)
    unmount()
    expect(mql.removeEventListener).toHaveBeenCalledTimes(1)
  })
})
