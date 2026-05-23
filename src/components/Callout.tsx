import type { AriaRole, HTMLAttributes, ReactNode } from 'react'

type Variant = 'info' | 'success' | 'warning' | 'error'

interface Props extends Omit<HTMLAttributes<HTMLParagraphElement>, 'role'> {
  variant: Variant
  role?: AriaRole
  children?: ReactNode
}

const variants: Record<Variant, string> = {
  info: 'text-sm text-stone-600 dark:text-stone-400',
  success: 'text-xs font-medium text-emerald-700 dark:text-emerald-400',
  warning: 'text-amber-700 dark:text-amber-300',
  error:
    'rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-700 dark:bg-red-900/40 dark:text-red-200',
}

export function Callout({ variant, role, className, children, ...rest }: Props) {
  const composed = [variants[variant], className].filter(Boolean).join(' ')
  return (
    <p role={role} className={composed} {...rest}>
      {children}
    </p>
  )
}
