import { useId, useRef, useState } from 'react'
import { Button } from './Button'
import { Callout } from './Callout'
import { LiveRegion } from './LiveRegion'
import { Textarea } from './Textarea'

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
  const manualCopyHintId = `${textareaId}-manual-copy`
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
      <label htmlFor={textareaId} className="text-sm font-medium text-slate-800 dark:text-slate-200">
        {label}
      </label>
      <Textarea
        id={textareaId}
        ref={textareaRef}
        readOnly
        value={value}
        rows={variant === 'url' ? 2 : 6}
        className="resize-none font-mono text-xs"
        onFocus={(e) => e.currentTarget.select()}
        aria-describedby={needsManualCopy ? manualCopyHintId : undefined}
      />
      <div className="flex items-center justify-between gap-3">
        {helpText && <p className="text-xs text-slate-600 dark:text-slate-400">{helpText}</p>}
        <div className="ml-auto flex items-center gap-2">
          {copied && (
            <Callout variant="success" aria-hidden="true">
              Copied!
            </Callout>
          )}
          <Button variant="primary" size="md" onClick={onCopy}>
            Copy
          </Button>
        </div>
      </div>
      {/* Manual-copy hint surfaces when both clipboard paths fail (e.g. http:,
          sandboxed iframes, permission-denied). The textarea is already
          selected at that point, so a single keystroke completes the copy.
          The Callout is a durable part of the accessibility tree (no
          `aria-hidden`) and is wired to the textarea via `aria-describedby`
          so screen readers announce the instruction on textarea focus and
          browse-mode users can re-discover it by ordinary navigation. */}
      {needsManualCopy && (
        <Callout id={manualCopyHintId} variant="warning" className="text-xs font-medium">
          Press Ctrl+C / Cmd+C to copy
        </Callout>
      )}
      {/* Status message announced to AT without disturbing the button's name or focus.
          For the manual-copy branch, the live region acts as an attention-getter that
          points at the persistent Callout above — it does not carry the full keystroke
          instruction, because the Callout is the durable surface for that. */}
      <LiveRegion>
        {copied
          ? `${label} copied to clipboard`
          : needsManualCopy
            ? `Copy failed. ${label} is selected — see instructions below.`
            : ''}
      </LiveRegion>
    </div>
  )
}
