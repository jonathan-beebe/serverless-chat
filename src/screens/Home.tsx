import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/Button'
import { ConversationRow } from '../components/ConversationRow'
import { Heading } from '../components/Heading'
import { InstallPrompt } from '../components/InstallPrompt'
import { LiveRegion } from '../components/LiveRegion'
import { ScreenContainer, useScreenChrome } from '../components/ScreenChrome'
import { useFocusOnMount } from '../hooks/useFocusOnMount'
import { usePageTitle } from '../hooks/usePageTitle'
import { useConversations } from '../hooks/useConversations'
import { useSession } from '../SessionContext'

// ARCH-001: a session is "live" for badge purposes when it's bound to a
// conversation id and the connection state is anything in the negotiation /
// connected window. `'closed'` and `'failed'` are intentionally excluded —
// they reach the past-chats row via persistence, not via the live marker.
const LIVE_STATES = new Set(['gathering', 'awaiting-answer', 'connecting', 'connected'])

export function Home() {
  usePageTitle('P2P Chat')
  // In a showcase context the host page owns initial focus; the screen
  // would otherwise race siblings to programmatically focus its heading and
  // teleport AT users mid-page. See A11Y-022.
  const { suppressInitialFocus } = useScreenChrome()
  const startRef = useFocusOnMount<HTMLButtonElement>([], { skip: suppressInitialFocus })
  const { conversations, remove, rename } = useConversations()
  const session = useSession()
  const navigate = useNavigate()
  // CR-008: at most one row's "More actions" menu is open at a time. Lifting
  // this state here gives us the single-open invariant for free — opening
  // row B flips row A's `isMenuOpen` prop to false on the same render.
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  // CR-009: one screen-level LiveRegion so AT receives copy-outcome
  // announcements from any row through a stable, always-mounted surface.
  // Per-row mounting would dismount/remount the live region and silence
  // the announcement entirely.
  const [announcement, setAnnouncement] = useState('')

  // ARCH-001: a row is "live" when its conversation matches the session that
  // App owns (across route changes). Anything outside the negotiation /
  // connected window doesn't earn the badge — `'closed'` and `'failed'`
  // surface via persistence, not the live marker.
  const liveConversationId = session.conversationId && LIVE_STATES.has(session.state) ? session.conversationId : null

  const startNew = () => {
    // FEAT-012 AC#5: generate the conversation ID at "Start" click, before
    // any offer is created. Stable across the offerer / awaiting-answer /
    // connected states for the session.
    //
    // ARCH-001: pre-bind the session to the new conversation id BEFORE
    // navigating. ConversationRoute's "no live session, no persisted record →
    // NotFound" branch would otherwise fire for the freshly-minted id (the
    // record doesn't exist yet; the session isn't bound yet). startAsOfferer
    // synchronously sets `conversationId` and transitions to `'gathering'`,
    // so by the time React commits the navigate() call ConversationRoute
    // already sees session.conversationId === newId and renders Offerer.
    const newId = crypto.randomUUID()
    void session.startAsOfferer(newId)
    navigate(`/conversation/${newId}`)
  }

  return (
    <ScreenContainer label="Home" className="mx-auto flex max-w-xl flex-col items-center gap-6 px-4 py-12 text-center">
      <Heading level={1}>Serverless P2P Chat</Heading>
      <p className="text-stone-700 dark:text-stone-300">
        Two people, one shared link. Real-time chat directly between your browsers — no chat server, no accounts. Your
        chats stay on your device; nothing is uploaded.
      </p>
      <Button ref={startRef} variant="primary" size="lg" onClick={startNew}>
        Start a chat
      </Button>
      {/* Conversation list. Null while the first load is in flight (no flash
          of empty state); [] thereafter if there are no prior chats. */}
      {/* A11Y-032: <section> deliberately has no `aria-label` — the visible
          <h2> "Past chats" is the authoritative name and the heading shortcut
          is the canonical entry point. The prior shape `aria-label="Past
          conversations"` both conflicted with the visible heading and
          promoted the section to a landmark slot it didn't earn. */}
      {conversations !== null && conversations.length > 0 && (
        <section className="w-full text-left">
          <h2 className="mb-2 text-sm font-semibold text-stone-700 dark:text-stone-300">Past chats</h2>
          <ul className="flex flex-col gap-2">
            {conversations.map((c) => (
              <ConversationRow
                key={c.id}
                record={c}
                onRename={(label) => void rename(c.id, label)}
                onDelete={() => void remove(c.id)}
                onAnnounce={setAnnouncement}
                isMenuOpen={openMenuId === c.id}
                onOpenMenu={() => setOpenMenuId(c.id)}
                onCloseMenu={() => setOpenMenuId(null)}
                isLive={liveConversationId === c.id}
              />
            ))}
          </ul>
        </section>
      )}
      {/* CR-009 live region for copy outcomes. Stays mounted across renders
          so screen readers receive content-change announcements; quiet
          string between events keeps the region from making noise. */}
      <LiveRegion>{announcement}</LiveRegion>
      <details className="w-full rounded-md border border-stone-300 bg-white/50 p-3 text-left text-sm text-stone-700 open:bg-white dark:border-stone-700 dark:bg-stone-900/50 dark:text-stone-300 dark:open:bg-stone-900">
        <summary className="cursor-pointer text-stone-800 dark:text-stone-200">How does this work?</summary>
        <p className="mt-2">
          You'll get an invite URL to send to your friend via any channel you already use (Teams, SMS, email). They open
          the URL, send back a short reply code, and your browsers connect directly over WebRTC. The chat itself never
          touches a server.
        </p>
      </details>
      {/* FEAT-015: install affordance sits in the same quiet status row as
          the commit hash (IMPRV-018 precedent). The component self-hides when
          the browser hasn't fired `beforeinstallprompt`, when the user is
          already standalone, or after the captured prompt has been spent —
          so the row collapses to just the commit hash on iOS Safari /
          Firefox / installed-PWA contexts. */}
      <div className="flex flex-col items-center gap-2">
        <InstallPrompt />
        {/* IMPRV-018: short commit SHA (literal "dev" when git was unavailable
            at build time). Constant per build via vite's `define`; no runtime
            cost beyond a text node. Plain text — no link, no copy affordance —
            so it sits quietly as a triage anchor. */}
        <p className="text-xs text-stone-500 dark:text-stone-400">{__COMMIT_HASH__}</p>
      </div>
    </ScreenContainer>
  )
}
