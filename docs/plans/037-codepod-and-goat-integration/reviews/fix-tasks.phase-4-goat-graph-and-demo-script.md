# Fix Tasks — Phase 4 (GOAT Graph and Demo Script)

## Priority 1 (Blocking)

### FT-001 — Restore Task↔Log bidirectional links
- **Severity**: CRITICAL
- **Files**:
  - `/home/jak/substrate/033-real-agent-pods/docs/plans/037-codepod-and-goat-integration/tasks/phase-4-goat-graph-and-demo-script/tasks.md`
  - `/home/jak/substrate/033-real-agent-pods/docs/plans/037-codepod-and-goat-integration/tasks/phase-4-goat-graph-and-demo-script/execution.log.md`
- **Issue**: T001-T009 rows have no `log#...` anchors in Notes.
- **Fix**:
  1. Add `log#task-...` anchor per completed task in Notes.
  2. Ensure anchors match actual execution log heading slugs.

### FT-002 — Sync plan authority footnotes into dossier
- **Severity**: HIGH
- **Files**:
  - `.../tasks/phase-4-goat-graph-and-demo-script/tasks.md`
  - `.../codepod-and-goat-integration-plan.md` (reference authority)
- **Issue**: Plan has `[^18]..[^22]`; dossier rows/stubs are not synced.
- **Fix**:
  1. Add `[^18]..[^22]` tags to relevant task Notes rows.
  2. Populate phase footnote stubs to mirror plan ledger entries.
  3. Use `plan-6a --sync-footnotes` workflow to avoid drift.

### FT-003 — Re-establish clean quality gate
- **Severity**: HIGH
- **Files**:
  - `test/unit/positional-graph/features/032-node-event-system/event-id.test.ts`
  - corresponding event-id generator implementation
- **Issue**: `just fft` fails (`expected 99 to be 100` uniqueness test).
- **Fix (TDD order)**:
  1. Reproduce failing test in isolation first.
  2. Add/adjust deterministic uniqueness test if behavior is inherently time-collision prone.
  3. Fix generator or test assumptions.
  4. Rerun `just fft` and attach output evidence to execution log.

## Priority 2 (Non-blocking but required for strict TDD audit)

### FT-004 — Make RED evidence explicit
- **Severity**: HIGH
- **Files**:
  - `.../tasks/phase-4-goat-graph-and-demo-script/execution.log.md`
  - `.../tasks/phase-4-goat-graph-and-demo-script/tasks.md`
- **Issue**: T005/T006 are merged; failing RED artifact is not independently auditable.
- **Fix**:
  1. Split RED and GREEN evidence blocks or add explicit RED command output reference.
  2. Add REFACTOR note/evidence for full RED→GREEN→REFACTOR closure.

## Priority 3 (Hardening)

### FT-005 — Guard questionId extraction
- **Severity**: MEDIUM
- **File**: `test/integration/orchestration-drive.test.ts`
- **Patch hint**:
```diff
 const questionId =
   (events.events?.[0] as { payload?: { questionId?: string } })?.payload?.questionId ??
   (events.events?.[0] as { event_id?: string })?.event_id;
+if (!questionId) {
+  throw new Error('Failed to extract questionId from question:ask event');
+}
 await answerNodeQuestion(..., questionId as string, 'blue');
```

### FT-006 — Harden marker lifecycle in recovery script
- **Severity**: MEDIUM
- **File**: `dev/test-graphs/goat/units/error-node/scripts/recovery-simulate.sh`
- **Patch hint**:
```diff
-  touch "$MARKER"
   cg wf node error "$CG_GRAPH_SLUG" "$CG_NODE_ID" \
     --code DELIBERATE_FAIL --message "First run fails deliberately" \
     --workspace-path "$CG_WORKSPACE_PATH"
+  touch "$MARKER"
   exit 1
```
