# A11Y-002: No `<main>` landmark on any screen

**Status:** Resolved **WCAG:** 1.3.1 Info and Relationships (Level A), 2.4.1
Bypass Blocks (Level A) **Severity:** Medium **Location:**
`src/screens/Home.tsx`, `src/screens/Offerer.tsx`, `src/screens/Joiner.tsx`,
`src/App.tsx`, `index.html`

## Problem

Every screen renders its content into a bare `<div>`:

```tsx
// Home.tsx
<div className="mx-auto flex max-w-xl flex-col items-center gap-6 ..."> ... </div>

// Offerer.tsx / Joiner.tsx
<div className="mx-auto flex max-w-xl flex-col gap-6 ...">
  <header ...> ... </header>
  ...
</div>
```

There is no `<main>`, no `<nav>`, no skip link, and the `<header>` blocks in
Offerer/Joiner sit inside generic divs rather than inside a landmark — so they
do not count as page-level banners either.

For users navigating by landmarks (NVDA `d`, VoiceOver Rotor → Landmarks, JAWS
region nav), the document has nothing to navigate to. Keyboard users have no way
to skip past repeated UI to the main content.

## Intended behavior

Each route should expose its primary content as a `<main>` landmark so
screen-reader users can jump straight to it and so the heading hierarchy is
anchored in a recognized region.

## Suggested fix

1. In `App.tsx`, render the active screen inside `<main>` (or have each screen
   render its own `<main>` — pick one location consistently).
2. Move existing `<header>` blocks to be siblings of `<main>` (true page
   headers) or leave them inside `<main>` and accept that they will be generic
   `<header>` elements rather than `banner` landmarks. The first is closer to
   the semantic intent.
3. A skip link is optional today (no persistent nav), but should be revisited if
   global navigation is ever introduced.

Example shape:

```tsx
return (
  <main className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-12">...</main>
)
```

## Working notes

- Confirmed the issue is real: `grep -rn '<main' src/ index.html` returned zero
  matches. No `<main>` landmark exists anywhere.
- Affected files: `src/screens/Home.tsx` (1 root div), `src/screens/Offerer.tsx`
  (2 root divs across pre-connected and connected branches),
  `src/screens/Joiner.tsx` (3 root divs across accept-prompt, code-share, and
  connected branches).
- Decision: render `<main>` per-screen rather than in `App.tsx`. Each screen
  owns its own layout classes (e.g. Offerer/Joiner connected views use
  `h-[calc(100vh-3rem)]` while the lobby views use `py-12`), so wrapping in
  `App.tsx` would require either passing layout classes back up or stripping
  them from screens. Per-screen `<main>` is the smaller, more cohesive change.
- Decision on `<header>` placement: leave existing `<header>` blocks nested
  inside `<main>` (option 2 in the ticket). They are screen-section headers, not
  page-level banners — there is no persistent site nav, and the screen `<h1>`
  belongs to the main content. Moving them out as siblings of `<main>` would be
  more semantically pure but would require restructuring layout containers; the
  ticket explicitly allows this option.
- Each route renders exactly one `<main>` (only one screen mounts at a time via
  the switch in `App.tsx`), so we won't trip the "multiple main landmarks" rule.
- App.test.tsx queries by heading role, which is unaffected by div→main swaps.
  No test changes required.

## Resolution

- Replaced the outermost `<div>` on each render branch of `Home.tsx`,
  `Offerer.tsx`, and `Joiner.tsx` with `<main>`. Layout classes are unchanged.
- `<header>` blocks remain nested inside `<main>` (ticket option 2). They are
  screen-section headers, not page-level banners — appropriate for a
  single-screen SPA with no persistent nav.
- Verified: `npm test` (41 passed), `npm run typecheck`, `npm run lint` all
  green. Pre-commit CI hook passed.
- Commit: 5cabcf8
