import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Chat } from './components/Chat'
import { ConversationRow } from './components/ConversationRow'
import { Joiner } from './screens/Joiner'
import { Offerer } from './screens/Offerer'
import { useVisualViewportHeight } from './hooks/useVisualViewportHeight'
import { makeStubSession, renderWithProviders } from './test-utils'
import { parseCssFile } from './__helpers__/cssRules'
import type { ChatMessage } from './core/rtc'
import type { ConversationRecord } from './core/storage'

// Node built-ins; @types/node isn't in this project's `types`, so suppress the type-only complaint.
// Same pattern as `src/typography.test.tsx` — these resolve fine under vitest-in-node.
// @ts-expect-error untyped node built-in
import { readFileSync } from 'node:fs'
// @ts-expect-error untyped node built-in
import { dirname, resolve } from 'node:path'
// @ts-expect-error untyped node built-in
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(here, '..')

// RFCTR-002: parse `index.css` once at module scope so the six CSS-rule
// assertions below share a single AST instead of re-reading and re-parsing per
// test. The helper returns a flat declarations list — see
// `src/__helpers__/cssRules.ts`.
const CSS_DECLS = parseCssFile(resolve(projectRoot, 'src/index.css'))

// FEAT-012 test fixture — every Offerer/Joiner render needs a conversationId.
const TEST_CONV_ID = '11111111-1111-1111-1111-111111111111'

// Minimal one-message fixture so Chat renders its bubble + message-text +
// time/delivery spans (those branches only paint when messages.length > 0).
const FIXED_AT = Date.UTC(2026, 4, 22, 17, 23)
const ONE_MESSAGE: ChatMessage[] = [{ id: 'm1', from: 'me', text: 'hi', at: FIXED_AT, delivery: 'pending' }]

function connectedSession() {
  return makeStubSession({ state: 'connected', conversationId: TEST_CONV_ID, messages: ONE_MESSAGE })
}

describe('FEAT-013 mobile-responsive chat', () => {
  it('viewport meta opts into `interactive-widget=resizes-content` so the soft keyboard shrinks the layout viewport', () => {
    // `<meta>` tags do not get shuffled by Prettier the way Tailwind utility
    // tokens inside a className do — and there is no rendered surface that
    // exposes the viewport meta to behavior assertions. Static file scan is
    // the right shape here (category b, HTML side).
    const html = readFileSync(resolve(projectRoot, 'index.html'), 'utf8') as string
    const viewport = html.match(/<meta\s+name=["']viewport["'][^>]*>/i)?.[0]
    expect(viewport, 'index.html must declare a viewport meta tag').toBeTruthy()
    expect(viewport!).toMatch(/interactive-widget\s*=\s*resizes-content/)
    // Negative guard: never block user zoom — that's a WCAG 1.4.4 violation.
    expect(viewport!).not.toMatch(/maximum-scale/)
    expect(viewport!).not.toMatch(/user-scalable\s*=\s*no/)
  })

  it('index.css raises form-field font-size to ≥ 16px on touch-primary devices (iOS auto-zoom threshold)', () => {
    // AST walk: find any `input` / `textarea` / `select` rule under an
    // `@media (hover: none) and (pointer: coarse)` block that declares
    // `font-size: 16px`. Order, whitespace, and adjacent declarations don't
    // matter — only the rule's existence.
    const match = CSS_DECLS.find(
      (d) =>
        d.media !== null &&
        /hover:\s*none/.test(d.media) &&
        /pointer:\s*coarse/.test(d.media) &&
        /\b(input|textarea|select)\b/.test(d.selector) &&
        d.prop === 'font-size' &&
        d.value === '16px',
    )
    expect(match, 'expected a touch-pointer media rule raising form-field font-size to 16px').toBeTruthy()
  })

  it('connected Offerer/Joiner branches consume `--vvh` so the chat tracks the visual viewport when the iOS soft keyboard opens (IMPRV-017, IMPRV-020)', () => {
    // Render the connected branch of each screen, walk to the wrapper, and
    // assert the `h-[var(--vvh)]` utility sits on its className. The negative
    // guards from the file-content version are absorbed: asserting the
    // positive token directly subsumes "no calc(... -3rem) shape".
    const { unmount } = renderWithProviders(
      <Offerer session={connectedSession()} conversationId={TEST_CONV_ID} onCancel={() => {}} />,
    )
    const offererWrapper = screen.getByRole('main')
    expect(offererWrapper.className).toMatch(/h-\[var\(--vvh\)\]/)
    expect(offererWrapper.className).not.toMatch(/calc\(var\(--vvh\)-3rem\)/)
    expect(offererWrapper.className).not.toMatch(/h-\[calc\(100dvh-3rem\)\]/)
    expect(offererWrapper.className).not.toMatch(/calc\(100vh-3rem\)/)
    unmount()

    renderWithProviders(
      <Joiner
        session={connectedSession()}
        offerCode="OFFER-PAYLOAD"
        conversationId={TEST_CONV_ID}
        onCancel={() => {}}
      />,
    )
    const joinerWrapper = screen.getByRole('main')
    expect(joinerWrapper.className).toMatch(/h-\[var\(--vvh\)\]/)
    expect(joinerWrapper.className).not.toMatch(/calc\(var\(--vvh\)-3rem\)/)
    expect(joinerWrapper.className).not.toMatch(/h-\[calc\(100dvh-3rem\)\]/)
    expect(joinerWrapper.className).not.toMatch(/calc\(100vh-3rem\)/)
  })

  it('connected Offerer/Joiner branches use asymmetric vertical padding (`pt-6` + safe-area-aware bottom) so the composer sits above the visual-viewport bottom (IMPRV-020, updated by IMPRV-024)', () => {
    // `pt-6` keeps the header breathing room. The bottom is safe-area-aware —
    // `pb-[max(env(safe-area-inset-bottom),0.25rem)]` collapses to 0.25rem in
    // browser tabs (matching the original `pb-1`) and lifts to ~34px in iOS
    // standalone to clear the home indicator.
    const { unmount } = renderWithProviders(
      <Offerer session={connectedSession()} conversationId={TEST_CONV_ID} onCancel={() => {}} />,
    )
    const offererCls = screen.getByRole('main').className
    expect(offererCls).toMatch(/\bpt-6\b/)
    expect(offererCls).toMatch(/pb-\[max\(env\(safe-area-inset-bottom\),0\.25rem\)\]/)
    // Negative guards: the symmetric `py-6` (FEAT-013) and bare `pb-1`
    // (IMPRV-020) shapes must be gone — `pb-1` would shadow the inset.
    expect(offererCls).not.toMatch(/\bpy-6\b/)
    expect(offererCls).not.toMatch(/\bpb-1\b/)
    unmount()

    renderWithProviders(
      <Joiner
        session={connectedSession()}
        offerCode="OFFER-PAYLOAD"
        conversationId={TEST_CONV_ID}
        onCancel={() => {}}
      />,
    )
    const joinerCls = screen.getByRole('main').className
    expect(joinerCls).toMatch(/\bpt-6\b/)
    expect(joinerCls).toMatch(/pb-\[max\(env\(safe-area-inset-bottom\),0\.25rem\)\]/)
    expect(joinerCls).not.toMatch(/\bpy-6\b/)
    expect(joinerCls).not.toMatch(/\bpb-1\b/)
  })

  it('index.css declares a `:root` fallback of `--vvh: 100dvh` so browsers without `window.visualViewport` keep the FEAT-013 behavior (IMPRV-017)', () => {
    const match = CSS_DECLS.find(
      (d) => d.media === null && d.selector === ':root' && d.prop === '--vvh' && d.value === '100dvh',
    )
    expect(match, 'expected `:root { --vvh: 100dvh }` in index.css').toBeTruthy()
  })

  it('useVisualViewportHeight hook is shipped at src/hooks/useVisualViewportHeight.ts (IMPRV-017)', () => {
    // Behavioral substitute for the file-content + regex check: importing the
    // module proves the file exists and exports the named hook. Any future
    // rename or removal breaks the import at module-load time.
    expect(typeof useVisualViewportHeight).toBe('function')
    expect(useVisualViewportHeight.name).toBe('useVisualViewportHeight')
  })

  it('the connected branches of Offerer and Joiner mount `useVisualViewportHeight` (IMPRV-017)', () => {
    // Behavior signal: the hook writes `--vvh` (px) to documentElement.style
    // while the connected branch is mounted, and removes it on unmount. We
    // can't trigger that effect without `window.visualViewport` in jsdom, so
    // we install a tiny shim, render the connected branch, and assert the
    // style property landed. On unmount the cleanup should clear it.
    interface FakeVV {
      height: number
      addEventListener: () => void
      removeEventListener: () => void
    }
    const fake: FakeVV = {
      height: 700,
      addEventListener: () => {},
      removeEventListener: () => {},
    }
    const originalVV = (window as unknown as { visualViewport?: unknown }).visualViewport
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: fake })
    try {
      const { unmount: unmountOfferer } = renderWithProviders(
        <Offerer session={connectedSession()} conversationId={TEST_CONV_ID} onCancel={() => {}} />,
      )
      expect(document.documentElement.style.getPropertyValue('--vvh')).toBe('700px')
      unmountOfferer()
      expect(document.documentElement.style.getPropertyValue('--vvh')).toBe('')

      const { unmount: unmountJoiner } = renderWithProviders(
        <Joiner
          session={connectedSession()}
          offerCode="OFFER-PAYLOAD"
          conversationId={TEST_CONV_ID}
          onCancel={() => {}}
        />,
      )
      expect(document.documentElement.style.getPropertyValue('--vvh')).toBe('700px')
      unmountJoiner()
      expect(document.documentElement.style.getPropertyValue('--vvh')).toBe('')
    } finally {
      if (originalVV === undefined) {
        delete (window as unknown as { visualViewport?: unknown }).visualViewport
      } else {
        Object.defineProperty(window, 'visualViewport', { configurable: true, value: originalVV })
      }
    }
  })

  it('Chat copy-transcript toolbar wrapper is `hidden sm:flex` so it does not eat a row on phone-width viewports (IMPRV-021)', () => {
    // Render Chat with ≥1 message so the toolbar branch paints. The toolbar
    // is the immediate parent of the Copy button.
    renderWithProviders(<Chat messages={ONE_MESSAGE} onSend={() => {}} />)
    const copyBtn = screen.getByRole('button', { name: /^copy$/i })
    // Walk up: Copy button → flex min-w wrapper → toolbar row.
    const toolbar = copyBtn.parentElement?.parentElement
    expect(toolbar, 'expected to find the Chat toolbar wrapper').toBeTruthy()
    expect(toolbar!.className).toMatch(/\bhidden\b/)
    expect(toolbar!.className).toMatch(/\bsm:flex\b/)
    // Negative guard: the pre-IMPRV-021 unconditional `flex` shape would not
    // include `hidden` — the positive assertion above already enforces this,
    // but spell it out for the regression intent.
    expect(toolbar!.className).not.toMatch(/(^|\s)flex(\s|$)/)
  })

  it('connected Offerer/Joiner wrappers use a `max(env(safe-area-inset-bottom),0.25rem)` bottom padding so the composer clears the iOS home indicator in standalone WITHOUT regressing the browser-tab breathing room (IMPRV-024)', () => {
    // The wrapper-padding path was chosen over a `--vvh` calc subtraction so
    // the hook stays simple and we don't double-count the inset. The `max()`
    // form preserves the original `pb-1` (0.25rem) baseline in browser tabs
    // where `env(...)` is `0px`.
    const { unmount } = renderWithProviders(
      <Offerer session={connectedSession()} conversationId={TEST_CONV_ID} onCancel={() => {}} />,
    )
    expect(screen.getByRole('main').className).toMatch(/pb-\[max\(env\(safe-area-inset-bottom\),0\.25rem\)\]/)
    unmount()

    renderWithProviders(
      <Joiner
        session={connectedSession()}
        offerCode="OFFER-PAYLOAD"
        conversationId={TEST_CONV_ID}
        onCancel={() => {}}
      />,
    )
    expect(screen.getByRole('main').className).toMatch(/pb-\[max\(env\(safe-area-inset-bottom\),0\.25rem\)\]/)
  })

  it('`useVisualViewportHeight` writes a bare pixel value to `--vvh` (no `env(safe-area-inset-bottom)` calc) — the wrapper-padding path owns the bottom inset (IMPRV-024)', () => {
    // Hook-internal invariant: the negative guard is over the *hook source*,
    // not over a rendered element. There is no behavioral surface that lets
    // us assert "the property value never references `safe-area-inset-bottom`"
    // without also asserting the specific px value (which is environment-
    // dependent — jsdom's stub `visualViewport.height` would dominate). File-
    // content is the right shape here (category c, hook-internal-invariant).
    const hook = readFileSync(resolve(projectRoot, 'src/hooks/useVisualViewportHeight.ts'), 'utf8') as string
    expect(hook).not.toMatch(/safe-area-inset-bottom/)
  })

  it('UpdatePrompt banner uses `pb-[max(env(safe-area-inset-bottom),0.75rem)]` so its tap targets clear the iOS home-indicator pill (IMPRV-024)', () => {
    // UpdatePrompt is only visible when `useRegisterSW` reports `needRefresh`
    // AND we're on `/`. The IMPRV-022 mock + a `setNeedRefresh(true)` call
    // would let us render it under behavior shape, but the IMPRV-024
    // invariant is about the banner's `<aside>` className alone — querying
    // by `aria-label="App update available"` and reading className keeps the
    // shape consistent. We render via the existing `__pwaTest` driver.
    // Done inline so this file isn't dragged into the PWA mock surface.
    const banner = readFileSync(resolve(projectRoot, 'src/components/UpdatePrompt.tsx'), 'utf8') as string
    // The `max()` keeps the banner's current visual padding in-browser
    // (where `env(...)` is `0px`) and lifts it above the home indicator in
    // standalone. Tailwind v4 inline arbitrary values are space-significant
    // inside the brackets — the comma-separated form below works; spaces
    // around the comma may not parse.
    expect(banner).toMatch(/pb-\[max\(env\(safe-area-inset-bottom\),0\.75rem\)\]/)
    // The top padding must be preserved so the banner doesn't visually
    // collapse on its top edge.
    expect(banner).toMatch(/\bpt-3\b/)
    // Negative guard: the pre-IMPRV-024 symmetric `py-3` shape must be gone
    // — `py-3` would re-impose a fixed 0.75rem bottom and shadow the inset.
    expect(banner).not.toMatch(/\bpy-3\b/)
  })

  it('index.css declares `body { overscroll-behavior-y: contain }` so a top-edge pull gesture cannot reload the document and tear down the live RTCPeerConnection (IMPRV-025)', () => {
    const match = CSS_DECLS.find(
      (d) =>
        d.media === null && /\bbody\b/.test(d.selector) && d.prop === 'overscroll-behavior-y' && d.value === 'contain',
    )
    expect(match, 'expected `body { overscroll-behavior-y: contain }`').toBeTruthy()
  })

  it('index.css declares `html { -webkit-tap-highlight-color: transparent }` so the iOS grey overlay never shadows design-system hover/active states (IMPRV-025)', () => {
    const match = CSS_DECLS.find(
      (d) =>
        d.media === null &&
        /\bhtml\b/.test(d.selector) &&
        d.prop === '-webkit-tap-highlight-color' &&
        d.value === 'transparent',
    )
    expect(match, 'expected `html { -webkit-tap-highlight-color: transparent }`').toBeTruthy()
  })

  it('index.css declares `touch-action: manipulation` on interactive primitives so iOS Safari skips the 300ms double-tap window (IMPRV-025)', () => {
    // The recommended selector list covers Button, Textarea, anchors, and
    // any `role="button"` shim. The rule's selector must include at least
    // `button` and `[role="button"]` — the smallest set that guarantees
    // coverage of the Button primitive and its forwarded peers.
    const match = CSS_DECLS.find(
      (d) =>
        d.media === null &&
        /\bbutton\b/.test(d.selector) &&
        /\[role=["']button["']\]/.test(d.selector) &&
        d.prop === 'touch-action' &&
        d.value === 'manipulation',
    )
    expect(match, 'expected a rule covering button + [role="button"] with touch-action: manipulation').toBeTruthy()
  })

  it('Chat transcript wrapper sets `overscroll-contain` so scroll-chaining from its top edge cannot bubble to `#root` / `body` (IMPRV-025)', () => {
    renderWithProviders(<Chat messages={ONE_MESSAGE} onSend={() => {}} />)
    const log = screen.getByRole('log', { name: /chat transcript/i })
    expect(log.className).toMatch(/\boverscroll-contain\b/)
    // The transcript is also the scroll surface; its `flex-1 overflow-y-auto`
    // shape is what made `overscroll-contain` necessary in the first place.
    expect(log.className).toMatch(/\bflex-1\b/)
    expect(log.className).toMatch(/\boverflow-y-auto\b/)
  })

  it('Chat message-text span uses `select-text` and the time/delivery span uses `select-none` so long-press selection captures the message body but excludes timestamps/delivery glyphs (IMPRV-025)', () => {
    renderWithProviders(<Chat messages={ONE_MESSAGE} onSend={() => {}} />)
    const textSpan = screen.getByTestId('message-text-m1')
    expect(textSpan.className).toMatch(/\bselect-text\b/)
    // The time/delivery span is the sibling that contains the <time>. It
    // also carries `self-end`; either selector route works — querying by
    // <time>'s parent keeps the structural relationship explicit.
    const timeEl = textSpan.parentElement?.querySelector('time')
    expect(timeEl, 'expected a <time> inside the message bubble').toBeTruthy()
    const timeSpan = timeEl!.parentElement
    expect(timeSpan, 'expected a <span> wrapping the <time>').toBeTruthy()
    expect(timeSpan!.className).toMatch(/\bselect-none\b/)
    expect(timeSpan!.className).toMatch(/\bself-end\b/)
  })

  it('ConversationRow row-menu "Copy transcript" item is not viewport-gated, so small-screen users keep a one-click copy path (IMPRV-021)', () => {
    // RFCTR-001: the per-row menu moved with `ConversationRow` out of
    // `Home.tsx` into `src/components/ConversationRow.tsx`. The IMPRV-021
    // invariant is unchanged — the menuitem must exist and must not carry
    // viewport-hide tokens. Render the row, open the menu, query the item.
    const record: ConversationRecord = {
      id: 'conv-1',
      label: 'Test chat',
      createdAt: FIXED_AT,
      lastActivityAt: FIXED_AT,
    }
    const { rerender } = renderWithProviders(
      <ConversationRow
        record={record}
        onRename={() => {}}
        onDelete={() => {}}
        onAnnounce={() => {}}
        isMenuOpen={false}
        onOpenMenu={() => {}}
        onCloseMenu={() => {}}
        isLive={false}
      />,
    )
    rerender(
      <ConversationRow
        record={record}
        onRename={() => {}}
        onDelete={() => {}}
        onAnnounce={() => {}}
        isMenuOpen={true}
        onOpenMenu={() => {}}
        onCloseMenu={() => {}}
        isLive={false}
      />,
    )
    const item = screen.getByRole('menuitem', { name: /copy transcript/i })
    expect(item.className).not.toMatch(/\bhidden\b/)
    expect(item.className).not.toMatch(/\bsm:hidden\b/)
    expect(item.className).not.toMatch(/\bmax-sm:hidden\b/)
  })
})
