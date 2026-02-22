# Fix Tasks: Phase 2 — Readiness Gate and Status Pipeline

## Priority 1 (Blocking)

### FT-001 (CRITICAL) Sync plan↔dossier footnotes
- **Files**:
  - `/home/jak/substrate/033-real-agent-pods/docs/plans/039-advanced-e2e-pipeline/tasks/phase-2-readiness-gate-and-status-pipeline/tasks.md`
  - `/home/jak/substrate/033-real-agent-pods/docs/plans/039-advanced-e2e-pipeline/advanced-e2e-pipeline-plan.md`
- **Issue**: Plan has `[^2]` but phase footnote stubs and task notes are unsynced.
- **Fix**:
  1. Add `[^2]` references into relevant completed task Notes rows.
  2. Populate `## Phase Footnote Stubs` row for `[^2]` to mirror plan ledger.
  3. Keep plan as canonical authority.
- **Patch hint**:
```diff
-| | | |
+| [^2] | T002-T004,T001 | contextFromReady gate + wiring + tests |
```

### FT-002 (HIGH) Add bidirectional task↔log links
- **Files**:
  - `/home/jak/substrate/033-real-agent-pods/docs/plans/039-advanced-e2e-pipeline/tasks/phase-2-readiness-gate-and-status-pipeline/tasks.md`
  - `/home/jak/substrate/033-real-agent-pods/docs/plans/039-advanced-e2e-pipeline/tasks/phase-2-readiness-gate-and-status-pipeline/execution.log.md`
- **Issue**: No `log#anchor` links in task Notes; log entries missing `Dossier Task` and `Plan Task` metadata.
- **Fix**:
  1. Add anchors per task section (`### T001...`).
  2. Add Notes links in tasks table.
  3. Add explicit backlink metadata under each task log subsection.
- **Patch hint**:
```diff
+**Dossier Task**: T002
+**Plan Task**: 2.3
```

### FT-003 (HIGH) Sync plan progress table log/notes columns
- **File**: `/home/jak/substrate/033-real-agent-pods/docs/plans/039-advanced-e2e-pipeline/advanced-e2e-pipeline-plan.md`
- **Issue**: Phase 2 rows show `Log` as `-` and no footnote references.
- **Fix**: Fill each 2.1–2.6 row with `[📋](tasks/phase-2-readiness-gate-and-status-pipeline/execution.log.md#...)` and footnote refs.

### FT-004 (HIGH) Convert ledger to FlowSpace node-ID provenance
- **File**: `/home/jak/substrate/033-real-agent-pods/docs/plans/039-advanced-e2e-pipeline/advanced-e2e-pipeline-plan.md`
- **Issue**: `[^2]` uses plain file list; missing node-id format.
- **Fix**: Replace/add node references in `file:path:symbol` style for changed file/method/function entries.

## Priority 2 (Doctrine)

### FT-005 (HIGH) Add required Test Doc blocks to new tests
- **File**: `/home/jak/substrate/033-real-agent-pods/test/unit/positional-graph/can-run.test.ts`
- **Issue**: New Gate 5 tests lack full 5-field Test Doc comments required by project rules.
- **Fix (test-first compliant)**:
  1. For each new test, add Test Doc with Why, Contract, Usage Notes, Quality Contribution, Worked Example.
  2. Keep assertions unchanged.

## Verification after fixes
```bash
pnpm test -- --run can-run
pnpm test -- --run agent-context
just fft
```
