import { useRef, useState } from 'react'
import { Button } from '../components/Button'
import { Callout } from '../components/Callout'
import { Heading } from '../components/Heading'
import { LiveRegion } from '../components/LiveRegion'
import { ScreenContainer, useScreenChrome } from '../components/ScreenChrome'
import { useFocusOnMount } from '../hooks/useFocusOnMount'
import { usePageTitle } from '../hooks/usePageTitle'
import { useConversations } from '../hooks/useConversations'
import { copyTextToClipboard } from '../core/clipboard'
import { listMessages, type ConversationRecord } from '../core/storage'
import { formatTranscript } from '../core/transcript'
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
  // CR-009: announce copy outcomes via the Home-level LiveRegion so AT
  // hears one stable region across all rows. Per-row mount churn would
  // silence the announcement.
  onAnnounce: (text: string) => void
  // CR-008: menu open state is lifted to `Home` so at most one row's menu is
  // open at a time and outside-click / Escape can dismiss from anywhere.
  isMenuOpen: boolean
  onOpenMenu: () => void
  onCloseMenu: () => void
}

// CR-009: how long the inline "Copied transcript" badge stays visible
// before auto-dismissing. Matches FEAT-011's `COPY_FLASH_MS` in Chat.tsx so
// the two surfaces feel consistent.
const COPY_FLASH_MS = 1500

function ConversationRow({
  record,
  onResume,
  onRename,
  onDelete,
  onAnnounce,
  isMenuOpen,
  onOpenMenu,
  onCloseMenu,
}: RowProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [preview, setPreview] = useState<string | null>(null)
  // CR-009: tracked alongside `preview` from the same IDB read so the menu
  // can render "Copy transcript" as disabled when the conversation has
  // zero messages. Avoids a second IDB hit at click time.
  const [hasMessages, setHasMessages] = useState(false)
  // CR-009: row-local copy feedback. `'copied'` shows the inline badge
  // (auto-dismissed); `'manual'` shows the Ctrl+C / Cmd+C hint and keeps
  // the fallback textarea selected.
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'manual'>('idle')
  // CR-008: refs for the outside-click + Escape contract. The container wraps
  // both the trigger and the popover so clicking the trigger while the menu
  // is open continues to act as a toggle (the outside-click handler ignores
  // events whose target is inside the container).
  const containerRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  // CR-009: hidden fallback textarea for the legacy `execCommand('copy')`
  // path. Always-mounted so the ref is stable; written + selected only
  // inside the copy handler via the shared `copyTextToClipboard` helper.
  const fallbackTextareaRef = useRef<HTMLTextAreaElement | null>(null)
  // setTimeout handle for the inline "Copied transcript" auto-dismiss.
  // Cleared on unmount so a fast remount doesn't fire into a dead row.
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
  // storage fails — the row still renders, just without the peek. CR-009
  // extends this to also track `hasMessages` from the same fetch so the
  // row menu can render "Copy transcript" disabled for empty rows without
  // a second IDB round-trip at click time.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const msgs = await listMessages(record.id)
        if (cancelled) return
        if (msgs.length === 0) {
          setPreview(null)
          setHasMessages(false)
        } else {
          const last = msgs[msgs.length - 1]
          // Truncate ~50 chars per AC #18.
          const text = last.text.length > 50 ? `${last.text.slice(0, 47)}…` : last.text
          setPreview(text)
          setHasMessages(true)
        }
      } catch {
        setPreview(null)
        setHasMessages(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [record.id, record.lastActivityAt])

  // CR-009: tear down any pending "Copied transcript" flash timer on unmount
  // so the setState callback doesn't fire against a dead row (mirrors
  // FEAT-011's pattern in Chat.tsx).
  useEffect(() => {
    return () => {
      if (flashTimerRef.current) {
        clearTimeout(flashTimerRef.current)
        flashTimerRef.current = null
      }
    }
  }, [])

  // CR-009: schedule the auto-dismiss of the inline "Copied transcript"
  // badge. Replaces any in-flight timer so back-to-back copies restart the
  // window instead of compounding.
  const scheduleCopyFlashDismiss = () => {
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
    flashTimerRef.current = setTimeout(() => {
      setCopyState('idle')
      flashTimerRef.current = null
    }, COPY_FLASH_MS)
  }

  // CR-009: load the conversation's messages, format as markdown, and copy
  // to the clipboard via the shared two-tier helper. Defaults match the
  // in-chat toolbar (`includeTimestamps: true`); per the ticket there is no
  // toggle UI on the row menu — a single click does a single thing.
  const onCopyTranscript = async () => {
    onCloseMenu()
    // Defensive guard — the disabled state on the menu item should prevent
    // this from ever firing for an empty conversation, but a stale render
    // (e.g. messages purged in another tab) shouldn't silently succeed
    // with an empty clipboard.
    if (!hasMessages) return
    const msgs = await listMessages(record.id)
    if (msgs.length === 0) return
    const markdown = formatTranscript(msgs, { includeTimestamps: true })
    const result = await copyTextToClipboard(markdown, fallbackTextareaRef.current)
    setCopyState(result)
    if (result === 'copied') {
      onAnnounce('Transcript copied to clipboard')
      scheduleCopyFlashDismiss()
    } else {
      // The fallback textarea is already selected; the visible Callout
      // below + this LiveRegion message together explain the state.
      onAnnounce('Transcript selected. Press Control C or Command C to copy.')
    }
  }

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
                {/* CR-009: Copy transcript sits between Rename and Delete.
                    Delete is destructive and stays last per the ticket. The
                    item disables when the row has no messages — silently
                    succeeding with an empty clipboard is a worse UX. */}
                <button
                  type="button"
                  role="menuitem"
                  disabled={!hasMessages}
                  onClick={() => void onCopyTranscript()}
                  className="block w-full rounded px-2 py-1 text-left text-sm hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-stone-800">
                  Copy transcript
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
      {/* CR-009: row-local copy feedback. The badge is aria-hidden — the
          LiveRegion at the screen level is the AT surface, matching FEAT-011's
          shape in Chat.tsx. */}
      {copyState === 'copied' && (
        <Callout variant="success" aria-hidden="true">
          Copied transcript
        </Callout>
      )}
      {copyState === 'manual' && (
        <Callout variant="warning" className="text-xs font-medium">
          Press Ctrl+C / Cmd+C to copy
        </Callout>
      )}
      {/* CR-009: hidden fallback textarea for the legacy `execCommand('copy')`
          path. Always mounted (stable ref); offscreen so it doesn't appear in
          tab order or visual layout. aria-hidden so AT ignores it. */}
      <textarea
        ref={fallbackTextareaRef}
        aria-hidden="true"
        tabIndex={-1}
        readOnly
        defaultValue=""
        className="absolute left-[-9999px] h-px w-px opacity-0"
      />
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
  // CR-009: one screen-level LiveRegion so AT receives copy-outcome
  // announcements from any row through a stable, always-mounted surface.
  // Per-row mounting would dismount/remount the live region and silence
  // the announcement entirely.
  const [announcement, setAnnouncement] = useState('')

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
                onAnnounce={setAnnouncement}
                isMenuOpen={openMenuId === c.id}
                onOpenMenu={() => setOpenMenuId(c.id)}
                onCloseMenu={() => setOpenMenuId(null)}
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
    </ScreenContainer>
  )
}
