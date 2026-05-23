import { createRef } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Textarea } from './Textarea'

describe('Textarea primitive', () => {
  it('renders a native <textarea> with the slate border + sky focus ring styling', () => {
    render(<Textarea aria-label="msg" />)
    const el = screen.getByLabelText('msg')
    expect(el.tagName).toBe('TEXTAREA')
    expect(el.className).toMatch(/border-slate-300/)
    expect(el.className).toMatch(/focus-visible:ring-sky-400/)
    expect(el.className).toMatch(/dark:bg-slate-900/)
  })

  it('forwards refs to the underlying <textarea>', () => {
    const ref = createRef<HTMLTextAreaElement>()
    render(<Textarea aria-label="msg" ref={ref} />)
    expect(ref.current).not.toBeNull()
    expect(ref.current?.tagName).toBe('TEXTAREA')
  })

  it('passes native props through (rows, value, id, onChange)', () => {
    let observed = ''
    render(
      <Textarea
        aria-label="msg"
        id="t"
        rows={4}
        value="abc"
        onChange={(e) => {
          observed = e.target.value
        }}
      />,
    )
    const el = screen.getByLabelText('msg') as HTMLTextAreaElement
    expect(el).toHaveAttribute('id', 't')
    expect(el.rows).toBe(4)
    expect(el.value).toBe('abc')
    fireEvent.change(el, { target: { value: 'xyz' } })
    expect(observed).toBe('xyz')
  })

  it('merges caller-provided className with the base styling', () => {
    render(<Textarea aria-label="msg" className="font-mono text-xs" />)
    const el = screen.getByLabelText('msg')
    expect(el.className).toMatch(/font-mono/)
    expect(el.className).toMatch(/text-xs/)
    // Base styling is still present.
    expect(el.className).toMatch(/border-slate-300/)
  })
})
