---
id: A11Y-028
type: a11y
status: open
created: 2026-05-24
---

# A11Y-028: Network telemetry per-message timeline horizontal scroll container isn't keyboard-scrollable

**WCAG:**

- 2.1.1 Keyboard — Level A

**Severity:** High — keyboard-only users on Firefox / Safari, screen-magnifier
users, and switch / sip-and-puff users on narrow viewports cannot reach the
off-screen columns of the per-message timeline (`Timing`, `Δ from median`). Same
root cause as A11Y-021: Chromium auto-promotes scroll containers to focusable
since M126, but Gecko and WebKit do not. The bug is invisible to a developer
testing only in Chrome.

**Location:** `src/network/Network.tsx:170` — the wrapper
`<div className="overflow-x-auto ...">` around the `<table>`. The `<table>`
itself carries `min-w-[36rem]` (line 171), so on viewports narrower than ~576px
(mobile portrait, narrow window) the wrapper becomes the only scroll surface.

```tsx
// lines 170–172
<div className="overflow-x-auto rounded-md border border-stone-300 bg-white/50 dark:border-stone-700 dark:bg-stone-900/50">
  <table className="w-full min-w-[36rem] text-left text-sm">
```

## Problem

WCAG 2.1.1 (Keyboard, Level A) requires all functionality to be operable through
a keyboard interface. Reading the per-message timeline's right-hand columns _is_
functionality — the user opens `#network` precisely to read those numbers ("how
laggy is this chat?"). On narrow viewports the right-hand columns are scrolled
off-screen and the only way to reach them is to scroll the wrapper horizontally.

The wrapper has `overflow-x-auto` but:

- No `tabIndex={0}` — not a keyboard tab stop.
- No `role="region"` and no accessible name — even if a user did somehow focus
  it, screen readers wouldn't announce it as a meaningful landmark.

On Chromium (Chrome / Edge / Brave / Arc) from M126 (mid-2024) onward, scroll
containers are auto-promoted to focusable. That hides the bug for any developer
testing on Chromium. Firefox and Safari have not shipped this:

- A plain `<div overflow-x:auto>` is **not** focusable. Tab skips over it.
- Arrow / PageDown / Home / End scroll the **document**, not the container.

A11Y-021 fixed the identical pattern on the chat transcript — that ticket
captures the full browser-support landscape, the failure scenarios for each
affected population, and the recommended treatment. This ticket mirrors that fix
on the Network timeline scroll wrapper.

### Concrete failure scenarios

1. **Keyboard-only Firefox user on a narrow window.** Tabs through `#network`
   page: Back button → header → table region (currently skipped because the
   wrapper isn't focusable) → ... → end of document. There's no key combination
   that scrolls the table horizontally. The `Timing` and `Δ from median` columns
   are visually present but functionally inaccessible.
2. **Screen-magnifier user (ZoomText / macOS Zoom).** Magnifier anchors on
   focus; no focusable element inside the wrapper means no anchor to pan inside
   the table.
3. **Switch / sip-and-puff user.** Switch device cycles through focusable
   elements; the table is invisible to the cycle.

### Why screen-reader users aren't the affected population

Screen-reader users navigate tables with the SR's own table-navigation mode
(NVDA Ctrl+Alt+arrows, JAWS, VoiceOver). They don't depend on visible scroll
position. The affected population for this ticket is **sighted keyboard-only
users, screen-magnifier users, and switch users** — exactly the same population
as A11Y-021.

## Suggested fix

Mirror the A11Y-021 treatment on the Network timeline wrapper, plus an explicit
`role="region"` + `aria-label` (the chat transcript got `role="log"` instead,
which provides its own implicit name; a scroll region around a table needs the
labelled-region pattern):

```diff
- <div className="overflow-x-auto rounded-md border border-stone-300 bg-white/50 dark:border-stone-700 dark:bg-stone-900/50">
+ <div
+   role="region"
+   aria-label="Per-message timeline (scrollable)"
+   tabIndex={0}
+   className="overflow-x-auto rounded-md border border-stone-300 bg-white/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 dark:border-stone-700 dark:bg-stone-900/50">
    <table aria-labelledby="net-timeline-heading" className="w-full min-w-[36rem] text-left text-sm">
```

(The `aria-labelledby` on the `<table>` shown in the diff above lands as part of
A11Y-027 — coordinate the two PRs or land A11Y-027 first.)

### Notes on the choice of `role="region"` and label

- `role="region"` plus an accessible name makes the wrapper a navigable landmark
  in SR landmark lists, signalling "named container worth visiting" — which is
  correct here because it's a labelled scroll surface around a named data table.
- The label `"Per-message timeline (scrollable)"` cues the user that this is the
  scrollable wrapper around the timeline (the table itself will have its own
  `aria-labelledby` from A11Y-027 pointing at the
  `<h2>Per-message timeline (last N)</h2>`). Two named surfaces is acceptable
  here — the outer is the scroll container, the inner is the data table.

### Why `tabIndex={0}` and not `tabIndex={-1}`

`tabIndex={-1}` is programmatically focusable but skipped by Tab. That doesn't
help keyboard-only users who have no button to focus it from. `tabIndex={0}`
makes the wrapper a natural tab stop — the affordance _is_ "Tab lands here; now
you can scroll with the keyboard." Same reasoning as A11Y-021.

### Why this won't disrupt SR table-navigation

- The wrapper becomes a landmark, but the SR's table-navigation shortcut still
  finds the inner `<table>` directly.
- Sighted keyboard users get a new tab stop _before_ the table content; SR users
  hear "region, Per-message timeline (scrollable)" then can drill in. Both paths
  converge on the same data.

## Acceptance

- The wrapper `<div>` at `src/network/Network.tsx:170` carries `tabIndex={0}`,
  `role="region"`, and `aria-label="Per-message timeline (scrollable)"`.
- The wrapper carries the app focus-visible utilities
  (`focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400`),
  matching A11Y-021's treatment of the chat transcript wrapper.
- The wrapper's existing layout classes
  (`overflow-x-auto rounded-md border ... bg-white/50 ... dark:bg-stone-900/50`)
  are preserved unchanged.
- The inner `<table>` is untouched by this ticket. (A11Y-027 covers
  `aria-labelledby` and `scope="col"` separately.)
- A test in the Network test file asserts the wrapper has `tabIndex === 0`,
  `role="region"`, and the expected `aria-label`, plus the focus-visible classes
  (pattern matches A11Y-021's Chat test).
- `npm test`, `npm run lint`, `npm run typecheck` clean.
- **Manual smoke on Firefox AND Safari** (the two engines where the bug
  manifests):
  - Resize the window narrower than 36rem (576px).
  - Open `#network` after exchanging a few messages.
  - Tab until focus lands on the scrollable region; confirm the focus ring is
    visible.
  - Press Arrow Right / PageDown / End — the table scrolls horizontally to
    reveal `Timing` and `Δ from median` columns.
  - Press Arrow Left / PageUp / Home — table scrolls back to the start.
  - Confirm the document itself does not scroll while the wrapper has focus and
    the user presses scroll keys.

## Related work

- **A11Y-021** (resolved) — chat transcript not keyboard-focusable; this ticket
  mirrors the same root-cause pattern on the Network timeline.
- **A11Y-017** (resolved) — established the app's canonical focus-visible
  treatment used here.
- **A11Y-007** (resolved) — focus-visible ring on inputs / textareas; same
  visual contract.
- **FEAT-010** (resolved) — introduced the `#network` route and this table.
- **A11Y-027** (this batch) — adds `aria-labelledby` + `scope="col"` to the
  inner `<table>`; coordinate landing order so the labelled-region and
  labelled-table both make sense together.
