---
name: work-define
description:
  Define a new work item of any type and add it to `work/1-inbox/`. Takes a type
  and a description, allocates an id, and creates the ticket file.
argument-hint: <type> <description>
---

Define a new ticket:

$ARGUMENTS

## Expected arguments

`<type> <description>`

- **type** — one of: research, design, architecture, feature, improvement,
  maintenance, a11y, refactor, bug.
- **description** — free-form. Everything after the type is forwarded.

If `$ARGUMENTS` is empty, ask the user for both. If the type is unrecognized,
list the valid types and ask again — do NOT guess.

## Type registry

| type         | prefix |
| ------------ | ------ |
| research     | RSRCH  |
| design       | DSGN   |
| architecture | ARCH   |
| feature      | FEAT   |
| improvement  | IMPRV  |
| maintenance  | MAINT  |
| a11y         | A11Y   |
| refactor     | RFCTR  |
| bug          | BUG    |

## Workflow

1. **Parse args** into `<type>` and `<description>`. Reject unknown types.
2. **Allocate id.** Read `work/journal.md` → `Next ticket numbers > <PREFIX>:`
   for the next number. Allocated id is `<PREFIX>-<NNN>`.
3. **Check for duplicates** across `work/1-inbox/`, `work/2-doing/`, and
   `work/3-done/`. If found, stop and surface it.
4. **Survey prior work in the same area.** Look beyond exact duplicates for
   historical context that should inform this ticket:
   - Scan `work/3-done/` for past tickets touching the same code, feature, or
     concern. Read the bodies, not just the filenames.
   - Skim `git log` for related commits (by keyword, by affected paths).
   - Collect anything relevant — what was tried, what was rejected, decisions
     that constrain this ticket.
5. **Understand the goal.** Read the affected code/feature so you can articulate
   the intent — what value it delivers and what success looks like.
6. **Refine with the user** until you share an understanding crisp enough to
   write down. Skip when the description is already unambiguous.
7. **Write the ticket** to `work/1-inbox/<PREFIX>-<NNN>-<slug>.md`. Frontmatter
   at minimum: `id`, `type`, `status: open`, `created: <YYYY-MM-DD>`. Body
   captures the description, any details surfaced in step 6, and a **Related
   work** section linking the relevant prior tickets / commits from step 4 (omit
   the section if none apply).
8. **Log it.** Invoke the skill `/work-log` skill with
   `<PREFIX>-<NNN> — defined: <one-line summary>`. The `work-log` skill bumps
   the per-type counter.
