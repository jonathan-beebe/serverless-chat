import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Home } from './screens/Home'

// Node built-ins; @types/node isn't in this project's `types`, so suppress the type-only complaint.
// The test runner is vitest-in-node, so these resolve fine at runtime.
// @ts-expect-error untyped node built-in
import { readFileSync } from 'node:fs'
// @ts-expect-error untyped node built-in
import { dirname, resolve } from 'node:path'
// @ts-expect-error untyped node built-in
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(here, '..')

describe('FEAT-001 dark mode wiring', () => {
  it('index.css declares color-scheme and gates dark surfaces behind prefers-color-scheme', () => {
    const css = readFileSync(resolve(projectRoot, 'src/index.css'), 'utf8') as string
    // color-scheme: light dark — lets the UA pick native form-control / scrollbar styles per OS pref.
    expect(css).toMatch(/color-scheme:\s*light\s+dark/)
    // Dark body colors live behind a media query, not at the top level — otherwise light mode flashes dark.
    expect(css).toMatch(/@media\s*\(prefers-color-scheme:\s*dark\)/)
  })

  it('index.html ships dual <meta name="theme-color"> tags so browser chrome tracks the OS theme', () => {
    const html = readFileSync(resolve(projectRoot, 'index.html'), 'utf8') as string
    expect(html).toMatch(/<meta\s+name="theme-color"[^>]*media="\(prefers-color-scheme:\s*light\)"/)
    expect(html).toMatch(/<meta\s+name="theme-color"[^>]*media="\(prefers-color-scheme:\s*dark\)"/)
  })

  it('Home renders surface classes that respond to dark mode (Tailwind dark: variant)', () => {
    render(<Home onStart={() => {}} />)
    const heading = screen.getByRole('heading', { name: /serverless p2p chat/i })
    // The heading carries both a light-mode text class and a dark-mode override.
    expect(heading.className).toMatch(/\bdark:text-/)
  })
})
