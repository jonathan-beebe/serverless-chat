---
id: BUG-012
type: bug
status: open
created: 2026-05-27
---

# BUG-012: cancel from offerer leaves session bound second start renders notfound

## Problem

User flow regression. Steps:

1. On Home tap "Start a chat" — `Home.startNew` (`src/screens/Home.tsx:46-61`)
   mints `newId`, fires `void session.startAsOfferer(newId)`, then navigates to
   `/conversation/<newId>`; session transitions through `'gathering'` →
   `'awaiting-answer'` with `conversationId === newId`.
2. On the Offerer setup screen tap Cancel (`src/screens/Offerer.tsx:316-318`
   during invite branch, or `:262-264` during polite-defer); the handler is
   `onCancel` which in `ConversationRoute`
   (`src/routes/ConversationRoute.tsx:58, :77, :122`) is `() => navigate('/')` —
   no `session.reset()`, no teardown. Session is still bound to the canceled id
   and stuck in `'gathering'` / `'awaiting-answer'`.
3. Back on Home tap "Start a chat" again — `Home.startNew` mints a fresh
   `newId2`, calls `session.startAsOfferer(newId2)`, but the hook's first line
   `if (state !== 'idle') return` (`src/hooks/useChatSession.ts:760`)
   short-circuits: state is still `'awaiting-answer'`, so nothing happens —
   `conversationId` stays on the OLD id, no new PC, no transition. Navigate to
   `/conversation/<newId2>` lands in `ConversationRoute`
   (`src/routes/ConversationRoute.tsx:76`) where `session.conversationId === id`
   is false (session is still bound to the canceled id), falls through to
   `ResumeOrNotFound`'s `getConversation(newId2)` lookup, which returns
   undefined (or an IMPRV-011-culled stub on the second mount), and `NotFound`
   renders.

## Outcome

Every "Start a chat" tap — including the second, third, Nth retry after a Cancel
— lands the user on a fresh Offerer setup screen bound to a freshly-minted
conversation id. The "Conversation not found" branch never fires for a
freshly-minted id the user just created themselves; it remains only for
genuinely unknown deep links and ended / foreign chats.

## Why it matters

The primary CTA is broken on retry. A user who cancels their first attempt (most
likely use: "wait, I'll send this from a different tab / I changed my mind / I
want a fresh invite URL") has no path forward — every subsequent tap on the only
meaningful button on Home routes them to a dead-end empty-state screen whose
only affordance is "Back to home", which then re-renders the same Start button
with the same broken behavior. The only escape is a full page reload (which
remounts the hook and resets state). This is a regression — pre-ARCH-001, Cancel
routed through `App.goHome` which called `session.reset()` before route change
(`App.tsx` pre-`30fcaa2`, lines 64–67 in the prior version).

## Discovery notes

Causal chain through `src/hooks/useChatSession.ts`: `reset()` (lines 915–937)
clears `conversationId`, `knownIds`, `snapshot`, transitions to `'idle'`.
`startAsOfferer` (line 758) guards on `state !== 'idle'`. Cancel in Offerer just
navigates; nothing in `ConversationRoute`, `App`, or `Home` resets the session
on route change. So after step 2 (Cancel from gathering / awaiting-answer):
`session.state === 'awaiting-answer'`, `session.conversationId === <oldId>`,
`pcRef` still holds the abandoned `RTCPeerConnection` (a separate PC-leak bug —
orthogonal but worth noting). Step 3's `startAsOfferer(newId2)` no-ops;
`ConversationRoute` branch 2 `session.conversationId === id` fails because
`conversationId` is still `oldId`; branch 3 `getConversation(newId2)` returns
undefined; `NotFound`. CR-011's cull plays no causal role — the cull operates on
Home mount and removes the OLD empty stub, but the bug is about routing to the
NEW id, whose record was never created (`startAsOfferer`'s `bindConversation`
upsert never ran because of the guard). The FakePC + fake-indexeddb test
infrastructure absolutely can capture this — `Home.test.tsx` already mocks
`crypto.randomUUID` and asserts navigate; a test that renders `<AppRoutes />`
under `MemoryRouter`, clicks Start, clicks Cancel, clicks Start again, and
asserts the pathname is `/conversation/<newId2>` and the heading is "Invite your
friend" (not "Conversation not found") would fail today.

This is the SECOND symptom of the same ARCH-001 root cause — BUG-011 (peer stays
connected after end chat) is the other; both fix together if `session.reset()`
is restored before navigation in `ConversationRoute`.

## Recommendation

Start at `src/routes/ConversationRoute.tsx:77` — the
`onCancel={() => navigate('/')}` callback on the live-session-bound Offerer is
the one that fires on the user's Cancel. The minimal fix is
`onCancel={() => { session.reset(); navigate('/') }}` (matching the pre-ARCH-001
`goHome` semantics), applied to all three `onCancel` sites in
`ConversationRoute` (joiner branch `:58`, live-session branch `:77`, resume
branch `:122`). Alternative: add a route-change effect in `AppShell` that resets
when transitioning away from `/conversation/*` to `/` — broader and would also
catch back-button navigation, but risks regressing BUG-008 (back-from-network
keeps live session). The narrow fix on the explicit Cancel button is safer
because Cancel is unambiguous user intent to abandon. Failing test to write
first (`src/screens/Home.test.tsx` or `App.test.tsx`): mount `<AppRoutes />`
under `MemoryRouter`, click "Start a chat", on the Offerer screen click Cancel,
on Home click "Start a chat" again, assert (a) `session.startAsOfferer` was
called with a fresh id and (b) the rendered screen is the Offerer "Invite your
friend", not `NotFound`. Hypothesis to verify first: state after Cancel — log
`session.state` and `session.conversationId` in a quick repro to confirm they're
`'awaiting-answer'` and `<oldId>` (not `'idle'` / `null`), which would prove the
guard short-circuits the second `startAsOfferer`. Secondary: confirm the
abandoned `RTCPeerConnection` is leaked across Cancel (separate cleanup ticket
if so — out of scope for this bug but worth a note).

## Related work

- ARCH-001 (`30fcaa2`, 2026-05-25) — moved routing to react-router and replaced
  `onCancel = goHome` (which did `session.reset(); setRoute({ home })`) with
  `onCancel={() => navigate('/')}` in `ConversationRoute`. The pre-bind logic in
  `Home.startNew` was added in the SAME commit, designed around an idle session
  — but the reset that guarantees "idle" was deleted in the same change. This is
  the regression.
- IMPRV-006 / CR-006 (`e2f65e0`, 2026-05-23) — added
  `if (state !== 'idle') return` guard at `useChatSession.ts:760`. This guard is
  what now silently no-ops the second `startAsOfferer` call. Pre-CR-006, the
  second call would overwrite `pcRef` (leaking the old PC) but would set
  `conversationId` to `newId2`; the bug would not manifest as `NotFound` (it'd
  leak a PC instead).
- IMPRV-011 / CR-011 (`0c51ae7`) — `cullEmptyConversations` sweeps zero-message
  conversations on first Home mount per hook instance via `hasSweptRef`.
  Plausibly relevant but not causal: the cull only runs once per Home mount, and
  the canceled stub IS gone after a subsequent Home mount, but the `NotFound`
  path fires regardless of whether the stub exists.
- FEAT-012 (`89c2330`) — introduced `bindConversation` stub-write that creates
  the abandoned IDB record.
- BUG-005 (post-connect drop / closed branch), BUG-008 (back-from-network keeps
  live session) — both prior cases of "navigation should not implicitly reset
  session"; the design intent for those was preserving a live session, not
  stranding a pre-connect setup session.
- BUG-011 — sibling symptom of the same ARCH-001 regression.
