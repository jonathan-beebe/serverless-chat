import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Spinner } from './Spinner'

describe('Spinner primitive', () => {
  it('renders an SVG marked aria-hidden so AT does not double-announce alongside the live region', () => {
    const { container } = render(<Spinner />)
    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()
    expect(svg!.getAttribute('aria-hidden')).toBe('true')
  })

  it('applies the animate-spin utility so motion is visible', () => {
    const { container } = render(<Spinner />)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('class')).toMatch(/animate-spin/)
  })

  it('defaults to h-4 w-4 sizing so it tracks body text x-height', () => {
    const { container } = render(<Spinner />)
    const svg = container.querySelector('svg')!
    const cls = svg.getAttribute('class') ?? ''
    expect(cls).toMatch(/h-4/)
    expect(cls).toMatch(/w-4/)
  })

  it('appends caller-supplied className', () => {
    const { container } = render(<Spinner className="text-sky-700" />)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('class')).toMatch(/text-sky-700/)
  })

  it('uses currentColor for the stroke so it picks up the parent text color (dark mode safe)', () => {
    const { container } = render(<Spinner />)
    const strokes = Array.from(container.querySelectorAll('[stroke]')).map((el) => el.getAttribute('stroke'))
    expect(strokes.length).toBeGreaterThan(0)
    strokes.forEach((s) => expect(s).toBe('currentColor'))
  })
})
