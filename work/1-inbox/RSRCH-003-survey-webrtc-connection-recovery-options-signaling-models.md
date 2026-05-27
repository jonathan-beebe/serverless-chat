---
id: RSRCH-003
type: research
status: open
created: 2026-05-27
---

# RSRCH-003: Survey WebRTC connection recovery options under current and hypothetical signaling models

## Problem

The application's WebRTC peer-to-peer chat session, managed by
`src/hooks/useChatSession.ts` and `src/core/rtc.ts`, has no resilience mechanism
for connection lifecycle events that fall short of "deliberate teardown." When
the underlying `RTCPeerConnection` transitions to `failed` / `disconnected` /
`closed` for reasons outside the user's control (network change such as
WiFi↔LTE, mobile tab backgrounded long enough for the browser to suspend the
connection, device sleep/wake, NAT rebind, transient internet loss), the session
moves to a terminal state and the user must re-perform the full copy-paste
signaling exchange to re-establish a session. Multiple prior tickets (BUG-002,
BUG-003, BUG-005, BUG-008, BUG-011, BUG-012, IMPRV-001, IMPRV-006, FEAT-008)
have hardened the deterministic lifecycle but none have addressed the recovery
path. It is currently unclear which recovery techniques are viable under the
app's no-signaling-server constraint, what each costs in code/UX complexity, and
what gating constraints (browser support, NAT topology, manual signaling)
restrict the option space.

## Outcome

A research artifact published under `docs/` exists that, for each of the three
in-scope disconnect classes (ICE restart on network change; tab backgrounding /
device sleep; full re-handshake after hard disconnect), names:

(a) what the failure mode actually is at the WebRTC layer (with the relevant
`PeerConnection` / `DataChannel` state transitions and which events fire);

(b) what recovery techniques exist in the spec / are commonly implemented (e.g.
`iceRestart: true` on `createOffer`, ICE candidate updates,
`oniceconnectionstatechange` / `onconnectionstatechange` handlers, Page
Lifecycle API integration);

(c) what those techniques would require from the app today given the copy-paste
signaling constraint, and which are infeasible under that constraint;

(d) what those techniques would unlock if a thin signaling channel existed,
sketching at least two concrete signaling shapes (e.g. small relay,
WebSocket-mediated, QR refresh) with their trade-offs;

(e) browser-support and NAT-topology caveats that constrain each candidate's
viability;

(f) where in `src/core/rtc.ts` and `src/hooks/useChatSession.ts` each candidate
would attach, without prescribing one.

The artifact is concrete enough that a future maker can cite a candidate by name
and inherit its constraint list. The research itself does not surface follow-up
ticket candidates.

## Why it matters

Connection lifecycle is the codebase's most-touched concern — 8+ tickets in the
bug/improvement queue have iterated on the deterministic teardown/setup paths,
and the recovery path is the conspicuous absence in that body of work. Without a
shared map, the next "user got disconnected, had to re-share invite" report
risks being filed as a bug (it isn't, given the current design), filed as a
feature (without context for which option to take), or fixed point-by-point
against the wrong layer. Research now compounds: every subsequent improvement or
feature ticket in this area can cite the artifact instead of re-deriving the
constraints. The recurrence pattern in the prior-ticket history is itself the
trigger for research-typing this rather than filing another bug or improvement.

## Discovery notes

- Out of scope (the human opted out): proactive data-channel keepalive /
  liveness probing. The FEAT-010 sync handshake already provides indirect
  liveness signal but does not actively probe a silent peer; explicit keepalive
  was deliberately excluded from this research.
- The signaling-channel question is OPEN: the research must treat the
  no-signaling-server stance as a constraint to relax and explore, not as a
  frozen given.
- `src/core/rtc.ts` owns `RTCPeerConnection` creation and ICE wiring;
  `src/hooks/useChatSession.ts` owns the session-level state machine,
  deliberate-teardown discrimination (FEAT-008), and `connectionstatechange`
  routing. Any recovery layer attaches at one or both of those seams.
- FEAT-010 (network telemetry) already records `connectionstatechange` samples —
  the data needed to observe recovery success/failure post-deployment is already
  plumbed.
- ARCH-001 placed the session in routing context — meaning a reconnect attempt
  can outlive a route change (BUG-008 relies on this). This is an enabling
  precondition for any "reconnect in the background" UX.
- Page visibility / freeze events (Page Lifecycle API) are distinct from
  `PeerConnection` state — the browser may suspend a connection without firing
  `connectionstatechange` immediately. The tab-backgrounding section must
  account for this.
- `iceRestart: true` on `createOffer` requires bi-directional re-exchange of the
  offer/answer pair — that is the direct link back to the signaling-channel
  question.

## Related work

- IMPRV-001 — ICE gathering no timeout
- IMPRV-006 — controller no state machine guards
- IMPRV-010 — connection-lost CTA should say return home
- BUG-002 — `channel.onclose` pre-connect classification
- BUG-003 — `wireChannel` must short-circuit when channel already `'open'`
- BUG-005 — separate `'closed'` vs `'failed'` terminal state
- BUG-008 — back from network loses live session (keeps session alive across
  route)
- BUG-011 — end-chat does not close channel
- BUG-012 — cancel from offerer leaves session bound
- FEAT-008 — polite peer (deliberate-teardown discrimination)
- FEAT-010 — network telemetry (samples `connectionstatechange`)
- FEAT-012 — resume conversation (history shipped on data-channel open)
- ARCH-001 — session lives in routing context (auto-reconnect's continuation
  surface)
- RSRCH-002 — `useChatSession` seam map (the cluster a recovery layer would
  attach to)
