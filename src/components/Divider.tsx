import type { ReactNode } from 'react'

interface Props {
  children?: ReactNode
  className?: string
}

const flank = 'flex-1 border-t border-slate-300 dark:border-slate-700'

export function Divider({ children, className }: Props) {
  const composed = ['flex items-center gap-3 text-xs text-slate-600 dark:text-slate-400', className]
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
