# `useChatSession` Seam Map

Research artifact for a future refactor of `src/hooks/useChatSession.ts`. Names
each candidate seam, what it would extract, what couples it to the rest of the
hook, and what tooling / ordering a maker would need to take it. Does not pick a
winner — the maker can accept, edit, or reject each candidate individually.

Source ticket: `RSRCH-002` (resolved 2026-05-27). The hook was 955 lines as of
the resolved date; if the line numbers in this document have drifted, treat the
named function / ref as the truth source and re-locate.

## At-a-glance topology

- 955 lines, one default-exported hook (`useChatSession`).
- **8 `useState` slots**: `state`, `error`, `encodedLocal`, `messages`,
  `telemetry`, `conversationId`, `hasResumed`, `telemetryCommitVersion`.
- **14 `useRef` slots**: `pcRef`, `channelRef`, `conversationIdRef`,
  `selfPeerIdRef`, `bindPromiseRef`, `knownIdsRef`, `hasResumedRef`,
  `historySnapshotRef`, `samplesRef`, `syncRef`, `connectedAtRef`,
  `pendingSyncRef`, `deliberateTeardownRef`, `roleRef`.
- **15 `useCallback`s**: `pushSample`, `commitTelemetry`, `transition`,
  `teardown`, `initiateSync`, `handleEnvelope`, `wireChannel`, `wirePc`,
  `bindConversation`, `startAsOfferer`, `startAsAnswerer`, `submitAnswer`,
  `politelyAcceptOffer`, `send`, `reset`.
- **3 module-scope pure helpers**: `nextId` (line 97), `resolveFrom` (line 110,
  BUG-006 path), `emptyTelemetry` (line 119), `computeSummary` (line 128).
  `deriveSync` already lives in `core/wire`.
- **2 `useEffect`s**: telemetry-commit driver (lines 263–266, BUG-007), and the
  unmount-teardown effect (line 281).
- The **`handleEnvelope` switch** (lines 302–556) is the file's hotspot — 8
  cases (`chat`, `sync-probe`, `sync-ack`, `sync-done`, `history`, `receipt`;
  plus a default-drop and an unhandled binary-payload drop in
  `wireChannel.onmessage`).

## Responsibility map (state → mutators/readers)

1. **State machine** — `state`, `error`, `encodedLocal`, `roleRef`,
   `deliberateTeardownRef`. Mutated by `transition()` (the only setter that
   pushes state-change samples), `startAsOfferer`, `startAsAnswerer`,
   `submitAnswer`, `politelyAcceptOffer`, `reset`,
   `wirePc.onconnectionstatechange`, `wireChannel.onclose`.
2. **Connection lifecycle** — `pcRef`, `channelRef`. Mutated by `wirePc`,
   `wireChannel`, `teardown`, the four start/submit/polite entry points,
   `reset`.
3. **Wire dispatch** — `handleEnvelope` (8 cases). Reads `channelRef`,
   `syncRef`, `pendingSyncRef`, `conversationIdRef`, `selfPeerIdRef`,
   `bindPromiseRef`, `knownIdsRef`, `hasResumedRef`. Writes `setMessages`,
   `setHasResumed`, `syncRef`, `pendingSyncRef`, `samplesRef`, calls
   `storage.appendMessage` / `bulkInsertMessages`, sends receipt / sync-ack /
   sync-done envelopes.
4. **Transcript** — `messages`, `knownIdsRef`. Mutated by `handleEnvelope`
   (`chat`, `history`, `receipt`-delivery-flip), `send`, `bindConversation`,
   `reset`.
5. **History / resume** — `hasResumed` / `hasResumedRef`, `historySnapshotRef`,
   `bindPromiseRef`. Snapshot taken in `bindConversation`; shipped by
   `wireChannel.onOpen`; merged by `handleEnvelope` `'history'` case; latch
   flipped on every received history.
6. **Telemetry** — `telemetry`, `telemetryCommitVersion`, `samplesRef`,
   `syncRef`, `connectedAtRef`, `pendingSyncRef`. `pushSample` (ref-only),
   `commitTelemetry` (state setter), `transition` (bumps version), `useEffect`
   commit driver. Sync RTT is computed inside `handleEnvelope` sync-ack /
   sync-done.
7. **Persistence binding** — `conversationId`, `conversationIdRef`,
   `selfPeerIdRef`. Bound by `bindConversation`; cleared by `reset`; read by
   `handleEnvelope` (chat persist, history conv-id check), `send` (persist),
   `politelyAcceptOffer` (rebind).

## Candidate seams

### A. Extract pure helpers

**What:** `nextId`, `emptyTelemetry`, `computeSummary`, `resolveFrom`.
(`deriveSync` is already in `core/wire`.)

**For:** Already pure, zero state. Easy unit tests. Frees the hook file of ~50
lines of non-React content.

**Against:** Trivial; doesn't touch the 250-line dispatch or any cluster's
state. Pure cost-saving, not a structural win.

**Testability tooling:** Plain `vitest` unit tests against the extracted module.
No `renderHook`, no fakes needed. Lowest-friction seam.

### B. Extract `handleEnvelope` as a pure dispatcher

**What:** Lift the 250-line switch (lines 302–556) into a function in e.g.
`core/wire-dispatch.ts` taking a `Ctx` object
`{channel, refs, setters, callbacks}`. Each case becomes a top-level (or
per-case) function.

**For:** The 250-line switch is the file's reading-cost hotspot; each case is
logically independent. Yields directly unit-testable dispatch — call
`dispatch(env, fakeCtx)` with a hand-rolled context, no `renderHook`, no
`FakePeerConnection`. **Highest-leverage testable artifact.**

**Against:** Every case needs to read or write 4–8 of the hook's refs / setters;
`Ctx` would have ~15 fields. If `Ctx` is a stable object it must be memoized
carefully or the dispatcher's identity churns. Cross-case state
(`pendingSyncRef` mutated by `sync-probe` and read by `sync-ack` / `sync-done`)
lives in the context, not the dispatcher. Effectively pushes the same coupling
out of the hook and into the call site — same `Ctx` field churn, just moved
across a file boundary.

**Testability tooling:** Plain `vitest`. The fake `Ctx` is a literal object with
`vi.fn()` setters and bare `{ current }` refs. No DOM, no React.

### C. `useChatTelemetry` hook

**What:** Owns `samplesRef`, `syncRef`, `connectedAtRef`, `pendingSyncRef`,
`telemetry` state, `telemetryCommitVersion`, `pushSample`, `commitTelemetry`,
`initiateSync`, the `SYNC_TIMEOUT_MS` timer, and the BUG-007 commit-version
`useEffect`.

**For:** Telemetry has a clean public surface (e.g.
`{telemetry, pushSample, recordSync, initiateSync}`). The BUG-007 commit-version
pattern is self-contained. `/network` reads telemetry only — clear consumer. The
`/network` route would only need to subscribe to this one hook to render its
diagnostic.

**Against:** `transition()` must call `pushSample({kind:'state-change'})` and
bump commit version — so the telemetry hook either exposes those entry points to
the state-machine hook or the state-machine hook reaches into telemetry refs.
`handleEnvelope` `sync-probe` / `ack` / `done` cases write `syncRef` and call
`channel.send` — sync handshake is half wire-protocol, half telemetry. The split
would have to put the sync state in telemetry and the sync wire-cases stay in
the dispatcher reading telemetry's setters. `receipt` also calls
`pushSample({kind:'receipt'})` and `commitTelemetry`, so the chat receipt-flip
case (transcript-side) and the receipt-RTT case (telemetry-side) ride on the
same wire envelope.

**Testability tooling:** `renderHook(useChatTelemetry)` with no peer connection
— pure timer behavior. Existing `vitest` + fake timers cover the timeout case.
`initiateSync` would need a `channel` arg or a callback since the hook itself
wouldn't own `channelRef`.

### D. `useChatTranscript` hook

**What:** Owns `messages`, `knownIdsRef`, `hasResumed` / `hasResumedRef`,
`historySnapshotRef`, and a public API like
`{messages, hasResumed, appendOutgoing, appendIncoming, mergeHistory, snapshotForOutgoingHistory, clear}`.
Receipt delivery-flip is a transcript-local mutation.

**For:** Transcript has the cleanest external API. Receipt delivery-flip is
naturally local to it. `bindConversation`'s seed step and the BUG-006
merge-not-replace rule both fit here.

**Against:** `appendOutgoing` and `appendIncoming` both also write storage
(couples to persistence binding's `conversationIdRef` + `selfPeerIdRef`) —
either the transcript hook calls storage (couples it to persistence) or the
dispatcher passes a `persistOutgoing` callback (re-fragmenting the chat case
across two files). `bindConversation`'s seed must merge with live entries (the
BUG-006 merge-not-replace rule) — the merge logic would have to live wherever
`knownIdsRef` does.

**Testability tooling:** `renderHook(useChatTranscript)` with a fake storage.
Repo already has `fake-indexeddb/auto` in `test-setup.ts`, but a transcript-hook
test could pass a hand-stubbed storage to avoid IDB at all.

### E. `useChatHistory` hook

**What:** Owns `hasResumed`, `historySnapshotRef`, `bindPromiseRef`, the
merge-on-receive logic, the snapshot-on-open shipper.

**For:** History / resume is the latest-added cluster (FEAT-012), has the most
explicit cross-cluster contract (await `bindPromiseRef` before merge), and the
merge logic is ~70 lines of testable pure code if the setters / refs are passed
in.

**Against:** `bindPromiseRef` is set by `bindConversation` (persistence-
binding's responsibility) but awaited by `handleEnvelope`'s `'history'` case —
splitting puts the producer and consumer in different files. Snapshot-on-open
lives inside `wireChannel.onOpen` — so `wireChannel` would have to call
`history.shipSnapshot(channel)`.

**Testability tooling:** Hardest of the data clusters to isolate — the merge
function alone is testable as a pure function, but the `bindPromiseRef`-await
behavior requires either a fake promise plumbing fixture or a partial-hook
integration test. The `useChatSession.test.ts` "FEAT-012 resume" block (19
tests) and the entire `useChatSession.bug6-twoside.test.ts` file (245 lines,
two-side persistence) are this cluster's regression suite.

### F. `useChatPersistence` hook

**What:** Owns `conversationId`, `conversationIdRef`, `selfPeerIdRef`,
`bindConversation`.

**For:** Persistence binding is the cluster that most cleanly maps to one
storage-module dependency; tests could mock the whole hook.

**Against:** `bindConversation` also seeds `messages` and `knownIdsRef` and
`historySnapshotRef` — so it would have to either own those refs (folding
transcript + history into persistence) or call back into transcript / history
setters, which is the same prop-passing problem in reverse.

**Testability tooling:** `fake-indexeddb/auto` is already wired; a persistence
hook tests well with the existing storage module and `__resetForTests()` (line
99 in `core/storage.ts`).

### G. `useChatConnection` (state machine + connection lifecycle together)

**What:** `state`, `error`, `encodedLocal`, `role`, `deliberate-teardown`,
`pcRef`, `channelRef`, `transition`, `teardown`, `wirePc`, `wireChannel`,
`startAsOfferer`, `startAsAnswerer`, `submitAnswer`, `politelyAcceptOffer`,
`reset`.

**For:** These are the cluster most-entangled with each other and least
entangled with the data clusters (telemetry / transcript / history /
persistence) — they only need the data clusters' "on connect", "on message", "on
close", "on reset" hooks.

**Against:** This is half the file (~400 lines). The four entry points seed
persistence (`bindConversation`) and call `wireChannel` which then ships history
— so the "data hooks" still get called from inside connection.
`wireChannel.onmessage` calls `handleEnvelope` which is the other half of the
file. The BUG-002 / BUG-005 prev-aware `onclose` classifier (lines 617–626) and
the FEAT-008 `deliberateTeardownRef` flag must travel with this hook or its
semantics drift.

**Testability tooling:** `FakePeerConnection` + `FakeDataChannel` (already
duplicated across `App.test.tsx`, `core/rtc.test.ts`, and
`useChatSession.test.ts` — IMPRV-003 explicitly deferred sharing them to
`test-utils`). A connection hook split would force the FakePC-shared-util
question; that's a strict prerequisite, not a free side benefit.

### H. Split nothing; extract pure modules only

**What:** Move the envelope-case bodies (and possibly `bindConversation`'s merge
step) to functions in `core/wire-dispatch.ts` taking a context interface; keep
`useChatSession` as the orchestrator. Functionally overlaps with B but stops
before "hooks within hooks".

**For:** Zero hook proliferation, no context-object plumbing across hook
boundaries (just function args), dispatcher becomes unit-testable
(`dispatch(env, ctx)` with a fake ctx). Mechanically the lowest-risk way to ship
most of B's testability win.

**Against:** Doesn't reduce the hook's render-time complexity; the file is still
700+ lines after extraction; no testability win for the non-dispatch parts
(still mount the whole hook to test transcript / history / persistence
behavior).

## What should stay coalesced

- **State machine + connection lifecycle** (candidate G's body). `transition()`
  is called from inside `wireChannel.onclose` with a prev-aware reducer (BUG-002
  / BUG-005). `roleRef` gates `initiateSync`. `deliberateTeardownRef` gates
  onclose classification (FEAT-008). These three refs + state would have to be
  threaded as a unit if split.
- **The wire dispatch's sync-ack / sync-done cases + the sync timeout + the
  `pendingSyncRef` bookkeeping.** The probe-ack-done state machine is
  self-contained but mutates telemetry's sync state — sync is the bridge case
  between wire and telemetry. The "stash t2/t3 on the ref via extension
  property" hack at lines 379–380 is a code smell that highlights how much sync
  wants its own internal type.
- **`bindConversation` + `reset`'s clear-all sequence.** `reset()` resets state
  from 7 clusters; any per-cluster hook would need its own `reset()` and
  `useChatSession` would orchestrate. That's fine but it's an N-way ordering
  contract — BUG-006 demands `knownIdsRef` cleared before `messages` so a stale
  receipt doesn't survive.

## Cross-cluster reads

A future RFCTR must thread these as args, callbacks, or shared context:

- `handleEnvelope` → `conversationIdRef`, `selfPeerIdRef` (persistence)
- `handleEnvelope` → `bindPromiseRef`, `knownIdsRef`, `hasResumedRef` (history /
  transcript)
- `handleEnvelope` → `syncRef`, `pendingSyncRef`, `samplesRef` (telemetry)
- `handleEnvelope` → `channelRef` (connection)
- `transition` → `pushSample`, `setTelemetryCommitVersion` (telemetry);
  `connectedAtRef`
- `wireChannel.onOpen` → `roleRef` (state machine), `initiateSync` (telemetry),
  `conversationIdRef` + `historySnapshotRef` (persistence + history)
- `wireChannel.onclose` → `deliberateTeardownRef` (state-machine flag set by
  `politelyAcceptOffer`)
- `send` → `channelRef` (connection), `selfPeerIdRef` + `conversationIdRef`
  (persistence), `knownIdsRef` (transcript), `pushSample` + `commitTelemetry`
  (telemetry)
- `bindConversation` → `setMessages` + `knownIdsRef` (transcript),
  `historySnapshotRef` (history), `selfPeerIdRef` + `conversationIdRef`
  (persistence)
- `reset` → all seven clusters

## Test-file clustering

The 1861-line `useChatSession.test.ts` (plus the 245-line
`useChatSession.bug6-twoside.test.ts` for cross-peer persistence) groups into 9
top-level describes that map onto the candidate seams:

| describe                                       | test count    | maps to                                        |
| ---------------------------------------------- | ------------- | ---------------------------------------------- |
| `message ids`                                  | 3             | A (pure helpers)                               |
| `lifecycle`                                    | 8             | G (connection + state machine)                 |
| `submitAnswer`                                 | 2             | G                                              |
| `messages`                                     | 6             | D (transcript) + B (dispatch)                  |
| `FEAT-010 telemetry, sync, receipts`           | 11            | C (telemetry) + B (sync cases)                 |
| `teardown`                                     | 2             | G                                              |
| `state-machine guards`                         | 5             | G                                              |
| `politelyAcceptOffer (FEAT-008)`               | 7             | G                                              |
| `FEAT-012 resume`                              | 19            | E (history) + F (persistence) + D (transcript) |
| `BUG-006 two-side persistence` (separate file) | 1 (245 lines) | E + F + D                                      |

The resume + BUG-006 cluster (rows 9–10) is the most cross-cutting (each test
exercises bind + send + receive + merge + persist). That's evidence E / F / D
are the hardest to split independently and may need to land together if at all.

## Recommended ordering

If the future maker takes multiple seams, do them in this order to minimize
wasted plumbing:

1. **A first, unconditionally.** Free win, no coupling, no API surface added.
   Unblocks nothing but removes ~50 lines from the hook file.
2. **H or B second** (mutually exclusive — they overlap). H is the lower-risk
   superset of B's testability win; B is the cleaner public shape if you want
   per-case unit tests. Choose H if "ship the dispatcher-extracted version" is
   the only deliverable; choose B if a later C / G split is also on the roadmap
   (B's `Ctx` interface becomes that split's prop-passing contract).
3. **C third** (only after B/H). Telemetry's split is sane only if the sync
   wire-cases are already in a dispatcher that can call into the telemetry
   hook's surface. Doing C before B/H means the telemetry hook has to expose
   `recordSyncProbe`, `recordSyncAck`, `recordSyncDone` — three entry points
   that exist solely to be called by the in-hook dispatch.
4. **G fourth**, if at all. Once dispatch and telemetry are out, the remaining
   state-machine + connection cluster is the natural keeper of what's left of
   `useChatSession`. **Strict prerequisite:** promote `FakePeerConnection` /
   `FakeDataChannel` into `src/test-utils/` (IMPRV-003's deferred work) —
   without it the new hook's tests duplicate the fakes a fourth time.
5. **D / E / F together or not at all.** The BUG-006 merge-not-replace contract
   and FEAT-012 resume handshake span all three. Splitting one in isolation
   produces a 3-way callback web (transcript calls persistence, persistence
   calls history, history reads transcript's `knownIdsRef`) that's strictly
   worse than the current single-hook coupling. If you take this group, take all
   three and design the shared-state surface (probably a `useChatPersistence`
   that owns `knownIdsRef` + `historySnapshotRef` + `selfPeerIdRef` and exposes
   a `merge(records)` for both `bindConversation` and `handleEnvelope`'s
   `history` case) up front.

If only one seam ships, A is the right one; if two, A + H; if three, A + H + C.
Past that, the cost of the next split exceeds the reading-cost win, and the
maker should reconsider whether a 700-line hook with extracted dispatch and
telemetry is already at the right resting state.

## Counter-evidence the maker should weigh

- **The hook is already context-mounted.** ARCH-001 moved the session into
  routing context — any split must preserve a single context-provided object. So
  any hook-into-hook split (C, D, E, F, G) pays for its plumbing inside the same
  context provider that already exists; it doesn't reduce the consumer's API
  surface.
- **BUG-008 keeps the hook alive across navigation.** The hook lives in context
  and doesn't unmount when the user visits `/network` or `/conversation/:id`.
  Splitting into multiple hooks risks introducing per-hook reset bugs where one
  hook's state survives and another's doesn't — the `reset()` ordering contract
  becomes load-bearing across N hook boundaries instead of within one.
- **The 1861-line test file is the dependency.** A split's "win" is small unit
  tests that don't mount the whole hook. But the existing tests _are_ whole-hook
  integration tests, and they catch the cross-cluster bugs (BUG-002, BUG-005,
  BUG-006, BUG-007, BUG-008, FEAT-008, FEAT-012) that motivated the hook's
  current shape. Don't delete them on a split — keep them as a top-level
  acceptance suite and add the per-cluster unit tests below.
- **The 250-line dispatch isn't a 250-line cognitive load.** It's a switch where
  each case is independently readable. Reader cost on the hook is dominated by
  the _implicit_ coupling between cases (sync's three-case state machine; chat →
  receipt; history → known-ids); a seam that splits the switch but leaves the
  implicit coupling untouched pays the extraction cost without buying the
  comprehension win.

## Related tickets

- **IMPRV-003** — added the 1861-line test file; explicitly deferred sharing
  `FakePeerConnection` to `src/test-utils/`. Candidate G's prerequisite.
- **IMPRV-006** — added state-machine guards inside the hook; entangles `state`
  with lifecycle entry points (`startAsOfferer`, `startAsAnswerer`,
  `submitAnswer`).
- **IMPRV-002** — removed module-level id counter; `nextId` is now pure →
  already extractable (candidate A).
- **BUG-002** — `channel.onclose` pre-connect classification; load-bearing
  prev-aware logic at lines 617–626.
- **BUG-003** — `wireChannel` must short-circuit when `channel.readyState` is
  already `'open'` at line 602.
- **BUG-005** — separate `'closed'` vs `'failed'` terminal state; same `onclose`
  block.
- **BUG-006** — `selfPeerId` + `senderId` rollout; couples persistence, wire
  envelopes, history merge, and bind. The cross-cluster bug whose fix justifies
  "D / E / F together or not at all".
- **BUG-007** — telemetry commit-version pattern (`telemetryCommitVersion`
  - the `useEffect` driver at lines 263–266). Self-contained inside candidate C.
- **BUG-008** — back-from-network keeps live session; the hook lives in context
  and doesn't unmount.
- **FEAT-008** — polite-defer recovery; `deliberateTeardownRef` flag gates the
  `onclose` classifier. State machine + connection cluster.
- **FEAT-010** — network telemetry, sync handshake, receipts; the bulk of
  candidate C's surface.
- **FEAT-012** — resume conversation; the bulk of candidates D + E + F.
- **ARCH-001** — session lives in routing context now — any split must preserve
  a single context-provided object.
