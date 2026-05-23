import { FormEvent, KeyboardEvent, useEffect, useState } from 'react'
import { Button } from '../components/Button'
import { Callout } from '../components/Callout'
import { Chat } from '../components/Chat'
import { CopyBox } from '../components/CopyBox'
import { Heading } from '../components/Heading'
import { LiveRegion } from '../components/LiveRegion'
import { ScreenContainer, useScreenChrome } from '../components/ScreenChrome'
import { Textarea } from '../components/Textarea'
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
  // In a showcase context the host page owns initial focus; skip the focus
  // call so the previews don't race each other to steal it. See A11Y-022.
  const { suppressInitialFocus } = useScreenChrome()
  const headingRef = useFocusOnMount<HTMLHeadingElement>([branch], { skip: suppressInitialFocus })

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

  // Enter submits the reply code (Slack / Discord / GitHub convention).
  // Shift+Enter, empty drafts, an active IME composition, and an in-flight
  // `connecting` state all fall through to the default newline-insert path —
  // matching the disabled conditions on the Connect button so the keyboard
  // path can't bypass them.
  const onAnswerKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return
    if (!answerDraft.trim() || session.state === 'connecting') return
    e.preventDefault()
    void session.submitAnswer(answerDraft)
  }

  const liveStatus = <LiveRegion>{statusMessage(session.state, !!session.encodedLocal)}</LiveRegion>

  if (isConnected) {
    return (
      <ScreenContainer
        label="Connected"
        className="mx-auto flex h-[calc(100vh-3rem)] max-w-xl flex-col gap-3 px-4 py-6">
        {liveStatus}
        <header className="flex items-center justify-between">
          {/* No `ref={headingRef}` here — Chat takes focus on the message
              input via FEAT-002, which is the meaningful starting point on
              the connected screen. Letting useFocusOnMount race here would
              override Chat's focus call (parent effects run after children's). */}
          <Heading level={1} size="sm">
            Connected
          </Heading>
          <Button variant="secondary" size="sm" onClick={onCancel}>
            End chat
          </Button>
        </header>
        <Chat messages={session.messages} onSend={session.send} />
      </ScreenContainer>
    )
  }

  if (isClosed) {
    // Post-connect drop: the chat was live and just ended (peer closed the
    // tab, network died, transport gave up). Don't render the invite/reply
    // setup UI — the SDP codes are bound to the now-closed PeerConnection and
    // can't be reused. Show a dedicated "Connection lost" view with a single
    // CTA that resets the session and routes home (handled by `onCancel`).
    return (
      <ScreenContainer
        label="Connection lost"
        className="mx-auto flex max-w-xl flex-col items-center gap-6 px-4 py-12 text-center">
        {liveStatus}
        <Heading level={1} ref={headingRef}>
          Connection lost
        </Heading>
        <p className="text-slate-700 dark:text-slate-300">
          The chat ended. Your friend may have closed the tab, or the network dropped.
        </p>
        <Button variant="primary" size="lg" onClick={onCancel}>
          Start a new chat
        </Button>
      </ScreenContainer>
    )
  }

  const offerUrl = session.encodedLocal && currentOfferUrl(session.encodedLocal)

  return (
    <ScreenContainer label="Invite your friend" className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-12">
      {liveStatus}
      <header className="flex items-start justify-between">
        <div>
          <Heading level={1} ref={headingRef}>
            Invite your friend
          </Heading>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Keep this tab open — your friend's reply lands here.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </header>

      {session.state === 'gathering' && (
        <Callout variant="info">Preparing invite (gathering network candidates)…</Callout>
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
          <Textarea
            id="answer-input"
            aria-describedby={session.error ? 'answer-help answer-error' : 'answer-help'}
            aria-invalid={session.error ? true : undefined}
            value={answerDraft}
            onChange={(e) => setAnswerDraft(e.target.value)}
            onKeyDown={onAnswerKeyDown}
            rows={5}
            className="resize-none font-mono text-xs"
          />
          <Button
            type="submit"
            variant="primary"
            size="md"
            disabled={!answerDraft.trim() || session.state === 'connecting'}
            className="self-start">
            {session.state === 'connecting' ? 'Connecting…' : 'Connect'}
          </Button>
        </form>
      )}

      {session.error && (
        <Callout variant="error" role="alert" id="answer-error">
          {session.error}
        </Callout>
      )}

      {session.state === 'failed' && !session.error && (
        <Callout variant="warning" role="alert" className="text-sm">
          Couldn't establish a direct connection. Try a different network.
        </Callout>
      )}
    </ScreenContainer>
  )
}
