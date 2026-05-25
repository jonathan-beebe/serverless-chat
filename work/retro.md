# Retros

Last Retro: 2026-05-25:12:17:03

Newest entries first. Each entry is one retro session.

---

## 2026-05-25

**Window:** never → 2026-05-25:11:52:02 **Scope:** 151 journal entries, 73 done
tickets (first retro — full project history)

### Patterns we tightened

- A11y was the dominant body of work — 35 of 73 tickets (~48%). The window
  covered the full a11y stack: contrast (text and non-text), focus management
  and focus-visible indicators, landmarks and heading hierarchy, live regions,
  and the WAI-ARIA APG menu pattern. Net effect: the design system now absorbs
  the recurring concerns, so future a11y tickets should be markedly cheaper.
  Residual risk: components that bypass the design system still escape sweeps.
- Test suite got noticeably faster and quieter. Two compounding wins reduced
  full-run wall-clock roughly in half (~12s → ~6.5s), and a guard now hard-fails
  the suite on stray React warnings. Net effect: TDD feels faster and the
  signal-to-noise of test output is back to "clean = clean."
- The architecture pivoted twice in this window, each time absorbing other open
  tickets. Path-based routing dissolved one bug and two a11y tickets in one
  move; absolute sender IDs (replacing a perspective-relative field) closed a
  recurring transcript-corruption class. Net effect: fewer symptom tickets, more
  durable foundations. Lesson the workflow learned: when a third ticket touches
  the same surface, it's worth pausing to ask whether it's an architecture
  ticket.
- The workflow itself was refactored mid-window. Moved from a single
  `work-define` to a `work-scope` + `work-write` split, added per-type "how to
  work it" files, introduced the four-stage bucket flow, and gated
  `RECOMMENDATION` by type. Net effect: tickets entering the inbox are crisper;
  solutioning has a clearer place to live (or be excluded); per-type
  expectations are codified rather than implicit.
- Foundational features landed cleanly. Persistence + resume (FEAT-012) and the
  routing model (ARCH-001) both moved the app from "demo that works once" to
  "real product." Both were substantial, both shipped with full test coverage,
  neither leaked into a follow-up bug ticket within the window — a strong signal
  that the up-front discovery on each was worth the time.

### Where we struggled

- One bug needed two rounds and a hint from the human to actually close. BUG-006
  (saved-transcript corruption) shipped a fix that was correct but partial — the
  in-memory race it patched wasn't what the user kept hitting. The deeper issue
  was an architectural fragility (perspective-relative attribution) that no
  amount of patching would defend. Lesson: when a bug reopens, that's the
  workflow's signal to question the model, not just the patch.
- An optimization shipped and reverted in the same window. The DOM-environment
  swap (IMPRV-015) proved the lever was real but hit a dependency-level blocker
  that wasn't justifiable to work around. Time wasn't wasted — the revert was
  clean and the gaps were documented for a future retry.
- A small cluster of tickets turned out to be symptoms of one missing
  architectural piece. Three a11y "link vs. button" tickets and one bug
  (BUG-008) all pointed at the same gap: the chat surface had no URL. ARCH-001
  dissolved the lot, but it took a third ticket on the same surface before the
  pattern became visible.
- An a11y sweep missed a component that bypassed the design system. A11Y-016
  swept form-control border contrast across the Textarea primitive; A11Y-026
  came back later for a raw `<input>` the sweep couldn't see. Points at a
  structural risk: sweeps are only as complete as the design-system coverage.
- A noisy test suite drifted for a while before getting cleaned. Nine `act()`
  warnings had been present long enough to be skimmed past; the default Vitest
  reporter even buffered them so they were partially invisible. Lesson: noise
  floors don't self-correct; they need a guard that hard-fails on stderr.
- A recommendation in a ticket was stale by the time work began. IMPRV-013
  suggested a Vitest config option that had been silently removed in the major
  version we were on. The maker discovered it at implementation time and
  pivoted. Lesson: `RECOMMENDATION` text ages; verify against the installed
  version.

### Themes of focus

- A11y dominated the window (35/73, ~48%). Came in waves rather than a single
  sustained sweep — early infrastructure, then a design-system extraction pass,
  then deeper APG patterns, then late cleanup of components that bypassed the
  system. Shape matches an intentional "get a11y to a defensible baseline before
  adding more product surface" push, and largely succeeded.
- Foundational feature work, not surface polish. The big-ticket items — FEAT-012
  persistence, ARCH-001 routing, FEAT-010 telemetry, FEAT-007 design system —
  were all load-bearing rather than incremental.
- Tooling and developer-experience got real attention. Roughly 1 in 5 tickets
  was about how we work rather than what we ship. High ratio but right for this
  phase.
- Bug work was concentrated, not spread. Only 8 bugs in 73 tickets (~11%), most
  in two short clusters (early stabilization, late depth catches). Cadence looks
  healthy.
- Two architectural pivots vs. zero design tickets. Design decisions were
  absorbed into other tickets rather than filed under the `DSGN` type. Shape
  observation, not necessarily a gap.

### More of

- Architectural absorbing — pause on the third symptom, ask "is this an
  architecture ticket?", roll the symptoms in. ARCH-001 was the model.
- Rich `## Working` sections. BUG-006 and BUG-007 are exemplary; the
  narrative-as-you-go style made this retro tractable.
- Per-ticket acceptance criteria with escape valves (IMPRV-015's "if blocker X,
  revert" clause). Worth borrowing for any non-trivial improvement / refactor /
  migration.
- Treating the workflow as a first-class artifact. Splitting `work-define`,
  gating `RECOMMENDATION`, codifying per-type files — all paid off. Keep
  iterating.

### Less of

- Filing the third symptom as a third symptom.
- Treating `RECOMMENDATION` text as truth without verifying against current
  state.
- Living with ambient noise (stderr, warnings, dim controls without
  explanation).

### Start

- Run `/work-retro` as a recurring habit (every 1–2 weeks), not a one-off.
- Track the "second ticket on the same surface" moment — pause and ask the
  systemic-vs-symptomatic question.
- Bake an escape valve into every non-trivial improvement / refactor / migration
  ticket.

### Stop

- Treating bug recurrence as "the patch was almost right." Treat it as "the
  model may be wrong" and default to research / architecture on the second
  attempt.
- Letting `RECOMMENDATION` text steer implementation without a freshness check.
- Letting noise floors accumulate. New noise introduced or noticed during a
  ticket is that ticket's responsibility.

### Other

- The two-tier structure (journal for shape, ticket bodies for depth) carried
  this retro. Keep it.
- The `0-refine` bucket isn't documented in `work/README.md` — type files
  reference it, RSRCH-001 just landed there, but the README only shows inbox →
  doing → done. Worth a one-line addition.
- Abandonment hygiene is healthy — `— ABANDONED: superseded by ARCH-001` style
  entries preserved the trail. Could be tracked as a workflow-health metric over
  time.
- No design tickets in the window despite two architectural pivots. Sanity check
  next retro: is `DSGN` under-served, or is design-absorbed-into-feature the
  natural shape?
- `/work-retro` co-evolved with this session — built mid-conversation, ran on
  itself, picked up two corrections (altitude addendum, journal-log shape).
  Worth noting the workflow is still in a phase where meta-tools and work-tools
  iterate together.

### Action items

1. [x] Document `0-refine/` bucket in `work/README.md`
2. [ ] Decide `/work-retro` cadence — `/schedule`, habit, or threshold-triggered
3. [x] Apply now: 2+ prior tickets on same surface → pause, ask if systemic
       (landed in `/work-scope` step 3)
4. [ ] Apply now: bake revert-clause into every non-trivial migration / refactor
       / improvement
5. [ ] Refine RSRCH-001 (in `0-refine/`) and promote to `1-inbox/` — six
       failure-mode hardening proposals
6. [ ] Next retro: sanity check `DSGN` under-use (zero design tickets this
       window)
7. [ ] Next retro: consider tracking abandoned-via-supersession as a
       workflow-health metric
8. [ ] Retry IMPRV-015 when happy-dom matches HTML spec on
       `history.replaceState` hashchange
