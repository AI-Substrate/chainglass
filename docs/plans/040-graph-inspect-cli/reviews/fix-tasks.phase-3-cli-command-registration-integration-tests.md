# Fix Tasks — Phase 3: CLI Command Registration + Integration Tests

## Priority 1 — CRITICAL/HIGH (must fix before re-review)

1. **Reconstruct TDD evidence chain (test-first)**
   - Files: `docs/plans/040-graph-inspect-cli/tasks/phase-3-cli-command-registration-integration-tests/execution.log.md`
   - Add explicit RED → GREEN → REFACTOR entries for T002, T005, T006, T007, T008 with command output snippets and anchors.

2. **Add required Test Doc blocks to promoted integration tests**
   - File: `test/integration/positional-graph/features/040-graph-inspect/inspect-cli.test.ts`
   - Add 5-field Test Doc block to each `it(...)` (Why, Contract, Usage Notes, Quality Contribution, Worked Example).

3. **Enforce inspect failure exit semantics**
   - File: `apps/cli/src/commands/positional-graph.command.ts`
   - After formatting output, if `result.errors.length > 0`, emit concise error summary and `process.exit(1)`.
   - Also fail for invalid `--node` target.

4. **Complete T007 required assertion (40-char truncation)**
   - File: `test/integration/positional-graph/features/040-graph-inspect/inspect-cli.test.ts`
   - Use >40 char fixture output and assert truncated text behavior in `--outputs` mode.

5. **Repair graph-linking metadata**
   - Files: phase `tasks.md`, phase `execution.log.md`, plan `graph-inspect-cli-plan.md` footnotes
   - Add Task↔Log anchors and Dossier/Plan task backlinks.
   - Sync plan ledger and dossier footnote stubs with real node IDs (`plan-6a --sync-footnotes`).

## Priority 2 — MEDIUM

6. **Strengthen T005 JSON content assertions**
   - Assert node output values are present (not just envelope shape).

7. **Add negative-path CLI integration tests**
   - Cases: missing graph slug, invalid `--node`, inspect with recoverable errors.
   - Assert non-zero exit code and structured error output.

8. **Scope alignment cleanup**
   - Either justify `packages/positional-graph/src/index.ts` export expansion in dossier notes or narrow to required formatter exports.

## Priority 3 — LOW/Advisory

9. **Import hygiene**
   - Replace deep relative import for `withTestGraph` with stable alias/export path if available.

10. **Optional hardening**
   - Sanitize terminal control sequences for human-readable output formatting path.
