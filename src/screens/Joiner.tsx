import { useMemo, useState } from 'react'
import { Button } from '../components/Button'
import { Callout } from '../components/Callout'
import { Chat } from '../components/Chat'
import { CopyBox } from '../components/CopyBox'
import { Heading } from '../components/Heading'
import { LiveRegion } from '../components/LiveRegion'
import { ScreenContainer, useScreenChrome } from '../components/ScreenChrome'
import type { ChatSession } from '../hooks/useChatSession'
import { useFocusOnMount } from '../hooks/useFocusOnMount'
import { usePageTitle } from '../hooks/usePageTitle'
import type { ConnectionState } from '../core/rtc'

interface Props {
  session: ChatSession
  offerCode: string
  /** FEAT-012: conversation id extracted from the `conv` hash param. Null on
   *  pre-FEAT-012 invites; Joiner falls back to a fresh UUID so the chat
   *  still persists locally (just not under the inviter's id). */
  conversationId: string | null
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
// `branch` keeps the announcement honest when the underlying state was leaked
// from a prior offerer flow (BUG-007): on the invite branch we don't want to
// announce "Reply code ready" just because the shared hook is still in
// `awaiting-answer` from Bob's abandoned offer.
function statusMessage(state: ConnectionState, hasLocal: boolean, branch: 'invite' | 'reply' | 'other'): string {
  if (branch === 'invite') return ''
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

export function Joiner({ session, offerCode, conversationId, onCancel }: Props) {
  const [accepted, setAccepted] = useState(false)
  usePageTitle(joinerTitle(session.state, accepted))

  // FEAT-012: if the inviter sent a pre-FEAT-012 URL with no `conv` param,
  // we mint a fresh UUID locally. Stable for the lifetime of the Joiner
  // screen so the hook's `conversationId` doesn't churn between effects.
  const effectiveConvId = useMemo(() => conversationId ?? crypto.randomUUID(), [conversationId])

  // Dispatch from the click handler (not useEffect) so the hook's synchronous
  // state updates batch with `setAccepted` — otherwise the reply branch paints
  // one frame with the stale `encodedLocal` (Bob's offer SDP) before the
  // teardown runs, which is the BUG-007 leak vector. `awaiting-answer` is the
  // hand-off from a prior offerer flow on the same shared hook (`App.tsx`
  // owns `useChatSession` and reuses it across routes); `idle` is the normal
  // fresh-mount case.
  const onAccept = () => {
    setAccepted(true)
    if (session.state === 'idle') {
      void session.startAsAnswerer(offerCode, effectiveConvId)
    } else if (session.state === 'awaiting-answer') {
      void session.politelyAcceptOffer(offerCode, effectiveConvId)
    }
  }

  // Joiner has four branches (invite → reply-code → connected → closed).
  // Each focuses its primary action (not the heading) so keyboard users can
  // act immediately: invite → Accept button, reply → CopyBox's Copy button
  // (handled internally via `autoFocus`), connected → Chat input (handled by
  // Chat), closed → "Return home" restart button. `closed` is the
  // post-connect drop view added for BUG-005.
  const branch: 'connected' | 'closed' | 'invite' | 'reply' =
    session.state === 'connected' ? 'connected' : session.state === 'closed' ? 'closed' : accepted ? 'reply' : 'invite'
  // In a showcase context the host page owns initial focus; skip the focus
  // call so the previews don't race each other to steal it. See A11Y-022.
  const { suppressInitialFocus } = useScreenChrome()
  const acceptRef = useFocusOnMount<HTMLButtonElement>([branch], {
    skip: suppressInitialFocus || branch !== 'invite',
  })
  const restartRef = useFocusOnMount<HTMLButtonElement>([branch], {
    skip: suppressInitialFocus || branch !== 'closed',
  })

  const liveBranchKind = branch === 'invite' ? 'invite' : branch === 'reply' ? 'reply' : 'other'
  const liveStatus = <LiveRegion>{statusMessage(session.state, !!session.encodedLocal, liveBranchKind)}</LiveRegion>

  if (branch === 'connected') {
    return (
      <ScreenContainer
        label="Connected"
        className="mx-auto flex h-[calc(100dvh-3rem)] max-w-xl flex-col gap-3 overflow-hidden px-4 py-6">
        {liveStatus}
        <header className="flex items-center justify-between">
          {/* No focus ref here — Chat owns focus via FEAT-002 (input is the
              meaningful starting point on the connected screen). */}
          <Heading level={1} size="sm">
            Connected
          </Heading>
          <Button variant="secondary" size="sm" onClick={onCancel}>
            End chat
          </Button>
        </header>
        <Chat messages={session.messages} onSend={session.send} hasResumed={session.hasResumed} />
      </ScreenContainer>
    )
  }

  if (branch === 'closed') {
    // Post-connect drop: the chat was live and just ended. Don't render the
    // stale reply-code CopyBox — that code is bound to the now-closed
    // PeerConnection and can't be reused. The single CTA resets the session
    // and routes home (`onCancel` is wired to App.goHome). See BUG-005.
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

  if (branch === 'invite') {
    return (
      <ScreenContainer
        label="You've been invited to chat"
        className="mx-auto flex max-w-xl flex-col items-center gap-6 px-4 py-12 text-center">
        <Heading level={1}>You've been invited to chat</Heading>
        <p className="text-stone-700 dark:text-stone-300">
          Accepting opens a direct, peer-to-peer connection. You'll receive a short reply code to send back to your
          friend.
        </p>
        <div className="flex gap-3">
          <Button ref={acceptRef} variant="primary" size="lg" onClick={onAccept}>
            Accept
          </Button>
          <Button variant="secondary" size="lg" onClick={onCancel}>
            Decline
          </Button>
        </div>
      </ScreenContainer>
    )
  }

  return (
    <ScreenContainer label="Send this code back" className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-12">
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

      {liveStatus}

      {session.state === 'gathering' && (
        <Callout variant="info">Preparing reply (gathering network candidates)…</Callout>
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
