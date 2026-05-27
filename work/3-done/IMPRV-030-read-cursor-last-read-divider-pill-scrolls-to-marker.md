---
id: IMPRV-030
type: improvement
status: resolved
created: 2026-05-27
resolved: 2026-05-27
---

# IMPRV-030: Read cursor with "Last read" divider; new-messages pill scrolls to the marker

## Problem

The IMPRV-029 "N new messages" pill (`src/components/ChatTranscript.tsx`,
shipped in commit b0e5f46) currently scrolls the transcript all the way to the
bottom (scrollHeight) on activation. There is no in-app indicator of where the
user "left off" within the conversation timeline — once they jump to the bottom,
the boundary between read and unread content is invisible. The transcript has no
read-cursor data either: the `ConversationRecord` in `src/core/storage.ts:23-39`
carries `createdAt`, `lastActivityAt`, `label?`, and `selfPeerId?` but no
read-position field, so across a reload (FEAT-012 resume flow) there is no way
to render a "you saw up to here" marker on a returning conversation.

## Outcome

- The transcript renders a horizontal divider labeled "Last read" between the
  last-read message (above the line) and the first-unread message (below the
  line).
- The marker only appears when there is at least one unread message after the
  cursor; a fully-caught-up transcript shows no marker.
- The cursor advances message-by-message as each bubble enters the viewport, so
  the marker tracks the user's actual reading position including during
  scrollback.
- The cursor persists across reload — closing the tab and reopening a
  conversation with the same id renders the marker at the position the user last
  reached.
- Activating the IMPRV-029 "N new messages" pill scrolls the transcript so the
  "Last read" marker sits near the bottom of the visible viewport: the last-read
  tail of messages is visible above the marker; the first unread message is just
  below the marker (off-screen, requiring further scroll). Tapping the pill no
  longer scrolls past the boundary into the unreads.
- A fresh conversation with no read history shows no marker until at least one
  message has been observed.

## Why it matters

The IMPRV-029 pill currently lands the user at the newest message with no
breadcrumb to where they had left off. In a long scrollback session with several
new arrivals, the user loses their place. A persistent read cursor gives them a
wayfinding anchor that survives both within-session scrolling and across-session
reloads, and turns the pill from a pure scroll affordance into a "catch up"
affordance — relocating the user to the boundary of new content, not past it.
Aligns with the IMPRV-028 / IMPRV-029 trajectory of adopting the messaging-app
conventions users already know (iMessage / WhatsApp / Slack DM all render an
analogous "Last read" line).

## Discovery notes

- The "Resumed here" divider at `ChatTranscript.tsx:42` (buildItems insertion)
  and `:230` (rendering) is the structural precedent. Same Divider component,
  same `role="presentation"` + `aria-hidden="true"` so the marker doesn't
  double-announce on every render or count toward the `<ol>`'s item count.
- `ConversationRecord` migration is additive — `storage.ts:13-15` documents the
  `if (oldVersion < N)` pattern. A new optional field is absent on pre-fix
  records and rendering simply skips the marker.
- IntersectionObserver per-bubble is the natural primitive for in-viewport
  cursor advancement. Observer setup belongs in `ChatTranscript` so the cursor
  write path co-locates with the messages prop.
- The cursor write to IndexedDB needs to be debounced / coalesced — observing
  every bubble entry would otherwise fire one write per scroll tick. The hook's
  `commitTelemetry` pattern (`useChatSession.ts:263-266`: bump a version
  counter, commit in an effect) is a close analogue.
- IMPRV-029's `onNewMessagesClick` handler at `ChatTranscript.tsx:140-147`
  currently does `el.scrollTop = el.scrollHeight`. The new behavior reads the
  marker's DOM position and scrolls so it lands at the bottom of the viewport;
  falls back to scrollHeight when no marker is rendered (caught-up case).
- Open edge case for the maker: what happens if the read cursor's message id
  refers to a message that has since been deleted (BUG-006 / future
  delete-message flow)? Likely the marker just doesn't render — same as if the
  cursor were absent. Not a blocker.

## Recommendation

- Add an optional `lastReadMessageId?: string` field to `ConversationRecord`
  (`storage.ts:23-39`). Additive — no schema bump, field is just absent on
  pre-existing records (same pattern as BUG-006's `selfPeerId?`).
- In `useChatSession`, add a new state slot `lastReadMessageId` plus read/write
  to IndexedDB. Initial load via `getConversation` in `bindConversation`
  (`useChatSession.ts:695`). Persist with the same lazy pattern FEAT-010 /
  BUG-007 uses for telemetry — bump a version counter, commit in a useEffect.
- In `ChatTranscript`, attach an IntersectionObserver per message bubble. As
  bubbles enter the viewport, advance the cursor if the bubble's message id is
  newer (by index) than the current cursor's position. `observer.disconnect()`
  on unmount.
- Render a "Last read" divider in the existing items pipeline: extend
  `TranscriptItem` with a `{ kind: 'last-read'; key: 'last-read-marker' }`
  variant; `buildItems` inserts the marker after the cursor-message index
  (mirror of how `resume` is handled at line 41-43). Reuse the existing
  `<Divider>` component and the same `role="presentation"` +
  `aria-hidden="true"` treatment as the resume divider.
- Hide the marker when there are no unreads — `buildItems` simply doesn't push
  the marker when the cursor index equals `messages.length - 1`.
- Update `onNewMessagesClick` (`ChatTranscript.tsx:140-147`) to find the
  marker's DOM node and set
  `el.scrollTop = markerOffsetTop - el.clientHeight + markerHeight` so the
  marker lands near the bottom of the viewport. Fall back to scrollHeight when
  no marker is rendered.
- Tests should cover: marker renders between read and unread, advances as
  bubbles enter viewport, hidden when caught up, persists across hook
  unmount/remount with the same conversationId, pill scrolls to marker rather
  than scrollHeight when marker is present.

## Related work

- IMPRV-029 — N new messages pill (current scroll target is scrollHeight; this
  ticket changes it to the read-cursor marker)
- IMPRV-028 — bottom-anchored transcript (the geometric model the scroll target
  rides on)
- IMPRV-005 — chat auto-scroll yanks scrollback (`wasNearBottomRef` pattern;
  cursor-advancement code attaches to the same scroll-state plumbing)
- FEAT-012 — resume conversation (the existing "Resumed here" divider is the
  precedent for divider shape and a11y treatment; resume flow loads
  ConversationRecord which would carry the new cursor field)
- BUG-006 — per-conversation `selfPeerId` on ConversationRecord (precedent for
  the additive-optional-field pattern this ticket reuses)
- FEAT-006 — chat timestamps (Divider component reused)
- A11Y-018 — chat transcript `role="log"` (the marker must use the same
  `role="presentation"` + `aria-hidden="true"` treatment as "Resumed here" so
  live-region announcements stay quiet)

## Working

Took the recommendation verbatim across four layers.

**Storage layer** (`src/core/storage.ts`):

- Added optional `lastReadMessageId?: string` to `ConversationRecord` (the
  additive-optional pattern from BUG-006's `selfPeerId?`).
- Extended `isConversationRecord` validator to accept the new field.
- **Added a focused helper `setLastReadMessageId(id, messageId)`** that does the
  read-modify-write in a SINGLE readwrite transaction. This was not in the
  original recommendation but turned out to be necessary: a naive caller-side
  `getConversation` → `upsertConversation` (two separate transactions) races
  with `appendMessage` (which also touches the row to refresh `lastActivityAt`),
  producing a stale-read / lost-update window where the appendMessage's
  serialized write overwrites my read's snapshot. A single tx serializes both,
  eliminating the race.

**Hook layer** (`src/hooks/useChatSession.ts`):

- Added `lastReadMessageId: string | null` state and `markRead(id)` callback to
  the `ChatSession` interface and the hook's return.
- `markRead` is forward-only via a setter that compares the new id's index
  against the current cursor's index via `messagesRef` (a ref-shadow of
  `messages` so the callback identity stays stable across renders — the
  ChatTranscript observer effect would otherwise churn on every messages
  update).
- Persist effect: `useEffect([lastReadMessageId, conversationId])` calls
  `storage.setLastReadMessageId`. Gated by `lastReadLoadedRef` to skip the
  load-time reflection (without this gate, the bind reading the persisted cursor
  → setState → effect would write back the same value it just read).
- `bindConversation` hydrates the cursor from the loaded `existing` record and
  flips the gate to true. Re-binding to a different conversation re-loads
  (including `null`) so the prior conversation's cursor doesn't strand in state.
- `reset()` clears the in-memory cursor and lowers the gate. Does NOT delete the
  persisted value — parity with how reset treats `messages` / `selfPeerId` (the
  persisted row is the source of truth across resets).

**Transcript layer** (`src/components/ChatTranscript.tsx`):

- Added `lastReadMessageId?: string | null` and
  `onMarkRead?: (id: string) => void` props.
- Computed `lastReadIndex` via `useMemo(() => messages.findIndex(...))`; unknown
  id resolves to `null` (deleted/stale cursor → no marker).
- Extended `TranscriptItem` discriminator with
  `{ kind: 'last-read'; key: 'last-read-marker' }`; `buildItems` inserts the
  marker AFTER the cursor message and ONLY when `i < messages.length - 1` (i.e.,
  at least one unread).
- Marker renders with the same `role="presentation"` + `aria-hidden="true"`
  - `<Divider>Last read</Divider>` shape as the FEAT-012 "Resumed here" divider.
    `data-testid="last-read-marker"` is the click handler's key.
- Single IntersectionObserver created in a useEffect with empty deps; per-bubble
  `<li>` registers via a ref-callback into a Map. `onMarkReadRef` shadows
  `onMarkRead` so the observer callback reads the latest prop without
  re-creating the observer.
- IntersectionObserver fires `onMarkRead(messageId)` for every intersecting
  entry, reading `dataset.messageId` from the bubble. The forward-only filter
  lives in the hook's `markRead`, not the component — the transcript forwards
  every intersection.
- `onNewMessagesClick` now queries `data-testid="last-read-marker"` in the
  scroll container and sets
  `scrollTop = markerOffsetTop + markerHeight - clientHeight` so the marker's
  bottom edge lands at the viewport's bottom edge. Falls back to `scrollHeight`
  when no marker is present (caught-up case).

**Wiring**:

- `Chat.tsx` accepts and forwards `lastReadMessageId` + `onMarkRead`.
- `Offerer.tsx` and `Joiner.tsx` pass `session.lastReadMessageId` and
  `session.markRead` through.
- `DesignSystemChat.tsx` (the no-op stub session for `/design-system/chat`)
  carries the cursor pair plus a local forward-only stub, pre-seeded at `ds-4`
  so reviewers see the marker on first paint.
- Test-side `ChatSession` stubs (`test-utils.tsx`, `Offerer.test.tsx`,
  `Joiner.test.tsx`, `Network.test.tsx`, `DesignSystem.tsx` showcase stub)
  gained the new pair.

**Test infrastructure**:

- Added a no-op `IntersectionObserver` polyfill to `src/test-setup.ts` (JSDOM
  does not implement it). Tests that need to drive intersection entries
  (`ChatTranscript.test.tsx`) install a richer per-file mock via `vi.stubGlobal`
  that transparently overrides the global no-op.

**Tests added**:

- `src/core/storage.test.ts`: round-trip the field, optional-when-absent,
  overwrite-in-place.
- `src/hooks/useChatSession.test.ts`: hook exposes cursor + markRead,
  forward-only semantics, unknown-id no-op, bind loads persisted cursor,
  markRead persists to storage, reset clears in-memory without deleting the
  persisted row.
- `src/components/ChatTranscript.test.tsx`: marker renders between cursor and
  unread, hidden when cursor is null / at newest / unknown, divider has the
  right A11Y-018 treatment, IntersectionObserver attaches per bubble, observer
  entries fire `onMarkRead`, pill scrolls to marker position when present, pill
  falls back to `scrollHeight` when no marker.

**Verification**: full suite 489/489. Typecheck, lint, format clean. Dev server
boots and serves `/design-system/chat`. Visual confirmation of the four outcome
states (marker between read and unread, hidden when caught up, pill
scroll-target lands the marker at the bottom of the viewport, cursor persists
across reload) is left to the human reviewer — I cannot drive a browser from
this environment.
