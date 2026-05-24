# A11Y-010: Chat empty-state text fails color contrast

**Status:** Resolved **WCAG:** 1.4.3 Contrast (Minimum) (Level AA) **Severity:**
Low **Location:** `src/components/Chat.tsx` (line 35)

## Problem

```tsx
<ol ... className="... bg-slate-900/50 p-3">
  {messages.length === 0 && (
    <li className="text-sm text-slate-500">No messages yet. Say hello.</li>
  )}
  ...
</ol>
```

The empty-state copy uses `text-slate-500` (`#64748b`) on a `bg-slate-900/50`
background. The transcript sits inside the body, whose background is `#0f172a`
(also slate-900), so the effective backdrop is approximately `#0f172a`. Contrast
for `#64748b` against `#0f172a` is roughly **3.94:1**, below the WCAG 1.4.3 AA
threshold of **4.5:1** for normal text. `text-sm` is 14px, which does not
qualify as large text (≥18px regular or ≥14pt bold).

This is the first and only message a new user sees on the Connected view before
the conversation starts, so it matters.

## Intended behavior

The placeholder copy should be visible and meet AA contrast against its
background.

## Suggested fix

Bump the color one step lighter:

```tsx
<li className="text-sm text-slate-400">No messages yet. Say hello.</li>
```

`text-slate-400` (`#94a3b8`) on `#0f172a` is ~6.4:1, comfortably above AA.

Alternative: brighten the transcript background (`bg-slate-800/50`) and re-check
contrast, or increase the font size to ≥18px to fall under the large-text
threshold (3:1) — but the color change is the simplest fix.

## Working notes

- Verified the issue still exists at `src/components/Chat.tsx:57`: the
  empty-state `<li>` uses `text-slate-500` (#64748b).
- Container is `bg-slate-900/50` over a `slate-900` body (per `index.html`
  `theme-color="#0f172a"`), so the effective backdrop is `#0f172a`. Contrast
  `#64748b` on `#0f172a` ≈ 3.94:1, which fails AA for 14px normal text.
- Applied the suggested fix: switched the empty-state class to `text-slate-400`
  (#94a3b8), which yields ~6.4:1 against `#0f172a` (passes AA).
- Scope kept tight to the empty-state line only; other `text-slate-500` usages
  (e.g., input `placeholder-slate-500`) are tracked under separate tickets
  (A11Y-011) and not touched here.
- Ran `npx vitest run src/components/Chat.test.tsx` — all 6 tests pass. Existing
  tests don't assert on the empty-state class, and the textual content is
  unchanged, so no test updates needed.
