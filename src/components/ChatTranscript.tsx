import { useEffect, useMemo, useRef, useState } from 'react'
import { Divider } from './Divider'
import type { ChatMessage } from '../core/rtc'

interface Props {
  messages: ChatMessage[]
  /** FEAT-012: when true, the transcript inserts a one-line "Resumed here"
   *  divider between the last persisted message (above) and the first live
   *  message of this session (below). Driven by the hook's `hasResumed`
   *  latch — see `useChatSession.hasResumed`. */
  hasResumed?: boolean
}

// Distance (in px) from the bottom within which we still consider the user
// "pinned" — forgives small mis-scrolls and elastic-bounce pixels without
// hijacking an intentional scroll-up to read history.
const NEAR_BOTTOM_THRESHOLD_PX = 32

// Items that flow through the transcript list. Date items are visual chrome
// rendered above the first message and at every local-day rollover.
// FEAT-012 adds a `resume` item — a single divider drawn between the last
// persisted message and the first live message, when the session is a
// resume rather than a fresh chat.
type TranscriptItem =
  | { kind: 'date'; key: string; date: Date }
  | { kind: 'message'; message: ChatMessage }
  | { kind: 'resume'; key: string }

function buildItems(messages: ChatMessage[], resumeIndex: number | null): TranscriptItem[] {
  const out: TranscriptItem[] = []
  let lastDay: string | null = null
  for (let i = 0; i < messages.length; i += 1) {
    const m = messages[i]
    const date = new Date(m.at)
    const day = date.toDateString()
    // FEAT-012: insert the "Resumed here" divider just before the live cohort
    // begins. Date headers still render at their natural day rollover, so
    // both can co-occur (e.g. yesterday's resume header above today's date
    // header above today's first message) — per the ticket's "Resumed here
    // vs date headers" open question.
    if (resumeIndex !== null && i === resumeIndex) {
      out.push({ kind: 'resume', key: 'resume-divider' })
    }
    if (day !== lastDay) {
      out.push({ kind: 'date', key: `date-${day}`, date })
      lastDay = day
    }
    out.push({ kind: 'message', message: m })
  }
  return out
}

export function ChatTranscript({ messages, hasResumed }: Props) {
  // Scroll surface + log live region are the same wrapper <div> (A11Y-018):
  // putting `role="log"` on a wrapper (instead of swapping the <ol>'s implicit
  // list role) lets the empty-state placeholder sit *outside* the live region
  // and keeps native list semantics for the message list itself.
  const transcriptRef = useRef<HTMLDivElement | null>(null)
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

  // FEAT-012: latch the boundary where the live cohort begins, so the
  // "Resumed here" divider sits *above* the first message added after the
  // merge settled. `hasResumed` flips exactly once per session; we capture
  // `messages.length` at that flip as the divider index and freeze it for
  // the rest of the session (subsequent renders mustn't shift the divider
  // when new live messages append). Refreezing only when `hasResumed` itself
  // changes back to false (i.e. on session reset).
  const [resumeBoundary, setResumeBoundary] = useState<number | null>(null)
  useEffect(() => {
    if (!hasResumed) {
      setResumeBoundary(null)
      return
    }
    setResumeBoundary((prev) => (prev === null ? messages.length : prev))
    // We intentionally depend on `hasResumed` only — capturing `messages.length`
    // at the moment of the flip, not on every message arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasResumed])

  const items = useMemo(() => buildItems(messages, resumeBoundary), [messages, resumeBoundary])

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

  return (
    /*
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
    */
    <div
      ref={transcriptRef}
      onScroll={onScroll}
      role="log"
      aria-label="Chat transcript"
      aria-live="polite"
      aria-relevant="additions"
      aria-atomic="false"
      tabIndex={0}
      // IMPRV-027: gate the border + rounded-corner card chrome behind `sm:`
      // so phone-width viewports render edge-to-edge with no framing outline.
      // The bg tint, padding, focus ring, and scroll affordance stay
      // unconditional; the focus ring is a `ring`, not a `border-color`
      // swap, so keyboard focus still paints correctly on mobile.
      className="flex-1 overflow-y-auto overscroll-contain bg-white/50 p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 sm:rounded-md sm:border sm:border-stone-300 dark:bg-stone-900/50 dark:sm:border-stone-700">
      {messages.length === 0 ? (
        <p aria-hidden="true" className="text-sm text-stone-600 dark:text-stone-400">
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
            if (item.kind === 'resume') {
              // FEAT-012: marker between the persisted-history cohort
              // (above) and the live-session cohort (below). Same
              // presentation/aria-hidden treatment as date headers so AT
              // doesn't double-announce the cohort split on every render.
              return (
                <li key={item.key} role="presentation" aria-hidden="true" data-testid="resume-divider" className="py-1">
                  <Divider>Resumed here</Divider>
                </li>
              )
            }
            const m = item.message
            const isMe = m.from === 'me'
            // FEAT-010: outgoing bubbles render a delivery indicator next
            // to the time. Pending = hollow/dim check (the message is
            // "sent locally" — handed to the transport); Delivered =
            // filled check (peer's receipt envelope arrived). Incoming
            // bubbles render no check (parity with WhatsApp — receipts on
            // the receiver side fire automatically without rendering).
            const delivered = m.delivery === 'delivered'
            return (
              <li key={m.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                {/* Visually-hidden prefix so the log announcement includes the speaker (A11Y-004). */}
                <span className="sr-only">{isMe ? 'You said: ' : 'They said: '}</span>
                <div
                  data-testid="message-bubble"
                  className={`flex max-w-[80%] flex-col gap-0.5 rounded-lg px-3 py-1 text-sm ${
                    isMe ? 'bg-sky-700 text-white' : 'bg-stone-200 text-stone-900 dark:bg-stone-700 dark:text-stone-100'
                  }`}>
                  <span data-testid={`message-text-${m.id}`} className="select-text whitespace-pre-wrap break-words">
                    {m.text}
                  </span>
                  <span
                    className={`flex select-none items-center gap-1 self-end text-xs ${
                      isMe ? 'text-white' : 'text-stone-600 dark:text-stone-400'
                    }`}>
                    <time aria-hidden="true" dateTime={new Date(m.at).toISOString()}>
                      {timeFmt.format(new Date(m.at))}
                    </time>
                    {isMe && (
                      <span
                        data-testid={`delivery-${m.id}`}
                        aria-label={delivered ? 'Delivered' : 'Pending'}
                        role="img"
                        // Hollow check until delivered (faint sky tint over
                        // the sky-700 bubble); filled white on delivery.
                        // Same glyph either way so the bubble doesn't shift
                        // when the receipt lands.
                        className={`inline-block leading-none ${delivered ? 'text-white' : 'text-sky-100/60'}`}>
                        {'✓'}
                      </span>
                    )}
                  </span>
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
