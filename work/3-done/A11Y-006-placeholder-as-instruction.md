# A11Y-006: Critical instruction lives only in placeholder text (Offerer answer textarea)

**Status:** Resolved **WCAG:** 3.3.2 Labels or Instructions (Level A), 1.4.3
Contrast (Minimum) (Level AA) **Severity:** Medium **Location:**
`src/screens/Offerer.tsx` (line 87)

## Problem

```tsx
<label htmlFor="answer-input" ...>Paste their reply code</label>
<textarea
  id="answer-input"
  ...
  placeholder="They'll send back a long string. Paste it here."
/>
```

The label "Paste their reply code" gives the field its accessible name, but the
operational guidance — that the user is expected to paste a long string that
they will receive from their friend in a separate channel — exists only in the
`placeholder` attribute. Placeholder text:

- Disappears as soon as the user types or pastes any value, so it cannot be
  re-read while filling in the field.
- Is not consistently exposed to screen readers, and when it is, it is typically
  conflated with the accessible name.
- In many browsers renders with low contrast against the input background, often
  below WCAG 1.4.3 AA. The current input uses `bg-slate-900` with no explicit
  `placeholder-*` color override, so it falls back to a browser default that is
  generally borderline.

Users with cognitive disabilities, users who pasted incorrectly and want to
recheck instructions, and screen-reader users all lose access to this guidance.

## Intended behavior

Operational instructions for completing the field should be persistently visible
and programmatically associated with the textarea, regardless of input state.

## Suggested fix

Move the instruction out of the placeholder into a visible, persistent helper
element, and associate it with the textarea via `aria-describedby`:

```tsx
<label htmlFor="answer-input" ...>Paste their reply code</label>
<p id="answer-help" className="text-xs text-slate-400">
  They'll send back a long string — paste it here.
</p>
<textarea
  id="answer-input"
  aria-describedby="answer-help"
  ...
  // placeholder can be removed or kept short (e.g., "Paste here")
/>
```

If a placeholder is retained, ensure its color meets 4.5:1 against the input
background (see also A11Y-011 for the Chat input placeholder).

## Working notes

- Confirmed the issue still exists in `src/screens/Offerer.tsx` at the
  answer-input textarea: the operational instruction ("They'll send back a long
  string. Paste it here.") only lived in `placeholder=`, with no
  `aria-describedby` association and no visible helper text.
- No tests assert against the placeholder text, so removing it doesn't break any
  contract.
- Took the suggested fix verbatim: added a visible
  `<p id="answer-help" className="text-xs text-slate-400">…</p>` directly under
  the label, wired the textarea with `aria-describedby="answer-help"`, and
  removed the placeholder attribute entirely (the visible helper makes it
  redundant, and dropping it also sidesteps the WCAG 1.4.3 placeholder-contrast
  risk called out in the ticket).
- `text-slate-400` on the surrounding `bg-slate-950`-ish background is the same
  helper-text treatment already used elsewhere (e.g. the "Keep this tab open …"
  subtitle), so this stays visually consistent with the rest of the screen.
- `npm test` → 45 passing (unchanged). `npm run lint` and `npm run typecheck`
  clean.

## Files changed

- `src/screens/Offerer.tsx` — replaced the answer-input placeholder with a
  persistent `<p id="answer-help">` helper and added
  `aria-describedby="answer-help"` on the textarea.
