# Fix Tasks: Phase 4: Seed Scripts, Feature Tests & Responsive Viewports

Apply in order. Re-run review after fixes.

## Critical / High Fixes

### FT-001: Preserve the existing workspace registry during `harness seed`
- **Severity**: HIGH
- **File(s)**: `/Users/jordanknight/substrate/066-wf-real-agents/harness/src/seed/seed-workspace.ts`
- **Issue**: `registerInContainer()` currently writes a brand-new one-entry `workspaces.json`, which can delete unrelated workspaces/preferences.
- **Fix**: Replace the whole-file write with an upsert/read-modify-write flow that preserves existing registry entries and only updates the harness seed workspace.
- **Patch hint**:
  ```diff
  - const registry = { version: 1, workspaces: [seedWorkspace] };
  - write /root/.config/chainglass/workspaces.json with that payload
  + const current = readExistingRegistry();
  + const next = upsertHarnessWorkspace(current, seedWorkspace);
  + write the merged registry back atomically
  ```

### FT-002: Make `harness seed` fail when verification fails
- **Severity**: HIGH
- **File(s)**: `/Users/jordanknight/substrate/066-wf-real-agents/harness/src/cli/commands/seed.ts`
- **Issue**: The CLI only checks `registered`; it still returns `status:"ok"` when `verified` is false.
- **Fix**: Treat failed verification as an error/degraded result and surface the verification details in the envelope.
- **Patch hint**:
  ```diff
  - if (!result.registered) {
  + if (!result.registered || !result.verified) {
      exitWithEnvelope(formatError(...));
    }
  ```

### FT-003: Encode the real seeded-data UI checks in Playwright
- **Severity**: HIGH
- **File(s)**: `/Users/jordanknight/substrate/066-wf-real-agents/harness/tests/smoke/seed-verification.spec.ts`
- **Issue**: The durable test never checks the sidebar label or the visible worktree list, even though the task dossier says those outcomes are required.
- **Fix**: Navigate to `/workspaces`, assert `Harness Test Workspace` is visible, then open the workspace detail page and assert the seeded worktree row(s) render.
- **Patch hint**:
  ```diff
  - const found = ws.find((w) => w.slug === 'harness-test-workspace');
  - expect(found).toBeDefined();
  + await cdpPage.goto('/workspaces', { waitUntil: 'domcontentloaded' });
  + await expect(cdpPage.getByText('Harness Test Workspace')).toBeVisible();
  + await cdpPage.goto('/workspaces/harness-test-workspace', { waitUntil: 'domcontentloaded' });
  + await expect(cdpPage.getByText('main')).toBeVisible();
  ```

### FT-004: Restore Full-TDD evidence in the phase artifacts
- **Severity**: HIGH
- **File(s)**: `/Users/jordanknight/substrate/066-wf-real-agents/docs/plans/067-harness/tasks/phase-4-seed-tests-responsive/execution.log.md`, `/Users/jordanknight/substrate/066-wf-real-agents/docs/plans/067-harness/tasks/phase-4-seed-tests-responsive/tasks.md`
- **Issue**: The execution log has no task-level RED/GREEN evidence, and the task table still shows T003-T009 as incomplete.
- **Fix**: Update task statuses to reflect reality and append concrete commands/results/artifact paths for the delivered seed, smoke, and responsive work.
- **Patch hint**:
  ```diff
  - ## Task Log
  + ## Task Log
  + - RED: <failing command + output>
  + - GREEN: <passing command + output>
  + - Evidence: harness/results/..., test counts, observed UI details
  ```

## Medium / Low Fixes

### FT-005: Put MCP smoke coverage on the advertised smoke path
- **Severity**: MEDIUM
- **File(s)**: `/Users/jordanknight/substrate/066-wf-real-agents/harness/src/cli/commands/test.ts`, `/Users/jordanknight/substrate/066-wf-real-agents/harness/tests/smoke/mcp-smoke.test.ts`
- **Issue**: `harness test --suite smoke` does not execute the MCP smoke test, and the current MCP assertion does not pin the expected tool names.
- **Fix**: Add a CLI-visible smoke path for MCP coverage (or move it into a suite the CLI already runs) and assert the expected Next.js MCP tool names.

### FT-006: Use the sidebar Sheet state contract directly in the mobile responsive test
- **Severity**: MEDIUM
- **File(s)**: `/Users/jordanknight/substrate/066-wf-real-agents/harness/tests/responsive/sidebar-responsive.spec.ts`
- **Issue**: The mobile assertion relies on bounding-box heuristics instead of the documented mobile Sheet state.
- **Fix**: Assert the stable `data-state` / role / aria contract on the mobile Sheet content instead of inferring behavior from geometry.

### FT-007: Update the plan/docs traceability artifacts
- **Severity**: LOW
- **File(s)**: `/Users/jordanknight/substrate/066-wf-real-agents/docs/plans/067-harness/harness-plan.md`, `/Users/jordanknight/substrate/066-wf-real-agents/docs/project-rules/harness.md`
- **Issue**: The Domain Manifest does not cover the full phase-4 file set, and the harness-specific `*.spec.ts` convention is not ratified against the base rules.
- **Fix**: Add the missing manifest rows/globs and document the Playwright naming exception (or rename the suites).

## Re-Review Checklist

- [ ] All critical/high fixes applied
- [ ] Re-run `/plan-7-v2-code-review` and achieve zero HIGH/CRITICAL
