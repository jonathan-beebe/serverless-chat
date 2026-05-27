import { useEffect, useId, useRef, useState } from 'react'
import { Button } from './Button'
import { Callout } from './Callout'
import { LiveRegion } from './LiveRegion'
import type { ChatMessage } from '../core/rtc'
import { copyTextToClipboard } from '../core/clipboard'
import { formatTranscript } from '../core/transcript'

interface Props {
  messages: ChatMessage[]
  // FEAT-011: invoked after a successful clipboard write so the parent can
  // refocus the composer (option (b) from RFCTR-003's discovery notes — the
  // toolbar stays self-contained without leaking the composer ref through
  // its API).
  onCopySuccess?: () => void
}

// How long the "Copied!" badge stays visible before auto-dismissing
// (FEAT-011 AC #13). The AT path is the LiveRegion announcement, not the
// badge — so the sighted-only timeout doesn't run afoul of WCAG 2.2.1 the
// way the previous CopyBox timer did (A11Y-020). The badge is also
// aria-hidden so AT does not race with the timer.
const COPY_FLASH_MS = 1500

export function ChatCopyToolbar({ messages, onCopySuccess }: Props) {
  // FEAT-011 toolbar state. Toggle defaults to ON (matches the visible UI —
  // every bubble already renders a timestamp). Lives in component state for
  // the session; not persisted across reloads, matching the rest of the
  // app's "no localStorage" stance.
  const [includeTimestamps, setIncludeTimestamps] = useState(true)
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'manual'>('idle')
  const copyHintId = useId()
  // FEAT-011: hidden fallback textarea for the legacy `execCommand('copy')`
  // path. Kept always-mounted so the ref is stable across the lifecycle of
  // the copy action. We write its `value` lazily inside the click handler —
  // there's no point keeping it in sync on every render.
  const fallbackTextareaRef = useRef<HTMLTextAreaElement | null>(null)
  // setTimeout handle for the "Copied!" badge auto-dismiss (FEAT-011 AC #13).
  // Cleared on unmount so a fast remount doesn't fire into a dead component.
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // FEAT-011: clear any pending "Copied!" flash timer if we unmount mid-flash.
  // Otherwise the setState in the timer callback fires against a dead
  // component and React logs a warning.
  useEffect(() => {
    return () => {
      if (flashTimerRef.current) {
        clearTimeout(flashTimerRef.current)
        flashTimerRef.current = null
      }
    }
  }, [])

  // FEAT-011: schedule the auto-dismiss of the "Copied!" badge. Called on each
  // successful copy; replaces any in-flight timer so back-to-back clicks
  // restart the window instead of compounding.
  const scheduleCopyFlashDismiss = () => {
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
    flashTimerRef.current = setTimeout(() => {
      setCopyState('idle')
      flashTimerRef.current = null
    }, COPY_FLASH_MS)
  }

  // FEAT-011: copy the entire transcript as markdown. CR-009 lifted the
  // two-tier write strategy (modern `navigator.clipboard` → legacy hidden
  // textarea + `execCommand`) into `src/core/clipboard.ts` so this and the
  // Home row-menu "Copy transcript" action share one implementation.
  //
  // We compute the markdown lazily here (not in React state). The transcript
  // can be long; recomputing on every render for a value only needed on click
  // is wasted work.
  const onCopy = async () => {
    if (messages.length === 0) return
    const markdown = formatTranscript(messages, { includeTimestamps })
    const result = await copyTextToClipboard(markdown, fallbackTextareaRef.current)
    if (result === 'copied') {
      setCopyState('copied')
      scheduleCopyFlashDismiss()
      // FEAT-002 parallel: the Copy action is incidental, the composer is
      // the user's primary surface. Parent refocuses via `onCopySuccess`.
      onCopySuccess?.()
      return
    }
    // 'manual' → both paths failed. The fallback textarea is already
    // selected by `copyTextToClipboard`, so a single Ctrl+C / Cmd+C
    // finishes the copy; surface the visible hint and AT announcement.
    setCopyState('manual')
  }

  return (
    <>
      {/*
        FEAT-011: copy-transcript toolbar. Lives above the transcript so it's
        always visible, and tab traversal hits it before the transcript and
        composer (toggle → button → transcript → composer). The "Copied!"
        badge slot is a fixed-width inline container (`min-w-…`) so the
        badge appearing/disappearing doesn't shift the button or composer.
      */}
      {/* A11Y-034: the toolbar is hidden entirely while the transcript is
          empty. A disabled Copy button announced as "Copy, button, dimmed"
          gave SR users no programmatic reason for the disabled state; the
          empty-state placeholder below the toolbar already tells every user
          the surface is empty, so the controls have nothing to offer. */}
      {messages.length > 0 && (
        <div className="hidden sm:flex items-center justify-end gap-3">
          <label className="flex items-center gap-2 text-sm text-stone-700 dark:text-stone-300">
            <input
              type="checkbox"
              checked={includeTimestamps}
              onChange={(e) => setIncludeTimestamps(e.target.checked)}
              aria-describedby={copyHintId}
              className="h-4 w-4 cursor-pointer accent-sky-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2 focus-visible:ring-offset-stone-50 dark:focus-visible:ring-offset-stone-900"
            />
            <span>Include timestamps</span>
          </label>
          {/* sr-only hint explaining the toggle's effect on the markdown output.
              Not visible; assistive tech reads it via the checkbox's
              aria-describedby. */}
          <span id={copyHintId} className="sr-only">
            When on, the copied markdown includes a date header and per-message times. When off, only sender names and
            message bodies are copied.
          </span>
          <div className="flex min-w-[5.5rem] items-center justify-end gap-2">
            {copyState === 'copied' && (
              <Callout variant="success" aria-hidden="true">
                Copied!
              </Callout>
            )}
            <Button variant="primary" size="md" onClick={onCopy}>
              Copy
            </Button>
          </div>
        </div>
      )}
      {copyState === 'manual' && (
        <Callout variant="warning" className="text-xs font-medium">
          Press Ctrl+C / Cmd+C to copy
        </Callout>
      )}
      {/* Hidden fallback textarea for the legacy `execCommand('copy')` path.
          Always mounted (stable ref); offscreen via absolute positioning so it
          doesn't appear in tab order or visual layout. aria-hidden so AT
          ignores it. Focused/selected programmatically only in the fallback
          branch of `onCopy`. */}
      <textarea
        ref={fallbackTextareaRef}
        aria-hidden="true"
        tabIndex={-1}
        readOnly
        defaultValue=""
        className="absolute left-[-9999px] h-px w-px opacity-0"
      />
      {/* FEAT-011 live region for copy outcomes. Stays mounted across renders
          so screen readers receive the content-change announcement; quiet
          string between events keeps the region from making noise. */}
      <LiveRegion>
        {copyState === 'copied'
          ? 'Transcript copied to clipboard'
          : copyState === 'manual'
            ? 'Transcript selected. Press Control C or Command C to copy.'
            : ''}
      </LiveRegion>
    </>
  )
}
