---
name: improvement-define
description: Define a code improvement ticket for an agent to pick up
---

(if called with no arguments tell the user they need to describe the improvement
they want ticketed.)

Help me define this improvement:

$ARGUMENTS

- Working directory: `__local__/work/improvements`.
- Next ticket number found at top of `./log.md` > `Next ticket number:`
- Ensure you understand the goal of the improvement and its intended outcome.
  What is the customer value, business value, and what does a working feature
  deliver?
- Work with the user to refine the idea until you understand.
- Write the code improvement description into `./inbox` as a new work item with
  a status of "Open".
- Write a single line entry to `./log.md`
- Increment the next ticket number in log.
