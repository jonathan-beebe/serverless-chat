import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { Callout } from '../components/Callout'
import { ScreenContainer } from '../components/ScreenChrome'
import { readHashParam } from '../core/url'
import { getConversation } from '../core/storage'
import { useSession } from '../SessionContext'
import { Joiner } from '../screens/Joiner'
import { NotFound } from '../screens/NotFound'
import { Offerer } from '../screens/Offerer'

// ARCH-001: decides which chat-surface screen to render for
// `/conversation/:id`. Three branches, in priority order:
//
//   1. We're in the joiner flow for this id — render Joiner. We enter this
//      branch whenever the URL hash carries an `#offer=…` fragment, AND we
//      stay in it (sticky per id) once Joiner has captured the offer and
//      asked us to scrub the fragment. Without the stickiness, scrubbing the
//      hash would flip the route to Offerer mid-acceptance and lose Joiner's
//      reply-code branch.
//   2. The live session is already bound to this id → Offerer. Covers
//      "started the chat in this tab" and "navigated away and came back".
//   3. Persisted record exists for this id → Offerer (resume flow). The
//      Offerer's mount effect calls startAsOfferer once it sees session.idle.
//
// Anything else (unknown id, no live session, no persisted record) renders
// the NotFound screen — explicit empty state with a link home, not a silent
// redirect, not a fresh offerer minted from an unknown id.
type LookupState = 'pending' | 'found' | 'notfound'

export function ConversationRoute() {
  const { id } = useParams<{ id: string }>()
  const session = useSession()
  const location = useLocation()
  const navigate = useNavigate()
  const offerFromHash = readHashParam(location.hash, 'offer')

  // Sticky per-id joiner offer. The ref persists across renders, but resets
  // when the path :id changes (the previous conv's offer doesn't belong
  // to a different conversation). New offers on the same id replace any
  // previous sticky offer (covers the joiner→joiner same-tab navigation
  // case, where two consecutive invites both target the same path :id).
  const stickyOfferRef = useRef<{ id: string; code: string } | null>(null)
  if (id && offerFromHash) {
    stickyOfferRef.current = { id, code: offerFromHash }
  } else if (id && stickyOfferRef.current !== null && stickyOfferRef.current.id !== id) {
    stickyOfferRef.current = null
  }
  const stickyOfferEntry = stickyOfferRef.current
  const stickyOffer = stickyOfferEntry !== null && stickyOfferEntry.id === id ? stickyOfferEntry.code : null

  if (stickyOffer && id) {
    return (
      <Joiner
        session={session}
        offerCode={stickyOffer}
        conversationId={id}
        onCancel={() => {
          session.reset()
          navigate('/')
        }}
        onOfferCaptured={() => {
          // ARCH-001: drop the fragment from the URL bar so the canonical
          // /conversation/<id> URL is what the user sees and can share. The
          // ref above keeps us in the Joiner branch even after the hash is
          // gone, so the joiner's reply / connected / closed sub-states
          // continue to render correctly.
          if (offerFromHash) {
            navigate(`/conversation/${id}`, { replace: true })
          }
        }}
      />
    )
  }

  // Live session for this conversation — render Offerer directly. Skips the
  // async lookup so navigating back from /network into a live chat doesn't
  // flash a loading state.
  if (id && session.conversationId === id) {
    return (
      <Offerer
        session={session}
        conversationId={id}
        onCancel={() => {
          // BUG-011 / BUG-012: tear down the PC/channel so the remote peer
          // observes onclose, and clear the session binding so the next
          // "Start a chat" from Home is not short-circuited by the
          // `state !== 'idle'` guard. Restores the pre-ARCH-001 `goHome`
          // semantics that ARCH-001 inadvertently dropped.
          session.reset()
          navigate('/')
        }}
      />
    )
  }

  if (!id) return <NotFound />

  // Async lookup against the persisted store for the resume case.
  return <ResumeOrNotFound id={id} />
}

function ResumeOrNotFound({ id }: { id: string }) {
  const session = useSession()
  const navigate = useNavigate()
  const [state, setState] = useState<LookupState>('pending')

  useEffect(() => {
    let cancelled = false
    void getConversation(id)
      .then((record) => {
        if (cancelled) return
        setState(record ? 'found' : 'notfound')
      })
      .catch(() => {
        if (cancelled) return
        // Storage failures shouldn't strand the user on a loading spinner.
        // Surface NotFound — the link home still works, and the next mount
        // can retry the lookup.
        setState('notfound')
      })
    return () => {
      cancelled = true
    }
  }, [id])

  if (state === 'pending') {
    // Quiet placeholder — typical IDB lookups resolve in <10ms so this
    // rarely paints. ScreenContainer keeps the landmark structure consistent
    // with the screens that replace it.
    return (
      <ScreenContainer label="Loading conversation" className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-12">
        <Callout variant="info">Loading conversation…</Callout>
      </ScreenContainer>
    )
  }
  if (state === 'notfound') return <NotFound />

  return (
    <Offerer
      session={session}
      conversationId={id}
      onCancel={() => {
        session.reset()
        navigate('/')
      }}
    />
  )
}
