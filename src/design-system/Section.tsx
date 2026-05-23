import type { ReactNode } from 'react'
import { Heading } from '../components/Heading'

interface Props {
  title: string
  description?: string
  children: ReactNode
}

export function Section({ title, description, children }: Props) {
  return (
    <section className="flex flex-col gap-4 border-t border-slate-300 pt-6 dark:border-slate-700">
      <div>
        <Heading level={2} size="md">
          {title}
        </Heading>
        {description && <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{description}</p>}
      </div>
      <div className="grid grid-cols-1 gap-4">{children}</div>
    </section>
  )
}

interface RowProps {
  label: string
  children: ReactNode
}

// Shared "label on the left, examples on the right" row. Used inside Section
// to anchor each example with the role it plays in the codebase.
export function Row({ label, children }: RowProps) {
  return (
    <div className="grid grid-cols-1 gap-2 md:grid-cols-[14rem_1fr] md:items-center">
      <span className="text-xs font-medium text-slate-600 dark:text-slate-400">{label}</span>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  )
}
