# Work

Tickets flow through three buckets:

- `1-inbox/` — defined but not started
- `2-doing/` — in development or under regression / validation
- `3-done/` — merged, tested, accepted

A single `journal.md` records every meaningful event across all types. Ticket
ids carry the type prefix (e.g. `BUG-003`, `FEAT-012`).

## Work types

| Prefix | Type          |
| ------ | ------------- |
| RSRCH  | research      |
| DSGN   | design        |
| ARCH   | architecture  |
| FEAT   | feature       |
| IMPRV  | improvement   |
| MAINT  | maintenance   |
| A11Y   | accessibility |
| RFCTR  | refactor      |
| BUG    | bug           |

## Skills

Defining a ticket is a two-step flow — scoping (collaborative, subjective) and
writing (deterministic). Split intentionally so the writer can't paper over
missing scope, and the scoper isn't tempted to skip ahead to file mechanics.

- `/work-scope <type> <rough description>` — dialogue with the human to produce
  a scope packet (problem, outcome, why-it-matters, related work). Surveys prior
  work, checks for duplicates, reads affected code. On approval, hands off to
  `/work-write`.
- `/work-write <type> <scope packet>` — formatter. Validates the packet,
  allocates an id, writes the ticket to `1-inbox/`, logs to `journal.md`.
  Rejects vague or solutioned packets and bounces them back to `/work-scope`.
  Call directly only when the scope is already crisp (e.g. captured in a meeting
  note).
- `/work-start [<TICKET-###>|<type>|all]` — work one ticket, drain by type, or
  drain the whole inbox; routes by id prefix to the matching `types/<type>.md`
  steps.
- `/work-log <TICKET-###> <entry text>` — append a single line to `journal.md`.
