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
  /** IMPRV-030: id of the most-recent message this device has observed in
   *  the viewport. The transcript renders a "Last read" divider just after
   *  the message with this id when at least one newer message exists.
   *  Null / unknown id / cursor-at-newest hides the marker. */
  lastReadMessageId?: string | null
  /** IMPRV-030: invoked whenever a message bubble enters the viewport.
   *  The hook's forward-only `markRead` filters out scrollback re-entries
   *  and unknown ids; the transcript fires unconditionally on every
   *  intersection. */
  onMarkRead?: (messageId: string) => void
}

// Distance (in px) from the bottom within which we still consider the user
// "pinned" — forgives small mis-scrolls and elastic-bounce pixels without
// hijacking an intentional scroll-up to read history.
const NEAR_BOTTOM_THRESHOLD_PX = 32

// IMPRV-031: a message bubble must remain continuously in the viewport for
// this long before its id is forwarded to `onMarkRead`. Encodes the "the
// user actually looked at this" semantic without eye-tracking. Anything
// shorter (mount-time flash, fast scrollback) does NOT advance the read
// cursor. The dwell resets on viewport exit; a 2s look + exit + 2s look is
// not 4 seconds of dwell — it's two 2-second visits, neither qualifying.
const READ_DWELL_MS = 3000

// Items that flow through the transcript list. Date items are visual chrome
// rendered above the first message and at every local-day rollover.
// FEAT-012 adds a `resume` item — a single divider drawn between the last
// persisted message and the first live message, when the session is a
// resume rather than a fresh chat.
type TranscriptItem =
  | { kind: 'date'; key: string; date: Date }
  | { kind: 'message'; message: ChatMessage }
  | { kind: 'resume'; key: string }
  | { kind: 'last-read'; key: string }

function buildItems(
  messages: ChatMessage[],
  resumeIndex: number | null,
  lastReadIndex: number | null,
): TranscriptItem[] {
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
    // IMPRV-030: drop the "Last read" divider AFTER the cursor message and
    // only when there's at least one newer message in the list. lastReadIndex
    // is null when the cursor is unknown / refers to a deleted message;
    // lastReadIndex === messages.length - 1 means the user is caught up.
    // Either case suppresses the marker.
    if (lastReadIndex !== null && i === lastReadIndex && i < messages.length - 1) {
      out.push({ kind: 'last-read', key: 'last-read-marker' })
    }
  }
  return out
}

export function ChatTranscript({ messages, hasResumed, lastReadMessageId, onMarkRead }: Props) {
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

  // IMPRV-030: resolve the cursor message id to its index in the current
  // list. -1 (returned by findIndex when the id isn't present, or when the
  // cursor is null) becomes a sentinel `null` for buildItems so the marker
  // simply isn't pushed — handles the "cursor refers to a deleted message"
  // edge case the ticket flagged.
  const lastReadIndex = useMemo(() => {
    if (!lastReadMessageId) return null
    const idx = messages.findIndex((m) => m.id === lastReadMessageId)
    return idx === -1 ? null : idx
  }, [messages, lastReadMessageId])

  const items = useMemo(
    () => buildItems(messages, resumeBoundary, lastReadIndex),
    [messages, resumeBoundary, lastReadIndex],
  )

  // IMPRV-030: ref-shadow of `onMarkRead` so the observer's callback (created
  // once in an effect with empty deps) reads the latest version without
  // forcing the effect to re-run on every parent re-render.
  const onMarkReadRef = useRef(onMarkRead)
  useEffect(() => {
    onMarkReadRef.current = onMarkRead
  }, [onMarkRead])

  // IMPRV-030: per-bubble registration into a single IntersectionObserver.
  // The component renders message bubbles inside an <ol>; we capture each
  // bubble's <li> via the ref-callback below and observe()/unobserve() it
  // as it enters/leaves the React tree. The observer fires
  // `onMarkRead(messageId)` whenever a bubble crosses the threshold; the
  // hook's `markRead` filters re-entries (forward-only).
  const observerRef = useRef<IntersectionObserver | null>(null)
  const bubbleRefs = useRef<Map<string, Element>>(new Map())
  // IMPRV-031: pending dwell timers keyed by messageId. An entry exists from
  // the moment a bubble starts intersecting until it either (a) reaches the
  // READ_DWELL_MS threshold and fires onMarkRead, or (b) exits the viewport
  // before the threshold, at which point the timer is cleared. The Map lives
  // in a ref so it survives renders without re-creating the observer.
  const dwellTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  useEffect(() => {
    const timers = dwellTimersRef.current
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).dataset.messageId
          if (!id) continue
          if (entry.isIntersecting) {
            // IMPRV-031: schedule the dwell timer if this bubble isn't
            // already counting. A re-entry after a brief exit lands here
            // with no existing timer (we cleared it on exit), so the
            // dwell resets — non-cumulative, per the IMPRV-031 contract.
            if (timers.has(id)) continue
            const timer = setTimeout(() => {
              timers.delete(id)
              onMarkReadRef.current?.(id)
            }, READ_DWELL_MS)
            timers.set(id, timer)
          } else {
            // IMPRV-031: exited the viewport before READ_DWELL_MS. Clear
            // the pending timer so it never fires; the next entry will
            // schedule a fresh one.
            const pending = timers.get(id)
            if (pending !== undefined) {
              clearTimeout(pending)
              timers.delete(id)
            }
          }
        }
      },
      // root null → observe against the viewport. The transcript itself is a
      // scroll container, but IntersectionObserver tests scroll roots via
      // `root: <Element>`. We can't read transcriptRef.current at effect
      // setup time reliably (it commits in the same phase), and the
      // viewport-default is correct for the "marker tracks reading position"
      // outcome on bottom-anchored scroll where bubbles render bottom-up.
      undefined,
    )
    observerRef.current = obs
    // Observe any bubbles that were captured before this effect ran (initial
    // mount: the ref callbacks fire during render, BEFORE the useEffect).
    for (const el of bubbleRefs.current.values()) obs.observe(el)
    return () => {
      obs.disconnect()
      observerRef.current = null
      // IMPRV-031: cancel every pending dwell timer on unmount. `disconnect()`
      // stops further observer callbacks but does NOT cancel scheduled
      // timeouts — a fired timer on a dead component would call into a
      // stale onMarkReadRef and could race a fresh observer on the next
      // mount.
      for (const t of timers.values()) clearTimeout(t)
      timers.clear()
    }
  }, [])

  const registerBubble = (id: string) => (el: HTMLLIElement | null) => {
    const map = bubbleRefs.current
    const prev = map.get(id)
    if (el === prev) return
    if (prev) observerRef.current?.unobserve(prev)
    if (el) {
      map.set(id, el)
      observerRef.current?.observe(el)
    } else {
      map.delete(id)
    }
  }

  // IMPRV-029: counter of messages that arrived while the user was scrolled
  // back beyond the anti-yank threshold. Drives the "N new messages" pill —
  // visibility is `count > 0`; only the pill's own click handler resets it
  // (manual scroll to the bottom is deliberately not a dismissal).
  const [newMessagesCount, setNewMessagesCount] = useState(0)
  // Track the message-count of the previous render so the messages-effect can
  // detect a delta (one or more newcomers in a single commit) and increment
  // the IMPRV-029 counter by that delta. A ref instead of state because the
  // value is only consumed inside the effect — putting it in state would
  // cause an extra render per message.
  const prevMessagesLengthRef = useRef(messages.length)

  // Keep the latest message in view as new ones stream in — but only if the
  // user hasn't scrolled up to read history. Yanking them back to the bottom
  // is the well-known "chat scroll" antipattern.
  useEffect(() => {
    const el = transcriptRef.current
    if (!el) return

    // IMPRV-029: detect "newcomer arrived while scrolled back" before the
    // scroll write below — the auto-scroll branch short-circuits and would
    // otherwise hide this bookkeeping. A negative delta means the session
    // was reset (messages array shrank); drop the counter so the pill
    // doesn't linger across a fresh session.
    const prevLength = prevMessagesLengthRef.current
    prevMessagesLengthRef.current = messages.length
    if (messages.length < prevLength) {
      setNewMessagesCount(0)
    } else if (messages.length > prevLength && !wasNearBottomRef.current) {
      setNewMessagesCount((c) => c + (messages.length - prevLength))
    }

    if (!wasNearBottomRef.current) return
    el.scrollTop = el.scrollHeight
  }, [messages])

  const onScroll = () => {
    const el = transcriptRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    wasNearBottomRef.current = distanceFromBottom < NEAR_BOTTOM_THRESHOLD_PX
  }

  // IMPRV-029: tap-to-dismiss handler — scroll to the newest message and
  // reset the counter. Updates `wasNearBottomRef` synchronously so the very
  // next arrival doesn't increment the counter again before `onScroll`
  // fires from the programmatic scroll.
  // IMPRV-030: when a "Last read" marker is rendered, the scroll target is
  // the marker (not the bottom). The marker's *bottom* edge lands at the
  // viewport's bottom edge — the last-read tail of messages is visible
  // above the marker, the first unread sits just below it (off-screen,
  // requiring further scroll). Falls back to scrollHeight when no marker
  // is rendered (caught-up case).
  const onNewMessagesClick = () => {
    const el = transcriptRef.current
    if (el) {
      const marker = el.querySelector('[data-testid="last-read-marker"]') as HTMLElement | null
      if (marker) {
        el.scrollTop = marker.offsetTop + marker.offsetHeight - el.clientHeight
      } else {
        el.scrollTop = el.scrollHeight
      }
      wasNearBottomRef.current = true
    }
    setNewMessagesCount(0)
  }

  const newMessagesLabel = newMessagesCount === 1 ? '1 new message' : `${newMessagesCount} new messages`

  return (
    // IMPRV-029: positioning wrapper. The "N new messages" pill is a sibling
    // of the role="log" scroll container (so it isn't read as a live-region
    // addition and doesn't scroll with the message list). Carries the flex
    // sizing the scroll container used to carry directly, so the parent's
    // flex column distributes height correctly.
    <div className="relative flex min-h-0 flex-1 flex-col">
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
        // IMPRV-027: gate the border + rounded-corner card chrome behind `sm:`
        // so phone-width viewports render edge-to-edge with no framing outline.
        // The bg tint, padding, focus ring, and scroll affordance stay
        // unconditional; the focus ring is a `ring`, not a `border-color`
        // swap, so keyboard focus still paints correctly on mobile.
        // IMPRV-028: the scroll surface is itself a flex column so a single
        // `mt-auto` on its child can push the message list (or the empty-state
        // placeholder) to the bottom edge — adjacent to the composer. When the
        // content is shorter than the viewport, the auto top margin absorbs the
        // remaining space; once content exceeds the viewport the margin
        // collapses and normal scrolling resumes with the newest message
        // pinned at the bottom. DOM order stays chronological (oldest first)
        // so A11Y-018's `aria-live` additions still announce the newcomer.
        className="flex flex-1 flex-col overflow-y-auto overscroll-contain bg-white/50 p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 sm:rounded-md sm:border sm:border-stone-300 dark:bg-stone-900/50 dark:sm:border-stone-700">
        {messages.length === 0 ? (
          <p aria-hidden="true" className="mt-auto text-sm text-stone-600 dark:text-stone-400">
            No messages yet. Say hello.
          </p>
        ) : (
          <ol className="mt-auto space-y-2">
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
                  <li
                    key={item.key}
                    role="presentation"
                    aria-hidden="true"
                    data-testid="resume-divider"
                    className="py-1">
                    <Divider>Resumed here</Divider>
                  </li>
                )
              }
              if (item.kind === 'last-read') {
                // IMPRV-030: boundary between the cohort the user has
                // already seen (above) and the unread tail (below). Same
                // presentation/aria-hidden treatment as the FEAT-012 resume
                // divider so the log live region doesn't announce "Last
                // read" on every messages-state commit. The IMPRV-029 pill's
                // scroll handler keys on `data-testid="last-read-marker"`
                // to find this node's offset.
                return (
                  <li
                    key={item.key}
                    role="presentation"
                    aria-hidden="true"
                    data-testid="last-read-marker"
                    className="py-1">
                    <Divider>Last read</Divider>
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
                <li
                  key={m.id}
                  ref={registerBubble(m.id)}
                  data-message-id={m.id}
                  className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                  {/* Visually-hidden prefix so the log announcement includes the speaker (A11Y-004). */}
                  <span className="sr-only">{isMe ? 'You said: ' : 'They said: '}</span>
                  <div
                    data-testid="message-bubble"
                    className={`flex max-w-[80%] flex-col gap-0.5 rounded-lg px-3 py-1 text-sm ${
                      isMe
                        ? 'bg-sky-700 text-white'
                        : 'bg-stone-200 text-stone-900 dark:bg-stone-700 dark:text-stone-100'
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
      {newMessagesCount > 0 && (
        // IMPRV-029: count-bearing pill anchored to the bottom-center of the
        // transcript area, layered above the scroll content. Activating it
        // jumps the user to the newest message and dismisses the pill;
        // manual scroll does NOT dismiss it (per the ticket's chosen
        // dismissal policy — the user explicitly opted out of auto-hide).
        // The accessible name reflects the running count, so AT users hear
        // "3 new messages, button" instead of an opaque "Show new". Not a
        // child of the role="log" surface so live-region additions don't
        // include it.
        <button
          type="button"
          onClick={onNewMessagesClick}
          className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-sky-700 px-3 py-1 text-xs font-medium text-white shadow-md hover:bg-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2 focus-visible:ring-offset-stone-50 dark:focus-visible:ring-offset-stone-900">
          {newMessagesLabel}
        </button>
      )}
    </div>
  )
}
