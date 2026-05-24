// BUG-006 (re-open): two-side reproduction. Two independent
// `useChatSession` hooks each backed by their OWN `fake-indexeddb`
// factory, bridged through fake data channels. Closest a unit test can get
// to "Alice and Bob in separate tabs."

// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react'
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useChatSession } from './useChatSession'
import { __resetForTests as resetStorage } from '../core/storage'

type Side = 'alice' | 'bob'

// Two IDBs. We swap `globalThis.indexedDB` and the storage module's cached
// `dbPromise` (via `__resetForTests`) before any operation that we know is
// running on a given side, so a `getConversation`/`listMessages`/
// `appendMessage` call from Alice's hook hits Alice's IDB, and likewise Bob.
let aliceIDB: IDBFactory
let bobIDB: IDBFactory
let currentSide: Side = 'alice'

function setSide(side: Side): void {
  if (side === currentSide) return
  currentSide = side
  globalThis.indexedDB = side === 'alice' ? aliceIDB : bobIDB
  resetStorage()
}

class FakeChannel {
  readyState: 'connecting' | 'open' | 'closing' | 'closed' = 'connecting'
  onopen: (() => void) | null = null
  onclose: (() => void) | null = null
  onmessage: ((event: { data: unknown }) => void) | null = null
  sent: string[] = []
  // The bridge: incoming sends from this channel are dispatched to the
  // other side's onmessage. Switches `currentSide` for the duration so any
  // synchronous storage writes downstream land on the receiver's IDB.
  deliverTo: { channel: FakeChannel; side: Side } | null = null
  send(data: string) {
    this.sent.push(data)
    const target = this.deliverTo
    if (!target) return
    const was = currentSide
    setSide(target.side)
    try {
      target.channel.onmessage?.({ data })
    } finally {
      setSide(was)
    }
  }
  close() {
    if (this.readyState === 'open') this.onclose?.()
    this.readyState = 'closed'
  }
  open() {
    this.readyState = 'open'
    this.onopen?.()
  }
}

let lastChannel: FakeChannel | null = null
let lastPc: FakePc | null = null

class FakePc {
  iceGatheringState = 'complete' as const
  localDescription = { type: 'offer' as const, sdp: 'v=0\r\n' }
  connectionState = 'new' as RTCPeerConnectionState
  onconnectionstatechange: (() => void) | null = null
  ondatachannel: ((event: { channel: FakeChannel }) => void) | null = null
  setRemoteDescriptionCalls: RTCSessionDescriptionInit[] = []
  createDataChannel() {
    lastChannel = new FakeChannel()
    return lastChannel
  }
  createOffer() {
    return Promise.resolve({ type: 'offer' as const, sdp: 'v=0\r\n' })
  }
  createAnswer() {
    return Promise.resolve({ type: 'answer' as const, sdp: 'v=0\r\n' })
  }
  setLocalDescription() {
    return Promise.resolve()
  }
  setRemoteDescription(desc: RTCSessionDescriptionInit) {
    this.setRemoteDescriptionCalls.push(desc)
    return Promise.resolve()
  }
  addEventListener() {}
  removeEventListener() {}
  close() {}
  emitDataChannel(channel: FakeChannel) {
    lastChannel = channel
    this.ondatachannel?.({ channel })
  }
}

beforeEach(() => {
  aliceIDB = new IDBFactory()
  bobIDB = new IDBFactory()
  currentSide = 'alice'
  globalThis.indexedDB = aliceIDB
  resetStorage()
  lastChannel = null
  lastPc = null
  function Ctor() {
    const instance = new FakePc()
    lastPc = instance
    return instance
  }
  Ctor.prototype = FakePc.prototype
  // @ts-expect-error stubbing the minimal subset the hook touches
  globalThis.RTCPeerConnection = Ctor
})

describe('BUG-006 reopened: two-side persistence', () => {
  it('a fresh alternating exchange preserves (from, at) in each peer storage', async () => {
    const convId = 'shared-conv'

    setSide('alice')
    const alice = renderHook(() => useChatSession())
    await act(async () => {
      // Pre-bind so the IDB-cached `dbPromise` is finished against Alice's
      // factory before any swap. Without this, swapping to Bob mid-bind
      // resets the cached db handle and the rest of Alice's bind runs
      // against Bob's IDB — a test-only contamination that hides the bug.
      await alice.result.current.bindConversation(convId)
      await alice.result.current.startAsOfferer(convId)
    })
    const aliceChannel = lastChannel!

    setSide('bob')
    const bob = renderHook(() => useChatSession())
    const offerCode = alice.result.current.encodedLocal!
    await act(async () => {
      await bob.result.current.bindConversation(convId)
      await bob.result.current.startAsAnswerer(offerCode, convId)
    })
    const bobChannel = new FakeChannel()
    bobChannel.readyState = 'open'
    bobChannel.deliverTo = { channel: aliceChannel, side: 'alice' }
    aliceChannel.deliverTo = { channel: bobChannel, side: 'bob' }
    // Emit datachannel to Bob's PC — wireChannel will fire onOpen
    // synchronously since readyState is already 'open'.
    await act(async () => {
      setSide('bob')
      lastPc!.emitDataChannel(bobChannel)
    })

    // Now open Alice's channel.
    setSide('alice')
    await act(async () => {
      aliceChannel.open()
    })
    // Let history-merge + bind promises drain.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30))
    })

    const baseAt = 1_716_561_660_000
    const dateNow = vi.spyOn(Date, 'now')
    let t = baseAt
    const sendFrom = async (who: Side, hook: typeof alice, text: string) => {
      t += 1_000
      dateNow.mockReturnValue(t)
      setSide(who)
      await act(async () => {
        hook.result.current.send(text)
        await new Promise((resolve) => setTimeout(resolve, 5))
      })
    }

    await sendFrom('bob', bob, 'me')
    await sendFrom('alice', alice, 'them')
    await sendFrom('bob', bob, 'hey')
    await sendFrom('bob', bob, 'how are you')
    await sendFrom('alice', alice, 'great!')
    await sendFrom('alice', alice, 'you?')

    dateNow.mockRestore()

    // Snapshot in-memory transcripts for both sides.
    const aliceLive = alice.result.current.messages.map((m) => ({ from: m.from, text: m.text }))
    const bobLive = bob.result.current.messages.map((m) => ({ from: m.from, text: m.text }))

    // Reset (mimics goHome end-of-chat).
    setSide('alice')
    await act(async () => {
      alice.result.current.reset()
    })
    setSide('bob')
    await act(async () => {
      bob.result.current.reset()
    })

    // Read storage on each side and compare to live snapshots.
    setSide('alice')
    const { listMessages } = await import('../core/storage')
    const aliceStored = await listMessages(convId)
    setSide('bob')
    const bobStored = await listMessages(convId)

    expect(aliceLive).toEqual([
      { from: 'them', text: 'me' },
      { from: 'me', text: 'them' },
      { from: 'them', text: 'hey' },
      { from: 'them', text: 'how are you' },
      { from: 'me', text: 'great!' },
      { from: 'me', text: 'you?' },
    ])
    expect(aliceStored.map((m) => ({ from: m.from, text: m.text }))).toEqual(aliceLive)
    expect(bobStored.map((m) => ({ from: m.from, text: m.text }))).toEqual(bobLive)

    // BUG-006 senderId invariants — the property that makes the fix work.
    // Every record carries an absolute senderId; both peers store the SAME
    // senderId for the same message id; the conv row carries a
    // `selfPeerId` so Home can resolve attribution without flipping.
    const { getConversation } = await import('../core/storage')
    setSide('alice')
    const aliceConv = await getConversation(convId)
    setSide('bob')
    const bobConv = await getConversation(convId)
    expect(aliceConv?.selfPeerId).toBeTypeOf('string')
    expect(bobConv?.selfPeerId).toBeTypeOf('string')
    expect(aliceConv?.selfPeerId).not.toBe(bobConv?.selfPeerId)
    for (const m of aliceStored) expect(m.senderId).toBeTypeOf('string')
    for (const m of bobStored) expect(m.senderId).toBeTypeOf('string')
    const bobById = new Map(bobStored.map((m) => [m.id, m]))
    for (const a of aliceStored) {
      const b = bobById.get(a.id)
      expect(b).toBeDefined()
      expect(b!.senderId).toBe(a.senderId)
    }
    // `senderId === selfPeerId` agrees with the resolved `from` on each
    // side — they're two views on the same truth, but only senderId is
    // safe across history-merge rounds.
    for (const m of aliceStored) {
      expect(m.from === 'me').toBe(m.senderId === aliceConv?.selfPeerId)
    }
    for (const m of bobStored) {
      expect(m.from === 'me').toBe(m.senderId === bobConv?.selfPeerId)
    }
  })
})
