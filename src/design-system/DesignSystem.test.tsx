import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DesignSystem } from './DesignSystem'

describe('DesignSystem showcase', () => {
  it('renders the page heading + section headings (Typography, Color, Atoms, Molecules, Organisms, Screen previews)', () => {
    render(<DesignSystem />)

    expect(screen.getByRole('heading', { level: 1, name: /design system/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: /typography/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: /color/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: /atoms/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: /molecules/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: /organisms/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: /screen previews/i })).toBeInTheDocument()
  })

  it('renders a theme toggle group with System / Light / Dark choices, defaulting to System', () => {
    render(<DesignSystem />)
    const group = screen.getByRole('group', { name: /theme/i })
    expect(group).toBeInTheDocument()

    const system = screen.getByRole('button', { name: /^system$/i })
    const light = screen.getByRole('button', { name: /^light$/i })
    const dark = screen.getByRole('button', { name: /^dark$/i })

    expect(system).toHaveAttribute('aria-pressed', 'true')
    expect(light).toHaveAttribute('aria-pressed', 'false')
    expect(dark).toHaveAttribute('aria-pressed', 'false')
  })

  it('applies a `.dark` class to the showcase root when the Dark toggle is active', () => {
    const { container } = render(<DesignSystem />)
    const root = container.firstElementChild as HTMLElement
    expect(root.classList.contains('dark')).toBe(false)
    expect(root.classList.contains('light')).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: /^dark$/i }))
    expect(root.classList.contains('dark')).toBe(true)
    expect(root.classList.contains('light')).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: /^light$/i }))
    expect(root.classList.contains('light')).toBe(true)
    expect(root.classList.contains('dark')).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: /^system$/i }))
    expect(root.classList.contains('dark')).toBe(false)
    expect(root.classList.contains('light')).toBe(false)
  })

  it('renders an interactive Chat organism that appends to local state on send (no peer needed)', () => {
    render(<DesignSystem />)

    // Showcase wires the Chat composer to local state so reviewers can type without a peer.
    const composer = screen.getByLabelText(/^message$/i) as HTMLTextAreaElement
    fireEvent.change(composer, { target: { value: 'showcase message' } })
    fireEvent.keyDown(composer, { key: 'Enter' })

    // The new message should appear in the transcript.
    expect(screen.getByText('showcase message')).toBeInTheDocument()
  })
})
