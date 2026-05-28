---
id: RFCTR-006
type: refactor
status: resolved
created: 2026-05-28
---

# RFCTR-006: dedupe CopyBox clipboard fallback by delegating to core/clipboard helper

## Problem

`src/components/CopyBox.tsx` (lines 73-108, inside `onCopy`) inlines its own
two-tier clipboard fallback: `navigator.clipboard.writeText` →
`document.execCommand('copy')` against the textarea ref → "manual copy" state
flip. The shared helper `copyTextToClipboard(text, fallbackTextarea)` at
`src/core/clipboard.ts` implements the same two-tier strategy with the same
`'copied' | 'manual'` return contract. Two other call sites —
`src/components/ChatCopyToolbar.tsx:76` and
`src/components/ConversationRow.tsx:6` — already delegate to the shared helper.
CopyBox is the odd one out: the inline code predates CR-009 (commit 7abd0b6),
which lifted the helper specifically so callers could share it (see the CR-009
comment at `src/core/clipboard.ts:1-4`).

## Outcome

`src/components/CopyBox.tsx` no longer contains a clipboard-write
implementation. Observable end state: (a) `CopyBox.tsx` has no references to
`navigator.clipboard` or `document.execCommand`; (b) every `*.tsx` consumer that
writes to the clipboard routes through `copyTextToClipboard` from
`src/core/clipboard.ts`; (c) the existing four `CopyBox.test.tsx` cases
(writeText success, writeText-reject + execCommand-success, both-fail + manual
hint, aria-describedby wiring) pass without modification; (d) the existing
`core/clipboard.test.ts` cases remain the canonical coverage of the fallback
strategy itself.

## Why it matters

Two textually-distinct implementations of the same fallback strategy means a
future fix (e.g. permissions handling, a new fallback tier, a Safari-specific
quirk) lands in one path but not the other, regressing whichever caller was
missed. CR-009's whole purpose was to eliminate this class of drift; CopyBox was
missed during that migration, leaving the file `src/core/clipboard.ts` exists
for in an inconsistent state.

## Discovery notes

Subtle behavioral pivot to verify: the existing CopyBox `'manual'` path relies
on the textarea already being selected by its own `el.select()` call (line 93)
before surfacing the Ctrl+C/Cmd+C hint. The shared helper also selects the
textarea inside its fallback before the `execCommand` attempt
(`src/core/clipboard.ts:43`), so the `'manual'` return implies selection
occurred — net behavior should be identical. `CopyBox.test.tsx:52-70` asserts
"textarea is selected when we surface the Ctrl+C / Cmd+C hint"; that assertion
must still pass after the swap. Also note: the helper writes
`fallbackTextarea.value = text` before selecting (line 42), while CopyBox's
inline path does not — for CopyBox this is a no-op because the textarea's
`value` is already bound to the `value` prop, but the maker should confirm
React's controlled-component model doesn't fight the imperative assignment in
the fallback path.

## Related work

- CR-009 (commit 7abd0b6 `feat(home): web share api for invite url`)
- BUG-004 (original CopyBox clipboard-fallback bug that motivated the two-tier
  strategy, commit 97ced9a)
- `src/core/clipboard.ts` and `src/core/clipboard.test.ts` (helper + its tests)
- `src/components/ChatCopyToolbar.tsx:76` and
  `src/components/ConversationRow.tsx:6` (existing migrated call sites)

## Working

- Imported `copyTextToClipboard` from `src/core/clipboard` in CopyBox and
  reduced `onCopy` to: clear stale state → call the helper → branch on
  `'copied' | 'manual'`. Net 33 lines of duplicated fallback logic gone.
- The discovery-note worry about the helper's `fallbackTextarea.value = text`
  write fighting the controlled `value={value}` prop is a non-issue in practice:
  the helper's write happens inside the synchronous fallback path and React's
  next render restores the controlled value, which is already equal to `text`
  because CopyBox passes the same `value` prop to both the textarea and the
  helper. The execCommand picks up the selection in the same tick before any
  rerender.
- All four CopyBox.test.tsx cases (writeText success, writeText-reject +
  execCommand-success, both-fail + manual hint, aria-describedby wiring) pass
  without modification — proving the swap is behaviour-preserving.
- `grep -E "navigator\\.clipboard|document\\.execCommand" src/components/CopyBox.tsx`
  is empty.
- Full suite: 569/569 green.
