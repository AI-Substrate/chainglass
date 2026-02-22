# Fix Tasks — Phase 3: Simple Test Graphs

## Priority 1 (CRITICAL)

### FT-001 — Restore Task↔Log traceability (test-first evidence integrity)
- **Files:**
  - `/home/jak/substrate/033-real-agent-pods/docs/plans/037-codepod-and-goat-integration/tasks/phase-3-simple-test-graphs/tasks.md`
  - `/home/jak/substrate/033-real-agent-pods/docs/plans/037-codepod-and-goat-integration/tasks/phase-3-simple-test-graphs/execution.log.md`
- **Issue:** completed tasks lack `log#...` anchors and execution log lacks explicit task metadata backlinks.
- **Fix path:**
  1. Add `log#task-...` anchors in each completed task Notes cell.
  2. Add `**Dossier Task**: T00X` and `**Plan Task**: 3.X` under each log heading.

### FT-002 — Restore Task↔Footnote↔File provenance
- **Files:**
  - `/home/jak/substrate/033-real-agent-pods/docs/plans/037-codepod-and-goat-integration/codepod-and-goat-integration-plan.md`
  - `/home/jak/substrate/033-real-agent-pods/docs/plans/037-codepod-and-goat-integration/tasks/phase-3-simple-test-graphs/tasks.md`
- **Issue:** no Phase 3 [^N] references, no Phase 3 ledger entries, blank stubs.
- **Fix path:**
  1. Add Phase 3 [^N] references to task notes and plan phase rows.
  2. Populate plan §12 ledger with node-IDs/file provenance for all touched paths.
  3. Populate phase footnote stubs to match plan ledger exactly.

## Priority 2 (HIGH)

### FT-003 — Make CLI availability checks portable
- **Files:**
  - `/home/jak/substrate/033-real-agent-pods/test/integration/orchestration-drive.test.ts`
  - `/home/jak/substrate/033-real-agent-pods/test/integration/test-graph-infrastructure.test.ts`
- **Issue:** absolute hardcoded `/home/jak/.../apps/cli/dist/cli.cjs` path.
- **Fix path (TDD):**
  1. Add/adjust tests to verify CLI check works when repo root differs.
  2. Replace hardcoded path with PATH-based `cg --version` probe or repo-relative resolution.

## Priority 3 (MEDIUM)

### FT-004 — Close acceptance assertion gaps
- **File:** `/home/jak/substrate/033-real-agent-pods/test/integration/orchestration-drive.test.ts`
- **Issue:** missing explicit combiner output assertion (T006) and missing graph status `failed` assertion (T008).
- **Fix path (TDD):**
  1. Add failing assertions for combiner output and graph status.
  2. Keep implementation unchanged unless assertions reveal behavior mismatch.

### FT-005 — Resolve documented scope drift
- **Files:**
  - `/home/jak/substrate/033-real-agent-pods/docs/plans/037-codepod-and-goat-integration/tasks/phase-3-simple-test-graphs/tasks.md`
  - optionally `/home/jak/substrate/033-real-agent-pods/dev/test-graphs/shared/graph-test-runner.ts`
- **Issue:** shared orchestration helper extraction conflicts with Phase 3 non-goal text.
- **Fix options:**
  - Option A: Amend plan/tasks non-goal with explicit approved exception and rationale.
  - Option B: Re-inline orchestration stack wiring in phase test file.

## Revalidation Commands
```bash
pnpm test -- --run test/integration/orchestration-drive.test.ts
pnpm test -- --run test/integration/test-graph-infrastructure.test.ts
just fft
```
