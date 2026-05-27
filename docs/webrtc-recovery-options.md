# WebRTC Connection Recovery Options

Research artifact mapping the option space for recovering a peer-to-peer chat
session after a non-deliberate `RTCPeerConnection` lifecycle event. Names, for
each of three in-scope disconnect classes, what fails at the WebRTC layer, what
recovery techniques exist in the spec, what those techniques require under the
app's current copy-paste signaling stance, what they unlock if a thin signaling
channel existed, the browser-support / NAT-topology caveats that gate each
candidate, and the seams in `src/core/rtc.ts` / `src/hooks/useChatSession.ts`
where each would attach.

Source ticket: `RSRCH-003` (resolved 2026-05-27).

Out of scope (the human opted out): proactive data-channel keepalive / liveness
probing. FEAT-010's `sync-probe` handshake already provides indirect liveness
signal during initial connect but does not actively probe a silent peer — the
recovery story does not depend on a new keepalive layer.

Per the ticket's "the research itself does not surface follow-up ticket
candidates" stance: this document names options and constraints, not
recommendations.

## At-a-glance

- **3 disconnect classes** in scope: ICE restart on network change, tab
  backgrounding / device sleep, full re-handshake after hard disconnect.
- **4 candidate techniques** across the spec and common practice: ICE restart
  via `iceRestart: true` on `createOffer` (or the `pc.restartIce()` shortcut),
  Page Lifecycle integration (`visibilitychange` / `freeze` / `resume`) gating a
  restart attempt, full new-PC handshake, and local-only auto-restart carrying
  the renegotiation over the surviving data channel.
- **4 candidate signaling shapes** if the no-signaling-server stance is relaxed:
  small WebSocket relay, QR-coded SDP refresh, ephemeral discovery token via a
  public relay, and "no new signaling — reuse the data channel as the carrier."
- **Already plumbed**: FEAT-010 telemetry samples `connectionstatechange` so any
  recovery attempt is observable post-deployment without new instrumentation.
  ARCH-001 keeps the session in routing context, so a reconnect attempt can
  outlive a route change. BUG-008 ensures the session survives navigating away
  and coming back. FEAT-012 persists transcript state and ships it on every
  channel open, so a successful re-handshake presents a continuous transcript
  without app-level merge logic in the recovery path.

## Disconnect class 1: ICE restart on network change

### Failure mode

ICE connectivity checks (STUN binding + consent freshness, RFC 7675) fail when
the underlying flow's source IP/port changes — laptop sleeping briefly and
waking on a fresh DHCP lease, phone migrating WiFi↔LTE, NAT timing out the UDP
binding and rebinding the source port. The browser fires:

- `pc.iceconnectionstatechange` → `disconnected` (transient; spec allows
  recovery to `connected` if subsequent checks succeed).
- `pc.connectionstatechange` → `disconnected`, then either back to `connected`
  or forward to `failed` once the consent-freshness timer expires (~30s default;
  not configurable).
- `pc.onicecandidateerror` may fire if the new candidates can't reach STUN /
  TURN at all.

The `RTCDataChannel` itself does **not** fire `onclose` in the `disconnected`
window — the channel's underlying DTLS transport survives brief drops. It does
fire `onclose` after `connectionState` reaches `failed` (which closes the DTLS
transport).

### Recovery techniques

- **`createOffer({ iceRestart: true })`** — the canonical spec path (RFC 8829
  §5.2.3). Generates an offer with fresh ICE credentials (`ufrag` / `pwd`); both
  peers re-gather candidates against the new credentials, run connectivity
  checks, and resume on a new candidate pair. The data channel, SCTP
  association, and DTLS transport survive if the renegotiation completes before
  the consent timer expires. Only the offering side calls this; the answerer
  applies the offer and returns an answer.
- **`pc.restartIce()`** — the shorter shortcut introduced in the WebRTC spec to
  set the local end as needing-renegotiation. Identical effect; both endpoints
  can fire it, but the actual SDP regeneration still happens via `createOffer`.
- **`oniceconnectionstatechange` / `onconnectionstatechange`** — the trigger
  event. Browsers vary on which fires first and how aggressively they
  auto-recover before requiring an explicit restart, so a robust recovery layer
  listens to both and de-duplicates.
- **Selective TURN forcing** — `RTCIceTransportPolicy: 'relay'` on a fresh PC
  config skips host/srflx candidates entirely, useful as a fallback when
  repeated direct restarts have failed and the network appears to require relay.
  Not a recovery technique on the existing PC (config is set at construction);
  applies if class 1 escalates to class 3.

### What the app could do today under copy-paste signaling

ICE restart still requires bi-directional SDP exchange — the new offer/answer
pair encodes the fresh ICE credentials and must reach the other side. With the
existing copy-paste flow, the recovery UX would look exactly like the initial
handshake: peer A sees a "reconnecting" screen with a "share this invite"
payload, peer B pastes it, generates a reply, peer A pastes that back. Same
human cost as the current "Connection lost — return home → start a new chat"
flow, with the only saving being that the conversation id and persisted
transcript stay bound (FEAT-012 ships history again on channel open).

Bottom line: feasible but no UX win over the current "start a fresh chat" path.
Not differentiating.

### What a thin signaling channel would unlock

Automatic, invisible recovery: peer A detects `disconnected` or `failed`, fires
`restartIce()` (or `createOffer({ iceRestart: true })`), sends the new offer
over the side-channel, peer B replies, both peers resume on a new candidate
pair. On a healthy side-channel and modest NAT this completes in well under a
second; the transcript never visibly disconnects.

### Browser-support caveats

- `createOffer({ iceRestart: true })`: universally supported (Chrome, Firefox,
  Safari, all current versions).
- `pc.restartIce()`: Chrome 77+, Firefox 70+, Safari 14+. Safari 13 and earlier
  require the `iceRestart` flag path.
- `oniceconnectionstatechange` semantics differ: Chrome reports `disconnected`
  after ~5s of consent-check failure; Firefox is more aggressive (~2-3s); Safari
  is the slowest (~10-20s). Recovery code that races a UI affordance against the
  state transition needs to tolerate the spread.
- `RTCDataChannel` survives ICE restart on all three browsers in practice.
  Mobile Safari has historically had quirks where a long restart window can race
  the DTLS keepalive and trigger a channel close; verifying on the target
  browsers is part of any candidate's rollout, not part of this research.

### NAT-topology caveats

- A peer pair that connected directly (srflx-srflx) before the network change
  may now require TURN if one peer landed behind a stricter NAT post-change
  (e.g. WiFi→LTE often crosses into CGNAT). ICE restart re-gathers candidates
  against the same `iceServers` configuration; if no TURN was configured, a
  now-CGNAT'd peer pair will fail again at the same point in the connectivity
  checks. The `docs/known_limitations.md` writeup on TURN applies here verbatim.
- A symmetric-NAT timeout (UDP binding expiring while idle) reopens on the next
  outbound packet, which restart triggers. So restart itself causes the NAT to
  rebind; the new srflx candidate carries the new public port.
- The selected candidate pair after restart may differ in type from the prior
  pair (direct → relay or vice versa). FEAT-010's selected- pair stat
  (`rtcDiagnostics.ts` logs it on `connected`) makes this observable in dev.

### Attach points

- `src/core/rtc.ts` currently exposes only `createOffer`, `acceptOffer`,
  `acceptAnswer` — all assume a fresh PC. An ICE-restart path needs a fourth
  entry that takes an existing PC and produces a fresh offer
  (`pc.createOffer({ iceRestart: true })`) without constructing a new one.
  Naturally lives alongside the existing three.
- `src/hooks/useChatSession.ts:655` (`wirePc.onconnectionstatechange`) currently
  only branches on `'failed'` → `transition('failed')`. The branch list grows to
  include `'disconnected'` (start a recovery timer, optionally call
  `restartIce()` if a signaling carrier is available) and `'connected'`
  returning from `'disconnected'` (clear any timer).
- `pcRef` (line 168-ish) holds the live PC across the session; a restart re-uses
  this same ref, no need to thread a new one through the hook.
- FEAT-008's `deliberateTeardownRef` (line 206) discriminates intentional
  teardown from accidental disconnect — the recovery branch must NOT fire when
  this is true (a polite-defer mid-handshake is not a disconnect to recover
  from).
- `samplesRef` / `pushSample` (lines 197 / 211) already records
  `connectionstatechange`; a new sample kind for "recovery attempted" /
  "recovery succeeded" / "recovery failed" slots in alongside without reshaping
  the telemetry contract.

## Disconnect class 2: Tab backgrounding / device sleep

### Failure mode

The Page Lifecycle layer (https://wicg.github.io/page-lifecycle/) and the WebRTC
stack interact subtly:

- **`visibilitychange` → `hidden`**: tab is not visible. The JS context still
  runs (timers fire, network is alive), but throttled — most browsers clamp
  `setTimeout` to 1s minimum, and Chromium-class browsers may suspend the
  renderer's compositor. The PC itself continues sending DTLS keepalives.
- **`freeze`**: the browser is fully suspending the page (Chrome's "discarded
  tabs," iOS Safari's aggressive background freezing, Android Chrome's
  tab-discard under memory pressure). JS execution halts; timers don't fire;
  outbound network from the page stops. WebRTC's consent-freshness checks from
  this peer stop; the remote peer sees the connection go quiet and after ~30s
  its `connectionState` transitions through `disconnected` to `failed`.
- **`resume`**: the browser is bringing the page back. JS execution resumes. The
  local PC may still be in the same in-memory state as before freeze, but the
  underlying DTLS transport is almost certainly dead from the network's
  perspective.
- **`pagehide` / `pageshow`**: the broader bfcache lifecycle. BUG-011 already
  listens for `pagehide` to fire a deliberate teardown so the remote peer sees
  `'closed'` rather than stalling on `'failed'` ~30s later. `pageshow` is the
  reciprocal event when the page comes back from bfcache.

What this looks like in practice on iOS Safari (the hardest case): a tab
backgrounded for >15-30s typically returns with
`pc.connectionState === 'failed'`. A tab backgrounded for <5s usually returns
with the connection still in `'connected'`. The boundary is fuzzy — depends on
OS memory pressure, whether the screen locked, whether the browser decided to
discard.

### Recovery techniques

- **Page Lifecycle `resume` listener** that inspects `pc.connectionState` and
  branches: `'connected'` → no action; `'disconnected'` → wait briefly and
  recheck; `'failed'` → kick off ICE restart (class 1); `'closed'` → full
  re-handshake (class 3).
- **`visibilitychange` listener** as the lowest-common-denominator fallback for
  browsers without full Page Lifecycle support — fires on every show/hide, less
  semantically rich but available everywhere.
- **Pre-emptive teardown on `freeze`** (mirror of BUG-011's `pagehide`
  teardown). Lets the remote peer transition cleanly to `'closed'` rather than
  `'failed'`; doesn't recover, but de-noises the failure path for the
  still-foregrounded peer.

The mechanical recovery itself reduces to class 1 (ICE restart) or class 3 (full
re-handshake). Class 2's contribution is the **trigger** — knowing when to
attempt recovery — not a new recovery primitive.

### What the app could do today under copy-paste signaling

Same answer as class 1: the recovery attempt itself requires SDP exchange, which
the copy-paste flow doesn't automate. The ONE thing class 2 enables without a
signaling channel is the pre-emptive `freeze` teardown — it doesn't recover
anything but it produces a better failure surface on the still-connected side.
That part is feasible standalone.

### What a thin signaling channel would unlock

The full UX: a banner appears within a second of returning from background, ICE
restart attempts complete invisibly, the transcript never disconnects from the
user's perspective. This is the highest- value class for a signaling-channel
investment — backgrounding is the common case on mobile, and the current
copy-paste flow's tax on recovery here is the most user-visible.

### Browser-support caveats

- `freeze` / `resume` events: Chrome 68+, Edge 79+, Opera 55+. Firefox does
  **not** implement them (use `visibilitychange` as a fallback; Firefox's tab
  discarding is less aggressive in practice so the fallback covers most cases).
  Safari 13.1+ implements them but iOS Safari's exact behavior under multi-tab
  memory pressure is underdocumented.
- `visibilitychange`: universal.
- `pageshow` / `pagehide`: universal; `event.persisted` distinguishes bfcache
  restore (true) from a fresh load (false). BUG-011 already uses `pagehide`.
- WebRTC during the hidden/frozen window: every browser throttles JS, but Chrome
  continues sending media/data more aggressively than Safari, which essentially
  halts DTLS keepalives within seconds of a tab hiding on mobile.

### NAT-topology caveats

- A device that backgrounds long enough for NAT to time out its UDP binding
  (commonly 30s for symmetric NAT, 300s for endpoint- independent) returns with
  a different public port. ICE restart re-gathers and the new srflx candidate is
  published. If TURN was needed before, it's still needed; if not, it still
  isn't.
- Mobile network handoffs while backgrounded (carrier moving the device between
  cell towers) can change the public IP entirely without the device knowing. The
  `resume` handler shouldn't trust the previous `pc.iceconnectionState` — it
  should probe by reading `pc.getStats()` or by attempting a restart.

### Attach points

- New `useEffect` in `useChatSession` listening for `visibilitychange` /
  `freeze` / `resume` / `pageshow`. The BUG-011 `pagehide` effect at line 289 is
  the closest precedent; the new effect parallels it.
- The same `onconnectionstatechange` branch from class 1 is the ultimate landing
  — the lifecycle listener decides _when_ to attempt; the state-change branch
  decides _what_ to attempt.
- Should respect `deliberateTeardownRef` for the same reason class 1 does — a
  polite-defer mid-handshake can race a `visibilitychange` on a fast user.
- `pcRef` survives across the visibility transition; the recovery layer reads it
  on `resume`.

## Disconnect class 3: Full re-handshake after hard disconnect

### Failure mode

The PeerConnection reaches a terminal state from which no in-place recovery is
possible:

- `pc.connectionState === 'failed'` after restart attempts are exhausted (or
  never attempted).
- `pc.connectionState === 'closed'` after either side calls `pc.close()` or
  after a `'failed'` consent-check window expires and the browser closes the
  transport.
- `RTCDataChannel.readyState === 'closed'`; `channel.onclose` has fired.

The hook's existing state machine (BUG-005) splits these into two UI states:
`'failed'` for pre-connect setups that never reached `'connected'`, and
`'closed'` for post-connect drops where the chat had been live.

### Recovery techniques

- **Construct a fresh PC** via `createOffer` / `acceptOffer`. Same primitives as
  initial handshake — there is no separate "reconnect" spec path. The new PC
  carries new ICE credentials by definition.
- **Preserve conversationId across the new PC**: `bindConversation` already
  supports being called with the same id (idempotent re-bind). FEAT-012's
  history snapshot / ship-on-open path means the transcript re-merges without
  the recovery code touching `messages` directly.
- **Distinguish "deliberate close" from "transport-failed close"**: the hook's
  `deliberateTeardownRef` already does this for FEAT-008's polite-defer. A
  "transport failed" signal is the recovery layer's trigger; a "deliberate
  close" signal is not.

### What the app could do today under copy-paste signaling

This **is** the current behavior. The user sees the "Connection lost" or "Try a
different network" screen (depending on whether the prior state was `'closed'`
or `'failed'`), taps "Return home" or "Start a new chat", and re-performs the
copy-paste handshake. The conversation id is the same, so persisted history
shows up on both sides.

There's one possible unlock without a signaling channel: a "Reconnect" button on
the connection-lost screen that re-uses the existing conversation id instead of
returning to Home, skipping the "select a conversation" step. The mechanical
handshake itself is still copy-paste.

### What a thin signaling channel would unlock

Background reconnect: peer A's app detects the `'closed'`/`'failed'` transition,
starts constructing a new PC, sends the new offer over the side-channel, peer
B's app does the same in reverse, both resume without user interaction. ARCH-001
keeps the session in routing context across the reconnect; the chat surface can
stay mounted with a "reconnecting…" banner.

If both peers' apps are closed when the disconnect happens (e.g. both went
offline simultaneously), the signaling channel needs to persist a "tried to
reconnect at T" record so the first one back sees a pending recovery offer
waiting. The signaling-shape options below differ on whether they support this
asymmetric case.

### Browser-support caveats

No special primitives — the recovery uses the same `RTCPeerConnection` /
`RTCDataChannel` APIs as initial handshake, already covered by the project's
browser support floor.

### NAT-topology caveats

If the prior session needed TURN (`docs/known_limitations.md`), so does the new
one. If the network changed during the disconnect, see classes 1/2 for the
relevant caveats.

### Attach points

- `src/hooks/useChatSession.ts:927` (`reset`) — currently the only exit from a
  terminal state, and it clears `conversationId`. A recovery path needs an
  analogous entry that keeps `conversationIdRef.current` intact and just
  constructs a new PC via the existing `startAsOfferer` / `startAsAnswerer` /
  `politelyAcceptOffer` seams.
- `wireChannel.onclose` (line 629) and `wirePc.onconnectionstatechange`
  (line 657) — the trigger surfaces. The transition to `'closed'`/`'failed'` is
  where a recovery layer can dispatch a reconnect attempt vs. surface the
  terminal-state UI.
- ARCH-001's routing-context session lifetime is the enabling precondition: a
  reconnect attempt initiated from the chat surface can outlive a brief
  navigation away (e.g. user taps a settings icon mid-reconnect).
- Screens consuming `state` (Offerer / Joiner / connected) would grow a
  "reconnecting" affordance distinct from the existing `'failed'` / `'closed'`
  screens; this is a UI concern, not a hook concern.

## Signaling shapes

If the no-signaling-server stance is relaxed, four candidate shapes:

### A. Small WebSocket relay

A minimal server (Node + `ws`, or any of Cloudflare Workers / Fly.io / Render's
free tiers) that holds a per-conversation room and forwards JSON payloads
between two clients. The protocol payload is small: just SDP offer / answer /
ICE candidate updates, no chat content.

- **Cost**: a long-lived ws connection plus signaling round-trips. ~100KB /
  connection / hour on a free-tier host. The chat content itself stays
  peer-to-peer; the relay sees only DTLS fingerprints and IPs.
- **Recovery quality**: best of the four. Sub-second restart attempts;
  reconnects across long disconnects; supports the asymmetric "both apps were
  closed" case if the relay persists pending offers for a short TTL.
- **Privacy posture**: relay operator sees IPs and SDP fingerprints (so can
  correlate which two peers are paired in a conversation). Chat content is
  end-to-end private. Comparable to a chat app's "metadata vs content" privacy
  split.
- **Carrier shape**: a single ws connection per device, multiplexed across all
  that device's conversations. Conversation id is the routing key.
- **Trade-off vs. the spike ethos**: a server, however small, is the thing the
  spike was deliberately trying to avoid. Worth weighing whether the UX recovery
  is worth that shift in posture.

### B. QR-coded SDP refresh

The recovery offer / answer is small enough (~2KB after the encoding in
`src/core/encoding.ts`) to render as a single QR code. Users on a "reconnecting"
screen present the QR back-and-forth, the receiving device camera-decodes, and
the handshake completes without typing.

- **Cost**: zero infra; an `<canvas>` QR generator (one of the qrcode-svg-style
  libraries, ~10KB gzipped) and access to `getUserMedia({ video: true })` + a
  QR-detector (BarcodeDetector on Chrome / Android; jsQR fallback for Safari,
  ~50KB gzipped).
- **Recovery quality**: only useful when the two users are co-present (same
  room, or sharing a screen on a video call). Not applicable to the "WiFi → LTE
  on the bus" case.
- **Privacy posture**: same as the current copy-paste signaling — the SDP never
  leaves the room.
- **Carrier shape**: pairwise, ephemeral, in-person. No long-lived state.
- **Trade-off**: low cost, narrow applicability. Solves the "I want to demo this
  without infrastructure" case more than the "I lost WiFi on the train" case.

### C. Ephemeral discovery token via public relay

Before the channel dies, peers exchange a periodically-rotated symmetric
secret + a public relay URL (e.g. a Pastebin-style ephemeral message service, or
a public Redis-backed key/value bin service). When one peer detects disconnect,
it posts an "I'm trying to reconnect, here's my new offer encrypted with our
shared secret" message to the relay URL. The other peer, when its connection
dies, polls the relay URL until it sees the message.

- **Cost**: no custom server; depends on availability of a public
  ephemeral-message service with appropriate TTL semantics. The service operator
  could go down or change terms.
- **Recovery quality**: moderate. Poll latency means recovery is on the order of
  seconds, not sub-second. Works for the asymmetric case if both sides poll on
  disconnect.
- **Privacy posture**: the public relay sees encrypted blobs only, but can
  correlate "two parties polling the same URL" as a pairing signal. Less clean
  than (A) where the relay is yours.
- **Carrier shape**: lazy / poll-based. Complicates the data model somewhat
  (rotation of the secret, TTL on the bin).
- **Trade-off**: avoids infrastructure but introduces a third-party dependency
  on a service whose continued existence isn't guaranteed.

### D. Local-only via the surviving data channel

The narrowest scope: when `connectionState` is `'disconnected'` but the data
channel hasn't yet fired `onclose`, the ICE restart's new SDP can in principle
be carried _over the existing data channel_ (the spec doesn't prescribe a
signaling carrier — it only requires both sides agree out-of-band). On a
successful renegotiation the new candidate pair takes over without the channel
ever closing.

- **Cost**: zero infra. All implementation lives in the app.
- **Recovery quality**: only covers class 1's "transient ICE disconnect"
  sub-case where the data channel survives the brief drop. Doesn't help class 2
  (channel was closed during freeze) or class 3 (terminal
  `'closed'`/`'failed'`).
- **Privacy posture**: nothing leaves the existing PC, same as today.
- **Carrier shape**: re-use of the data channel — implementation detail is a
  small typed envelope alongside FEAT-010's `chat` / `sync-probe` / `sync-ack` /
  `sync-done` / `history` / `receipt` cases in `handleEnvelope` (line 302+).
- **Trade-off**: solves the smallest, easiest subset of the problem space. May
  be a worthwhile partial recovery even alongside one of A / B / C.

## Code attach points — cross-class summary

Three logical insertion zones in the existing hook:

1. **Trigger layer** — detects "this disconnect is recoverable" vs. "this is
   terminal" vs. "this was deliberate". Spans:
   - `wirePc.onconnectionstatechange` at `src/hooks/useChatSession.ts:657` —
     currently `'failed'`-only, grows to handle `'disconnected'` (start a
     recovery timer) and transitions back to `'connected'` (clear the timer).
   - `wireChannel.onclose` at line 629 — currently routes to `'closed'` vs
     `'failed'` based on prior state and the deliberate-teardown ref. Recovery
     code reads from the same decision tree.
   - A new lifecycle effect listening for `visibilitychange` / `freeze` /
     `resume` / `pageshow`, paralleling the BUG-011 `pagehide` effect at
     line 289.

2. **Restart layer** — actually performs the recovery operation. Spans:
   - A new entry in `src/core/rtc.ts` for ICE restart on an existing PC:
     `restartIce(pc): Promise<string>` returning the new encoded offer. Mirrors
     the shape of `createOffer` / `acceptAnswer`.
   - The existing `startAsOfferer` / `startAsAnswerer` / `politelyAcceptOffer`
     callbacks (lines 770-895) already handle the "construct a new PC and wire
     it" flow; a class-3 recovery path drives them with a preserved
     `conversationId` instead of a fresh one.

3. **Signaling-carrier layer** — only present if a shape from (A) / (B) / (C) is
   adopted; absent under (D). Logically lives adjacent to the start callbacks (a
   peer that owns a signaling connection can `restartIce` without going through
   copy-paste). The hook itself is signaling-carrier-agnostic if the layer is
   placed correctly: it consumes a callback like
   `sendSignal(payload) → Promise<void>` and a subscription like
   `onSignal(payload)`; the carrier implementation (ws relay, QR, ephemeral
   token) supplies both.

## Already-plumbed infrastructure

The following are not recovery primitives themselves, but they reduce the
surface area any recovery path has to invent:

- **FEAT-010 telemetry** (`samplesRef` line 197, `pushSample` line 211): every
  `connectionstatechange` is already sampled with the resolved state. A new
  sample kind for `recovery-attempt-start` / `recovery-attempt-success` /
  `recovery-attempt-failure` slots in without reshaping the `TelemetrySample`
  discriminator. Post- deployment recovery success rate is observable through
  the existing summary at `getTelemetry()`.
- **ARCH-001 session-in-routing-context**: the hook outlives a route transition,
  so a "reconnect in the background while the user is on a different screen" UX
  is mechanically supported. The recovery layer doesn't need to fight the
  router.
- **BUG-008 session-survives-back-navigation**: the unmount teardown effect at
  line 281 already discriminates "real unmount" from "transient unmount during
  navigation"; a recovery effect attaching here doesn't reintroduce the bug.
- **FEAT-008 deliberate-teardown discrimination** (line 206): the
  `deliberateTeardownRef` is the single source of truth for "this disconnect was
  on purpose." Every recovery branch must read it before acting; the existing
  branches at line 632 and elsewhere already model the read pattern.
- **FEAT-012 history re-merge on channel open** (line 583+): after any
  successful re-handshake, both sides ship their snapshots and merge. The
  recovery path doesn't need to handle transcript state — it falls out for free
  as long as the conversationId is preserved.
- **BUG-011 deliberate-teardown on `pagehide`** (line 289): the pattern for a
  Page Lifecycle effect is established. A class-2 recovery listener parallels
  it.

## Open questions the research surfaces but does not resolve

- The `'disconnected'` → `'connected'` natural-recovery window vs. the
  explicit-restart window: empirically, how long should a recovery layer wait
  before assuming the natural-recovery path has failed and triggering a restart?
  The browsers' default consent-freshness timer is ~30s but a UX may want to act
  earlier. This is a measurement question, not a research one; FEAT-010
  telemetry plus a behind-flag rollout would answer it.
- The asymmetric "both apps were closed" case for signaling shape A: how long
  should a relay hold a pending recovery offer? Days? Hours? The longer the TTL,
  the more state the relay carries.
- For shape (D): whether mainline browsers reliably let `setLocalDescription` /
  `setRemoteDescription` and the existing data channel co-exist during a
  `'disconnected'` window without the data channel's send queue stalling. Worth
  a small empirical probe before committing to that shape.
