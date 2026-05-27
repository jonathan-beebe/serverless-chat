import { describe, expect, it } from 'vitest'

// Node built-ins; @types/node isn't in this project's `types`, so suppress the type-only complaint.
// The test runner is vitest-in-node, so these resolve fine at runtime.
// @ts-expect-error untyped node built-in
import { readdirSync, readFileSync, statSync } from 'node:fs'
// @ts-expect-error untyped node built-in
import { dirname, join, resolve } from 'node:path'
// @ts-expect-error untyped node built-in
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(here, '..')

function walk(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir) as string[]) {
    const p = join(dir, name)
    const s = statSync(p)
    if (s.isDirectory()) out.push(...walk(p))
    else out.push(p)
  }
  return out
}

describe('FEAT-005 system-only fonts', () => {
  it('src/index.css does not hardcode a font-family stack on body (relies on Tailwind v4 preflight)', () => {
    // RFCTR-002 keeps this as file-content: the assertion is an absence test
    // over the entire stylesheet — "no `font-family:` declaration anywhere".
    // Behavior-shape would require asserting computed style on a rendered
    // element, which can't catch a stray declaration on, say, `.preview-card`.
    // Source scan is the right shape.
    const css = readFileSync(resolve(projectRoot, 'src/index.css'), 'utf8') as string
    // Strip /* … */ blocks so we only inspect declarations, not the comment
    // that explains *why* we don't declare a font-family here.
    const declarations = css.replace(/\/\*[\s\S]*?\*\//g, '')
    // Pin the rule: no `font-family:` declaration anywhere in the stylesheet.
    expect(declarations).not.toMatch(/font-family\s*:/i)
    // `Roboto` was in the previous explicit stack and is a useful canary for
    // accidental reintroduction (not in Tailwind v4's default `--font-sans`).
    expect(declarations).not.toMatch(/\bRoboto\b/)
  })

  it('index.html does not link to any font CDN', () => {
    // RFCTR-002 keeps this as file-content: absence test against three
    // specific hostnames in the HTML head. No rendered surface exposes
    // `<link rel="stylesheet" href="https://fonts.googleapis.com/...">` as a
    // behavior, and the meaningful failure is "a future PR added it back" —
    // exactly what a substring scan catches.
    const html = readFileSync(resolve(projectRoot, 'index.html'), 'utf8') as string
    expect(html).not.toMatch(/fonts\.googleapis\.com/)
    expect(html).not.toMatch(/fonts\.gstatic\.com/)
    expect(html).not.toMatch(/use\.typekit\.net/)
  })

  it('no @font-face declarations exist under src/ or public/', () => {
    // RFCTR-002 keeps this as file-content: absence test over the whole src/
    // + public/ tree. The assertion is "this declaration appears in zero
    // files" — there is no rendered surface that exposes "did any stylesheet
    // anywhere in the repo declare @font-face?".
    // Scan stylesheet sources only — `@font-face` is a CSS rule, and bringing
    // .tsx into scope would false-positive on this very test file's regex.
    const files = [...walk(resolve(projectRoot, 'src')), ...walk(resolve(projectRoot, 'public'))]
    const offenders = files
      .filter((f: string) => /\.(css|scss|sass|less)$/.test(f))
      .filter((f: string) => /@font-face/i.test(readFileSync(f, 'utf8') as string))
    expect(offenders).toEqual([])
  })
})
