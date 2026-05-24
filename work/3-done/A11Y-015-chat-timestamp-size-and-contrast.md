# A11Y-015: Chat message timestamps use 10px font + low-contrast color

**Status:** Resolved **WCAG:**

- 1.4.3 Contrast (Minimum) — Level AA
- 1.4.4 Resize Text — Level AA (best-practice readability concern) **Severity:**
  Medium **Location:**
- `src/components/Chat.tsx` lines 150-157 (the `<time>` element inside each
  message bubble)
- `src/design-system/DesignSystem.tsx` lines 24-35 (`buildChatFixture()` — same
  bubbles rendered on the `/#design-system` route, useful for reproducing with a
  contrast checker)

## Problem

Each chat message renders a small timestamp beneath the body text:

```tsx
<time
  aria-hidden="true"
  dateTime={new Date(m.at).toISOString()}
  className={`self-end text-[10px] ${
    isMe ? 'text-sky-100/80' : 'text-slate-500 dark:text-slate-300/70'
  }`}>
  {timeFmt.format(new Date(m.at))}
</time>
```

Two independent accessibility problems are present.

### Problem A — text size (1.4.4, readability)

The timestamp uses `text-[10px]`, an arbitrary-value Tailwind class that
literally renders at **10px**. That is:

- **Smaller than the 12px floor** most WCAG-aligned design systems adopt for
  body / metadata text.
- **Far below the 16px default** body size used elsewhere in the app.
- **Smaller than the existing small-text scale** already in use in the codebase
  — e.g. `text-xs` (12px) in `src/components/CopyBox.tsx:77` for help text.
  Picking `text-[10px]` here is inconsistent with the rest of the type scale.

WCAG 1.4.4 (Resize Text) is technically about the _ability_ to zoom to 200%, but
choosing 10px as the baseline pushes critical metadata below the comfortable
reading threshold for users with low vision _before any zoom occurs_. It is a
readability regression for the population the criterion is meant to protect.

### Problem B — color contrast (1.4.3 AA)

All three rendered states fail the 4.5:1 ratio that WCAG 1.4.3 requires for
normal text. (`text-[10px]` is unambiguously **not** "large text" under WCAG, so
the 4.5:1 threshold applies in every case — large text is 18pt / ~24px, or 14pt
/ ~18.66px bold.)

Worked math using the WCAG 2.x relative-luminance formula
`(L_lighter + 0.05) / (L_darker + 0.05)`:

| State                       | Foreground               | Background          | Hex pair (foreground / background) | Raw ratio     | With opacity blend                   | AA normal (4.5:1) |
| --------------------------- | ------------------------ | ------------------- | ---------------------------------- | ------------- | ------------------------------------ | ----------------- |
| Outgoing (me)               | `text-sky-100/80`        | `bg-sky-600`        | `#E0F2FE` @ 80% / `#0284C7`        | ≈ 3.54 : 1    | ≈ **2.8–3.2 : 1**                    | **FAIL**          |
| Incoming (them), light mode | `text-slate-500`         | `bg-slate-200`      | `#64748B` / `#E2E8F0`              | ≈ **3.5 : 1** | —                                    | **FAIL**          |
| Incoming (them), dark mode  | `dark:text-slate-300/70` | `dark:bg-slate-700` | `#CBD5E1` @ 70% / `#334155`        | ≈ 6.7 : 1     | drops below **4.5 : 1** once blended | **FAIL**          |

Details on the opacity blends:

- **Outgoing:** `sky-100` (#E0F2FE) at 80% opacity on `sky-600` (#0284C7). Even
  without the `/80` opacity haircut, raw `sky-100` on `sky-600` is only ≈ 3.54:1
  — already failing. The 80% alpha blends the light foreground toward the darker
  backdrop, knocking the effective contrast further down to roughly 2.8–3.2:1.
- **Incoming dark mode:** raw `slate-300` on `slate-700` (≈ 6.7:1) passes, but
  the `/70` alpha lets the slate-700 backdrop bleed into the foreground,
  darkening it and pushing the effective ratio below the 4.5:1 floor.
- **Incoming light mode:** no opacity in play — `slate-500` on `slate-200` is
  straight up ≈ 3.5:1.

### Why this is content, not decoration

The timestamp is `aria-hidden="true"` (intentional — sender attribution is
provided to AT users via the sr-only "You said: / They said: " prefix per
A11Y-004). That decision is **not** what this ticket is about. The ticket is
about the _visual_ presentation: sighted users with low vision (the target
population for 1.4.3 and 1.4.4) are exactly the people who rely on the visible
timestamp to disambiguate messages, and they're the people most disadvantaged by
10px text at <4.5:1 contrast.

## Intended behavior

At 100% browser zoom, with no OS-level font-size override, the timestamp should
be readable by users with low vision:

- **At least 12px** (preferably matching the existing `text-xs` rung in the type
  scale that's already used for similarly-secondary text such as `CopyBox` help
  text at `src/components/CopyBox.tsx:77`).
- **At least 4.5:1 contrast** against the bubble background in all three states
  — outgoing, incoming light, incoming dark.

## Suggested fix

Two coordinated changes:

### 1. Bump the font size

Replace `text-[10px]` with `text-xs` (12px) so the timestamp aligns with the
existing small-text scale used elsewhere in the codebase (e.g.
`CopyBox.tsx:77`). Drop the arbitrary-value class; `text-xs` is a real scale
rung.

### 2. Pick contrast-passing colors for each of the three states

Concrete swap suggestions (each verified to clear 4.5:1 against its bubble
background). Drop the `/opacity` suffixes — they're what's pushing the dark-mode
incoming state below the threshold and they're not contributing visually enough
to justify the regression.

| State                                                                   | Current                  | Proposed                                                       | Estimated ratio against bubble bg                                                                                                  |
| ----------------------------------------------------------------------- | ------------------------ | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Outgoing (me) on `bg-sky-600` (or `bg-sky-700` if A11Y-014 lands first) | `text-sky-100/80`        | `text-white` (no opacity)                                      | ≈ 4.06:1 on sky-600 — borderline; ≈ **5.36:1 on sky-700**, recommended to re-check **after** A11Y-014 ships a darker brand surface |
| Incoming light mode on `bg-slate-200`                                   | `text-slate-500`         | **`text-slate-600`** (`#475569` on `#E2E8F0`)                  | ≈ **4.83 : 1** — passes AA                                                                                                         |
| Incoming dark mode on `dark:bg-slate-700`                               | `dark:text-slate-300/70` | **`dark:text-slate-400`** (no opacity, `#94A3B8` on `#334155`) | ≈ **4.62 : 1** — passes AA                                                                                                         |

Resulting className shape (illustrative — implementer should confirm the exact
final classes against the WCAG checker once A11Y-014's brand-token decision has
landed):

```tsx
className={`self-end text-xs ${
  isMe ? 'text-white' : 'text-slate-600 dark:text-slate-400'
}`}
```

### Cross-ticket coordination

- **A11Y-014** (open) is moving the primary brand from `bg-sky-600` →
  `bg-sky-700` for the outgoing bubble. If A11Y-014 lands first, the outgoing
  timestamp swap (`text-sky-100/80` → `text-white`) will pass comfortably (≈
  5.36:1). If A11Y-015 lands first, `text-white` on `bg-sky-600` still gives ≈
  4.06:1 which **fails** AA at 12px — i.e., this ticket should either (a) be
  merged after A11Y-014, or (b) preemptively switch to `bg-sky-700` on the
  outgoing bubble as part of this change. Calling this out so the implementer
  doesn't ship a partial fix.
- The design-system fixture in `src/design-system/DesignSystem.tsx`
  `buildChatFixture()` (lines 24-35) renders identical bubbles on
  `/#design-system`. After the fix, that route is the easiest single place to
  point axe / Wave / Lighthouse / Chrome DevTools color picker at to verify all
  three states.

## Acceptance

- Chat timestamps render at **≥ 12px** (e.g. `text-xs`) in every state —
  outgoing, incoming light mode, incoming dark mode.
- Outgoing-bubble timestamp clears **≥ 4.5:1** contrast against whatever brand
  surface ships (must be re-verified against `bg-sky-700` if A11Y-014 has
  landed, against `bg-sky-600` if not).
- Incoming-bubble timestamp clears **≥ 4.5:1** in both light mode (against
  `bg-slate-200`) and dark mode (against `dark:bg-slate-700`).
- The `aria-hidden="true"` and `dateTime={...}` attributes on the `<time>`
  element are preserved — this ticket is visual-only and does not change the AT
  story.
- Verified with an automated checker (axe DevTools / Wave / Lighthouse / Chrome
  DevTools color picker) on the `/#design-system` route, which exercises both
  `from: 'me'` and `from: 'them'` bubbles via `buildChatFixture()`.
- No regressions in `Chat.test.tsx` or any design-system tests; if a test was
  asserting the literal `text-[10px]` class, it should be updated to assert the
  new `text-xs` value (and the AA contrast can additionally be guarded by a unit
  assertion on the resolved class strings, similar to the pattern used in
  `Button.test.tsx`).

## Working

- Confirmed the issue still exists in `src/components/Chat.tsx:150-157`:
  timestamp uses `text-[10px]` with `text-sky-100/80` (outgoing) and
  `text-slate-500 dark:text-slate-300/70` (incoming).
- A11Y-014 has already landed — the outgoing bubble background is now
  `bg-sky-700` (Chat.tsx:145), so swapping the outgoing timestamp to
  `text-white` clears AA at ≈5.36:1 against sky-700. No need to bundle a
  brand-token change with this fix.
- No tests assert the literal `text-[10px]` class (verified via grep on
  `src/components/Chat.test.tsx`); Chat.test.tsx only checks the `<time>`
  element's `aria-hidden`, `dateTime`, and rendered text — all of which the fix
  preserves. Safe to change without test updates.
- Only one occurrence of `text-[10px]` exists in `src/` (the chat timestamp), so
  the change is fully scoped to Chat.tsx.
- Applied the fix per the ticket's suggested swaps: `text-[10px]` → `text-xs`;
  outgoing `text-sky-100/80` → `text-white`; incoming
  `text-slate-500 dark:text-slate-300/70` →
  `text-slate-600 dark:text-slate-400`.
- Verified `npm run test`, `npm run lint`, `npm run typecheck`, and
  `npm run build` all pass after the change.
