# Phase 2: CLI Telemetry Enhancement — Tasks

**Plan**: [harness-workflow-runner-plan.md](../../harness-workflow-runner-plan.md)
**Phase**: Phase 2: CLI Telemetry Enhancement
**Spec**: [harness-workflow-runner-spec.md](../../harness-workflow-runner-spec.md)
**Created**: 2026-03-17
**Status**: Complete

> **Problem Context**: See `harness-workflow-runner-spec.md § Problem Context`

## Tasks

| Status | ID | Task | Domain | Done When |
|--------|-----|------|--------|-----------|
| [x] | T2.1 | Add `--detailed` flag to `cg wf show` — combines getStatus + loadGraphState + pod sessions | _platform/positional-graph | `cg wf show test-workflow --detailed --json` returns per-node status with id, unitSlug, type, timing, sessionId, blockedBy, errors |
| [x] | T2.2 | Add `--json-events` flag to `cg wf run` — emits DriveEvents as NDJSON lines | _platform/positional-graph | `cg wf run test-workflow --json-events` prints one JSON per line per DriveEvent |
| [x] | T2.3 | Add GH_TOKEN pre-flight check to `cg wf run` | _platform/positional-graph | `cg wf run` without GH_TOKEN exits 1 with clear error message |
| [x] | T2.4 | Verify telemetry by running workflow and inspecting output | _platform/positional-graph | Raw command output captured in execution.log.md |

## Acceptance Criteria

- [x] AC-3: ONBAS decisions visible per iteration (via --json-events iteration data)
- [x] AC-4: ODS dispatches visible (via --json-events iteration data)
- [x] AC-14: `cg wf show --detailed` returns node-level status with per-node state, timing, pod session info

## Code Review Fix Tasks

| Status | ID | Severity | Fix |
|--------|-----|----------|-----|
| [x] | FT-001 | HIGH | Repair `--detailed` output: use correct field names (lineId, nodeId, unitType), use getReality() instead of constructing PodManager directly |
| [x] | FT-002 | HIGH | Create tasks.md and execution.log.md with evidence |
| [x] | FT-003 | MEDIUM | Route through getReality() instead of importing orchestration internals |
| [x] | FT-004 | LOW | Update positional-graph domain history |
