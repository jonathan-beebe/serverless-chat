import { createRef } from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Heading } from './Heading'
import { ScreenChromeContext } from './ScreenChrome'

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

  it('with `as="p"` renders the heading style as a <p> so swatches do not pollute the outline (A11Y-013)', () => {
    const { container } = render(
      <Heading level={1} as="p">
        Page heading
      </Heading>,
    )
    // No heading role / no <h1> in the DOM.
    expect(screen.queryByRole('heading')).toBeNull()
    const p = container.querySelector('p')
    expect(p).not.toBeNull()
    expect(p).toHaveTextContent('Page heading')
    // Visual sizing still applied.
    expect(p?.className).toMatch(/text-3xl/)
  })

  it('demotes the semantic level by `headingLevelOffset` from ScreenChromeContext (A11Y-013)', () => {
    // Inside a showcase context with offset=1, a level=1 heading must
    // render as <h2> while keeping its level-1 visual sizing.
    render(
      <ScreenChromeContext.Provider value={{ landmark: 'region', headingLevelOffset: 1 }}>
        <Heading level={1}>Demoted</Heading>
      </ScreenChromeContext.Provider>,
    )
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
    const h2 = screen.getByRole('heading', { level: 2, name: 'Demoted' })
    expect(h2).toBeInTheDocument()
    expect(h2.className).toMatch(/text-3xl/)
  })

  it('still attaches refs after demotion so useFocusOnMount keeps working (A11Y-005 invariant)', () => {
    const ref = createRef<HTMLHeadingElement>()
    render(
      <ScreenChromeContext.Provider value={{ landmark: 'region', headingLevelOffset: 1 }}>
        <Heading level={1} ref={ref}>
          Demoted
        </Heading>
      </ScreenChromeContext.Provider>,
    )
    expect(ref.current).not.toBeNull()
    expect(ref.current?.tagName).toBe('H2')
    expect(ref.current?.tabIndex).toBe(-1)
  })
})
