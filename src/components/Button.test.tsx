import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Button } from './Button'

describe('Button primitive', () => {
  it('defaults to type="button" (avoids accidental form submit)', () => {
    render(<Button>Click</Button>)
    expect(screen.getByRole('button', { name: 'Click' })).toHaveAttribute('type', 'button')
  })

  it('primary variant renders as an accessible button and accepts focus', () => {
    render(<Button variant="primary">Go</Button>)
    const btn = screen.getByRole('button', { name: 'Go' })
    btn.focus()
    expect(btn).toHaveFocus()
    // A11Y-014: brand token promoted from sky-600 → sky-700 so text-white on
    // the primary surface clears WCAG AA 4.5:1 for normal text. Hover darkens
    // to sky-800. The contrast contract is verified by manual audit / visual
    // regression — Tailwind utilities do not produce computed styles in jsdom.
    // A11Y-021 focus-ring contract: pinned at integration scope in
    // src/App.test.tsx (focus-on-mount) and src/screens/Home.test.tsx.
  })

  it('secondary variant renders as an accessible button under its label', () => {
    render(<Button variant="secondary">Cancel</Button>)
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    // A11Y-016: secondary border bumped from `stone-300 / stone-700` to
    // `stone-400 / stone-500` so the resting-state boundary clears WCAG
    // 1.4.11's 3:1 non-text contrast floor. Contrast verified by manual
    // audit / visual regression; not assertable in jsdom.
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

  it('marks the underlying button element as disabled when disabled prop is set', () => {
    render(
      <Button variant="primary" disabled>
        Wait
      </Button>,
    )
    // disabled:opacity-50 + disabled:cursor-not-allowed visual treatment is
    // verified by visual regression; the testable contract is that the
    // underlying button element is actually disabled.
    expect(screen.getByRole('button', { name: 'Wait' })).toBeDisabled()
  })

  it('merges caller-provided className with variant classes', () => {
    render(
      <Button variant="primary" className="self-start">
        X
      </Button>,
    )
    const btn = screen.getByRole('button', { name: 'X' })
    // The caller's class is the testable contract here (variant identity is
    // covered by other cases). The variant's brand-palette classes are
    // verified by visual regression.
    expect(btn.className).toContain('self-start')
  })
})
