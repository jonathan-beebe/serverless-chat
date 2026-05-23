import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Callout } from './Callout'

describe('Callout primitive', () => {
  it('renders as a paragraph by default with no implicit role', () => {
    render(<Callout variant="info">Heads up</Callout>)
    const el = screen.getByText('Heads up')
    expect(el.tagName).toBe('P')
    expect(el.hasAttribute('role')).toBe(false)
  })

  it('error variant ships red light + dark classes', () => {
    render(<Callout variant="error">Bad</Callout>)
    const el = screen.getByText('Bad')
    expect(el.className).toMatch(/border-red-300/)
    expect(el.className).toMatch(/text-red-900/)
    expect(el.className).toMatch(/dark:text-red-200/)
  })

  it('warning variant ships amber classes (callers add text-size to fit context)', () => {
    render(<Callout variant="warning">Caution</Callout>)
    const el = screen.getByText('Caution')
    expect(el.className).toMatch(/text-amber-700/)
    expect(el.className).toMatch(/dark:text-amber-300/)
  })

  it('success variant ships emerald classes', () => {
    render(<Callout variant="success">Copied!</Callout>)
    const el = screen.getByText('Copied!')
    expect(el.className).toMatch(/text-emerald-700/)
    expect(el.className).toMatch(/dark:text-emerald-400/)
  })

  it('caller can opt into role="alert" for interrupting announcements', () => {
    render(
      <Callout variant="error" role="alert">
        Oops
      </Callout>,
    )
    const el = screen.getByRole('alert')
    expect(el.textContent).toBe('Oops')
  })
})
