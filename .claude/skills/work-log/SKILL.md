---
name: work-log
description:
  Append a single-line entry to the global work journal at `work/journal.md`.
  Pass the ticket id (e.g. `BUG-003`, `FEAT-012`) and a short event description.
  This skill owns the journal file format and the per-type ticket-number
  counters.
argument-hint: <TICKET-###> <entry text>
---

Append an entry to the work journal:

$ARGUMENTS

## Expected arguments

- **Ticket id** — `<PREFIX>-<NNN>` where prefix is one of `RSRCH`, `DSGN`,
  `ARCH`, `FEAT`, `IMPRV`, `MAINT`, `A11Y`, `RFCTR`, `BUG`.
- **Entry text** — single line. May include a status suffix (e.g. `— started`,
  `— resolved`, `— RESOLVED: <details>`).

If `$ARGUMENTS` is empty, ask the user for the ticket id and the entry text. If
the ticket id prefix is not one of the known prefixes, stop and ask.

## Workflow

- Journal path: `work/journal.md` (always — this skill writes only here).
- Generate the current local time as `YYYY-MM-DD:HH:MM:SS` (24-hour).
- Insert the new entry as the first bullet under `## Log`, so the log stays
  sorted newest-first: `- YYYY-MM-DD:HH:MM:SS — TICKET-### — <entry text>`
- If the entry text contains a ticket id whose numeric part equals the current
  `Next ticket numbers > <PREFIX>:` value, increment that counter by 1.
- Leave every other line of the file untouched.
- This skill only appends. It does not edit, resolve, or move existing entries —
  callers should append a new resolution-style entry instead.

## Journal structure (this skill owns it)

```
# Work Journal

## Next ticket numbers

- RSRCH: <N>
- DSGN: <N>
- ...

## Log

- YYYY-MM-DD:HH:MM:SS — FEAT-002 — short description
- YYYY-MM-DD:HH:MM:SS — BUG-001 — short description
```
