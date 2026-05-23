import type { ButtonHTMLAttributes, Ref } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost'
type Size = 'sm' | 'md' | 'lg'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  ref?: Ref<HTMLButtonElement>
}

const base =
  'rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 disabled:cursor-not-allowed disabled:opacity-50'

const variants: Record<Variant, string> = {
  primary: 'bg-sky-700 text-white hover:bg-sky-800',
  // A11Y-016: secondary button border was `stone-300 / stone-700` against the
  // page surface — same failing 1.48 / 1.75:1 ratios as Textarea. Bumped in
  // lockstep with `Textarea` to `stone-400 / stone-500` so the button boundary
  // (its only resting-state delimiter) clears WCAG 1.4.11's 3:1 floor.
  secondary:
    'border border-stone-400 text-stone-700 hover:bg-stone-100 dark:border-stone-500 dark:text-stone-300 dark:hover:bg-stone-800',
  ghost: 'text-stone-700 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800',
}

const sizes: Record<Size, string> = {
  sm: 'px-3 py-1 text-sm',
  md: 'px-4 py-2 text-sm font-medium',
  lg: 'px-5 py-2.5 text-base font-medium',
}

export function Button({ variant = 'primary', size = 'md', type, className, ref, ...rest }: Props) {
  const composed = [base, variants[variant], sizes[size], className].filter(Boolean).join(' ')
  return <button ref={ref} type={type ?? 'button'} className={composed} {...rest} />
}
