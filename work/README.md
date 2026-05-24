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

- `/work-define <type> <description>` — allocate an id, scan for duplicates and
  prior work, then write the ticket to `1-inbox/`.
- `/work-start [<TICKET-###>|all]` — work one ticket, or drain the inbox in
  order; routes by id prefix to the matching `types/<type>.md` steps.
- `/work-log <TICKET-###> <entry text>` — append a single line to `journal.md`.
