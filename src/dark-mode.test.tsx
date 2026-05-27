import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Home } from './screens/Home'
import { renderWithProviders } from './test-utils'
import { parseCssFile } from './__helpers__/cssRules'

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

// RFCTR-002: share the parsed `index.css` AST with mobile-responsive's helper
// shape so dark-mode assertions don't care about formatter ordering either.
const CSS_DECLS = parseCssFile(resolve(projectRoot, 'src/index.css'))

describe('FEAT-001 dark mode wiring', () => {
  it('index.css declares color-scheme and gates dark surfaces behind prefers-color-scheme', () => {
    // `color-scheme: light dark` — lets the UA pick native form-control /
    // scrollbar styles per OS pref. Lives on `html` outside any media query.
    const colorScheme = CSS_DECLS.find(
      (d) => d.media === null && d.prop === 'color-scheme' && /\bhtml\b/.test(d.selector),
    )
    expect(colorScheme, 'expected `html { color-scheme: ... }` in index.css').toBeTruthy()
    expect(colorScheme!.value).toMatch(/light\s+dark/)
    // Dark body colors live behind a media query, not at the top level —
    // otherwise light mode flashes dark.
    const darkBody = CSS_DECLS.find(
      (d) => d.media !== null && /prefers-color-scheme:\s*dark/.test(d.media) && /\bbody\b/.test(d.selector),
    )
    expect(darkBody, 'expected at least one body declaration under @media (prefers-color-scheme: dark)').toBeTruthy()
  })

  it('index.html ships dual <meta name="theme-color"> tags so browser chrome tracks the OS theme', () => {
    // HTML `<meta>` tags don't shuffle the way Tailwind utilities do — file
    // scan is the right shape (category b, HTML side).
    const html = readFileSync(resolve(projectRoot, 'index.html'), 'utf8') as string
    expect(html).toMatch(/<meta\s+name="theme-color"[^>]*media="\(prefers-color-scheme:\s*light\)"/)
    expect(html).toMatch(/<meta\s+name="theme-color"[^>]*media="\(prefers-color-scheme:\s*dark\)"/)
  })

  it('Home renders surface classes that respond to dark mode (Tailwind dark: variant)', () => {
    // ARCH-001: Home now reads from SessionContext + react-router. Use the
    // shared provider helper so this test exercises the real component tree
    // instead of a hand-rolled stub.
    renderWithProviders(<Home />)
    const heading = screen.getByRole('heading', { name: /serverless p2p chat/i })
    // The heading carries both a light-mode text class and a dark-mode override.
    expect(heading.className).toMatch(/\bdark:text-/)
  })
})
