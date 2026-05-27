import { FormEvent, KeyboardEvent, useEffect, useState } from 'react'
import { Button } from '../components/Button'
import { Callout } from '../components/Callout'
import { Chat } from '../components/Chat'
import { CopyBox } from '../components/CopyBox'
import { Heading } from '../components/Heading'
import { LiveRegion } from '../components/LiveRegion'
import { ScreenContainer, useScreenChrome } from '../components/ScreenChrome'
import { Spinner } from '../components/Spinner'
import { Textarea } from '../components/Textarea'
import { decode } from '../core/encoding'
import { currentOfferUrl, readHashParam } from '../core/url'
import type { ChatSession } from '../hooks/useChatSession'
import { useFocusOnMount } from '../hooks/useFocusOnMount'
import { usePageTitle } from '../hooks/usePageTitle'
import { useVisualViewportHeight } from '../hooks/useVisualViewportHeight'
import type { ConnectionState } from '../core/rtc'

interface Props {
  session: ChatSession
  /** FEAT-012: the conversation this Offerer run is bound to. Home owns the
   *  generator — fresh UUID for new chats, existing id for Resume. */
  conversationId: string
  onCancel: () => void
}

// FEAT-008: the polite-defer reply view shows a one-sentence info Callout
// and live-region status explaining why the form they just submitted has
// been replaced by a CopyBox. Wording is factual and non-blaming per the
// ticket's "Notes for the implementer" — no "error" / "wrong" framing.
const POLITE_DEFER_MESSAGE =
  "That's an invite, not a reply. Sending a reply back to your friend instead — copy the code below."

// Pull the offer code out of a paste that may be either the bare encoded
// payload or a full invite URL (`https://…/#offer=<code>`). Whitespace is
// trimmed either way. Returns the encoded code unchanged if no `offer=`
// param is present — the decoder downstream will surface a malformed-input
// error if it really is garbage.
function extractOfferCode(raw: string): string {
  const trimmed = raw.trim()
  // `URL` parsing tolerates the full invite shape; fall through to bare-code
  // handling for anything else (including the bare encoded string).
  try {
    const url = new URL(trimmed)
    const fromHash = readHashParam(url.hash, 'offer')
    if (fromHash) return fromHash
  } catch {
    // Not a URL — fall through. The user pasted the bare code (or junk).
  }
  // Also accept a free-floating `offer=…` fragment without a scheme.
  if (trimmed.includes('offer=')) {
    const fromBare = readHashParam(trimmed, 'offer')
    if (fromBare) return fromBare
  }
  return trimmed
}

// Inspect the pasted reply code and figure out whether it's the expected
// answer SDP or — per FEAT-008's polite-peer recovery — the other peer's
// offer SDP. Returns `'answer'` / `'offer'` / `null` (decode failed or the
// payload isn't an SDP at all; existing submit-answer error path takes
// over).
function classifyPastedCode(code: string): 'answer' | 'offer' | null {
  try {
    const decoded = decode<{ type?: unknown }>(code)
    if (decoded && (decoded.type === 'offer' || decoded.type === 'answer')) {
      return decoded.type
    }
  } catch {
    // Malformed input — defer to the existing error path.
  }
  return null
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

export function Offerer({ session, conversationId, onCancel }: Props) {
  const [answerDraft, setAnswerDraft] = useState('')
  // FEAT-008: tracks whether the user pasted another peer's offer into the
  // reply box. Once true, the screen swaps from the invite view to the
  // Joiner-style "Send this code back" reply view and stays there until the
  // session reaches `connected`/`closed` or the user cancels (which
  // unmounts the screen entirely).
  const [politelyDeferred, setPolitelyDeferred] = useState(false)
  const isConnected = session.state === 'connected'
  const isClosed = session.state === 'closed'
  usePageTitle(
    isConnected
      ? 'Connected · P2P Chat'
      : isClosed
        ? 'Connection lost · P2P Chat'
        : politelyDeferred
          ? 'Send your reply code · P2P Chat'
          : 'Invite a friend · P2P Chat',
  )
  // Refocus when the rendered branch swaps (invite ↔ reply ↔ connected ↔
  // closed) so the user lands on a meaningful starting point instead of being
  // dropped to <body>. The focus target on each branch is the primary action
  // (not the heading): invite → CopyBox's Copy button (handled internally via
  // `autoFocus`), reply (polite-defer) → reply CopyBox's Copy button (same),
  // connected → Chat input (handled by Chat), closed → the "Return home"
  // restart button.
  const branch: 'connected' | 'closed' | 'reply' | 'invite' = isConnected
    ? 'connected'
    : isClosed
      ? 'closed'
      : politelyDeferred
        ? 'reply'
        : 'invite'
  // In a showcase context the host page owns initial focus; skip the focus
  // call so the previews don't race each other to steal it. See A11Y-022.
  const { suppressInitialFocus } = useScreenChrome()
  const restartRef = useFocusOnMount<HTMLButtonElement>([branch], {
    skip: suppressInitialFocus || branch !== 'closed',
  })
  // IMPRV-017: bind the connected shell to `visualViewport.height` so the
  // composer stays above the iOS soft keyboard. No-op on every other branch
  // (and on browsers without `visualViewport`).
  useVisualViewportHeight(branch === 'connected')

  // Kick off offer generation on first mount; the hook owns the connection
  // so re-renders won't restart it. FEAT-012: pass the conversation id so
  // the hook can seed the transcript before the channel opens (AC#16/#25/#26).
  useEffect(() => {
    if (session.state === 'idle') void session.startAsOfferer(conversationId)
  }, [session, conversationId])

  // Shared dispatch — both the form submit and the Enter key path route
  // through here so there's no way to bypass the polite-peer detection by
  // picking one input affordance over the other (FEAT-003 coordination).
  const dispatchReply = (raw: string) => {
    const trimmed = raw.trim()
    if (!trimmed) return
    const code = extractOfferCode(trimmed)
    const kind = classifyPastedCode(code)
    if (kind === 'offer') {
      setPolitelyDeferred(true)
      void session.politelyAcceptOffer(code)
      return
    }
    // Answer SDPs and undecodable payloads both flow through submitAnswer:
    // the hook's existing error path surfaces decode failures as a
    // user-facing `session.error`, identical to today's behaviour.
    void session.submitAnswer(code)
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    dispatchReply(answerDraft)
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
    dispatchReply(answerDraft)
  }

  // FEAT-008: while we're in the polite-defer branch, the live-region
  // surfaces the transition explanation instead of the normal connection
  // status string. The wrapper element stays mounted across branches so
  // assistive tech actually announces the content change (LiveRegion docs).
  const liveStatusMessage =
    politelyDeferred && !isConnected && !isClosed
      ? POLITE_DEFER_MESSAGE
      : statusMessage(session.state, !!session.encodedLocal)
  const liveStatus = <LiveRegion>{liveStatusMessage}</LiveRegion>

  if (isConnected) {
    return (
      <ScreenContainer
        label="Connected"
        // IMPRV-024: `pb-[max(env(safe-area-inset-bottom),0.25rem)]` replaces
        // the bare `pb-1` so the composer sits above the iOS home-indicator
        // pill in standalone (where the inset is ~34px) while preserving the
        // 0.25rem breathing room in browser tabs (where `env(...)` is `0px`).
        // The `max()` form is what avoids the double-count the ticket warns
        // about — `useVisualViewportHeight` writes a bare pixel value to
        // `--vvh`, so the inset is owned here, not by the hook.
        className="mx-auto flex h-[var(--vvh)] max-w-xl flex-col gap-3 overflow-hidden px-4 pt-6 pb-[max(env(safe-area-inset-bottom),0.25rem)]">
        {liveStatus}
        <header className="flex items-center justify-between">
          {/* No focus ref here — Chat takes focus on the message input via
              FEAT-002, which is the meaningful starting point on the
              connected screen. */}
          <Heading level={1} size="sm">
            Connected
          </Heading>
          <Button variant="secondary" size="sm" onClick={onCancel}>
            End chat
          </Button>
        </header>
        <Chat
          messages={session.messages}
          onSend={session.send}
          hasResumed={session.hasResumed}
          lastReadMessageId={session.lastReadMessageId}
          onMarkRead={session.markRead}
        />
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
        <Heading level={1}>Connection lost</Heading>
        <p className="text-stone-700 dark:text-stone-300">
          The chat ended. Your friend may have closed the tab, or the network dropped. Your transcript is saved — you
          can resume from home.
        </p>
        <Button ref={restartRef} variant="primary" size="lg" onClick={onCancel}>
          Return home
        </Button>
      </ScreenContainer>
    )
  }

  if (politelyDeferred) {
    // FEAT-008: polite-peer reply view. Visually mirrors the Joiner's reply
    // branch (`Heading` + info Callout + `CopyBox` + Cancel) so we reuse the
    // same affordances rather than open-coding parallel styling.
    return (
      <ScreenContainer label="Send this code back" className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-12">
        {liveStatus}
        <header className="flex items-start justify-between">
          <div>
            <Heading level={1}>Send this code back</Heading>
            <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
              Once they paste it, the connection opens and the chat starts automatically.
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        </header>

        {/* Sighted users get the same explanation the live region announces
            to AT, so the screen change doesn't look like a mystery jump. */}
        <Callout variant="info">{POLITE_DEFER_MESSAGE}</Callout>

        {session.state === 'gathering' && (
          <Callout variant="info" className="inline-flex items-center gap-2">
            <Spinner />
            Preparing reply (gathering network candidates)…
          </Callout>
        )}

        {session.encodedLocal && (
          <CopyBox
            label="Reply code"
            value={session.encodedLocal}
            helpText="Paste this back in the same conversation. Waiting for them to accept…"
            autoFocus={!suppressInitialFocus}
          />
        )}

        {session.error && (
          <Callout variant="error" role="alert">
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

  // FEAT-012 AC#6: the invite URL carries the conversation id alongside the
  // encoded SDP so the joining peer can mirror the conversation locally.
  const offerUrl = session.encodedLocal && currentOfferUrl(session.encodedLocal, conversationId)

  return (
    <ScreenContainer label="Invite your friend" className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-12">
      {liveStatus}
      <header className="flex items-start justify-between">
        <div>
          <Heading level={1}>Invite your friend</Heading>
          <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
            Keep this tab open — your friend's reply lands here.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </header>

      {session.state === 'gathering' && (
        <Callout variant="info" className="inline-flex items-center gap-2">
          <Spinner />
          Preparing invite (gathering network candidates)…
        </Callout>
      )}

      {offerUrl && (
        <CopyBox
          label="Invite URL"
          value={offerUrl}
          helpText="Send this link to your friend in Teams, SMS, email — any channel works."
          variant="url"
          autoFocus={!suppressInitialFocus}
          // FEAT-014: on mobile browsers with Web Share support, CopyBox
          // renders a Share button that opens the OS share sheet pre-filled
          // with the invite URL — collapsing the multi-app context switch
          // (copy → leave tab → open Teams/SMS → paste → send) to one tap. On
          // unsupported browsers the prop is silently inert; Copy remains
          // the only affordance, exactly as before FEAT-014.
          share={{
            title: 'Invite to chat',
            text: 'Join my P2P chat:',
            url: offerUrl,
          }}
        />
      )}

      {session.encodedLocal && (
        <form onSubmit={onSubmit} className="flex flex-col gap-2">
          <label htmlFor="answer-input" className="text-sm font-medium text-stone-800 dark:text-stone-200">
            Paste their reply code
          </label>
          <p id="answer-help" className="text-xs text-stone-600 dark:text-stone-400">
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
