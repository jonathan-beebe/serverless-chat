---
id: ARCH-001
type: architecture
status: open
created: 2026-05-24
---

# ARCH-001: Route the chat surface so conversations are addressable

## Problem

The chat surface isn't reachable by URL. In `src/App.tsx:10–19` the `Route`
union has `offerer` and `joiner` variants, but only `joiner` lives in the hash
(`#offer=...&conv=...`); the `offerer` route — which hosts the chat UI for the
party that started the conversation — is set imperatively when `Home` calls
`onStart(conversationId)` (`src/App.tsx:74`, `src/screens/Home.tsx:426`). The
URL stays empty.

Consequences observable today:

- A live chat has no URL. The user can't bookmark it, share it, paste it into
  another tab, or use the browser's back/forward to return to it.
- Cross-route navigation back to the empty hash always falls through to Home,
  even when the live session is still running. This is BUG-008 (open, inbox) —
  symptom of the same root cause.
- "Resume" in the past-chats list (`src/screens/Home.tsx:304–305`) has to be a
  JS-driven `<Button>` because there's no URL to point at. That forecloses on
  link-affordance fixes for several adjacent tickets (A11Y-030, A11Y-031,
  A11Y-036).
- The hashchange listener at `src/App.tsx:43–52` and the `goHome` reset path at
  `src/App.tsx:64–67` treat route and session as independent state, so any route
  change away from the chat surface silently strands an active session.

## Outcome

- Each conversation is reachable at a stable URL. Bookmarking it, copying it via
  right-click → "Copy Link Address", pasting it into a fresh tab, and reloading
  the current tab all return the user to the same conversation (or to the "not
  found" state described below).
- From a live chat, navigating to another route (e.g. `#network`) and then back
  lands on the live chat with the session intact. BUG-008 is fully resolved.
- A joiner who clicks an invite link ends up on the same URL the offerer would
  resume into; the invite-only parameter falls away from the URL once the
  session has captured it, leaving the canonical conversation URL behind.
- The past-chats "Resume" affordance behaves as an honest link: Cmd/Ctrl-click
  opens the conversation in a new tab, middle-click opens in a new tab, "Copy
  Link Address" yields the conversation URL, the browser back stack treats it as
  a navigation.
- Navigating to a conversation URL that has no live session and no persisted
  record renders a clear empty state with a path back to home — not a silent
  redirect, not a fresh offerer minted from the unknown id.
- The Home past-chats list visually marks whichever conversation is currently
  live, so a user who navigated away mid-session can find their way back into it
  from the list.

## Why it matters

The current architecture treats route and session as independent state, and
treats the chat surface as URL-invisible. That gap is the root cause of BUG-008
and forecloses on a family of link-affordance improvements that other tickets
keep bumping into (A11Y-030's "Resume" buttons, A11Y-031 and A11Y-036's "Back to
home" affordances). Closing the gap makes the user's mental model match the
system's truth — URLs name what you're looking at — and dissolves several
adjacent open tickets rather than papering over each in isolation.

The work is also a precondition for any feature that wants to deep-link into a
conversation: shared transcripts, support links into a specific chat, OS-level
"recent conversations" surfaces, etc.

## Discovery notes

The original reporter expressed preferences worth carrying forward (advisory,
not binding):

- **URL shape preference: `#conversation/<id>`** — matches the existing
  `conversationId` domain term in the code. Alternates considered: `#c/<id>`
  (short), `#chat/<id>` (self-documenting). Implementer picks based on what
  reads best alongside the existing `#network` and `#design-system` routes.
- **Unknown-id behavior preference: explicit empty / "not found" state with a
  link back to home.** Alternates rejected: silent redirect (smoother but hides
  the broken bookmark), treat as fresh offerer (creates ghost conversations from
  typos / stale links).
- **Joiner unification preference: yes.** The joiner entry currently lives at
  `#offer=...&conv=...` (`src/App.tsx:21–32`). Preference is for the joiner URL
  to settle to `#conversation/<id>` once the offer has been captured, so the
  joiner and offerer end up on the same canonical URL. The
  invite-parameter-bearing form would still be the entry point that the offerer
  shares.

Other discovery context for the maker:

- The `joiner` URL is hash-scrubbed today by `src/App.tsx:60–62` (BUG-001's
  contract: the offer is captured into component state, the URL is cleared so
  refresh doesn't re-enter the joiner flow with a stale offer). The new design
  needs to preserve that "don't re-enter on refresh" invariant while still
  arriving at a canonical conversation URL.
- `useChatSession` exposes session lifecycle but not the `conversationId` or the
  offerer-vs-joiner side directly today; both are passed into `Offerer` /
  `Joiner` as props from `App`. A "single chat route" component will need to
  either own that information itself (driven by URL params) or surface it
  through the hook.
- Past-chats Resume currently calls `onStart(c.id)`
  (`src/screens/Home.tsx:426`), which sets `route` directly with no URL
  transition. Under real routing this becomes a normal link navigation; nothing
  else in Home needs to know about session state.
- This work supersedes BUG-008 and reshapes the implementation paths for
  A11Y-031 and A11Y-036 (both "Back to home" affordances become honest links
  whose destinations come from the URL model rather than from a JS hash
  mutation). A11Y-030's "Resume" accessible-name fix is still valid but the
  underlying element changes from `<Button>` to `<a>`; the implementer should
  coordinate.
- The Home "live conversation" badge implied by the OUTCOME is small but carries
  a UX question (chip wording, position, dark-mode token). Could be split into a
  sibling FEAT if it grows; in scope here by default.

## Related work

- BUG-008 (abandoned, superseded by this ticket) — the symptom that surfaced the
  routing gap
- A11Y-031 (open, inbox) — Network EmptyState "Back to home" link; revisit after
  this lands
- A11Y-036 (open, inbox) — Network header Back affordance; revisit after this
  lands
- A11Y-030 (open, inbox) — Resume / More-actions accessible names; underlying
  element changes from `<Button>` to `<a>` once Resume is a real link
- FEAT-012 (resolved) — conversation IDs are App-owned and forwarded into
  Offerer; this work makes those ids addressable
- FEAT-010 (resolved) — introduced the `#network` route where BUG-008 was first
  noticed
- BUG-001 (resolved) — established the hashchange listener as the route
  authority; the hash-scrub invariant for joiner needs to survive this work
- BUG-005 (resolved) — session-state-drives-screen precedent
