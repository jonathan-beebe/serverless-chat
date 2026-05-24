---
id: A11Y-027
type: a11y
status: in-progress
created: 2026-05-24
---

# A11Y-027: Network telemetry per-message table has no accessible name and `<th>` cells lack `scope`

**WCAG:**

- 1.3.1 Info and Relationships — Level A
- 4.1.2 Name, Role, Value — Level A

**Severity:** Medium — screen-reader users navigating the Network telemetry page
can't bind the table to its surrounding heading, and the column-to-cell
relationships aren't programmatically determinable. Both are core
table-accessibility primitives.

**Location:** `src/network/Network.tsx`

- Line 171 — `<table className="w-full min-w-[36rem] text-left text-sm">` has no
  `<caption>`, no `aria-label`, no `aria-labelledby`.
- Lines 174–178 — five `<th>` cells (`ID`, `Direction`, `When`, `Timing`,
  `Δ from median`) with no `scope` attribute.
- Line 154 / 167 — the surrounding `<section>` is labelled by
  `<h2 id="net-timeline-heading">Per-message timeline (last N)</h2>`. The
  `<table>` does not reference that heading.

## Problem

Two related but independent defects:

### 1. Table has no accessible name (1.3.1, 4.1.2)

When a screen reader's table-navigation mode encounters this `<table>`, it
announces something like "table, 5 columns, N rows" with no name. The
surrounding `<h2 id="net-timeline-heading">` is in the `<section>` ancestor but
the table itself doesn't reference it, so SR users in table-navigation mode
(which typically skips over surrounding prose) hear the table cold.

Per WCAG 1.3.1, the heading↔table relationship is structural and must be
programmatically determinable. The fix is one of:

- `aria-labelledby="net-timeline-heading"` on the `<table>` — reuses the
  existing `<h2>` id.
- `<caption>` inside the `<table>` — the canonical HTML mechanism. If the
  caption duplicates the `<h2>`, use `class="sr-only"` to keep it visually
  hidden. Less ideal here because the `<h2>` is already on-screen.
- `aria-label="Per-message timeline"` on the `<table>` — works but duplicates
  the visible heading text; `aria-labelledby` is preferred when there's a
  visible label to point at.

### 2. `<th>` cells lack `scope` (1.3.1)

The five `<th>` cells in `<thead>` are visual column headers, but without
`scope="col"` the relationship between header and data cell is not explicit.
Modern AT often _infers_ scope when the `<th>` is inside `<thead>`, but explicit
`scope="col"` is the canonical and reliable signal — SR table- navigation modes
(NVDA Ctrl+Alt+arrows, JAWS Ctrl+Alt+arrows, VoiceOver Ctrl

- Option + arrows) rely on it to announce the column header when the user moves
  between cells.

Without explicit `scope`, the user navigating through `<td>` cells in the body
hears the cell value with no header context. With `scope="col"`, NVDA announces
"ID column header, 5fa3e1b0" when arrow-ing into the first body cell of the ID
column.

## Suggested fix

Two small additions to `src/network/Network.tsx`:

```diff
- <table className="w-full min-w-[36rem] text-left text-sm">
+ <table aria-labelledby="net-timeline-heading" className="w-full min-w-[36rem] text-left text-sm">
    <thead className="text-xs font-medium text-stone-600 dark:text-stone-400">
      <tr className="border-b border-stone-300 dark:border-stone-700">
-       <th className="px-3 py-2">ID</th>
-       <th className="px-3 py-2">Direction</th>
-       <th className="px-3 py-2">When</th>
-       <th className="px-3 py-2">Timing</th>
-       <th className="px-3 py-2">Δ from median</th>
+       <th scope="col" className="px-3 py-2">ID</th>
+       <th scope="col" className="px-3 py-2">Direction</th>
+       <th scope="col" className="px-3 py-2">When</th>
+       <th scope="col" className="px-3 py-2">Timing</th>
+       <th scope="col" className="px-3 py-2">Δ from median</th>
      </tr>
    </thead>
```

That's the entire change. No new ids, no new markup — the `<h2>` already has
`id="net-timeline-heading"` (set at line 167, used by the `<section>`'s
`aria-labelledby` at line 166); we reuse it on the `<table>`.

The same idea also applies to:

- **The summary `<dl>`** at lines 58–67 — labelled by `<h2>Summary</h2>` via the
  `<section>`. `<dl>` doesn't take `scope`, so no analogous fix there; the
  existing `aria-labelledby="net-summary-heading"` on the section is sufficient
  and not in scope for this ticket.
- **The sync probe `<dl>`** at lines 103–110 — same; out of scope.
- **The state-change `<ol>`** at lines 128–137 — same; out of scope.

This ticket is _specifically_ the `<table>` in `MessageTimeline` because it's
the only `<table>` in the file (and in the app).

## Acceptance

- `<table>` at `src/network/Network.tsx:171` carries
  `aria-labelledby="net-timeline-heading"`.
- All five `<th>` cells at lines 174–178 carry `scope="col"`.
- Other attributes on the `<table>` and `<th>` cells (className tokens) are
  preserved unchanged.
- A test in `src/network/Network.test.tsx` (or wherever the Network tests live)
  asserts the `<table>` has the `aria-labelledby` and each `<th>` has
  `scope="col"`. Pattern matches A11Y-018's role / aria-label assertions.
- The existing `<section aria-labelledby="net-timeline-heading">` (line 154
  / 166) and the heading at line 167 are unchanged.
- `npm test`, `npm run lint`, `npm run typecheck` clean.
- Manual smoke: with NVDA on Firefox (or VoiceOver on Safari), navigate to
  `#network` after exchanging a few messages. Use the SR's table- navigation
  shortcut to enter the table; confirm:
  - The table announces "Per-message timeline (last N)" as its name.
  - Arrow-ing through `<td>` cells announces the column header on each column
    change.

## Related work

- **FEAT-010** (resolved) — introduced the `#network` route and this table.
- **A11Y-018** (resolved) — `role="log"` on the right element; same family of
  "make the structural relationship programmatically determinable".
- **A11Y-013** (resolved) — design-system duplicate main/h1; landmark and
  labeling discipline, adjacent thinking.

## Working

**2026-05-24** — Minimal fix applied per the suggested diff:
`src/network/Network.tsx` `<table>` now reuses
`aria-labelledby="net-timeline-heading"` (the same id the surrounding
`<section>` already points at) and each of the five `<th>` cells carries
`scope="col"`. Test added in `src/network/Network.test.tsx` asserts both.
`npm test` → 375/375. Lint + typecheck clean.
