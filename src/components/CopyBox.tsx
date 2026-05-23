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
  const [needsManualCopy, setNeedsManualCopy] = useState(false)
  const textareaId = useId()
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const flashCopied = () => {
    setCopied(true)
    setNeedsManualCopy(false)
    setTimeout(() => setCopied(false), 1500)
  }

  const onCopy = async () => {
    // Primary path: the modern async clipboard API.
    try {
      await navigator.clipboard.writeText(value)
      flashCopied()
      return
    } catch {
      // Falls through to the legacy path (writeText can be blocked on http:,
      // in sandboxed iframes like Teams Web, or when permissions are denied).
    }

    // Fallback path: select the text and try `document.execCommand('copy')`.
    // Deprecated but still implemented across evergreen browsers and works in
    // many of the contexts where `writeText` is blocked.
    const el = textareaRef.current
    if (el) {
      el.select()
      try {
        if (document.execCommand('copy')) {
          flashCopied()
          return
        }
      } catch {
        // Some environments throw rather than returning false.
      }
    }

    // Last resort: tell the user they need to press Cmd/Ctrl+C themselves.
    // The textarea is already selected (above), so a single keystroke works.
    setCopied(false)
    setNeedsManualCopy(true)
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
        className="w-full resize-none rounded-md border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-xs text-slate-100 focus-visible:border-sky-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
        onFocus={(e) => e.currentTarget.select()}
      />
      <div className="flex items-center justify-between gap-3">
        {helpText && <p className="text-xs text-slate-400">{helpText}</p>}
        <div className="ml-auto flex items-center gap-2">
          {copied && (
            <span aria-hidden="true" className="text-xs font-medium text-emerald-400">
              Copied!
            </span>
          )}
          <button
            type="button"
            onClick={onCopy}
            className="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400">
            Copy
          </button>
        </div>
      </div>
      {/* Manual-copy hint surfaces when both clipboard paths fail (e.g. http:,
          sandboxed iframes, permission-denied). The textarea is already
          selected at that point, so a single keystroke completes the copy. */}
      {needsManualCopy && (
        <p className="text-xs font-medium text-amber-300" aria-hidden="true">
          Press Ctrl+C / Cmd+C to copy
        </p>
      )}
      {/* Status message announced to AT without disturbing the button's name or focus. */}
      <span role="status" aria-live="polite" className="sr-only">
        {copied
          ? `${label} copied to clipboard`
          : needsManualCopy
            ? `${label} selected. Press Control C or Command C to copy.`
            : ''}
      </span>
    </div>
  )
}
