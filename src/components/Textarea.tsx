import { forwardRef, type TextareaHTMLAttributes } from 'react'

type Props = TextareaHTMLAttributes<HTMLTextAreaElement>

// A11Y-016: form/control borders need ≥ 3:1 contrast against the page surface
// to satisfy WCAG 1.4.11 Non-text Contrast. `slate-300` on white (~1.48:1) and
// `slate-700` on `slate-900` (~1.75:1) both failed. Bumped to `slate-400`
// (≈3.00:1 vs white) and `slate-500` (≈3.45:1 vs `slate-900`). Decorative
// borders (Divider, Home <details>, DesignSystem swatches, Section rule) stay
// on `slate-300 / slate-700` — 1.4.11 only applies to UI components.
const base =
  'w-full rounded-md border border-slate-400 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:border-sky-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 dark:border-slate-500 dark:bg-slate-900 dark:text-slate-100'

export const Textarea = forwardRef<HTMLTextAreaElement, Props>(function Textarea({ className, ...rest }, ref) {
  const composed = [base, className].filter(Boolean).join(' ')
  return <textarea ref={ref} className={composed} {...rest} />
})
