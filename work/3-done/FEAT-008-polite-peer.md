# FEAT-008: Polite peer — auto-recover when both peers paste an offer

**Status:** Resolved (with BUG-007 fix, 2026-05-23) **Type:** Feature **Area:**
`src/screens/Offerer.tsx`, `src/screens/Joiner.tsx`,
`src/hooks/useChatSession.ts`, `src/core/rtc.ts`, `src/App.tsx`

## Summary

Make the initial handshake forgiving of the most common user mistake: **both
peers click "Start a new chat" and try to invite each other at the same time.**
Today the Offerer screen's "Paste their reply code" textarea only accepts an
_answer_ SDP — pasting the other peer's _offer_ code/URL into it produces a
`setRemoteDescription` error and the user is stuck.

Adapt the spirit of WebRTC's
[Perfect Negotiation pattern](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Perfect_negotiation)
to this app's one-shot paste-based signaling: when an offerer detects that what
they pasted is another offer (not an answer), they **politely defer** — tear
down their own pending offer and become an answerer of the pasted offer instead.
The other peer then receives a reply code and the connection completes normally.

No live signaling channel is added in this ticket; the polite-defer trigger is
the human paste action on the existing Offerer reply-code textarea.

## Customer value

- **Removes a sharp edge in the most common confused-start scenario.** In manual
  testing two cooperating users routinely both press "Start a new chat" —
  neither knows who's "supposed to" go first. Today they each end up with an
  invite URL, paste each other's URL into the reply box, and both get a cryptic
  error. With this feature, whichever one pastes first transparently becomes the
  answerer; the other peer's existing flow finishes the handshake.
- **Reduces "you go first / no, you go first" friction.** Pasting an offer into
  the reply field Just Works™ — the user doesn't need to learn the
  offerer/joiner role distinction.
- **Aligns the app's resilience with the MDN guidance** the user explicitly
  referenced, without requiring the live signaling channel that Perfect
  Negotiation normally assumes.

## Business value

- **Defends the "no servers, just paste" premise.** The pitch is that
  signaling-by-paste is acceptable because it's straightforward. The "we both
  clicked Start" failure mode quietly undermines that pitch — it produces a
  dead-end error screen that looks like the app is broken. Auto-recovery makes
  the paste-based model robust enough to ship to a wider audience.
- **Cheap-to-implement instance of a well-known pattern.** The full MDN Perfect
  Negotiation algorithm assumes bidirectional signaling and is heavyweight to
  implement; this ticket lands the _user-visible benefit_ (collision recovery)
  at a fraction of the cost by exploiting the inherent temporal asymmetry of
  human paste actions.
- **Sets up the vocabulary and code seams** (SDP type detection, polite-defer
  transition) that a future live-signaling feature could lean on if/when we add
  one.

## What a working feature delivers

A user on the Offerer screen has already generated an invite URL and is in
`awaiting-answer` state. They paste a string into the "Paste their reply code"
textarea and click Connect (or press Enter). Two cases:

1. **The pasted code is an answer SDP** (`type: 'answer'`). Behaves exactly as
   today — `submitAnswer` runs, the connection finishes, the user lands on the
   Connected screen.

2. **The pasted code is an offer SDP** (`type: 'offer'`) — the polite-peer path:
   - The app recognises that this is the other peer's invite, not a reply.
   - The user's own pending PeerConnection (the offer they generated) is torn
     down — that SDP is now abandoned.
   - The app starts an answerer flow against the pasted offer, gathers ICE, and
     produces a fresh **reply code**.
   - The screen transitions to a "Send this code back" view (the same view the
     Joiner screen shows after Accept) so the user can copy the reply and send
     it to their friend.
   - The other peer (still sitting on their own Offerer screen waiting for a
     reply) pastes the reply code into their own reply box → connection
     completes normally.
   - A brief, accessible status announcement (`role="status"`, polite live
     region — same mechanism as today's `LiveRegion`) explains the transition,
     e.g. _"That's an invite, not a reply. Sending a reply back instead — copy
     the code below."_ so the user understands why the screen just changed.

Net UX: whichever user pastes the _other person's invite_ first transparently
becomes the answerer. The other user's existing flow finishes the handshake. No
errors, no restarts, no need to understand "offerer" vs "answerer".

## Acceptance criteria

1. **SDP type detection at paste-time.** When the Offerer's "Paste their reply
   code" form is submitted (button click _or_ Enter key), the pasted code is
   decoded and its `type` field is inspected. `type === 'answer'` runs today's
   `submitAnswer` path verbatim. `type === 'offer'` runs the polite-defer path
   (AC #2). Decoding errors (malformed code, wrong payload shape) surface the
   existing error Callout — no change.

2. **Polite-defer path tears down the local offer and answers the remote.** When
   `type === 'offer'`:
   - The current `RTCPeerConnection` and data channel (from `startAsOfferer`)
     are closed.
   - `encodedLocal` (the abandoned offer URL) is cleared so it no longer
     renders.
   - A new answerer session is started against the pasted offer (functionally
     equivalent to `startAsAnswerer(pastedOfferCode)`).
   - The session moves through `gathering` → `awaiting-answer` and surfaces a
     fresh `encodedLocal` (the answer SDP encoded for the reply-code CopyBox).
   - No `failed` / `closed` transition occurs during the swap (those are
     reserved for actual transport drops — the close-handler logic in
     `useChatSession.wireChannel` must not fire `setState('failed')` for the
     deliberate teardown).

3. **Screen mirrors the Joiner reply-code view after defer.** After
   polite-defer, the Offerer screen renders the same content the Joiner screen
   shows post-Accept: a `Heading` ("Send this code back" or equivalent), a
   CopyBox with the reply code, and the Cancel button. Visually consistent with
   `Joiner.tsx`'s `branch === 'reply'` view — reuse the same primitives, do not
   open-code a parallel layout. The user can `Cancel` back to Home at any time.

4. **Accessible transition announcement.** When the polite-defer fires, the
   `LiveRegion` content updates to a one-sentence explanation of what happened
   (e.g. _"That's an invite, not a reply. Sending a reply back to your friend
   instead."_) so screen-reader users hear why the form they just submitted has
   been replaced by a CopyBox. The announcement uses the existing polite live
   region (no `role="alert"` — this is not an error).

5. **Heading focus follows the branch swap.** The newly mounted "Send this code
   back" heading receives focus via the existing `useFocusOnMount` pattern
   (matching the Joiner screen's behaviour on its own `branch` change), so
   keyboard users land on the new heading instead of `<body>`. Both Offerer and
   Joiner currently re-focus on branch transitions — this ticket extends the
   same idiom to the new polite-defer branch.

6. **Other peer's existing flow is unaffected.** The peer who _did not_ paste
   anything keeps their own Offerer screen open, waiting on the reply code
   (still in `awaiting-answer` with their own `encodedLocal` rendered). When
   they paste the polite peer's reply code, the standard `submitAnswer` →
   `connecting` → `connected` path runs unchanged. No code changes required on
   the "impolite" side; this ticket is one-sided behavior on the polite peer.

7. **`#offer=…` URL pasted into the reply box also works.** If the user pastes
   the full invite URL (not just the encoded fragment), the form extracts the
   `offer` hash param and treats the contained code as the offer. (Reuse
   `readHashParam` from `src/core/url.ts`.) Plain encoded codes continue to work
   too. Whitespace is trimmed.

8. **`offer` route swap is also robust.** If the user, while in
   `awaiting-answer`, instead clicks the other peer's invite URL in the same tab
   (hash changes from `#` to `#offer=…`), the existing same-tab listener in
   `App.tsx:26-35` already routes to the Joiner screen, which mounts a fresh
   hook and tears down the offerer's PC via the unmount cleanup. **This ticket
   verifies that path still works** (no regression) but the _new_ code lives on
   the paste-into-reply-box path, which today has no recovery.

9. **No regressions in the existing offerer→joiner flow.** All existing tests
   pass: `App.test.tsx`, `Offerer.test.tsx`, `Joiner.test.tsx`,
   `useChatSession.test.ts`, `rtc.test.ts`, plus the
   chat/timestamp/design-system tests. The non-trickle ICE flow (`createOffer` →
   `acceptAnswer` for the offerer, `acceptOffer` for the answerer) continues to
   work for the happy path with `type: 'answer'` reply codes.

10. **`pnpm run lint`, `pnpm run typecheck`, and `pnpm run test` (read:
    `npm run …` — this project uses npm) all pass.**

## Out of scope (v1)

- **Adding a live signaling channel** (WebSocket relay, BroadcastChannel,
  server-mediated rendezvous). This ticket adapts the polite-peer _behavior_ to
  one-shot paste signaling; renegotiation over a live channel is a separate
  feature.
- **Symmetric polite-peer on the Joiner screen** (i.e. pasting an _answer_ into
  Joiner's "You've been invited" preview, or pasting another invite into a
  joiner-side reply box). The Joiner screen has no reply-code paste affordance
  today — the polite peer asymmetry is unidirectional in v1. Revisit if user
  testing shows the inverse mistake.
- **A deterministic tiebreaker for fully-simultaneous double-paste.** If _both_
  peers paste the other's offer at the exact same moment, both will polite-defer
  and both will become answerers, and neither connection completes. The natural
  temporal asymmetry of two humans copy-pasting strings makes this exceedingly
  rare; if it occurs the user can hit Cancel → Home → try again. A
  nonce-in-offer tiebreaker is a follow-up if observed in the wild.
- **Renegotiation after `connected`.** Once a chat is live, no renegotiation
  occurs in this app (no video/screen-share/file-transfer features that would
  require it). The polite-peer logic applies only during the initial handshake.
- **Embedding a "I'm polite" marker in the offer SDP payload.** Both peers are
  equally capable of being polite; the role is decided by _who pastes first_,
  not by a pre-assigned flag. If the future live-signaling feature lands, that's
  the time to revisit assigning fixed polite/impolite roles.
- **Auto-detect-and-defer for invite _URLs_ that arrive via the same-tab hash
  listener.** That path already routes cleanly to Joiner (AC #8); no new
  behavior is added there. The new code only affects the paste-into-reply-box
  affordance.
- **Custom UI for "your invite was abandoned."** The transition is presented as
  a quiet swap to the reply view with a one-sentence live-region announcement.
  No modal, no toast, no warning dialog.

## Open questions

- **Hook-level method vs. screen-level orchestration.** Two viable shapes for
  the polite-defer plumbing:
  - (a) **Add a `politelyAcceptOffer(offerCode)` method to `useChatSession`**
    that internally tears down the offerer PC and starts the answerer flow
    atomically. Offerer's submit handler detects offer-vs-answer and calls one
    or the other. This keeps the hook as the single source of truth for
    connection lifecycle.
  - (b) **Detect offer-vs-answer in the Offerer component, call
    `session.reset()`, then route to `#offer=<pasted>`** so the existing Joiner
    mount effect handles the rest. Reuses the entire Joiner screen, including
    its "Accept / Decline" preview, although that preview is arguably redundant
    when the user has explicitly pasted the code (they've already accepted).
  - **Recommendation:** (a). The hook already owns
    `startAsOfferer`/`startAsAnswerer`/`reset`; adding `politelyAcceptOffer` is
    a small extension and avoids the awkward "skip the Joiner accept-preview"
    question option (b) raises. Mention the choice in the PR description.
- **Should the polite-defer announcement persist on screen as a
  `<Callout variant="info">`** in addition to the live-region announcement, so
  sighted users also see the explanation? The Joiner reply view doesn't normally
  render such a callout, but post-defer the user benefits from a one-sentence
  "here's why the screen changed" affordance. **Recommendation:** yes, a single
  `Callout variant="info"` rendered above the CopyBox on the polite-deferred
  branch (only — not on a fresh Joiner mount), wording aligned with the
  live-region text. Auto-dismiss not required.
- **Reply-box label after the user has typed something that isn't a valid SDP at
  all.** Today the form surfaces a decode error in the existing error Callout.
  Should pasting an _offer_ that fails to decode (malformed compressed string
  that happens to look offerish) be specially handled? **Recommendation:** no —
  decode failures land in the existing error path regardless of whether the
  encoded payload would have been an offer or an answer. Only
  successfully-decoded `type: 'offer'` payloads take the polite path.

## Notes for the implementer

- **SDP shape.** Encoded payloads decode to `RTCSessionDescriptionInit`
  (`{ type: 'offer' | 'answer', sdp: string }`). Branch on `decoded.type`. The
  existing `acceptAnswer` helper in `src/core/rtc.ts:89-92` already decodes to
  `RTCSessionDescriptionInit` — extract the branching one level above (in the
  hook or screen) before dispatching to `acceptAnswer` vs the new polite path.
- **URL-vs-bare-code parsing.** The user may paste either:
  - a bare compressed code (current expectation),
  - or a full invite URL like `https://…/#offer=<code>`.

  Normalize by checking for `#offer=` (or just `offer=`) and extracting the
  param via `readHashParam` (`src/core/url.ts:5-10`). Falls through to treating
  the input as a bare code otherwise.

- **Teardown vs `'failed'` race.** `useChatSession.wireChannel`
  (`src/hooks/useChatSession.ts:72-76`) sets state to `'failed'` on
  `channel.onclose` when the previous state was not
  `connected`/`closed`/`idle`/`failed`. A deliberate polite-defer teardown
  happens in `awaiting-answer`, which would otherwise be reclassified as
  `'failed'`. Either:
  - swap to `'idle'` first inside the new hook method so the close handler
    short-circuits, or
  - guard the `onclose` handler with a "deliberate teardown" flag set by the new
    method.

  Don't lean on the existing `teardown` helper at
  `src/hooks/useChatSession.ts:38-43` without considering that race — channel
  close events are async.

- **Hash isn't involved.** Polite-defer happens purely in component state — do
  not push `#offer=<code>` to the URL during the defer. The URL stays at `#` (or
  wherever the offerer was). This avoids triggering the hashchange listener and
  avoids the user accidentally bookmarking the now-abandoned offer.
- **Page title update.** After polite-defer, `usePageTitle` should reflect the
  new posture — "Send your reply code · P2P Chat" matches Joiner's title format.
  Adjust the `usePageTitle` call in `Offerer.tsx:48-50` to include the new
  branch, or factor the title selection into the new branch logic.
- **Live-region timing.** The status string must update _during_ the transition,
  not after the new branch mounts, otherwise screen readers may not announce the
  explanation before they're already announcing the new heading. Render the
  live-region content from the parent (the way `Offerer.tsx:81` already does)
  and update its message in the same render where the branch flips.
- **Test fixtures.** `rtc.test.ts` already exercises
  `createOffer`/`acceptOffer`/`acceptAnswer`. For the polite-defer integration
  test, use the same offer-shape decoding as those tests but pass the encoded
  offer through the _Offerer screen's_ submit handler to verify the branch swap
  end-to-end. A small `RTCPeerConnection` stub (already established in
  `src/__mocks__/`) keeps the test fast.
- **`Cancel` during polite-defer.** Pressing Cancel before, during, or after the
  polite-defer must clean up correctly — `session.reset()` already tears down
  whichever PC is currently live; nothing extra needed if the polite-defer uses
  the same teardown primitive.
- **Wording for the live-region + Callout.** Keep it factual and non-blaming.
  Suggested copy: _"That's an invite, not a reply. Sending a reply back to your
  friend instead — copy the code below."_ Avoid words like "error", "wrong", or
  "you pasted the wrong thing".

## Coordination with prior tickets

- **FEAT-007 (Design system):** the post-defer reply-code view reuses the same
  primitives the Joiner uses (`Heading`, `CopyBox`, `Callout`, `LiveRegion`,
  `Button`). No new primitives needed; do not open-code parallel styling.
- **FEAT-003 (Enter submits reply code):** Enter must continue to submit the
  reply form. The branching (answer vs offer) sits inside the submit handler so
  the keyboard path takes the polite-defer route too — there must not be a way
  to bypass detection by pressing Enter instead of clicking Connect.
- **FEAT-002 (Keep input focused) / focus management:** the new branch's heading
  takes focus on swap (AC #5); the previously-focused reply textarea will
  unmount, so no stale focus reference remains.
- **BUG-002 / BUG-005 (pre-connect vs post-connect state machine):** the
  polite-defer teardown happens in `awaiting-answer` (pre-connect). The
  close-handler escalation logic that distinguishes `failed` vs `closed` must
  continue to behave correctly _after_ this ticket — the deliberate close during
  polite-defer must not be misclassified as a `failed` state. See implementer
  note on the teardown/`failed` race.

## Working notes (resolution)

- Took option (a) from the open question: added `politelyAcceptOffer(offerCode)`
  to `useChatSession`. The hook owns the swap end-to-end: marks a
  `deliberateTeardownRef`, closes the offerer PC + channel, clears
  `encodedLocal`, then runs the answerer-side `acceptOffer` flow and emits a
  fresh `encodedLocal`. The `channel.onclose` guard short-circuits during the
  deliberate teardown so the polite-defer does not regress to `'failed'`.
- Offerer screen detects SDP type at submit-time (button click or Enter) via a
  small `classifyPastedCode` helper that decodes once and switches on
  `decoded.type`. URL-vs-bare-code parsing handled by `extractOfferCode`, which
  reuses `readHashParam` and tolerates leading/trailing whitespace and
  `URL`-parseable invite links. Both `offer` and `answer` paths route through a
  shared `dispatchReply`; malformed payloads fall through to the existing
  `submitAnswer` → `session.error` path.
- New `'reply'` branch on the Offerer mirrors the Joiner's reply-code view
  (`Heading` + info `Callout` + `CopyBox` + Cancel). The info `Callout` and the
  polite `LiveRegion` carry the same factual, non-blaming explanation.
  `usePageTitle` now reflects the new posture as
  `Send your reply code · P2P Chat`. Focus follows the swap via the CopyBox's
  existing `autoFocus`-driven Copy-button focus.
- Tests: added five `useChatSession` tests (teardown + role swap, no spurious
  `failed`, no-op outside `awaiting-answer`, fresh PC + non-empty `encodedLocal`
  after swap, error path) and seven Offerer-screen tests (answer-path
  regression, offer-path dispatch, URL extraction, Enter-key parity,
  malformed-input fall-through, reply-view render, info Callout,
  focus-on-mount). Existing tests still pass (180 total).
- Followed the existing CopyBox/LiveRegion/Callout primitives; no new components
  introduced. `App.tsx` untouched — the new behavior is fully confined to the
  paste-into-reply-box affordance, and the same-tab hashchange path (AC #8) is
  unchanged.

**Status:** Resolved.

## Bug report (2026-05-23): polite-defer fires on the wrong side and strands both peers

**Status:** Re-opened.

### Reported symptom

> - Two clients start a chat.
> - Alice shares the url.
> - Bob loads it, accepts, copies the code on the "Send this code back" screen,
>   sends it to Alice.
> - Alice pastes the code.
> - Expected: the chat begins.
> - Actual: Alice sees the "Send this code back" screen and they are stuck.

### Reproduction (jsdom integration test, passes against the FEAT-008 commit `03f5f33`)

```ts
// Bob clicks "Start a new chat" first — his session becomes awaiting-answer
// with his own encodedLocal (Bob's offer SDP).
render(<App />)
fireEvent.click(screen.getByRole('button', { name: /start a chat/i }))
await flush()

// Alice's invite URL arrives in Bob's tab (paste-into-address-bar, app-link, etc.).
history.replaceState(null, '', `/#offer=${alicesOffer}`)
window.dispatchEvent(new HashChangeEvent('hashchange'))

// Bob clicks Accept on the Joiner screen.
fireEvent.click(screen.getByRole('button', { name: /^accept$/i }))
await flush()

// The "Reply code" CopyBox value is Bob's own offer SDP — NOT an answer to Alice's offer.
const replyCodeBox = screen.getByRole('textbox', { name: /reply code/i }) as HTMLTextAreaElement
decode(replyCodeBox.value).type // → 'offer' (should be 'answer')
```

### Root cause

The ticket's AC #8 made an incorrect claim about how the same-tab hash-route
swap works:

> If the user, while in `awaiting-answer`, instead clicks the other peer's
> invite URL in the same tab (hash changes from `#` to `#offer=…`), the existing
> same-tab listener in `App.tsx:26-35` already routes to the Joiner screen,
> **which mounts a fresh hook and tears down the offerer's PC via the unmount
> cleanup**.

This is wrong. `useChatSession` is owned by `App.tsx` (`src/App.tsx:27`) and is
shared across all routes. When the route switches from `offerer` to `joiner`,
the **same** hook instance is handed to the Joiner — there is no remount, no
unmount cleanup, no PC teardown. Bob's session stays in `awaiting-answer` with
his offerer's `encodedLocal` still populated.

`Joiner.tsx:54-58` then short-circuits its own role-swap:

```ts
useEffect(() => {
  if (accepted && session.state === 'idle') {
    void session.startAsAnswerer(offerCode)
  }
}, [accepted, offerCode, session])
```

`session.state !== 'idle'`, so `startAsAnswerer` is never called. Bob clicks
Accept, the Joiner moves to its `branch === 'reply'` view, and the CopyBox
renders `session.encodedLocal` — which is still Bob's _offer_ — under the label
"Reply code".

Bob copies what he is told is the reply code (it's his offer SDP) and sends it
to Alice. Alice's submit handler classifies the pasted code via
`classifyPastedCode` (`src/screens/Offerer.tsx:58-68`) — it correctly reports
`'offer'` and `politelyAcceptOffer` fires on Alice's side. Alice's offer is now
torn down and she becomes an answerer of Bob's offer, displaying her own "Send
this code back" screen.

Both peers are now showing reply-code views with no remaining paste affordance,
so neither can complete the handshake. Stuck.

### What FEAT-008 actually fixed vs. didn't

- ✅ **The paste-an-offer-into-the-reply-box path** (the polite-defer trigger
  described in AC #1–#7) works correctly in isolation — the regression test at
  `src/screens/Offerer.test.tsx:220` passes and the hook-level swap at
  `src/hooks/useChatSession.ts:489-521` is sound.
- ❌ **AC #8 was never actually exercised** by a test. The claim "Joiner mounts
  a fresh hook and tears down the offerer's PC via the unmount cleanup" was
  assumed, not verified. Because the hook is hoisted into `App.tsx`, the
  assumption fails — and the failure manifests as the _upstream_ trigger for the
  bug the user reported.

### Why this is worse than "AC #8 is broken"

AC #8 framed the same-tab offer-route swap as a "no regression" concern. The
reproduction above shows that not only is it a regression — it's the **primary
trigger** for the symptom the ticket was supposed to fix. The polite-defer path
on Alice's side is firing _correctly_ given the input it receives; the input is
wrong because Bob's stale session has corrupted the CopyBox content into a
mislabeled offer.

### Suggested fix sketch (do not implement here)

There are at least three viable framings, each with trade-offs the implementer
should weigh:

1. **Reset Bob's session on a hashchange route into `joiner`.** In `App.tsx`'s
   hashchange listener, if the next route is `joiner` and
   `session.state !== 'idle'`, call `session.reset()` before `setRoute(next)`.
   This unconditionally throws away the stale offerer PC and lets the Joiner's
   existing `useEffect` run `startAsAnswerer` cleanly. Simple, but loud —
   discards any in-flight gather even if the user navigated away by mistake.
2. **Teach the Joiner to politely defer on mount.** When
   `accepted && session.state === 'awaiting-answer'` and we have an `offerCode`,
   call `session.politelyAcceptOffer(offerCode)` instead of `startAsAnswerer`.
   Mirrors the Offerer-screen behavior on the Joiner side and reuses the hook
   method that already handles the role swap atomically.
3. **Move `useChatSession` per-screen.** The deepest fix, and the one closest to
   what AC #8 originally assumed. Hoist the session into `Offerer` and `Joiner`
   so a route change _does_ unmount-and-remount the hook. Larger blast radius
   (App-level features like `#network` that read the same session would need a
   different plumbing approach).

Recommendation: option 2 keeps the hook ownership where it is, mirrors the
existing polite-defer affordance, and is the smallest behavioral change. The
implementer should also add an integration test that exercises the full `App`
flow (both clients in `App` instances) — the lack of such a test is how this
slipped through.

### Additional gaps to address

- The Joiner currently has **no test** that drives the screen from a non-idle
  starting state. Every existing Joiner test mounts the screen with a
  freshly-constructed mock session in `idle`. Add a test that mounts Joiner with
  `state: 'awaiting-answer'` + a stale offerer `encodedLocal` and asserts either
  a polite-defer (option 2) or a reset (option 1).
- `src/App.test.tsx` only covers routing — no flow tests that pair offerer +
  joiner state transitions. Even a single end-to-end test of "Bob clicks Start,
  then loads Alice's URL" would have caught this. Add one.
- Consider whether `usePageTitle` and the live-region status string need updates
  when the Joiner mounts on a non-idle session — today they would announce
  "Reply code ready" for a stale offer code, which is misleading copy.

## Working notes (BUG-007 fix, 2026-05-23)

- Took option (2) from the suggested fixes: taught the Joiner to politely defer
  on Accept when the shared hook is in `awaiting-answer`. The same
  `politelyAcceptOffer` method that powered the Offerer-side recovery now drives
  the Joiner side too — no new hook plumbing, just a wider trigger.
- Moved the dispatch out of `Joiner`'s `useEffect` and into the Accept click
  handler so the hook's synchronous `setEncodedLocal(null)` /
  `transition('gathering')` batch with `setAccepted(true)` in the same React
  event. Without that batch the reply branch paints one frame with Bob's stale
  offer SDP labeled as "Reply code" before the teardown runs — the exact leak
  the user reported. The new `onAccept`:
  - `state === 'idle'` → `startAsAnswerer(offerCode, effectiveConvId)` (original
    path, no change).
  - `state === 'awaiting-answer'` →
    `politelyAcceptOffer(offerCode, effectiveConvId)` (BUG-007 fix).
  - Any other state — guarded inside the hook; no-op so a stray Accept after
    `connected`/`closed`/`failed` can't tear down a live chat.
- Extended `politelyAcceptOffer(offerCode, conversationId?)` with an optional
  conv-id argument so the Joiner-side polite-defer also rebinds to the inviter's
  conversation. Without the rebind Bob's session stayed tied to his old offerer
  `conv` id and Alice's FEAT-012 `history` envelope was dropped by the mismatch
  check — chat would connect but resume wouldn't merge. The Offerer-side caller
  still omits the argument and keeps its existing binding.
- Branch-aware live-region: `statusMessage` now returns `''` on the Joiner's
  `invite` branch so the leaked `awaiting-answer` state from a prior offerer
  flow doesn't make AT users hear "Reply code ready" while they're still on the
  "You've been invited" screen. The visible content drives the announcement, not
  the underlying connection state.
- Tests:
  - **4 new Joiner unit tests** (`Joiner polite-defer on Accept (BUG-007)`):
    idle → `startAsAnswerer` regression guard, `awaiting-answer` →
    `politelyAcceptOffer` dispatch, stable conv id when the URL omits `conv=`,
    and the live-region copy doesn't leak on the invite branch.
  - **2 new hook tests** for the rebind: passing a fresh conv id rebinds +
    accepts the new history envelope; omitting the arg preserves the existing
    binding (Offerer-side regression guard).
  - **2 new App-level integration tests**
    (`App offerer→joiner same-tab swap (BUG-007)`): Bob clicks Start → Alice's
    URL arrives → Accept → reply CopyBox decodes as `type: 'answer'`, never
    byte-equal to Bob's earlier offer. Both fail on the pre-fix Joiner and pass
    post-fix (verified by stashing the screen change and re-running).
- All 309 tests pass (was 301). Lint + typecheck clean. No new components, no
  new dependencies; the integration test reuses the FakePeerConnection pattern
  from `useChatSession.test.ts` and pulls in `fake-indexeddb` for FEAT-012's
  storage layer.

**Status:** Resolved.
