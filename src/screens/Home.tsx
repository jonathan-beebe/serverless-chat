import { useRef, useState } from 'react'
import { Button } from '../components/Button'
import { Heading } from '../components/Heading'
import { ScreenContainer, useScreenChrome } from '../components/ScreenChrome'
import { useFocusOnMount } from '../hooks/useFocusOnMount'
import { usePageTitle } from '../hooks/usePageTitle'
import { useConversations } from '../hooks/useConversations'
import { listMessages, type ConversationRecord } from '../core/storage'
import { useEffect } from 'react'

interface Props {
  /** Called with the conversation id to start the Offerer flow against.
   *  Home generates a fresh UUID for "Start a new chat" and passes the
   *  existing id for "Resume" — both paths route into Offerer the same way. */
  onStart: (conversationId: string) => void
}

// Format a `lastActivityAt` epoch ms into a short relative-time string for
// the conversation row. Kept tiny and English-only on purpose: the design
// system doesn't yet have a `useRelativeTime` primitive, and adding one
// here would creep beyond the ticket's scope. Bins:
//   < 60s   → "just now"
//   < 60min → "<n> minutes ago"
//   today   → "<n> hours ago"
//   yesterday → "yesterday"
//   else    → locale-short date
function formatRelative(at: number, now: number): string {
  const deltaMs = now - at
  const minutes = Math.floor(deltaMs / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  const hours = Math.floor(minutes / 60)
  const atDate = new Date(at)
  const nowDate = new Date(now)
  if (atDate.toDateString() === nowDate.toDateString()) {
    return `${hours} hour${hours === 1 ? '' : 's'} ago`
  }
  const yesterday = new Date(nowDate)
  yesterday.setDate(nowDate.getDate() - 1)
  if (atDate.toDateString() === yesterday.toDateString()) return 'yesterday'
  return atDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// Default "Chat from <date>" label when the user hasn't renamed.
function autoLabel(record: ConversationRecord): string {
  const d = new Date(record.createdAt)
  return `Chat from ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`
}

interface RowProps {
  record: ConversationRecord
  onResume: () => void
  onRename: (label: string) => void
  onDelete: () => void
  // CR-008: menu open state is lifted to `Home` so at most one row's menu is
  // open at a time and outside-click / Escape can dismiss from anywhere.
  isMenuOpen: boolean
  onOpenMenu: () => void
  onCloseMenu: () => void
}

function ConversationRow({ record, onResume, onRename, onDelete, isMenuOpen, onOpenMenu, onCloseMenu }: RowProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [preview, setPreview] = useState<string | null>(null)
  // CR-008: refs for the outside-click + Escape contract. The container wraps
  // both the trigger and the popover so clicking the trigger while the menu
  // is open continues to act as a toggle (the outside-click handler ignores
  // events whose target is inside the container).
  const containerRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)

  // CR-008: while this row's menu is open, listen for pointerdown anywhere
  // outside the trigger+menu wrapper (dismiss) and Escape (dismiss + restore
  // focus to the trigger). Gated on `isMenuOpen` so nothing runs when closed.
  // `pointerdown` (not `click`) matches the dismiss timing of native menus and
  // avoids a focus-thrash where the click would fire after the next render.
  useEffect(() => {
    if (!isMenuOpen) return
    const onPointerDown = (e: PointerEvent) => {
      const container = containerRef.current
      if (container && !container.contains(e.target as Node)) onCloseMenu()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseMenu()
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [isMenuOpen, onCloseMenu])

  // Best-effort peek: load the conversation's last message body on mount so
  // each row can show a one-line snippet. Skipping the load gracefully if
  // storage fails — the row still renders, just without the peek.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const msgs = await listMessages(record.id)
        if (cancelled) return
        if (msgs.length === 0) {
          setPreview(null)
        } else {
          const last = msgs[msgs.length - 1]
          // Truncate ~50 chars per AC #18.
          const text = last.text.length > 50 ? `${last.text.slice(0, 47)}…` : last.text
          setPreview(text)
        }
      } catch {
        setPreview(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [record.id, record.lastActivityAt])

  const startRename = () => {
    setDraft(record.label ?? '')
    setEditing(true)
    onCloseMenu()
  }

  const saveRename = () => {
    onRename(draft)
    setEditing(false)
  }

  const cancelRename = () => {
    setDraft('')
    setEditing(false)
  }

  const doDelete = () => {
    onCloseMenu()
    // window.confirm is the pragmatic v1 choice — the design system doesn't
    // yet have a real confirm dialog primitive. AC#20 names exact wording.
    const ok = window.confirm("Delete this chat from your device? This won't notify the other person.")
    if (!ok) return
    onDelete()
  }

  const label = record.label && record.label.length > 0 ? record.label : autoLabel(record)

  return (
    <li
      data-testid={`conversation-row-${record.id}`}
      className="flex items-center justify-between gap-3 rounded-md border border-stone-300 bg-white/50 p-3 dark:border-stone-700 dark:bg-stone-900/50">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-left">
        {editing ? (
          <div className="flex items-center gap-2">
            <input
              aria-label="Rename chat"
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  saveRename()
                } else if (e.key === 'Escape') {
                  e.preventDefault()
                  cancelRename()
                }
              }}
              className="flex-1 rounded border border-stone-300 bg-white px-2 py-1 text-sm dark:border-stone-600 dark:bg-stone-800"
            />
            <Button variant="primary" size="sm" onClick={saveRename}>
              Save
            </Button>
            <Button variant="secondary" size="sm" onClick={cancelRename}>
              Cancel
            </Button>
          </div>
        ) : (
          <>
            <span className="truncate text-sm font-medium text-stone-900 dark:text-stone-100">{label}</span>
            <span className="text-xs text-stone-600 dark:text-stone-400">
              {formatRelative(record.lastActivityAt, Date.now())}
            </span>
            <span className="truncate text-xs text-stone-500 dark:text-stone-400">
              {preview === null ? <em>No messages yet</em> : preview}
            </span>
          </>
        )}
      </div>
      {!editing && (
        <div className="flex items-center gap-2">
          <Button variant="primary" size="sm" onClick={onResume}>
            Resume
          </Button>
          <div ref={containerRef} className="relative">
            <Button
              ref={triggerRef}
              variant="secondary"
              size="sm"
              aria-label="More actions"
              aria-haspopup="menu"
              aria-expanded={isMenuOpen}
              onClick={() => (isMenuOpen ? onCloseMenu() : onOpenMenu())}>
              ⋯
            </Button>
            {isMenuOpen && (
              <div
                role="menu"
                className="absolute right-0 z-10 mt-1 min-w-[10rem] rounded-md border border-stone-300 bg-white p-1 shadow-md dark:border-stone-700 dark:bg-stone-900">
                <button
                  type="button"
                  role="menuitem"
                  onClick={startRename}
                  className="block w-full rounded px-2 py-1 text-left text-sm hover:bg-stone-100 dark:hover:bg-stone-800">
                  Rename
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={doDelete}
                  className="block w-full rounded px-2 py-1 text-left text-sm text-red-700 hover:bg-stone-100 dark:text-red-300 dark:hover:bg-stone-800">
                  Delete chat
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </li>
  )
}

export function Home({ onStart }: Props) {
  usePageTitle('P2P Chat')
  // In a showcase context the host page owns initial focus; the screen
  // would otherwise race siblings to programmatically focus its heading and
  // teleport AT users mid-page. See A11Y-022.
  const { suppressInitialFocus } = useScreenChrome()
  const startRef = useFocusOnMount<HTMLButtonElement>([], { skip: suppressInitialFocus })
  const { conversations, remove, rename } = useConversations()
  // CR-008: at most one row's "More actions" menu is open at a time. Lifting
  // this state here gives us the single-open invariant for free — opening
  // row B flips row A's `isMenuOpen` prop to false on the same render.
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)

  const startNew = () => {
    // FEAT-012 AC#5: generate the conversation ID at "Start" click, before
    // any offer is created. Stable across the offerer / awaiting-answer /
    // connected states for the session.
    onStart(crypto.randomUUID())
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
      {conversations !== null && conversations.length > 0 && (
        <section aria-label="Past conversations" className="w-full text-left">
          <h2 className="mb-2 text-sm font-semibold text-stone-700 dark:text-stone-300">Past chats</h2>
          <ul className="flex flex-col gap-2">
            {conversations.map((c) => (
              <ConversationRow
                key={c.id}
                record={c}
                onResume={() => onStart(c.id)}
                onRename={(label) => void rename(c.id, label)}
                onDelete={() => void remove(c.id)}
                isMenuOpen={openMenuId === c.id}
                onOpenMenu={() => setOpenMenuId(c.id)}
                onCloseMenu={() => setOpenMenuId(null)}
              />
            ))}
          </ul>
        </section>
      )}
      <details className="w-full rounded-md border border-stone-300 bg-white/50 p-3 text-left text-sm text-stone-700 open:bg-white dark:border-stone-700 dark:bg-stone-900/50 dark:text-stone-300 dark:open:bg-stone-900">
        <summary className="cursor-pointer text-stone-800 dark:text-stone-200">How does this work?</summary>
        <p className="mt-2">
          You'll get an invite URL to send to your friend via any channel you already use (Teams, SMS, email). They open
          the URL, send back a short reply code, and your browsers connect directly over WebRTC. The chat itself never
          touches a server.
        </p>
      </details>
    </ScreenContainer>
  )
}
