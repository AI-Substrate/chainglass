# Fix FX004: Lock In the Harness Feedback Loop Philosophy

**Created**: 2026-03-09
**Status**: Complete
**Plan**: [agent-runner-plan.md](../agent-runner-plan.md)
**Source**: Workshop 004 — philosophy is operational but not documented prominently enough for future developers and agents
**Domain(s)**: `_platform/harness` (docs, agent templates)

---

## Problem

The harness feedback loop — where agents test the product, write retrospectives with "magic wand" suggestions, and those suggestions become real fixes — is already operational (FX002 proves it). But the philosophy is scattered across agent prompt files and buried in project-rules. A new developer or agent reading CLAUDE.md, the harness README, or the root README would have no idea this vibe exists. The pattern for new agents (mandatory retrospective fields) is convention, not documented requirement.

## Proposed Fix

Add the feedback loop philosophy to every surface a developer or agent would encounter:
1. CLAUDE.md — so every agent session knows the vibe
2. harness/README.md — Philosophy section, "From Retrospective to Fix" workflow, mandatory checklist
3. docs/project-rules/harness.md — expanded feedback loop section
4. README.md (root) — repo differentiator
5. Agent creation template guidance

## Workshop Consumed

- [004-harness-feedback-loop-philosophy.md](../workshops/004-harness-feedback-loop-philosophy.md) — full philosophy, gap analysis, prescribed content for each file

## Domain Impact

| Domain | Relationship | What Changes |
|--------|-------------|-------------|
| `_platform/harness` | Modify | Documentation updates across 4 files |

## Tasks

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [ ] | FX004-1 | Add "Harness Feedback Loop" section to CLAUDE.md | `_platform/harness` | `CLAUDE.md` | Section exists after Harness Commands, explains philosophy + agent creation guidance | See workshop Update 1 for exact content |
| [ ] | FX004-2 | Add "Philosophy: Agents Improving the Product" section to harness README | `_platform/harness` | `harness/README.md` | Philosophy section with proof table, virtuous cycle explanation, dogfooding framing | See workshop Update 2. Place after Quick Start, before CLI Commands |
| [ ] | FX004-3 | Update agent creation checklist to enforce mandatory retrospective | `_platform/harness` | `harness/README.md` | "Creating a New Agent" section lists retrospective as MUST, references smoke-test template | See workshop Update 3 |
| [ ] | FX004-4 | Add "From Retrospective to Fix" workflow section to harness README | `_platform/harness` | `harness/README.md` | Section documents the 5-step loop: read → FX task → implement → re-run → record | See workshop Update 4 |
| [ ] | FX004-5 | Expand feedback loop section in project-rules/harness.md | `_platform/harness` | `docs/project-rules/harness.md` | Section includes "Feedback Loop in Practice" with mandatory retrospective guidance | See workshop Update 5 |
| [ ] | FX004-6 | Add feedback loop mention to root README.md | `_platform/harness` | `README.md` | One paragraph describing the feedback loop as a repo differentiator | See workshop Update 6 |
| [ ] | FX004-7 | Run `just fft` — all tests pass | N/A | N/A | Lint + format + typecheck + tests green | Doc-only changes but lint still applies |

## Acceptance

- [ ] CLAUDE.md has "Harness Feedback Loop" section
- [ ] harness/README.md has Philosophy section with proof table (FX002 + FX003)
- [ ] harness/README.md agent creation checklist says retrospective is mandatory
- [ ] harness/README.md has "From Retrospective to Fix" workflow
- [ ] docs/project-rules/harness.md has expanded feedback loop guidance
- [ ] Root README.md mentions feedback loop
- [ ] A new developer reading these docs understands the vibe within 2 minutes
- [ ] `just fft` passes

## Discoveries & Learnings

_Populated during implementation._

| Date | Task | Type | Discovery | Resolution |
|------|------|------|-----------|------------|
