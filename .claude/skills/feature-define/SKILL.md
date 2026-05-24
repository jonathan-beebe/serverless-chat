---
name: feature-define
description: Define a feature ticket for an agent to pick up
---

(if called with no arguments tell the user they need to describe the feature
they want ticketed.)

Help me define this feature:

$ARGUMENTS

- Working directory: `__local__/work/features`.
- Next ticket number found at top of `./log.md` > `Next ticket number:`
- Ensure you understand the goal of the feature and its intended outcome. What
  is the customer value, business value, and what does a working feature
  deliver?
- Work with the user to refine the idea until you understand.
- Write the feature description into `./inbox` as a new work item with a status
  of "Open".
- Write a single log entry to `./log.md`
- Increment the next ticket number in log.
