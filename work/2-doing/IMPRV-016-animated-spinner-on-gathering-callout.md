---
id: IMPRV-016
type: improvement
status: open
created: 2026-05-24
---

# IMPRV-016: Animated spinner alongside "(gathering network candidates)…" callout

## Problem

While the session is in the `gathering` state, the UI shows a static text-only
callout:

> Preparing invite (gathering network candidates)…

There is no motion cue, so sighted users can't immediately tell whether the app
is working or wedged. ICE gathering typically resolves in well under a second on
a healthy network, but can take several seconds — and IMPRV-001 added a 5 s
timeout for the worst case. During that window a small animated spinner next to
the message communicates "this is in-flight, hold on" without changing the copy.

The message renders in three places that should stay visually consistent:

- `src/screens/Offerer.tsx:306` — "Preparing invite (gathering network
  candidates)…"
- `src/screens/Offerer.tsx:259` — "Preparing reply (gathering network
  candidates)…" (polite-defer path)
- `src/screens/Joiner.tsx:187` — "Preparing reply (gathering network
  candidates)…"

(`src/design-system/DesignSystem.tsx:292` also shows the callout as a preview —
it should pick up the spinner automatically via the shared component.)

## Intended behaviour

Each "(gathering network candidates)…" callout shows a small spinning indicator
left of the text. The spinner stops being rendered as soon as the state moves
off `gathering` (the callout itself is already unmounted at that point).

The persistent `role="status"` live region from A11Y-012 continues to own
screen-reader announcements; the spinner is purely a sighted-user cue and must
not introduce duplicate AT noise.

## Suggested approach

There is no Hero Icons (or any icon library) dependency in `package.json`, and
the project is intentionally lean — three runtime deps. Adding
`@heroicons/react` just for one icon is overkill.

Tailwind v4 (already installed) provides the `animate-spin` utility. The
conventional pattern is an inline SVG of a circle with a partial stroke,
rotated:

```tsx
// src/design-system/Spinner.tsx (new)
export function Spinner({ className = '' }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      className={`h-4 w-4 animate-spin ${className}`}>
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="4"
      />
      <path
        d="M22 12a10 10 0 0 1-10 10"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  )
}
```

Then at each of the three call sites:

```tsx
<Callout variant="info" className="inline-flex items-center gap-2">
  <Spinner />
  Preparing invite (gathering network candidates)…
</Callout>
```

`Callout` currently renders a `<p>`; inline-flex on a `<p>` works fine, and the
existing `info` variant colour (`text-stone-600 dark:text-stone-400`) flows
through `currentColor` so the spinner picks up dark-mode without extra work.

Add a Row in `src/design-system/DesignSystem.tsx` showing the Spinner in
isolation, and confirm the existing "Callout — info" row now renders the spinner
inline.

## Open questions for refinement

- Spinner size / weight — `h-4 w-4` matches the body text x-height; bigger feels
  heavier than the callout itself.
- Should the spinner also appear on the longer-running "connecting" state, or is
  the scope strictly the `gathering` callouts? (Default: scope = gathering only;
  revisit if connecting feels static.)
- Should `Spinner` live under `src/design-system/` or `src/components/`?
  `Callout` lives in `src/components/`; the existing split puts primitives
  alongside `Callout` and the catalogue page in `src/design-system/`. Probably
  `src/components/Spinner.tsx` to match.

## Related work

- IMPRV-001 (`work/3-done/IMPRV-001-ice-gathering-no-timeout.md`) — added the 5
  s ICE-gathering timeout that bounds how long the spinner could spin.
- A11Y-012 (`work/3-done/A11Y-012-connection-state-not-announced.md`) — added
  the persistent `role="status"` live region that owns AT announcements; the
  spinner must keep `aria-hidden` so it doesn't duplicate.
- FEAT-007 (`work/3-done/FEAT-007-design-system.md`) — pattern for adding a new
  primitive to the design system catalogue.

## Working

- Created `src/components/Spinner.tsx` per the ticket defaults (`h-4 w-4`,
  `currentColor` stroke, `aria-hidden="true"`, accepts caller `className`).
- Created `src/components/Spinner.test.tsx` — 5 assertions: aria-hidden,
  animate-spin, default sizing, caller className appended, currentColor on every
  stroke.
- Wired the spinner into the three gathering-callout sites:
  - `src/screens/Offerer.tsx` (invite + polite-defer reply branches)
  - `src/screens/Joiner.tsx` (reply branch)
  - Each callout switched to `className="inline-flex items-center gap-2"`.
- DesignSystem: added a dedicated `Spinner` row above the info callout, and
  renamed the existing "Callout — info" row to "Callout — info (with spinner)"
  since the gathering preview now carries the spinner inline.
- Scope kept to `gathering` per the ticket's stated default; `connecting` state
  was not touched.
- Spinner lives in `src/components/` per the ticket's stated preference (matches
  `Callout`'s location).
- `npm run ci` clean (format / typecheck / lint / test).
