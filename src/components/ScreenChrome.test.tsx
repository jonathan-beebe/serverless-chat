import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ScreenChromeContext, ScreenContainer } from './ScreenChrome'
import { parseCssFile } from '../__helpers__/cssRules'
// @ts-expect-error untyped node built-in
import { dirname, resolve } from 'node:path'
// @ts-expect-error untyped node built-in
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(here, '../..')
const CSS_DECLS = parseCssFile(resolve(projectRoot, 'src/index.css'))

// BUG-010: IMPRV-024 originally placed safe-area-inset MARGIN utilities on the
// ScreenContainer root (mt-/ml-/mr-[env(safe-area-inset-*)]). Tailwind v4 emits
// `margin-left`/`margin-right` longhand AFTER `margin-inline` (the shorthand
// `mx-auto` compiles to), so the longhand inset utilities won the cascade and
// killed every screen's wide-screen `mx-auto` centering — in browser tabs the
// inset resolves to `0px` longhand and clamps the layout flush-left.
//
// Fix: move the inset to `body` in raw CSS. body's padding-block-start /
// padding-inline-* push #root inside the safe area, so every screen inherits
// the inset without any utility on ScreenContainer fighting consumer classes.

describe('ScreenContainer (BUG-010 safe-area moved to body)', () => {
  it('renders the default <main> root WITHOUT any safe-area-inset margin utilities — the inset now lives on body, so consumer `mx-auto` is no longer fought by longhand margins (BUG-010)', () => {
    render(
      <ScreenContainer label="Home" className="mx-auto max-w-xl px-4 py-12">
        <h1>Home</h1>
      </ScreenContainer>,
    )
    const main = screen.getByRole('main')
    const className = main.className
    expect(className).not.toMatch(/\bmt-\[env\(safe-area-inset/)
    expect(className).not.toMatch(/\bml-\[env\(safe-area-inset/)
    expect(className).not.toMatch(/\bmr-\[env\(safe-area-inset/)
    expect(className).not.toMatch(/safe-area-inset/)
    // Consumer classes must pass through untouched — mx-auto in particular,
    // which is the centering utility BUG-010 restores.
    expect(className).toMatch(/\bmx-auto\b/)
    expect(className).toMatch(/\bmax-w-xl\b/)
    expect(className).toMatch(/\bpx-4\b/)
    expect(className).toMatch(/\bpy-12\b/)
  })

  it('renders the region branch WITHOUT safe-area-inset margin utilities too — the showcase still inherits the inset through body (BUG-010)', () => {
    render(
      <ScreenChromeContext.Provider value={{ landmark: 'region', headingLevelOffset: 1 }}>
        <ScreenContainer label="Home preview" className="mx-auto max-w-xl px-4 py-12">
          <h2>Home</h2>
        </ScreenContainer>
      </ScreenChromeContext.Provider>,
    )
    const region = screen.getByRole('region', { name: 'Home preview' })
    const className = region.className
    expect(className).not.toMatch(/safe-area-inset/)
    expect(className).toMatch(/\bmx-auto\b/)
  })

  it('index.css declares `body { padding-top: env(safe-area-inset-top) }` so the notch is cleared at the document root (BUG-010, replaces IMPRV-024 utility)', () => {
    const match = CSS_DECLS.find(
      (d) =>
        d.media === null &&
        /\bbody\b/.test(d.selector) &&
        d.prop === 'padding-top' &&
        /env\(\s*safe-area-inset-top\s*\)/.test(d.value),
    )
    expect(match, 'expected `body { padding-top: env(safe-area-inset-top) }` in index.css').toBeTruthy()
  })

  it('index.css declares `body { padding-left: env(safe-area-inset-left) }` and `padding-right: env(safe-area-inset-right)` so the rounded landscape edges are cleared (BUG-010, replaces IMPRV-024 utilities)', () => {
    const left = CSS_DECLS.find(
      (d) =>
        d.media === null &&
        /\bbody\b/.test(d.selector) &&
        d.prop === 'padding-left' &&
        /env\(\s*safe-area-inset-left\s*\)/.test(d.value),
    )
    expect(left, 'expected `body { padding-left: env(safe-area-inset-left) }` in index.css').toBeTruthy()
    const right = CSS_DECLS.find(
      (d) =>
        d.media === null &&
        /\bbody\b/.test(d.selector) &&
        d.prop === 'padding-right' &&
        /env\(\s*safe-area-inset-right\s*\)/.test(d.value),
    )
    expect(right, 'expected `body { padding-right: env(safe-area-inset-right) }` in index.css').toBeTruthy()
  })

  it('index.css does NOT apply a bottom safe-area-inset on body — the connected chat owns its own bottom inset on the wrapper and the UpdatePrompt banner owns its own; doing it on body would double-count (BUG-010 preserves IMPRV-024 "pick one" rule)', () => {
    const match = CSS_DECLS.find(
      (d) =>
        d.media === null &&
        /\bbody\b/.test(d.selector) &&
        d.prop === 'padding-bottom' &&
        /safe-area-inset-bottom/.test(d.value),
    )
    expect(match).toBeUndefined()
  })
})
