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

  it('connected Offerer/Joiner branches consume `--vvh` so the chat tracks the visual viewport when the iOS soft keyboard opens (IMPRV-017)', () => {
    const offerer = readFileSync(resolve(projectRoot, 'src/screens/Offerer.tsx'), 'utf8') as string
    const joiner = readFileSync(resolve(projectRoot, 'src/screens/Joiner.tsx'), 'utf8') as string
    // The connected branch in each screen sizes against the `--vvh` custom
    // property (set by `useVisualViewportHeight` when supported, falling
    // back to `100dvh` via `:root` in index.css when not).
    expect(offerer).toMatch(/calc\(var\(--vvh\)-3rem\)/)
    expect(joiner).toMatch(/calc\(var\(--vvh\)-3rem\)/)
    // Negative guards: the pre-IMPRV-017 shapes must be fully replaced.
    expect(offerer).not.toMatch(/h-\[calc\(100dvh-3rem\)\]/)
    expect(joiner).not.toMatch(/h-\[calc\(100dvh-3rem\)\]/)
    expect(offerer).not.toMatch(/calc\(100vh-3rem\)/)
    expect(joiner).not.toMatch(/calc\(100vh-3rem\)/)
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
})
