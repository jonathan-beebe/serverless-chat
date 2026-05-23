import { forwardRef, type ReactNode } from 'react'
import { useScreenChrome } from './ScreenChrome'

type Level = 1 | 2 | 3
type Size = 'sm' | 'md' | 'lg'
// Visual styles only — used to render the level-1/level-2 typography swatches
// in the Design System without polluting the document outline with extra
// headings. Defaults to undefined (a real heading is rendered).
type As = 'p' | 'div' | 'span'

interface Props {
  level: Level
  size?: Size
  // Render with the size styling of a heading but using a non-heading tag.
  // Used by the showcase to display level-1/level-2 typography swatches.
  as?: As
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

// Clamp the effective heading level into the 1-6 range that HTML supports.
// We only ever render h1/h2/h3 in this app — the offset can push level=3 to
// level=4 if a showcase nests two levels deep, but we cap at 6 to keep the
// output valid.
function clampLevel(level: number): 1 | 2 | 3 | 4 | 5 | 6 {
  const next = Math.max(1, Math.min(6, level))
  return next as 1 | 2 | 3 | 4 | 5 | 6
}

export const Heading = forwardRef<HTMLHeadingElement, Props>(function Heading(
  { level, size, as, id, className, children },
  ref,
) {
  const { headingLevelOffset } = useScreenChrome()
  // Visual size always tracks the authored level (so a "page h1" still looks
  // like a page h1 even when it's demoted to <h2> inside the showcase). The
  // semantic level is the only thing the offset changes.
  const composed = [base, sizes[size ?? defaultSize[level]], className].filter(Boolean).join(' ')
  const props = { id, ref, tabIndex: -1, className: composed, children }

  // `as` short-circuits the heading branch entirely — used by the showcase
  // Typography swatches to display the level-1/level-2 visual style without
  // emitting a real <h1>/<h2>.
  if (as === 'p') return <p {...props} />
  if (as === 'div') return <div {...props} />
  if (as === 'span') return <span {...props} />

  const effective = clampLevel(level + headingLevelOffset)
  if (effective === 1) return <h1 {...props} />
  if (effective === 2) return <h2 {...props} />
  if (effective === 3) return <h3 {...props} />
  if (effective === 4) return <h4 {...props} />
  if (effective === 5) return <h5 {...props} />
  return <h6 {...props} />
})
