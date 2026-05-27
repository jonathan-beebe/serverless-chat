import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Button } from './Button'
import { Callout } from './Callout'
import { LiveRegion } from './LiveRegion'
import { Textarea } from './Textarea'
import { useFocusOnMount } from '../hooks/useFocusOnMount'

interface Props {
  value: string
  /** Visible label above the box, e.g. "Invite URL" or "Answer code". */
  label: string
  /** Help text shown below the box. */
  helpText?: string
  /** Compact monospace style for short URLs; default flows multi-line for long codes. */
  variant?: 'url' | 'code'
  /** When true, focus the primary affordance on mount (Share if rendered, else
   * Copy) — used by screens where this is the screen's primary action. Off by
   * default so showcase / preview contexts and any future inline usage don't
   * steal focus. */
  autoFocus?: boolean
  /** FEAT-014: opt-in Web Share API payload. When set AND `navigator.share` /
   * `canShare(data)` are both available, a Share button renders alongside Copy
   * and forwards `data` to `navigator.share` on click. Omit the prop (or
   * render in an unsupported browser) and the component behaves exactly as
   * before — Copy is the only affordance, no surface area change. */
  share?: ShareData
}

export function CopyBox({ value, label, helpText, variant = 'code', autoFocus = false, share }: Props) {
  const [copied, setCopied] = useState(false)
  const [needsManualCopy, setNeedsManualCopy] = useState(false)
  const textareaId = useId()
  const manualCopyHintId = `${textareaId}-manual-copy`
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  // FEAT-014: render-time feature detection. SSR/test environments and browsers
  // without Web Share (desktop Firefox, some embedded webviews) miss either
  // `navigator.share` or have `canShare` return false for the payload — both
  // signals matter per the Web Share spec. Memoised against `share` so we don't
  // re-probe `navigator` every render.
  const shareSupported = useMemo(() => {
    if (!share) return false
    if (typeof navigator === 'undefined') return false
    if (typeof navigator.share !== 'function') return false
    // canShare is optional in the spec but ubiquitous where share exists; if
    // absent, default to true so we don't suppress a working share path.
    if (typeof navigator.canShare === 'function' && !navigator.canShare(share)) return false
    return true
  }, [share])
  // When Share is rendered it's the primary affordance on mobile, so it
  // receives `autoFocus`; Copy gets focus only when Share is absent.
  const shareButtonRef = useFocusOnMount<HTMLButtonElement>([], { skip: !autoFocus || !shareSupported })
  const copyButtonRef = useFocusOnMount<HTMLButtonElement>([], { skip: !autoFocus || shareSupported })

  // Marks a successful copy. The confirmation persists until the user starts a
  // new copy attempt, the underlying `value` changes, or the component
  // unmounts — there is intentionally no wall-clock timer here. A fixed
  // auto-dismiss was a WCAG 2.2.1 (Timing Adjustable, Level A) violation:
  // users on screen magnifiers, with cognitive-load needs, or who context-
  // switched to paste the value would routinely lose the confirmation before
  // they could read it. See A11Y-020 for the full analysis.
  const markCopied = () => {
    setCopied(true)
    setNeedsManualCopy(false)
  }

  // If the value being shown changes, the previous "Copied!" no longer
  // describes what is in the box — clear it (and any stale fallback hint).
  useEffect(() => {
    setCopied(false)
    setNeedsManualCopy(false)
  }, [value])

  const onCopy = async () => {
    // A fresh attempt supersedes any previous confirmation; clear up front so
    // the success/failure of *this* click is what the user sees.
    setCopied(false)

    // Primary path: the modern async clipboard API.
    try {
      await navigator.clipboard.writeText(value)
      markCopied()
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
          markCopied()
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

  // FEAT-014: invoke `navigator.share` synchronously from the click handler —
  // any awaited work between click and call drops the transient user
  // activation on Safari/iOS. `AbortError` (user dismissed the sheet) is the
  // documented happy-path cancel signal, not a failure: swallow silently.
  // Other rejections are also swallowed visually — Copy remains the durable
  // fallback affordance, so we don't compound a share failure with an error
  // banner the user can't act on.
  const onShare = () => {
    if (!share) return
    navigator.share(share).catch((err: unknown) => {
      if (err instanceof Error && err.name === 'AbortError') return
      // Non-Abort failures: keep the UI quiet. Copy is right next to Share.
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={textareaId} className="text-sm font-medium text-stone-800 dark:text-stone-200">
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
        {helpText && <p className="text-xs text-stone-600 dark:text-stone-400">{helpText}</p>}
        <div className="ml-auto flex items-center gap-2">
          {copied && (
            <Callout variant="success" aria-hidden="true">
              Copied!
            </Callout>
          )}
          {/* FEAT-014: Share renders before Copy so on a mobile share-supported
              browser it's the leftmost (primary) affordance in the row. When
              Share is hidden (unsupported / no `share` prop) the row collapses
              back to a single Copy button — identical to pre-FEAT-014. */}
          {shareSupported && (
            <Button ref={shareButtonRef} variant="primary" size="md" onClick={onShare}>
              Share
            </Button>
          )}
          <Button ref={copyButtonRef} variant={shareSupported ? 'secondary' : 'primary'} size="md" onClick={onCopy}>
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
