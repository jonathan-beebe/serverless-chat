import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { useConversations } from './useConversations'
import { __resetForTests as resetStorage, getConversation, upsertConversation } from '../core/storage'

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

describe('useConversations storage list (FEAT-012 AC#30)', () => {
  it('returns null while the first load is in flight, then the storage list', async () => {
    await upsertConversation({ id: 'a', createdAt: 100, lastActivityAt: 100 })

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
    await upsertConversation({ id: 'a', createdAt: 100, lastActivityAt: 100, label: 'old' })
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
    await upsertConversation({ id: 'a', createdAt: 100, lastActivityAt: 100 })
    await upsertConversation({ id: 'b', createdAt: 200, lastActivityAt: 200 })
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
    // before the hook itself has a chance to re-list.
    await upsertConversation({ id: 'new', createdAt: 500, lastActivityAt: 500 })
    await act(async () => {
      await result.current.refresh()
    })

    await waitFor(() => {
      expect(result.current.conversations?.map((c) => c.id)).toEqual(['new'])
    })
  })
})
