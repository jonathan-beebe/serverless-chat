---
id: IMPRV-034
type: improvement
status: resolved
created: 2026-05-28
---

# IMPRV-034: add direct unit tests for deriveSync math

## Problem

`deriveSync(t1, t2, t3, t4)` at `src/core/wire.ts:258-262` — the canonical
NTP-style formula (`rtt = t4 - t1 - (t3 - t2)`,
`offset = ((t2 - t1) + (t3 - t4)) / 2`) used by both peers to derive clock-sync
from the FEAT-010 probe/ack/done quad — has zero direct unit tests in
`src/core/wire.test.ts`. Its only behavioral coverage is indirect, through
`src/hooks/useChatSession.test.ts:496-581` ("offerer completes sync handshake" /
"answerer derives sync from sync-done envelope"), where arithmetic regressions
hide behind fake-PC plumbing.

## Outcome

`src/core/wire.test.ts` (or a sibling file) contains a
`describe('deriveSync', …)` block asserting: (a) zero-offset, zero-skew identity
(identical clocks ⇒ offset = 0, rtt = elapsed); (b) symmetric latency case; (c)
peer-ahead positive offset; (d) peer-behind negative offset; (e) the
answerer-mirror invariant (answerer's offset equals negation of offerer's for
the same quad); (f) RTT formula independence from clock offset; (g) graceful
behavior on degenerate inputs (NaN/Infinity propagation is bounded, no throws).
Existing indirect tests at `useChatSession.test.ts:496-581` remain.

## Why it matters

The Network screen at `src/network/Network.tsx:101` renders the formula as
user-facing prose, and per-message timing on `#network` is derived from
`deriveSync` output. An arithmetic regression — especially a sign flip that
survives one round-trip — would silently corrupt every offset/RTT shown to the
user. Hook tests catch egregious breaks; they will not catch subtle sign or
symmetry bugs.

## Discovery notes

`deriveSync` is pure — four number inputs, two number outputs — and
independently verifiable without any RTC plumbing. The mirror invariant is
currently asserted only at `useChatSession.test.ts:578`, mixed into a hook
integration test; lifting it to unit level would let the hook test shrink to
wiring-only.

## Recommendation

Add a `describe('deriveSync', …)` block to `src/core/wire.test.ts`. Construct
quads from a synthetic baseline (e.g. `t1 = 1_000_000`, then derive t2/t3/t4
from chosen latency + offset values) so each case reads as "given offset = +50ms
and one-way latency = 100ms, expect offset = 50, rtt = 200." Keep cases small
(<30 lines total). For NaN/Infinity, assert that outputs are NaN/Infinity (not
throws) — the function should propagate, not guard.

## Related work

- FEAT-010 — network telemetry; introduced sync probe/ack/done quad and
  `deriveSync`
- RSRCH-002 — `useChatSession` seam map
- IMPRV-003 — `useChatSession` had no tests (related coverage gap)

## Working

- Added a `describe('deriveSync', …)` block to `src/core/wire.test.ts` with 9
  cases. Each builds a quad via a
  `quad({baseT1, oneWayMs, offsetMs, processingMs?})` helper so the inputs read
  as "given offset X and one-way latency L, expect…"
- Cases match the ticket clauses (a)–(g): identity, symmetric latency,
  peer-ahead, peer-behind, RTT independence from offset, mirror invariant (swap
  negates both offset and rtt), and NaN/Infinity propagation.
- Surprises while writing the tests:
  - The mirror swap `deriveSync(t2,t1,t4,t3)` negates `rtt` as well as `offset`
    — not preserves rtt. Real-world quads have positive rtt, so the answerer
    takes `abs(rtt)` (or equivalent) when sourcing from the mirror; the formula
    identity is "antisymmetric in both."
  - Infinity case: with `(0, ∞, 0, 0)` both rtt and offset are `+∞`, not
    `-∞`/`+∞` as I initially guessed — useful to pin so a future guard doesn't
    silently swallow Infinity inputs.
- Added a "matches the useChatSession answerer-fixture inputs (regression
  anchor)" case that re-asserts the exact numeric quad (1000, 1100, 1110, 1200)
  → offset=5, rtt=190 that the hook test at `useChatSession.test.ts:578` depends
  on. If one drifts, the other must drift in lockstep.
- Full suite: 533/533 (+9) green.
