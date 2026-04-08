# Fix FX002: Unified Workflow Execution Logs

**Created**: 2026-03-26
**Status**: Complete
**Plan**: [harness-workflow-runner-plan.md](../harness-workflow-runner-plan.md)
**Source**: Workshop 012 — unified execution logs design
**Domain(s)**: _platform/positional-graph, workflow-ui, _(harness)_, docs

---

## Problem

When a workflow fails or gets stuck, there's no single place to see what happened. Data is scattered across `state.json`, `pod-sessions.json`, agent event files, drive event caches, and in-memory queues. Agents resort to manual spelunking or give up. The `--detailed` endpoint returns node statuses but not the chronological story of what happened and why.

## Proposed Fix

Build a `buildExecutionLog()` function that assembles all existing data into a unified, chronological `WorkflowExecutionLog` response. Expose via REST endpoint, CLI command, justfile shortcut, and AGENTS.md guidance. Include automatic diagnostics (stuck nodes, unwired inputs, stale locks).

## Domain Impact

| Domain | Relationship | What Changes |
|--------|-------------|-------------|
| _platform/positional-graph | Owner | New `buildExecutionLog()` in inspect module |
| workflow-ui | Owner | New `GET /logs` REST endpoint |
| _(harness)_ | Consumer | `just wf-logs` shortcut, AGENTS.md updates |
| docs | Consumer | Playbook updated with `wf-logs` as primary debug tool |

## Workshops Consumed

- [Workshop 012: Unified Execution Logs](../workshops/012-unified-execution-logs.md) — full API contract, CLI design, diagnostics rules

## Tasks

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [ ] | FX002-1 | Build `buildExecutionLog()` function | _platform/positional-graph | `packages/positional-graph/src/features/040-graph-inspect/` | Returns `WorkflowExecutionLog` with timeline, per-node detail, and diagnostics. Calls existing `getStatus()`, reads `state.json` events, `pod-sessions.json`, node output data. | Workshop 012 § Data Assembly. Reuses patterns from existing `inspect.ts`. |
| [ ] | FX002-2 | Add automatic diagnostics detection | _platform/positional-graph | Same file | `diagnostics[]` populated with: STUCK_STARTING (>60s no accept), UNWIRED_INPUT (E160), MISSING_UNIT, STALE_LOCK. Each has severity, message, and actionable fix string. | Workshop 012 § Diagnostics table |
| [ ] | FX002-3 | Create `GET /api/.../workflows/{slug}/logs` REST endpoint | workflow-ui | `apps/web/app/api/workspaces/[slug]/workflows/[graphSlug]/logs/route.ts` | Returns `WorkflowExecutionLog` JSON. Same auth pattern as `/detailed`. | Thin wrapper around `buildExecutionLog()` |
| [ ] | FX002-4 | Add `cg wf logs <slug>` CLI command | _platform/positional-graph | `apps/cli/src/commands/positional-graph.command.ts` | Human-readable timeline output (default) + `--json --pretty` for full JSON. Supports `--node`, `--errors`, `--server` flags. | Workshop 012 § CLI section. Human-readable format with timestamps, status icons, inline diagnostics. |
| [ ] | FX002-5 | Add `just wf-logs` shortcut + update AGENTS.md | _(harness)_, docs | `justfile`, `AGENTS.md` | `just wf-logs jordo-test` works. AGENTS.md playbook updated: "When something fails → `just wf-logs`". Shortcuts table includes wf-logs. | Workshop 012 § Justfile + AGENTS.md sections |

## Acceptance

- [ ] `just wf-logs jordo-test` shows chronological timeline with node transitions, timing, errors
- [ ] Stuck nodes (>60s at `starting`) get automatic `STUCK_STARTING` diagnostic with fix suggestion
- [ ] Unwired inputs show `UNWIRED_INPUT` diagnostic with `cg wf node set-input` command
- [ ] `cg wf logs jordo-test --errors` filters to just errors and diagnostics
- [ ] `cg wf logs jordo-test --node sample-coder-5c0` shows just that node's timeline
- [ ] REST endpoint returns full `WorkflowExecutionLog` JSON
- [ ] AGENTS.md teaches `wf-logs` as the primary debugging tool

## Discoveries & Learnings

_Populated during implementation._

| Date | Task | Type | Discovery | Resolution |
|------|------|------|-----------|------------|
