# FEAT-010: Network telemetry — clock sync, delivered receipts, RTT capture, and a `#network` diagnostic route

**Status:** Resolved **Type:** Feature **Area:** `src/core/rtc.ts`,
`src/hooks/useChatSession.ts`, `src/components/Chat.tsx`, `src/App.tsx`, new
`src/core/wire.ts` + new `src/network/Network.tsx` (plus tests)

## Summary

Instrument the live chat session with three coordinated telemetry mechanisms —
**NTP-style clock sync at connect, sender timestamps on every chat message, and
delivered receipts for every chat message** — so that both peers know the
round-trip latency, the clock offset between them, and the one-way transit time
of each message they exchange.

Surface the per-message receipt as a small **✓ checkmark** next to outgoing chat
bubbles (pending → delivered). Log every telemetry event into an in-memory ring
buffer on each peer's session, and ship a new **`#network` route** that renders
a detailed time-series report of the connection's health (current/median/p95
RTT, clock offset, per-message timeline, sync probe samples) so a user can
diagnose "is the connection slow?" themselves.

Internally, this requires introducing a small **versioned JSON wire envelope**
on the data channel — today every payload is a bare string. All four message
types — chat, sync probe, sync ack, receipt — share that envelope.

## Customer value

- **You see when your message lands.** A per-bubble checkmark turns the chat
  from "send-and-hope" into a confirmed exchange. If the receipt doesn't arrive
  within a couple of seconds, the bubble's pending state is a visible cue that
  something's slow — well before the connection officially `failed`s.
- **You can diagnose latency complaints yourself.** Today a user reporting "the
  chat feels laggy" has no way to know if their network is the problem, the
  peer's network is the problem, or the app itself is misbehaving. The
  `#network` page gives them concrete numbers (RTT, sample count, sync offset)
  they can read or screenshot.
- **The app feels more like a real chat product.** Single check marks, awareness
  of who's "slow", and a "behind the curtain" diagnostics page are quiet quality
  signals — none individually game-changing, but together they upgrade the
  polish bar above the "spike that works" feel.
- **Future-proofs the wire format.** Once messages carry a versioned envelope,
  future features (typing indicators, reactions, file transfer chunks,
  structured commands) can extend the protocol without another round of "now we
  need to differentiate chat from non-chat bytes."

## Business value

- **Differentiates from raw WebRTC demos.** Most peer-to-peer chat demos send
  bare strings and call it done. Adding clock sync + receipts + telemetry
  positions this app as production-shaped, even though it has no server.
- **Cheap diagnostics surface in production.** `#network` doesn't require a
  backend, a logging service, or any opt-in — it just renders what's already in
  memory. A user reporting an issue can paste a screenshot or read off numbers
  in seconds.
- **Sets up the protocol seams for future features.** Once the envelope,
  message-IDs, and event log exist, future tickets (typing indicators,
  edit/delete, read receipts, file transfer) extend rather than re-architect.

## What a working feature delivers

A user opens a chat as today. Once the data channel transitions to `open`:

1. **An automatic clock-sync handshake runs in the background** — Alice sends a
   sync probe, Bob replies with his receive and send timestamps, Alice computes
   a clock offset and round-trip estimate. The handshake completes in roughly
   one round-trip and is invisible to the user (no UI element changes, no
   "syncing…" message). Both peers run the algorithm and arrive at consistent
   offsets (Alice's offset is the negation of Bob's).

2. **Every chat message carries the sender's send-time** in the wire envelope
   (`sentAt`, the sender's `Date.now()` at the moment `channel.send` was
   called). The receiver records its own receive-time, and — using the clock
   offset from step 1 — can compute the **one-way transit latency** for that
   message.

3. **Every chat message also fires a delivered receipt back to the sender.** The
   receipt is a small JSON envelope (no `text` field) referencing the chat
   message's ID and carrying the receiver's "received-at" timestamp plus their
   "sent-at" for the receipt. The sender records the receipt's arrival time and
   computes round-trip = `receiptArrivedAt - originalSentAt`. The receipt is
   **delivered-only**, not "read" — it fires the instant the peer's data-channel
   handler processes the message, regardless of whether the peer's tab is
   focused. (Rationale: this isolates network/app health from human-attention
   state, and keeps the RTT probe useful even when the peer isn't looking.)

4. **Outgoing chat bubbles render a small ✓ checkmark** in the bottom-right
   corner of the bubble, next to the timestamp. The bubble starts in a "pending"
   state (e.g. a faint clock icon or a hollow check) and transitions to a solid
   ✓ when the receipt arrives. Same visual idiom as WhatsApp's single grey
   check. Incoming bubbles render no check (we're not the sender; the receipt is
   sent automatically without ever being shown in our UI).

5. **A new `#network` route renders a detailed diagnostic report** for the
   current session, formatted for readability:
   - **Header summary:** connection start time, current RTT, median RTT over the
     session, p95 RTT, sample count, computed clock offset (e.g. "Peer's clock
     is +47 ms ahead of yours"), and the one-way latency estimate (RTT / 2).
   - **Sync probe detail:** the four timestamps from the initial handshake
     (`t1`/`t2`/`t3`/`t4`) and the derived offset / RTT, so a reader can audit
     the math.
   - **Per-message timeline:** a table of the last N messages (sent and
     received), each row showing the message ID (truncated), direction, the
     relevant timestamps, the computed transit latency (for incoming) or receipt
     RTT (for outgoing), and a "Δ from median" column to spot outliers.
   - **Connection state log:** state transitions (`gathering` → `connecting` →
     `connected`, any `failed`/`closed`) with absolute timestamps, so a reader
     can see how long each phase took.
   - **Empty state:** if visited before a session is live, the page renders "No
     active session. Start a chat to see network telemetry." with a link back to
     Home. Telemetry is **per-session** and not persisted across reload.
   - Visually consistent with FEAT-007's design-system showcase: uses the
     existing `Heading`, `Callout`, primitives. Lives at `#network` (same
     hash-routing mechanism as `#design-system`).

## Acceptance criteria

### Wire protocol

1. **Versioned JSON envelope.** Every payload sent over the data channel after
   the open event is JSON of shape
   `{ v: 1, t: 'chat' | 'sync-probe' | 'sync-ack' | 'receipt', id: string, sentAt: number, ...typeSpecificFields }`.
   The envelope is defined in a new `src/core/wire.ts` module with
   discriminated-union TypeScript types and pure encode/decode helpers. `v: 1`
   is the protocol version literal — present so a future v2 can detect a
   mismatch without inventing a new field.

2. **Type-specific fields:**
   - `chat`: `{ text: string }`. `id` is the message's UUID (same one used as
     the React `key`).
   - `sync-probe`: no extra fields. `id` is the probe's UUID.
   - `sync-ack`:
     `{ replyTo: string /* probe id */, probeReceivedAt: number /* receiver's clock at probe receive */ }`.
     The acker's `sentAt` is `t3` in the NTP nomenclature.
   - `receipt`:
     `{ replyTo: string /* chat msg id */, messageReceivedAt: number /* receiver's clock at chat receive */ }`.
     The receipt's `sentAt` is the receiver's clock at receipt-send time.

3. **Decode safety.** Malformed payloads (non-JSON, missing required fields,
   unknown `t`, mismatched `v`) are dropped with a single `console.warn` and do
   **not** crash the session. The receiver's `wireChannel.onmessage` becomes a
   guarded `try { JSON.parse(...) } catch { warn-and-ignore }` followed by a
   discriminated-union dispatch. Bare-string legacy compatibility is **not**
   required — both peers run the same code from the same deployment.

### Clock sync handshake

4. **NTP-style 4-timestamp exchange.** Immediately after the data channel
   transitions to `open` (specifically, inside the existing `wireChannel.onopen`
   handler in `useChatSession.ts:60-61`), the offerer sends a `sync-probe`
   envelope. The answerer responds with a `sync-ack` carrying the four NTP
   timestamps (`t1` = probe `sentAt`, `t2` = `probeReceivedAt`, `t3` = ack
   `sentAt`). The offerer computes `t4` on receipt and derives:
   - **Round-trip:** `rtt = (t4 - t1) - (t3 - t2)`
   - **Clock offset (peer - us):** `offset = ((t2 - t1) + (t3 - t4)) / 2`
   - **One-way latency estimate:** `rtt / 2` (assumes symmetric paths — standard
     NTP simplification).

   The answerer derives the same numbers locally from the timestamps it already
   saw (`t2 - t1` measured during probe receive, `t4 - t3` not yet known to it —
   so the answerer's offset is only computable if the offerer round-trips a
   final "sync-done" with `t4`). **Recommendation:** keep v1 one-shot at the
   offerer; the answerer derives its own offset as `-offset` (mirror) once it
   receives anything carrying offerer-clock info. The simpler alternative:
   extend the handshake to a third packet so both peers get the full quad of
   timestamps. See open questions.

5. **Sync runs once at connect; no periodic re-sync.** A single probe-ack pair
   fires when the channel opens. Drift over a multi-hour chat is theoretically
   possible but realistically small for browser-grade clocks. Re-sync on
   `visibilitychange` or on a stale-offset trigger is **out of scope** (call out
   in v1; revisit if a real session shows visible drift).

6. **Sync failure tolerance.** If the sync-ack doesn't arrive within a 5-second
   timeout, the session continues with `offset = 0` and `rtt = null`. A single
   `console.warn` records the failure. The chat itself is **not** blocked on
   sync — users can type immediately upon `connected`, even if the probe hasn't
   returned yet.

### Per-message timestamps and receipts

7. **Chat sender embeds `sentAt`.** `useChatSession.send`
   (`src/hooks/useChatSession.ts:142-149`) wraps the text in a `chat` envelope,
   generates the message ID up front, captures `Date.now()` as `sentAt`, and
   stores both alongside the existing `ChatMessage` so the bubble can render the
   receipt state. The transcript continues to show the sender's local `at` time
   the same way it does today (FEAT-006).

8. **Chat receiver auto-fires a delivered receipt.** When
   `wireChannel.onmessage` decodes a `chat` envelope, in addition to appending
   the message to the receiver's transcript, the receiver immediately sends a
   `receipt` envelope carrying `replyTo = chat.id` and
   `messageReceivedAt = Date.now()`. The receipt is fire-and-forget — no UI
   rendering on the receiver's side; no retry on the sender's side.

9. **Receipt receipt → bubble state update.** The sender's
   `wireChannel.onmessage` handler, on decoding a `receipt`, locates the
   matching outgoing message by `replyTo` in the `messages` array and updates
   its delivery state to `delivered`, recording the round-trip in the telemetry
   log. A receipt whose `replyTo` doesn't match any tracked outgoing message is
   logged and ignored.

10. **Bubble delivery indicator.** The `<Chat>` component
    (`src/components/Chat.tsx`) renders, for each outgoing (`from: 'me'`)
    message:
    - **Pending** (default until receipt arrives): a hollow / muted single-check
      glyph next to the timestamp, with `aria-label="Pending"`.
    - **Delivered** (after receipt): a filled single-check glyph, with
      `aria-label="Delivered"`.
    - Incoming messages render no indicator (parity with WhatsApp).
    - The indicator sits next to the existing `<time>` in the bubble's
      bottom-right; it does not steal space from the message text or the
      timestamp.
    - Color matches the bubble: `text-sky-100/80` on the sky-600 background
      (your messages), consistent with the existing timestamp color.

11. **Receipt for a message that never got sent.** If the user closes the tab
    between `send` and receipt arrival, no special handling is required — the
    message remains pending in any persisted state (none today), and the
    session's in-memory log is gone with the tab. AC explicitly: don't add
    localStorage / IndexedDB persistence in this ticket.

### Telemetry log

12. **In-memory ring buffer on the session.** `useChatSession` exposes a new
    field, `telemetry: NetworkTelemetry`, containing:
    - `connectedAt: number | null` — Date.now() when the channel transitioned to
      `open`.
    - `sync: { t1, t2, t3, t4, rtt, offset } | null` — populated once the sync
      handshake completes (null until then, null on failure).
    - `samples: TelemetrySample[]` — a capped array (last 500 entries) of
      `{ kind: 'sent' | 'received' | 'receipt' | 'state-change', at, ... }`
      events with the relevant timestamps.
    - `summary: { medianRttMs, p95RttMs, sampleCount, currentRttMs }` — derived
      rollups, recomputed lazily / on read.

    The ring buffer is stored in a `useRef` (so updates don't re-render the chat
    on every probe) and a small `useState` mirror for the live "current RTT" /
    "delivered/pending" derived values that DO need to drive renders.

13. **State-change samples capture connection lifecycle.** Every
    `ConnectionState` transition (`gathering` → `connecting` → `connected` →
    `closed`/`failed`) is appended as a `state-change` sample with the current
    `Date.now()`. This gives the `#network` page the data to show "Gathering:
    1.2 s; Connecting: 340 ms; Connected for 12 min 4 s."

### `#network` diagnostic route

14. **Route reachable at `#network`.** The hash router in `src/App.tsx:9-16`
    extends its `Route` discriminated union with `{ kind: 'network' }`.
    `#network` (no params) maps to that route and renders
    `<Network session={session} />` — same wiring style as the existing
    `#design-system` branch.

15. **Network page content.** A new `src/network/Network.tsx` renders,
    top-to-bottom:
    - **Heading** "Network telemetry" using the existing `<Heading level={1}>`
      primitive.
    - **Header summary card** with the live numbers from `telemetry.summary` and
      `telemetry.sync` (see "What a working feature delivers" point 5 for the
      full list).
    - **Sync probe detail block** showing `t1/t2/t3/t4`, `rtt`, `offset`
      formatted in milliseconds; this is the audit trail for the clock-sync
      math.
    - **State-change timeline**, rendered as a short list (`gathering at +0 ms`,
      `connected at +1240 ms`, etc.).
    - **Per-message timeline table** of recent samples — message ID (first 8
      chars of UUID), direction (sent / received), `sentAt` (clock-corrected if
      from peer), receipt RTT (sent only), one-way latency estimate (received
      only), Δ-from-median. Cap at the last 50 rows; older entries scroll off
      the bottom of the in-memory buffer at 500.
    - **Empty state** (no active session): a short Callout-style explainer + a
      button to start a chat (links to `#`).
    - **Visual style** matches the rest of the app — uses the existing
      primitives (`Heading`, `Callout`, `Divider`), light/dark via the existing
      `dark:` classes, no new design tokens.

16. **`usePageTitle`** sets `document.title` to `Network telemetry · P2P Chat`
    when on `#network`.

17. **Page is bookmarkable and survives hashchange.** Same behavior as
    `#design-system`: navigating to `#network` does not scrub the hash;
    navigating away to `#` returns to Home and clears the route. The hash-change
    listener in `App.tsx:26-35` is extended to handle `'network'` alongside
    `'design-system'` / `'joiner'` / `'home'`.

18. **Always available in production.** `#network` is included in
    `npm run build` output (not gated behind `import.meta.env.DEV`). Bundle cost
    is small — no chart library; the page is plain HTML tables and CSS bars.

### Quality

19. **No regressions in the existing offerer→joiner→connected→chat flow.** The
    plain happy path (offer → answer → connected → send message → received by
    peer) continues to work; the only visible change is the new ✓ on outgoing
    bubbles and the new route. All existing tests pass (`App.test.tsx`,
    `Offerer.test.tsx`, `Joiner.test.tsx`, `Chat.test.tsx`,
    `useChatSession.test.ts`, `rtc.test.ts`, design-system tests).

20. **New tests cover the wire format, sync math, and receipts.**
    - `src/core/wire.test.ts` — round-trip encode/decode for each envelope `t`,
      malformed-input dropping, version-mismatch dropping.
    - `src/hooks/useChatSession.test.ts` — extend with: sync handshake fires on
      channel open, sync timeout doesn't break chat, outgoing chat sets
      `pending`, incoming receipt flips to `delivered`, receipt-for-unknown-id
      is ignored, telemetry samples accumulate and cap at 500.
    - `src/components/Chat.test.tsx` — outgoing bubble renders pending check;
      flips to delivered check when the message's `delivered` state changes;
      incoming bubble shows no check.
    - `src/network/Network.test.tsx` — sections render with mocked telemetry;
      empty state renders when telemetry is null; header summary computes
      correctly from sample data.

21. **`npm run lint`, `npm run typecheck`, `npm run test` pass.**

## Out of scope (v1)

- **Read receipts.** Only delivered-stage receipts ship. WhatsApp's blue
  double-check (peer's tab is visible) is a follow-up.
- **Periodic background re-sync.** Sync runs once at connect; drift is accepted.
  A `visibilitychange` or "every N minutes" trigger is a follow-up if real-world
  sessions show meaningful drift.
- **Persistence across reloads or sessions.** The telemetry ring buffer lives in
  memory only; reloading or starting a new chat resets it. No localStorage /
  IndexedDB.
- **A header-level latency indicator.** Per-message checkmarks + a `#network`
  page only, per user direction. The "small green/amber/red dot next to
  Connected" is intentionally not built; revisit if user testing shows the
  diagnostic page is too hidden.
- **Charts / sparklines on `#network`.** The first cut is plain HTML tables and
  text. A chart library (recharts, victory, hand-rolled SVG) is a follow-up if
  the page genuinely needs them.
- **Stale-version / protocol-mismatch negotiation.** Both peers ship from the
  same deployment, so v1 doesn't negotiate `v` — a v1-vs-v2 mismatch in the
  future will just log a warning. Once the app supports multiple concurrent
  versions in the wild, formalize.
- **Reliability beyond what RTCDataChannel already gives.** The data channel is
  reliable+ordered by default; receipts don't add reliability, only
  **observability**. Don't add retry logic or buffering — if the channel drops,
  the chat is already in `closed`/`failed`.
- **Aggregate stats across multiple sessions.** Each session's telemetry is
  independent. A "lifetime average RTT" or "compare to last session" feature is
  out.
- **Audible / vibrational feedback** on receipt arrival or on RTT crossing a
  threshold. Visual-only.
- **Backwards compatibility with bare-string payloads.** Hard cutover — both
  peers run the new envelope or neither does.

## Open questions

- **Two-sided clock-offset derivation.** The NTP 4-timestamp exchange as
  described gives the **offerer** all four timestamps and a complete
  `(rtt, offset)`. The **answerer** only ever sees `t1, t2, t3` (it doesn't
  observe `t4` because that's when the offerer received the ack). Two viable
  resolutions:
  - (a) **Mirror the offset.** Answerer assumes symmetric clocks and takes
    `offset_answerer = -offset_offerer` once the offerer round-trips its
    computed offset in a follow-up `sync-done` envelope. Simplest, slightly more
    network chatter.
  - (b) **Send three packets.** Probe (offerer → answerer) → ack (answerer →
    offerer) → done (offerer → answerer, echoing `t4`). The answerer then has
    all four timestamps and computes independently.
  - **Recommendation:** (b). Three small packets at connect time is a one-shot
    cost; both peers having an independent, verifiable derivation is more
    correct and avoids "trust the peer's math." Add the `'sync-done'` envelope
    type to the discriminated union.

- **What happens if the chat is `connecting` but the peer's data channel never
  opens?** The sync handshake never starts; `telemetry.sync` stays null. The
  `#network` page should render gracefully in that case — show the state-change
  log up to the stuck state, and a Callout-style note explaining the session is
  mid-handshake. **Recommendation:** yes, render the partial state; don't gate
  the page on a completed sync.

- **Should the `#network` route be discoverable from the chat UI?** A tiny "📡
  network" link in the chat header? A line item in the "How does this work?"
  `<details>` on Home? **Recommendation:** v1 leaves discoverability to the URL
  — no in-app entry point. Users diagnosing a slow connection will be pointed at
  the URL via README or word-of-mouth. Add an entry point if observed friction
  warrants it (likely as a quiet link in the chat header).

- **Pending-state visual for outgoing bubbles before the receipt arrives.**
  Options:
  - (a) **No check until delivered** — bubble has nothing where the check will
    go; check appears only when received. Subtle pop-in.
  - (b) **Hollow check** turns solid on delivery. Two-state, mirrors WhatsApp.
  - (c) **Clock icon** turns into a check on delivery. Three-state including
    "queued before send" — overkill for our reliable+ordered transport.
  - **Recommendation:** (b). Hollow check from the moment the bubble appears
    (the message is "sent locally") → filled check on receipt. Matches user
    mental model and prior art.

- **Should the receipt itself be a "chat-like" envelope or a fully separate
  one?** I.e. should `receipt` and `chat` share fields like `text` (with text
  empty for receipts)? **Recommendation:** keep them as distinct envelope `t`
  values with disjoint fields. The discriminated union in TypeScript will catch
  any accidental mixing.

## Notes for the implementer

- **Wire envelope module first.** Create `src/core/wire.ts` with the
  discriminated-union types and pure `encode(env): string` /
  `decode(s): WireEnvelope | null` (returning `null` on any malformed input).
  Unit-test exhaustively before touching the session hook — this is the contract
  every other piece depends on.
- **Suggested order of work:**
  1. `src/core/wire.ts` + `src/core/wire.test.ts` (envelope + tests).
  2. Update `useChatSession` to send/receive chat via the envelope (no behavior
     change yet — text still flows). Add the `id` and `sentAt` plumbing.
  3. Implement clock-sync handshake (probe → ack → done if going with option
     (b)). Capture `telemetry.sync`.
  4. Implement receipts. Update `ChatMessage` shape to include
     `delivery: 'pending' | 'delivered'` on outgoing.
  5. Render the check glyph in `Chat.tsx`. Update `Chat.test.tsx`.
  6. Build out the telemetry ring buffer + `state-change` capture.
  7. Add the `#network` route in `App.tsx` and write `Network.tsx` + test.
- **Could be split into two PRs.** A reasonable cut: PR 1 = wire envelope +
  sync + receipts + checkmark UI (the user-visible features). PR 2 = telemetry
  ring buffer + `#network` route (the diagnostic surface). The user articulated
  both as one feature, but the implementer can split if review burden is large.
- **`ChatMessage` type change.** `src/core/rtc.ts:30-35` defines `ChatMessage`.
  Add `delivery?: 'pending' | 'delivered'` (optional so incoming messages can
  omit). Outgoing messages always carry it; incoming never do.
- **Don't re-render the world on every receipt.** Receipts arriving for old
  messages should mutate the message's delivery state without re-keying the
  React list. Use functional
  `setMessages(prev => prev.map(m => m.id === replyTo ? { ...m, delivery: 'delivered' } : m))`
  — preserves identity of unaffected messages and `key`s.
- **`telemetry.samples` lives in a ref, not state.** Sample appends happen on
  every wire event (potentially many per second). Storing them in `useState`
  would cause a re-render per sample, which is wasteful. Use
  `useRef<TelemetrySample[]>` for the buffer, and a separate small `useState`
  for the live values that genuinely drive UI (`currentRttMs`, the
  delivery-state map). The `#network` page can compute summaries on render by
  reading the ref via a `useSyncExternalStore` snapshot or by accepting that it
  shows the value as of the most recent re-render trigger.
- **Receipt loop avoidance.** A receipt must not trigger another receipt. Easy
  invariant: only `chat`-type messages produce receipts; `receipt`,
  `sync-probe`, `sync-ack`, `sync-done` envelopes never do.
- **`crypto.randomUUID` for IDs.** Already used at
  `src/hooks/useChatSession.ts:25-27`. Reuse the same `nextId()` helper for
  envelope IDs.
- **Hash routing edge.** The same-tab hash listener at `App.tsx:26-35` already
  routes `home`, `joiner`, `design-system`. Add `network` to the allowed-set.
  The hash-clear effect at `App.tsx:43-45` already short-circuits for non-joiner
  kinds, so `#network` is bookmarkable for free.
- **Tests for sync math.** Don't rely on real `Date.now()` — inject a clock or
  use `vi.useFakeTimers()` so the four-timestamp arithmetic is deterministic in
  tests. Verify both the offerer and answerer end up with the same `offset`
  magnitude (with opposite sign).
- **No localStorage.** Telemetry resets on every reload. Document this on the
  `#network` page itself so a user doesn't expect history.
- **`#network` page in `Out of scope` vs `In scope`.** It's IN scope for this
  ticket — the user explicitly wants it. The "out of scope" list above is about
  the _contents_ of that page (charts, multi-session aggregates, persistence),
  not the page itself.

## Working notes (implementer)

### Tests to write (TDD-first)

- `src/core/wire.test.ts` — envelope round-trip (encode → decode equality) for
  each `t`, malformed JSON drops to null, missing required fields drops to null,
  unknown `t` drops to null, version-mismatch (`v: 2`) drops to null.
- `src/hooks/useChatSession.test.ts` — extend with:
  - outgoing chat is wrapped in a JSON envelope when sent (channel.sent is JSON,
    has `t: 'chat'`, has the id, sentAt, text)
  - outgoing chat is marked `delivery: 'pending'` until receipt arrives, then
    flips to `'delivered'`
  - incoming chat envelope appends a `them` message with the text (existing
    bare-string test repurposed to wrap in envelope)
  - incoming chat auto-fires a `receipt` envelope on the same channel
  - receipt for unknown id is ignored without error
  - clock-sync probe fires on channel open (offerer side)
  - sync-ack triggers offerer to send sync-done; offerer's telemetry.sync gets
    populated
  - answerer derives its sync from a sync-done envelope received from offerer
  - sync-failure timeout doesn't break chat (sync stays null, chat still works)
  - state-change samples appended on every state transition
  - samples cap at 500
- `src/components/Chat.test.tsx` — outgoing bubble renders a pending check by
  default, flips to delivered when message.delivery === 'delivered'; incoming
  bubbles have no check.
- `src/network/Network.test.tsx` — renders heading; empty state when no
  `connectedAt`; header summary computes median / p95 from samples; sync probe
  block renders the four timestamps when sync is present; state-change timeline
  renders.
- `src/App.test.tsx` — extend with: routing to `#network` renders the Network
  heading; document.title is set; #network is bookmark-able (hash not cleared).

### Implementation order

1. `src/core/wire.ts` + tests (pure module, no UI).
2. Update `ChatMessage` to include `delivery?: 'pending' | 'delivered'`, sentAt.
3. Update `useChatSession` to:
   - wrap outgoing chat in envelope, set `delivery: 'pending'`, track id
   - on channel.open as offerer, fire sync-probe with id + sentAt; start 5s
     timeout
   - on channel.open as answerer, do nothing (wait for probe)
   - on incoming envelope, dispatch by `t`:
     - `chat` → append `them` message + auto-send `receipt`
     - `sync-probe` → reply with `sync-ack` carrying `replyTo`,
       `probeReceivedAt`
     - `sync-ack` → compute rtt/offset, populate telemetry.sync, send
       `sync-done` with `t4`
     - `sync-done` → answerer computes its own (rtt, -offset) from the four
       timestamps
     - `receipt` → mark matching outgoing msg as delivered, log
       telemetry.samples
   - expose `telemetry` field: connectedAt, sync, samples (in ref), summary
     (derived from ref)
   - append state-change samples on each setState in setters/handlers
4. Update Chat.tsx to render checkmark next to time on outgoing bubbles.
5. Add Network.tsx with sections; add `#network` route in App.tsx.

### Notes / decisions

- Going with option (b) for two-sided clock sync: a third `sync-done` envelope
  carrying `t4` so both peers can derive `(rtt, offset)` independently. Simpler
  reasoning, no "trust peer math".
- `telemetry.samples` lives in `useRef`; `telemetry` exposed via state mirror
  gets bumped on receipts and sync-completion so the Network page re-reads. That
  keeps Chat rendering cost low while still letting Network reflect current
  state.
- Pending-state visual: hollow check (option b) — single `✓` with reduced
  opacity until delivered, then full opacity. Same character either way to avoid
  layout shift.
- Stone palette: any new neutral classes use `stone-*` (FEAT-009 already
  landed).

## Coordination with prior tickets

- **FEAT-006 (per-message timestamps):** the bubble's existing `<time>` element
  stays; the new check glyph sits next to it. The receiver's displayed timestamp
  continues to be the receiver's local clock (`m.at`) — not the sender's
  `sentAt`. The sender's `sentAt` lives in telemetry only, not in the visible
  bubble label. (Rationale: showing the sender's clock in the bubble would be a
  UX shift we haven't agreed on; the message timeline stays clean.)
- **FEAT-007 (design system):** the check-glyph styling reuses existing color
  and typography tokens (`text-sky-100/80` matches the existing bubble
  timestamp). The `#network` page composes existing primitives. If the page
  needs a new "stat card" pattern that isn't in the design system yet, file a
  follow-up to extract it as a primitive — don't grow the design system inside
  this ticket.
- **FEAT-008 (polite peer):** the wire envelope + sync handshake fire when the
  data channel opens, which is the same moment for either the original-route or
  the polite-deferred route. No special handling needed — both code paths land
  in `wireChannel.onopen`.
- **FEAT-009 (stone palette):** any new UI introduced here (the check glyph, the
  `#network` page surfaces) uses `stone-*` for neutral grays. If this ticket
  lands before FEAT-009 is merged, write `slate-*` and FEAT-009 will sweep it;
  if FEAT-009 lands first, write `stone-*` directly.
- **BUG-002 / BUG-005 (pre-connect vs post-connect state machine):** the new
  `state-change` telemetry samples piggyback on the existing `setState`
  transitions inside `useChatSession`. Don't introduce a parallel state machine
  — append a sample inside the existing setters/handlers.
