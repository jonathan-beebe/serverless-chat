# IMPRV-010: "Connection lost" CTA is labelled "Start a new chat" but should route home to surface the conversation list

**Status:** Resolved **Severity:** Low **Location:**
`src/screens/Offerer.tsx:227-229` and `src/screens/Joiner.tsx:124-126` — the
single primary `<Button>` on the "Connection lost" branch of each screen.

## Problem

Both Offerer and Joiner render an identical post-drop view when the session
moves to `closed`:

```tsx
<ScreenContainer label="Connection lost" …>
  {liveStatus}
  <Heading level={1}>Connection lost</Heading>
  <p>The chat ended. Your friend may have closed the tab, or the network dropped.</p>
  <Button ref={restartRef} variant="primary" size="lg" onClick={onCancel}>
    Start a new chat
  </Button>
</ScreenContainer>
```

`onCancel` is wired to `App.goHome` (`src/App.tsx:64-67`), which resets the
session and routes back to the Home screen — the screen that already lists every
past conversation. The action is correct. **The label is misleading.**

"Start a new chat" reads like a destructive / fresh-start affordance: the user
reasonably expects to be dropped straight into a new offer flow with no way back
to their prior chats. In reality they land on Home, where:

- The conversation they just lost is the top row of "Past chats" (FEAT-012
  persists transcripts to IndexedDB across reconnects), with a working
  **Resume** button.
- Every other past chat is also listed for resume / rename / delete.

Hiding the conversation list behind a button labelled "Start a new chat" is a
discoverability tax exactly when the user most needs the list — to re-resume the
chat they just lost. The fix is a label/intent change, not a routing change.

## Intended behavior

The "Connection lost" view shows a single primary CTA whose label communicates
"go back to the conversation list":

- **Label:** `Return home` (or `Back to chats` — see "Naming" below).
- **Action:** unchanged — calls `onCancel` (i.e. `App.goHome`), which resets the
  session and routes to Home.
- **Visual treatment:** unchanged — `variant="primary" size="lg"`, autofocused
  via `restartRef`.
- **Behavior in both Offerer and Joiner closed branches** is identical.

The accompanying body copy can be lightly updated to set the right expectation,
e.g.:

> The chat ended. Your friend may have closed the tab, or the network dropped.
> Your transcript is saved — you can resume from home.

The "transcript is saved" line is true because of FEAT-012 and reduces the "did
I lose my chat?" anxiety the current page can produce.

## Suggested fix

Single-line change in each of the two screens, plus the corresponding test
assertions and page-title strings.

**`src/screens/Offerer.tsx`**

```diff
- <Button ref={restartRef} variant="primary" size="lg" onClick={onCancel}>
-   Start a new chat
- </Button>
+ <Button ref={restartRef} variant="primary" size="lg" onClick={onCancel}>
+   Return home
+ </Button>
```

Same change in `src/screens/Joiner.tsx`.

**Body copy update** (optional but recommended; same string in both files):

```diff
- The chat ended. Your friend may have closed the tab, or the network dropped.
+ The chat ended. Your friend may have closed the tab, or the network dropped. Your transcript is saved — you can resume from home.
```

**Page title** stays `Connection lost · P2P Chat` — that part is correct
(`Offerer.tsx:111`, `Joiner.tsx:26`).

### Naming

Two reasonable labels:

- **`Return home`** — accurate and screen-name-neutral. The screen is literally
  called "Home" in routing and in the live announcement.
- **`Back to chats`** — more user-facing (Home shows the list of chats), and
  skews toward "you'll see your conversations" rather than "you'll see the
  landing page".

Recommend **`Return home`** for consistency with the existing routing vocabulary
in `App.tsx` (`goHome`, `kind: 'home'`) and because Home is more than just the
chat list (it also hosts the "Start a chat" button, the "How does this work?"
disclosure, etc.). Whatever the chosen label, use the same string in both
Offerer and Joiner.

## Test plan

Update existing closed-branch tests:

- `src/screens/Offerer.test.tsx:172` ("renders a 'Connection lost' view when
  state === 'closed'") — change the button-text assertion from
  `/start a new chat/i` to `/return home/i`.
- `src/screens/Joiner.test.tsx:101` — same change.
- Both tests already assert the heading text (`/connection lost/i`); that's
  unchanged.

Add a small new assertion in both tests:

- Click the CTA, assert `onCancel` is invoked exactly once — confirms the wiring
  didn't drift.

Grep for any other tests asserting `/start a new chat/i` and update them (e.g.
`Offerer.test.tsx:208` is a _negative_ assertion that the heading isn't present
in a non-closed state — unaffected, but worth a manual check).

## Out of scope

- Auto-resuming the dropped conversation. Tempting, but the user may have closed
  the tab on purpose; a single deliberate click on Home's `Resume` row is the
  right amount of friction.
- Adding a secondary "Start a new chat" button alongside `Return home`. The user
  explicitly chose the "replace" option, and Home already exposes "Start a chat"
  as its primary CTA, so adding a parallel button on the closed screen would be
  redundant.
- Surfacing recent peer / last-message info on the Connection lost screen
  itself. Out of scope — Home does this and is one click away.
- Telemetry or instrumentation for "did the user resume after a drop". Out of
  scope; revisit only if there's a real product question to answer.

## Working

- Confirmed CTA text appears in two places: `src/screens/Offerer.tsx:228` and
  `src/screens/Joiner.tsx:141`. Both invoke `onCancel` (wired to `App.goHome`) —
  routing is correct; only the label is misleading.
- Body copy on the `closed` branch is duplicated verbatim in both screens
  (`Offerer.tsx:225` / `Joiner.tsx:138`). Updating both keeps the screens in
  lockstep.
- Tests affected:
  - `Offerer.test.tsx` lines 143, 146, 190, 196 — two cases (focus-on-mount +
    onCancel-wiring) match `/start a new chat/i`.
  - `Joiner.test.tsx` lines 72, 75, 189, 195 — same shape, also two cases.
  - Existing onCancel-call regression assertions already use
    `toHaveBeenCalledTimes(1)`, so the ticket's "click → assert onCancel once"
    guard is already in place. No new tests required beyond updating the label
    assertions.
- Doc-only references to the old label exist in `src/screens/Home.tsx:17`,
  `src/screens/Offerer.tsx:121`, `src/screens/Joiner.tsx:88`, and
  `src/core/rtc.ts:20`. `Home.tsx`'s reference is to Home's _own_ "Start a chat"
  button (different surface), so leave it. The `Offerer.tsx` / `Joiner.tsx`
  focus-target comments mention the old label — update those to keep the comment
  in sync with the code. The `rtc.ts:20` comment paraphrases the screen's
  user-facing copy ("Connection lost — start a new chat"); update to "Connection
  lost — return home" to keep the comment accurate.
- Chose label **`Return home`** per the ticket's recommendation: consistent with
  `App.tsx`'s `goHome` / `kind: 'home'` vocabulary.
- Adopted the recommended body-copy update to set the "transcript is saved"
  expectation (FEAT-012 makes this true).
