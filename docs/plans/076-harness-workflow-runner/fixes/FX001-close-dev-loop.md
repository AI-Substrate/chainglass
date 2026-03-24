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
| [ ] | FX001-1 | Update `just wf-*` to default to host dev server | _(harness)_ | `justfile` | `just wf-run jordo-test` starts workflow on localhost:3000. `--container` flag routes to container. Uses `git rev-parse --show-toplevel` for workspace path. | Workshop 010 § G1, DYK #5 |
| [ ] | FX001-2 | Add `just wf-watch` append-only live polling | _(harness)_ | `justfile` | `just wf-watch jordo-test` polls every 2s, appends timestamped status to stdout + file at `.chainglass/watch.log`. No `clear`. Auto-stops on terminal state. `tail -f .chainglass/watch.log` works. | Workshop 010 § G2, DYK #4 |
| [ ] | FX001-3 | Rewrite AGENTS.md — two environments, playbook, preflight | docs | `AGENTS.md` | Reframe harness section: host = real data, container = sandbox. Both valid. Add `just preflight` guidance. Narrative edit→run→observe→fix flow. Remove contradictory "NEVER bypass" language. | Workshop 010 § G5, DYK #1, #2, #3 |
| [ ] | FX001-4 | Add browser verification guidance to AGENTS.md | docs | `AGENTS.md` | Section tells agents when to check the browser (after nodes, after failures, before commits) and how. | Workshop 010 § G3 |
| [ ] | FX001-5 | Add `just preflight` host-side freshness checks | _(harness)_ | `justfile` | Checks: CLI build fresh, dev server running, workspace registered. Prints actionable errors. Prompted in AGENTS.md. | DYK #2 |
| [ ] | FX001-6 | Commit positional-graph build fix for .md prompt assets | _platform/positional-graph | `packages/positional-graph/package.json` | Build script includes `cp src/features/030-orchestration/*.md dist/...`. Both prompt files in dist after `pnpm build`. | Already fixed, needs commit |

## Acceptance

- [ ] `just wf-run jordo-test` starts workflow on host dev server (not container)
- [ ] `just wf-run jordo-test --container` starts workflow in container
- [ ] `just wf-watch jordo-test` appends timestamped status to stdout + `.chainglass/watch.log`
- [ ] `just wf-watch` auto-stops on terminal state (completed/failed/stopped)
- [ ] `just preflight` checks CLI freshness, dev server, workspace — actionable errors
- [ ] AGENTS.md frames host + container as two valid environments (not one forbidden)
- [ ] AGENTS.md § Working on Workflows teaches edit→run→observe→fix loop
- [ ] AGENTS.md § Browser Verification tells agents when to look at the page
- [ ] `pnpm --filter @chainglass/positional-graph build` copies `.md` prompts to dist

## Discoveries & Learnings

_Populated during implementation._

| Date | Task | Type | Discovery | Resolution |
|------|------|------|-----------|------------|
| 2026-03-24 | FX001-3 | DYK #1 | AGENTS.md "NEVER bypass harness" contradicts host-default wf-* shortcuts | Reframe: two environments (host + container), both valid. Remove contradictory mandate |
| 2026-03-24 | FX001-1 | DYK #2 | Host path needs fresh CLI build — agents will forget | New FX001-5: `just preflight` checks CLI freshness, dev server, workspace. Prompted in AGENTS.md |
| 2026-03-24 | FX001-3 | DYK #3 | Container = sandbox with seeded data, host = real data. Both valid development paths | Frame as "pick the right one for the task" not "develop then validate" |
| 2026-03-24 | FX001-2 | DYK #4 | `clear` in wf-watch destroys scroll-back — errors vanish | Append-only with timestamps + write to `.chainglass/watch.log` for `tail -f` |
| 2026-03-24 | FX001-1 | DYK #5 | `$(pwd)` breaks from subdirectories | Use `git rev-parse --show-toplevel` for workspace path in all host recipes |
