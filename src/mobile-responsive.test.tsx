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

  it('connected Offerer/Joiner branches use asymmetric vertical padding (`pt-6 pb-1`) so the composer sits ~4px above the visual-viewport bottom (IMPRV-020)', () => {
    const offerer = readFileSync(resolve(projectRoot, 'src/screens/Offerer.tsx'), 'utf8') as string
    const joiner = readFileSync(resolve(projectRoot, 'src/screens/Joiner.tsx'), 'utf8') as string
    // Match the connected `ScreenContainer` className block (multi-line tolerant)
    // and assert both axes — `pt-6` keeps the header breathing room, `pb-1`
    // collapses the dead space below the composer.
    expect(offerer).toMatch(/label="Connected"[\s\S]*?className="[^"]*\bpt-6\b[^"]*"/)
    expect(offerer).toMatch(/label="Connected"[\s\S]*?className="[^"]*\bpb-1\b[^"]*"/)
    expect(joiner).toMatch(/label="Connected"[\s\S]*?className="[^"]*\bpt-6\b[^"]*"/)
    expect(joiner).toMatch(/label="Connected"[\s\S]*?className="[^"]*\bpb-1\b[^"]*"/)
    // Negative guard: the symmetric `py-6` shape from FEAT-013 must be gone
    // from the connected branches.
    expect(offerer).not.toMatch(/label="Connected"[\s\S]*?className="[^"]*\bpy-6\b[^"]*"/)
    expect(joiner).not.toMatch(/label="Connected"[\s\S]*?className="[^"]*\bpy-6\b[^"]*"/)
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
