import { forwardRef, type TextareaHTMLAttributes } from 'react'

type Props = TextareaHTMLAttributes<HTMLTextAreaElement>

const base =
  'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:border-sky-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100'

export const Textarea = forwardRef<HTMLTextAreaElement, Props>(function Textarea({ className, ...rest }, ref) {
  const composed = [base, className].filter(Boolean).join(' ')
  return <textarea ref={ref} className={composed} {...rest} />
})
