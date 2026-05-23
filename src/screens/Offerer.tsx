import { FormEvent, useEffect, useState } from 'react'
import { CopyBox } from '../components/CopyBox'
import { Chat } from '../components/Chat'
import { currentOfferUrl } from '../core/url'
import type { ChatSession } from '../hooks/useChatSession'
import { useFocusOnMount } from '../hooks/useFocusOnMount'
import { usePageTitle } from '../hooks/usePageTitle'

interface Props {
  session: ChatSession
  onCancel: () => void
}

export function Offerer({ session, onCancel }: Props) {
  const [answerDraft, setAnswerDraft] = useState('')
  const isConnected = session.state === 'connected'
  usePageTitle(isConnected ? 'Connected · P2P Chat' : 'Invite a friend · P2P Chat')
  // Refocus when the rendered branch swaps (invite ↔ connected), so the
  // user lands on the new heading instead of being dropped to <body>.
  const headingRef = useFocusOnMount<HTMLHeadingElement>([isConnected])

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

  if (isConnected) {
    return (
      <main className="mx-auto flex h-[calc(100vh-3rem)] max-w-xl flex-col gap-3 px-4 py-6">
        <header className="flex items-center justify-between">
          <h1 ref={headingRef} tabIndex={-1} className="text-lg font-semibold text-slate-100 focus:outline-none">
            Connected
          </h1>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-slate-700 px-3 py-1 text-sm text-slate-300 hover:bg-slate-800">
            End chat
          </button>
        </header>
        <Chat messages={session.messages} onSend={session.send} />
      </main>
    )
  }

  const offerUrl = session.encodedLocal && currentOfferUrl(session.encodedLocal)

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-12">
      <header className="flex items-start justify-between">
        <div>
          <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-semibold text-slate-100 focus:outline-none">
            Invite your friend
          </h1>
          <p className="mt-1 text-sm text-slate-400">Keep this tab open — your friend's reply lands here.</p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-slate-700 px-3 py-1 text-sm text-slate-300 hover:bg-slate-800">
          Cancel
        </button>
      </header>

      {session.state === 'gathering' && (
        <p role="status" className="text-sm text-slate-400">
          Preparing invite (gathering network candidates)…
        </p>
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
          <label htmlFor="answer-input" className="text-sm font-medium text-slate-200">
            Paste their reply code
          </label>
          <textarea
            id="answer-input"
            value={answerDraft}
            onChange={(e) => setAnswerDraft(e.target.value)}
            rows={5}
            placeholder="They'll send back a long string. Paste it here."
            className="w-full resize-none rounded-md border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-xs text-slate-100 focus:border-sky-500 focus:outline-none"
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
        <p role="alert" className="rounded-md border border-red-700 bg-red-900/40 px-3 py-2 text-sm text-red-200">
          {session.error}
        </p>
      )}

      {session.state === 'failed' && !session.error && (
        <p role="alert" className="text-sm text-amber-300">
          Couldn't establish a direct connection. Try a different network.
        </p>
      )}
    </main>
  )
}
