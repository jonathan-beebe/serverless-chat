---
id: RFCTR-005
type: refactor
status: resolved
created: 2026-05-28
---

# RFCTR-005: lift extractOfferCode and classifyPastedCode out of Offerer into src/core

## Problem

`extractOfferCode(raw)` (`src/screens/Offerer.tsx:39-56`) and
`classifyPastedCode(code)` (`src/screens/Offerer.tsx:63-73`) are pure
string-handling functions declared inside a 397-line React screen module.
`extractOfferCode` pulls an encoded SDP out of either a bare paste, a
free-floating `offer=` fragment, or a full invite URL (via `readHashParam` from
`src/core/url.ts`). `classifyPastedCode` decodes the SDP via `decode()` from
`src/core/encoding.ts` and reports `'offer' | 'answer' | null` — the
load-bearing detector for FEAT-008's polite-defer flow (the user pasted another
offer into the reply box; the screen answers it instead of submitting it as an
answer). Neither helper imports React or any shell concern, yet they are
exercised only indirectly through UI flows in `src/screens/Offerer.test.tsx`.
The codebase's established functional-core convention places sibling helpers
(`readHashParam`, `buildOfferUrl`, `currentOfferUrl`, `encode`, `decode`,
`clearHash`) in `src/core/url.ts` and `src/core/encoding.ts`; these two are a
missed seam from FEAT-008.

## Outcome

A `src/core/` module exports `extractOfferCode` and `classifyPastedCode` with no
React imports. A direct test file (e.g. `src/core/inviteCode.test.ts` or
extension of `src/core/url.test.ts`) covers every branch of both helpers without
rendering React: bare-code paste, full invite URL paste, free-floating `offer=`
fragment without scheme, whitespace tolerance, undecodable garbage (classify
returns `null` without throwing), non-SDP decoded JSON (classify returns
`null`), the offer and answer happy paths. `src/screens/Offerer.tsx` imports the
symbols from `src/core/` and its line count drops; polite-defer-detection
assertions that today read as "paste this string into the textarea, see the
right session method get called" become direct unit assertions on the core
helper, leaving the screen test to verify dispatch only.
`src/screens/Offerer.test.tsx` continues to pass.

## Why it matters

The codebase has an established functional-core/imperative-shell convention
(`src/core/` for pure modules, `src/screens/` and `src/hooks/` for the React
shell). Pure helpers hidden inside a screen are reachable only through full
renders, so the URL-extraction and SDP-classification branches go un-pinned by
focused unit coverage. The classifier is the polite-peer detector that BUG-007
promoted to a cross-screen concern — regressions there silently break FEAT-008.
Lifting the helpers restores the seam, shrinks the screen, and makes the
polite-peer branch directly regression-pinnable. Same factoring win as RFCTR-001
/ RFCTR-003 / RFCTR-004.

## Discovery notes

- The sibling helpers already in `src/core/url.ts` (`readHashParam`,
  `buildOfferUrl`, `currentOfferUrl`, `clearHash`) and `src/core/encoding.ts`
  (`encode`, `decode`) are the natural neighbours. The maker can choose to
  extend `src/core/url.ts` or open a new `src/core/inviteCode.ts` — both fit the
  existing convention.
- `statusMessage(state, hasLocal)` at `src/screens/Offerer.tsx:80-97` is also a
  pure switch over `ConnectionState`. Bundling it into this move keeps the
  screen tidy; making it a separate ticket is also fine. Maker's call.
- `extractOfferCode` already delegates URL parsing to `readHashParam`; the move
  is straightforward — the only non-trivial concern is the
  `try { new URL(...) }` branch which depends on the standard `URL` constructor
  and is portable.
- `classifyPastedCode` swallows decode errors and returns `null`, matching the
  existing screen behaviour where malformed input falls through to
  `submitAnswer`'s error path. The unit tests should pin this swallow explicitly
  (no exception escapes).
- The codebase already has `src/core/` populated with pure modules. This is a
  missed seam, not a structural problem — no need to route to architecture.

## Related work

- FEAT-008 — introduced `classifyPastedCode`; polite-defer flow
- ARCH-001 — invite URL routing; introduced path-based offer URLs and
  `readHashParam` / `buildOfferUrl`
- BUG-007 — made polite-defer cross-screen — confirms `classifyPastedCode` is a
  shared concern
- RFCTR-001 — extract ConversationRow from Home; precedent for lifting cohesive
  units out of large modules
- RFCTR-003 — extract Chat into colocated components; same pattern
- RFCTR-004 — lift pure telemetry math out of `useChatSession` — adjacent open
  ticket targeting the identical "pure helpers hidden in shell" smell

## Working

- Created `src/core/inviteCode.ts` carrying `extractOfferCode` and
  `classifyPastedCode`. Chose a new module rather than extending
  `src/core/url.ts` because `classifyPastedCode` is about SDP type detection,
  not URLs — keeping the two together as the "invite-code paste flow" cohort
  reads cleanly.
- `Offerer.tsx`: dropped both function bodies and swapped imports (`decode` from
  `core/encoding` + `readHashParam` from `core/url` → `extractOfferCode`,
  `classifyPastedCode` from `core/inviteCode`; `currentOfferUrl` stays). 397 →
  356 lines (-41).
- Did NOT bundle `statusMessage` per the ticket's "maker's call" note — scoped
  this PR to the two helpers in the title. `statusMessage` lift is a separate
  ticket if anyone wants it.
- Added `src/core/inviteCode.test.ts` (14 tests):
  - extractOfferCode: bare, trimmed bare, full invite URL, URL with extra hash
    params, free-floating `offer=` and `#offer=` fragments, fallback to bare
    when URL has no `offer` param, fallback to trimmed input when nothing
    matches.
  - classifyPastedCode: valid encoded answer, valid encoded offer (FEAT-008
    polite-defer trigger), undecodable garbage swallowed to null, empty string
    swallowed to null, decoded-but-non-SDP shape, decoded type='pranswer'
    (rejected), decoded null payload.
- Measurable wins:
  - Offerer.tsx: 397 → 356 lines (-41).
  - 14 new focused tests at the unit boundary.
  - `grep -E "react|useEffect|useState" src/core/inviteCode.ts` is empty.
- Existing `Offerer.test.tsx` passes unchanged. Full suite 569/569 green.
