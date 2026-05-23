import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Button } from './Button'

describe('Button primitive', () => {
  it('defaults to type="button" (avoids accidental form submit)', () => {
    render(<Button>Click</Button>)
    expect(screen.getByRole('button', { name: 'Click' })).toHaveAttribute('type', 'button')
  })

  it('primary variant carries sky-700 background (AA-contrast brand token) + light/dark treatment', () => {
    render(<Button variant="primary">Go</Button>)
    const btn = screen.getByRole('button', { name: 'Go' })
    // A11Y-014: brand token promoted from sky-600 → sky-700 so text-white on
    // the primary surface clears WCAG AA 4.5:1 for normal text. Hover darkens
    // (sky-800) instead of lightens so the hover state also clears AA.
    expect(btn.className).toMatch(/bg-sky-700/)
    expect(btn.className).toMatch(/hover:bg-sky-800/)
    expect(btn.className).toMatch(/text-white/)
    expect(btn.className).toMatch(/focus-visible:ring-2/)
  })

  it('secondary variant carries slate border + dark mode classes', () => {
    render(<Button variant="secondary">Cancel</Button>)
    const btn = screen.getByRole('button', { name: 'Cancel' })
    // A11Y-016: bumped from `slate-300 / slate-700` to `slate-400 / slate-500`
    // so the resting-state border clears WCAG 1.4.11's 3:1 non-text contrast
    // floor (the boundary is the button's only visual delimiter).
    expect(btn.className).toMatch(/border-slate-400/)
    expect(btn.className).toMatch(/dark:border-slate-500/)
  })

  it('size="sm" uses tighter padding than size="md"', () => {
    const { rerender } = render(
      <Button variant="primary" size="sm">
        A
      </Button>,
    )
    const sm = screen.getByRole('button', { name: 'A' }).className
    rerender(
      <Button variant="primary" size="md">
        A
      </Button>,
    )
    const md = screen.getByRole('button', { name: 'A' }).className
    expect(sm).not.toBe(md)
  })

  it('builds in disabled cursor + opacity styling so callers do not repeat it', () => {
    render(
      <Button variant="primary" disabled>
        Wait
      </Button>,
    )
    const btn = screen.getByRole('button', { name: 'Wait' })
    expect(btn).toBeDisabled()
    expect(btn.className).toMatch(/disabled:opacity-50/)
    expect(btn.className).toMatch(/disabled:cursor-not-allowed/)
  })

  it('merges caller-provided className with variant classes', () => {
    render(
      <Button variant="primary" className="self-start">
        X
      </Button>,
    )
    const btn = screen.getByRole('button', { name: 'X' })
    expect(btn.className).toMatch(/self-start/)
    expect(btn.className).toMatch(/bg-sky-700/)
  })
})
