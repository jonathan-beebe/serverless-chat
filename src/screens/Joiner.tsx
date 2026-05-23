import { useEffect, useState } from 'react'
import { CopyBox } from '../components/CopyBox'
import { Chat } from '../components/Chat'
import type { ChatSession } from '../hooks/useChatSession'
import { useFocusOnMount } from '../hooks/useFocusOnMount'
import { usePageTitle } from '../hooks/usePageTitle'
import type { ConnectionState } from '../core/rtc'

interface Props {
  session: ChatSession
  offerCode: string
  onCancel: () => void
}

function joinerTitle(state: ChatSession['state'], accepted: boolean): string {
  if (state === 'connected') return 'Connected · P2P Chat'
  if (state === 'closed') return 'Connection lost · P2P Chat'
  if (!accepted) return "You've been invited · P2P Chat"
  return 'Send your reply code · P2P Chat'
}

// Maps the current session state to a screen-reader-friendly status string for
// the Joiner. A single persistent live region announces these updates as the
// negotiation progresses (WCAG 4.1.3). `hasLocal` distinguishes the
// "gathering" sub-states: once a local SDP is encoded the reply code is ready.
function statusMessage(state: ConnectionState, hasLocal: boolean): string {
  switch (state) {
    case 'gathering':
      return hasLocal ? 'Reply code ready — send it back to your friend.' : 'Preparing your reply code.'
    case 'awaiting-answer':
      return 'Reply code ready — send it back to your friend.'
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

export function Joiner({ session, offerCode, onCancel }: Props) {
  const [accepted, setAccepted] = useState(false)
  usePageTitle(joinerTitle(session.state, accepted))

  useEffect(() => {
    if (accepted && session.state === 'idle') {
      void session.startAsAnswerer(offerCode)
    }
  }, [accepted, offerCode, session])

  // Joiner has four branches (invite → reply-code → connected → closed).
  // Recompute focus when that branch flips so keyboard / screen-reader users
  // land on the new heading instead of <body>. `closed` is the post-connect
  // drop view added for BUG-005.
  const branch: 'connected' | 'closed' | 'invite' | 'reply' =
    session.state === 'connected' ? 'connected' : session.state === 'closed' ? 'closed' : accepted ? 'reply' : 'invite'
  const headingRef = useFocusOnMount<HTMLHeadingElement>([branch])

  const liveStatus = (
    <p role="status" aria-live="polite" className="sr-only">
      {statusMessage(session.state, !!session.encodedLocal)}
    </p>
  )

  if (branch === 'connected') {
    return (
      <main className="mx-auto flex h-[calc(100vh-3rem)] max-w-xl flex-col gap-3 px-4 py-6">
        {liveStatus}
        <header className="flex items-center justify-between">
          {/* No `ref={headingRef}` here — Chat owns focus via FEAT-002 (input
              is the meaningful starting point on the connected screen). A
              parent useFocusOnMount call would run *after* Chat's child
              effect and steal the focus back to the h1. */}
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

  if (branch === 'closed') {
    // Post-connect drop: the chat was live and just ended. Don't render the
    // stale reply-code CopyBox — that code is bound to the now-closed
    // PeerConnection and can't be reused. The single CTA resets the session
    // and routes home (`onCancel` is wired to App.goHome). See BUG-005.
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

  if (branch === 'invite') {
    return (
      <main className="mx-auto flex max-w-xl flex-col items-center gap-6 px-4 py-12 text-center">
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="text-2xl font-semibold text-slate-900 focus:outline-none dark:text-slate-100">
          You've been invited to chat
        </h1>
        <p className="text-slate-700 dark:text-slate-300">
          Accepting opens a direct, peer-to-peer connection. You'll receive a short reply code to send back to your
          friend.
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setAccepted(true)}
            className="rounded-md bg-sky-600 px-5 py-2.5 text-base font-medium text-white hover:bg-sky-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400">
            Accept
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-slate-300 px-5 py-2.5 text-base font-medium text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
            Decline
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-12">
      <header className="flex items-start justify-between">
        <div>
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="text-2xl font-semibold text-slate-900 focus:outline-none dark:text-slate-100">
            Send this code back
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Once they paste it, the connection opens and the chat starts automatically.
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-slate-300 px-3 py-1 text-sm text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
          Cancel
        </button>
      </header>

      {liveStatus}

      {session.state === 'gathering' && (
        <p className="text-sm text-slate-600 dark:text-slate-400">Preparing reply (gathering network candidates)…</p>
      )}

      {session.encodedLocal && (
        <CopyBox
          label="Reply code"
          value={session.encodedLocal}
          helpText="Paste this back in the same conversation. Waiting for them to accept…"
        />
      )}

      {session.error && (
        <p
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
