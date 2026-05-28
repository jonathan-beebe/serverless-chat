---
id: RFCTR-004
type: refactor
status: resolved
created: 2026-05-28
---

# RFCTR-004: lift pure telemetry math out of useChatSession into src/core/telemetry

## Problem

`src/hooks/useChatSession.ts:142-154` declares
`computeSummary(samples, syncRtt)`, a pure function that computes median / p95 /
current / sampleCount from a `TelemetrySample[]` plus optional sync RTT. It
lives inside the imperative-shell hook module (1052 lines) and is exercised only
through hook integration tests (`src/hooks/useChatSession.test.ts:471-768`, 2013
lines total) that spin up a full React render. The math has no dependency on
React, RTCPeerConnection, or any shell concern. The `TelemetrySample` /
`TelemetrySummary` / `NetworkTelemetry` value types and the `emptyTelemetry()`
factory (lines 133-140) sit in the same file with the same property.
`resolveFrom` (lines 124-131) is likewise pure and is the BUG-006 truth table.
The functional-core/imperative-shell boundary the codebase already follows
(`src/core/wire.ts`, `transcript.ts`, `url.ts`, `rtc.ts`, `encoding.ts`,
`storage.ts`, `clipboard.ts`) is muddy here — pure value transforms live next to
`useRef` / `useEffect`.

## Outcome

A new `src/core/telemetry.ts` module exports `computeSummary`, `emptyTelemetry`,
and the `TelemetrySample` / `TelemetrySummary` / `NetworkTelemetry` types. A new
`src/core/telemetry.test.ts` directly covers the math: zero samples, one sample,
even and odd sample counts, p95 edge case on tiny inputs, sync-only /
sample-only / both. `src/hooks/useChatSession.ts` imports these symbols from
`src/core/telemetry` instead of declaring them, and its line count drops
accordingly. The public API of `useChatSession` is unchanged; existing hook
integration tests in `src/hooks/useChatSession.test.ts` that exercise telemetry
continue to pass without modification. `src/core/telemetry.ts` contains no React
imports.

## Why it matters

The codebase has an established functional-core/imperative-shell convention
(`src/core/` for pure modules, `src/hooks/` for the React shell). Pure math
living inside a 1052-line hook hides behind integration tests that are slow to
write and slow to read, and the percentile/median branches go un-pinned by
focused unit coverage. Lifting the math restores the seam, shrinks both files,
and lets the percentile logic be regression-pinned directly. This is the same
factoring win delivered by RFCTR-001 and RFCTR-003 for components.

## Discovery notes

- `resolveFrom` (lines 124-131) is pure, three-input, and BUG-006-load-bearing.
  It is a candidate to bundle into the same move (likely into
  `src/core/transcript.ts` or alongside the telemetry move, maker's call).
  Lifting it gives BUG-006 a focused regression pin.
- The codebase already has `src/core/` populated with pure modules (`wire.ts`,
  `transcript.ts`, `url.ts`, `rtc.ts`, `encoding.ts`, `storage.ts`,
  `clipboard.ts`, `rtcDiagnostics.ts`). This is a missed seam, not a structural
  problem — no need to route to architecture.
- Success can be measured concretely: (a) `useChatSession.ts` line count drops,
  (b) telemetry-math assertions in `useChatSession.test.ts` move to or are
  duplicated as direct calls in `core/telemetry.test.ts`, (c) the new module has
  zero React imports.

## Related work

- FEAT-010 — introduced telemetry, source of `computeSummary`
- BUG-006 — `resolveFrom` is the load-bearing helper for the senderId vs
  legacyFrom truth table
- RFCTR-001 — extract ConversationRow from Home; precedent for lifting cohesive
  units out of large modules
- RFCTR-003 — extract Chat into colocated components; same pattern
- RSRCH-002 — useChatSession seam map; catalogues the hook's internal seams
- IMPRV-034 — add direct unit tests for deriveSync math; adjacent inbox ticket
  targeting the same "pure math hidden in shell" smell

## Working

- Created `src/core/telemetry.ts` carrying `NetworkTelemetry`,
  `TelemetrySummary`, `TelemetrySample`, `emptyTelemetry`, and `computeSummary`.
  Only `ConnectionState` is imported (from `./rtc`) — no React, no storage, no
  PC.
- Deleted the same declarations + implementations from
  `src/hooks/useChatSession.ts` and re-exported the three type aliases from
  there so the existing `import type { ... } from '../hooks/useChatSession'` in
  `Network.tsx` / `Network.test.tsx` keeps working. Public API unchanged.
- Did NOT bundle `resolveFrom` in the same move (per the discovery notes'
  "maker's call"). The ticket title scopes this to telemetry; `resolveFrom`
  deserves its own RFCTR.
- Added `src/core/telemetry.test.ts` (10 tests) covering: empty/null shape,
  syncRtt-only, receipt-only with non-receipt kinds ignored, combined
  sync+receipts with `current = last appended`, odd-count median (upper-middle,
  no averaging), even-count median (also upper-middle — pinning the
  implementation's deliberately no-averaging behaviour), p95 collapse-to-max on
  tiny inputs, p95 index at `floor(n*0.95)` for n=20, and the
  `min(n-1, floor(n*0.95))` clamp at n=21.
- Measurable wins:
  - useChatSession.ts: 1052 → 1008 lines (-44).
  - 10 new focused tests directly on the math.
  - `grep -E "react|useRef|useEffect" src/core/telemetry.ts` is empty.
- Existing hook tests in `useChatSession.test.ts` continue to pass unchanged
  (full suite 555/555 green).
