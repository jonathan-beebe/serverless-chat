import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { useConversations } from './useConversations'
import { __resetForTests as resetStorage, appendMessage, getConversation, upsertConversation } from '../core/storage'
import * as storage from '../core/storage'

// FEAT-012 AC#30: thin tests for the observable conversation hook.
// Reactivity-on-mutate is the point: rename/delete on a row should re-render
// the list without a manual reload (the Home screen relies on this).

beforeEach(() => {
  // Fresh in-memory IDB between tests so module-local state doesn't leak.
  ;(globalThis as { indexedDB: IDBFactory }).indexedDB = new IDBFactory()
  resetStorage()
})

afterEach(() => {
  vi.restoreAllMocks()
})

// CR-011: helper that seeds a conversation along with a single message so it
// survives the first-load empty-conversation sweep. Existing tests that
// originally seeded a bare stub need this because post-CR-011 a stub with
// zero messages is culled before the list commits.
async function seedConvWithMessage(record: { id: string; createdAt: number; lastActivityAt: number; label?: string }) {
  await upsertConversation(record)
  await appendMessage(record.id, { id: `m-${record.id}`, from: 'me', text: 'hi', at: record.lastActivityAt })
}

describe('useConversations storage list (FEAT-012 AC#30)', () => {
  it('returns null while the first load is in flight, then the storage list', async () => {
    await seedConvWithMessage({ id: 'a', createdAt: 100, lastActivityAt: 100 })

    const { result } = renderHook(() => useConversations())
    // Sync render commit happens before the async list resolves.
    expect(result.current.conversations).toBeNull()

    await waitFor(() => {
      expect(result.current.conversations).toEqual([{ id: 'a', createdAt: 100, lastActivityAt: 100 }])
    })
  })

  it('returns [] when storage is empty', async () => {
    const { result } = renderHook(() => useConversations())
    await waitFor(() => {
      expect(result.current.conversations).toEqual([])
    })
  })
})

describe('useConversations reacts to rename + delete (FEAT-012 AC#30)', () => {
  it('rename updates the conversation`s label without a manual refresh', async () => {
    await seedConvWithMessage({ id: 'a', createdAt: 100, lastActivityAt: 100, label: 'old' })
    const { result } = renderHook(() => useConversations())
    await waitFor(() => {
      expect(result.current.conversations?.[0]?.label).toBe('old')
    })

    await act(async () => {
      await result.current.rename('a', 'new')
    })

    await waitFor(() => {
      expect(result.current.conversations?.[0]?.label).toBe('new')
    })
  })

  it('delete removes the conversation from the list (AC#30 / AC#20)', async () => {
    await seedConvWithMessage({ id: 'a', createdAt: 100, lastActivityAt: 100 })
    await seedConvWithMessage({ id: 'b', createdAt: 200, lastActivityAt: 200 })
    const { result } = renderHook(() => useConversations())
    await waitFor(() => {
      expect(result.current.conversations).toHaveLength(2)
    })

    await act(async () => {
      await result.current.remove('a')
    })

    await waitFor(() => {
      expect(result.current.conversations?.map((c) => c.id)).toEqual(['b'])
    })
    // Storage cascade actually deleted the row.
    expect(await getConversation('a')).toBeNull()
  })
})

describe('useConversations refresh (FEAT-012 AC#30)', () => {
  it('refresh() picks up a row inserted by a non-hook caller', async () => {
    const { result } = renderHook(() => useConversations())
    await waitFor(() => {
      expect(result.current.conversations).toEqual([])
    })

    // Simulate the chat-session path: a fresh stub is upserted on Start
    // before the hook itself has a chance to re-list. After CR-011 the
    // first-load sweep is already past, so a fresh empty stub survives a
    // post-mount refresh().
    await upsertConversation({ id: 'new', createdAt: 500, lastActivityAt: 500 })
    await act(async () => {
      await result.current.refresh()
    })

    await waitFor(() => {
      expect(result.current.conversations?.map((c) => c.id)).toEqual(['new'])
    })
  })
})

describe('useConversations empty-conversation sweep (CR-011)', () => {
  it('first load culls empty conversations and keeps conversations with messages', async () => {
    // A has a message, B is an empty stub.
    await seedConvWithMessage({ id: 'a', createdAt: 100, lastActivityAt: 100 })
    await upsertConversation({ id: 'b', createdAt: 200, lastActivityAt: 200 })

    const { result } = renderHook(() => useConversations())

    await waitFor(() => {
      expect(result.current.conversations?.map((c) => c.id)).toEqual(['a'])
    })
    // The empty stub was removed from storage entirely, not just hidden.
    expect(await getConversation('b')).toBeNull()
  })

  it('conversations with messages are preserved', async () => {
    await seedConvWithMessage({ id: 'a', createdAt: 100, lastActivityAt: 100 })
    await seedConvWithMessage({ id: 'b', createdAt: 200, lastActivityAt: 200 })
    await seedConvWithMessage({ id: 'c', createdAt: 300, lastActivityAt: 300 })

    const { result } = renderHook(() => useConversations())

    await waitFor(() => {
      expect(result.current.conversations?.map((c) => c.id).sort()).toEqual(['a', 'b', 'c'])
    })
  })

  it('sweep runs once per hook instance — a stub inserted after first load survives a later refresh()', async () => {
    await seedConvWithMessage({ id: 'a', createdAt: 100, lastActivityAt: 100 })

    const { result } = renderHook(() => useConversations())
    await waitFor(() => {
      expect(result.current.conversations?.map((c) => c.id)).toEqual(['a'])
    })

    // A new empty stub created post-mount must survive — the sweep is
    // first-load-only by design (matches Start-then-await-answer flows).
    await upsertConversation({ id: 'fresh-stub', createdAt: 500, lastActivityAt: 500 })
    await act(async () => {
      await result.current.refresh()
    })

    await waitFor(() => {
      expect(result.current.conversations?.map((c) => c.id).sort()).toEqual(['a', 'fresh-stub'])
    })
  })

  it('a sweep failure falls through to the list — Home still renders', async () => {
    // Make the sweep reject; the list path should still load.
    vi.spyOn(storage, 'cullEmptyConversations').mockRejectedValueOnce(new Error('sweep boom'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await seedConvWithMessage({ id: 'a', createdAt: 100, lastActivityAt: 100 })

    const { result } = renderHook(() => useConversations())

    await waitFor(() => {
      expect(result.current.conversations?.map((c) => c.id)).toEqual(['a'])
    })
    expect(warn).toHaveBeenCalled()
  })
})
