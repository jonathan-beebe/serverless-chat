import { FormEvent, useEffect, useState } from 'react'
import { CopyBox } from '../components/CopyBox'
import { Chat } from '../components/Chat'
import { currentOfferUrl } from '../core/url'
import type { ChatSession } from '../hooks/useChatSession'
import { useFocusOnMount } from '../hooks/useFocusOnMount'
import { usePageTitle } from '../hooks/usePageTitle'
import type { ConnectionState } from '../core/rtc'

interface Props {
  session: ChatSession
  onCancel: () => void
}

// Maps the current session state to a screen-reader-friendly status string.
// A single persistent live region in the DOM announces these updates as the
// negotiation progresses (WCAG 4.1.3). `hasLocal` distinguishes the
// "gathering" sub-states: once a local SDP is encoded we're waiting on the
// remote peer rather than still gathering candidates.
function statusMessage(state: ConnectionState, hasLocal: boolean): string {
  switch (state) {
    case 'gathering':
      return hasLocal ? 'Invite ready — send the link to your friend.' : 'Preparing your invite.'
    case 'awaiting-answer':
      return 'Invite ready — send the link to your friend.'
    case 'connecting':
      return 'Connecting to your friend.'
    case 'connected':
      return 'Connected. You can start chatting.'
    case 'failed':
      return 'Connection failed.'
    case 'closed':
      return 'Connection lost.'
    default:
      return ''
  }
}

export function Offerer({ session, onCancel }: Props) {
  const [answerDraft, setAnswerDraft] = useState('')
  const isConnected = session.state === 'connected'
  const isClosed = session.state === 'closed'
  usePageTitle(
    isConnected ? 'Connected · P2P Chat' : isClosed ? 'Connection lost · P2P Chat' : 'Invite a friend · P2P Chat',
  )
  // Refocus when the rendered branch swaps (invite ↔ connected ↔ closed) so
  // the user lands on the new heading instead of being dropped to <body>.
  // The branch identifier collapses the three possible views into one dep.
  const branch: 'connected' | 'closed' | 'invite' = isConnected ? 'connected' : isClosed ? 'closed' : 'invite'
  const headingRef = useFocusOnMount<HTMLHeadingElement>([branch])

  // Kick off offer generation on first mount; the hook owns the connection
  // so re-renders won't restart it.
  useEffect(() => {
    if (session.state === 'idle') void session.startAsOfferer()
  }, [session])

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!answerDraft.trim()) return
    void session.submitAnswer(answerDraft)
  }

  const liveStatus = (
    <p role="status" aria-live="polite" className="sr-only">
      {statusMessage(session.state, !!session.encodedLocal)}
    </p>
  )

  if (isConnected) {
    return (
      <main className="mx-auto flex h-[calc(100vh-3rem)] max-w-xl flex-col gap-3 px-4 py-6">
        {liveStatus}
        <header className="flex items-center justify-between">
          {/* No `ref={headingRef}` here — Chat takes focus on the message
              input via FEAT-002, which is the meaningful starting point on
              the connected screen. Letting useFocusOnMount race here would
              override Chat's focus call (parent effects run after children's). */}
          <h1 tabIndex={-1} className="text-lg font-semibold text-slate-900 focus:outline-none dark:text-slate-100">
            Connected
          </h1>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-slate-300 px-3 py-1 text-sm text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
            End chat
          </button>
        </header>
        <Chat messages={session.messages} onSend={session.send} />
      </main>
    )
  }

  if (isClosed) {
    // Post-connect drop: the chat was live and just ended (peer closed the
    // tab, network died, transport gave up). Don't render the invite/reply
    // setup UI — the SDP codes are bound to the now-closed PeerConnection and
    // can't be reused. Show a dedicated "Connection lost" view with a single
    // CTA that resets the session and routes home (handled by `onCancel`).
    return (
      <main className="mx-auto flex max-w-xl flex-col items-center gap-6 px-4 py-12 text-center">
        {liveStatus}
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="text-2xl font-semibold text-slate-900 focus:outline-none dark:text-slate-100">
          Connection lost
        </h1>
        <p className="text-slate-700 dark:text-slate-300">
          The chat ended. Your friend may have closed the tab, or the network dropped.
        </p>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md bg-sky-600 px-5 py-2.5 text-base font-medium text-white hover:bg-sky-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400">
          Start a new chat
        </button>
      </main>
    )
  }

  const offerUrl = session.encodedLocal && currentOfferUrl(session.encodedLocal)

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-12">
      {liveStatus}
      <header className="flex items-start justify-between">
        <div>
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="text-2xl font-semibold text-slate-900 focus:outline-none dark:text-slate-100">
            Invite your friend
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Keep this tab open — your friend's reply lands here.
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-slate-300 px-3 py-1 text-sm text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
          Cancel
        </button>
      </header>

      {session.state === 'gathering' && (
        <p className="text-sm text-slate-600 dark:text-slate-400">Preparing invite (gathering network candidates)…</p>
      )}

      {offerUrl && (
        <CopyBox
          label="Invite URL"
          value={offerUrl}
          helpText="Send this link to your friend in Teams, SMS, email — any channel works."
          variant="url"
        />
      )}

      {session.encodedLocal && (
        <form onSubmit={onSubmit} className="flex flex-col gap-2">
          <label htmlFor="answer-input" className="text-sm font-medium text-slate-800 dark:text-slate-200">
            Paste their reply code
          </label>
          <p id="answer-help" className="text-xs text-slate-600 dark:text-slate-400">
            They'll send back a long string — paste it here.
          </p>
          <textarea
            id="answer-input"
            aria-describedby={session.error ? 'answer-help answer-error' : 'answer-help'}
            aria-invalid={session.error ? true : undefined}
            value={answerDraft}
            onChange={(e) => setAnswerDraft(e.target.value)}
            rows={5}
            className="w-full resize-none rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900 focus-visible:border-sky-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
          <button
            type="submit"
            disabled={!answerDraft.trim() || session.state === 'connecting'}
            className="self-start rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400">
            {session.state === 'connecting' ? 'Connecting…' : 'Connect'}
          </button>
        </form>
      )}

      {session.error && (
        <p
          id="answer-error"
          role="alert"
          className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-700 dark:bg-red-900/40 dark:text-red-200">
          {session.error}
        </p>
      )}

      {session.state === 'failed' && !session.error && (
        <p role="alert" className="text-sm text-amber-700 dark:text-amber-300">
          Couldn't establish a direct connection. Try a different network.
        </p>
      )}
    </main>
  )
}
