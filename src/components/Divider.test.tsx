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
    flanks.forEach((flank) => {
      expect(flank.className).toMatch(/border-t/)
    })

    expect(root.textContent).toBe('Today')
  })
})
