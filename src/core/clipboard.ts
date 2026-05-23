// CR-009: shared clipboard helper. Lifted out of `Chat.tsx`'s `onCopy` so
// the in-chat copy toolbar (FEAT-011) and the Home row-menu "Copy
// transcript" action share one implementation of the two-tier fallback.
//
// Two-tier write strategy mirrors the one `CopyBox` and FEAT-011 use:
//   1. `navigator.clipboard.writeText` — the modern path; may reject on
//      http:, sandboxed iframes, or permission-denied.
//   2. Hidden textarea + `document.execCommand('copy')` — deprecated but
//      widely implemented, works in contexts where #1 is blocked.
//
// The caller passes its own textarea ref so the manual "Ctrl+C / Cmd+C"
// path leaves the selection inside the caller's DOM (the user is one
// keystroke away from completing the copy).
//
// Return tag:
//   'copied' — at least one of the two tiers reported success. Caller
//              should show "Copied!" feedback and continue.
//   'manual' — both tiers failed. The fallback textarea (if provided) is
//              left selected so the user can finish with Ctrl+C / Cmd+C;
//              caller should surface the explanatory hint.

export type ClipboardResult = 'copied' | 'manual'

export async function copyTextToClipboard(
  text: string,
  fallbackTextarea: HTMLTextAreaElement | null,
): Promise<ClipboardResult> {
  // Primary path. `navigator.clipboard` itself may be undefined (older
  // browsers, http: contexts) — fall through silently if so.
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return 'copied'
    }
  } catch {
    // Fall through to the legacy path.
  }

  // Fallback path. Skip cleanly if no textarea was provided — the caller
  // accepts a 'manual' result in that case (nothing to select).
  if (fallbackTextarea) {
    fallbackTextarea.value = text
    fallbackTextarea.select()
    try {
      if (document.execCommand('copy')) return 'copied'
    } catch {
      // Some environments throw rather than returning false. Fall through.
    }
  }

  // Both paths failed. The textarea (if any) is left selected so the
  // caller can prompt the user to finish with a single keystroke.
  return 'manual'
}
