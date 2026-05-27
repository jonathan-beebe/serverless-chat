// @vitest-environment node
import { describe, expect, it } from 'vitest'
// Node built-ins; @types/node isn't in this project's tsconfig `types`, so
// suppress the type-only complaint. Runtime resolution is fine.
// @ts-expect-error untyped node built-in
import { existsSync, readFileSync } from 'node:fs'
// @ts-expect-error untyped node built-in
import { dirname, resolve } from 'node:path'
// @ts-expect-error untyped node built-in
import { fileURLToPath } from 'node:url'

// IMPRV-023: assert the PWA install surface is wired up.
//
// Two narrow tests — one for the HTML head meta (iOS Add-to-Home), one for the
// vite-plugin-pwa manifest config (icons referenced exist in `public/`, which
// is what Vite copies verbatim to `dist/`). We intentionally don't shell out
// to `vite build` here; it would balloon test time for an assertion that
// `public/<icon>.png` ↔ manifest `src` agreement already covers.

const here = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(here, '..')

describe('IMPRV-023 PWA icon + iOS install meta wiring', () => {
  it('index.html declares the three iOS install meta tags', () => {
    const html = readFileSync(resolve(projectRoot, 'index.html'), 'utf8')
    expect(html, 'apple-touch-icon link required for iOS Add-to-Home').toMatch(
      /<link\s+rel="apple-touch-icon"\s+href="\/apple-touch-icon\.png"\s*\/?>/,
    )
    expect(html, 'apple-mobile-web-app-capable=yes promotes the page to standalone on iOS').toMatch(
      /<meta\s+name="apple-mobile-web-app-capable"\s+content="yes"\s*\/?>/,
    )
    expect(html, 'black-translucent matches the existing dark theme-color').toMatch(
      /<meta\s+name="apple-mobile-web-app-status-bar-style"\s+content="black-translucent"\s*\/?>/,
    )
  })

  it('every PWA manifest icon src in vite.config.js resolves to a real file in public/', () => {
    const config = readFileSync(resolve(projectRoot, 'vite.config.js'), 'utf8')
    // Pull the icons array literal out of the VitePWA manifest block. A regex
    // is fine here — the config is hand-edited and the icons block is small.
    const iconsBlock = config.match(/icons:\s*\[(?<entries>[\s\S]*?)\]/)
    expect(iconsBlock?.groups?.entries, 'manifest icons array not found in vite.config.js').toBeTruthy()
    const srcs = [...iconsBlock!.groups!.entries.matchAll(/src:\s*'([^']+)'/g)].map((m) => m[1])
    expect(srcs.length, 'expected at least one icon entry in the manifest').toBeGreaterThan(0)
    // Both standard (192/512) and maskable must exist; the maskable must NOT
    // alias the standard 512 (it needs its own safe-zone inset artwork).
    expect(srcs).toContain('pwa-192x192.png')
    expect(srcs).toContain('pwa-512x512.png')
    expect(srcs).toContain('pwa-maskable-512x512.png')
    for (const src of srcs) {
      const onDisk = resolve(projectRoot, 'public', src)
      expect(existsSync(onDisk), `manifest references public/${src} but the file is missing`).toBe(true)
    }
    // The apple-touch-icon is referenced from index.html, not the manifest,
    // but it lives next to the others and the same drift risk applies.
    expect(existsSync(resolve(projectRoot, 'public', 'apple-touch-icon.png'))).toBe(true)
  })
})
