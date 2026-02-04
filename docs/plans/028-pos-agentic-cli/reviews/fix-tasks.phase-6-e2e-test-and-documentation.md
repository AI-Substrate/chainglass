# Phase 6 Fix Tasks — REQUEST_CHANGES

**Testing Approach:** Full TDD (plan). Apply test-first where applicable.

## 1) Fix Graph Integrity Links (CRITICAL)
- **Files:**
  - `docs/plans/028-pos-agentic-cli/tasks/phase-6-e2e-test-and-documentation/tasks.md`
  - `docs/plans/028-pos-agentic-cli/tasks/phase-6-e2e-test-and-documentation/execution.log.md`
  - `docs/plans/028-pos-agentic-cli/pos-agentic-cli-plan.md`
- **Issues:** Missing task log anchors, missing footnote tags, empty Phase Footnote Stubs, plan log links mismatch.
- **Fix:**
  1. Add `execution.log.md#task-t00X-...` links in the Notes column for T001–T012.
  2. Add [^7]-[^9] tags in Notes and populate Phase Footnote Stubs to match plan ledger.
  3. Split execution.log headings to match plan anchors (T003–T006 must be separate) or update plan log links.
- **Patch hint:**
  - Add at least: `Notes: [^7] [📋](execution.log.md#task-t001-create-e2e-test-script-skeleton)` etc.

## 2) Align Phase 6 Scope (HIGH)
- **Files:** `docs/plans/028-pos-agentic-cli/pos-agentic-cli-plan.md`, `docs/plans/028-pos-agentic-cli/tasks/phase-6-e2e-test-and-documentation/tasks.md`
- **Issue:** Plan still states 3-node E2E while implementation is 7-node.
- **Fix:** Update Phase 6 summary/metrics to 3-line, 7-node (or reduce E2E to 3-node).

## 3) Rename E2E test to .test.ts (HIGH)
- **File:** `test/e2e/positional-graph-execution-e2e.ts`
- **Issue:** R-CODE-003 requires `.test.ts` suffix for test files.
- **Fix:** Rename to `test/e2e/positional-graph-execution-e2e.test.ts` and update references in docs and execution log.

## 4) Use File Outputs for `code` (HIGH)
- **Files:** `test/e2e/positional-graph-execution-e2e*.ts`, docs in `docs/how/positional-graph-execution/`
- **Issue:** `code` is declared as file but E2E uses save-output-data/get-input-data.
- **Fix:**
  - Create temp file for code, call `save-output-file`.
  - Use `get-input-file` for tester/alignment-tester where appropriate.
- **Patch hint:**
  ```diff
  - await runCli(['node','save-output-data', ..., 'code', '"..."'])
  + const codePath = path.join(workspacePath, 'code.ts');
  + await fs.writeFile(codePath, '...');
  + await runCli(['node','save-output-file', ..., 'code', codePath])
  ```

## 5) Update CLI docs/examples (MEDIUM)
- **Files:** `docs/how/positional-graph-execution/2-cli-reference.md`, `docs/how/positional-graph-execution/3-e2e-flow.md`, `tasks.md` diagrams
- **Issues:** `get-input-data` response shape mismatch; `pr_summary` used but undefined; start help text claims E170 readiness enforcement.
- **Fix:**
  - Replace `pr_summary` with `pr_title/pr_body`.
  - Update `get-input-data` examples to show `sources[]`.
  - Adjust `start` description to require `status --node` check.

## 6) Manifest / Scope Updates (MEDIUM)
- **Files:** `pos-agentic-cli-plan.md` File Placement Manifest + phase dossier.
- **Issue:** unit YAML and test-helpers changes not listed; workshop/review docs out of scope.
- **Fix:** Add entries or revert/move to owning phase.

## 7) Optional Observability Improvements (LOW)
- Preserve error metadata in `handleWfStatus` where possible.
- Print stdout/stderr on failure in E2E CLI runner (debug flag).

