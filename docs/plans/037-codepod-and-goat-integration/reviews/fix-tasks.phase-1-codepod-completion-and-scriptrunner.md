# Fix Tasks — phase-1-codepod-completion-and-scriptrunner

## Priority 1 (CRITICAL/HIGH) — Full TDD order

### FT-001 — Rebuild execution evidence and link graph
- **Files**:
  - `docs/plans/037-codepod-and-goat-integration/tasks/phase-1-codepod-completion-and-scriptrunner/execution.log.md`
  - `docs/plans/037-codepod-and-goat-integration/tasks/phase-1-codepod-completion-and-scriptrunner/tasks.md`
  - `docs/plans/037-codepod-and-goat-integration/codepod-and-goat-integration-plan.md`
- **Actions**:
  1. Add task-level RED/GREEN/REFACTOR entries with anchors in execution log.
  2. Update task statuses/log links in dossier and plan phase table.
  3. Add and sync footnotes for each changed file (plan ledger is canonical).

### FT-002 — Add missing ScriptRunner contract test (T002b)
- **File**: `test/contracts/script-runner.contract.test.ts` (recommended naming for Vitest discovery)
- **Test-first**:
  1. Write shared assertions for `IScriptRunner`.
  2. Run same assertions against `FakeScriptRunner` and `ScriptRunner`.
- **Patch hint**:
```diff
+describe('IScriptRunner contract', () => {
+  for (const makeRunner of [makeFakeRunner, makeRealRunner]) {
+    it('captures exit/stdout/stderr parity', async () => { /* shared expectations */ });
+  }
+});
```

### FT-003 — Add explicit AC-02 env contract assertions
- **File**: `test/unit/positional-graph/features/030-orchestration/pod.test.ts`
- **Test-first**:
  1. Extend `passes inputs as env vars to runner` (or add dedicated test).
  2. Assert `CG_GRAPH_SLUG`, `CG_NODE_ID`, `CG_WORKSPACE_PATH`.
- **Patch hint**:
```diff
+expect(history[0].env.CG_GRAPH_SLUG).toBe('graph-1');
+expect(history[0].env.CG_NODE_ID).toBe('code-1');
+expect(history[0].env.CG_WORKSPACE_PATH).toBe('/tmp/work');
```

### FT-004 — Fail fast if work unit load fails in ODS
- **Files**:
  - `packages/positional-graph/src/features/030-orchestration/ods.ts`
  - `test/unit/positional-graph/features/030-orchestration/ods.test.ts`
- **Test-first**:
  1. Add RED test for `workUnitService.load()` returning errors/undefined/non-code unit.
  2. Assert ODS returns explicit error and does not create pod.
- **Patch hint**:
```diff
 const loadResult = await this.deps.workUnitService.load(ctx, node.unitSlug);
+if (loadResult.errors.length > 0 || !loadResult.unit || loadResult.unit.type !== 'code') {
+  return { ok: false, error: { code: 'SCRIPT_PATH_RESOLUTION_FAILED', message: `...` }, request };
+}
```

## Priority 2 (MEDIUM)

### FT-005 — Enforce ScriptRunner timeout
- **Files**:
  - `packages/positional-graph/src/features/030-orchestration/script-runner.ts`
  - `test/unit/positional-graph/features/030-orchestration/script-runner.test.ts`
- **Actions**:
  1. Add timeout timer in `run()` to terminate process group.
  2. Add deterministic timeout test (fast timeout + sleep script).

### FT-006 — Validate resolved script path containment
- **File**: `packages/positional-graph/src/features/030-orchestration/ods.ts`
- **Actions**:
  1. Resolve/normalize joined path.
  2. Verify path stays under `.chainglass/units/<unitSlug>/`.

### FT-007 — Scope documentation for `package.json` export edits
- **File**: `docs/plans/037-codepod-and-goat-integration/tasks/phase-1-codepod-completion-and-scriptrunner/tasks.md`
- **Actions**:
  1. Add explicit task/justification for export-map changes.
  2. Link change to compilation/import requirement evidence.

## Revalidation Commands
```bash
pnpm test -- --run test/contracts/script-runner.contract.test.ts
pnpm test -- --run test/unit/positional-graph/features/030-orchestration/pod.test.ts
pnpm test -- --run test/unit/positional-graph/features/030-orchestration/ods.test.ts
pnpm test -- --run test/unit/positional-graph/features/030-orchestration/script-runner.test.ts
just fft
```

