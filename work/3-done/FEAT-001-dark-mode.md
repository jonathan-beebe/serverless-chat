# FEAT-001: Dark mode

**Status:** Resolved **Type:** Feature **Area:** UI / theming

## Summary

Render the app in a dark palette when the user's operating system reports a dark
color-scheme preference, and in the current light palette otherwise. No in-app
toggle in v1 — the OS is the single source of truth.

## Customer value

People use this chat app at night, in bed, on couches, in dim rooms. A bright
white setup screen and chat surface in those conditions causes eye strain and
feels out of place next to other apps on the device that already respect the
system theme. Following `prefers-color-scheme` removes that friction without
asking the user to configure anything.

## Business value

- Closes a perceived-quality gap: an app that ignores the system theme reads as
  unfinished on modern OSes (macOS, iOS, Android, Windows 11, GNOME, KDE all
  expose this preference prominently).
- Zero-config: no settings screen, no persisted preference, no migration.
  Lowest-cost path to "the app respects my device."
- Keeps the door open for a future manual override (Light / Dark / System)
  without re-architecting — see _Out of scope_ below.

## What a working feature delivers

A user on a device set to **dark mode** loads the app and sees:

- A dark background across all three screens (Setup / Offerer waiting room,
  Joiner, Chat).
- Foreground text, links, buttons, inputs, message bubbles, the CopyBox, focus
  rings, and the "connection state" affordances all readable on the dark
  background with sufficient contrast (≥ WCAG AA for body text).
- No white flash on first paint (theme decision happens before React mounts, or
  via CSS that does not depend on JS).
- Sender vs. receiver message bubbles remain visually distinguishable.
- The `<meta name="theme-color">` (browser chrome / mobile address bar) matches
  the active theme.

A user on a device set to **light mode** sees the existing UI unchanged.

A user who **changes their OS theme while the app is open** sees the app update
live (no reload required).

## Acceptance criteria

1. With OS set to dark, every screen renders in the dark palette on first paint
   — no light-mode flash.
2. With OS set to light, the UI is pixel-identical to today (no regressions in
   the light palette).
3. Toggling the OS preference while the app is open updates the UI without a
   reload.
4. All interactive elements (buttons, inputs, links, focus rings) meet WCAG AA
   contrast in both themes.
5. `<meta name="theme-color">` reflects the active theme.
6. No new user-facing toggle, settings screen, or persisted preference is
   introduced.

## Out of scope (v1)

- **Manual override toggle** (Light / Dark / System picker). Defer until there
  is evidence users want to override the OS. Implementation should not preclude
  adding this later — keep theme application driven by a single CSS-level signal
  (e.g. a `data-theme` attribute or Tailwind's `dark:` variant tied to
  `prefers-color-scheme`) so a JS-driven override is a small additive change.
- **Per-screen theming** or theme customization.
- **High-contrast mode** — that's an accessibility concern tracked separately.
- **Dark-mode-specific imagery or illustrations.**

## Open questions

- Which dark palette? Pure-black OLED-friendly vs. a softer dark-gray. Recommend
  soft dark-gray (`zinc-900`-ish) as the surface; pure black tends to look harsh
  on LCDs and increases halation against light text.
- Does the CopyBox's "copied!" feedback color need to change, or does the
  existing accent read well on dark?

## Notes for the implementer

- Tailwind v4 is already in the project — its `dark:` variant with
  `@media (prefers-color-scheme: dark)` is the lowest-friction path and avoids
  the FOUC problem entirely (no JS gate needed for the initial paint).
- Audit: Setup screen, Offerer waiting room, Joiner, Chat, CopyBox, message
  bubbles (sender vs. receiver), inputs, buttons, error/empty states, focus
  rings, link colors.
- Coordinate with the accessibility backlog
  (`__local__/work/accessibility/inbox/`) — several open A11Y tickets touch
  contrast and focus indicators and should be considered while picking the dark
  palette so the same colors don't have to be revisited twice.

## Working notes

**Discovery:** The current codebase already renders dark — `src/index.css`
hardcodes `body { background-color: #0f172a; color: #f1f5f9 }` and every
component uses `bg-slate-900`/`text-slate-100` directly. AC #2 says
"pixel-identical to today" for light mode, but "today" is dark. Pragmatic
reading: today's UI becomes the **dark** palette (already correct), and we add a
new **light** palette for `prefers-color-scheme: light`. AC #1 (dark
first-paint) is satisfied trivially because we use a pure-CSS @media path with
no JS gate.

**Approach:**

- Drop the hardcoded body bg/fg in `index.css`. Use
  `@media (prefers-color-scheme: dark)` to apply the dark slate body colors;
  light gets a slate-50 surface with slate-900 text. Add
  `color-scheme: light dark` so native form controls & scrollbars adapt.
- Tailwind v4's `dark:` variant follows `prefers-color-scheme: dark`
  automatically — wire light palette classes as defaults, prefix the existing
  slate-dark classes with `dark:`.
- `<meta name="theme-color">` becomes two tags with
  `media="(prefers-color-scheme: …)"` — the browser picks the right one and
  re-evaluates live when the OS preference toggles.

**Tests to add:**

- Light palette is configured: `src/index.css` contains a
  `@media (prefers-color-scheme: dark)` block and uses
  `color-scheme: light dark`.
- `index.html` has dual `<meta name="theme-color">` tags with
  `media="(prefers-color-scheme: light)"` and
  `media="(prefers-color-scheme: dark)"`.
- Render-level smoke check: at least the Home heading carries both a light text
  class (default) and a `dark:` text class.

**Existing tests to protect:** `App.test.tsx` routing & focus tests — should
keep passing since color classes don't affect role/name/focus selectors. Same
for `Chat.test.tsx`, `Offerer.test.tsx`, `Joiner.test.tsx`, `CopyBox.test.tsx`.
