# Fix Tasks — Phase 1: InspectGraph Service Method + Unit Tests

## 1) CRITICAL — Rebuild evidence graph links
1. Update `docs/plans/040-graph-inspect-cli/tasks/phase-1-inspectgraph-service-method-unit-tests/execution.log.md` with task-by-task entries (T001..T009) including:
   - `**Plan Task**: 1.x` backlink
   - `**Dossier Task**: T00x` backlink
   - RED/GREEN/REFACTOR checkpoints
2. Update phase dossier task table (`tasks.md`) Notes/Log columns with matching anchors.
3. Sync plan task table statuses + log links.

## 2) CRITICAL — Add required Test Doc blocks (tests-first)
File: `test/unit/positional-graph/features/040-graph-inspect/inspect.test.ts`
- Add 5-field Test Doc block per promoted test (`Why`, `Contract`, `Usage Notes`, `Quality Contribution`, `Worked Example`).
- Keep behavior unchanged; documentation-only test metadata update.

## 3) HIGH — Add missing Phase 1 tests before changing implementation
File: `test/unit/positional-graph/features/040-graph-inspect/inspect.test.ts`
- Add RED tests for:
  - 6-node complete graph requirement
  - explicit `eventCount` assertions
  - explicit `questions` extraction assertions
  - missing work-unit fallback (`unitType: 'unknown'`)
- Optional naming improvement: include AC IDs in test titles/comments.

## 4) HIGH — Align `inspectGraph` implementation with approved composition
File: `packages/positional-graph/src/features/040-graph-inspect/inspect.ts`
- Implement planned composition path (`loadNodeConfig`, work unit resolution/fallback) or log deviation in plan/deviation ledger with approval.
- Ensure behavior satisfies new RED tests from Task 3.

## 5) HIGH — Remove silent failure path
File: `packages/positional-graph/src/features/040-graph-inspect/inspect.ts`
- Replace broad `catch {}` around output reads with explicit error capture.
- Surface diagnostics in `InspectResult.errors` or structured node-level error details.

## 6) HIGH — Footnote authority sync
Files:
- `docs/plans/040-graph-inspect-cli/graph-inspect-cli-plan.md`
- `docs/plans/040-graph-inspect-cli/tasks/phase-1-inspectgraph-service-method-unit-tests/tasks.md`
- Add concrete `[^N]` ledger entries with FlowSpace node IDs for all changed files.
- Ensure numbering is sequential and synchronized between plan and dossier.

## 7) Validation rerun (required)
```bash
pnpm vitest run test/unit/positional-graph/features/040-graph-inspect/inspect.test.ts
just fft
```
Then rerun `/plan-7-code-review` for this phase.
