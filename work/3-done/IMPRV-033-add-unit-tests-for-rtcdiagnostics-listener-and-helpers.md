---
id: IMPRV-033
type: improvement
status: resolved
created: 2026-05-28
---

# IMPRV-033: add unit tests for rtcDiagnostics listener wiring and helpers

## Problem

`src/core/rtcDiagnostics.ts` (188 lines) has no test file. The module is
dev-only (gated by `import.meta.env.DEV`) and is wired into every
`RTCPeerConnection` created in `src/core/rtc.ts:116,146` via
`attachRtcDiagnostics`. Pure helpers (`classifyType`, `formatCounts`,
`describeCandidate` — lines 26-54), the `logSelectedPair` async path that walks
`pc.getStats()` reports with multiple narrowing branches (lines 68-94), the
listener wiring across `icegatheringstatechange`, `icecandidate`,
`icecandidateerror`, `iceconnectionstatechange`, `signalingstatechange`,
`connectionstatechange` (lines 102-187), and the load-bearing "no srflx/relay →
STUN-blocked" warning (lines 130-138) all have zero behavioral coverage. The
only adjacent tests are `src/core/rtc.test.ts` (covers `waitForIceComplete`
only) and `src/hooks/useChatSession.test.ts` (uses fake PCs that never dispatch
these events).

## Outcome

`src/core/rtcDiagnostics.test.ts` exists and asserts: (a) the pure
classifier/formatter helpers (`classifyType`, `formatCounts`,
`describeCandidate`) return the expected strings against representative
candidate inputs including the `'unknown'` fallback; (b) `attachRtcDiagnostics`,
driven by a `FakePeerConnection` that supports `addEventListener` + synthesized
event dispatch, emits the expected `console.info` / `console.warn` calls for
each of the six listener channels; (c) the "no srflx/relay → STUN-blocked"
warning fires when gathering completes with only host candidates, and does NOT
fire when at least one srflx or relay candidate was tallied; (d)
`logSelectedPair`'s `getStats` failure branch emits a `console.warn` and does
not throw.

## Why it matters

When a user reports "the chat won't connect", engineers read these diagnostic
lines first. A regression that breaks them is invisible until the next real
connection-failure debug session — at which point the diagnostic surface lies.
The dev-only gate means production is unaffected, but contributor velocity on
the WebRTC layer depends entirely on these lines being correct. The surface is
also adjacent to recently-hardened WebRTC paths (BUG-002, BUG-003, BUG-005,
FEAT-010) that are likely to attract further changes.

## Discovery notes

- The module is gated by `import.meta.env.DEV`; tests must either run under DEV
  (vitest defaults to `import.meta.env.DEV === true`) or stub the gate.
- The existing `FakePeerConnection` in `src/core/rtc.test.ts` already implements
  `addEventListener` / `removeEventListener` against a `listeners[]` array —
  it's the closest scaffolding to extend, but it currently dispatches a single
  event type. Extending it to dispatch by event name (a
  `Map<string, Set<handler>>`) keeps it local to the new test file rather than
  promoting it (IMPRV-003's decision: "do not extract `FakePeerConnection` into
  shared test-utils yet" still applies).
- `logSelectedPair` reads `pc.getStats()` which returns an `RTCStatsReport` (a
  Map-like with `.forEach`) — the fake needs to expose a `getStats()` that
  returns a `Map`-shaped iterable, and a separate variant that rejects to cover
  the failure branch.
- All assertions ride on `vi.spyOn(console, 'info' | 'warn')`; the project's
  `test-setup.ts` already throws on `console.error` (BUG-007), and the module
  deliberately avoids `console.error`, so that guard does not need to be
  relaxed.

## Recommendation

Add `src/core/rtcDiagnostics.test.ts` with:

1. A `FakePeerConnection` extended over the one in `rtc.test.ts` —
   `Map<string, Set<EventListener>>` for listeners, mutable `iceGatheringState`
   / `iceConnectionState` / `connectionState` / `signalingState`, a
   `getConfiguration()` returning a minimal `{ iceServers: [...] }`, a
   `getStats()` returning a `Map`-shaped report, and a
   `dispatch(eventName, event)` helper.
2. One `describe` per helper: drive `classifyType` against `host` / `srflx` /
   `prflx` / `relay` / `undefined` / `null` / `'mdns'`; drive `formatCounts`
   against an all-zero record (→ `'none'`), a mixed record (→ comma-joined
   string in `host, srflx, prflx, relay, unknown` order), and a partial record
   (only non-zero keys appear); drive `describeCandidate` against a
   fully-populated `RTCIceCandidate` shape and a minimally-populated one (verify
   `?` fallbacks).
3. One `describe('attachRtcDiagnostics')` with one `it` per listener channel:
   dispatch the relevant event, assert the spy was called with the expected
   substring. Cover both `'connected'` (triggers `logSelectedPair`) and
   `'failed'` (triggers the TURN-hint warn) on `connectionstatechange`.
4. One `it` for the "no srflx/relay → STUN-blocked warn" path: dispatch four
   `icecandidate` events with only `host` types, then dispatch
   `icegatheringstatechange` with state `'complete'`, assert `console.warn` was
   called with a message matching `/no srflx\/relay candidates/`.
5. One `it` for the "has srflx → no warn" path: same shape but with one srflx
   candidate, assert `console.warn` was NOT called for that line.
6. One `it` for `logSelectedPair`'s success path (stub `getStats` to return a
   Map containing one nominated `candidate-pair` plus `local-candidate` +
   `remote-candidate`) and one `it` for the failure path (stub `getStats` to
   reject — assert `console.warn` called with `'getStats failed'`).

Style follows RFCTR-002: assert observable behavior (console call args), not
source-file content.

## Related work

- IMPRV-003 — use-chat-session-no-tests; same shape, established the
  `FakePeerConnection` precedent in `src/hooks/useChatSession.test.ts`.
- IMPRV-001 — ice-gathering-no-timeout; established the local
  `FakePeerConnection` pattern now in `src/core/rtc.test.ts`.
- RFCTR-002 — replace-file-content-tests-with-behavior-assertions; test-style
  guidance: assert observable behavior, not file content.
- BUG-002, BUG-003, BUG-005, FEAT-010 — adjacent WebRTC paths recently hardened.

## Working

- Added `src/core/rtcDiagnostics.test.ts` (19 tests) — runs in the `core` node
  project, no jsdom.
- Local `FakePeerConnection` with per-event-name listener registries
  (`Map<string, Set<EventListener>>`), mutable state fields for the four state
  machines, and a `setStats(impl)` hook for the `getStats` paths. Not extracted
  to shared test-utils — IMPRV-003's "don't promote" call still applies.
- Helpers (`classifyType`, `formatCounts`, `describeCandidate`) are private;
  covered indirectly via dispatch-driven assertions on console output —
  exercises the same code paths and matches the RFCTR-002 behavioural-assertion
  style.
- Spy mechanic:
  `vi.spyOn(console, 'info' | 'warn').mockImplementation(() => {})` replaces the
  test-setup buffer wrapper for the duration of the test; `vi.restoreAllMocks()`
  in afterEach restores per the project convention.
- Coverage matches the ticket's six clauses: helpers via summary lines, all six
  listener channels, the no-srflx/relay STUN warn (and the inverse),
  `logSelectedPair` success / no-pair / reject paths.
- Full suite: 524/524 (+19) green.
