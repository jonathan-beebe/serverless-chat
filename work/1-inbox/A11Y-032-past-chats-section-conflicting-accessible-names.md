---
id: A11Y-032
type: a11y
status: open
created: 2026-05-24
---

# A11Y-032: Home "Past chats" section has conflicting accessible names (aria-label + nested h2)

**WCAG:**

- 2.5.3 Label in Name — Level A
- 1.3.1 Info and Relationships — Level A

**Severity:** Low–Medium — sighted users see "Past chats"; screen-reader users
hear "Past conversations region". The two names disagree. Voice-control users
(Dragon, Voice Access) who say "click past chats" cannot target the region
because the accessible name doesn't contain the visible heading text.

**Location:** `src/screens/Home.tsx:418–419`

```tsx
// lines 418–419
<section aria-label="Past conversations" className="w-full text-left">
  <h2 className="mb-2 text-sm font-semibold text-stone-700 dark:text-stone-300">Past chats</h2>
```

The `<section>` is given an explicit accessible name via
`aria-label="Past conversations"`. The first child of that `<section>` is an
`<h2>` with visible text "Past chats". These two names disagree.

## Problem

Two related WCAG concerns:

### 1. WCAG 2.5.3 Label in Name (Level A)

When an interactive or named UI element has visible text, the accessible name
must contain that visible text. A `<section>` with both visible heading text
("Past chats") and an `aria-label` ("Past conversations") puts the two in
conflict — the accessible name doesn't contain the visible text.

For voice-control users (Dragon NaturallySpeaking, Voice Access, Voice Control
on macOS / iOS), this is a hard blocker. The user looks at the page, sees "Past
chats", and says "go to past chats" or "click past chats". The voice-control
engine searches the accessibility tree for that phrase; the only match is the
`<section>` whose name is "Past conversations" — no match. The command fails.

(Strictly, 2.5.3 binds to elements with a control role — buttons, links, form
controls. A bare `<section>` doesn't have a control role. So this isn't a
textbook 2.5.3 failure. It's still a name-conflict defect — the 1.3.1 angle
below is the harder normative hit.)

### 2. WCAG 1.3.1 Info and Relationships (Level A)

`<section>` becomes an exposed `region` landmark **only** when it has an
accessible name. Without an `aria-label` / `aria-labelledby`, it's a plain HTML
grouping element that doesn't appear in the AT's landmark list. The
`aria-label="Past conversations"` here promotes it to a landmark — which is a
decision worth interrogating: is this surface really top-level enough to deserve
a landmark slot? Probably not. It's a list of past chats below the primary
"Start a chat" CTA, within the `<main>` landmark; promoting it to a region adds
one more landmark to skim without commensurate value.

The `<h2>Past chats</h2>` already provides a semantic heading the user can
navigate to via the heading shortcut (H in NVDA, Cmd+Option+H in VoiceOver).
That's the canonical way to navigate to a subsection inside a landmark. A
redundant region landmark doesn't add value.

## Suggested fix

Two acceptable directions; option (b) is the recommended one.

**Option (a) — keep the region, point the label at the heading.**

Give the `<h2>` an `id` and replace `aria-label` with `aria-labelledby`:

```diff
- <section aria-label="Past conversations" className="w-full text-left">
-   <h2 className="mb-2 text-sm font-semibold text-stone-700 dark:text-stone-300">Past chats</h2>
+ <section aria-labelledby="past-chats-heading" className="w-full text-left">
+   <h2 id="past-chats-heading" className="mb-2 text-sm font-semibold text-stone-700 dark:text-stone-300">Past chats</h2>
```

After this change, the section's accessible name comes from the visible `<h2>`
("Past chats"). 2.5.3 holds (accessible name = visible text); 1.3.1 holds (the
relationship is programmatic).

**Option (b) — drop the region landmark; let the heading do the work.**

```diff
- <section aria-label="Past conversations" className="w-full text-left">
+ <section className="w-full text-left">
    <h2 className="mb-2 text-sm font-semibold text-stone-700 dark:text-stone-300">Past chats</h2>
```

After this change, the `<section>` is a plain grouping element (no accessible
name, no landmark exposure). The `<h2>` remains as the heading-navigable signal.
AT users find it via the heading list (one of the most common SR navigation
idioms) and the visible / accessible names no longer conflict because there's
only one — the heading text.

Option (b) is recommended because:

- The past-chats list isn't a top-level landmark in the user's mental model.
  It's a subsection inside the Home `<main>`.
- Heading navigation already handles this case; promoting to a region is
  redundant.
- Fewer landmarks → cleaner landmark list, faster AT navigation.

### What "drop the aria-label" preserves

- The `<h2>` continues to render visibly with the same styling.
- The `<section>` continues to group the heading + list visually (the
  `w-full text-left` classes are preserved).
- Heading shortcuts in SRs continue to land on "Past chats" `<h2>`.
- The `<ul>` and conversation rows inside are untouched.

### Why a `<section>` without a name is fine

Per WAI-ARIA, `<section>` without an accessible name has implicit role `generic`
(formerly `region` without name was undefined). HTML5 explicitly calls this case
out as valid: `<section>` is for thematic grouping, and the spec doesn't require
an accessible name. The element keeps its structural role; it just doesn't
promote to a landmark.

## Acceptance

Recommended (option (b)):

- The `<section>` at `src/screens/Home.tsx:418` no longer carries
  `aria-label="Past conversations"`.
- The `<h2>Past chats</h2>` at line 419 is preserved unchanged (visible text,
  font tokens, dark-mode tokens, margin token).
- The `<ul>` and `ConversationRow` children at lines 420–434 are untouched.
- A test in the Home tests asserts:
  - The `<section>` does not have an `aria-label` (or, equivalently,
    `getByRole('region', { name: /past conversations/i })` returns nothing —
    pattern matches how the existing tests probe landmark presence).
  - The `<h2>` with text "Past chats" is present.
- The `<section>` continues to wrap the heading + list visually (the layout test
  in the existing Home suite passes unchanged).
- `npm test`, `npm run lint`, `npm run typecheck` clean.
- Manual smoke with NVDA / VoiceOver:
  - Open the AT's landmark list. Confirm "Past conversations" is no longer
    present (only the page's `<main>` landmark remains for this screen).
  - Open the AT's heading list. Confirm "Past chats" (level 2) is present and
    navigates to the section.

If option (a) is chosen instead:

- `<h2>` gets `id="past-chats-heading"`.
- `<section>` swaps `aria-label="Past conversations"` for
  `aria-labelledby="past-chats-heading"`.
- The section's accessible name becomes "Past chats" (matches visible heading).

## Related work

- **A11Y-002** (resolved) — landmark `<main>` on every screen; this ticket fits
  the same family of "landmarks should reflect real structure, not be sprinkled
  on for completeness."
- **A11Y-013** (resolved) — design-system duplicate main/h1 — same family of
  landmark/labelling discipline.
- **A11Y-018** (resolved) — `role="log"` on the right element; "named the
  surface AT navigates to" reasoning.
- **FEAT-012** (resolved) — Resume conversation; this section was added by that
  feature.
