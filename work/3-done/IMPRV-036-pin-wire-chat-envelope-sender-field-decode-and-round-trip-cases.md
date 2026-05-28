---
id: IMPRV-036
type: improvement
status: resolved
created: 2026-05-28
---

# IMPRV-036: pin wire chat envelope sender field decode and round-trip cases

## Problem

`src/core/wire.test.ts` does not directly cover the BUG-006 `sender` field on
chat envelopes. The "round-trips a chat envelope" case (lines 12-22) omits
`sender`, and the `wire envelope decode safety` block has no cases for (a) chat
envelope missing `sender`, (b) chat envelope with non-string `sender`, or (c)
chat envelope with empty-string `sender`. The decode branch at
`src/core/wire.ts:153-157` implements optional-sender + `typeof === 'string'`
guard but is only exercised indirectly through
`src/hooks/useChatSession.test.ts:1710-1841` ("BUG-006 send/recv/merge sender"),
several layers above the wire contract.

## Outcome

`src/core/wire.test.ts` has direct cases that observe:

- (a) a chat envelope containing `sender: '<uuid>'` round-trips intact through
  `encode → decode`,
- (b) a chat envelope with `sender` absent decodes to a chat envelope whose
  `sender` is `undefined` (legacy peer fallback preserved),
- (c) a chat envelope whose incoming `sender` is non-string (e.g. number)
  decodes to a chat envelope whose `sender` is `undefined` while the envelope
  itself is retained,
- (d) a chat envelope whose incoming `sender` is the empty string decodes to a
  chat envelope whose `sender` is `''` (behavior pin of the current
  `typeof === 'string'` check, not a fix).

Each case lives in the existing `wire envelope encode/decode round-trip` or
`wire envelope decode safety` describe block so failures surface adjacent to
peer cases.

## Why it matters

BUG-006 was a recently-stabilized fix for attribution-corruption ("everyone
shows as You" on saved transcripts). The optional-sender branch is the bridge
for users mid-upgrade. A future tightening that, say, rejects envelopes missing
`sender` would pass `src/core/wire.test.ts` today but break legacy-peer interop
— caught only by the hook integration tests, which is an expensive failure layer
for a wire-contract regression.

## Discovery notes

- `src/core/wire.ts:32-46` defines `ChatEnvelope.sender` as optional with a
  comment explaining backward compat.
- `src/core/wire.ts:156` implements the guard:
  `const sender = typeof obj.sender === 'string' ? obj.sender : undefined`.
- The empty-string case (d) is a behavior pin because `typeof '' === 'string'`;
  it documents current behavior and gives later refactors an explicit "this is
  intentional" anchor rather than silently changing it.
- Indirect coverage in `src/hooks/useChatSession.test.ts` (the "BUG-006
  send/recv/merge sender" block) exercises end-to-end attribution but never the
  wire decode in isolation.

## Recommendation

Add four `it` cases inside `src/core/wire.test.ts`: one in the round-trip
describe (sender present), three in the decode safety describe (sender absent →
`undefined`, sender non-string → `undefined`, sender empty-string → `''`). Keep
the existing "round-trips a chat envelope" case as-is so the no-sender
round-trip path also stays pinned, or extend it. Reference BUG-006 in test names
so the contract intent is visible in failure output.

## Related work

- BUG-006 (root cause; introduced `ChatEnvelope.sender`)
- FEAT-010 (chat envelope shape and the "drop malformed input" contract
  referenced at `src/core/wire.test.ts:4-9`)
- FEAT-012 (sender propagation into `HistoryMessage` and the legacy `from`
  fallback)
- Existing indirect coverage: `src/hooks/useChatSession.test.ts:1710-1841`

## Working

- Added one round-trip case (sender present) and three decode-safety cases
  (sender absent, non-string sender, empty-string sender) to
  `src/core/wire.test.ts`. Original "round-trips a chat envelope" case preserved
  as the no-sender round-trip anchor.
- Each new case references BUG-006 in the name so the failure output points
  straight at the contract intent.
- The empty-string case (`sender: ''`) is intentionally a behaviour pin, not a
  fix: `typeof '' === 'string'`, so the guard at `wire.ts:156` passes it
  through. Documented in the test comment so a future refactor that wants to
  coerce `''` → `undefined` must update the case explicitly.
- Full suite: 545/545 (+4) green.
