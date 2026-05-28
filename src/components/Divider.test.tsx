import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Divider } from './Divider'

describe('Divider primitive', () => {
  it('renders a centered label between two aria-hidden flanking lines', () => {
    const { container } = render(<Divider>Today</Divider>)
    const root = container.firstElementChild as HTMLElement
    expect(root).not.toBeNull()

    // Two `aria-hidden` flank spans bracket the label.
    const flanks = root.querySelectorAll('span[aria-hidden="true"]')
    expect(flanks.length).toBe(2)
    // The flanks render as horizontal rules (border-t in Divider.tsx); the
    // visual rule is verified by visual regression, not assertable in jsdom.

    expect(root.textContent).toBe('Today')
  })
})
