import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from 'react'
import type { ChatMessage } from '../core/rtc'

interface Props {
  messages: ChatMessage[]
  onSend: (text: string) => void
  disabled?: boolean
}

// Distance (in px) from the bottom within which we still consider the user
// "pinned" — forgives small mis-scrolls and elastic-bounce pixels without
// hijacking an intentional scroll-up to read history.
const NEAR_BOTTOM_THRESHOLD_PX = 32

export function Chat({ messages, onSend, disabled }: Props) {
  const [draft, setDraft] = useState('')
  const transcriptRef = useRef<HTMLOListElement | null>(null)
  const composerRef = useRef<HTMLTextAreaElement | null>(null)
  // Tracks whether the user was near the bottom as of their last scroll input.
  // Updated only by `onScroll`, so by the time a new message commits this
  // reflects the pre-update intent (the effect runs *after* the DOM grows,
  // making an in-effect measurement unreliable). Defaults to true so the
  // initial render still scrolls to the latest message.
  const wasNearBottomRef = useRef(true)

  // Keep the latest message in view as new ones stream in — but only if the
  // user hasn't scrolled up to read history. Yanking them back to the bottom
  // is the well-known "chat scroll" antipattern.
  useEffect(() => {
    const el = transcriptRef.current
    if (!el) return
    if (!wasNearBottomRef.current) return
    el.scrollTop = el.scrollHeight
  }, [messages])

  const onScroll = () => {
    const el = transcriptRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    wasNearBottomRef.current = distanceFromBottom < NEAR_BOTTOM_THRESHOLD_PX
  }

  // Single send path shared by the form's submit handler (click / mouse / touch)
  // and the composer's keydown handler (Enter). Trims to drop the kind of
  // trailing whitespace a stray Shift+Enter at the end produces.
  const sendIfValid = () => {
    const trimmed = draft.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    setDraft('')
    // Enter on a textarea keeps focus naturally; clicking Send moves focus
    // to the now-disabled button, leaving keyboard users stranded and
    // dismissing the soft keyboard on touch. Pin focus back to the composer.
    // `preventScroll` keeps the transcript from being yanked by this call
    // (CR-005 scroll-pin behavior).
    composerRef.current?.focus({ preventScroll: true })
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    sendIfValid()
  }

  // FEAT-004: Enter sends, Shift+Enter inserts a newline, IME composition is
  // respected. Empty drafts and disabled state fall through to default
  // behavior (= no-op) so the user can't double-send.
  const onComposerKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return
    e.preventDefault()
    sendIfValid()
  }

  // Auto-focus the composer on initial mount (initial connect) and whenever it
  // transitions from disabled → enabled (reconnect). Skip if some other
  // element is currently focused so we never override an explicit user focus.
  useEffect(() => {
    if (disabled) return
    const active = document.activeElement
    if (active && active !== document.body) return
    composerRef.current?.focus({ preventScroll: true })
  }, [disabled])

  return (
    <div className="flex h-full flex-col gap-3">
      <ol
        ref={transcriptRef}
        onScroll={onScroll}
        aria-label="Chat transcript"
        aria-live="polite"
        className="flex-1 space-y-2 overflow-y-auto rounded-md border border-slate-300 bg-white/50 p-3 dark:border-slate-700 dark:bg-slate-900/50">
        {messages.length === 0 && (
          <li className="text-sm text-slate-600 dark:text-slate-400">No messages yet. Say hello.</li>
        )}
        {messages.map((m) => (
          <li key={m.id} className={`flex flex-col ${m.from === 'me' ? 'items-end' : 'items-start'}`}>
            {/* Visible caption so sighted users who can't distinguish color/alignment still see authorship. */}
            <span aria-hidden="true" className="px-1 text-xs text-slate-600 dark:text-slate-400">
              {m.from === 'me' ? 'You' : 'Them'}
            </span>
            {/* Visually-hidden prefix so the aria-live announcement includes the speaker. */}
            <span className="sr-only">{m.from === 'me' ? 'You said: ' : 'They said: '}</span>
            <span
              className={`max-w-[80%] whitespace-pre-wrap break-words rounded-lg px-3 py-1.5 text-sm ${
                m.from === 'me'
                  ? 'bg-sky-600 text-white'
                  : 'bg-slate-200 text-slate-900 dark:bg-slate-700 dark:text-slate-100'
              }`}>
              {m.text}
            </span>
          </li>
        ))}
      </ol>

      <form onSubmit={onSubmit} className="flex items-end gap-2">
        <label htmlFor="chat-input" className="sr-only">
          Message
        </label>
        <textarea
          id="chat-input"
          ref={composerRef}
          rows={1}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onComposerKeyDown}
          placeholder={disabled ? 'Waiting for connection…' : 'Type a message'}
          disabled={disabled}
          autoComplete="off"
          // `field-sizing: content` auto-grows the textarea with its content
          // on Chrome 123+ / Safari 18+. Older browsers ignore it and render
          // at the explicit `rows={1}` height with internal scroll — still
          // functional, just not auto-growing.
          className="flex-1 resize-none rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-500 [field-sizing:content] max-h-40 focus-visible:border-sky-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder-slate-400"
        />
        <button
          type="submit"
          disabled={disabled || !draft.trim()}
          className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400">
          Send
        </button>
      </form>
    </div>
  )
}
