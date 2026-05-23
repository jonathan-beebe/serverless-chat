import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost'
type Size = 'sm' | 'md' | 'lg'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
}

const base =
  'rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 disabled:cursor-not-allowed disabled:opacity-50'

const variants: Record<Variant, string> = {
  primary: 'bg-sky-600 text-white hover:bg-sky-500',
  secondary:
    'border border-slate-300 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800',
  ghost: 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
}

const sizes: Record<Size, string> = {
  sm: 'px-3 py-1 text-sm',
  md: 'px-4 py-2 text-sm font-medium',
  lg: 'px-5 py-2.5 text-base font-medium',
}

export function Button({ variant = 'primary', size = 'md', type, className, ...rest }: Props) {
  const composed = [base, variants[variant], sizes[size], className].filter(Boolean).join(' ')
  return <button type={type ?? 'button'} className={composed} {...rest} />
}
