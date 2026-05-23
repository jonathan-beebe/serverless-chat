import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { LiveRegion } from './LiveRegion'

describe('LiveRegion primitive', () => {
  it('renders a polite, visually-hidden status paragraph', () => {
    render(<LiveRegion>Connecting…</LiveRegion>)
    const el = screen.getByText('Connecting…')
    expect(el.tagName).toBe('P')
    expect(el.getAttribute('role')).toBe('status')
    expect(el.getAttribute('aria-live')).toBe('polite')
    expect(el.className).toMatch(/sr-only/)
  })

  it('keeps the SAME element across re-renders so the announcement is heard (stable identity)', () => {
    const { container, rerender } = render(<LiveRegion>One</LiveRegion>)
    const before = container.firstElementChild
    rerender(<LiveRegion>Two</LiveRegion>)
    const after = container.firstElementChild
    expect(after).toBe(before)
    expect(after?.textContent).toBe('Two')
  })

  it('renders the wrapper even when the message is empty (so the live region stays mounted)', () => {
    const { container } = render(<LiveRegion>{''}</LiveRegion>)
    const root = container.firstElementChild
    expect(root).not.toBeNull()
    expect(root?.tagName).toBe('P')
    expect(root?.getAttribute('aria-live')).toBe('polite')
  })
})
