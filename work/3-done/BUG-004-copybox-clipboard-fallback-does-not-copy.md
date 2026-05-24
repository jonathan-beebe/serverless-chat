# BUG-004: `CopyBox` clipboard fallback selects without copying and gives no UI signal

**Status:** Resolved **Severity:** High (blocks the invite flow in some deploy
contexts) **Location:** `src/components/CopyBox.tsx` (lines 16-26)

## Problem

The `onCopy` handler tries `navigator.clipboard.writeText(value)` and, on
failure, "falls back" by selecting the textarea text. But the fallback does not
actually put anything on the clipboard and does not tell the user that they now
need to manually press Cmd/Ctrl+C:

```tsx
const onCopy = async () => {
  try {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  } catch {
    // Clipboard can fail on http: or in restrictive iframes; fall back to selecting.
    const el = document.getElementById(
      `copybox-${label}`,
    ) as HTMLTextAreaElement | null
    el?.select()
  }
}
```

Three concrete problems with the catch branch:

1. **No actual copy.** Selecting text gets it ready for a manual keystroke; it
   does not place it on the clipboard. The user's clipboard remains unchanged.
2. **No UI signal.** `setCopied(true)` is not called, so the button still reads
   "Copy". The user gets no positive or negative feedback, walks away believing
   the link is on their clipboard, and pastes whatever they had before.
3. **Stale lookup pattern.** Resolving the textarea via
   `document.getElementById(\`copybox-${label}\`)`re-uses the label-derived id (covered for accessibility in A11Y-001) and adds a layer that's easy to break the next time someone refactors to`querySelector`
   (where the space in "Invite URL" would silently fail to match).

## Intended behavior

The Copy button should:

- put `value` on the user's clipboard whenever technically possible, OR
- if it genuinely can't, tell the user clearly that they must copy manually (and
  at minimum select the text so the keystroke works in one shot).

The user should never reach a state where the button "succeeded" silently but
nothing landed on the clipboard.

## Why this matters in this spike

The invite-URL flow is the only path by which Bob receives the connection link
from Alice. Alice is also the user most likely to hit a clipboard-disabled
context:

- Teams Web in a sandboxed iframe (the spike's stated primary distribution
  channel — see `src/screens/Offerer.tsx:72` helpText).
- `http://` local previews.
- Browsers that have blanket-denied clipboard write permission for the site.

A silent Copy failure quietly breaks onboarding for exactly the deployment Alice
is most likely to use.

## Root cause

The catch branch was written as a partial mitigation ("at least select the
text") but never closed the loop on (a) actually copying or (b) telling the
user.

## Suggested fix

Two complementary changes:

1. **Try the legacy `document.execCommand('copy')` path after the select** —
   still supported across all evergreen browsers despite being marked
   deprecated, and works in restrictive contexts where
   `navigator.clipboard.writeText` is blocked.

2. **If both paths fail, surface a visible hint** (e.g., a small "Press Ctrl+C /
   Cmd+C to copy" message under the textarea, or repurpose the existing
   `helpText` slot transiently). This needs to be announced to assistive tech
   (`role="status"`), too.

3. **While here, switch from `document.getElementById(`copybox-${label}`)` to a
   `useRef<HTMLTextAreaElement>`** — drops the label-derived id (and resolves
   A11Y-001 in passing).

Sketch:

```tsx
const textareaRef = useRef<HTMLTextAreaElement>(null)
const [needsManualCopy, setNeedsManualCopy] = useState(false)

const onCopy = async () => {
  try {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
    return
  } catch {
    /* fall through */
  }

  const el = textareaRef.current
  if (el) {
    el.select()
    try {
      if (document.execCommand('copy')) {
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
        return
      }
    } catch {
      /* fall through */
    }
  }
  setNeedsManualCopy(true)
}
```

Test cases worth adding (vitest + jsdom):

- `navigator.clipboard.writeText` resolves → "Copied!" appears.
- `writeText` rejects and `execCommand('copy')` returns `true` → "Copied!"
  appears.
- Both fail → visible "Press Ctrl+C / Cmd+C" hint appears and the textarea is
  selected.

## Related

- A11Y-001 (label-derived id is invalid as a CSS selector and brittle
  generally).

## Working notes

- Confirmed the bug still existed in `src/components/CopyBox.tsx` at HEAD: the
  `catch` branch called `textareaRef.current?.select()` and returned without
  flipping `copied` or surfacing any hint, so the user got zero feedback in
  contexts where `navigator.clipboard.writeText` is blocked.
- Added `src/components/CopyBox.test.tsx` with three vitest+jsdom cases —
  writeText-succeeds, writeText-fails-then-execCommand-succeeds, and both-fail
  (visible hint + textarea selected). The middle and last cases failed against
  the original implementation.
- Fix (smallest change that closes the loop):
  - Primary path unchanged (`navigator.clipboard.writeText`).
  - On rejection, select the textarea and attempt
    `document.execCommand('copy')`; a `true` return signals the legacy path
    succeeded → flash "Copied!".
  - If that also fails (or throws), set `needsManualCopy`, which renders a
    visible amber "Press Ctrl+C / Cmd+C to copy" hint and announces a parallel
    sentence via the existing `role="status"` sr-only region. The textarea is
    already selected at that point, so a single keystroke completes the copy.
- The ref-based textarea lookup was already in place from a prior change; no id
  munging remained to clean up.
- `npm test` (51 tests), `npm run typecheck`, and `npm run lint` all pass.
