# FEAT-009: Migrate neutral palette from `slate` to `stone` (whole app)

**Status:** Resolved **Type:** Feature **Area:** App-wide — every
`src/components/*.tsx`, `src/screens/*.tsx`, `src/design-system/*.tsx`, plus
`src/index.css` and the affected test files

## Summary

Swap the app's neutral palette from Tailwind's `slate` (cool blue-gray) to
`stone` (warm yellow-gray) **in both light and dark mode**. Every `slate-*`
utility class becomes the same-numbered `stone-*` class (e.g. `bg-slate-50` →
`bg-stone-50`, `dark:text-slate-100` → `dark:text-stone-100`). The pre-mount
body fallback hex codes in `index.css` also update so the page repaints with
stone before React boots, eliminating any flash of cool gray.

Brand/accent colors (`sky`, `emerald`, `amber`, `red`) are untouched — only the
neutral palette migrates.

## Customer value

- **Warmer, friendlier aesthetic.** Stone reads as yellow-tinted warm gray;
  slate reads as blue-tinted cool gray. For a casual chat surface, warm grays
  feel less clinical and more "personal-conversation" than the cool slate that
  ships with most Tailwind starters.
- **Subtle but consistent.** The change is uniform — light surfaces, dark
  surfaces, text, borders, dividers, bubble backgrounds all shift in lockstep —
  so the warmth lands as a coherent design choice rather than a single accent.
- **No new affordances or learning curve.** This is a visual refresh; nothing
  the user has learned about the UI changes.

## Business value

- **Differentiation from the default Tailwind look.** `slate` is the most common
  neutral palette in the Tailwind starter ecosystem; switching to `stone` is a
  low-cost way to make the app feel less like it was scaffolded from a template.
- **Sets the neutral palette deliberately** so future surface decisions (new
  components, new screens) have a clear convention to follow rather than
  reverting to the historical `slate` default. The design-system page documents
  the choice on the swatch row.
- **Cheap to ship.** Mechanical search-and-replace across ~16 source files plus
  a handful of test-assertion updates and three hex codes in `index.css`.
  Risk-bounded: no behavior change, no new state, no new dependencies.

## What a working feature delivers

A user opening the app sees the same UI they saw before in **layout, typography,
and behavior**, but the neutral surfaces, borders, text, dividers, chat-bubble
backgrounds, code-mono swatches, page background, and pre-mount body fill are
all rendered with Tailwind's `stone` palette instead of `slate` — in both light
and dark mode (OS-driven, plus the design-system force toggle introduced in
FEAT-007).

Concretely:

- **Light backgrounds** shift from `#f8fafc` (slate-50) to `#fafaf9` (stone-50)
  — a barely-perceptible warming of the page.
- **Dark backgrounds** shift from `#0f172a` (slate-900) to `#1c1917` (stone-900)
  — a notable warming, the page feels less "midnight blue" and more "charcoal".
- **Body text** in dark mode shifts from `#f1f5f9` (slate-100) to `#f5f5f4`
  (stone-100); secondary text scale also moves to the matching stone steps.
- **Chat bubbles** (the "them" side, slate-200 / dark slate-700) become
  stone-200 / dark stone-700.
- **Borders and dividers** (slate-300 / dark slate-700) become stone-300 / dark
  stone-700.
- **Design system swatches** rename and recolor: the "slate-50 page light bg" /
  "slate-900 page dark bg" rows show stone-50 / stone-900 with the corresponding
  swatch fills and labels.

Brand and accent colors are visually unchanged.

## Acceptance criteria

1. **Every `slate-*` Tailwind utility class in the source becomes the
   same-numbered `stone-*` class.** Tailwind's `stone` palette exposes the same
   50/100/200/300/400/500/600/700/800/900 steps, so each replacement is 1-to-1.
   Includes (non-exhaustive):
   - `bg-slate-50/100/200/700/900` → `bg-stone-…`
   - `text-slate-500/600/700/800/900/100/200/300/400` → `text-stone-…`
   - `border-slate-300/700` → `border-stone-…`
   - `placeholder-slate-400/500` → `placeholder-stone-…`
   - `hover:bg-slate-100/800` → `hover:bg-stone-…`
   - `open:bg-slate-900` and `dark:open:bg-slate-900` → `open:bg-stone-…` /
     `dark:open:bg-stone-…`
   - All `dark:` prefixed variants of the above.
   - Slash-opacity forms (e.g. `bg-slate-900/50`, `bg-slate-900/40`,
     `text-slate-300/70`, `bg-white/50` _stays white_) — only the slate stems
     change; opacity modifiers preserved verbatim.

2. **Index.css body fallback hex codes updated to stone equivalents.** Replace
   the three hex literals in `src/index.css`:
   - Light body `background-color`: `#f8fafc` → `#fafaf9` (with the trailing
     comment updated to `/* stone-50 */`).
   - Dark body `background-color`: `#0f172a` → `#1c1917` (`/* stone-900 */`).
   - Dark body `color`: `#f1f5f9` → `#f5f5f4` (`/* stone-100 */`).
   - The `color-scheme: light dark` declaration and the `@custom-variant dark`
     block are unchanged — they're palette-agnostic.

3. **Design-system swatch row reflects the new palette.** In
   `src/design-system/DesignSystem.tsx`, the `SWATCHES` constant entries
   currently labeled `'slate-50'` (page light bg) and `'slate-900'` (page dark
   bg) are renamed and recolored to `'stone-50'` / `'stone-900'` with matching
   `bg-stone-50` / `bg-stone-900` fill classes. The sky/emerald/amber/red
   swatches stay as-is.

4. **Affected test assertions are updated to match.** The class-shape assertions
   in:
   - `src/components/Button.test.tsx` (`border-slate-300`,
     `dark:border-slate-700`)
   - `src/components/Heading.test.tsx` (`text-slate-900`, `dark:text-slate-100`)
   - `src/components/Textarea.test.tsx` (`border-slate-300` ×2,
     `dark:bg-slate-900`)

   become `stone` equivalents. No new tests required — the assertions exist to
   pin the palette choice, so they continue to pin it after migration.
   `src/dark-mode.test.tsx` uses a `\bdark:text-/` regex that's palette-agnostic
   (no `slate`/`stone` in the regex) — no change needed.

5. **No leftover `slate` references in source or tests.**
   `grep -rn "slate-" src/` returns zero hits after the migration (modulo the
   index.css `/* stone-50 */` comments). The design-system page's body wrapper
   (`bg-slate-50 … dark:bg-slate-900`) is included in the sweep.

6. **Brand/accent palettes untouched.** `sky-600`, `sky-400` (focus ring),
   `sky-100/80` (timestamp on "me" bubbles), `emerald-700`, `emerald-400`,
   `amber-700`, `amber-300`, `red-50`, `red-300`, `red-700`, `red-900`,
   `red-200`, and the literal `white` / `bg-white/50` usages are unchanged.

7. **Visual review on every screen, light + dark.** Step through Home, Offerer
   (invite + connected + closed), Joiner (invite + reply + connected + closed),
   the design-system showcase (System / Light / Dark force-toggle), and the Chat
   organism with messages. Confirm:
   - No accidental color regressions (e.g. a missed `slate-` class that now
     reads cool in an otherwise warm surface).
   - Focus rings (sky) still have adequate contrast against the new stone
     backgrounds.
   - Error/warning/success Callouts (red/amber/emerald) still read clearly
     against stone surfaces — none of those palettes share neighbors with stone,
     so contrast should be preserved, but verify.
   - The pre-mount body fill (visible briefly on slow connections / first load)
     matches the post-mount Tailwind-driven fill — i.e. no flash from cool to
     warm gray.

8. **`npm run lint`, `npm run typecheck`, and `npm run test` all pass.**

## Out of scope (v1)

- **Customizing the stone steps** with theme tokens / CSS variables / a `@theme`
  block in `index.css`. This ticket adopts Tailwind's stock `stone` palette
  as-shipped. A future refinement could centralize the surface tokens behind
  semantic names (`--color-surface-page`, `--color-surface-card`, etc.) — defer
  until there's a second palette swap or a customer-driven need.
- **Switching the accent colors** (sky / emerald / amber / red). The neutral
  migration is independent of the brand palette; revisit only if the
  warm-neutral makes the cool-brand-sky look off.
- **Adding a user-facing palette toggle** in the app chrome. FEAT-001's
  invariant — _the app follows the OS, no in-app toggle_ — stands. The
  design-system force toggle from FEAT-007 already exists for review purposes.
- **Migrating the `bg-white` / `bg-white/50` usages to a stone-tinted
  off-white.** Pure white is intentional on `<input>` / `<textarea>` /
  `<details open>` backgrounds for contrast; it sits inside stone borders
  without looking foreign. If reviewers feel it looks too crisp against
  stone-50, file a follow-up.
- **Persisting or theming `<Chat>`'s "me"-side bubble color.** Sky-600 is
  unchanged; only the "them"-side (slate-200 / dark slate-700) moves. The
  two-tone bubble palette stays cleanly differentiated.
- **Updating screenshots / marketing assets / README imagery** if any exist
  outside `src/`. The implementer should grep for stale screenshot references
  but no asset re-rendering is required as part of this ticket.

## Open questions

- **The `usePageTitle` test fixtures and other behavior-only tests don't
  reference colors** — confirmed via grep, only the four component tests and
  `dark-mode.test.tsx` carry color assertions, and `dark-mode.test.tsx`'s
  `\bdark:text-/` regex is palette-agnostic. No additional test churn expected.
- **`bg-white/50` on the Home `<details>` summary and on the Chat transcript
  scroll area.** White against stone-tinted page backgrounds is slightly more
  contrasty than white against slate-50 (since stone-50 is warmer / closer to
  white-with-a-yellow-cast). **Recommendation:** ship the migration with white
  untouched, observe in review. If the contrast feels off, a follow-up could
  swap to `bg-stone-50/50` or `bg-stone-100/50` — but that's a separate design
  decision, not a mechanical part of this ticket.
- **The `placeholder-slate-500` / `dark:placeholder-slate-400` on `<Chat>`'s
  composer** map to `placeholder-stone-500` / `dark:placeholder-stone-400`.
  Stone-500 and stone-400 read as warm muted text against stone-50 / stone-900 —
  confirm during visual review that placeholder text is still distinguishable
  from typed content (especially in dark mode, where stone-400 placeholder on
  stone-900 background needs to remain legible).

## Notes for the implementer

- **Suggested order of work:**
  1. Run a single repo-wide search-and-replace of `slate-` → `stone-` across
     `src/` (preserve numeric suffixes verbatim — they all exist in both
     palettes). Use `grep -rn "slate-" src/` first to enumerate, then sweep
     file-by-file or via a scripted replace. Confirm zero remaining hits after.
  2. Update the three hex literals + trailing comments in `src/index.css`.
  3. Update the `SWATCHES` constant in `src/design-system/DesignSystem.tsx`.
  4. Run `npm run typecheck` → expect zero changes (Tailwind classes are
     strings).
  5. Run `npm run test` → expect four test files to fail on the slate-pinning
     assertions; update them to stone in the same commit.
  6. Run `npm run lint` → expect green.
  7. Manual visual review per AC #7. Capture before/after screenshots in the PR
     (one of Home in dark mode is the single most informative — that's where the
     slate→stone difference is most visible).
- **Atomicity.** The migration should land as a single commit (or PR). Partial
  migrations leave the app in a visually-mixed state (some surfaces stone, some
  slate) that's worse than either pure palette. If you need to split, split
  _along the test boundary_ — i.e. ship a no-op refactor PR first if anything
  else, but don't ship slate-and-stone-mixed source.
- **Tailwind v4 specifics.** No JIT config changes required — `stone` is in
  Tailwind's stock palette (same scale as slate). No `@theme` block edits needed
  in `index.css`. The `@custom-variant dark` block from FEAT-007 is
  palette-agnostic.
- **Slash-opacity classes.** Tailwind allows `bg-slate-900/50`,
  `bg-slate-900/40`, `text-slate-300/70` etc. — make sure the search-and-replace
  catches the stem only (not the `/NN` suffix). A regex like
  `\bslate-(\d{2,3})\b` → `stone-$1` is safer than a blind string replace;
  verify the diff.
- **`text-sky-100/80` on the "me" bubble timestamp.** This is `sky`, not `slate`
  — DO NOT change. The regex above will leave it alone but call it out as a
  likely false-positive trap.
- **Color-scheme intent.** `html { color-scheme: light dark; }` lets the UA
  paint scrollbars/form controls in the OS-native theme color — stone-tinted
  page backgrounds will look slightly mismatched against the UA's neutral-gray
  scrollbar in some browsers. This is acceptable and matches what other
  warm-neutral apps look like; not in scope to "fix".
- **Pre-mount paint sanity check.** Throttle the network in DevTools (Slow 3G)
  and refresh — the first paint should already be stone-tinted. If you see a
  flash of slate, the index.css hex updates didn't land.

## Coordination with prior tickets

- **FEAT-001 (Dark mode):** the dark-mode mechanism (`prefers-color-scheme` +
  the FEAT-007 `@custom-variant dark` block) is palette-agnostic and continues
  to drive theme switching unchanged. Every component already carries both light
  and `dark:` classes — the migration preserves that pairing on every line, just
  with `stone` in both slots.
- **FEAT-005 (System-only fonts):** unrelated; `index.css` font-family is still
  inherited from Tailwind preflight. Don't reintroduce a font override while
  you're in `index.css`.
- **FEAT-007 (Design system):** the showcase page already documents the
  page-background swatches and provides a force-Dark/Light toggle for review.
  This ticket updates the swatch labels + fills so the showcase remains the
  canonical reference. The toggle mechanism doesn't change.
- **FEAT-006 (Chat date headers and per-message time):** the `Divider`
  primitive's flank-border color (`border-slate-300 dark:border-slate-700`)
  moves to stone with the rest of the borders; the chat date-header layout is
  unchanged.
- **FEAT-002 / focus management:** unchanged. Headings still carry
  `focus:outline-none`; focus rings still use `sky-400`. Verify the sky-on-stone
  focus ring contrast during visual review (no automated check needed — sky-400
  against stone-50 / stone-900 should remain WCAG-clear, same as it was against
  slate).

## Working notes

### Plan

1. Run a regex sweep `\bslate-(\d{2,3})\b` → `stone-$1` across every `*.tsx`,
   `*.ts`, `*.css` under `src/`. This catches Tailwind class stems,
   slash-opacity variants, comment references like `slate-300`, and the
   `# slate-NN` swatch labels — without touching the brand `sky-*` and accent
   palettes.
2. Update the three hex literals in `src/index.css` (the trailing
   `/* slate-XX */` comments are picked up by the regex above).
3. Update the prose mentions of the word "slate" that aren't followed by a
   number — test descriptions and one design-system section description — for
   narrative consistency. (Not strictly required by the AC, but if we left them,
   `grep -ri slate src/` would still hit and that's the "no leftovers" signal in
   AC #5.)
4. Run `npm run typecheck` → expect zero diagnostics (class strings are opaque
   to TS).
5. Run `npm run test` → expect green: the four pinning tests (Button / Heading /
   Textarea / DesignSystem) all moved to stone in step 1.
6. Run `npm run lint` → expect green.

### Tests

No new tests required by the ticket; AC #4 calls out that the existing
class-shape assertions already pin the palette, so the regex sweep updates them
in place and they continue to pin. The palette-agnostic `\bdark:text-/` regex in
`dark-mode.test.tsx` was confirmed untouched.

### Results

- `grep -rni "slate" src/` → 0 hits after the sweep (verified).
- `npm run typecheck` → clean.
- `npm run lint` → clean.
- `npm run test` → 180 passed (19 files).
- `src/index.css` hex codes updated to `#fafaf9 / #1c1917 / #f5f5f4` (stone-50 /
  stone-900 / stone-100). The `@custom-variant dark` block and
  `color-scheme: light dark` are untouched, per AC #2.
- `SWATCHES` constant in `DesignSystem.tsx` now exposes `stone-50` / `stone-900`
  rows with matching `bg-stone-*` fills; sky/emerald/amber/red rows untouched.
