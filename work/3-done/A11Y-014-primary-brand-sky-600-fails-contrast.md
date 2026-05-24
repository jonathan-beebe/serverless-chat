# A11Y-014: Primary brand surface (`bg-sky-600` + `text-white`) fails WCAG 1.4.3 color contrast (AA)

**Status:** Resolved **WCAG:** 1.4.3 Contrast (Minimum) — Level AA **Severity:**
High **Location:**

- `src/components/Chat.tsx` lines 142-146 (outgoing message bubble — `isMe`
  branch)
- `src/components/Button.tsx` line 15 (primary variant — base + hover)
- `src/design-system/DesignSystem.tsx` line 61 (brand swatch documenting
  `sky-600` as the brand/primary token)

## Problem

The app's primary brand surface pairs `bg-sky-600` (`#0284C7`) with `text-white`
(`#FFFFFF`). At the rendered text sizes used on those surfaces, that color pair
does **not** clear the WCAG AA 4.5:1 ratio required for normal text.

### Worked contrast math

Using the WCAG 2.x relative-luminance formula
`(L_lighter + 0.05) / (L_darker + 0.05)`:

| Foreground   | Background                           | Hex pair               | Ratio          | AA normal (4.5:1) | AA large (3:1) |
| ------------ | ------------------------------------ | ---------------------- | -------------- | ----------------- | -------------- |
| `text-white` | `bg-sky-600`                         | `#FFFFFF` on `#0284C7` | ≈ **4.06 : 1** | FAIL              | pass           |
| `text-white` | `bg-sky-500` (hover)                 | `#FFFFFF` on `#0EA5E9` | ≈ **3.13 : 1** | FAIL              | pass           |
| `text-white` | `bg-sky-700` (proposed)              | `#FFFFFF` on `#0369A1` | ≈ **5.36 : 1** | pass              | pass           |
| `text-white` | `bg-sky-800` (proposed deeper hover) | `#FFFFFF` on `#075985` | ≈ **7.30 : 1** | pass              | pass           |

Sky-600 sRGB → relative luminance ≈ 0.2086; white luminance = 1.000 →
`(1.000 + 0.05) / (0.2086 + 0.05) ≈ 4.06`.

### Why "large text" doesn't rescue this

WCAG defines "large text" as 18pt (~24px) or 14pt (~18.66px) **bold**. None of
the affected surfaces clear that bar:

- **Chat outgoing bubble** (`Chat.tsx:144`) renders at `text-sm` (14px) with
  default weight — clearly normal text. 4.5:1 applies.
- **Primary `Button` size `md`** (`Button.tsx:23`) renders at
  `text-sm font-medium` — `font-medium` is 500, which is **not** bold, and 14px
  < 18.66px anyway. 4.5:1 applies.
- **Primary `Button` size `lg`** (`Button.tsx:24`) renders at
  `text-base font-medium` — 16px medium, still neither 24px nor 18.66px-bold.
  4.5:1 applies.
- **Primary `Button` size `sm`** (`Button.tsx:22`) renders at `text-sm` (14px),
  no weight override → default 400. 4.5:1 applies.

So every primary button label and every outgoing chat message currently fails
AA.

### Surfaces affected

- **Live chat — outgoing messages.** `Chat.tsx:144-146`:
  `isMe ? 'bg-sky-600 text-white' : ...`. High-frequency, content-critical
  surface; this is what users actually read while chatting.
- **Every primary CTA in the app.** `Button.tsx:15`:
  `primary: 'bg-sky-600 text-white hover:bg-sky-500'`. Used for "Start a chat",
  "Connect", "Send", and the primary action on every screen.
- **Hover state of primary buttons** is _worse_ — `hover:bg-sky-500` on white
  text is only ~3.13:1 (also fails AA for normal text; barely clears AA-large).
- **Design System brand swatch.** `DesignSystem.tsx:61` documents `sky-600` as
  the brand/primary token, so whichever fix is chosen should be reflected in the
  swatch so the design-system page stays the source of truth.

(Note: a closely related contrast issue was filed separately for the chat
timestamp inside the outgoing bubble — `text-sky-100/80` on `bg-sky-600` at
10px. That's tracked elsewhere; this ticket only covers the body text / button
label on the same brand surface.)

## Intended behavior

All non-large text against the primary brand surface should clear 4.5:1 contrast
(WCAG 1.4.3 AA), in both the resting and hover states. The primary brand surface
should remain visually recognizable as "sky/cyan", but accessible to users with
low vision.

## Suggested fix

Pick one of the following directions; option 1 is the smallest diff and is
recommended.

1. **Promote the brand token from `sky-600` → `sky-700` everywhere `text-white`
   sits on top of it.** Concretely:
   - `Chat.tsx:145` → `isMe ? 'bg-sky-700 text-white' : '...'`
   - `Button.tsx:15` → `primary: 'bg-sky-700 text-white hover:bg-sky-800'`
     (darken on hover instead of lighten — lightening on hover is what causes
     the hover failure; many design systems intentionally darken on hover for
     exactly this reason).
   - `DesignSystem.tsx:61` brand swatch updated from `sky-600` → `sky-700` so
     the design system reflects the new brand token.
   - Update the time-stamp tint inside the outgoing bubble (`Chat.tsx:154`,
     currently `text-sky-100/80`) only if the timestamp contrast ticket calls
     for it — out of scope here.

2. **Keep `bg-sky-600` and switch the foreground to a deep navy** (e.g.,
   `text-slate-900`). Mathematically this clears AA easily, but it inverts the
   brand expression (dark-on-light brand chip rather than light-on-dark), so
   it's a bigger design call. Probably not what we want.

3. **Introduce a semantic Tailwind alias** (`brand`, `brand-hover`, `on-brand`)
   that maps to `sky-700` / `sky-800` / `white` via theme extension, and replace
   all `bg-sky-600 text-white` call sites with the alias. Same visual outcome as
   option 1, but centralizes future brand tweaks in `tailwind.config`. Worth
   doing if the team expects to iterate on brand color again.

Whichever option is chosen, verify all four states with a contrast checker after
the change:

- primary button at rest (`bg-* + text-white`)
- primary button hover (`hover:bg-* + text-white`)
- primary button focus-visible ring (already `ring-sky-400` against page
  background — verify it still has 3:1 against whatever surrounds the button per
  WCAG 1.4.11 Non-text Contrast; not strictly in scope but worth checking while
  touching this code)
- outgoing chat bubble at rest

Also update / extend the existing Button contrast test (`Button.test.tsx:11-14`,
`:62`) that asserts `bg-sky-600` so the new token is the asserted value and a
regression test prevents the brand color from being silently downgraded to a
failing shade in the future.

## Acceptance

- All primary `<Button>` instances (variant=primary, sizes sm/md/lg) achieve ≥
  4.5:1 contrast between the rendered label and the button background in both
  resting and hover states. Verified with a contrast checker (e.g., axe
  DevTools, Chrome DevTools color picker, or `getComputedStyle` + the WCAG
  luminance formula).
- Outgoing chat bubble (`isMe` branch in `Chat.tsx`) achieves ≥ 4.5:1 contrast
  between the message body text and the bubble background.
- Design System brand swatch (`DesignSystem.tsx:61`) reflects the chosen brand
  token so the design-system page is consistent with shipped components.
- `Button.test.tsx` updated to assert the new brand token (no stale `bg-sky-600`
  assertions left if the token moves).
- No regressions in existing tests (`App.test.tsx`, `Button.test.tsx`,
  `Chat.test.tsx` and any design-system tests).
- Dark mode unaffected (the failing pair is the same in both themes since
  `text-white` on `bg-sky-600` doesn't depend on the user's theme).

## Working notes

- **Confirmed the issue still exists at HEAD.** `grep "sky-600"` in `src/`
  returned all three call sites named in the ticket (`Button.tsx:15`,
  `Chat.tsx:145`, `DesignSystem.tsx:62`) plus the `Button.test.tsx` assertions
  at lines 14 and 62. No other `sky-600` consumers in app code.
- **Picked Option 1** (smallest diff): promote the brand token from `sky-600` →
  `sky-700` everywhere `text-white` sits on top of it, and darken on hover
  (`hover:bg-sky-500` → `hover:bg-sky-800`) so the hover state also clears AA.
  Did not pursue Option 3 (semantic Tailwind alias) because there are only three
  call sites and no signal the team is iterating on brand color again right now
  — can revisit if/when the brand moves again.
- **Changes shipped:**
  - `src/components/Button.tsx:15` —
    `primary: 'bg-sky-700 text-white hover:bg-sky-800'`. Hover now darkens,
    fixing the worse-than-rest hover failure.
  - `src/components/Chat.tsx:145` — outgoing (`isMe`) bubble background is now
    `bg-sky-700`.
  - `src/design-system/DesignSystem.tsx:62` — brand swatch documents `sky-700`
    as the brand/primary token so the design-system page stays the source of
    truth.
  - `src/components/Button.test.tsx:11-17,62` — regression assertion now pins
    `bg-sky-700` + `hover:bg-sky-800` so the token can't be silently downgraded
    back to a failing shade. Added an A11Y-014 reference comment so the next
    reader knows why.
- **Contrast verification (recomputed):**
  - Primary button at rest: `text-white` on `bg-sky-700` (`#0369A1`) → ≈ **5.36
    : 1** — passes AA (4.5:1) for normal text.
  - Primary button on hover: `text-white` on `bg-sky-800` (`#075985`) → ≈ **7.30
    : 1** — passes AA and AAA for normal text.
  - Outgoing chat bubble at rest: `text-white` on `bg-sky-700` (`#0369A1`) → ≈
    **5.36 : 1** — passes AA.
  - Focus-visible ring (`ring-sky-400` = `#38BDF8`) is unchanged; against the
    page background it remains the same as before this ticket — outside this
    ticket's scope per the ticket text, and not regressed.
- **Acceptance check:**
  - Primary `<Button>` (sm/md/lg, rest + hover) → ≥ 4.5:1: yes.
  - Outgoing chat bubble body text → ≥ 4.5:1: yes.
  - Design-system brand swatch updated: yes.
  - `Button.test.tsx` no longer asserts the stale `bg-sky-600` token: yes.
  - Full test suite: **125 / 125 passed** (`npx vitest run`). No regressions.
  - Dark mode: `text-white` on `bg-sky-700` is theme-independent, so dark mode
    is unaffected as expected.
- **Out of scope (filed elsewhere / noted):** A11Y-015 (outgoing-bubble
  timestamp `text-sky-100/80` at 10px) is unchanged here but the timestamp now
  sits on `bg-sky-700` instead of `bg-sky-600`, which slightly improves its
  contrast picture — A11Y-015 should re-verify against `bg-sky-700` per the
  cross-ref in that ticket.
