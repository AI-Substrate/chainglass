# Fix FX001: Close the Agent Development Loop

**Created**: 2026-03-24
**Status**: Proposed
**Plan**: [harness-workflow-runner-plan.md](../harness-workflow-runner-plan.md)
**Source**: Workshop 010 — gaps G1, G2, G3, G5 identified during live dogfooding
**Domain(s)**: _(harness)_, docs

---

## Problem

Agents can't seamlessly work on workflows because the tooling has four gaps: (1) `just wf-*` shortcuts only target the harness container, not the host dev server where real workflows live; (2) no live watching during execution; (3) no browser verification guidance; (4) AGENTS.md teaches commands but not the workflow — agents don't know the edit→run→observe→fix sequence.

## Proposed Fix

Update `just wf-*` recipes to default to the host dev server (auto-discovers via `server.json`). Add `just wf-watch` for live polling. Rewrite the AGENTS.md workflow section as a narrative playbook. Add browser verification guidance. Commit the positional-graph build fix for `.md` prompt assets.

## Domain Impact

| Domain | Relationship | What Changes |
|--------|-------------|-------------|
| _(harness)_ | Owner | justfile recipes updated, wf-watch added |
| docs | Owner | AGENTS.md rewritten for workflow playbook |
| _platform/positional-graph | Touched | Build script already fixed (commit pending) |

## Workshops Consumed

- [Workshop 010: Closing the Dev Loop](../workshops/010-closing-the-dev-loop.md) — G1 (two worlds), G2 (live streaming), G3 (browser), G5 (AGENTS.md playbook)

## Tasks

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [ ] | FX001-1 | Update `just wf-*` to default to host dev server | _(harness)_ | `justfile` | `just wf-run jordo-test` starts workflow on localhost:3000. `--container` flag routes to container. | Workshop 010 § G1, Decision D1 Option A |
| [ ] | FX001-2 | Add `just wf-watch` live polling recipe | _(harness)_ | `justfile` | `just wf-watch jordo-test` polls every 2s, clear screen, shows formatted status. Ctrl+C to stop. | Workshop 010 § G2 |
| [ ] | FX001-3 | Rewrite AGENTS.md workflow section as narrative playbook | docs | `AGENTS.md` | Section covers: starting a session, running + observing, debugging failures, editing workflows, container vs host. | Workshop 010 § G5 |
| [ ] | FX001-4 | Add browser verification guidance to AGENTS.md | docs | `AGENTS.md` | Section tells agents when to check the browser (after nodes, after failures, before commits) and how. | Workshop 010 § G3 |
| [ ] | FX001-5 | Commit positional-graph build fix for .md prompt assets | _platform/positional-graph | `packages/positional-graph/package.json` | Build script includes `cp src/features/030-orchestration/*.md dist/...`. Both prompt files in dist after `pnpm build`. | Already fixed, needs commit |

## Acceptance

- [ ] `just wf-run jordo-test` starts workflow on host dev server (not container)
- [ ] `just wf-run jordo-test --container` starts workflow in container
- [ ] `just wf-watch jordo-test` shows live-updating status every 2s
- [ ] AGENTS.md § Working on Workflows teaches the edit→run→observe→fix loop
- [ ] AGENTS.md § Browser Verification tells agents when to look at the page
- [ ] `pnpm --filter @chainglass/positional-graph build` copies `.md` prompts to dist

## Discoveries & Learnings

_Populated during implementation._

| Date | Task | Type | Discovery | Resolution |
|------|------|------|-----------|------------|
