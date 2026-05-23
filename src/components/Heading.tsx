import { forwardRef, type ReactNode } from 'react'

type Level = 1 | 2 | 3
type Size = 'sm' | 'md' | 'lg'

interface Props {
  level: Level
  size?: Size
  id?: string
  className?: string
  children?: ReactNode
}

const sizes: Record<Size, string> = {
  sm: 'text-lg font-semibold',
  md: 'text-2xl font-semibold',
  lg: 'text-3xl font-semibold tracking-tight',
}

const defaultSize: Record<Level, Size> = {
  1: 'lg',
  2: 'md',
  3: 'sm',
}

const base = 'text-slate-900 focus:outline-none dark:text-slate-100'

export const Heading = forwardRef<HTMLHeadingElement, Props>(function Heading(
  { level, size, id, className, children },
  ref,
) {
  const composed = [base, sizes[size ?? defaultSize[level]], className].filter(Boolean).join(' ')
  const props = { id, ref, tabIndex: -1, className: composed, children }
  if (level === 1) return <h1 {...props} />
  if (level === 2) return <h2 {...props} />
  return <h3 {...props} />
})
