---
name: work-retro
description:
  Sweep recently-resolved tickets and journal entries since the last retro,
  surface patterns and lessons across a fixed set of categories, walk through
  them with the human one at a time, and prepend a dated entry to
  `work/retro.md`. The truth source for "when was the last retro" is the `Last
  Retro:` line at the top of `work/retro.md` itself; if the file does not exist,
  the window opens at the beginning of time.
argument-hint: '[YYYY-MM-DD:HH:MM:SS]'
---

Run a retrospective:

$ARGUMENTS

## Expected arguments

Zero or one argument:

- _(empty)_ — read the window start from `work/retro.md`'s `Last Retro:` line.
  If the file doesn't exist, treat the start as "never" (include everything).
- `YYYY-MM-DD:HH:MM:SS` — override the window start. Use when re-running a
  retro, or when you want to retro a specific historical slice.

The window end is always "now" (the current local time when the skill runs).

## Inputs the skill reads

- `work/retro.md` — top of file, the `Last Retro: <YYYY-MM-DD:HH:MM:SS>` line.
  This is the authoritative source for the window start.
- `work/journal.md` — every bullet under `## Log` whose timestamp falls within
  the window.
- `work/3-done/*.md` — every ticket whose `resolved:` frontmatter date falls
  within the window (or `created:` if `resolved:` is absent). Pay particular
  attention to the `## Working` section of each ticket — that's where real-time
  notes live, and they're the richest signal for retro analysis.

## Categories to surface

Sweep the window and prepare observations under each of these. Don't invent
findings to fill a category — say "nothing notable" if there isn't a signal.

1. **Patterns we tightened / improvements we made** — concrete things we made
   better in code, workflow, or testing. For each: _what_ specifically, and
   _how_ we did it (cite ticket ids + file paths).
2. **Where we struggled** — bugs that took multiple passes, reverts, pattern
   sprawl, accumulated tech debt, places the workflow itself slowed us down.
   Mine the `## Working` sections for hesitation, dead ends, things tried and
   abandoned. Each one is an opportunity — name the opportunity, not just the
   pain.
3. **Themes of focus** — what did we spend our time on this window? A11y sweep?
   Test-perf push? One subsystem? Note the shape of attention, and whether it
   matched intent.
4. **More of / less of** — based on what worked and what didn't, what behaviors
   should we amplify or dampen?
5. **Start / stop** — concrete new practices to try, or current practices to
   abandon. Distinct from "more/less" in that these are binary, not dial
   adjustments.
6. **Anything else worth surfacing** — be opportunistic. Examples: a recurring
   class of bug worth a research ticket; a ticket type the workflow
   under-serves; a measurement we should start tracking; a documentation gap; a
   tool that paid off; a tool that didn't.

## Workflow

1. **Determine the window.**
   - If `$ARGUMENTS` is non-empty, parse it as `YYYY-MM-DD:HH:MM:SS` and use
     that as the start. Reject malformed input.
   - Otherwise, read the first ~10 lines of `work/retro.md`. Look for a
     `Last Retro: <YYYY-MM-DD:HH:MM:SS>` line and use that timestamp.
   - If `work/retro.md` doesn't exist, the start is "never" — include
     everything.
   - The end is the current local time (`YYYY-MM-DD:HH:MM:SS`).
   - Surface the window to the human in one line before continuing:
     `Retro window: <start> → <end> (N journal entries, M done tickets)`.

2. **Gather inputs.**
   - Filter `work/journal.md` `## Log` bullets by timestamp into the window.
   - Filter `work/3-done/*.md` by `resolved:` (fall back to `created:`) into the
     window. Read each in full — both the structured sections and the
     `## Working` notes.
   - If the window contains nothing in either source, stop and tell the human;
     don't write an empty retro.

3. **Sweep & categorize.** Build observations under each of the six categories
   above. Observations must be grounded but written at the **thematic / outcome
   altitude** — not the code-snippet altitude. See "Altitude" below.

4. **Walk through with the human, one category at a time.** For each of the six
   categories in order:
   - Present the observations you found for that category, with citations.
   - Ask the human: what resonates? what's missing? what's wrong? what's a
     decision (vs. just an observation)?
   - Capture the human's edits and decisions before moving on. Do **not**
     present all six at once — the walk-through is the point of the
     collaboration; surfacing everything in one wall of text defeats it.
   - If the human asks to skip a category, skip it.

5. **Draft the entry.** Assemble the final retro entry from the agreed-upon
   observations and decisions. Present it once for final approval before
   writing.

6. **Write the entry.** Prepend the new dated entry to `work/retro.md` (newest
   first). If the file doesn't exist, create it with the header block from
   "Output format" below. Update the `Last Retro:` line at the top of
   `work/retro.md` to the current timestamp.

7. **Log the retro in `work/journal.md`.** Append a single bullet to the top of
   `## Log` recording that the retro ran, with a one-line summary of its shape —
   e.g.
   `- <YYYY-MM-DD:HH:MM:SS> — retro — covered <N> tickets / <M> journal entries; <one-line headline of the entry>`.
   The retro itself is a workflow event worth a log entry, even though it isn't
   tied to a single ticket.

## Output format

`work/retro.md` structure (this skill owns it):

```
# Retros

Last Retro: <YYYY-MM-DD:HH:MM:SS>

Newest entries first. Each entry is one retro session.

---

## <YYYY-MM-DD>

**Window:** <start> → <end>
**Scope:** <N journal entries, M done tickets>

### Patterns we tightened
- <observation> (cites: TICKET-###, path/to/file, commit-sha)

### Where we struggled
- <observation> (cites: …)

### Themes of focus
- <observation>

### More of
- <decision or observation>

### Less of
- <decision or observation>

### Start
- <decision>

### Stop
- <decision>

### Other
- <observation>

### Action items
1. [ ] <very brief description>
(numbered checklist; one line each; absorb any "follow-ups filed" tickets here too)

---

## <previous YYYY-MM-DD>
…
```

Sections with no agreed-upon content are omitted from the entry rather than
written as "nothing notable" — the omission itself signals the silence.

## Altitude

Retro observations live at the project level — themes, scope, outcomes, and
effectiveness. Code-level specifics live in the tickets and the journal already;
surfacing them again in the retro is noise.

**What good looks like:**

> "A11y was the dominant body of work — 35 of 73 tickets (~48%). The sweep
> covered contrast, focus, landmarks, live regions, and APG patterns. The design
> system absorbed most of the recurring concerns, so future a11y tickets should
> be markedly cheaper."

**What bad looks like:**

> "A single recipe —
> `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400` —
> landed across `Heading`, `Textarea`, `Button`, ... (A11Y-007, A11Y-017,
> A11Y-021)."

The first answers "what did we accomplish and how effective were we?" The second
is a code-review summary in retro clothing.

**How to apply:**

- Lead with shape: counts, ratios, the slice of time it covered.
- Describe what was delivered as user / product / workflow impact.
- Assess effectiveness — did it land? did it stick? did it dissolve other work?
  did it leak into follow-ups?
- Cite individual tickets sparingly, only when one ticket _is_ the story (an
  architectural pivot, a revert, a multi-round bug). Avoid enumerating every
  contributing ticket.
- Skip token names, file paths, code recipes, and configuration knob names
  entirely. If a reader wants the mechanism, the ticket has it.

## What this skill does NOT do

- Does not edit code, run tests, or open tickets. If the retro surfaces work
  that should become a ticket, surface it as a recommendation in the entry and
  let the human run `/work-scope` later.
- Does not summarize ticket bodies for their own sake. The retro is about the
  meta-signal: patterns across tickets, not a per-ticket recap. The journal
  already serves that role.
- Does not run autonomously. The walk-through with the human is the point — skip
  it and you've just generated a wordy log.
