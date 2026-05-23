import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from './Button'
import { Divider } from './Divider'
import { Textarea } from './Textarea'
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

// Items that flow through the transcript list. Date items are visual chrome
// rendered above the first message and at every local-day rollover.
type TranscriptItem = { kind: 'date'; key: string; date: Date } | { kind: 'message'; message: ChatMessage }

function buildItems(messages: ChatMessage[]): TranscriptItem[] {
  const out: TranscriptItem[] = []
  let lastDay: string | null = null
  for (const m of messages) {
    const date = new Date(m.at)
    const day = date.toDateString()
    if (day !== lastDay) {
      out.push({ kind: 'date', key: `date-${day}`, date })
      lastDay = day
    }
    out.push({ kind: 'message', message: m })
  }
  return out
}

export function Chat({ messages, onSend, disabled }: Props) {
  const [draft, setDraft] = useState('')
  // Scroll surface + log live region are the same wrapper <div> (A11Y-018):
  // putting `role="log"` on a wrapper (instead of swapping the <ol>'s implicit
  // list role) lets the empty-state placeholder sit *outside* the live region
  // and keeps native list semantics for the message list itself.
  const transcriptRef = useRef<HTMLDivElement | null>(null)
  const composerRef = useRef<HTMLTextAreaElement | null>(null)
  // Tracks whether the user was near the bottom as of their last scroll input.
  // Updated only by `onScroll`, so by the time a new message commits this
  // reflects the pre-update intent (the effect runs *after* the DOM grows,
  // making an in-effect measurement unreliable). Defaults to true so the
  // initial render still scrolls to the latest message.
  const wasNearBottomRef = useRef(true)

  // One formatter per instance instead of per message — `Intl.DateTimeFormat`
  // construction is cheap but not free, and the chat re-renders on every
  // incoming message.
  const dateFmt = useMemo(() => new Intl.DateTimeFormat(undefined, { dateStyle: 'full' }), [])
  const timeFmt = useMemo(() => new Intl.DateTimeFormat(undefined, { timeStyle: 'short' }), [])

  const items = useMemo(() => buildItems(messages), [messages])

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
    // CR-007: outer wrapper must be a flex-1 + min-h-0 child of its bounded
    // flex-column parent (Offerer/Joiner connected `<ScreenContainer>`). The
    // previous `h-full` shape didn't participate in the parent's flex
    // distribution, so intrinsic transcript content could push the wrapper
    // past its allotted slot and the document — not just the transcript —
    // gained a scrollbar. `min-h-0` overrides the flex default of
    // `min-height: auto`, the same pattern the transcript already uses
    // internally via `flex-1 overflow-y-auto`.
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/*
        A11Y-018: the transcript is exposed as a log surface, not a plain list.
        `role="log"` implies `aria-live="polite"`, `aria-relevant="additions"`,
        and `aria-atomic="false"`; we keep them explicit for older AT that
        doesn't resolve implicit role attributes. The wrapper is also the
        scroll container (so auto-scroll math reads from the same element AT
        navigates to as "Chat transcript"). The empty-state placeholder sits
        as a sibling of the <ol> *inside* this wrapper but is marked
        aria-hidden so AT doesn't read it on first paint or as it leaves when
        the first message arrives.

        A11Y-021: `tabIndex={0}` makes the scroll container reachable by
        keyboard on Firefox and Safari (Chromium auto-promotes scroll
        containers since M126, but Gecko and WebKit do not). Lets keyboard-only
        / screen-magnifier / switch users scroll the transcript with Arrow /
        PageUp / PageDown / Home / End.
      */}
      <div
        ref={transcriptRef}
        onScroll={onScroll}
        role="log"
        aria-label="Chat transcript"
        aria-live="polite"
        aria-relevant="additions"
        aria-atomic="false"
        tabIndex={0}
        className="flex-1 overflow-y-auto rounded-md border border-slate-300 bg-white/50 p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 dark:border-slate-700 dark:bg-slate-900/50">
        {messages.length === 0 ? (
          <p aria-hidden="true" className="text-sm text-slate-600 dark:text-slate-400">
            No messages yet. Say hello.
          </p>
        ) : (
          <ol className="space-y-2">
            {items.map((item) => {
              if (item.kind === 'date') {
                // Chrome, not content. `role="presentation"` neutralizes the
                // list-item semantics so the <ol>'s item count doesn't include
                // dividers; `aria-hidden` keeps the text out of any
                // live-region announcement on day rollover.
                return (
                  <li key={item.key} role="presentation" aria-hidden="true" data-testid="date-header" className="py-1">
                    <Divider>
                      <time dateTime={item.date.toISOString().slice(0, 10)}>{dateFmt.format(item.date)}</time>
                    </Divider>
                  </li>
                )
              }
              const m = item.message
              const isMe = m.from === 'me'
              return (
                <li key={m.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                  {/* Visually-hidden prefix so the log announcement includes the speaker (A11Y-004). */}
                  <span className="sr-only">{isMe ? 'You said: ' : 'They said: '}</span>
                  <div
                    data-testid="message-bubble"
                    className={`flex max-w-[80%] flex-col gap-0.5 rounded-lg px-3 py-1 text-sm ${
                      isMe
                        ? 'bg-sky-700 text-white'
                        : 'bg-slate-200 text-slate-900 dark:bg-slate-700 dark:text-slate-100'
                    }`}>
                    <span data-testid={`message-text-${m.id}`} className="whitespace-pre-wrap break-words">
                      {m.text}
                    </span>
                    <time
                      aria-hidden="true"
                      dateTime={new Date(m.at).toISOString()}
                      className={`self-end text-xs ${isMe ? 'text-white' : 'text-slate-600 dark:text-slate-400'}`}>
                      {timeFmt.format(new Date(m.at))}
                    </time>
                  </div>
                </li>
              )
            })}
          </ol>
        )}
      </div>

      <form onSubmit={onSubmit} className="flex items-end gap-2">
        <label htmlFor="chat-input" className="sr-only">
          Message
        </label>
        <Textarea
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
          className="flex-1 resize-none placeholder-slate-500 [field-sizing:content] max-h-40 disabled:opacity-50 dark:placeholder-slate-400"
        />
        <Button type="submit" variant="primary" size="md" disabled={disabled || !draft.trim()}>
          Send
        </Button>
      </form>
    </div>
  )
}
