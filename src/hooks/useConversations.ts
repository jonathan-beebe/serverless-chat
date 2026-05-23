// FEAT-012: thin observable wrapper around the storage layer. The Home
// screen subscribes via this hook so a rename/delete inline edit
// re-renders the list without a manual reload. We chose a tiny pub/sub on
// the hook module itself over BroadcastChannel — multi-tab is out of scope
// per the ticket; single-tab reactivity is all we need for v1.

import { useCallback, useEffect, useState } from 'react'
import {
  type ConversationRecord,
  deleteConversation as deleteConv,
  listConversations,
  renameConversation as renameConv,
} from '../core/storage'

type Listener = () => void
const listeners = new Set<Listener>()

// Notify all subscribers that storage changed. Called by the mutation
// helpers below — keeps the broadcast surface tiny and out of the storage
// module itself (storage stays pure side-effects-on-IDB only).
function notify(): void {
  for (const l of listeners) l()
}

export interface UseConversations {
  /** null while the first load is in flight, [] thereafter if empty. */
  conversations: ConversationRecord[] | null
  /** Force a re-fetch. The mutation helpers call this internally; exposed
   *  for screens that want to refresh after an external write. */
  refresh: () => Promise<void>
  /** Delete + cascade-delete the conversation's messages. Re-fetches on success. */
  remove: (id: string) => Promise<void>
  /** Rename (or reset to auto-label if `label` is empty). Re-fetches on success. */
  rename: (id: string, label: string) => Promise<void>
}

export function useConversations(): UseConversations {
  const [conversations, setConversations] = useState<ConversationRecord[] | null>(null)

  const refresh = useCallback(async () => {
    try {
      const list = await listConversations()
      setConversations(list)
    } catch (err) {
      console.warn('[useConversations] listConversations failed', err)
      // Render an empty list on read failure rather than locking on the
      // null/loading placeholder. The Home empty-state is a reasonable
      // fallback for a transient IDB error.
      setConversations([])
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // Subscribe to mutation broadcasts so a delete/rename from this same hook
  // (or any sibling) triggers a refresh.
  useEffect(() => {
    const onChange = () => {
      void refresh()
    }
    listeners.add(onChange)
    return () => {
      listeners.delete(onChange)
    }
  }, [refresh])

  const remove = useCallback(async (id: string) => {
    await deleteConv(id)
    notify()
  }, [])

  const rename = useCallback(async (id: string, label: string) => {
    await renameConv(id, label)
    notify()
  }, [])

  return { conversations, refresh, remove, rename }
}

// Exposed so non-hook callers (e.g. the chat send/receive path that creates
// a stub conversation on first message) can broadcast a refresh too.
export function notifyConversationsChanged(): void {
  notify()
}
