---
id: IMPRV-035
type: improvement
status: resolved
created: 2026-05-28
---

# IMPRV-035: add unit tests for buildIceServers env-driven branches

## Problem

`buildIceServers()` at `src/core/rtc.ts:29-40` resolves three Vite env vars
(`VITE_TURN_URLS`, `VITE_TURN_USERNAME`, `VITE_TURN_CREDENTIAL`) into the
runtime `RTCConfiguration.iceServers` list — with branching for missing creds,
empty URL list, single URL, and comma-separated multi-URL parse — and has zero
direct unit tests. `src/core/rtc.test.ts` covers `waitForIceComplete` only.
Because `ICE_CONFIG` is computed at module-import time (line 42), the test
process only ever exercises the no-env path. A regression in the env-parsing
logic (off-by-one in `.split(',').map(trim).filter(Boolean)`, malformed
`RTCIceServer` shape, wrong fallback) would not surface until production with
TURN env vars set — the very path the SECURITY comment at lines 22-28 warns
about.

## Outcome

`src/core/rtc.test.ts` contains a `describe('buildIceServers', ...)` block
asserting: (a) all three env vars unset -> returned config has `iceServers`
equal to the STUN-only base set; (b) any one of the three missing -> still falls
back to STUN-only base; (c) all three set with a single URL -> returned config
appends one `RTCIceServer` carrying that URL plus the username and credential;
(d) URLs given as comma-separated -> URL list is parsed, trimmed of whitespace,
and empty entries dropped; (e) URLs string set but parses to an empty list (e.g.
`","` or `"   "`) -> falls back to STUN-only base. STUN-only base configuration
continues to be produced unchanged when env vars are absent.

## Why it matters

Symmetric-NAT users (corporate guest Wi-Fi, mobile carrier-grade NAT, some VPN
exits) depend on TURN to connect at all. A silent regression that drops the
configured TURN entry would manifest as "the chat never connects on some
networks" — a hard bug to reproduce without the same network environment, and
exactly the class of failure the SECURITY note acknowledges is high-cost. The
function is a pure function of its env inputs, so the cost of covering it is
small.

## Discovery notes

- `ICE_CONFIG` (line 42) is a module-level const initialized at import time, so
  `vi.stubEnv` calls after module load do not re-run `buildIceServers`. The two
  workable shapes are: (1) re-export `buildIceServers` from `rtc.ts` and call it
  directly per case after `vi.stubEnv`; (2) keep the function private and use
  `vi.resetModules()` + dynamic `await import('./rtc')` per case to force the
  IIFE to re-run. Option (1) is simpler and matches the `currentOfferUrl`
  pattern at `src/core/url.test.ts:62-72`.
- `vi.stubEnv` against `import.meta.env.VITE_TURN_*` is the same mechanism
  `url.test.ts` uses for `BASE_URL`; no new infrastructure needed.
- Always remember to `vi.unstubAllEnvs()` in a `finally` or `afterEach` to avoid
  state leaking between cases.
- `acceptOffer` / `acceptAnswer` / `createOffer` consume `ICE_CONFIG` but
  require a full `RTCPeerConnection` fake; out of scope for this ticket. Those
  SDP-level paths deserve their own ticket if anyone takes them on.

## Recommendation

Add a `describe('buildIceServers', ...)` block to `src/core/rtc.test.ts`.
Re-export `buildIceServers` from `src/core/rtc.ts` (the function is currently
private; exporting it is the smallest seam that avoids `vi.resetModules`
gymnastics). For each case: `vi.stubEnv('VITE_TURN_URLS', ...)` /
`vi.stubEnv('VITE_TURN_USERNAME', ...)` /
`vi.stubEnv('VITE_TURN_CREDENTIAL', ...)`, call `buildIceServers()`, assert
against the returned array. Use an `afterEach` that calls `vi.unstubAllEnvs()`.
Cases (mirroring OUTCOME):

1. all unset -> returns the STUN-only `BASE_ICE_SERVERS` list (2 entries,
   stun.cloudflare + stun.l.google).
2. urls + username set, credential unset -> returns STUN-only.
3. urls + credential set, username unset -> returns STUN-only.
4. username + credential set, urls unset -> returns STUN-only.
5. all three set, single URL `"turn:turn.example.com:3478"` -> returns 3-entry
   array; the third entry is
   `{ urls: ['turn:turn.example.com:3478'], username, credential }` (assert the
   appended `RTCIceServer` field-by-field).
6. all three set, comma-separated URLs with whitespace
   (`" turn:a:3478 , turn:b:443 ,, turn:c:5349 "`) -> third entry's `urls` is
   `['turn:a:3478', 'turn:b:443', 'turn:c:5349']` (trimmed, empty entries
   dropped).
7. urls is `","` (parses to all-empty after trim+filter) -> returns STUN-only.
8. urls is `"   "` (whitespace only, also parses to empty) -> returns STUN-only.

Style follows RFCTR-002: assert the observable return value shape, not the
internal split/map/filter call sequence.

## Related work

- IMPRV-001 — ice-gathering-no-timeout; established the local
  `FakePeerConnection` pattern in `src/core/rtc.test.ts`.
- IMPRV-033 — rtcDiagnostics unit-test gap; sibling audit finding in the same
  module neighborhood.
- IMPRV-034 — deriveSync unit-test gap; same shape: pure function, indirectly
  covered, needs direct tests.
- RSRCH-002 — `useChatSession` seam map.
- RSRCH-003 — survey-webrtc-connection-recovery-options-signaling-models.

## Working

- Took option (1) from the discovery notes: re-exported `buildIceServers` from
  `src/core/rtc.ts`. `ICE_CONFIG` still captures the value at module- load time;
  the function is now callable per-test with `vi.stubEnv`.
- Surprise the ticket did not call out: `.env.local` in this repo ships real
  metered.ca TURN creds (so the dev server works on symmetric NATs out of the
  box). That meant the "all unset" baseline test failed because import.meta.env
  was already populated with TURN values at module load. Added a
  `clearTurnEnv()` helper that stubs all three vars to `''` and call it at the
  top of every case so the baseline is deterministic regardless of which `.env*`
  file is on the host.
- Documented the `.env.local` interaction in the describe header so the next
  person doesn't hit the same gotcha.
- Cases mirror the ticket's eight clauses (1–8) using the `expect(...).toEqual`
  shape; the appended TURN entry is asserted field-by-field.
- Full suite: 541/541 (+8) green.
