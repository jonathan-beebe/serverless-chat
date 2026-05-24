# A11Y-012: Connection state transitions are not announced to screen readers

**Status:** Resolved (commit 685d5f3) **WCAG:** 4.1.3 Status Messages (Level AA)
**Severity:** High **Location:** `src/screens/Offerer.tsx` (lines 62-75, 27-42),
`src/screens/Joiner.tsx` (lines 81-93, 21-36)

## Problem

Both Offerer and Joiner conditionally render a
`<p role="status">…(gathering network candidates)…</p>` while
`session.state === 'gathering'`. As soon as the state moves on, that node is
removed from the DOM and replaced by other UI. There is no persistent live
region tracking the negotiation progress.

Offerer transitions:

1. `gathering` — status announced ✅
2. invite URL CopyBox appears — no announcement
3. user submits answer → `connecting` — no announcement
4. `connected` — the whole layout swaps to the Chat view; the new
   `<h1>Connected</h1>` is neither focused nor in a live region, so AT users
   hear nothing

Joiner has the same shape (gathering → reply-code CopyBox → connecting →
connected).

WebRTC negotiation can take several seconds. A screen-reader user has no idea
what is happening, when their reply code is ready to share, when the remote peer
has accepted, or when they can start typing.

## Intended behavior

Screen-reader users should hear meaningful, timely updates as the session moves
between gathering, awaiting peer, connecting, connected, and failed states —
without needing to navigate around or refresh focus to "discover" the change.

## Suggested fix

Add a single persistent `role="status" aria-live="polite"` region (one per
screen) whose text reflects the current session state. Keep it in the DOM across
state changes so screen readers track updates rather than treating each
transition as a new live region.

```tsx
// inside Offerer / Joiner, above the conditional blocks
<p role="status" aria-live="polite" className="sr-only">
  {statusMessage(session.state, !!session.encodedLocal)}
</p>
```

Suggested messages:

| state             | Offerer                                      | Joiner                                          |
| ----------------- | -------------------------------------------- | ----------------------------------------------- |
| `gathering`       | Preparing your invite.                       | Preparing your reply code.                      |
| `awaiting-answer` | Invite ready — send the link to your friend. | Reply code ready — send it back to your friend. |
| `connecting`      | Connecting to your friend.                   | Connecting to your friend.                      |
| `connected`       | Connected. You can start chatting.           | Connected. You can start chatting.              |
| `failed`          | Connection failed.                           | Connection failed.                              |

For the `connected` transition specifically, also consider focusing the chat
input (A11Y-005 covers focus management).

The visible "gathering…" paragraph can stay if desired, but should drop its
`role="status"` since the persistent region now owns announcements (otherwise
the same message risks being announced twice).

## Working notes

- Confirmed the issue is real:
  - `src/screens/Offerer.tsx` line 72-76 renders
    `<p role="status">Preparing invite (gathering network candidates)…</p>` only
    while `session.state === 'gathering'`. The node is unmounted on every
    subsequent transition (`awaiting-answer`, `connecting`), and the `connected`
    branch swaps the entire layout with no live region — exactly matching the
    ticket's description.
  - `src/screens/Joiner.tsx` line 103-107 has the same shape.
- `ConnectionState` is exported from `src/core/rtc.ts` as
  `'idle' | 'gathering' | 'awaiting-answer' | 'connecting' | 'connected' | 'failed'`,
  so we can map cleanly across all five user-visible states.
- Applied the suggested fix:
  - Added a `statusMessage(state, hasLocal)` helper inside each screen (messages
    differ per side — "invite" vs "reply code" wording). The `hasLocal` flag
    covers the practical case where ICE gathering completes very fast and
    `state` is still nominally `gathering` but the local SDP is already encoded
    — we want to announce "ready" rather than "preparing".
  - Hoisted a persistent
    `<p role="status" aria-live="polite" className="sr-only">` element into a
    `liveStatus` variable per screen, rendered as the first child of every
    returned `<main>`. Within the long-lived "invite"/"reply" branch the same
    DOM node is reused across `gathering → awaiting-answer → connecting`, so the
    live region tracks updates as the ticket requested. The
    `connecting → connected` swap remounts the region inside the new `<main>`;
    AT announce live regions with content on insertion, so the "Connected. You
    can start chatting." update is still spoken.
  - Removed `role="status"` from the now-redundant visible "Preparing
    invite/reply (gathering network candidates)…" paragraph (kept as a visible
    cue for sighted users) to avoid duplicate announcements, per the ticket's
    note.
- No test changes needed:
  - The existing `App.test.tsx` already exercises Joiner routing and focus
    management; it does not (and shouldn't) assert specific live-region text.
    The added regions don't change rendered roles or focusable elements, so no
    test breakage.
  - `vitest run` → 45/45 pass. `npm run lint`, `npm run format:check`, and
    `tsc --noEmit` all clean.
- Followed prior resolution patterns (A11Y-005, A11Y-008): minimal, screen-local
  change; no new shared module; reuse of `sr-only` and `role=status` /
  `aria-live=polite` idioms already present in `CopyBox`.
