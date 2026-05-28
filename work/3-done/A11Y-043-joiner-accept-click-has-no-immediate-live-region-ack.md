---
id: A11Y-043
type: a11y
status: resolved
created: 2026-05-28
---

# A11Y-043: joiner accept click has no immediate live-region acknowledgement

## Problem

In `src/screens/Joiner.tsx:48-66, 84-95, 119-120`, the screen's `LiveRegion` is
fed by `statusMessage(state, hasLocal, branch)`. When the user clicks "Accept"
on the invite branch, `setAccepted(true)` flips the rendered branch to `reply`,
but the live region call still computes against the OLD branch this render
(branch is recomputed but the kind passed in is `liveBranchKind`, which on the
`invite` path returns `''`). More importantly, `statusMessage` explicitly
returns the empty string when `branch === 'invite'`, and the session does not
transition to `'gathering'` synchronously — there is a measurable gap between
the click and the first non-empty live-region announcement ("Preparing your
reply code."). During that gap a screen-reader user has no confirmation that
their Accept click did anything; the button itself disappears with the branch
swap, leaving them suddenly on an unannounced screen.

## Outcome

A screen-reader user who clicks "Accept" on the Joiner invite branch hears an
immediate, deterministic announcement that the action was received and the next
state is being prepared, without depending on the asynchronous WebRTC state
transition timing.

## Why it matters

WCAG 4.1.3 (Status Messages) requires that status messages be programmatically
determined so users can perceive them without receiving focus. The current shape
relies entirely on the session's `gathering` transition to produce the first
announcement, which is non-deterministic in timing (ICE gathering may take tens
of ms on a fast network or several hundred ms on a constrained one). The Accept
click is the most consequential interaction on the entire screen for the joiner
— it commits them to opening a peer-to-peer connection. Silence after that
click, however briefly, is a poor experience for blind and low-vision users
especially because the visual branch swap they cannot see has already happened.

## Discovery notes

The `statusMessage` function is shared between the invite, reply, and connected
branches via the `branch` argument. The cleanest path is to (a) extend
`statusMessage` to recognise an "accepted but session hasn't transitioned yet"
state, or (b) seed the live region with an immediate "Accepting invite,
preparing reply code…" string at the click site (in `onAccept`) and let the
natural `statusMessage` flow take over once the session reaches `gathering`.
Option (b) keeps `statusMessage` pure but introduces a parallel state. Either is
workable; the maker should pick.

## Recommendation

Inside `onAccept` (line 84-95), call setState into a new local "just accepted"
sentinel and route the LiveRegion through a thin wrapper that prefers that
sentinel over `statusMessage` for one or two frames, OR extend `statusMessage`
with a fourth argument like `justAccepted: boolean` and return "Accepting
invite. Preparing your reply code." when true. Either path: the goal is that
within one React commit after the Accept click, the live region carries a
non-empty, action-acknowledging message — independent of how fast `gathering`
arrives.

## Related work

- A11Y-012 (connection state not announced — established the LiveRegion +
  statusMessage pattern this ticket extends)
- BUG-007 (joiner state leakage from prior offerer flow — the branch detection
  logic this ticket reads from)

## Working

- `statusMessage` returned `''` for the default case, so the live region was
  empty between the click that flipped `accepted` → `reply` branch and the async
  session transition into `gathering`.
- Picked option (a) from the discovery notes — extended `statusMessage` to fill
  the default-case gap. When `branch === 'reply'` and no specific state matches,
  return `"Accepting invite. Preparing your reply code."` The natural
  `gathering` / `awaiting-answer` / `connecting` cases take over as soon as the
  session transitions.
- Avoided adding a `justAccepted` parameter or a separate seeded state — the
  branch already encodes "the user has clicked Accept," and the default case is
  the right place to put the fallback.
- Added a regression test that simulates the click on an idle session and
  asserts the live region now reads "Accepting invite. Preparing your reply
  code." (it was empty before the fix).
- The pre-existing BUG-007 test "does NOT announce 'Reply code ready' on the
  invite branch" still passes — the new default only fires on the reply branch.
- Full suite: 505/505 green (one new test).
