// FEAT-011: pure markdown formatter for the chat transcript clipboard copy.
//
// No DOM access, no `Date.now()` reads, no globals beyond
// `Intl.DateTimeFormat(undefined, …)` — deterministic for a given input +
// locale. Producing markdown (not HTML, not a screenshot) gives the user a
// surface that pastes cleanly into GitHub, Notion, Obsidian, Discord, Slack,
// any plain-text editor, etc.
//
// Day-rollover detection mirrors `Chat.tsx`'s `buildItems` walk:
// `new Date(m.at).toDateString()` compared against the running last-day.
// Local-calendar accuracy (the user's wall clock) is what matters, not UTC.
//
// Single `\n` inside `m.text` (from a Shift+Enter Compose per FEAT-004) is
// preserved as a markdown hard break (`  \n` — two trailing spaces + newline)
// so renderers keep the in-paragraph line break instead of collapsing it as
// a soft wrap. `\n\n` paragraph breaks pass through verbatim.

import type { ChatMessage } from './rtc'

export interface FormatTranscriptOptions {
  includeTimestamps: boolean
}

// Hard-coded authorship labels. The app has no per-user name concept, and the
// labels match the existing A11Y-004 `sr-only` "You said:" / "They said:"
// speech announcements so a single source of truth covers both surfaces.
const SELF_LABEL = '**You**'
const PEER_LABEL = '**Them**'

// U+00B7 MIDDLE DOT, with a regular space on each side. Source spelling is the
// literal character (Vite + Vitest + TypeScript all handle BMP characters
// cleanly today; fall back to `·` only if a toolchain ever surprises us).
const DOT = ' · '

export function formatTranscript(messages: ChatMessage[], opts: FormatTranscriptOptions): string {
  if (messages.length === 0) return ''

  const dateFmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'full' })
  const timeFmt = new Intl.DateTimeFormat(undefined, { timeStyle: 'short' })

  const parts: string[] = []
  let lastDay: string | null = null

  for (const m of messages) {
    const date = new Date(m.at)
    const day = date.toDateString()
    const isDayChange = day !== lastDay
    lastDay = day

    if (opts.includeTimestamps && isDayChange) {
      const formatted = dateFmt.format(date)
      // The opening date is `#`; every subsequent rollover is `##`. Both are
      // followed by a blank line (achieved by the empty-string entry below).
      const prefix = parts.length === 0 ? '#' : '##'
      parts.push(`${prefix} ${formatted}`)
      parts.push('')
    }

    const label = m.from === 'me' ? SELF_LABEL : PEER_LABEL
    const heading = opts.includeTimestamps ? `${label}${DOT}${timeFmt.format(date)}` : label
    parts.push(heading)
    parts.push(renderBody(m.text))
    // Blank line between turns. The trailing-newline normalization at the
    // bottom of this function strips the final blank so we always end with
    // exactly one `\n`.
    parts.push('')
  }

  // Join on `\n` (POSIX, portable; the clipboard layer normalizes for the host
  // OS — don't emit `\r\n` even on Windows). Trim the trailing blank entry's
  // contribution and re-add a single newline so the output ends with exactly
  // one `\n` per POSIX file convention.
  let out = parts.join('\n')
  out = out.replace(/\n+$/, '') + '\n'
  return out
}

// Inside a message body, a single `\n` becomes `  \n` (markdown hard break)
// so renderers preserve the line break. `\n\n` (paragraph break) passes
// through. We use a single regex pass that targets newlines NOT already
// preceded by a newline (so `\n\n` is untouched) and NOT already preceded by
// two spaces (so we don't double-pad on re-runs).
function renderBody(text: string): string {
  return text.replace(/(?<![\n ])\n(?!\n)/g, '  \n')
}
