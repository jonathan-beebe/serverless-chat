import { FormEvent, useEffect, useRef, useState } from 'react'
import type { ChatMessage } from '../core/rtc'

interface Props {
  messages: ChatMessage[]
  onSend: (text: string) => void
  disabled?: boolean
}

export function Chat({ messages, onSend, disabled }: Props) {
  const [draft, setDraft] = useState('')
  const transcriptRef = useRef<HTMLOListElement | null>(null)

  // Keep the latest message in view as new ones stream in.
  useEffect(() => {
    const el = transcriptRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [messages])

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!draft.trim()) return
    onSend(draft)
    setDraft('')
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <ol
        ref={transcriptRef}
        aria-label="Chat transcript"
        aria-live="polite"
        className="flex-1 space-y-2 overflow-y-auto rounded-md border border-slate-700 bg-slate-900/50 p-3">
        {messages.length === 0 && <li className="text-sm text-slate-500">No messages yet. Say hello.</li>}
        {messages.map((m) => (
          <li key={m.id} className={`flex ${m.from === 'me' ? 'justify-end' : 'justify-start'}`}>
            <span
              className={`max-w-[80%] rounded-lg px-3 py-1.5 text-sm ${
                m.from === 'me' ? 'bg-sky-600 text-white' : 'bg-slate-700 text-slate-100'
              }`}>
              {m.text}
            </span>
          </li>
        ))}
      </ol>

      <form onSubmit={onSubmit} className="flex gap-2">
        <label htmlFor="chat-input" className="sr-only">
          Message
        </label>
        <input
          id="chat-input"
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={disabled ? 'Waiting for connection…' : 'Type a message'}
          disabled={disabled}
          autoComplete="off"
          className="flex-1 rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-sky-500 focus:outline-none disabled:opacity-50"
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
