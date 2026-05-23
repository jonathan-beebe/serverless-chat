import { useId, useRef, useState } from 'react'

interface Props {
  value: string
  /** Visible label above the box, e.g. "Invite URL" or "Answer code". */
  label: string
  /** Help text shown below the box. */
  helpText?: string
  /** Compact monospace style for short URLs; default flows multi-line for long codes. */
  variant?: 'url' | 'code'
}

export function CopyBox({ value, label, helpText, variant = 'code' }: Props) {
  const [copied, setCopied] = useState(false)
  const textareaId = useId()
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard can fail on http: or in restrictive iframes; fall back to selecting.
      textareaRef.current?.select()
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={textareaId} className="text-sm font-medium text-slate-200">
        {label}
      </label>
      <textarea
        id={textareaId}
        ref={textareaRef}
        readOnly
        value={value}
        rows={variant === 'url' ? 2 : 6}
        className="w-full resize-none rounded-md border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-xs text-slate-100 focus:border-sky-500 focus:outline-none"
        onFocus={(e) => e.currentTarget.select()}
      />
      <div className="flex items-center justify-between gap-3">
        {helpText && <p className="text-xs text-slate-400">{helpText}</p>}
        <button
          type="button"
          onClick={onCopy}
          className="ml-auto rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
          aria-live="polite">
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
    </div>
  )
}
