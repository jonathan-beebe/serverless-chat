import { describe, expect, it } from 'vitest'
import { formatTranscript } from './transcript'
import type { ChatMessage } from './rtc'

// Locale-stable tests: assert substring shapes (digits, "You"/"Them", literal
// markdown markers) rather than full-locale strings so CI passes regardless of
// host locale. Where we DO want to verify a locale-formatted date or time,
// we compute the same string via `Intl.DateTimeFormat(undefined, …)` inside
// the test so it tracks the formatter implementation.

const DATE_FMT = new Intl.DateTimeFormat(undefined, { dateStyle: 'full' })
const TIME_FMT = new Intl.DateTimeFormat(undefined, { timeStyle: 'short' })

// Anchor in local time so `toDateString()` rollover behavior is independent of
// host timezone (matches the Chat.test.tsx convention).
const day1At = new Date(2026, 4, 22, 14, 5).getTime() // May 22 14:05 local
const day1AtLater = new Date(2026, 4, 22, 15, 30).getTime() // May 22 15:30 local
const day2At = new Date(2026, 4, 23, 9, 15).getTime() // May 23 09:15 local

function msg(id: string, text: string, from: ChatMessage['from'], at: number): ChatMessage {
  return { id, from, text, at }
}

describe('formatTranscript — includeTimestamps: true', () => {
  it('emits a single `# {full date}` header for a same-day conversation, with no `##` rollover headers', () => {
    const messages: ChatMessage[] = [
      msg('a', 'Hey! Did you finish the report?', 'me', day1At),
      msg('b', 'Almost done.', 'them', day1AtLater),
    ]
    const out = formatTranscript(messages, { includeTimestamps: true })
    const lines = out.split('\n')

    // First line is the `#` header with the full localized date.
    expect(lines[0]).toBe(`# ${DATE_FMT.format(new Date(day1At))}`)
    // Followed by a blank line.
    expect(lines[1]).toBe('')
    // No `##` rollover anywhere.
    expect(out.match(/^## /gm)).toBeNull()
  })

  it('emits a `## {full date}` rollover heading before the first message of each subsequent local day', () => {
    const messages: ChatMessage[] = [msg('a', 'late night', 'me', day1At), msg('b', 'next morning', 'them', day2At)]
    const out = formatTranscript(messages, { includeTimestamps: true })

    // Opening `#` is day 1.
    expect(out).toMatch(new RegExp(`^# ${escapeRegex(DATE_FMT.format(new Date(day1At)))}`))
    // A `## ` rollover for day 2 appears later in the output.
    expect(out).toContain(`## ${DATE_FMT.format(new Date(day2At))}`)
  })

  it('renders each turn as `**You** · {time}` or `**Them** · {time}` on its own line followed by the body', () => {
    const messages: ChatMessage[] = [msg('a', 'hello', 'me', day1At), msg('b', 'hi back', 'them', day1AtLater)]
    const out = formatTranscript(messages, { includeTimestamps: true })

    const expectedTimeA = TIME_FMT.format(new Date(day1At))
    const expectedTimeB = TIME_FMT.format(new Date(day1AtLater))

    expect(out).toContain(`**You** · ${expectedTimeA}\nhello`)
    expect(out).toContain(`**Them** · ${expectedTimeB}\nhi back`)
  })

  it('uses the literal U+00B7 middle-dot character (not an HTML entity)', () => {
    const messages: ChatMessage[] = [msg('a', 'hi', 'me', day1At)]
    const out = formatTranscript(messages, { includeTimestamps: true })

    // U+00B7 between **You** and the time. Asserted by codepoint.
    expect(out).toMatch(/\*\*You\*\* · /)
    // Belt-and-braces: the literal character itself, not the entity.
    expect(out).not.toContain('&middot;')
    expect(out).not.toContain('&#183;')
  })

  it('separates turns with a single blank line and ends with a single trailing newline', () => {
    const messages: ChatMessage[] = [msg('a', 'one', 'me', day1At), msg('b', 'two', 'them', day1AtLater)]
    const out = formatTranscript(messages, { includeTimestamps: true })

    // Single trailing newline, no extra blank line at the end.
    expect(out.endsWith('\n')).toBe(true)
    expect(out.endsWith('\n\n')).toBe(false)
    // No trailing whitespace on any line except deliberate hard breaks (`  \n`).
    // Single-line bodies in this fixture have no trailing whitespace.
    for (const line of out.split('\n')) {
      if (line.endsWith('  ')) continue // markdown hard break, intentional
      expect(line).toBe(line.replace(/\s+$/, ''))
    }
  })
})

describe('formatTranscript — includeTimestamps: false', () => {
  it('omits all `#` and `##` headers', () => {
    const messages: ChatMessage[] = [msg('a', 'late', 'me', day1At), msg('b', 'morning', 'them', day2At)]
    const out = formatTranscript(messages, { includeTimestamps: false })

    expect(out).not.toMatch(/^# /m)
    expect(out).not.toMatch(/^## /m)
  })

  it('renders each turn as `**Name**` on its own line followed by the body', () => {
    const messages: ChatMessage[] = [msg('a', 'hello', 'me', day1At), msg('b', 'hi back', 'them', day1AtLater)]
    const out = formatTranscript(messages, { includeTimestamps: false })

    expect(out).toContain('**You**\nhello')
    expect(out).toContain('**Them**\nhi back')
    // Defensive: must not include the middle-dot/time form anywhere.
    expect(out).not.toContain('·')
  })

  it('produces identical output for multi-day vs single-day input (date data fully suppressed)', () => {
    const singleDay: ChatMessage[] = [msg('a', 'hello', 'me', day1At), msg('b', 'world', 'them', day1AtLater)]
    const multiDay: ChatMessage[] = [msg('a', 'hello', 'me', day1At), msg('b', 'world', 'them', day2At)]
    const a = formatTranscript(singleDay, { includeTimestamps: false })
    const b = formatTranscript(multiDay, { includeTimestamps: false })
    expect(a).toBe(b)
  })

  it('ends with a single trailing newline', () => {
    const messages: ChatMessage[] = [msg('a', 'hello', 'me', day1At)]
    const out = formatTranscript(messages, { includeTimestamps: false })
    expect(out.endsWith('\n')).toBe(true)
    expect(out.endsWith('\n\n')).toBe(false)
  })
})

describe('formatTranscript — body line-break handling', () => {
  it('preserves a single `\\n` inside m.text as a markdown hard break (`  \\n`)', () => {
    const messages: ChatMessage[] = [msg('a', 'line one\nline two', 'me', day1At)]
    const out = formatTranscript(messages, { includeTimestamps: true })

    // "line one" must be followed by two spaces + newline + "line two".
    expect(out).toContain('line one  \nline two')
  })

  it('passes a `\\n\\n` paragraph break through verbatim', () => {
    const messages: ChatMessage[] = [msg('a', 'para one\n\npara two', 'me', day1At)]
    const out = formatTranscript(messages, { includeTimestamps: true })
    expect(out).toContain('para one\n\npara two')
  })

  it('does not modify long single-line bodies', () => {
    const long = 'a'.repeat(500)
    const messages: ChatMessage[] = [msg('a', long, 'them', day1At)]
    const out = formatTranscript(messages, { includeTimestamps: true })
    expect(out).toContain(long)
  })

  it('renders the same hard-break treatment when timestamps are off', () => {
    const messages: ChatMessage[] = [msg('a', 'line one\nline two', 'me', day1At)]
    const out = formatTranscript(messages, { includeTimestamps: false })
    expect(out).toContain('**You**\nline one  \nline two')
  })
})

describe('formatTranscript — edge cases', () => {
  it('returns an empty string for an empty input array', () => {
    expect(formatTranscript([], { includeTimestamps: true })).toBe('')
    expect(formatTranscript([], { includeTimestamps: false })).toBe('')
  })

  it('renders a single message with a header (timestamps on) and a blank-line trailer', () => {
    const messages: ChatMessage[] = [msg('a', 'hi', 'me', day1At)]
    const out = formatTranscript(messages, { includeTimestamps: true })

    // Header, blank, name+time line, body, trailing newline.
    expect(out.startsWith(`# ${DATE_FMT.format(new Date(day1At))}\n\n`)).toBe(true)
    expect(out).toMatch(/\*\*You\*\* · [^\n]+\nhi\n$/)
  })

  it('handles three days in sequence — opener + two rollover headers', () => {
    const day3At = new Date(2026, 4, 24, 11, 0).getTime()
    const messages: ChatMessage[] = [
      msg('a', 'day1', 'me', day1At),
      msg('b', 'day2', 'them', day2At),
      msg('c', 'day3', 'me', day3At),
    ]
    const out = formatTranscript(messages, { includeTimestamps: true })

    // One `#` opener, exactly two `##` rollover headers.
    expect(out.match(/^# /gm)).toHaveLength(1)
    expect(out.match(/^## /gm)).toHaveLength(2)
  })
})

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
