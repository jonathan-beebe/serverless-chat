---
id: A11Y-030
type: a11y
status: done
created: 2026-05-24
---

# A11Y-030: Conversation Resume / More-actions buttons have identical accessible names across all rows

**WCAG:**

- 2.4.6 Headings and Labels — Level AA
- 2.4.4 Link Purpose (In Context) — Level A (intent: button purpose)

**Severity:** Medium — keyboard and screen-reader users who pull up a button
list (VoiceOver rotor, NVDA element list, JAWS "list buttons" shortcut) hear
"Resume button, Resume button, Resume button" with no way to tell which
conversation each maps to. Sighted users have the row's label visually adjacent
to the buttons, but that visual relationship is not part of the accessible name
and therefore invisible to AT in out-of-context navigation modes.

**Location:** `src/screens/Home.tsx` — inside the `ConversationRow` component,
around lines 301–316:

- Lines 303–305 —
  `<Button variant="primary" size="sm" onClick={onResume}> Resume </Button>`.
  Accessible name is the visible text: "Resume".
- Lines 307–316 —
  `<Button ref={triggerRef} variant="secondary" size="sm" aria-label="More actions" aria-haspopup="menu" aria-expanded={isMenuOpen} onClick={...}>⋯</Button>`.
  Accessible name is the `aria-label`: "More actions".

Every row in the past-chats list renders both. With N saved conversations, there
are N "Resume" buttons and N "More actions" buttons, all with identical
accessible names.

## Problem

WCAG 2.4.6 requires headings and labels to "describe topic or purpose." For a
single button in isolation, "Resume" is adequate. For a _list_ of N buttons each
named "Resume", purpose is no longer descriptive — the user cannot tell which
conversation a button resumes without visually scanning the row.

Concrete failure scenarios:

1. **Screen-reader user, VoiceOver rotor on macOS Safari.** Opens the rotor to
   "Form controls" or "Buttons" to skim available actions. Hears "Resume,
   Resume, Resume, Resume" with no row context. To find a specific conversation,
   they have to leave the rotor, return to reading order, and Tab through each
   row reading the label first.
2. **Screen-reader user, NVDA element list (Insert+F7) → Buttons.** Same shape —
   a list of N identical button names. The element list is supposed to be a fast
   index; here it's useless.
3. **JAWS user, "list buttons" shortcut (Insert+Ctrl+B).** Same.
4. **Voice-control user (Dragon NaturallySpeaking, Voice Access).** Says "click
   Resume" — voice control can't disambiguate; either picks the first or
   surfaces a number-overlay disambiguation menu. Number-overlay is functional
   but adds friction for every click.

Per the 2.4.6 advisory technique, buttons in a list that share a common visible
label should have their accessible names extended with row- identifying context.
The standard idiom: `aria-label="Resume <chat label>"` — keep the visible text
"Resume" so the visual UI doesn't change; extend the accessible name only.

The same shape applies to the More-actions trigger:
`aria-label="More actions for <chat label>"`.

## Suggested fix

Compute `label` once (the code already does this at line 257:
`const label = record.label && record.label.length > 0 ? record.label : autoLabel(record)`)
and use it in two new `aria-label` strings:

```diff
- <Button variant="primary" size="sm" onClick={onResume}>
+ <Button
+   variant="primary"
+   size="sm"
+   aria-label={`Resume ${label}`}
+   onClick={onResume}>
    Resume
  </Button>
  <div ref={containerRef} className="relative">
    <Button
      ref={triggerRef}
      variant="secondary"
      size="sm"
-     aria-label="More actions"
+     aria-label={`More actions for ${label}`}
      aria-haspopup="menu"
      aria-expanded={isMenuOpen}
      onClick={() => (isMenuOpen ? onCloseMenu() : onOpenMenu())}>
      ⋯
    </Button>
```

Three points worth noting:

- **Visible text doesn't change.** The button still reads "Resume" and the
  trigger still shows "⋯". Only the accessible name (the string AT consumes)
  gets the row label appended.
- **WCAG 2.5.3 "Label in Name" compatibility.** When an element has both visible
  text _and_ an `aria-label`, 2.5.3 requires the accessible name to include the
  visible text. `aria-label={`Resume ${label}`}` puts "Resume" at the front, so
  a voice-control user who says "click resume" still gets a hit (the accessible
  name starts with the visible word). Same for "More actions" — the trigger has
  no visible text ("⋯" is a glyph), so 2.5.3 doesn't bind; we're free to use any
  descriptive label.
- **Inside the popover menu, the three items (Rename, Copy transcript, Delete
  chat) are also rendered N times across the list.** Strictly speaking, they
  also have non-unique accessible names. But because only one popover is open at
  a time (the IMPRV-008 single-open invariant), the user is never confronted
  with N copies of "Rename" simultaneously — they see exactly three buttons
  inside one popover. Per WCAG 2.4.6's "in context" provision, that's
  acceptable. Out of scope for this ticket; mention only.

### Localization note

If/when the app is localized, `\`Resume ${label}\`` becomes an i18n concern
(string interpolation, plural forms, RTL). For v1 the template-string idiom is
fine; capture as a follow-up if the i18n design locks in a different pattern.

## Acceptance

- The Resume `<Button>` at `src/screens/Home.tsx:303–305` carries
  `aria-label={\`Resume ${label}\`}`.
- The More-actions trigger `<Button>` at lines 307–316 carries
  `aria-label={\`More actions for
  ${label}\`}`(replacing the existing fixed`aria-label="More actions"`).
- The visible button text ("Resume" and "⋯") is preserved unchanged.
- The existing `aria-haspopup` / `aria-expanded` attributes on the trigger are
  preserved.
- A test in the Home tests (`src/screens/Home.test.tsx` or wherever) asserts
  that with two conversations of different labels, the two Resume buttons have
  different accessible names (`Resume Foo` / `Resume Bar`), and similarly for
  the More-actions triggers.
- Existing tests for resume / rename / delete / copy-transcript flows pass
  unchanged.
- `npm test`, `npm run lint`, `npm run typecheck` clean.
- Manual smoke with VoiceOver (macOS Safari) or NVDA (Firefox/Chrome on
  Windows):
  - With two or more conversations in the past-chats list, open the rotor /
    element list filtered to Buttons.
  - Confirm Resume buttons are named "Resume Chat from May 22, 2026" / "Resume
    Standup notes" / etc. — one row per visible chat.
  - Confirm More-actions triggers similarly named.

## Related work

- **A11Y-004** (resolved, commit 07e2b93) — chat sender conveyed only visually;
  same family of "contextual sr-only / aria-label so AT understands the row
  context." Pattern this ticket follows.
- **IMPRV-008** (resolved) — single-open invariant for the row menu; rationale
  for not propagating contextual labels into the popover items.
- **IMPRV-009** (resolved) — Copy transcript action; same row context.
- **FEAT-012** (resolved) — Resume conversation feature; original feature this
  ticket follows up on.

## Working

**2026-05-24** — Implemented per the suggested diff. The Resume `<Button>` in
`src/screens/Home.tsx` now sets `aria-label={\`Resume
${label}\`}`(the visible text "Resume" stays, satisfying WCAG 2.5.3 Label in Name since the accessible name starts with the visible word). The More-actions trigger changed from a fixed`aria-label="More
actions"`to`aria-label={\`More actions for ${label}\`}`; the trigger has only a
glyph so 2.5.3 doesn't bind.

Test fallout: three existing queries used
`getByRole('button', { name: /^resume$/i })` which the new dynamic name fails.
Loosened the anchors to `/^resume\b/i` so the existing assertions keep meaning
"the Resume button" without overfitting. Added a new A11Y-030 test that seeds
two rows with distinct labels and asserts each Resume / More-actions pair has
the expected row-specific name. `npm test` → 379/379. Lint + typecheck clean.
