# A11Y-011: Chat input placeholder fails color contrast

**Status:** Resolved (commit d519020) **WCAG:** 1.4.3 Contrast (Minimum) (Level
AA) **Severity:** Medium **Location:** `src/components/Chat.tsx` (lines 53-61)

## Problem

```tsx
<label htmlFor="chat-input" className="sr-only">Message</label>
<input
  id="chat-input"
  type="text"
  ...
  placeholder={disabled ? 'Waiting for connection…' : 'Type a message'}
  className="... bg-slate-900 ... placeholder-slate-500 ..."
/>
```

`placeholder-slate-500` (`#64748b`) on `bg-slate-900` (`#0f172a`) yields a
contrast ratio of approximately **3.94:1**, below the WCAG 1.4.3 AA threshold of
**4.5:1** for normal text.

This matters more than for a typical placeholder because the visible `<label>`
is `sr-only`. Sighted users have only the placeholder to tell them what the
field is for. The placeholder is therefore acting as the field's visible label,
which under WCAG should meet contrast minimums.

## Intended behavior

The placeholder should be legible to sighted users on the dark input background.

## Suggested fix

Brighten the placeholder one step:

```diff
- placeholder-slate-500
+ placeholder-slate-400
```

`text-slate-400` (`#94a3b8`) on `#0f172a` is ~6.4:1, comfortably AA.

Alternative (preferred long-term): show a real visible label above the field and
reserve the placeholder for short example text only. That removes the reliance
on placeholders as labels entirely.

## Working notes

- Confirmed the issue still exists: `src/components/Chat.tsx` line 88 still uses
  `placeholder-slate-500` on `bg-slate-900`.
  - `slate-500` (`#64748b`) on `slate-900` (`#0f172a`) ≈ 3.94:1 — below the
    4.5:1 AA threshold.
  - `slate-400` (`#94a3b8`) on `slate-900` (`#0f172a`) ≈ 6.4:1 — comfortably AA.
- The visible `<label htmlFor="chat-input">` is `sr-only`, so for sighted users
  the placeholder is effectively the field's only visible labeling. That's
  exactly the case where the suggested fix's stricter reading of 1.4.3 applies.
- Both placeholder strings — "Type a message" and "Waiting for connection…" —
  share the one `placeholder-slate-400` class, so a single class change covers
  both.
- Applied the suggested minimal fix: `placeholder-slate-500` →
  `placeholder-slate-400`. This matches the resolution pattern used for A11Y-010
  (same bump, same rationale, same background color).
- No test changes needed: the existing `Chat.test.tsx` covers auto-scroll and
  speaker attribution behaviors; placeholder styling is a CSS-class concern not
  asserted in tests, and the change is class-name-only with no behavioral
  impact.
