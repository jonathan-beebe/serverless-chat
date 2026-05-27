import { describe, expect, it } from 'vitest'

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

describe('FEAT-013 mobile-responsive chat', () => {
  it('viewport meta opts into `interactive-widget=resizes-content` so the soft keyboard shrinks the layout viewport', () => {
    const html = readFileSync(resolve(projectRoot, 'index.html'), 'utf8') as string
    const viewport = html.match(/<meta\s+name=["']viewport["'][^>]*>/i)?.[0]
    expect(viewport, 'index.html must declare a viewport meta tag').toBeTruthy()
    expect(viewport!).toMatch(/interactive-widget\s*=\s*resizes-content/)
    // Negative guard: never block user zoom — that's a WCAG 1.4.4 violation.
    expect(viewport!).not.toMatch(/maximum-scale/)
    expect(viewport!).not.toMatch(/user-scalable\s*=\s*no/)
  })

  it('index.css raises form-field font-size to ≥ 16px on touch-primary devices (iOS auto-zoom threshold)', () => {
    const css = readFileSync(resolve(projectRoot, 'src/index.css'), 'utf8') as string
    // The rule must live behind a touch-pointer media query so desktop's
    // denser text-sm inputs stay unchanged. Match flexibly so the
    // formatting can shift without breaking the test.
    const declarations = css.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(declarations).toMatch(/@media[^{]*\(hover:\s*none\)[^{]*\(pointer:\s*coarse\)/)
    expect(declarations).toMatch(/(input|textarea|select)[^{]*\{[^}]*font-size:\s*16px/)
  })

  it('connected Offerer/Joiner branches consume `--vvh` so the chat tracks the visual viewport when the iOS soft keyboard opens (IMPRV-017, IMPRV-020)', () => {
    const offerer = readFileSync(resolve(projectRoot, 'src/screens/Offerer.tsx'), 'utf8') as string
    const joiner = readFileSync(resolve(projectRoot, 'src/screens/Joiner.tsx'), 'utf8') as string
    // IMPRV-020: the container fills `--vvh` directly — no `-3rem` slack.
    // `useVisualViewportHeight` sets `--vvh` to the live visual-viewport height,
    // falling back to `100dvh` via `:root` in index.css when unsupported.
    expect(offerer).toMatch(/h-\[var\(--vvh\)\]/)
    expect(joiner).toMatch(/h-\[var\(--vvh\)\]/)
    // Negative guards: the pre-IMPRV-020 (`-3rem`) and pre-IMPRV-017 (`100dvh`/`100vh`) shapes must be fully replaced.
    expect(offerer).not.toMatch(/calc\(var\(--vvh\)-3rem\)/)
    expect(joiner).not.toMatch(/calc\(var\(--vvh\)-3rem\)/)
    expect(offerer).not.toMatch(/h-\[calc\(100dvh-3rem\)\]/)
    expect(joiner).not.toMatch(/h-\[calc\(100dvh-3rem\)\]/)
    expect(offerer).not.toMatch(/calc\(100vh-3rem\)/)
    expect(joiner).not.toMatch(/calc\(100vh-3rem\)/)
  })

  it('connected Offerer/Joiner branches use asymmetric vertical padding (`pt-6` + safe-area-aware bottom) so the composer sits above the visual-viewport bottom (IMPRV-020, updated by IMPRV-024)', () => {
    const offerer = readFileSync(resolve(projectRoot, 'src/screens/Offerer.tsx'), 'utf8') as string
    const joiner = readFileSync(resolve(projectRoot, 'src/screens/Joiner.tsx'), 'utf8') as string
    // Match the connected `ScreenContainer` className block (multi-line tolerant).
    // `pt-6` keeps the header breathing room. The bottom is now safe-area-aware
    // — `pb-[max(env(safe-area-inset-bottom),0.25rem)]` collapses to 0.25rem in
    // browser tabs (matching the original `pb-1`) and lifts to ~34px in iOS
    // standalone to clear the home indicator. IMPRV-024 covers this transition.
    expect(offerer).toMatch(/label="Connected"[\s\S]*?className="[^"]*\bpt-6\b[^"]*"/)
    expect(offerer).toMatch(
      /label="Connected"[\s\S]*?className="[^"]*pb-\[max\(env\(safe-area-inset-bottom\),0\.25rem\)\][^"]*"/,
    )
    expect(joiner).toMatch(/label="Connected"[\s\S]*?className="[^"]*\bpt-6\b[^"]*"/)
    expect(joiner).toMatch(
      /label="Connected"[\s\S]*?className="[^"]*pb-\[max\(env\(safe-area-inset-bottom\),0\.25rem\)\][^"]*"/,
    )
    // Negative guards: the symmetric `py-6` shape from FEAT-013 and the bare
    // `pb-1` from IMPRV-020 must be gone — `pb-1` would shadow the inset.
    expect(offerer).not.toMatch(/label="Connected"[\s\S]*?className="[^"]*\bpy-6\b[^"]*"/)
    expect(joiner).not.toMatch(/label="Connected"[\s\S]*?className="[^"]*\bpy-6\b[^"]*"/)
    expect(offerer).not.toMatch(/label="Connected"[\s\S]*?className="[^"]*\bpb-1\b[^"]*"/)
    expect(joiner).not.toMatch(/label="Connected"[\s\S]*?className="[^"]*\bpb-1\b[^"]*"/)
  })

  it('index.css declares a `:root` fallback of `--vvh: 100dvh` so browsers without `window.visualViewport` keep the FEAT-013 behavior (IMPRV-017)', () => {
    const css = readFileSync(resolve(projectRoot, 'src/index.css'), 'utf8') as string
    const declarations = css.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(declarations).toMatch(/:root\s*\{[^}]*--vvh:\s*100dvh/)
  })

  it('useVisualViewportHeight hook is shipped at src/hooks/useVisualViewportHeight.ts (IMPRV-017)', () => {
    const hookSrc = readFileSync(resolve(projectRoot, 'src/hooks/useVisualViewportHeight.ts'), 'utf8') as string
    expect(hookSrc).toMatch(/export\s+function\s+useVisualViewportHeight/)
  })

  it('the connected branches of Offerer and Joiner mount `useVisualViewportHeight` (IMPRV-017)', () => {
    const offerer = readFileSync(resolve(projectRoot, 'src/screens/Offerer.tsx'), 'utf8') as string
    const joiner = readFileSync(resolve(projectRoot, 'src/screens/Joiner.tsx'), 'utf8') as string
    expect(offerer).toMatch(/useVisualViewportHeight\s*\(/)
    expect(joiner).toMatch(/useVisualViewportHeight\s*\(/)
  })

  it('Chat copy-transcript toolbar wrapper is `hidden sm:flex` so it does not eat a row on phone-width viewports (IMPRV-021)', () => {
    const chat = readFileSync(resolve(projectRoot, 'src/components/Chat.tsx'), 'utf8') as string
    // The toolbar wrapper is the immediate child of the `messages.length > 0`
    // gate. The `hidden sm:flex` pair takes it out of the layout below 640px
    // and restores the flex row at ≥ 640px.
    expect(chat).toMatch(
      /messages\.length\s*>\s*0\s*&&\s*\([\s\S]*?<div\s+className="hidden sm:flex items-center justify-end gap-3"/,
    )
    // Negative guard: the pre-IMPRV-021 unconditional `flex` shape must be gone.
    expect(chat).not.toMatch(/<div\s+className="flex items-center justify-end gap-3"/)
  })

  it('connected Offerer/Joiner wrappers use a `max(env(safe-area-inset-bottom),0.25rem)` bottom padding so the composer clears the iOS home indicator in standalone WITHOUT regressing the browser-tab breathing room (IMPRV-024)', () => {
    const offerer = readFileSync(resolve(projectRoot, 'src/screens/Offerer.tsx'), 'utf8') as string
    const joiner = readFileSync(resolve(projectRoot, 'src/screens/Joiner.tsx'), 'utf8') as string
    // The wrapper-padding path was chosen over a `--vvh` calc subtraction so
    // the hook stays simple and we don't double-count the inset. The `max()`
    // form is what preserves the original `pb-1` (0.25rem) baseline in
    // browser tabs where `env(...)` is `0px`.
    expect(offerer).toMatch(
      /label="Connected"[\s\S]*?className="[^"]*pb-\[max\(env\(safe-area-inset-bottom\),0\.25rem\)\][^"]*"/,
    )
    expect(joiner).toMatch(
      /label="Connected"[\s\S]*?className="[^"]*pb-\[max\(env\(safe-area-inset-bottom\),0\.25rem\)\][^"]*"/,
    )
  })

  it('`useVisualViewportHeight` writes a bare pixel value to `--vvh` (no `env(safe-area-inset-bottom)` calc) — the wrapper-padding path owns the bottom inset (IMPRV-024)', () => {
    const hook = readFileSync(resolve(projectRoot, 'src/hooks/useVisualViewportHeight.ts'), 'utf8') as string
    // Negative guard: if a future change adds the calc subtraction here as
    // well as the wrapper padding, the bottom inset gets double-counted.
    expect(hook).not.toMatch(/safe-area-inset-bottom/)
  })

  it('UpdatePrompt banner uses `pb-[max(env(safe-area-inset-bottom),0.75rem)]` so its tap targets clear the iOS home-indicator pill (IMPRV-024)', () => {
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
    const css = readFileSync(resolve(projectRoot, 'src/index.css'), 'utf8') as string
    const declarations = css.replace(/\/\*[\s\S]*?\*\//g, '')
    // Match a `body { ... overscroll-behavior-y: contain ... }` rule.
    // `body` may also appear in a comma-separated selector list (e.g.
    // `html, body, #root`), so the regex tolerates additional selectors.
    expect(declarations).toMatch(/body[^{}]*\{[^}]*overscroll-behavior-y\s*:\s*contain/)
  })

  it('index.css declares `html { -webkit-tap-highlight-color: transparent }` so the iOS grey overlay never shadows design-system hover/active states (IMPRV-025)', () => {
    const css = readFileSync(resolve(projectRoot, 'src/index.css'), 'utf8') as string
    const declarations = css.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(declarations).toMatch(/html[^{}]*\{[^}]*-webkit-tap-highlight-color\s*:\s*transparent/)
  })

  it('index.css declares `touch-action: manipulation` on interactive primitives so iOS Safari skips the 300ms double-tap window (IMPRV-025)', () => {
    const css = readFileSync(resolve(projectRoot, 'src/index.css'), 'utf8') as string
    const declarations = css.replace(/\/\*[\s\S]*?\*\//g, '')
    // The recommended selector list covers Button, Textarea, anchors, and
    // any `role="button"` shim. Match the property in a rule whose selector
    // includes at least `button` and `[role="button"]` — the smallest set
    // that guarantees coverage of the Button primitive and its forwarded
    // peers.
    expect(declarations).toMatch(/button[\s\S]*?\[role=["']button["']\][^{}]*\{[^}]*touch-action\s*:\s*manipulation/)
  })

  it('Chat transcript wrapper sets `overscroll-contain` so scroll-chaining from its top edge cannot bubble to `#root` / `body` (IMPRV-025)', () => {
    const chat = readFileSync(resolve(projectRoot, 'src/components/Chat.tsx'), 'utf8') as string
    // The transcript wrapper is the `role="log"` element with the
    // `flex-1 overflow-y-auto` className. Match the className block that
    // immediately precedes the messages list and assert `overscroll-contain`
    // sits in it. Multi-line-tolerant.
    expect(chat).toMatch(
      /role="log"[\s\S]*?className="[^"]*\bflex-1\b[^"]*\boverflow-y-auto\b[^"]*\boverscroll-contain\b/,
    )
  })

  it('Chat message-text span uses `select-text` and the time/delivery span uses `select-none` so long-press selection captures the message body but excludes timestamps/delivery glyphs (IMPRV-025)', () => {
    const chat = readFileSync(resolve(projectRoot, 'src/components/Chat.tsx'), 'utf8') as string
    // Message-text span: `data-testid={`message-text-${m.id}`}` immediately
    // followed by its className. Must contain `select-text`.
    expect(chat).toMatch(/data-testid=\{`message-text-\$\{m\.id\}`\}[\s\S]*?className="[^"]*\bselect-text\b/)
    // Time/delivery span: the sibling span containing the <time> element.
    // Its className is a template literal that includes `self-end text-xs` and
    // the isMe-conditional text colors. Match a `<span className={\`...\`}>`
    // that carries BOTH `self-end` (the load-bearing identifier for this
    // particular span) and `select-none`. Token order inside the literal is
    // not load-bearing — Prettier may reorder Tailwind utilities.
    const timeSpanMatch = chat.match(/<span\s+className=\{`([^`]*)`\}/g) ?? []
    const timeSpanClass = timeSpanMatch.find((s) => /\bself-end\b/.test(s))
    expect(timeSpanClass, 'time/delivery span (carrying `self-end`) must exist in Chat.tsx').toBeTruthy()
    expect(timeSpanClass!).toMatch(/\bselect-none\b/)
  })

  it('Home row-menu "Copy transcript" item is not viewport-gated, so small-screen users keep a one-click copy path (IMPRV-021)', () => {
    const home = readFileSync(resolve(projectRoot, 'src/screens/Home.tsx'), 'utf8') as string
    // Locate the menuitem button by its label, walk back to capture its
    // className (template-literal or quoted). The item's class string must
    // not contain `hidden` or any `sm:hidden` / `max-sm:hidden` viewport-hide
    // tokens that would mirror the Chat toolbar rule from IMPRV-021.
    const tmpl = home.match(/<button\b[\s\S]*?className=\{`([^`]*)`\}[\s\S]*?>\s*Copy transcript\s*</)
    const quoted = home.match(/<button\b[\s\S]*?className="([^"]*)"[\s\S]*?>\s*Copy transcript\s*</)
    const itemClass = tmpl?.[1] ?? quoted?.[1]
    expect(itemClass, 'Copy transcript menu item must exist in Home.tsx').toBeTruthy()
    expect(itemClass!).not.toMatch(/\bhidden\b/)
    expect(itemClass!).not.toMatch(/\bsm:hidden\b/)
    expect(itemClass!).not.toMatch(/\bmax-sm:hidden\b/)
  })
})
