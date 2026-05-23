import type { ReactNode } from 'react'

interface Props {
  children?: ReactNode
}

// The wrapping <p role="status" aria-live="polite"> stays mounted across
// re-renders even when `children` is empty — screen readers only announce
// content changes on a *stable* live region. Conditionally rendering the
// wrapper would dismount/remount it on each state transition and silence
// the announcements.
export function LiveRegion({ children }: Props) {
  return (
    <p role="status" aria-live="polite" className="sr-only">
      {children}
    </p>
  )
}
