import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import {
  __resetForTests,
  appendMessage,
  bulkInsertMessages,
  cullEmptyConversations,
  deleteConversation,
  getConversation,
  listConversations,
  listMessages,
  renameConversation,
  upsertConversation,
  type ConversationRecord,
  type MessageRecord,
} from './storage'

// Wipe the in-memory IDB between tests so module-local state doesn't leak.
beforeEach(() => {
  // `fake-indexeddb/auto` populates `globalThis.indexedDB` at import time.
  // Reassigning the factory is the supported reset path (per its README).
  ;(globalThis as { indexedDB: IDBFactory }).indexedDB = new IDBFactory()
  __resetForTests()
})

afterEach(() => {
  vi.restoreAllMocks()
})

function conv(id: string, overrides: Partial<ConversationRecord> = {}): ConversationRecord {
  return {
    id,
    createdAt: 1_700_000_000_000,
    lastActivityAt: 1_700_000_000_000,
    ...overrides,
  }
}

function msg(
  id: string,
  overrides: Partial<Omit<MessageRecord, 'conversationId' | 'id'>> = {},
): Omit<MessageRecord, 'conversationId'> {
  return {
    id,
    from: 'me',
    text: `body-${id}`,
    at: 1_700_000_000_000,
    ...overrides,
  }
}

describe('storage conversations CRUD (FEAT-012 AC#1)', () => {
  it('round-trips a conversation record via upsert + get', async () => {
    const record = conv('a')
    await upsertConversation(record)
    const got = await getConversation('a')
    expect(got).toEqual(record)
  })

  it('listConversations returns empty array when no records', async () => {
    expect(await listConversations()).toEqual([])
  })

  it('listConversations returns all stored conversations sorted by lastActivityAt desc', async () => {
    await upsertConversation(conv('a', { lastActivityAt: 100 }))
    await upsertConversation(conv('b', { lastActivityAt: 300 }))
    await upsertConversation(conv('c', { lastActivityAt: 200 }))
    const list = await listConversations()
    expect(list.map((c) => c.id)).toEqual(['b', 'c', 'a'])
  })

  it('upsertConversation overwrites an existing record by id', async () => {
    await upsertConversation(conv('a', { label: 'first' }))
    await upsertConversation(conv('a', { label: 'second' }))
    const got = await getConversation('a')
    expect(got?.label).toBe('second')
  })

  it('getConversation returns null for an unknown id', async () => {
    expect(await getConversation('nope')).toBeNull()
  })
})

describe('storage messages CRUD (FEAT-012 AC#1)', () => {
  it('appendMessage round-trips through listMessages', async () => {
    await upsertConversation(conv('a'))
    await appendMessage('a', msg('m1', { at: 100 }))
    await appendMessage('a', msg('m2', { at: 200 }))
    const list = await listMessages('a')
    expect(list).toHaveLength(2)
    expect(list.map((m) => m.id)).toEqual(['m1', 'm2'])
  })

  it('listMessages returns messages sorted by `at` ascending', async () => {
    await upsertConversation(conv('a'))
    await appendMessage('a', msg('m1', { at: 300 }))
    await appendMessage('a', msg('m2', { at: 100 }))
    await appendMessage('a', msg('m3', { at: 200 }))
    const list = await listMessages('a')
    expect(list.map((m) => m.id)).toEqual(['m2', 'm3', 'm1'])
  })

  it('listMessages scopes to the requested conversation only', async () => {
    await upsertConversation(conv('a'))
    await upsertConversation(conv('b'))
    await appendMessage('a', msg('m1'))
    await appendMessage('b', msg('m2'))
    expect(await listMessages('a')).toHaveLength(1)
    expect(await listMessages('b')).toHaveLength(1)
  })

  it('appendMessage refreshes lastActivityAt on the conversation record', async () => {
    await upsertConversation(conv('a', { lastActivityAt: 100 }))
    await appendMessage('a', msg('m1', { at: 500 }))
    const got = await getConversation('a')
    expect(got?.lastActivityAt).toBe(500)
  })
})

describe('storage bulkInsertMessages dedupe (FEAT-012 AC#11)', () => {
  it('inserts new messages and silently overwrites duplicates by [conversationId, id]', async () => {
    await upsertConversation(conv('a'))
    await appendMessage('a', msg('m1', { text: 'original', at: 100 }))
    await bulkInsertMessages('a', [msg('m1', { text: 'incoming-dup', at: 100 }), msg('m2', { text: 'new', at: 200 })])
    const list = await listMessages('a')
    // Duplicate id 'm1' is overwritten by put — the bulk path is the "trust
    // local" filter's downstream; callers (the hook) skip already-present
    // ids before calling bulkInsert, so the post-state matters less than
    // the round-trip not crashing.
    expect(list).toHaveLength(2)
    expect(list.map((m) => m.id).sort()).toEqual(['m1', 'm2'])
  })

  it('no-ops on an empty list', async () => {
    await upsertConversation(conv('a'))
    await bulkInsertMessages('a', [])
    expect(await listMessages('a')).toEqual([])
  })

  it('refreshes lastActivityAt to max(at) across the inserted batch', async () => {
    await upsertConversation(conv('a', { lastActivityAt: 50 }))
    await bulkInsertMessages('a', [msg('m1', { at: 100 }), msg('m2', { at: 300 }), msg('m3', { at: 200 })])
    const got = await getConversation('a')
    expect(got?.lastActivityAt).toBe(300)
  })
})

describe('storage deleteConversation cascade (FEAT-012 AC#20)', () => {
  it('removes the conversation record', async () => {
    await upsertConversation(conv('a'))
    await deleteConversation('a')
    expect(await getConversation('a')).toBeNull()
  })

  it('cascades to delete the conversation`s messages', async () => {
    await upsertConversation(conv('a'))
    await upsertConversation(conv('b'))
    await appendMessage('a', msg('m1'))
    await appendMessage('a', msg('m2'))
    await appendMessage('b', msg('m3'))
    await deleteConversation('a')
    expect(await listMessages('a')).toEqual([])
    // Other conversations' messages are untouched.
    expect(await listMessages('b')).toHaveLength(1)
  })
})

describe('storage cullEmptyConversations (CR-011)', () => {
  it('deletes conversations with zero messages and returns their ids', async () => {
    await upsertConversation(conv('with-msgs'))
    await upsertConversation(conv('empty-1'))
    await upsertConversation(conv('empty-2'))
    await appendMessage('with-msgs', msg('m1'))

    const removed = await cullEmptyConversations()

    expect(removed.sort()).toEqual(['empty-1', 'empty-2'])
    expect(await getConversation('empty-1')).toBeNull()
    expect(await getConversation('empty-2')).toBeNull()
    expect(await getConversation('with-msgs')).not.toBeNull()
  })

  it('returns an empty array when every conversation has at least one message', async () => {
    await upsertConversation(conv('a'))
    await upsertConversation(conv('b'))
    await appendMessage('a', msg('m1'))
    await appendMessage('b', msg('m2'))

    const removed = await cullEmptyConversations()

    expect(removed).toEqual([])
    expect((await listConversations()).map((c) => c.id).sort()).toEqual(['a', 'b'])
  })

  it('returns an empty array when the conversation store is empty', async () => {
    expect(await cullEmptyConversations()).toEqual([])
  })

  it('logs a single console.info per culled id', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    await upsertConversation(conv('empty-1'))
    await upsertConversation(conv('empty-2'))

    await cullEmptyConversations()

    // One info per culled id, in any order.
    expect(info).toHaveBeenCalledTimes(2)
    const ids = info.mock.calls.map((args) => args[args.length - 1])
    expect(ids.sort()).toEqual(['empty-1', 'empty-2'])
  })
})

describe('storage renameConversation (FEAT-012 AC#21)', () => {
  it('updates the label on an existing record', async () => {
    await upsertConversation(conv('a'))
    await renameConversation('a', 'My Chat')
    const got = await getConversation('a')
    expect(got?.label).toBe('My Chat')
  })

  it('trims whitespace around the label', async () => {
    await upsertConversation(conv('a'))
    await renameConversation('a', '  spacey  ')
    const got = await getConversation('a')
    expect(got?.label).toBe('spacey')
  })

  it('an empty/whitespace-only label resets to the auto-label (undefined)', async () => {
    await upsertConversation(conv('a', { label: 'user-named' }))
    await renameConversation('a', '   ')
    const got = await getConversation('a')
    expect(got?.label).toBeUndefined()
  })

  it('no-ops on an unknown id', async () => {
    await renameConversation('nope', 'whatever')
    expect(await getConversation('nope')).toBeNull()
  })
})

describe('storage decode safety (FEAT-012 AC#4)', () => {
  it('drops malformed conversation records on read with a single warn', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // Insert a valid record alongside one that's missing required fields.
    await upsertConversation(conv('a'))
    // Reach past the type signature on purpose: a corrupt browser store
    // would contain whatever an older app version (or a bug) put there.
    await upsertConversation({ id: 'b' } as unknown as ConversationRecord)
    const list = await listConversations()
    expect(list.map((c) => c.id)).toEqual(['a'])
    expect(warn).toHaveBeenCalled()
  })

  it('drops malformed message records on read', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await upsertConversation(conv('a'))
    await appendMessage('a', msg('m1'))
    // Inject a corrupt record via the raw IDB path. The store uses a
    // composite keyPath so we need both id + conversationId in the value.
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('chat')
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('messages', 'readwrite')
      tx.objectStore('messages').put({ conversationId: 'a', id: 'bad', text: 7, from: 'other', at: 1 })
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    const list = await listMessages('a')
    expect(list.map((m) => m.id)).toEqual(['m1'])
    expect(warn).toHaveBeenCalled()
  })
})
