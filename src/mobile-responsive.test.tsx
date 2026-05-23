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

  it('connected Offerer/Joiner branches size with `100dvh` (not `100vh`) so the chat shrinks under the soft keyboard', () => {
    const offerer = readFileSync(resolve(projectRoot, 'src/screens/Offerer.tsx'), 'utf8') as string
    const joiner = readFileSync(resolve(projectRoot, 'src/screens/Joiner.tsx'), 'utf8') as string
    // The connected branch in each screen uses a calc() against the viewport
    // height. After this ticket it must use dvh, not vh.
    expect(offerer).toMatch(/calc\(100dvh-3rem\)/)
    expect(joiner).toMatch(/calc\(100dvh-3rem\)/)
    expect(offerer).not.toMatch(/calc\(100vh-3rem\)/)
    expect(joiner).not.toMatch(/calc\(100vh-3rem\)/)
  })
})
