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

  it('error variant renders the supplied content', () => {
    render(<Callout variant="error">Bad</Callout>)
    expect(screen.getByText('Bad')).toBeInTheDocument()
    // A11Y-014 family: error variant uses red-300 border + red-900 /
    // dark:red-200 text tokens (Callout.tsx variants.error). Contrast
    // verified by manual audit / visual regression; not assertable in jsdom.
  })

  it('warning variant renders the supplied content (callers add text-size to fit context)', () => {
    render(<Callout variant="warning">Caution</Callout>)
    expect(screen.getByText('Caution')).toBeInTheDocument()
    // A11Y-014 family: warning variant uses amber-700 / dark:amber-300 text
    // tokens (Callout.tsx variants.warning). Contrast verified by manual
    // audit / visual regression.
  })

  it('success variant renders the supplied content', () => {
    render(<Callout variant="success">Copied!</Callout>)
    expect(screen.getByText('Copied!')).toBeInTheDocument()
    // A11Y-014 family: success variant uses emerald-700 / dark:emerald-400
    // text tokens (Callout.tsx variants.success). Contrast verified by
    // manual audit / visual regression.
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
