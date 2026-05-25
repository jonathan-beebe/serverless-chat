// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useVisualViewportHeight } from './useVisualViewportHeight'

// jsdom doesn't implement `window.visualViewport`, so each test installs a
// shaped mock on `window`. `EventTarget` gives us real `addEventListener` /
// `dispatchEvent` semantics — the same surface the hook subscribes to.
interface MockVisualViewport extends EventTarget {
  height: number
}

function createMockVisualViewport(height: number): MockVisualViewport {
  const vv = new EventTarget() as MockVisualViewport
  vv.height = height
  return vv
}

function installVisualViewport(vv: MockVisualViewport | null) {
  Object.defineProperty(window, 'visualViewport', {
    configurable: true,
    value: vv,
  })
}

describe('useVisualViewportHeight', () => {
  let scrollSpy: ReturnType<typeof vi.fn>
  const originalScrollTo = window.scrollTo
  const originalDescriptor = Object.getOwnPropertyDescriptor(window, 'visualViewport')

  beforeEach(() => {
    scrollSpy = vi.fn()
    window.scrollTo = scrollSpy as unknown as typeof window.scrollTo
  })

  afterEach(() => {
    window.scrollTo = originalScrollTo
    if (originalDescriptor) {
      Object.defineProperty(window, 'visualViewport', originalDescriptor)
    } else {
      // jsdom didn't define it — remove the test-installed property so the
      // next test starts from the same blank slate as the suite did.
      // @ts-expect-error narrowing the dynamic property
      delete window.visualViewport
    }
    document.documentElement.style.removeProperty('--vvh')
  })

  it('writes the initial visualViewport.height to `--vvh` on mount', () => {
    installVisualViewport(createMockVisualViewport(640))
    renderHook(() => useVisualViewportHeight())
    expect(document.documentElement.style.getPropertyValue('--vvh')).toBe('640px')
  })

  it('updates `--vvh` when visualViewport fires `resize` (keyboard opens, orientation change)', () => {
    const vv = createMockVisualViewport(800)
    installVisualViewport(vv)
    renderHook(() => useVisualViewportHeight())
    act(() => {
      vv.height = 420
      vv.dispatchEvent(new Event('resize'))
    })
    expect(document.documentElement.style.getPropertyValue('--vvh')).toBe('420px')
  })

  it('updates `--vvh` when visualViewport fires `scroll` (iOS pan-under-keyboard event)', () => {
    const vv = createMockVisualViewport(800)
    installVisualViewport(vv)
    renderHook(() => useVisualViewportHeight())
    act(() => {
      vv.height = 500
      vv.dispatchEvent(new Event('scroll'))
    })
    expect(document.documentElement.style.getPropertyValue('--vvh')).toBe('500px')
  })

  it('calls `window.scrollTo(0, 0)` on each viewport update so iOS cannot pan the page beneath the keyboard', () => {
    const vv = createMockVisualViewport(800)
    installVisualViewport(vv)
    renderHook(() => useVisualViewportHeight())
    // One call on initial apply…
    expect(scrollSpy).toHaveBeenCalledWith(0, 0)
    const initialCalls = scrollSpy.mock.calls.length
    act(() => {
      vv.height = 420
      vv.dispatchEvent(new Event('resize'))
    })
    // …another on the resize.
    expect(scrollSpy.mock.calls.length).toBeGreaterThan(initialCalls)
  })

  it('clears `--vvh` and detaches listeners on unmount', () => {
    const vv = createMockVisualViewport(800)
    installVisualViewport(vv)
    const { unmount } = renderHook(() => useVisualViewportHeight())
    unmount()
    expect(document.documentElement.style.getPropertyValue('--vvh')).toBe('')
    act(() => {
      vv.height = 100
      vv.dispatchEvent(new Event('resize'))
    })
    // No further writes after unmount.
    expect(document.documentElement.style.getPropertyValue('--vvh')).toBe('')
  })

  it('no-ops when called with `active=false`', () => {
    installVisualViewport(createMockVisualViewport(800))
    renderHook(() => useVisualViewportHeight(false))
    expect(document.documentElement.style.getPropertyValue('--vvh')).toBe('')
    expect(scrollSpy).not.toHaveBeenCalled()
  })

  it('no-ops when `window.visualViewport` is absent (older WebKit / non-supporting browsers)', () => {
    installVisualViewport(null)
    expect(() => renderHook(() => useVisualViewportHeight())).not.toThrow()
    expect(document.documentElement.style.getPropertyValue('--vvh')).toBe('')
    expect(scrollSpy).not.toHaveBeenCalled()
  })
})
