---
id: RSRCH-002
type: research
status: resolved
created: 2026-05-27
---

# RSRCH-002: usechatsession seam map

## Problem

`src/hooks/useChatSession.ts` is 955 lines exporting one hook with 14+ inner
`useCallback`s, 8 `useState` slots, 11 `useRef` slots, and a 250-line
envelope-dispatch switch (lines 302–556). It carries seven distinct
responsibility clusters (state machine, connection lifecycle, wire dispatch,
transcript, history/resume, telemetry, persistence) that share refs across
cluster boundaries — e.g. `handleEnvelope` reads `conversationIdRef`,
`selfPeerIdRef`, `knownIdsRef`, `bindPromiseRef`, `hasResumedRef`, `samplesRef`,
`syncRef`, `pendingSyncRef`, `channelRef` and writes `setMessages`,
`setHasResumed`, `pushSample`, `commitTelemetry`. A naive split on
responsibility names would shatter these shared refs into prop-passed objects or
context, inflating the API surface without reducing coupling, and risks breaking
the state machine BUG-002 / BUG-005 fixed (the prev-aware `onclose` classifier)
or the BUG-006 / BUG-007 race ordering between `bindConversation`,
`knownIdsRef`, and live envelopes.

## Outcome

A research artifact (this ticket's Discovery notes) exists that, for each
candidate seam, names (a) what would be extracted (functions + state), (b) why
it's a seam (low coupling to the rest), (c) what cross-cluster threading the
seam would require. The artifact is concrete enough that a future RFCTR ticket
can cite the candidate by name and inherit the for/against list. A future maker
can accept, edit, or reject each candidate seam individually, and the chosen
seam(s) get filed as a follow-up refactor ticket.

Published artifact: `docs/usechatsession-seam-map.md`.

## Why it matters

Splitting on the wrong axis costs more than not splitting — once a seam is
committed, the prop-passing or context plumbing becomes load-bearing and hard to
retract. Reader-cost on a 955-line hook is real (this is the codebase's
behaviorally richest module per IMPRV-003). The 1861-line test file is the
testability ceiling of a single-hook design: every behavior pays the cost of
mounting the whole hook with FakePC stubs. The repo is an open-source spike
whose hook is its showcase; a well-chosen split is a teaching moment, a bad one
is a warning sign.

## Discovery notes

### Responsibility map (state → mutators/readers)

1. **State machine** — `state`, `error`, `encodedLocal`, `roleRef`,
   `deliberateTeardownRef`. Mutated by `transition()` (the only setter that
   pushes state-change samples), `startAsOfferer`, `startAsAnswerer`,
   `submitAnswer`, `politelyAcceptOffer`, `reset`,
   `wirePc.onconnectionstatechange`, `wireChannel.onclose`.
2. **Connection lifecycle** — `pcRef`, `channelRef`. Mutated by `wirePc`,
   `wireChannel`, `teardown`, the four start/submit/polite entry points,
   `reset`.
3. **Wire dispatch** — `handleEnvelope` (8 cases: chat, sync-probe, sync-ack,
   sync-done, history, receipt; default-drop). Reads `channelRef`, `syncRef`,
   `pendingSyncRef`, `conversationIdRef`, `selfPeerIdRef`, `bindPromiseRef`,
   `knownIdsRef`, `hasResumedRef`. Writes `setMessages`, `setHasResumed`,
   `syncRef`, `pendingSyncRef`, `samplesRef`, calls `storage.appendMessage` /
   `bulkInsertMessages`, sends receipt / sync-ack / sync-done envelopes.
4. **Transcript** — `messages`, `knownIdsRef`. Mutated by `handleEnvelope`
   (chat, history, receipt-delivery-flip), `send`, `bindConversation`, `reset`.
5. **History / resume** — `hasResumed` / `hasResumedRef`, `historySnapshotRef`,
   `bindPromiseRef`. Snapshot taken in `bindConversation`; shipped by
   `wireChannel.onOpen`; merged by `handleEnvelope` 'history' case; latch
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

### Candidate seams (with for/against)

- **A. Extract pure helpers** — `nextId`, `emptyTelemetry`, `computeSummary`,
  `resolveFrom`, `deriveSync` (already in `core/wire`). **For:** already pure,
  zero state. **Against:** trivial, only saves ~50 lines; doesn't address the
  250-line dispatch.

- **B. Extract `handleEnvelope` as a pure dispatcher** taking a context object
  `{channel, refs, setters, callbacks}`. **For:** 250-line switch is the file's
  reading-cost hotspot; each case is logically independent; would yield directly
  unit-testable dispatch (no `renderHook`). **Against:** every case needs to
  read or write 4–8 of the hook's refs/setters; the context object would have
  ~15 fields; if it's a stable object it must be memoized carefully or the
  dispatcher's identity churns; cross-case state (`pendingSyncRef` mutated by
  sync-probe and read by sync-ack / sync-done) lives in the context, not the
  dispatcher.

- **C. `useChatTelemetry` hook** — owns `samplesRef`, `syncRef`,
  `connectedAtRef`, `pendingSyncRef`, `telemetry` state, `pushSample`,
  `commitTelemetry`, `initiateSync`, sync timeout. **For:** telemetry has a
  clean public surface (`{telemetry, pushSample, recordSync, initiateSync}`);
  the BUG-007 commit-version pattern is self-contained; the `/network` page
  reads telemetry only. **Against:** `transition()` must call
  `pushSample({kind:'state-change'})` and bump commit version — so the telemetry
  hook either exposes those entry points to the state-machine hook or the
  state-machine hook reaches into telemetry refs. `handleEnvelope` sync-probe /
  ack / done cases write `syncRef` and call `channel.send` — sync handshake is
  half wire-protocol, half telemetry. The split would have to put the sync state
  in telemetry and the sync wire-cases stay in the dispatcher reading
  telemetry's setters.

- **D. `useChatTranscript` hook** — owns `messages`, `knownIdsRef`, `hasResumed`
  / `hasResumedRef`, `historySnapshotRef`. **For:** transcript is the cluster
  with the cleanest external API
  (`{messages, hasResumed, appendOutgoing, appendIncoming, mergeHistory, snapshotForOutgoingHistory, clear}`).
  Receipt delivery-flip is a transcript-local mutation. **Against:**
  `appendOutgoing` and `appendIncoming` both also write storage (couples to
  persistence binding's `conversationIdRef` + `selfPeerIdRef`) — either the
  transcript hook calls storage (couples it to persistence) or the dispatcher
  passes a `persistOutgoing` callback (re-fragmenting the chat case across two
  files). `bindConversation`'s seed must merge with live entries (BUG-006
  merge-not-replace rule) — the merge logic would have to live wherever
  `knownIdsRef` does.

- **E. `useChatHistory` hook** — owns `hasResumed`, `historySnapshotRef`,
  `bindPromiseRef`, the merge-on-receive logic, the snapshot-on-open shipper.
  **For:** history/resume is the latest-added cluster (FEAT-012), has the most
  explicit cross-cluster contract (await `bindPromiseRef` before merge), and the
  merge logic is ~70 lines of testable pure code if the setters/refs are passed
  in. **Against:** `bindPromiseRef` is set by `bindConversation`
  (persistence-binding's responsibility), but awaited by `handleEnvelope`
  'history' — splitting puts the producer and consumer in different files.
  Snapshot-on-open lives inside `wireChannel.onOpen` — so `wireChannel` would
  have to call `history.shipSnapshot(channel)`.

- **F. `useChatPersistence` hook** — owns `conversationId`, `conversationIdRef`,
  `selfPeerIdRef`, `bindConversation`. **For:** persistence binding is the
  cluster that most cleanly maps to one storage-module dependency; tests could
  mock the whole hook. **Against:** `bindConversation` also seeds `messages` and
  `knownIdsRef` and `historySnapshotRef` — so it would have to either own those
  refs (folding transcript + history into persistence) or call back into
  transcript/history setters, which is the same prop-passing problem in reverse.

- **G. Extract state machine + connection lifecycle together
  (`useChatConnection`)** — `state`, `error`, `encodedLocal`, `role`,
  deliberate-teardown, `pcRef`, `channelRef`, `transition`, `teardown`,
  `wirePc`, `wireChannel`, `startAsOfferer`, `startAsAnswerer`, `submitAnswer`,
  `politelyAcceptOffer`, `reset`. **For:** these are the cluster most-entangled
  with each other and least entangled with the data clusters (telemetry /
  transcript / history / persistence) — they only need the data clusters' "on
  connect", "on message", "on close", "on reset" hooks. **Against:** this is
  half the file (~400 lines). The four entry points seed persistence
  (`bindConversation`) and call `wireChannel` which then ships history — so the
  "data hooks" still get called from inside connection. `wireChannel.onmessage`
  calls `handleEnvelope` which is the other half of the file.

- **H. Split nothing; extract pure modules only.** Move the envelope-case bodies
  to functions in `core/wire-dispatch.ts` that take a context interface; keep
  `useChatSession` as the orchestrator. **For:** zero hook proliferation, no
  context-object plumbing, dispatcher becomes unit-testable
  (`dispatch(env, ctx)` with a fake ctx). **Against:** doesn't reduce the hook's
  render-time complexity; the file is still 700+ lines after extraction; no
  testability win for the non-dispatch parts.

### What should stay coalesced

- **State machine + connection lifecycle** (candidate G's body). `transition()`
  is called from inside `wireChannel.onclose` with a prev-aware reducer (BUG-002
  / BUG-005); `roleRef` gates `initiateSync`; `deliberateTeardownRef` gates
  onclose classification (FEAT-008). These three refs + state would have to be
  threaded as a unit if split.
- **The wire dispatch's sync-ack / sync-done cases + the sync timeout + the
  `pendingSyncRef` bookkeeping.** The probe-ack-done state machine is
  self-contained but mutates telemetry's sync state — sync is the bridge case
  between wire and telemetry.
- **`bindConversation` + `reset`'s clear-all sequence.** `reset()` resets state
  from 7 clusters; any per-cluster hook would need its own `reset()` and
  `useChatSession` would orchestrate. That's fine but it's an N-way ordering
  contract (BUG-006 demands `knownIdsRef` cleared before messages so a stale
  receipt doesn't survive).

### Cross-cluster reads

A future RFCTR must thread these as args, callbacks, or shared context:

- `handleEnvelope` → `conversationIdRef`, `selfPeerIdRef` (persistence)
- `handleEnvelope` → `bindPromiseRef`, `knownIdsRef`, `hasResumedRef`
  (history/transcript)
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

### Test-file clustering (parallel signal for natural seams)

The 1861-line test file groups into 8 describes that map roughly onto candidate
seams:

- "message ids" (3 tests) → A pure helpers
- "lifecycle" (8 tests) → G connection + state machine
- "submitAnswer" (2 tests) → G
- "messages" (5 tests) → D transcript + B dispatch
- "FEAT-010 telemetry, sync, receipts" (12 tests) → C telemetry + B sync cases
- "teardown" (2 tests) → G connection
- "state-machine guards" (5 tests) → G
- "politelyAcceptOffer FEAT-008" (6 tests) → G
- "FEAT-012 resume" + BUG-006 (~22 tests) → E history + F persistence + D
  transcript intertwined

The resume + BUG-006 cluster is the most cross-cutting (each test exercises
bind + send + receive + merge + persist). That's evidence E / F / D are the
hardest to split independently and may need to land together if at all.

### Testability tooling for asserting seams

- **Candidate B (pure dispatcher)** is the highest-leverage testable artifact —
  once `handleEnvelope` is a function taking a context, each case becomes a unit
  test with a hand-rolled context object, no `renderHook`, no FakeRTC.
- **Candidate A** is free (already pure).
- **Candidate C** is testable as a hook in isolation if the sync wire cases stay
  in the parent.
- **Candidates D / E / F** are hardest to test independently because the BUG-006
  merge-not-replace contract spans all three.

## Related work

- IMPRV-003 — added the 1861-line test file; explicitly deferred sharing
  FakePeerConnection to `test-utils`.
- IMPRV-006 — added state-machine guards inside the hook; entangles state with
  lifecycle entry points.
- IMPRV-002 — removed module-level id counter; `nextId` is now pure → already
  extractable.
- BUG-002 — `channel.onclose` pre-connect classification; load-bearing
  prev-aware logic at lines 617–626.
- BUG-003 — `wireChannel` must short-circuit when `channel.readyState` already
  `'open'` at line 602.
- BUG-005 — separate `'closed'` vs `'failed'` terminal state; same `onclose`
  block.
- BUG-006 — `selfPeerId` + `senderId` rollout; couples persistence, wire
  envelopes, history merge, and bind.
- BUG-008 — back-from-network keeps live session; relies on the hook living in
  context, not unmounting.
- ARCH-001 — session lives in routing context now — any split must preserve a
  single context-provided object.

## Working

Validated each cited line range, function name, and ref reference in the
Discovery notes against `src/hooks/useChatSession.ts` at the resolved date.

### Citations that held up

- File length 955 — matches.
- `handleEnvelope` lines 302–556 — matches.
- 8 `useState` slots — matches (state, error, encodedLocal, messages, telemetry,
  conversationId, hasResumed, telemetryCommitVersion).
- `wireChannel.onclose` lines 617–626 — matches.
- BUG-003 short-circuit at line 602 — matches.
- BUG-007 commit-version `useEffect` at lines 263–266 — matches.
- Cross-cluster ref reads enumerated for `handleEnvelope`, `transition`,
  `wireChannel.onOpen`, `wireChannel.onclose`, `send`, `bindConversation`,
  `reset` — all verified at the cited locations.
- `nextId`, `resolveFrom`, `emptyTelemetry`, `computeSummary` are pure
  module-scope helpers at lines 97, 110, 119, 128 — matches.
- `deriveSync` is in `core/wire.ts` (line 258 there) — matches.

### Citations that needed correction

- "11 `useRef` slots" → **14** (pcRef, channelRef, conversationIdRef,
  selfPeerIdRef, bindPromiseRef, knownIdsRef, hasResumedRef, historySnapshotRef,
  samplesRef, syncRef, connectedAtRef, pendingSyncRef, deliberateTeardownRef,
  roleRef).
- "14+ `useCallback`s" → **15** (the +1 the scope agent missed:
  `commitTelemetry`).
- Test file describe count "8" → **9** (FEAT-012 resume is its own top-level
  describe, distinct from the others).
- Per-describe test counts:
  - `messages` — claimed 5, actual 6.
  - `FEAT-010 telemetry, sync, receipts` — claimed 12, actual 11.
  - `politelyAcceptOffer (FEAT-008)` — claimed 6, actual 7.
  - `FEAT-012 resume` — claimed ~22, actual 19.

### New material added to the artifact beyond the scope draft

- **`useChatSession.bug6-twoside.test.ts`** (245-line companion test file with a
  single cross-peer test). The scope agent missed it; it is part of the
  candidate E/F/D regression suite.
- **At-a-glance topology section** counting `useState` / `useRef` /
  `useCallback` / pure helpers / `useEffect` so the reader can verify the hook's
  surface from the artifact without re-reading the file.
- **Testability tooling per candidate** — what fake / harness each split would
  need. Surfaces that candidate G is gated on the IMPRV-003-deferred
  `FakePeerConnection` test-utils promotion.
- **Recommended ordering section** — explicit "A first / H or B second / C third
  / G fourth / D-E-F together or not at all" with reasoning. The Outcome bars
  this from being a winner-pick, but it informs the maker's ordering choice if
  multiple are taken.
- **Counter-evidence section** — ARCH-001 already mounts the hook in context
  (split doesn't reduce consumer API surface); BUG-008 keeps it alive across
  navigation (`reset()` ordering becomes load-bearing across N hook boundaries);
  the 1861-line test file is the integration regression suite that must survive
  any split; the 250-line dispatch's reading cost is the _implicit_ coupling
  between cases, which extraction doesn't touch.
- **The "stash t2/t3 on the ref via extension property" hack at lines 379–380**
  flagged in the "what should stay coalesced" section as a code smell — sync
  wants its own internal type. Possible follow-up.

### Follow-up candidates surfaced (not bundled)

- **`FakePeerConnection` + `FakeDataChannel` are duplicated three ways**
  (`App.test.tsx`, `core/rtc.test.ts`, `useChatSession.test.ts`). IMPRV-003
  explicitly deferred consolidating them into `src/test-utils/`. Promoting them
  is a strict prerequisite for candidate G and would shorten the test files
  materially. Candidate IMPRV ticket.
- **The `sync-probe` case's `pendingSyncRef as unknown as { t2, t3 }` cast at
  lines 379–380** carries t2/t3 on the timer object via an extension property —
  a code smell visible in the cited handleEnvelope case. Replacing with an
  explicit internal `PendingSync` discriminant is small and would unblock the
  sync-as-internal-state-machine refactor inside candidate C. Candidate IMPRV
  ticket.

### Done

- Discovery notes validated and corrected against current code.
- Artifact published at `/workspace/docs/usechatsession-seam-map.md`.
- Outcome section points to the published artifact.
- `npm run ci` green.
- Ticket moved to `work/3-done/`; frontmatter `status: resolved`.
