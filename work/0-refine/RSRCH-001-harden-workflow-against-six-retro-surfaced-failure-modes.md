---
id: RSRCH-001
type: research
status: open
created: 2026-05-25
---

# RSRCH-001: harden workflow against six retro-surfaced failure modes

## Problem

The `/work-scope` and `/work-start` workflow has six documented failure modes,
surfaced by the 2026-05-25 retro:

1. **Recurrence blindness** — N≥2 prior tickets touching the same surface don't
   trigger a "this may be systemic" prompt during scoping (BUG-008 + A11Y-031 /
   A11Y-035 / A11Y-036 took three tickets before ARCH-001 absorbed them).
2. **Patch-didn't-stick blindness** — `types/bug.md` doesn't pause and re-frame
   when a bug recurs after a fix (BUG-006 needed a round-2 architectural
   refactor; round-1 was correct-but-partial).
3. **Stale recommendations** — `RECOMMENDATION` text in tickets ages, and the
   workflow doesn't tell makers to verify it against currently-installed APIs /
   configs (IMPRV-013 `environmentMatchGlobs` miss).
4. **Sweep leakage** — "across the app" / "every X" scopes don't require
   enumeration of off-pattern instances, so sweeps silently miss components that
   bypass the design system (A11Y-016 → A11Y-026 leak).
5. **Heroic-workaround risk** — `types/improvement.md` (and `feature`,
   `refactor`) don't generalize IMPRV-015's clean-revert pattern, so blocker-hit
   work can drift into unjustified workarounds instead of being captured and
   re-routed.
6. **Noise-floor drift** — no cross-type stewardship rule for stderr / console
   warnings introduced or noticed during a ticket (BUG-007 act warnings drifted
   for many tickets before being addressed).

The workflow files at `.claude/skills/work-scope/SKILL.md`,
`.claude/skills/work-start/SKILL.md`, and `.claude/skills/work-start/types/*.md`
are where the hardening would land.

## Outcome

A research artifact exists that, for each of the six failure modes, (a) names
the precise workflow leverage point (file + section), (b) proposes the specific
guardrail text or structural change, (c) cites the source ticket(s) that
motivate it, and (d) identifies any edge cases where the guardrail should NOT
fire (so it doesn't degrade into bureaucracy).

The artifact is concrete enough that the human can accept / edit / reject each
of the six items individually, and the workflow edits can be filed as a
follow-up improvement or maintenance ticket.

## Why it matters

Each of the six failure modes cost real time in this window — multiple ticket
rounds, a revert, a three-symptom symptom chase, and a noise floor that hid real
signal. The workflow is the lever that prevents recurrence; getting the
guardrails right multiplies every future ticket. Doing the research up front
(vs. patching the workflow ad-hoc as each pattern resurfaces) honors the same
"search for systemic causes before patching" intent the retro itself surfaced.

## Discovery notes

The six failure modes above each have a proposed leverage point that surfaced
during the retro dialogue. Listing them here as **starting hypotheses** for the
research — the maker may refine, combine, split, or reject them. Each is
sketched as "where" + "what":

1. **`/work-scope` step 3 (Survey prior work)** — add a recurrence detector: if
   2+ prior `3-done` tickets touch the same surface or concern, surface that and
   ask whether the new ticket should be reframed as research / architecture.
   _Starter version landed in `/work-scope` on 2026-05-25; refine if needed._
2. **`work-start/types/bug.md`** — add a re-entry guard: if a bug recurs after a
   fix, pause the patch path and route to research / architecture before
   attempting another fix.
3. **`work-start/types/{bug,a11y,improvement,maintenance}.md`** — add a one-line
   rule that `RECOMMENDATION` is advisory and may have aged; verify the proposed
   mechanism against the currently installed state before following.
4. **`/work-scope`** — when scope-shape is sweep-like ("across the app", "every
   X"), require enumeration of off-pattern instances or explicit acceptance of
   the gap.
5. **`work-start/types/{improvement,feature,refactor}.md`** — generalize
   IMPRV-015's clean-revert pattern: on hitting a non-trivial blocker, capture
   gaps in working notes and either revert cleanly or kick out a research
   ticket; don't push through with heroic workarounds. _Open question:_ does
   this belong at the type level, or in per-ticket acceptance criteria where
   IMPRV-015 put it?
6. **Cross-type note (location TBD — possibly a shared preamble in
   `work-start/SKILL.md`)** — any new `console.error` / `console.warn` or test
   stderr introduced or noticed during a ticket is yours to address before
   commit; don't pass it on.

These are starting points, not directives. Research output may propose different
shapes — e.g. a single shared "anti-pattern" file referenced by every type, or a
checklist embedded in `/work-start`'s canonical workflow, etc.

## Related work

- BUG-006 (resolved) — perspective-relative attribution; round-1
  correct-but-partial, round-2 architectural fix on user's hint
- BUG-007 (resolved) — act-warning noise floor; fixed root cause + added
  `console.error` failure guard
- BUG-008 (abandoned, superseded by ARCH-001) — third of three symptoms before
  architectural absorption
- A11Y-016 (resolved) — form-control border contrast sweep
- A11Y-026 (resolved) — raw `<input>` contrast that the A11Y-016 sweep missed
- A11Y-031 / A11Y-035 / A11Y-036 — link-vs-button affordance tickets rolled into
  ARCH-001
- IMPRV-013 (resolved) — Vitest env split; ticket's recommendation used a Vitest
  3-removed API; maker pivoted at implementation time
- IMPRV-015 (resolved / reverted) — happy-dom swap; clean revert with gaps
  captured for future retry
- ARCH-001 (resolved) — the architectural absorber for the routing-symptom
  cluster
- 2026-05-25 retro entry in `work/retro.md` (forthcoming this session)
