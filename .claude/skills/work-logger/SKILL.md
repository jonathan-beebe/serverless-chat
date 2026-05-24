---
name: work-logger
description:
  Append a single-line entry to a work `log.md` in the given working directory.
  Pass in the parent directory of the `log.md` file, the ticket name as
  `DOMAINSLUG-###`, and the log event description. This skill owns appending it
  to the log file structure.
---

(If no arguments are passed, ask the user for the working directory and the
entry text.)

Append an entry to a work log:

$ARGUMENTS

Parse the arguments as:

- **Working directory** — where `log.md` lives (e.g. `__local__/work/features`).
- **Ticket name** — e.g. `BUG-003` or `A11Y-013`.
- **Entry text** — a single line description, optionally with a resolution
  suffix (e.g. `— resolved` or `— RESOLVED: <details>`).

## Workflow

- Resolve the log path to `<working-directory>/log.md`.
- If the file does not exist, create it with the skeleton in **Log structure**
  below. Infer the heading from the directory name (e.g. `bugs/` → "Bug Audit
  Log", `features/` → "Feature Log", `accessibility/` → "Accessibility Audit
  Log", `improvements/` → "Code Review Audit Log"); default to "Work Log".
- Append the given entry as a new bullet at the end of the `## Log` section:
  `- <entry>`.
- If the entry contains a ticket id matching `[A-Z]+-\d+` whose numeric part
  equals the current "Next ticket number", increment that number by 1.
- Leave every other line of the file untouched.
- This skill only appends. It does not edit, resolve, or move existing entries —
  callers that want to mark an entry resolved should edit the line themselves,
  or append a new resolution-style entry.

## Log structure (this skill owns it)

```
# <Domain> Log

Next ticket number: <N>

## Log

- YYYY-MM-DD:HH:MM:SS — TICKET-002 — short description
- YYYY-MM-DD:HH:MM:SS — TICKET-001 — short description
```

The log template is `{DATE_TIME} — {TICKET-###} — {short_description}`

Where:

- `{DATE_TIME}` is the current local time formatted as `YYYY-MM-DD:HH:MM:SS`
  using a 24 hour clock.
- `{TICKET-###}` is the name of the ticket.
- The `{short_description}` is whatever log message was passed in.

Rules

- Generate the current date/time.
- Addd the new entry to the top of the list, so it is sorted descending.
- You do not touch the `Next ticket number` line.
