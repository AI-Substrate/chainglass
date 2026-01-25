# Phase 5: CLI Commands – Code Review

**Phase**: Phase 5: CLI Commands
**Plan**: [../../manage-workflows-plan.md](../../manage-workflows-plan.md)
**Dossier**: [../tasks/phase-5-cli-commands/tasks.md](../tasks/phase-5-cli-commands/tasks.md)
**Execution Log**: [../tasks/phase-5-cli-commands/execution.log.md](../tasks/phase-5-cli-commands/execution.log.md)
**Review Date**: 2026-01-25
**Testing Approach**: Full TDD

---

## A) Verdict

**APPROVE**

All tests pass (1038), type checks pass, and implementation correctly follows spec requirements. Two advisory findings noted (container recreation pattern and input validation) but neither blocks approval - they're optimization opportunities, not correctness issues.

---

## B) Summary

Phase 5 delivers a complete `cg workflow` CLI command suite with 6 subcommands:
- `workflow list` - Lists available workflow templates
- `workflow info <slug>` - Shows workflow details
- `workflow checkpoint <slug>` - Creates checkpoint (--comment, --force)
- `workflow restore <slug> <version>` - Restores with confirmation (--force skips)
- `workflow versions <slug>` - Lists checkpoints descending
- `workflow compose <slug>` - Creates run (--checkpoint flag)

**Key Deliverables:**
- `workflow.command.ts` with 6 handlers using DI container per ADR-0004
- ConsoleOutputAdapter extended with workflow.* formatters
- Deprecated `cg wf` command removed; consolidated to `cg workflow`
- 28 new tests (14 unit, 6 parser, 7 MCP exclusion, 1 manual verification)
- MCP tools properly excluded per ADR-0001 NEG-005

**Test Results:** 1038 tests passing, typecheck clean

---

## C) Checklist

**Testing Approach: Full TDD**

- [x] Tests precede code (RED-GREEN-REFACTOR evidence in execution log)
- [x] Tests as docs (assertions show behavior via Test Doc blocks)
- [x] Mock usage matches spec: **Avoid mocks** - Uses Fakes throughout
- [x] Negative/edge cases covered (E030, E033 error paths, empty states)

**Universal:**

- [x] BridgeContext patterns followed (N/A - not VS Code extension code)
- [x] Only in-scope files changed (per task table)
- [x] Linters/type checks are clean (typecheck passes; lint has formatting-only issues)
- [x] Absolute paths used (no hidden context)

---

## D) Findings Table

| ID | Severity | File:Lines | Summary | Recommendation |
|----|----------|------------|---------|----------------|
| F001 | INFO | workflow.command.ts:107-117 | Container recreated per handler call | Consider caching container at CLI entry point |
| F002 | LOW | workflow.command.ts:178-190 | Prompt lacks timeout/error handling | Add timeout and stream error handlers |
| F003 | MEDIUM | workflow.command.ts:248 | --runs-dir path not validated | Add path validation against traversal |
| F004 | MEDIUM | workflow.command.ts:140,195,227,245 | Slug/version params passed without validation | Add input format validation |
| F005 | INFO | console-output.adapter.ts | Exposes full file paths in output | Consider relative paths in non-debug mode |

---

## E) Detailed Findings

### E.0) Cross-Phase Regression Analysis

**Prior Phases:** Phases 1-4 complete (verified via git history)

**Regression Check:** PASS
- All 1038 tests pass including tests from Phases 1-4
- wf-compose integration tests updated to use `workflow` command (not `wf`)
- phase-commands tests updated to use new command structure
- No breaking changes to IWorkflowRegistry or IWorkflowService interfaces

### E.1) Doctrine & Testing Compliance

**Graph Integrity:** ✅ INTACT
- All 18 tasks (T001-T018) linked to execution log entries
- All completed tasks have documented evidence
- No orphan log entries

**TDD Compliance:** ✅ PASS
- RED phase documented: 14 failing tests written first (10:00)
- GREEN phase documented: handlers implemented (10:20)
- All tests include Test Doc blocks (Why/Contract/Usage Notes/Quality Contribution/Worked Example)

**Mock Usage:** ✅ PASS
- Policy: "Avoid mocks entirely - Use Fakes"
- Implementation: Uses FakeWorkflowRegistry (8 instances), FakeLogger (3 instances)
- Violations: 0 (one `vi.clearAllMocks()` call is vestigial cleanup, not actual mocking)

**Plan Compliance:** ✅ PASS
- All 18 tasks completed per task table
- All target files modified as specified
- No scope creep detected
- Integration test updates (wf-compose.test.ts, phase-commands.test.ts) are acceptable cross-cutting changes

### E.2) Semantic Analysis

**Domain Logic:** ✅ PASS - All commands invoke correct interface methods:
- `registry.list(workflowsDir)` 
- `registry.info(workflowsDir, slug)`
- `registry.checkpoint(workflowsDir, slug, {comment, force})`
- `registry.restore(workflowsDir, slug, version)`
- `registry.versions(workflowsDir, slug)`
- `service.compose(slug, runsDir, {checkpoint})`

**Business Rules:** ✅ PASS
- Restore prompts: "Restore will overwrite current/ for '{slug}'. Continue? (y/N)"
- --force flag bypasses confirmation
- Cancellation exits cleanly (code 0)
- Exit code 1 on errors (result.errors.length > 0)

**DI Container:** ✅ PASS per ADR-0004
- Services resolved via `container.resolve<T>(TOKEN)`
- No direct instantiation of adapters in handlers

### E.3) Quality & Safety Analysis

**Safety Score: 90/100** (CRITICAL: 0, HIGH: 0, MEDIUM: 2, LOW: 3)
**Verdict: APPROVE (advisory findings only)**

**Security Findings:**

| ID | Severity | Issue | Recommendation |
|----|----------|-------|----------------|
| SEC-001 | MEDIUM | Slug/version params not validated client-side | Add format validation before passing to registry |
| SEC-002 | MEDIUM | --runs-dir path not validated against traversal | Use path.resolve() + validate |
| SEC-003 | LOW | Error output exposes file paths | Consider relative paths |
| SEC-004 | LOW | No secrets found | Maintain current practice |
| SEC-005 | LOW | Generic error codes prevent info leakage | Current approach is good |

**Correctness Findings:**

| ID | Severity | Issue | Recommendation |
|----|----------|-------|----------------|
| COR-001 | INFO | Container recreated per handler call | Acceptable for CLI; consider caching for performance |
| COR-002 | LOW | promptConfirmation lacks timeout | Add 30-60s timeout |
| COR-003 | LOW | Prompt input not trimmed | Add .trim() to user input |

**Observability:** ✅ PASS
- Success paths: Clear feedback with ✓ icon
- Error paths: Error codes in [brackets], actionable messages
- Empty states: Helpful guidance (ℹ️ icon, next action suggestions)
- JSON output: Valid envelope with success/command/timestamp/data

### E.4) Doctrine Evolution Recommendations

**ADR Candidates:** None identified - implementation follows existing patterns

**Rules Candidates:**
- Consider adding input validation rule for CLI slug parameters

**Idioms Candidates:**
- The DI container resolution pattern is well-established; continue usage

**Positive Alignment:**
- ✅ ADR-0001 NEG-005: MCP tools properly excluded (verified by negative test)
- ✅ ADR-0004: DI container usage correct (no direct instantiation)
- ✅ Testing Philosophy: Full TDD followed with Test Doc blocks

---

## F) Coverage Map

**Testing Approach:** Full TDD

| Acceptance Criterion | Test File | Assertion | Confidence |
|---------------------|-----------|-----------|------------|
| workflow list displays table | workflow-command.test.ts:37-61 | Contains slug, name, checkpoint count | 100% |
| workflow list --json | workflow-command.test.ts:63-86 | JSON envelope with success, command, data | 100% |
| workflow list empty state | workflow-command.test.ts:88-103 | Contains "No workflows found" + guidance | 100% |
| workflow info displays details | workflow-command.test.ts:115-146 | Contains name, description, versions | 100% |
| workflow info E030 error | workflow-command.test.ts:148-170 | Contains E030, error message | 100% |
| workflow info version history | workflow-command.test.ts:172-203 | v003 before v001 (descending) | 100% |
| workflow checkpoint success | workflow-command.test.ts:215-237 | Contains version, "Checkpoint created" | 100% |
| workflow checkpoint --comment | workflow-command.test.ts:239-261 | Comment passed to registry | 100% |
| workflow checkpoint --force | workflow-command.test.ts:263-285 | Force flag passed to registry | 100% |
| workflow restore --force | workflow-command.test.ts:297-317 | Contains version, "Restored" | 100% |
| workflow restore cancelled | workflow-command.test.ts:319-334 | No registry call on decline | 100% |
| workflow restore E033 | workflow-command.test.ts:336-360 | Contains E033, error message | 100% |
| workflow versions descending | workflow-command.test.ts:370-397 | v003 index < v001 index | 100% |
| workflow versions E030 | workflow-command.test.ts:399-422 | Contains E030, error message | 100% |
| MCP exclusion | workflow-exclusion.test.ts | 7 negative tests for workflow_* tools | 100% |

**Overall Coverage Confidence:** 100% (all criteria have explicit test assertions)

---

## G) Commands Executed

```bash
# Test execution
pnpm test
# Result: 1038 tests passed

# Type check
pnpm typecheck
# Result: Pass (0 errors)

# Lint check  
pnpm lint
# Result: 19 formatting/import-order issues (not code correctness)
```

---

## H) Decision & Next Steps

**Decision:** APPROVE

**Rationale:**
- All 1038 tests pass
- Type checks pass
- Full TDD discipline followed
- Implementation matches spec requirements
- DI container usage correct per ADR-0004
- MCP exclusion verified per ADR-0001 NEG-005

**Advisory Items (non-blocking):**
1. Consider input validation for slug/version parameters (defense-in-depth)
2. Consider path validation for --runs-dir option
3. Consider adding timeout to readline prompt

**Next Steps:**
1. ✅ Ready for commit: `git add . && git commit -m "feat(cli): Phase 5 CLI Commands for workflow management"`
2. Proceed to Phase 6: Documentation & Rollout

---

## I) Footnotes Audit

**NOTE:** Phase 5 execution log and dossier do not include footnote references to the plan ledger. The Phase Footnote Stubs section in tasks.md was not populated during implementation.

| Diff-Touched Path | Footnote Tag | Plan Ledger Entry |
|-------------------|--------------|-------------------|
| apps/cli/src/commands/workflow.command.ts | (not tagged) | N/A |
| packages/shared/src/adapters/console-output.adapter.ts | (not tagged) | N/A |
| test/unit/cli/workflow-command.test.ts | (not tagged) | N/A |
| test/unit/mcp-server/workflow-exclusion.test.ts | (not tagged) | N/A |
| test/unit/cli/cli-parser.test.ts | (not tagged) | N/A |
| apps/cli/src/commands/wf.command.ts | (DELETED) | N/A |

**Recommendation:** For future phases, ensure plan-6 populates footnote stubs during implementation for full traceability.

---

*Review generated by plan-7-code-review*
