import type { ReactNode } from 'react'

interface Props {
  children?: ReactNode
  className?: string
}

const flank = 'flex-1 border-t border-stone-300 dark:border-stone-700'

export function Divider({ children, className }: Props) {
  const composed = ['flex items-center gap-3 text-xs text-stone-600 dark:text-stone-400', className]
    .filter(Boolean)
    .join(' ')
  return (
    <div className={composed}>
      <span aria-hidden="true" className={flank} />
      {children}
      <span aria-hidden="true" className={flank} />
    </div>
  )
}
