// FEAT-012: per-browser persistence for conversations and their messages,
// backed by IndexedDB so a tab close (or refresh, or laptop nap) doesn't
// nuke the transcript. Two object stores live in a `chat` database:
//
//   conversations: keyed by `id` (UUID). One record per chat the user has
//                  ever started or joined.
//   messages:      keyed by composite `[conversationId, id]`. Indexed on
//                  `conversationId` for the range scan used by listMessages.
//
// No third-party IDB library — the surface is small enough to write directly
// (FEAT-012 AC#1). Tests run against `fake-indexeddb/auto` (see test-setup).
//
// Migration safety: v1 ships at `DB_VERSION = 1` with a fresh schema; future
// schema bumps land here as additive `if (oldVersion < N)` branches. We don't
// ship a migration framework, just leave the seam (AC#3).

const DB_NAME = 'chat'
const DB_VERSION = 1
const STORE_CONVERSATIONS = 'conversations'
const STORE_MESSAGES = 'messages'
const INDEX_CONVERSATION = 'by-conversation'

export interface ConversationRecord {
  id: string
  /** ms since epoch — when Start/Resume created the local record. */
  createdAt: number
  /** ms since epoch — refreshed on every append / bulk-insert. */
  lastActivityAt: number
  /** Optional user-chosen label. Empty/undefined means "use auto-label." */
  label?: string
  /**
   * BUG-006: per-conversation absolute identity for the local peer. Stable
   * across the conv's lifetime (set on first bind / first time we see this
   * conv) so the display layer can resolve `senderId === selfPeerId ?
   * 'me' : 'them'` without any perspective flipping. Absent on pre-fix
   * records — readers fall back to the legacy `from` field on each message.
   */
  selfPeerId?: string
}

export interface MessageRecord {
  conversationId: string
  id: string
  /**
   * BUG-006: absolute author identity (the sender's `selfPeerId` at send
   * time). Both peers store the SAME senderId for the same message, so
   * history merge is pure dedupe-and-insert — no perspective flip needed.
   * Optional only for backward compatibility with records written before
   * the senderId rollout; new writes always include it.
   */
  senderId?: string
  /**
   * Legacy perspective-relative author. Kept on writes so a record written
   * by post-fix code still renders correctly if read by pre-fix display
   * paths (and so pre-fix records keep working through this same field).
   * Resolve order on read: prefer `senderId` against the conv's
   * `selfPeerId`; fall back to `from` if either is missing.
   */
  from: 'me' | 'them'
  text: string
  at: number
}

// Module-local promise so concurrent callers share one open request.
let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available in this environment'))
      return
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      // Additive upgrade pattern. Each `if (oldVersion < N)` block creates
      // the schema introduced in version N — never re-runs once that version
      // has been seen. v1 is the first ship; no prior versions to migrate.
      if (req.transaction) {
        // Reserved for future migrations that need to walk existing data.
      }
      if (!db.objectStoreNames.contains(STORE_CONVERSATIONS)) {
        db.createObjectStore(STORE_CONVERSATIONS, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(STORE_MESSAGES)) {
        const store = db.createObjectStore(STORE_MESSAGES, { keyPath: ['conversationId', 'id'] })
        store.createIndex(INDEX_CONVERSATION, 'conversationId', { unique: false })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

// Test-only escape hatch: drops the cached promise so a wiped fake-indexeddb
// gets re-opened cleanly between tests. Not exported in the public surface.
export function __resetForTests(): void {
  dbPromise = null
}

function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function isConversationRecord(value: unknown): value is ConversationRecord {
  if (value === null || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  if (typeof v.id !== 'string') return false
  if (typeof v.createdAt !== 'number') return false
  if (typeof v.lastActivityAt !== 'number') return false
  if (v.label !== undefined && typeof v.label !== 'string') return false
  if (v.selfPeerId !== undefined && typeof v.selfPeerId !== 'string') return false
  return true
}

function isMessageRecord(value: unknown): value is MessageRecord {
  if (value === null || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  if (typeof v.conversationId !== 'string') return false
  if (typeof v.id !== 'string') return false
  if (v.from !== 'me' && v.from !== 'them') return false
  if (v.senderId !== undefined && typeof v.senderId !== 'string') return false
  if (typeof v.text !== 'string') return false
  if (typeof v.at !== 'number') return false
  return true
}

// Single `console.warn` per malformed record group so a corrupted store
// doesn't flood the console on every Home render. Reset on each call site so
// a follow-up read after the user fixes things still surfaces a fresh warn.
function warnOnce(flag: { fired: boolean }, message: string, ...args: unknown[]): void {
  if (flag.fired) return
  flag.fired = true
  console.warn(message, ...args)
}

export async function listConversations(): Promise<ConversationRecord[]> {
  const db = await openDb()
  const tx = db.transaction(STORE_CONVERSATIONS, 'readonly')
  const store = tx.objectStore(STORE_CONVERSATIONS)
  const all = await wrap(store.getAll())
  const warned = { fired: false }
  const out: ConversationRecord[] = []
  for (const item of all) {
    if (isConversationRecord(item)) {
      out.push(item)
    } else {
      warnOnce(warned, '[storage] dropping malformed conversation record', item)
    }
  }
  // Sort by `lastActivityAt` desc so callers (Home) don't have to.
  out.sort((a, b) => b.lastActivityAt - a.lastActivityAt)
  return out
}

export async function getConversation(id: string): Promise<ConversationRecord | null> {
  const db = await openDb()
  const tx = db.transaction(STORE_CONVERSATIONS, 'readonly')
  const store = tx.objectStore(STORE_CONVERSATIONS)
  const value = await wrap(store.get(id))
  if (value === undefined) return null
  if (!isConversationRecord(value)) {
    console.warn('[storage] dropping malformed conversation record on read', value)
    return null
  }
  return value
}

export async function upsertConversation(record: ConversationRecord): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(STORE_CONVERSATIONS, 'readwrite')
  tx.objectStore(STORE_CONVERSATIONS).put(record)
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

export async function deleteConversation(id: string): Promise<void> {
  const db = await openDb()
  const tx = db.transaction([STORE_CONVERSATIONS, STORE_MESSAGES], 'readwrite')
  // Cascade: remove the conversation row AND every message keyed off it. The
  // composite key on `messages` makes a key-range delete the simplest path —
  // walk the conversationId index, collect the composite keys, and delete.
  tx.objectStore(STORE_CONVERSATIONS).delete(id)
  const msgStore = tx.objectStore(STORE_MESSAGES)
  const idx = msgStore.index(INDEX_CONVERSATION)
  const range = IDBKeyRange.only(id)
  await new Promise<void>((resolve, reject) => {
    const cursorReq = idx.openCursor(range)
    cursorReq.onerror = () => reject(cursorReq.error)
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result
      if (!cursor) {
        resolve()
        return
      }
      cursor.delete()
      cursor.continue()
    }
  })
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

export async function listMessages(conversationId: string): Promise<MessageRecord[]> {
  const db = await openDb()
  const tx = db.transaction(STORE_MESSAGES, 'readonly')
  const idx = tx.objectStore(STORE_MESSAGES).index(INDEX_CONVERSATION)
  const range = IDBKeyRange.only(conversationId)
  const all = await wrap(idx.getAll(range))
  const warned = { fired: false }
  const out: MessageRecord[] = []
  for (const item of all) {
    if (isMessageRecord(item)) {
      out.push(item)
    } else {
      warnOnce(warned, '[storage] dropping malformed message record', item)
    }
  }
  // Sort by `at` ascending so the consumer renders messages in time order.
  out.sort((a, b) => a.at - b.at)
  return out
}

export async function appendMessage(
  conversationId: string,
  message: Omit<MessageRecord, 'conversationId'>,
): Promise<void> {
  const db = await openDb()
  const tx = db.transaction([STORE_MESSAGES, STORE_CONVERSATIONS], 'readwrite')
  const record: MessageRecord = { conversationId, ...message }
  tx.objectStore(STORE_MESSAGES).put(record)
  // Refresh lastActivityAt so Home sorts this conversation to the top.
  const convStore = tx.objectStore(STORE_CONVERSATIONS)
  const existing = await wrap(convStore.get(conversationId))
  const now = message.at
  if (existing && isConversationRecord(existing)) {
    if (existing.lastActivityAt < now) {
      convStore.put({ ...existing, lastActivityAt: now })
    }
  }
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

/**
 * Bulk-insert path used by the resume-merge flow (FEAT-012 AC#11). Dedupes
 * by composite key `[conversationId, id]` — IndexedDB `put` is idempotent,
 * so an already-present id is silently overwritten. Callers (the hook) are
 * expected to have already filtered out IDs they already hold so the
 * "trust local" rule applies before this is called.
 */
export async function bulkInsertMessages(
  conversationId: string,
  messages: Omit<MessageRecord, 'conversationId'>[],
): Promise<void> {
  if (messages.length === 0) return
  const db = await openDb()
  const tx = db.transaction([STORE_MESSAGES, STORE_CONVERSATIONS], 'readwrite')
  const msgStore = tx.objectStore(STORE_MESSAGES)
  let maxAt = 0
  for (const m of messages) {
    msgStore.put({ conversationId, ...m } as MessageRecord)
    if (m.at > maxAt) maxAt = m.at
  }
  const convStore = tx.objectStore(STORE_CONVERSATIONS)
  const existing = await wrap(convStore.get(conversationId))
  if (existing && isConversationRecord(existing)) {
    if (existing.lastActivityAt < maxAt) {
      convStore.put({ ...existing, lastActivityAt: maxAt })
    }
  }
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

/**
 * CR-011: one-pass sweep that deletes every conversation with zero messages.
 * Returns the ids of the conversations that were culled. Used by the Home
 * screen's first list-load to keep stray empty stubs (from cancelled "Start"
 * flows or polite-defer rebinds) from cluttering the past-chats list.
 *
 * Conversations with ≥1 message are never touched — only emptiness triggers
 * cull. The check uses the existing `by-conversation` index over the
 * `messages` store so the count is a single getAllKeys() round-trip per
 * conversation.
 */
export async function cullEmptyConversations(): Promise<string[]> {
  const db = await openDb()
  const tx = db.transaction([STORE_CONVERSATIONS, STORE_MESSAGES], 'readwrite')
  const convStore = tx.objectStore(STORE_CONVERSATIONS)
  const msgStore = tx.objectStore(STORE_MESSAGES)
  const idx = msgStore.index(INDEX_CONVERSATION)
  const all = await wrap(convStore.getAll())
  const removed: string[] = []
  for (const item of all) {
    if (!isConversationRecord(item)) continue
    const keys = await wrap(idx.getAllKeys(IDBKeyRange.only(item.id)))
    if (keys.length === 0) {
      convStore.delete(item.id)
      removed.push(item.id)
    }
  }
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
  for (const id of removed) {
    console.info('[storage] culled empty conversation', id)
  }
  return removed
}

export async function renameConversation(id: string, label: string): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(STORE_CONVERSATIONS, 'readwrite')
  const store = tx.objectStore(STORE_CONVERSATIONS)
  const existing = await wrap(store.get(id))
  if (!existing || !isConversationRecord(existing)) return
  // Empty / whitespace-only label resets to "auto" (undefined). Matches
  // AC#21: "Empty label resets to the auto label."
  const trimmed = label.trim()
  const next: ConversationRecord = { ...existing, label: trimmed.length > 0 ? trimmed : undefined }
  if (!trimmed) delete next.label
  store.put(next)
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}
