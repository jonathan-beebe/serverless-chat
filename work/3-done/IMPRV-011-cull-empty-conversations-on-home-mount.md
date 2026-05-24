# IMPRV-011: Empty conversations linger in IndexedDB and clutter the Home list

**Status:** Resolved **Severity:** Medium **Location:**
`src/hooks/useConversations.ts`, `src/core/storage.ts`, `src/screens/Home.tsx`
(consumer); root cause stub-write at `src/hooks/useChatSession.ts:593`

## Problem

`bindConversation(id)` upserts a conversation stub into IndexedDB _the moment_
`startAsOfferer` / `startAsAnswerer` / `politelyAcceptOffer` runs — before a
single message has been sent or received (`useChatSession.ts:587-594`). That's
the right call for the happy path: the user sees their chat on Home even if they
close the tab before sending anything.

It's the wrong call for the cases where the session never produces any content
at all. The Home list ends up with stray rows that read "_No messages yet_" and
add visual noise without doing anything for the user. Two reproducers:

1. **Mutual "Start a new chat" → polite-defer (FEAT-008 / BUG-007).** Both peers
   click Start. Alice's session is bound to conv `A`; Bob's session is bound to
   conv `B`. Bob then clicks Alice's invite URL, and on the Joiner-side
   `politelyAcceptOffer(code, A)` the hook rebinds to `A` and stubs it
   (`useChatSession.ts:710-712`) — but Bob's original conv `B` is left behind in
   IDB, forever empty. Every mutual-Start gesture produces one stray row per
   polite-deferring peer.

2. **Start a chat → never connect → close tab.** A user clicks Start, sees the
   invite URL, decides not to send it (or sends it but the friend never opens
   it), and closes the tab. The stub for that conv stays in IDB. FEAT-012's
   implementer notes called this "acceptable" and explicitly chose not to clean
   it up (FEAT-012 line 274), trading clutter for not surprising "I staged this
   invite on purpose" users. Real usage hasn't borne that trade-off out —
   staging an invite ahead of time without sending a single message is a rare
   power move; the common case is the friend never connected and the stub is
   garbage.

The user can manually `⋯ → Delete chat` each stray, but they have to know to do
it, and a fresh polite-defer adds new strays every time. The right behavior is
for empty conversations to never persist in the first place — or, since they
already do, to be culled before Home renders them.

## Intended behavior

On every Home screen mount (which is the only surface that exposes the list, so
it's also where the cost of a stray bites), `useConversations` performs a
one-pass sweep that deletes every conversation whose message list is empty. The
sweep:

- Runs before the list state is committed for the first time, so the user never
  sees the stray row blink in and out.
- Deletes via the existing `storage.deleteConversation(id)` path (cascades to
  the empty `messages` store too, even though there are none).
- Logs a single `console.info` per swept id so it's visible during debugging
  without spamming.
- Is **scoped to "zero messages."** Conversations with ≥1 message (sent or
  received) are never touched, even if they're old or the user has clearly
  abandoned them — those represent real content and only `⋯ → Delete chat`
  should remove them.
- Tolerates IDB read failures the same way the existing list path does: a failed
  sweep falls through to the unsweep-ed list rather than blocking Home from
  rendering at all.

After the change, the two reproducers above produce zero stray rows: the
polite-deferred conv never appears on Home (it's swept on the next mount, which
happens as soon as the polite peer navigates back from the in-session screen),
and the never-connected "Start → close tab" stub is swept on the next app open.

## Suggested fix

1. **New storage helper** `cullEmptyConversations(): Promise<string[]>` in
   `src/core/storage.ts`. Single pass: list conversations, for each one open a
   `messages` cursor on the `[conversationId]` key range with `count()` (or a
   `getAllKeys` if the existing wrapper makes that easier), delete the conv when
   count === 0, return the deleted ids. Logs each delete with
   `console.info('[storage] culled empty conversation', id)`. ~30 LOC. Fully
   unit-testable with `fake-indexeddb`.

2. **Hook call site.** In `useConversations.refresh`, run
   `cullEmptyConversations()` _before_ `listConversations()` on the first load.
   Either:
   - (Preferred) inline:
     `await cullEmptyConversations(); const list = await listConversations(); setConversations(list)`.
     Sequential; ~one extra round-trip on Home mount; IDB is already in the
     user's process so this is sub-millisecond on any realistic list size.
   - (Alternative) parallel and reconcile in memory. Not worth the complexity
     for this volume.

3. **Sweep only on first load, not on every refresh.** Subsequent `refresh()`
   calls (after a rename/delete, or after a `notifyConversationsChanged()`
   broadcast from the chat send/receive path) skip the sweep — the rename/delete
   path can't create new empty conversations, and the first-message path
   immediately makes the row non-empty. Implementation: a module-level
   `hasSweptRef` flag (or `useRef` inside the hook), set true after the first
   sweep completes. The flag survives the hook lifecycle because the sweep
   should run once per app session, not once per Home mount — but per-Home-mount
   is also acceptable (Home mounts at most a handful of times per session).

4. **Surface no UI affordance.** No "swept N empty conversations" toast, no
   banner. The user shouldn't have known these existed in the first place;
   surfacing the cleanup would reverse-engineer the problem for them.

5. **Update FEAT-012's "acceptable" note.** The line in
   `FEAT-012-resume-conversation.md` (Coordination → BUG-002 / BUG-005) that
   says "Acceptable; the Home row shows '_No messages yet_' and the user can
   delete it. Don't auto-cleanup empty stubs in this ticket" is superseded by
   this CR. Either delete the line or add a "(superseded by IMPRV-011)" pointer;
   either is fine, file is already shipped.

## Test plan

Add to `src/hooks/useConversations.test.ts`:

1. **First load sweeps empty conversations.** Seed `fake-indexeddb` with two
   conversations: A has one message, B has none. Mount `useConversations`.
   Assert the list eventually settles to `[A]`, and `storage.getConversation(B)`
   returns undefined.

2. **Conversations with messages are preserved.** Seed three conversations all
   with ≥1 message. Mount; assert all three survive and none get culled.

3. **Sweep runs once per session.** Seed two conversations (one empty), mount,
   wait for the list to settle, then call `refresh()` again after seeding a
   _new_ empty conversation. Assert the new empty conv survives — the sweep is
   first-load-only.

4. **Read failure on the sweep falls through to the list.** Make
   `cullEmptyConversations` reject (e.g. spy on the storage helper); mount;
   assert the list still loads from `listConversations` and Home renders. The
   sweep is best-effort.

Add to `src/core/storage.test.ts`:

5. **`cullEmptyConversations` returns the deleted ids and removes the records.**
   Round-trip: two convs with messages, two without; call cull; assert return
   value contains exactly the two empty ids and `getConversation` returns
   undefined for them and a record for the survivors.

Add to `src/screens/Home.test.tsx`:

6. **Polite-defer reproducer.** Seed two conversations: `inviter` has one
   message, `abandoned` has none. Mount `<Home />`. Assert exactly one
   conversation row renders, and its label corresponds to `inviter`.

Existing tests should remain green — the sweep is invisible to the existing Home
/ `useConversations` / storage round-trip assertions because those all seed
conversations _with_ messages (the empty-state test seeds zero conversations,
not zero-message conversations).

## Out of scope

- **Cleanup of orphaned messages.** If for some reason a `messages` record
  exists with no matching `conversation` parent, this CR doesn't touch it.
  That's a separate consistency check.
- **Cleanup of old-but-non-empty conversations.** No age-based GC; only
  emptiness triggers cull. A 90-day-old single-message conversation stays.
- **Surfacing a toast or banner about the cleanup.** See suggested fix #4.
- **Reworking `bindConversation` to defer the stub-write until the first
  message.** That'd be a deeper refactor (the hook leans on the conv record
  existing for the bind path's `listMessages` round-trip and for the
  perspective-flip merge). The sweeper buys us the same user-visible behavior at
  much lower implementation cost. Re-evaluate if the sweeper proves
  insufficient.
- **Sweeping across browser sessions before the user opens Home.** No background
  worker; the sweep runs on the next Home mount. Storage-quota pressure from a
  long tail of empty conversations is not realistic at typical use.

## Working

### Investigation notes

- `src/core/storage.ts` already exports `deleteConversation` with a cascade
  (lines 160-188). The new `cullEmptyConversations` helper can reuse that path
  for the actual delete, and use the existing `INDEX_CONVERSATION` index on
  `messages` to count via `getAllKeys` (simpler than a cursor + count, and the
  wrapper supports `wrap(...)` already).
- `useConversations.refresh` (lines 40-51) is the single load path used by both
  the initial mount effect and the post-mutation broadcast subscribers. The
  sweep must only run on the first load — both the existing `useEffect` and the
  subscriber call into the same `refresh()`, so the gating flag has to live
  inside the hook (`useRef`) so the sweep gates per hook instance.
  Per-Home-mount sweep is fine (ticket says so explicitly).
- Existing test at `Home.test.tsx:112-117` asserts "No messages yet" renders for
  an empty-stubbed conversation. Post-sweep that row will be gone — that test
  needs to be updated to seed a conversation **with** at least one message so
  the test still exercises the peek path (or it can stay but be reframed to
  assert the sweep removed the row).
- A separate existing test at `useConversations.test.ts:22-32` upserts a stub
  with no messages and asserts the list renders that single row. Post-sweep that
  test will break — needs a seeded message too.
- `useConversations.refresh` already catches IDB errors and falls through to
  `setConversations([])`. To keep the sweep best-effort I wrap the cull call in
  its own try/catch inside `refresh` so a sweep failure logs and still lets
  `listConversations()` run.

### Plan

1. Add `cullEmptyConversations(): Promise<string[]>` to `src/core/storage.ts`.
   Single readwrite tx over both stores; for each conversation, count messages
   via `idx.getAllKeys(range)`; delete the conv row + (nothing to cascade) when
   length === 0. Returns the deleted ids. Logs one `console.info` per culled id.
2. Add `cullEmptyConversations` unit tests in `src/core/storage.test.ts`.
3. Wire `cullEmptyConversations` into `useConversations.refresh` behind a
   `useRef<boolean>(false)` gate so it runs once per hook instance.
4. Update / extend tests in `src/hooks/useConversations.test.ts` and
   `src/screens/Home.test.tsx` for the new behavior.
5. Add a "(superseded by IMPRV-011)" pointer at FEAT-012 line 274.
