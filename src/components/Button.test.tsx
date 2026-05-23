import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Button } from './Button'

describe('Button primitive', () => {
  it('defaults to type="button" (avoids accidental form submit)', () => {
    render(<Button>Click</Button>)
    expect(screen.getByRole('button', { name: 'Click' })).toHaveAttribute('type', 'button')
  })

  it('primary variant carries sky-600 background + light/dark treatment', () => {
    render(<Button variant="primary">Go</Button>)
    const btn = screen.getByRole('button', { name: 'Go' })
    expect(btn.className).toMatch(/bg-sky-600/)
    expect(btn.className).toMatch(/text-white/)
    expect(btn.className).toMatch(/focus-visible:ring-2/)
  })

  it('secondary variant carries slate border + dark mode classes', () => {
    render(<Button variant="secondary">Cancel</Button>)
    const btn = screen.getByRole('button', { name: 'Cancel' })
    expect(btn.className).toMatch(/border-slate-300/)
    expect(btn.className).toMatch(/dark:border-slate-700/)
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
    expect(btn.className).toMatch(/bg-sky-600/)
  })
})
