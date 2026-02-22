# Fix Tasks — Phase 1 (Subtask 001)

## 1) CRITICAL/HIGH — Security guard for file output metadata (tests-first)
**Files**
- `test/unit/positional-graph/features/040-graph-inspect/inspect.test.ts`
- `packages/positional-graph/src/services/positional-graph.service.ts`

**Task**
1. Add RED test: output value `data/outputs/../../secret.txt` must not be read and must not expose metadata.
2. Implement path containment check under node `data/outputs` before file reads.

**Patch hint**
```diff
- const filePath = this.pathResolver.join(nodeDir, value as string)
+ const outputsDir = this.pathResolver.join(nodeDir, 'data', 'outputs')
+ const relPath = (value as string).slice('data/outputs/'.length)
+ const filePath = this.pathResolver.resolvePath(outputsDir, relPath)
+ if (!this.pathResolver.normalize(filePath).startsWith(this.pathResolver.normalize(outputsDir))) continue
```

## 2) HIGH — Prevent whole-inspect failure on node config read errors (tests-first)
**Files**
- `test/unit/positional-graph/features/040-graph-inspect/inspect.test.ts`
- `packages/positional-graph/src/services/positional-graph.service.ts`

**Task**
1. Add RED test: corrupted/missing node config should keep inspect response available for other nodes.
2. Wrap per-node `loadNodeConfig()` with non-fatal handling and preserve existing orchestrator settings.

## 3) HIGH — Remove silent failure in file metadata enrichment
**Files**
- `packages/positional-graph/src/services/positional-graph.service.ts`

**Task**
- Replace `catch {}` with explicit warning/error accumulation including `graphSlug`, `nodeId`, `outputKey`, and path context.

## 4) HIGH — Complete Test Doc blocks to satisfy Full TDD doctrine
**File**
- `test/unit/positional-graph/features/040-graph-inspect/inspect.test.ts`

**Task**
- For each new ST002/ST003/ST004 test doc block, include all 5 required fields:
  - Why
  - Contract
  - Usage Notes
  - Quality Contribution
  - Worked Example

## 5) MEDIUM — Strengthen AC-6 coverage
**File**
- `test/unit/positional-graph/features/040-graph-inspect/inspect.test.ts`

**Task**
- Add explicit assertions for:
  - `waitForPrevious: true` enrichment path
  - `contextFrom` populated path
  - `noContext: true` path

## 6) MEDIUM — Fix hardcoded workspace path in test
**File**
- `test/unit/positional-graph/features/040-graph-inspect/inspect.test.ts`

**Task**
- Replace hardcoded `/workspace/.chainglass/...` with context-derived root/path resolver-driven path construction.

## 7) HIGH — Repair governance evidence graph (plan/dossier/log/footnotes)
**Files**
- `docs/plans/040-graph-inspect-cli/graph-inspect-cli-plan.md`
- `docs/plans/040-graph-inspect-cli/tasks/phase-1-inspectgraph-service-method-unit-tests/001-subtask-enrich-inspectresult-data-model.md`
- `docs/plans/040-graph-inspect-cli/tasks/phase-1-inspectgraph-service-method-unit-tests/001-subtask-enrich-inspectresult-data-model.execution.log.md`
- `docs/plans/040-graph-inspect-cli/tasks/phase-1-inspectgraph-service-method-unit-tests/tasks.md`

**Task**
1. Add task→log anchors for ST001-ST008 and reverse backlinks in log sections.
2. Add `Plan Task` + `Dossier Task` metadata lines in each log section.
3. Replace placeholder footnote ledger with concrete [^N] entries and sync dossier stubs.
4. Add [^N] references on modified task rows.
5. Sync parent T008 notes/status/log link with subtask completion.

## 8) Validation rerun (required)
```bash
pnpm vitest run test/unit/positional-graph/features/040-graph-inspect/inspect.test.ts
just fft
```
Then rerun `/plan-7-code-review --phase "Phase 1: InspectGraph Service Method + Unit Tests" --plan "/home/jak/substrate/033-real-agent-pods/docs/plans/040-graph-inspect-cli/graph-inspect-cli-plan.md" --subtask 001-subtask-enrich-inspectresult-data-model`.
