# FEAT-012: Resume conversation — persist transcripts locally, list past chats on Home, bilateral full-history sync on reconnect

**Status:** Resolved **Type:** Feature **Area:** new `src/core/storage.ts` +
`src/core/conversation.ts`, `src/hooks/useChatSession.ts`,
`src/hooks/useConversations.ts` (new), `src/screens/Home.tsx`,
`src/screens/Offerer.tsx`, `src/screens/Joiner.tsx`, `src/App.tsx`,
`src/core/url.ts`, `src/components/Chat.tsx` (plus tests)

## Summary

Make the chat survive a tab close. Today every connection is a one-shot — when
the data channel closes (peer disconnects, tab refresh, network hop), the
transcript is gone with the React tree. After this ticket:

1. **Each peer persists the running transcript to its own browser storage**
   (IndexedDB) under a generated **conversation ID**, indexed by that ID.
2. **The Home screen lists past conversations** with a "Resume" affordance —
   clicking one starts an Offerer flow whose invite URL carries the conversation
   ID.
3. **On reconnect, both peers exchange their full transcript** over the data
   channel. Each side merges the incoming history into its local store (deduping
   by message ID), so by the time the first new message lands, both browsers are
   looking at the same merged timeline regardless of which side has been offline
   longer — including the case where one peer has **no local history at all**
   (e.g. they're resuming on a fresh device or after clearing storage).

The marketing copy on Home that currently says _"no chat server, no accounts,
**no history**"_ changes — history is now a local, opt-in-by-default feature,
while the "no chat server, no accounts" promise stands.

## Customer value

- **Your chat survives a tab close.** Today, accidentally refreshing the tab or
  closing the laptop nukes the conversation. With this feature, reopening the
  app shows the past chats on Home; pick one, send a fresh invite, and the
  conversation resumes with full context for both peers.
- **You can pick up a chat tomorrow.** The "two friends sharing a code,
  chatting, going to lunch, coming back" use case currently requires not closing
  the tab. After this, the lunch break is fine — re-invite when you're back.
- **Even a fresh device works.** If your laptop dies and you re-open the app on
  your phone, you'll have no local history, but the peer who _does_ still have
  history sends you the transcript on reconnect, so the conversation continues
  with full context for both parties. (You only get history when your peer has
  it; a fresh-device-fresh-peer reconnect is a fresh chat.)
- **A conversation has a name and a memory.** Home turns from a single "Start a
  chat" button into a small launcher that remembers who you've spoken with — at
  least, your side of it.

## Business value

- **Lifts the app out of the "spike that works once" bucket.** A chat product
  that loses everything on refresh is hard to take seriously, even as a demo.
  Persistence + resume is one of the few features that visibly differentiate a
  finished chat tool from a toy.
- **Keeps the "no servers" promise intact.** Persistence is per-device, in the
  browser's own storage. We don't add a backend, an account, an email field, or
  a sync server. The serverless story is preserved verbatim.
- **Makes follow-on features cheap.** Once conversations have stable IDs and a
  local store, downstream features (delete chat, export transcript, search,
  per-conversation settings, peer-name labels) all sit on the same foundation.
  Several future tickets get noticeably smaller.
- **Demonstrates the wire format's first non-chat use.** Once a "history"
  payload type is shipped over the data channel, the protocol's extensibility
  story is no longer hypothetical.

## What a working feature delivers

### First-time chat (no resume) — same as today plus persistence

1. Alice opens the app and clicks **Start a chat**.
2. A new conversation is created locally with a fresh UUID; storage gets a stub
   record (`id`, `createdAt`, empty `messages`).
3. The invite URL Alice sends to Bob carries the conversation ID as well as the
   offer SDP (`#offer=<encoded>&conv=<uuid>`).
4. Bob opens the link. His side recognises the `conv` param, sees he has no
   local record for that ID, and creates one mirroring Alice's stub.
5. They chat. Each message is appended to both peers' local stores as it's sent
   / received.
6. Tab closes (deliberately or by accident). Local stores retain everything up
   to the last message.

### Resume flow — the new behaviour

7. Alice reopens the app. Home now lists past conversations — for each: a label
   (auto: `Chat from <date>`, editable), last activity timestamp, and a peek of
   the last message. Each row has a **Resume** button.
8. Alice clicks **Resume** on yesterday's chat. The flow enters the Offerer
   screen, the new invite URL she shares is tagged with the same conversation
   ID.
9. Bob opens the invite. He may have the conversation locally (Home recognised
   the ID) or not (fresh device / cleared storage). Either way, his side
   associates the new session with that conversation ID — creating a local
   record if missing.
10. Once the data channel opens, **each peer sends a `history` envelope**
    containing every message they have locally for that conversation. Each side
    merges the incoming history into its local store: messages with IDs the
    receiver already has are dropped (deduped); messages with new IDs are
    inserted in their original time order. The displayed transcript re-renders
    to show the unioned timeline.
11. After the exchange settles (both sides have either received a history
    payload or hit a short timeout), the chat surface shows a single thin
    **divider with the words "Resumed here"** above the first new message in
    this session. Old messages render above the divider, new ones below.
12. Either peer can send a message at any time; messages sent during the brief
    exchange window are appended on both sides as today (they're not part of the
    history payload, they're live).

### Renaming & housekeeping

13. The Home conversation list lets the user rename a conversation inline
    (pencil icon on the row). The name is local-only (each peer can pick their
    own; not synced over the wire in v1).
14. Each row has an overflow menu with **Delete chat** (destroys the local
    record for that conversation ID only; does not contact the peer). Deleted
    locally ≠ deleted on the peer's side.
15. A small "**Start a new chat**" button stays at the top of Home for the
    non-resume case.

## Acceptance criteria

### Storage layer

1. **Storage module.** A new `src/core/storage.ts` exposes a thin async wrapper
   around `indexedDB` for two object stores in a `chat` database:
   - `conversations`: keyed by `id` (UUID), shape
     `{ id, createdAt, lastActivityAt, label?: string }`.
   - `messages`: keyed by composite `[conversationId, id]`, shape
     `{ conversationId, id, from, text, at }`. Indexed on `conversationId` for
     range scans.
   - Public API: `listConversations()`, `getConversation(id)`,
     `upsertConversation(record)`, `deleteConversation(id)`,
     `listMessages(conversationId)`, `appendMessage(conversationId, message)`,
     `bulkInsertMessages(conversationId, messages)` (the merge path),
     `renameConversation(id, label)`.
   - No third-party IndexedDB library — the API surface is small enough to write
     directly with `indexedDB.open` + `IDBTransaction` wrappers. Roughly 80–120
     LOC, fully unit-testable with `fake-indexeddb` in the test env.

2. **Storage is per-browser, per-origin.** Reload of the same tab on the same
   origin restores conversations. Switching browsers or origins doesn't —
   explicitly out of scope (see "Out of scope" §1).

3. **Schema migrations.** v1 ships at `dbVersion = 1`. The `onupgradeneeded`
   handler creates both object stores fresh; no migrations to worry about yet.
   Future schema changes bump the version; design a small registry in
   `storage.ts` so additions don't require rewriting unrelated handlers. Don't
   ship a migration framework — just leave the seam.

4. **Decode safety.** Any record in storage that fails a shape check on read is
   **dropped from the returned list and logged once** with `console.warn`. Do
   not throw; do not crash Home; do not auto-delete the bad record (it may help
   diagnose the corruption). A future "storage debug" page is out of scope.

### Conversation model

5. **Conversation IDs are UUIDs**, generated with `crypto.randomUUID()` (the
   same call used for message IDs). Generated at the moment **Start a new chat**
   is clicked, _before_ the offer is created — so the conversation ID is stable
   across the offerer / answer-pending / connected states for that session.

6. **Conversation IDs travel in the invite URL.** A new hash param `conv`
   carries the conversation ID alongside the existing `offer` param:
   `#offer=<encoded>&conv=<uuid>`. The existing `buildOfferUrl` and
   `readHashParam` (`src/core/url.ts`) extend to accept the new param. The
   encoded SDP stays exactly as today (no embedding the conv ID inside the SDP);
   the conv ID is its own param so it can be read without decoding the SDP.

7. **Conversation IDs are echoed on the data channel.** As part of the new
   `history` envelope (AC #10), the sender includes the conversation ID. The
   receiver verifies it matches the conv ID it expected for the session;
   mismatched IDs drop the payload with `console.warn` and do not crash the
   session.

### Wire protocol additions

8. **Dependency: FEAT-010's wire envelope.** This feature _requires_ messages to
   carry an envelope with the sender's message ID — otherwise the receiver
   records its own ID and merge-by-ID falls apart (the same message would dedupe
   to two records). Two options:
   - **(Preferred) Land FEAT-010 first**, then this feature reuses its `chat`
     envelope verbatim.
   - **(Fallback) Land a minimal envelope inside this ticket**: a single
     `wire.ts` module that wraps every payload in
     `{ v: 1, t: 'chat' | 'history', id, ... }`. Receipts and clock-sync stay
     out of scope; only `chat` and the new `history` type are introduced.

   The default plan in this ticket is the fallback (introduce the envelope
   here), with a clear note in the implementer section that **if FEAT-010 has
   already landed**, the implementer should drop the duplicated envelope code
   and import from `src/core/wire.ts` instead.

9. **`history` envelope.** New envelope `t: 'history'` with shape:

   ```ts
   { v: 1, t: 'history', conversationId: string, messages: ChatMessage[], at: number }
   ```

   - `messages` is the sender's full local transcript for `conversationId` at
     the moment the channel opened (no streaming chunks in v1).
   - `at` is `Date.now()` on send (informational; not used for merge ordering).
   - The receiver's perspective in each `ChatMessage` is the _sender's_
     perspective: `from: 'me'` in the payload means "from the sender." The
     receiver flips it on merge — see AC #11.

10. **Sender fires `history` on `wireChannel.onopen`.** Immediately after the
    data channel transitions to open, each peer reads its locally-stored
    messages for the current `conversationId` and sends one `history` envelope.
    Empty arrays are sent too (so the peer can distinguish "they have nothing"
    from "they're still loading").

11. **Receiver merges.** On `history` receipt:
    - Verify `conversationId` matches the session's conv ID; warn and drop on
      mismatch.
    - Flip the perspective: each incoming `from: 'me'` becomes `from: 'them'`,
      each `from: 'them'` becomes `from: 'me'`.
    - Compute the set of incoming message IDs not already present locally.
      Insert those into both the live `messages` state (in time order by `at`)
      and IndexedDB via `bulkInsertMessages`.
    - Skip IDs already present locally (the dedupe rule). Conflict resolution if
      two records share an `id` but differ in body or timestamp: **trust
      local**, log a single `console.warn` per merge. (Not expected in practice;
      logged so we'd see it if our ID generation drifts.)
    - Update `conversation.lastActivityAt` to the max of (existing value, max
      `at` in the merged set).
    - Fire a `setMessages(merged)` so the UI re-renders the full transcript with
      the resumed messages above the divider.

12. **"Resumed here" divider** in `Chat.tsx`. Once a session has fired the
    history exchange and merged any incoming entries, the chat surface inserts a
    one-line centered divider between the last persisted message and the first
    message of the live session (regardless of whether that live message is sent
    or received). Wording: `Resumed here` in muted text, with horizontal rules
    on either side, styled consistently with FEAT-006's date headers. The
    divider is rendered exactly once per session and skipped on a fresh
    (never-persisted) conversation — first-time chats don't get a "Resumed here"
    header.

13. **Live sends/receives during the exchange window.** Messages sent or
    received in the brief window between channel-open and the merge completing
    are appended on both sides normally (no special buffering). They're
    guaranteed to be live (post-open) so they end up in both transcripts via
    normal `chat` envelope flow.

### Persistence integration into `useChatSession`

14. **Hook owns the conversation ID.** `useChatSession` gains a
    `conversationId: string` field and a new entry-point
    `startAsOfferer(conversationId)` (the existing signature changes from `()`
    to `(conversationId: string)`). The screen layer is responsible for choosing
    or generating the conversation ID before calling.

15. **Hook persists on every send and receive.** When `send` appends an outgoing
    message and when `onmessage` appends an incoming one, the hook also calls
    `storage.appendMessage(conversationId, message)`. Persistence is
    best-effort: a failed write logs `console.warn` and does not block the UI.

16. **Hook loads existing transcript on bind.** A new method
    `bindConversation(conversationId)` reads `listMessages(conversationId)` and
    seeds the `messages` state with it before the data channel even opens. This
    is what makes the resumed transcript visible _before_ the peer has connected
    (so the user immediately sees their history when they open the resume
    screen, not after the peer pastes their reply).

17. **`reset()` does not delete storage.** Today `reset()` clears `messages` in
    memory. After this ticket it also clears the in-memory `conversationId`. It
    explicitly does **not** call `deleteConversation` — the user's history
    survives the reset. Deletion is a separate explicit action from the Home
    list (AC #20).

### Home screen

18. **Home lists past conversations.** Below the existing "Start a chat" button,
    Home renders a list (or empty-state) of past conversations sorted by
    `lastActivityAt` desc. Each row shows:
    - Conversation label (auto: `Chat from <locale-short date>`;
      user-renameable, AC #21).
    - Relative time of last activity (`5 minutes ago`, `Yesterday`, `Mar 12`).
    - A peek of the last message (truncated to ~50 chars; if no messages, "_No
      messages yet_").
    - A **Resume** button (primary) that enters the Offerer flow with the
      conversation ID prefilled.
    - An overflow menu (`⋯`) with **Rename** and **Delete chat**.

19. **Empty state.** If `listConversations()` returns nothing, Home looks
    visually similar to today: the marketing copy, the "Start a chat" button,
    and no list. The current copy _"no chat server, no accounts, no history"_ is
    rewritten to _"no chat server, no accounts — your chats stay on your
    device"_ (or similar). New wording is settled in the PR; AC is that the word
    "no history" is removed because it's no longer true.

20. **Delete chat removes the local record.** Clicking Delete in the overflow
    menu pops a `window.confirm` ("Delete this chat from your device? This won't
    notify the other person.") and on confirm calls
    `storage.deleteConversation(id)` (which cascades to messages). The peer's
    copy is unaffected. The Home list re-renders without the row.

21. **Rename is inline.** Clicking Rename swaps the row's label into a small
    text input + Save/Cancel. Save calls
    `storage.renameConversation(id, newLabel)` and re-renders. Empty label
    resets to the auto label.

### Joiner flow (recipient of an invite)

22. **Joiner reads the conv ID from the URL.** The hash parser (`App.tsx` route
    detection + `readHashParam`) extracts the new `conv` param. If absent
    (back-compat for invites that pre-date this feature — unlikely in practice
    for a brand-new app, but still cheap to handle), Joiner generates a fresh
    conversation ID locally; this becomes a _new_ chat for both peers from then
    on.

23. **Joiner mirrors the conversation record on accept.** When the user clicks
    **Accept** on the Joiner preview, if `conv` exists and the joiner has no
    local record for it, create a stub conversation entry locally
    (`createdAt = now`, no label, empty `messages`). If a record already exists
    for that conv, bind it and load its messages (so the Joiner screen's
    post-accept transcript shows the prior history immediately).

24. **Joiner renders the prior history (if any).** The Joiner's chat surface,
    post-accept, shows the locally-known transcript before the data channel
    opens — same `bindConversation` path the Offerer uses (AC #16).

### Offerer flow

25. **`Start a new chat` (Home) → fresh conversation.** Clicking the existing
    primary button on Home generates a new conv ID and starts the Offerer flow
    against it. Behaves identically to today modulo the new conv ID embedded in
    the URL.

26. **`Resume` (Home row) → existing conversation.** Clicking Resume on a row
    starts the Offerer flow against that row's existing conv ID. The Offerer
    screen shows the loaded transcript immediately (AC #16, #24 parity).

### App / routing

27. **`#offer=…&conv=…`.** The hashchange listener already routes any hash
    containing `offer=` to the Joiner screen; it now additionally surfaces the
    `conv` param via the same `routeFromHash` helper. The `Joiner` route shape
    gains a `conversationId: string` field.

28. **Bookmark / refresh on Home.** Reloading Home re-reads the conversations
    list from storage. Conversation rows persist across reloads.

### Quality

29. **No regressions.** The existing offerer → joiner → connected → chat happy
    path continues to work — the new feature adds storage and a history envelope
    but the live chat flow itself is unchanged. All existing tests pass:
    `App.test.tsx`, `Offerer.test.tsx`, `Joiner.test.tsx`, `Chat.test.tsx`,
    `useChatSession.test.ts`, `rtc.test.ts`, design-system tests, dark-mode +
    typography tests.

30. **New tests:**
    - `src/core/storage.test.ts` — round-trip CRUD on `conversations` and
      `messages`; dedupe on `bulkInsertMessages` keyed by
      `[conversationId, id]`; deleting a conversation cascades to its messages;
      malformed records on read are dropped with a warn. Uses `fake-indexeddb`
      in the test env.
    - `src/hooks/useChatSession.test.ts` — extend: `bindConversation` seeds
      messages; `appendMessage` is called on send and on receive; `reset()` does
      not call `deleteConversation`; merge dedupes by ID; perspective flip on
      merge.
    - `src/hooks/useConversations.test.ts` — new: `useConversations()` returns
      the storage list and reacts to add/delete/rename.
    - `src/screens/Home.test.tsx` — new: empty state renders the existing copy
      without "no history"; conversation rows render with label, relative time,
      peek; Resume routes to Offerer with the conv ID; Delete with confirm calls
      storage; Rename inline edits.
    - `src/screens/Offerer.test.tsx` and `Joiner.test.tsx` — extend: conv ID is
      included in the invite URL; conv ID extracted from incoming URL;
      resumed-transcript renders before channel open; "Resumed here" divider
      renders for resumed sessions and not for fresh ones.
    - `src/core/wire.test.ts` — if the fallback envelope ships here (FEAT-010
      not yet landed): round-trip for `chat` and `history` types; malformed
      input dropped; mismatched conv ID dropped.

31. **`npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` all
    pass.**

## Out of scope (v1)

1. **Cross-device / cross-browser sync.** Persistence is per-browser,
   per-origin. Switching from Chrome to Firefox, or laptop to phone, gives you
   no history on the new device (the peer fills it in if they have it). True
   multi-device sync requires an account + a server and is explicitly off the
   table.
2. **Encryption at rest.** IndexedDB is plain text on disk. Anyone with
   file-system access to the browser profile can read the messages. A follow-up
   could wrap entries in symmetric encryption keyed by a user-supplied
   passphrase; not in this ticket.
3. **Read receipts, typing indicators, online presence.** Resume is about
   history, not real-time signals.
4. **Conflict resolution beyond "trust local."** If by some bug or future
   protocol change two peers' records diverge for the same message ID, we log
   and trust local. No CRDT, no last-writer-wins, no manual reconciliation UI.
5. **Streaming / chunked history.** A peer's transcript ships as a single
   `history` envelope. For a multi-megabyte conversation this could be large,
   but RTCDataChannel's default `maxMessageSize` (a few KB to ~64 KB on some
   implementations) may force a split. v1 ignores this — call out in implementer
   notes as a known limit; chunking is a follow-up ticket.
6. **Auto-reconnect on transient disconnects.** A dropped data channel still
   requires the user to manually re-invite from Home. No background reconnection
   attempts. The paste-based signaling model doesn't support automatic
   re-establishment without a live signaling channel, which is itself out of
   scope.
7. **Per-conversation settings** (dark mode override, custom font size,
   notifications). Conversation records carry `label` only.
8. **Conversation search / filter** on Home. Long lists scroll. A search box is
   a follow-up if user feedback warrants it.
9. **Storage quota handling.** When IndexedDB hits the browser's quota, writes
   start failing — we log and ignore. A "storage almost full" UI is a follow-up.
10. **Migration of pre-feature chats.** Anything that happened before this
    ticket merged has no conversation ID and was never persisted; there's
    nothing to migrate. Marketing copy doesn't promise recovery of pre-merge
    chats.
11. **Exporting / importing transcripts.** FEAT-011 (copy to clipboard as
    markdown) covers the export-on-demand case. A file-based export or an
    import-into-a-new-conversation is out of scope for now.
12. **Showing peer device differences.** If the peer is on a fresh device with
    no history, we just send our transcript and don't surface "your peer is
    starting fresh" in the UI. No status line, no warning, no opt-out — just the
    merge runs as designed and they receive our history. A "your peer has no
    record of this chat" indicator could be added if user testing shows
    confusion.
13. **A "delete on both sides" gesture.** Local delete is local-only. A
    networked delete-for-everyone is a non-trivial trust feature (does the peer
    have to comply? what about pending sync?) and isn't worth shipping until we
    know it's needed.

## Open questions

- **Conversation label at creation time.** Options:
  - (a) **Auto-label** with `Chat from <locale-short date>`; user can rename
    later via the overflow menu.
  - (b) **Prompt the user for a name** the first time they click "Start a chat"
    (or accept an invite).
  - (c) **Derive the label from the peer's first message** (e.g.
    `Chat with someone who said "hey"`).
  - **Recommendation:** (a). Prompting is a friction point at the start of every
    chat and the user often doesn't know who the peer is yet. Auto-label +
    rename matches WhatsApp/iMessage's behavior for unnamed group chats; rename
    is one click away.

- **Label-sync between peers.** Should the conversation's user-chosen label be
  sent over the wire as part of the `history` envelope (or a separate one-shot)?
  - (a) **No** — each peer's label is private to that peer. Simple, no protocol
    surface.
  - (b) **Yes** — exchange labels on connect, last-write-wins or
    first-write-wins.
  - **Recommendation:** (a) for v1. Names are private. If a user wants the peer
    to see a name, they can text them.

- **Storage quota & oldest-first GC.** Browsers cap origin storage at ~50%–60%
  of free disk; an active chatter with images (we don't have images, but still)
  could in principle hit it. Options:
  - (a) **Ignore** — let writes fail and log.
  - (b) **Soft cap** — when total stored messages exceed N (e.g. 10,000) per
    conversation, drop the oldest 1,000.
  - (c) **Surface a UI** to manage storage.
  - **Recommendation:** (a) for v1. We don't have image support and 10k text
    messages is well under any browser quota. Revisit if a user reports it.

- **What if the user clicks "Start a new chat" while already on a session?**
  Today the Home button is only visible from Home. After this ticket, the Home
  screen is reachable via Cancel. Should the in-session chat surface a
  back-to-Home shortcut that ends the current session and goes to the list?
  **Recommendation:** out of scope for this ticket — Cancel already does that.

- **Cross-conversation receipts (when FEAT-010 lands).** If FEAT-010's `receipt`
  envelope ships, should receipts include `conversationId`? **Recommendation:**
  yes — every wire payload that touches a specific conversation should be
  self-identifying. Coordinate with the FEAT-010 implementer if this ticket
  lands first.

- **Marketing copy on Home.** Current line:

  > _Real-time chat directly between your browsers — no chat server, no
  > accounts, no history._

  Proposed replacement (subject to PR-time bikeshedding):

  > _Real-time chat directly between your browsers — no chat server, no
  > accounts. Your chats stay on your device; nothing is uploaded._

  **Recommendation:** something along those lines. The "no history" promise was
  a side-effect of being a one-shot demo, not a privacy stance — replacing it
  with the actual privacy stance ("nothing is uploaded") strengthens the pitch
  rather than weakening it.

- **`history` envelope size and `RTCDataChannel.maxMessageSize`.** A megabyte of
  chat text fits in tens of thousands of typical messages, and
  `RTCDataChannel.send` will reject payloads larger than ~64 KB on some
  implementations (browser-dependent). Options:
  - (a) **Ignore until it bites** — log a warning if `send` throws.
  - (b) **Chunk** the history into multiple envelopes (e.g. 100 messages per
    envelope) with a final "end" marker.
  - **Recommendation:** (a) for v1. The implementer should add a single
    try/catch around the history send and log + drop on failure, so a giant
    transcript at worst silently fails to sync — not crash. Chunking is a
    follow-up.

- **"Resumed here" divider vs date headers (FEAT-006).** If the last message was
  yesterday and the resume happens today, FEAT-006 already inserts a date header
  above today's first message. Do we then ALSO show a "Resumed here" divider, or
  does the date header subsume the role?
  - **Recommendation:** keep both. They convey different information — the date
    header is about local-day rollover; the divider is about _which session this
    message belongs to_. They'll occasionally co-occur and that's fine.

## Notes for the implementer

- **`fake-indexeddb` as a test dep.** Add `fake-indexeddb` to `devDependencies`
  and import it in `test-setup.ts` so all tests run against an in-memory IDB. No
  need for `jsdom-idb-mock`; `fake-indexeddb/auto` is the standard choice.

- **Order of work.**
  1. `src/core/storage.ts` + `src/core/storage.test.ts` (the data layer in
     isolation).
  2. `src/core/url.ts` extension to support `&conv=`; `src/core/wire.ts` if
     FEAT-010 hasn't landed (chat + history envelopes only; defer receipts/sync
     to FEAT-010).
  3. `useChatSession` — accept `conversationId`, persist on send/receive, expose
     `bindConversation`, send/merge `history` on open.
  4. `useConversations` hook + Home list UI + Home empty-state copy update.
  5. Offerer / Joiner: thread the conv ID through; load transcript on mount.
  6. `Chat.tsx`: "Resumed here" divider.
  7. Tests at each layer; smoke-test the resume flow end-to-end.

- **Routing wiring.** `routeFromHash` adds reading `conv` alongside `offer`. The
  Joiner route shape becomes
  `{ kind: 'joiner'; offerCode: string; conversationId: string | null }`. The
  Offerer route currently has no payload — keep it that way but rely on
  `useChatSession.conversationId` being seeded from a parent state set by Home
  before navigating to the Offerer route. (Avoid stuffing the conv ID into the
  route since the URL doesn't have it yet on the inviter side — it's only
  injected into the URL the inviter _generates_.)

- **Seeding messages before the data channel opens.** The Offerer screen flow
  today is "Start a new chat" → gathering → awaiting-answer (with invite URL
  displayed). After this ticket, the Offerer screen needs to also render the
  previously-stored transcript during awaiting-answer so the user sees what
  they're about to resume. The same applies to Joiner post-accept. Both screens
  call `bindConversation` during `useEffect` on mount (or as part of the
  existing "start" call).

- **Message perspective on persistence.** Each peer stores messages with their
  _own_ perspective (`from: 'me' | 'them'`). When you send `history` over the
  wire, the receiver MUST flip the perspective on merge. Easy bug: forget to
  flip and every message in resumed-history shows up as if you'd sent it. Cover
  this explicitly in unit tests.

- **Per-conversation message ordering.** `at` is the sender's local clock at
  send time. When merging, sort by `at`. There's no clock-sync (FEAT-010) here,
  so two peers' `at` values for messages sent in the same minute may interleave
  oddly. Acceptable for v1 — the UI is still recognisable. If FEAT-010 has
  landed, the merge can optionally apply the peer-offset correction to `at`
  before sorting; flag this as an enhancement if so.

- **Race: history payload arrives before bind has finished loading.**
  `bindConversation` is async (IDB read). The `wireChannel.onopen` handler fires
  when the channel opens, which can be before or after `bindConversation`'s read
  resolves. Solution: `useChatSession` keeps a `bindPromise` and
  `wireChannel.onmessage` for `history` envelopes awaits it before merging.
  Otherwise the merge can stomp on a still-loading local set.

- **Don't `JSON.stringify` an enormous transcript on every render.** The
  `history` envelope is built once on `onopen` and sent. Don't accidentally
  serialize the whole transcript on every state update — keep the send path
  inside the open handler.

- **Hash routing & `clearHash`.** Today the joiner-side hash is scrubbed once
  Joiner has captured the offer in component state. Continue to do that —
  including the `conv` param — so a refresh doesn't try to re-enter the joiner
  flow on a stale URL. The conv ID lives in the joiner's component state from
  then on.

- **Same-tab hashchange (peer pastes URL into running tab).** Already works for
  `#offer=…`; verify it still works with `&conv=` appended. The hashchange
  listener's existing branch for joiner already covers this.

- **Storage migration safety.** Even though we ship at v1 with a fresh schema,
  design `storage.ts` so a future schema bump doesn't have to wipe data. Keep
  the upgrade handler small and additive (`if (oldVersion < 2) { ... }`-style).

- **`useConversations` hook subscribes to changes.** Renaming or deleting a
  conversation should refresh the Home list without a manual reload. Options:
  - (a) Re-list on a `storage-change` event the hook emits after every mutation.
  - (b) `BroadcastChannel` so multiple tabs of the app pick up changes too.
  - **Recommendation:** (a) for v1, single-tab. Multi-tab is a fine follow-up
    but not required.

- **Tests for `bindConversation`.** Seed `fake-indexeddb` with a couple of
  messages, mount the hook with a conv ID, assert `messages` populates before
  any wire activity.

- **`crypto.randomUUID` parity.** Both message IDs and conversation IDs use the
  same generator; tests in jsdom may need to polyfill `crypto.randomUUID`
  (already used in `useChatSession`, so the existing test setup already supports
  it).

- **Confirm dialog accessibility.** `window.confirm` is a quick fix for Delete;
  if the design system grows a real confirm dialog primitive (FEAT-007 doesn't
  yet), swap to that in a follow-up. Don't grow the design system inside this
  ticket.

## Coordination with prior tickets

- **FEAT-006 (date headers and per-message timestamps):** the "Resumed here"
  divider sits _between_ messages just like the date header does, and both can
  co-occur — date header for "today" above the first new message, divider above
  the first new message of this session. Verify both render correctly together.
- **FEAT-007 (design system):** the new Home list rows reuse `Heading`,
  `Callout`, `Button` primitives; the overflow menu is the first
  non-design-system widget in the app — keep it minimal and file a follow-up if
  it grows into a real `Menu` primitive. The "Resumed here" divider uses the
  same muted-text + horizontal-rule pattern as the date header from FEAT-006.
- **FEAT-008 (polite peer):** when the polite-defer fires mid-handshake, the
  conversation ID must travel through the swap. The polite peer abandons its own
  offer; if the _pasted_ offer also carries a `&conv=`, the polite peer should
  adopt that conv ID for the resumed session. Coordinate: the polite-defer path
  reads `conv` from the pasted URL/code if present.
- **FEAT-010 (network telemetry / wire envelope):** **hard dependency on the
  envelope and message-ID propagation.** If FEAT-010 ships first, this ticket
  _imports_ the existing `wire.ts`; if it ships second, this ticket lands a
  minimal envelope (`chat` + `history` only) and FEAT-010 extends it with
  `sync-probe` / `sync-ack` / `receipt`. The implementer should check which
  order they're landing in before starting on `wire.ts` to avoid duplicated
  code.
- **FEAT-011 (copy conversation):** the copy-to-clipboard transcript export
  should work on a _resumed_ conversation just as it does on a live one — it
  operates over `messages` in the hook regardless of how those messages got
  there. Verify the copy includes resumed history above the "Resumed here"
  divider.
- **BUG-002 / BUG-005 (pre-connect vs post-connect state machine):** persistence
  must be tolerant of an `awaiting-answer` → `closed` (cancelled) transition. A
  user who starts a chat, generates an invite URL, never connects, and closes
  the tab leaves behind an empty stub conversation. Acceptable; the Home row
  shows "_No messages yet_" and the user can delete it. Don't auto-cleanup empty
  stubs in this ticket — it'd surprise a user who deliberately created a chat in
  advance. _(Superseded by IMPRV-011: empty stubs are now culled on the next
  Home mount.)_

## Working notes

Landed with the full plan:

- `src/core/storage.ts` (+ `storage.test.ts`) — IndexedDB wrapper, two object
  stores (`conversations`, `messages`), composite `[conversationId, id]` keys,
  decode-safety warns, cascading `deleteConversation`. `fake-indexeddb/auto`
  wired into `src/test-setup.ts` for jsdom.
- `src/core/wire.ts` — extended FEAT-010's envelope union with a `history`
  variant (`conversationId` + `HistoryMessage[]`). `wire.test.ts` covers the
  round-trip and malformed-entry pruning paths.
- `src/core/url.ts` — `buildOfferUrl` takes an optional `conversationId` that
  appends `&conv=…`; `readHashParam` already handles the new param.
- `src/hooks/useChatSession.ts` — `conversationId`, `bindConversation(id)`,
  `startAsOfferer(id)` / `startAsAnswerer(offerCode, id)`, `hasResumed` latch,
  best-effort persistence in `send` + `onmessage`, history exchange on `onopen`,
  receiver merges (flips perspective, dedupes by id, awaits bind promise).
- `src/hooks/useConversations.ts` (+ test) — observable list with `refresh`,
  `rename`, `remove`; broadcasts via a tiny in-module pub/sub.
- `src/screens/Home.tsx` — past-chats section with row label/peek/relative time,
  Resume / Rename inline / Delete (window.confirm), copy update drops "no
  history".
- `src/screens/Offerer.tsx` / `src/screens/Joiner.tsx` — thread the conv id,
  bind on mount, embed `&conv=` in the invite URL, fall back to a fresh uuid on
  pre-FEAT-012 invites.
- `src/components/Chat.tsx` — "Resumed here" divider above the first live
  message when `hasResumed` latches; coexists with FEAT-006 date headers.
- `src/App.tsx` — `routeFromHash` surfaces the new `conv` hash param into the
  Joiner route; Home owns id generation for new and resumed chats.

Tests: 24 files / 301 cases pass. `npm run lint`, `npm run typecheck`,
`npm run test`, `npm run build` all green.
