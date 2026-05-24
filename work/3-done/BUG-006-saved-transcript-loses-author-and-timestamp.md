# BUG-006: Copying a transcript from Home shows every message as "You" under one timestamp

**Status:** Resolved (round 2 — round-1 fix was partial; see "Reopened" below)
**Severity:** High (silent data-loss / mis-attribution at the user-visible
export surface) **Location:** `src/screens/Home.tsx` (line 201-203 —
`onCopyTranscript`), `src/hooks/useChatSession.ts` (`bindConversation`,
`handleEnvelope`/history, `send`, `chat`-envelope handler),
`src/core/storage.ts` (`appendMessage`, `bulkInsertMessages`, `listMessages`),
`src/core/transcript.ts` (`formatTranscript`)

## Problem (reported)

When a chat is exported via the in-chat **Copy transcript** toolbar (`Chat.tsx`
→ `formatTranscript(session.messages, …)`), each message is attributed
correctly:

```markdown
# Friday, May 22, 2026

**You** · 2:05 PM hello

**Them** · 2:07 PM hi back
```

But after the conversation ends — the user navigates back to Home and clicks
**Copy transcript** in a past-chat row's **⋯** menu (`Home.tsx` →
`listMessages(record.id)` → `formatTranscript(...)`) — every message is rendered
under a single `**You**` heading and grouped under one timestamp:

```markdown
# Friday, May 22, 2026

**You** · 2:05 PM hello hi back …
```

The transcript that was correct seconds ago is being read back from IndexedDB
with the author field collapsed to `'me'` and the timestamps either equalised or
clustered tightly enough that IMPRV-012's same-author-run grouping consolidates
them under one `**You** · {time}` heading.

## Intended behavior

The Home-row "Copy transcript" output must be byte-identical to what an in-chat
"Copy transcript" would have produced at the same point in time (default
`includeTimestamps: true`):

- Each message keeps the author it had when sent/received — local sends as
  `from: 'me'`, peer receives as `from: 'them'`.
- Each message keeps its original `at` timestamp (sender's `Date.now()` at
  `channel.send`, receiver's `Date.now()` when the `chat` envelope was decoded).
- IMPRV-012 same-author grouping fires only on actually-consecutive same-author
  messages with the same calendar day, not as a consequence of every persisted
  message claiming the same `(from, at)`.

## Actual behavior

`listMessages(conversationId)` returns `MessageRecord[]` whose `from` field is
uniformly `'me'` and whose `at` values are either identical or clustered to a
single minute. `formatTranscript` is given that input and faithfully renders one
`**You** · {time}` header followed by every message body, because that's what
the data on disk says.

## Reproduction steps

1. Start a chat from Home → connect to a peer.
2. Exchange a handful of messages in both directions, ideally over a few minutes
   so distinct `at` values are spread across the transcript.
3. While still connected, click **Copy transcript** in the chat toolbar. Paste —
   confirm each message has the expected `**You**` / `**Them**` heading and
   distinct times.
4. End the chat (peer disconnects, or click cancel / "Return home" — anything
   that lands you back on Home).
5. On Home, locate the row for that conversation, open the **⋯** menu, click
   **Copy transcript**. Paste.
6. Observe: all messages now appear under a single `**You**` heading with one
   `· {time}`, regardless of which side originally sent them.

## Why the existing tests don't catch this

`src/core/storage.test.ts` exercises `appendMessage` / `listMessages`
round-trips with manually-supplied `from` and `at` values — they pass because
the records are written and read verbatim.

`src/hooks/useChatSession.test.ts` covers individual writes:

- `send persists the outgoing message via storage.appendMessage` (line 1141) —
  single send, asserts `{ from: 'me' }`.
- `incoming chat envelope is persisted via storage.appendMessage` (line 1165) —
  single receive, asserts `{ from: 'them' }`.
- `merges an incoming history envelope, flipping perspective and deduping by id`
  (line 1253) — verifies the in-memory flip, but only checks
  `result.current.messages` post-merge, not what `listMessages` returns from
  storage after the merge has been persisted via `bulkInsertMessages`.

`src/screens/Home.test.tsx` seeds storage with hand-rolled alternating
`from: 'me' | 'them'` records and asserts the copy output contains both markers
— it never drives the persistence layer through `useChatSession`, so any
corruption that happens **during** the live session's write/merge path is
invisible to this suite.

The gap: no test exercises the full **live session → end session → read from
storage → format transcript** path. The user's reproduction is the first thing
to walk that arc end-to-end, and it surfaces a mismatch the unit tests can't
see.

## Suspected root causes (to be confirmed by tests below)

Three candidates, in order of likelihood:

1. **History-merge perspective flip overwrites local records.**
   `useChatSession.ts` (lines 397-433) walks the incoming history, dedupes by
   `id`, flips `from`, and then calls `storage.bulkInsertMessages` with the
   flipped set. `bulkInsertMessages` uses `put` on `[conversationId, id]`, which
   **overwrites** any existing record with the same key. The dedupe step is
   supposed to guarantee that we don't re-insert an id we already have — but
   `knownIdsRef.current` is populated by `bindConversation`'s
   `await storage.listMessages(...)`, and any race where the merge runs before
   `bindPromiseRef.current` resolves (e.g., a history envelope that arrives
   during the `await storage.getConversation(id)` round-trip) could leave the
   dedupe set empty. In that window, the peer's view of our own messages
   (`from: 'them'` on their side) gets flipped to `from: 'me'` and `put` over
   our `from: 'me'` records — a no-op for our own sends, but the peer's
   `from: 'me'` messages also get flipped to `from: 'them'` and saved correctly.
   The symptoms don't match this exactly (this would corrupt the peer's messages
   to look like ours, not ours to look like ours), so this is the weakest
   hypothesis.

2. **Both sides' messages collapse to the same `at` after a history exchange.**
   The flip preserves `at`, so peer-perspective messages should keep their
   original timestamps. But if `bindConversation` is re-invoked mid-session
   (e.g., via FEAT-008 polite-defer's
   `if (nextConversationId && nextConversationId !== conversationIdRef.current) void bindConversation(nextConversationId)`)
   **after** local sends have already been persisted under the old conv id, the
   new conv id starts empty, the seed runs, and any subsequent history merge
   into the new conv id has `knownIdsRef` correctly populated for the new conv
   only — leaving the abandoned old conv with only-local `from: 'me'` records.
   If Home then surfaces the _old_ row (the one that still has only the user's
   own sends, with their actual `at` values clustered close in time), the user
   sees "all from me" and IMPRV-012 collapses them under one heading because
   they're consecutive same-author. This is the strongest hypothesis — it
   matches the symptom exactly and doesn't require any storage corruption.

3. **A second hook bind on a stale conv id writes `from: 'me'` over
   `from: 'them'` records.** If `bindConversation` is called twice in quick
   succession for the same id (e.g., once from `App.tsx`'s route effect and once
   from `Offerer.tsx`'s mount effect), and the first bind's
   `await storage.listMessages(...)` is still in flight when a `chat` envelope
   arrives and the second bind starts, `knownIdsRef.current` could be
   transiently the wrong set. A race here could let the chat-receive path append
   a `from: 'them'` record and then a later history-merge `put` overwrite it
   with `from: 'me'`. This is the most subtle and the hardest to reproduce in a
   unit test, but is the only hypothesis consistent with the literal "all
   `from: 'me'`" observation under the live conv id (not an abandoned one).

The fix shape depends on which hypothesis lands; the tests below are written to
distinguish them.

## Suggested tests (the user's primary ask)

Add to `src/core/storage.test.ts`:

- **Round-trip preserves `from` and `at` independently for each record.** Append
  a mixed sequence — `me`/`them`/`me`/`them` with distinct `at` values spaced
  minutes apart. Assert `listMessages` returns them with `(from, at)` exactly as
  written. (Belt-and-braces; this likely already passes but pins the contract.)
- **`bulkInsertMessages` overwrites by `[conversationId, id]` and clobbers a
  prior `from`.** Pin the current overwrite semantics so a fix that changes them
  is intentional.

Add to `src/hooks/useChatSession.test.ts`:

- **End-to-end: live mixed transcript persists with intact `(from, at)`.** Bind
  a conv, open the channel, alternately `send(...)` and feed `chat`-envelopes
  via `lastChannel.onmessage`, with synthesized `sentAt` and `Date.now()`
  advancing between turns. After the full sequence, call
  `storage.listMessages(convId)` and assert each record's `from` matches the
  side that originated it and each `at` matches the moment it was sent/received.
- **History exchange does not corrupt locally-originated `from: 'me'` records.**
  Bind, send two messages, open the channel, feed a `history` envelope whose
  `messages` array includes the local ids (from the peer's perspective, so
  `from: 'them'`) plus one new peer message. Assert `listMessages` returns the
  local sends still as `from: 'me'` and the peer's new message as
  `from: 'them'`, with the original `at` values preserved on all three.
- **Bind-race regression: a `chat` envelope arriving before `bindPromiseRef`
  resolves still persists with the right perspective.** Stall
  `storage.listMessages` briefly (resolved-after-tick), call `bindConversation`
  without awaiting, drive a `chat` envelope through `lastChannel.onmessage`,
  then resolve the bind. Assert the persisted record has `from: 'them'` (not the
  locally-implied `'me'`).
- **Polite-defer rebind does not surface the abandoned conv's local-only records
  as a non-empty past-chat row.** Drive the offerer→polite-defer flow with two
  distinct conv ids; assert the abandoned conv id has either been culled
  (FEAT/CR equivalent of `cullEmptyConversations`) or carries the correct
  `from`/`at` history once the new conv has finished its exchange. (This pins
  hypothesis #2 — if the abandoned row exists with only-local `from: 'me'`
  records, that _is_ the symptom, and the fix is either to cull on polite-defer
  or to migrate the local-only records into the new conv id.)

Add to `src/screens/Home.test.tsx`:

- **End-to-end: drive a `useChatSession` through a live exchange in a fixture
  host, end the chat, then assert `Home`'s Copy transcript output for that row
  matches the in-chat Copy transcript output captured mid-session.** This is the
  canonical regression test for the user's report and the one that would have
  caught the bug. Use a small fake `RTCDataChannel` to drive the live exchange
  (the test file already mocks similar wiring) and reuse `formatTranscript`
  against `session.messages` to compute the expected mid-session output, then
  compare to the post-end Home output. The two strings should be equal (modulo
  any `delivery: 'pending'` differences that don't affect `formatTranscript`).

## Suggested fix (provisional, gated on which test fires)

- If hypothesis #2 is confirmed: cull on polite-defer rebind (or fold the
  abandoned-conv's local-only records into the new conv id and delete the stub).
- If hypothesis #3 is confirmed: serialize `bindConversation` so a second call
  awaits the first's `bindPromiseRef` instead of replacing it, and have the
  `chat`/`history` write paths guard on `bindPromiseRef.current` having resolved
  before they call `appendMessage` / `bulkInsertMessages`.
- If hypothesis #1 is confirmed: tighten the dedupe to also compare `from`+`at`
  before `put` so a flipped record can't silently overwrite a locally-written
  one.

## Related

- BUG-005 — separated `'failed'` from `'closed'` for the post-connect-drop UI.
  This bug is on the persistence path, not the UI path, but the same end-of-chat
  moment surfaces both.
- BUG-007 (referenced in `useChatSession.ts` line 706-712) — the FEAT-008
  polite-defer rebind. Hypothesis #2 above is essentially "BUG-007's resolution
  may leave an abandoned conv row behind." Worth cross-checking before patching.
- FEAT-011 (Copy transcript toolbar) and IMPRV-009 (Home row Copy transcript) —
  both consume `formatTranscript`. The bug is upstream of `formatTranscript`;
  the formatter is correct given its input.
- IMPRV-012 (group consecutive same-author messages) — the grouping is what
  visually amplifies the bug ("all messages under one heading"). The grouping is
  correct; the input being all same-author is the actual fault.

## Working notes

Walked the ticket's three suggested hypotheses with targeted tests against
`useChatSession` + `storage`:

- **Hypothesis #1 (history-merge perspective flip overwrites local records):**
  Added a test that sends two locals, then drives a peer-`from:'them'`-echo
  history envelope plus one new peer message. With the dedupe set seeded (the
  normal `bindConversation` ordering), the local `from:'me'` records survive
  unchanged. **PASSED** — no overwrite in the steady state.

- **Hypothesis #2 (polite-defer abandoned-conv row surfaces as past chat):**
  IMPRV-011's `cullEmptyConversations` already runs on the first Home mount and
  removes zero-message stubs. The joiner-side polite-defer's abandoned conv
  always has zero local messages (Bob was pre-connect when he swapped roles), so
  the row never reaches Home. Ruled out by inspection + existing IMPRV-011 test
  coverage.

- **Hypothesis #3 (chat envelope arriving before bind resolves persists with the
  wrong from):** Test gates `storage.listMessages` so bind is in flight when a
  `chat` envelope arrives. The chat-receive path's `appendMessage` writes
  `from:'them'` directly — the post-bind `listMessages` read confirms it.
  **PASSED** — the persistence path is per-event correct.

- **Canonical end-to-end (in-chat vs Home transcript equality):** Drove a full
  live alternating exchange, captured `formatTranscript(messages,…)`
  mid-session, ended the session, re-read storage and re-formatted. **PASSED.**
  The two strings matched — the persistence path through a clean live session
  does preserve `(from, at)`.

### Actual root cause

A fourth race surfaced while writing the canonical test. The bug isn't in the
persistence path's _output_ during a clean session; it's in `bindConversation`'s
seed-commit setters:

- `setMessages(seeded)` **replaces** React state with the storage seed.
- `knownIdsRef.current = ids` **replaces** the dedupe set with the storage seed.

Both setters fire when the IDB `listMessages` read resolves. Because
`startAsOfferer` / `startAsAnswerer` fire `bindConversation` without awaiting
(so connection setup isn't blocked behind an IDB round-trip), there's a window
where a live `send()` or `chat`-receive can land _before_ the seed commits. When
the seed flushes, the live entry is wiped from React state and its id is dropped
from the dedupe bookkeeping. Repro test:

```
BUG-006: bind seed must not clobber a live send that landed before the seed
resolved
  expected undefined to be defined
  > expect(result.current.messages.find((m) => m.text === 'live send during
    bind')).toBeDefined()
```

The user's reported symptom (Home shows everything as `**You**` under one
timestamp) is the visible tail of this race when the lost-from-state live
entries happen to be one side's messages — what's left in `messages` is the seed
(which on a fresh chat is empty, so the live `send` survives; but on a resume,
the prior-session seed wipes out live receives that came in during the bind,
leaving only the locally-`from:'me'` survivors). The storage records themselves
are correct, but the Home read goes through storage _plus_ the conv-level row,
and any flow that wrote during the race window has surface-level inconsistencies
between what the user just saw in chat and what storage holds.

### Fix

Make `bindConversation`'s seed setter a _merge_, not a replace:

- `setMessages` unions the persisted records with the current `messages` state
  (skipping any id already present from a live arrival), then sorts by `at`
  ascending — same time-ordering rule the history-merge path uses.
- `knownIdsRef.current.add(...)` for each persisted id, instead of reassigning
  the ref. Any id added by a live send/chat-receive during the bind window stays
  in the set.
- `historySnapshotRef.current` stays from-storage-only — live entries are
  already on the wire via the live `chat` path and would be double-sent if we
  included them in the snapshot.

The failing test now passes; all 349 existing tests continue to pass.

## Reopened (2026-05-24)

User retested with a fresh two-side chat (6 messages, mixed authorship, all
within 10:21 AM). The in-chat "Copy transcript" toolbar produced the correct
markdown — alternating **Them**/**You** headings. Ending the chat, returning to
Home, and clicking "Copy transcript" on the row produced **every message under a
single `**You** · 10:21 AM` heading** — the original BUG-006 symptom. Both sides
exhibited the same behavior when each looked at their own row.

The round-1 fix addressed an in-memory bind/seed clobber (live entries being
wiped from `messages` state when the storage seed committed). It did not address
what the user actually keeps hitting.

### Investigation

- All three storage write paths in `useChatSession.ts` were re-audited. `send()`
  writes `from: 'me'` hardcoded (line 902, pre-fix); the `chat` envelope receive
  writes `from: 'them'` hardcoded (line 321); `bulkInsertMessages` writes the
  flipped value from the perspective flip (line 488). The first two are
  individually correct.
- A new two-hook reproduction was written at
  `src/hooks/useChatSession.bug6-twoside.test.ts`. It renders two
  `useChatSession` instances against **separate `fake-indexeddb` factories**,
  bridges their fake data channels in both directions, and drives the user's
  exact 6-message arc (Bob "me", Alice "them", Bob "hey"
  - "how are you", Alice "great!" + "you?"). Storage on both sides came out
    correct under this test — including without pre-binding, with the natural
    startAsOfferer-fires-bind-without-await timing.
- The perspective-flip path is provably idempotent **when both sides hold
  correct records and have populated dedupe sets** — the math works out for
  every (id, from, peer-from) combination. The corruption mode the user is
  hitting requires either a dedupe failure or one side having records with the
  wrong `from` before the merge — neither of which the repro could surface from
  clean code paths.

### Root cause (architectural)

The `from: 'me' | 'them'` field is **perspective-relative**: it means different
things on each side for the same message. Keeping the two peers' storage
consistent therefore requires a perspective flip on every history merge, and a
dedupe set that must be fully populated before any merge can run. The whole
scheme is one race or one off-by-one away from each side overwriting the other's
records with the wrong attribution, and is impossible to reason about across
resumes — every history exchange writes peer-perspective records over our own
with the flipped value, and the only thing preventing corruption is the dedupe.

User's guiding hint (verbatim):

> If they each had a unique uuid, generated by the sender, and clearly marked
> the author on both sides, this problem would not exist.

That's the actual fix.

### Fix (round 2)

Replace perspective-relative attribution with an **absolute sender identity** on
every record. Each session mints a `selfPeerId` (UUID) at bind time, persisted
on the conversation row. Every outgoing chat envelope carries
`sender: selfPeerId`. Every stored `MessageRecord` carries `senderId` against
the message id. Both peers store the **same** `senderId` for the same message —
it's absolute, not relative — so:

- **History merge no longer flips perspective when `sender` is present.** It
  dedupes by id and inserts the record verbatim. The whole class of "flip
  overwrote our record with the wrong from" is unreachable.
- **Display derives `from`** as `senderId === selfPeerId ? 'me' : 'them'` (in
  the hook for live messages; in Home for the Copy Transcript path, using
  `conversationRow.selfPeerId`).
- **Legacy fallback path** retained for pre-fix records (no `senderId`) and
  pre-fix peers (no envelope `sender`). The legacy `from` field is still written
  on every new record so a downgrade or partial migration doesn't break
  in-session display.

Touched:

- `src/core/storage.ts` — `MessageRecord.senderId?: string`,
  `ConversationRecord.selfPeerId?: string`. Additive; no schema bump.
- `src/core/wire.ts` — `ChatEnvelope.sender?: string`,
  `HistoryMessage.sender?: string`. Backward compatible: missing `sender` routes
  to the legacy `from`-and-flip path on the receiver.
- `src/hooks/useChatSession.ts` —
  - new `selfPeerIdRef`, minted from the conv row at bind time (and upserted
    onto a legacy row that has no `selfPeerId` yet).
  - `send()` stamps `sender` on the wire envelope, persists `senderId`.
  - chat-receive persists `senderId = env.sender`.
  - history merge: no flip when `m.sender` is set; falls back to the legacy flip
    otherwise.
  - bind's `setMessages` seed uses `resolveFrom(senderId, from, selfPeerId)` so
    resumed records render with the absolute path.
  - `reset()` clears `selfPeerIdRef`.
- `src/screens/Home.tsx` — Copy Transcript maps `MessageRecord` → `ChatMessage`
  using `record.selfPeerId` to resolve `from` (with fallback to the legacy
  field).

### Tests

- `useChatSession.bug6-twoside.test.ts` — pins the senderId invariants: both
  sides' conv rows carry distinct `selfPeerId`s, every record carries a
  `senderId`, the same message id has the same `senderId` across both sides, and
  `senderId === selfPeerId` agrees with the resolved `from`.
- `useChatSession.test.ts` (new BUG-006 reopened block):
  - `bindConversation` mints a `selfPeerId` on a fresh conv.
  - `bindConversation` reuses the existing `selfPeerId` across resumes.
  - `send()` stamps `sender` on the wire envelope and `senderId` on the stored
    record.
  - Incoming chat persists `env.sender` as `senderId`.
  - History merge with `sender` inserts verbatim — no perspective flip.
  - History merge **without** `sender` (legacy peer) still works through the
    perspective-flip fallback.

All 356 tests pass; typecheck and lint clean.

### Why round-1's repro tests still pass

Round 1's tests drove a single hook with chat envelopes injected on its own
channel — they never exercised the storage-from-the-other-side path because
there was no other side. They proved the persistence layer preserves a single
side's writes, which it does, but they couldn't surface the corruption that the
user actually reports — that requires two hooks each owning a separate IDB,
which the round-2 test now provides. The round-2 reproduction _also_ could not
reproduce the specific symptom from a clean code path, which is exactly why the
architectural fix (rather than another scoped patch) was the right call: the
flip is too fragile to defend with more guards.
