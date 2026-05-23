import { forwardRef, type TextareaHTMLAttributes } from 'react'

type Props = TextareaHTMLAttributes<HTMLTextAreaElement>

// A11Y-016: form/control borders need ≥ 3:1 contrast against the page surface
// to satisfy WCAG 1.4.11 Non-text Contrast. `stone-300` on white (~1.48:1) and
// `stone-700` on `stone-900` (~1.75:1) both failed. Bumped to `stone-400`
// (≈3.00:1 vs white) and `stone-500` (≈3.45:1 vs `stone-900`). Decorative
// borders (Divider, Home <details>, DesignSystem swatches, Section rule) stay
// on `stone-300 / stone-700` — 1.4.11 only applies to UI components.
const base =
  'w-full rounded-md border border-stone-400 bg-white px-3 py-2 text-sm text-stone-900 focus-visible:border-sky-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 dark:border-stone-500 dark:bg-stone-900 dark:text-stone-100'

export const Textarea = forwardRef<HTMLTextAreaElement, Props>(function Textarea({ className, ...rest }, ref) {
  const composed = [base, className].filter(Boolean).join(' ')
  return <textarea ref={ref} className={composed} {...rest} />
})
