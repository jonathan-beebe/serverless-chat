# A11Y-020: CopyBox "Copied!" success callout auto-dismisses after 1500ms with no extend / pause / disable control

**Status:** Resolved **WCAG:**

- 2.2.1 Timing Adjustable — Level A

**Severity:** Medium — the underlying copy still works (the data is on the
clipboard regardless of how long the toast stays visible), so this is not a
workflow-blocker like A11Y-019. But it is a confirmed Level A violation that
affects a real and broad population of users: anyone whose comfortable read-time
is longer than 1.5s. That includes users with cognitive disabilities, low-vision
users using screen magnification (who need extra time to pan back to the corner
where the toast appeared), non-native English readers translating in their head,
and any sighted user whose attention is briefly elsewhere when the toast appears
(a very common case — the user is already context-switching to the messaging app
where they will paste the link).

**Location:** `src/components/CopyBox.tsx` lines 23-27 (the `flashCopied`
helper) and lines 79-83 (the `<Callout variant="success">` that uses it).

```tsx
// lines 23-27
const flashCopied = () => {
  setCopied(true)
  setNeedsManualCopy(false)
  setTimeout(() => setCopied(false), 1500)
}

// lines 79-83
{
  copied && (
    <Callout variant="success" aria-hidden="true">
      Copied!
    </Callout>
  )
}
```

## Problem

After a successful clipboard write, the component sets `copied = true`, which
renders the visible "Copied!" callout, and then unconditionally schedules a
`setTimeout` that flips `copied` back to `false` after **1500ms**. The callout
disappears whether or not the user has actually read it.

This is a **content-set time limit** under WCAG 2.2.1 (Timing Adjustable, Level
A). The Success Criterion requires that any time limit set by the content meet
**at least one** of the following:

- **Turn off:** the user can turn the time limit off before encountering it; OR
- **Adjust:** the user can adjust the time limit to at least **10×** the
  default; OR
- **Extend:** the user is warned before the limit expires and given at least 20
  seconds and at least 10× the default to extend it with a simple action (e.g.,
  press any key).

The current implementation provides **none** of these. The 1500ms timer fires
unconditionally and there is no UI, preference, or programmatic surface through
which a user can disable, lengthen, or extend it.

### Exceptions analysis (so the implementer doesn't have to re-do it)

WCAG 2.2.1 enumerates three exceptions that excuse a content-set time limit.
None apply here:

- **Real-time exception** ("the time limit is a required part of a real-time
  event ... and no alternative to the time limit is possible"). **Not
  applicable.** A successful clipboard write is not a real-time event. The
  clipboard contents persist for as long as the OS clipboard holds them — there
  is no synchronization with an external clock, no auction-end, no live
  broadcast. The user can read "Copied!" for ten seconds or ten minutes with
  zero effect on data integrity.
- **Essential exception** ("the time limit is essential and extending it would
  invalidate the activity"). **Not applicable.** There is no underlying activity
  that _requires_ the confirmation to vanish at exactly 1500ms. The clipboard
  contents do not expire; the textarea contents do not change; nothing
  downstream consumes the dismissal. The 1500ms is a cosmetic choice, not a
  functional requirement.
- **20-hour exception** ("the time limit is longer than 20 hours"). **Not
  applicable.** 1.5 seconds is approximately 48,000× shorter than the 20-hour
  ceiling. Trivially out of scope.

So 2.2.1 applies in full, and the current implementation violates it.

### Why 1.5s is the wrong number even setting WCAG aside

WCAG provides the floor; below that floor it is non-conformant. Above that
floor, 1.5s is still a poor choice for this UI:

- **Screen magnifier users** (ZoomText, macOS Zoom, Windows Magnifier) need to
  _find_ the toast before they can read it — magnification typically shows a
  small fraction of the viewport, so the toast appearing in the action row is
  off-screen until the user pans. 1.5s is not enough time to (a) realize a toast
  appeared, (b) pan to it, (c) read it.
- **Cognitive-load users** routinely need 3–5× the reading time a fluent reader
  needs.
- **The default user context-switch is the failure mode.** Users click Copy
  _because they want to paste somewhere else._ Their attention is, by design, in
  the middle of leaving the page. The toast appears, they switch tabs, they come
  back — the toast is gone and they have no record that the copy actually
  succeeded. They press Copy again. (This is also a fixable confidence problem;
  see "Intended behavior" below.)

## Adjacent context (do **not** conflate scope)

This component has multiple a11y concerns. Keep them separate:

- **A11Y-019 (open, in `inbox/`)** — addresses the _warning_ callout
  (`needsManualCopy`, lines 92-96) being marked `aria-hidden="true"` and hiding
  an actionable instruction. That callout carries recovery-critical content; the
  visual surface must become AT-visible.
- **This ticket (A11Y-020)** — addresses the _success_ callout's 1500ms
  auto-dismiss timing. It does **not** ask for the success callout's
  `aria-hidden="true"` (line 80) to be removed. That is defensible because:
  - "Copied!" is a _confirmation_, not an _instruction_ — re-reading it confers
    no further capability.
  - The `LiveRegion` on lines 98-104 announces `"${label} copied to clipboard"`
    once, which is the appropriate AT pattern for a confirmation (this was the
    resolution of A11Y-008).
  - Removing `aria-hidden` from the success callout would cause it to
    double-announce alongside the live region. Not desired.

  So this ticket's fix must **preserve `aria-hidden="true"` on the success
  callout** (line 80) and **preserve the `LiveRegion` block** (lines 98-104)
  exactly as-is. The fix concerns _timing only_, not exposure.

- **`setNeedsManualCopy(false)` on line 25** must be preserved by any fix. It
  resets the fallback hint when a copy succeeds; without it, a user who first
  hit the fallback path and then retried successfully would still see the stale
  "Press Ctrl+C / Cmd+C to copy" warning. The reset must happen synchronously
  with `setCopied(true)`. Do not delete it.

- **The `Callout` component itself** is fine — it is just a presentation
  primitive (`src/components/Callout.tsx`). This ticket fixes how `CopyBox`
  _uses_ it.

- **The PR for this ticket and the PR for A11Y-019 should be separate.** They
  touch overlapping lines (the action row at lines 76-88) but are independent
  concerns; bundling them slows review and risks a single revert undoing two
  fixes.

## Intended behavior

After a successful clipboard write:

1. The "Copied!" confirmation appears immediately (current behavior — keep it).
2. The `LiveRegion` announces `"${label} copied to clipboard"` once (current
   behavior — keep it).
3. The visible "Copied!" callout **remains visible until it becomes contextually
   irrelevant**. "Contextually irrelevant" means one of:
   - The user clicks Copy again (a new outcome supersedes the old one).
   - The textarea's `value` prop changes (the thing that was copied is no longer
     the thing in the box).
   - The component unmounts.
4. There is **no fixed wall-clock timer** that hides the confirmation out from
   under the user.

This satisfies 2.2.1's "turn off" provision in the cleanest possible way: there
is no time limit at all. The user has unlimited time to read the confirmation;
the confirmation only goes away when the _user_ (or the data) does something
that obsoletes it.

## Suggested fix

Three options, ranked by recommended order. Option 1 is the cleanest and matches
the spike's minimal-surface ethos; the user requested it as the preferred
direction. Options 2 and 3 are documented for the implementer in case a
constraint surfaces during the work that makes Option 1 awkward.

### Option 1 — Persist until next interaction (recommended)

Drop the `setTimeout` entirely. Reset `copied` to `false` only on events that
make the confirmation obsolete:

```diff
- const flashCopied = () => {
-   setCopied(true)
-   setNeedsManualCopy(false)
-   setTimeout(() => setCopied(false), 1500)
- }
+ const flashCopied = () => {
+   setCopied(true)
+   setNeedsManualCopy(false)
+ }
```

And clear `copied` when the user initiates a new copy attempt (so a fresh
attempt does not look like the previous one's leftover state), and when the
`value` prop changes (the thing that was copied is no longer in the box):

```diff
  const onCopy = async () => {
+   // A fresh attempt supersedes any previous confirmation.
+   setCopied(false)
    // Primary path: the modern async clipboard API.
    try {
      await navigator.clipboard.writeText(value)
      flashCopied()
      return
    } catch {
      // ...
    }
    // ...
  }
```

And:

```tsx
// Add inside the component body, near the useState calls.
useEffect(() => {
  // If the value being shown changes, the previous "Copied!" no longer
  // describes what is in the box — clear it.
  setCopied(false)
  setNeedsManualCopy(false)
}, [value])
```

(No timer means no cleanup function is needed for unmount — React
garbage-collects the state with the component.)

Pros:

- Zero timing-related code. Trivially conformant with 2.2.1.
- Matches the spike's minimal-surface ethos: the simplest behavior that does the
  right thing.
- The user gets unbounded reading time, which solves the magnification /
  cognitive-load / attention-switch cases at once.
- No new affordance to design, render, or label.

Cons:

- Subjectively "stickier" UI — the green toast persists across the user's return
  to the page. This is exactly what we want for the a11y case, but if a sighted
  design reviewer pushes back, point them at the criterion and the four named
  user populations above. There is no "feels cleaner" argument that beats Level
  A conformance.

### Option 2 — Respect a "longer timings" / `prefers-reduced-motion` preference

Keep the 1500ms timer for users who haven't asked for longer timings, but check
`window.matchMedia('(prefers-reduced-motion: reduce)')` (or, if/when shipped, a
more specific "longer time limits" preference) and skip the `setTimeout` when
set:

```tsx
const flashCopied = () => {
  setCopied(true)
  setNeedsManualCopy(false)
  const prefersReducedMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)',
  ).matches
  if (!prefersReducedMotion) {
    setTimeout(() => setCopied(false), 1500)
  }
}
```

Pros:

- Preserves current visual behavior for users who haven't expressed a
  preference.

Cons:

- `prefers-reduced-motion` is a _motion_ preference, not a _timing_ preference.
  Using it as a proxy is a category error and several users who need the longer
  timing will not have set it (they don't have a vestibular issue, they have a
  reading-speed issue).
- Still violates 2.2.1 for users who _haven't_ set the preference, because the
  timer's existence is what triggers the criterion, not who it affects.
- This is **not** sufficient on its own to close the ticket.

### Option 3 — Lengthen to 15s + render a "Dismiss" affordance

Multiply the duration by 10× (to 15000ms) and render a small dismiss button on
the callout. This satisfies the "adjustable to at least 10× default" provision
_if_ you interpret 1.5s as the "default" the user can adjust away from — but the
cleaner reading is that the dismiss button satisfies the "turn off" provision.
Either path closes the SC.

```tsx
const flashCopied = () => {
  setCopied(true)
  setNeedsManualCopy(false)
  setTimeout(() => setCopied(false), 15000)
}

// ...in the render:
{
  copied && (
    <Callout variant="success" aria-hidden="true">
      Copied!
      <button
        type="button"
        onClick={() => setCopied(false)}
        aria-label="Dismiss copy confirmation">
        ×
      </button>
    </Callout>
  )
}
```

Pros:

- Preserves the auto-dismiss model — designers who want the toast to "go away on
  its own" still get that, just on a humane timeline.

Cons:

- The dismiss button needs to be focusable and labeled, which means the success
  Callout can no longer be `aria-hidden="true"` — and then it will
  double-announce alongside the LiveRegion (see "Adjacent context" above). To
  keep `aria-hidden`, the dismiss button would need to live _outside_ the
  callout, which is awkward.
- Adds a UI element to design and label. More surface than the problem warrants.
- 15s is still arbitrary; some users need longer.

### Recommended path

Take **Option 1**. It is the smallest change, removes the entire class of timing
bugs from this surface, and aligns with how the rest of the component already
behaves (the warning callout in lines 92-96 already persists until
`needsManualCopy` flips back, with no wall-clock timer).

If a design reviewer objects to the "Copied!" toast persisting indefinitely, the
right counter-design is Option 1 plus a brief animation/opacity treatment that
visually de-emphasizes the toast after a few seconds without actually removing
it from the DOM. That is a follow-up; it does not block this ticket.

## Test updates

`src/components/CopyBox.test.tsx` will need:

- A new test asserting that the "Copied!" callout **remains in the document**
  longer than 1500ms after a successful copy. Concretely: render, click Copy,
  await the "Copied!" text, advance fake timers by 5000ms, assert the "Copied!"
  text is _still_ in the document. (Use `vi.useFakeTimers()` for determinism —
  the existing tests already use Vitest.)
- A test asserting that clicking Copy a second time clears the previous
  "Copied!" state before the new outcome is rendered. (Important for Option 1's
  `setCopied(false)` at the top of `onCopy`.)
- A test asserting that changing the `value` prop clears the "Copied!" state
  (Option 1's `useEffect` dependency on `value`).
- The existing `'shows "Copied!" when navigator.clipboard.writeText succeeds'`
  test (lines 17-28) is fine — keep it. It only asserts that the text appears;
  it does not assert that it later disappears.
- If any existing test currently asserts the _disappearance_ of "Copied!" after
  a delay, it must be inverted (the new contract is that it does not disappear
  on a timer). Scan `CopyBox.test.tsx` for `setTimeout`,
  `waitFor(... not in document)`, `useFakeTimers` against the success callout,
  and update accordingly.
- The fallback / `needsManualCopy` path tests (lines 30-46+) are unaffected and
  should pass unchanged.

## Acceptance

- `src/components/CopyBox.tsx` no longer schedules a wall-clock timer that hides
  the success callout. The 1500ms `setTimeout` on line 26 is gone (Option 1) or
  replaced with a user-controllable mechanism (Options 2/3).
- The "Copied!" callout remains visible at least until one of: a new Copy click,
  a `value` change, or component unmount. Verified by a Vitest test using fake
  timers advancing well past 1500ms.
- The `LiveRegion` block on lines 98-104 is unchanged. Single announcement of
  `"${label} copied to clipboard"` on success.
- The success callout retains `aria-hidden="true"` (line 80) — this ticket does
  not touch AT exposure of the success path. (Contrast with A11Y-019, which
  addresses the _warning_ callout's `aria-hidden`.)
- `setNeedsManualCopy(false)` on line 25 is preserved in `flashCopied` (or
  wherever the success-state reset lives after refactor). A successful retry
  still clears any stale fallback hint.
- The fallback `execCommand('copy')` path and the `needsManualCopy` warning path
  are functionally unchanged.
- A regression test guards the new contract:
  `"Copied!" remains in the DOM more than 1500ms after a successful copy`.
- `npm test`, `npm run lint`, `npm run typecheck` clean.
- Manual smoke: open the Offerer flow, click Copy on the invite URL, leave the
  tab and come back 30 seconds later, confirm the "Copied!" callout is still
  visible. Then click Copy again — confirm the green flash is clean (no stale
  state). Then change the value (navigate to a state that regenerates the URL) —
  confirm "Copied!" clears.

## Working

- Confirmed issue still present: `src/components/CopyBox.tsx` line 27 contains
  `setTimeout(() => setCopied(false), 1500)` inside `flashCopied`. The success
  callout on lines 81-85 is gated by `copied` state, which auto-resets after
  1.5s.
- Existing tests in `CopyBox.test.tsx` only assert the appearance of "Copied!" —
  none assert disappearance, so inverting the contract requires only additive
  tests. No existing test needs to be inverted.
- Implementing **Option 1** (recommended path): drop the timer, clear `copied`
  at the top of `onCopy`, and add a `useEffect([value])` that clears both
  `copied` and `needsManualCopy` when the underlying value changes.
- Will preserve: `aria-hidden="true"` on the success callout (line 82), the
  `LiveRegion` block, and `setNeedsManualCopy(false)` inside the renamed
  success-state setter.
- Added three new regression tests guarding: (1) "Copied!" persists past 5s, (2)
  a second click clears prior state cleanly, (3) changing `value` prop clears
  "Copied!".

## Resolution

Implemented Option 1 in commit `c4fe5fd`.

- `src/components/CopyBox.tsx`: dropped the 1500ms `setTimeout` from the
  success-state helper (renamed `flashCopied` → `markCopied` to reflect the new
  contract). Added `setCopied(false)` at the top of `onCopy` so a fresh attempt
  supersedes any prior confirmation. Added `useEffect([value])` that clears both
  `copied` and `needsManualCopy` whenever the underlying value changes.
  Preserved `aria-hidden="true"` on the success callout, the `LiveRegion`
  single-announcement, and `setNeedsManualCopy(false)` on success.
- `src/components/CopyBox.test.tsx`: added three regression tests covering the
  persistence, second-click-clears-stale-state, and value-change-clears-state
  contracts. All eight CopyBox tests pass.
- Full suite: 135/135 passing. `npm run lint` and `npm run typecheck` clean.
