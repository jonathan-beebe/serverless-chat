import { useEffect, useState } from 'react'
import { CopyBox } from '../components/CopyBox'
import { Chat } from '../components/Chat'
import type { ChatSession } from '../hooks/useChatSession'

interface Props {
  session: ChatSession
  offerCode: string
  onCancel: () => void
}

export function Joiner({ session, offerCode, onCancel }: Props) {
  const [accepted, setAccepted] = useState(false)

  useEffect(() => {
    if (accepted && session.state === 'idle') {
      void session.startAsAnswerer(offerCode)
    }
  }, [accepted, offerCode, session])

  if (session.state === 'connected') {
    return (
      <main className="mx-auto flex h-[calc(100vh-3rem)] max-w-xl flex-col gap-3 px-4 py-6">
        <header className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-slate-100">Connected</h1>
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

  if (!accepted) {
    return (
      <main className="mx-auto flex max-w-xl flex-col items-center gap-6 px-4 py-12 text-center">
        <h1 className="text-2xl font-semibold text-slate-100">You've been invited to chat</h1>
        <p className="text-slate-300">
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
            className="rounded-md border border-slate-700 px-5 py-2.5 text-base font-medium text-slate-200 hover:bg-slate-800">
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
          <h1 className="text-2xl font-semibold text-slate-100">Send this code back</h1>
          <p className="mt-1 text-sm text-slate-400">
            Once they paste it, the connection opens and the chat starts automatically.
          </p>
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
          Preparing reply (gathering network candidates)…
        </p>
      )}

      {session.encodedLocal && (
        <CopyBox
          label="Reply code"
          value={session.encodedLocal}
          helpText="Paste this back in the same conversation. Waiting for them to accept…"
        />
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
