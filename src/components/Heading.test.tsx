import { createRef } from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Heading } from './Heading'

describe('Heading primitive', () => {
  it('renders the tag matching `level`', () => {
    const { rerender } = render(<Heading level={1}>One</Heading>)
    expect(screen.getByRole('heading', { name: 'One', level: 1 })).toBeInTheDocument()

    rerender(<Heading level={2}>Two</Heading>)
    expect(screen.getByRole('heading', { name: 'Two', level: 2 })).toBeInTheDocument()

    rerender(<Heading level={3}>Three</Heading>)
    expect(screen.getByRole('heading', { name: 'Three', level: 3 })).toBeInTheDocument()
  })

  it('carries tabIndex={-1} + focus:outline-none so useFocusOnMount can park on it', () => {
    render(<Heading level={1}>Home</Heading>)
    const h = screen.getByRole('heading', { name: 'Home' })
    expect(h).toHaveAttribute('tabIndex', '-1')
    expect(h.className).toMatch(/focus:outline-none/)
  })

  it('carries both light and dark text classes', () => {
    render(<Heading level={1}>Home</Heading>)
    const h = screen.getByRole('heading', { name: 'Home' })
    expect(h.className).toMatch(/text-slate-900/)
    expect(h.className).toMatch(/dark:text-slate-100/)
  })

  it('forwards refs to the underlying heading element', () => {
    const ref = createRef<HTMLHeadingElement>()
    render(
      <Heading level={1} ref={ref}>
        Hello
      </Heading>,
    )
    expect(ref.current).not.toBeNull()
    expect(ref.current?.tagName).toBe('H1')
  })

  it('decouples semantic level from visual size — size="sm" with level=1 still renders as <h1>', () => {
    render(
      <Heading level={1} size="sm">
        Connected
      </Heading>,
    )
    expect(screen.getByRole('heading', { name: 'Connected', level: 1 })).toBeInTheDocument()
  })
})
