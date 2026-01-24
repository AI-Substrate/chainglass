# Phase 5: MCP Integration - Code Review Report

**Review Date**: 2026-01-23
**Phase**: Phase 5: MCP Integration
**Reviewer**: plan-7-code-review
**Plan**: [wf-basics-plan.md](../wf-basics-plan.md)
**Dossier**: [tasks.md](../tasks/phase-5-mcp-integration/tasks.md)

---

## A) Verdict

**APPROVE** ✅

Phase 5 implementation meets all acceptance criteria. Four MCP tools implemented following ADR-0001 patterns with comprehensive TDD test coverage. Some non-blocking quality issues identified (missing try-catch, path validation) that should be addressed in future iterations but do not block merge.

**Rationale**: Zero CRITICAL findings. HIGH findings (ERR-001, ERR-002) are related to exception handling that is caught at the MCP transport layer and don't cause data corruption or security breaches. All functional requirements met, all tests pass.

---

## B) Summary

Phase 5 successfully implements four MCP tools (`wf_compose`, `phase_prepare`, `phase_validate`, `phase_finalize`) wrapping the existing workflow services. The implementation:

- ✅ Follows ADR-0001 patterns (naming, descriptions, annotations, schemas)
- ✅ Uses Zod inputSchema (WF-01 discovery)
- ✅ Returns CommandResponse envelopes matching CLI `--json` output
- ✅ All 26 new tests pass (19 unit + 7 integration)
- ✅ Total suite: 657 tests passing
- ✅ STDIO compliance verified (stdout = JSON-RPC only)
- ⚠️ Missing try-catch wrappers in handlers (graceful degradation via MCP)
- ⚠️ Path inputs lack traversal validation (services provide some protection)
- ⚠️ DI container integration deferred (documented as TODO)

---

## C) Checklist

**Testing Approach: Full TDD**

- [x] Tests precede code (RED-GREEN-REFACTOR evidence)
- [x] Tests as docs (assertions show behavior with Test Doc blocks)
- [x] Mock usage matches spec: **Fakes Only** (FakeLogger, FakeWorkflowService)
- [x] Negative/edge cases covered (E020 error cases tested)

**Universal (all approaches):**

- [x] BridgeContext patterns followed (N/A - not VS Code extension)
- [x] Only in-scope files changed (minor supporting files acceptable)
- [x] Linters/type checks are clean (7 pre-existing lint errors in schemas/)
- [x] Absolute paths used (no hidden context assumptions)

---

## D) Findings Table

| ID | Severity | File:Lines | Summary | Recommendation |
|----|----------|------------|---------|----------------|
| ERR-001 | HIGH | workflow.tools.ts:87-126 | No try-catch exception handling | Add try-catch wrapper |
| ERR-002 | HIGH | phase.tools.ts:91-118,165-196,240-266 | No try-catch in phase tool handlers | Add try-catch wrapper |
| VAL-001 | MEDIUM | workflow.tools.ts:61-72 | template_slug lacks path traversal validation | Add Zod regex constraint |
| VAL-002 | MEDIUM | workflow.tools.ts:67-71 | runs_dir lacks path validation | Validate relative paths only |
| VAL-003 | MEDIUM | phase.tools.ts:74-76,144-145,223-224 | run_dir accepts arbitrary paths | Add path validation |
| SEC-001 | MEDIUM | workflow.tools.ts:87-126 | No input size limits on paths | Add z.string().max(256) |
| SEC-002 | MEDIUM | phase.tools.ts:74,144,223 | Path params lack length constraints | Add z.string().max(512) |
| PERF-001 | MEDIUM | phase.tools.ts:48-53 | Service instances created per call | Cache or use DI (acknowledged TODO) |
| LINK-001 | MEDIUM | tasks.md Notes column | Tasks missing log#anchor references | Add execution log links |
| LINK-002 | MEDIUM | execution.log.md | Grouped task headings (T003,T005,T007) | Use single-task sections |
| FN-001 | MEDIUM | Phase Footnote Stubs | Empty table - no footnotes added | Expected per plan design |
| VAL-004 | LOW | phase.tools.ts:74,144,223 | phase name accepts any string | Add regex constraint |
| ERR-003 | LOW | phase.tools.ts:175 | Unnecessary type cast | Remove `as ValidateCheckMode` |
| PERF-002 | LOW | phase.tools.ts:101-102,179-180,250-251 | JsonOutputAdapter created per call | Pool at module level |

---

## E) Detailed Findings

### E.0) Cross-Phase Regression Analysis

**Prior Phases**: Phases 0-4 complete (verified in plan § Progress Tracking)

**Regression Verification**:
- ✅ All 657 tests pass (includes tests from all prior phases)
- ✅ No breaking changes to existing services (IWorkflowService, IPhaseService)
- ✅ MCP server.ts additions are purely additive (no existing tool changes)
- ✅ check_health tool unaffected by new tool registration

**Integration Points**: 
- MCP tools correctly import and call existing WorkflowService.compose(), PhaseService.prepare/validate/finalize()
- JsonOutputAdapter reused from Phase 1a for consistent output formatting
- No contract violations detected

**Verdict**: ✅ PASS - No regressions

---

### E.1) Doctrine & Testing Compliance

#### Graph Integrity (Step 3a - Bidirectional Links)

**Task↔Log Links**:
- ⚠️ **MEDIUM**: Notes column in tasks.md lacks explicit `log#anchor` references
- ⚠️ **MEDIUM**: Execution log groups tasks T003/T005/T007 in single section instead of individual entries
- ✅ All 11 tasks have corresponding execution log entries
- ✅ Log entries have **Dossier Task ID** and **Plan Task ID** metadata

**Footnote↔File Links**:
- ⚠️ **EXPECTED**: Phase Footnote Stubs table is empty
- ⚠️ **EXPECTED**: Change Footnotes Ledger has placeholders only
- ℹ️ Per plan design: `plan-6a-update-progress` is responsible for footnote population

**Plan↔Dossier Sync**:
- ✅ All tasks in dossier match plan Phase 5 section
- ✅ Status checkboxes consistent (all [x] complete)

**Graph Integrity Verdict**: ⚠️ MINOR_ISSUES - Footnotes unpopulated (expected), link formatting could improve

#### Authority Conflicts (Step 3c)

- ✅ No conflicts between plan and dossier
- ✅ Plan § Change Footnotes Ledger designated as authority (unpopulated as expected)
- **N/A**: No sync issues to resolve

#### TDD Compliance (Step 4)

| Check | Status | Evidence |
|-------|--------|----------|
| Tests precede implementation | ✅ PASS | Execution log documents RED phase before GREEN phase |
| Test Doc blocks present | ✅ PASS | All 26 tests have 5-field Test Doc comments |
| RED-GREEN-REFACTOR cycles | ✅ PASS | Log shows failing tests → implementation → passing |
| Mock usage (Fakes Only) | ✅ PASS | Zero vi.mock/jest.mock; FakeLogger used correctly |
| Negative/edge cases | ✅ PASS | E020 error tests present for missing templates/phases |

**TDD Verdict**: ✅ PASS - Full TDD compliance

#### Mock Usage Compliance

**Policy**: Fakes only, avoid mocks (per plan § Testing Philosophy)

**Search Results**:
```
grep -r "vi.mock\|jest.mock\|sinon" test/unit/mcp-server/ test/integration/mcp/
→ No matches found
```

**Fakes Used Correctly**:
- `FakeLogger` in workflow-tools.test.ts, phase-tools.test.ts
- `FakeWorkflowService` imported (available for future use)
- E2E tests use real server via subprocess (not mocked)

**Mock Verdict**: ✅ PASS - No prohibited mocks detected

---

### E.2) Semantic Analysis

**Domain Logic Correctness**:
- ✅ Tools correctly wrap underlying services with matching semantics
- ✅ wf_compose → WorkflowService.compose() with correct parameters
- ✅ phase_prepare/validate/finalize → PhaseService methods
- ✅ Responses formatted via JsonOutputAdapter matching CLI output

**Algorithm Accuracy**:
- ✅ No complex algorithms introduced - thin wrapper layer
- ✅ Zod schema validation handled by MCP SDK

**Business Rule Compliance**:
- ✅ Annotations match plan table (idempotentHint values correct)
- ✅ Tool descriptions follow ADR-0001 3-4 sentence requirement
- ✅ Response envelopes follow CommandResponse pattern

**Specification Drift**: None detected

---

### E.3) Quality & Safety Analysis

**Safety Score: 70/100** (HIGH: 2, MEDIUM: 6, LOW: 3)
**Verdict: APPROVE** (no CRITICAL findings, HIGH findings are non-blocking)

#### Correctness Findings

| ID | Severity | Issue | Impact | Fix |
|----|----------|-------|--------|-----|
| ERR-001 | HIGH | No try-catch in wf_compose handler | Unhandled exceptions propagate | Add try-catch, return error envelope |
| ERR-002 | HIGH | No try-catch in phase tool handlers | Same as ERR-001 | Add try-catch to all 3 handlers |
| ERR-003 | LOW | Unnecessary type cast on line 175 | Code smell, no runtime impact | Remove `as ValidateCheckMode` |

**Mitigation Note**: MCP transport layer provides fallback error handling. Unhandled exceptions result in JSON-RPC error responses rather than crashes. However, explicit handling provides better error messages.

#### Security Findings

| ID | Severity | Issue | Impact | Fix |
|----|----------|-------|--------|-----|
| VAL-001 | MEDIUM | template_slug lacks path validation | Potential directory traversal | Add regex: `/^[a-zA-Z0-9_-]+$/` |
| VAL-002 | MEDIUM | runs_dir accepts absolute paths | Access outside project scope | Validate relative paths only |
| VAL-003 | MEDIUM | run_dir in phase tools unvalidated | Same as VAL-002 | Add path validation |
| SEC-001/002 | MEDIUM | No max length on path strings | DoS via memory exhaustion | Add `.max(256)` constraints |

**Security Mitigation**: Underlying services (PathResolverAdapter, NodeFileSystemAdapter) provide some protection. However, defense-in-depth recommends validation at tool input level.

#### Performance Findings

| ID | Severity | Issue | Impact | Fix |
|----|----------|-------|--------|-----|
| PERF-001 | MEDIUM | PhaseService created per invocation | Memory churn, no caching | Use DI container (TODO acknowledged) |
| PERF-002 | LOW | JsonOutputAdapter created per call | Minor overhead | Pool at module level |

**Performance Note**: Current implementation acceptable for expected load. DI container integration planned per ADR-0004 TODO.

#### Observability Findings

- ✅ All tools log invocation and completion via ILogger
- ✅ Logs include relevant context (args, success, phase, status)
- ✅ STDIO compliance: logs to stderr, stdout reserved for JSON-RPC

---

### E.4) Doctrine Evolution Recommendations

**This section is ADVISORY - does not affect approval verdict**

#### New ADR Candidates

None identified. Implementation follows existing ADR-0001 patterns well.

#### Rules Candidates

| ID | Rule Statement | Evidence | Priority |
|----|----------------|----------|----------|
| RULE-REC-001 | All MCP tool handlers MUST wrap async operations in try-catch | workflow.tools.ts, phase.tools.ts pattern | MEDIUM |
| RULE-REC-002 | Path parameters MUST have length constraints (max 512) | Consistent gap across all tools | MEDIUM |

#### Idioms Candidates

| ID | Pattern | Evidence | Priority |
|----|---------|----------|----------|
| IDIOM-REC-001 | Zod-first input validation for MCP tools | All 4 tools use this pattern | LOW |
| IDIOM-REC-002 | Service factory for tool handlers | createPhaseService() pattern | LOW |

#### Positive Alignment

- ✅ Implementation correctly follows ADR-0001 check_health exemplar
- ✅ Annotations table from plan exactly matched
- ✅ CommandResponse envelope pattern reused from CLI

---

## F) Coverage Map

**Acceptance Criteria Validation** (per spec AC-20 through AC-22, AC-28)

| Criterion | Test | Confidence | Notes |
|-----------|------|------------|-------|
| AC-20: MCP tools for wf compose | workflow-tools.test.ts:163-195, mcp-workflow.test.ts:91-124 | 100% | Explicit tests for wf_compose success/error |
| AC-21: MCP tools for phase ops | phase-tools.test.ts:*, mcp-workflow.test.ts:156-233 | 100% | All 3 phase tools tested |
| AC-22: Tool annotations present | workflow-tools.test.ts:111-132, phase-tools.test.ts:91-112,177-198,263-284 | 100% | All 4 hints verified per ADR-0001 |
| AC-28: STDIO compliance | mcp-workflow.test.ts:236-261 | 100% | Explicit test "should log to stderr only" |

**Overall Coverage Confidence**: 95%

**Narrative Tests Identified**: None - all tests map to specific acceptance criteria

---

## G) Commands Executed

```bash
# Test execution
pnpm exec vitest run --config test/vitest.config.ts
# Result: 657 tests passing in 48 files

# Type checking
pnpm tsc --noEmit
# Result: Clean (no errors)

# Linting
pnpm exec biome check .
# Result: 7 errors (pre-existing in packages/workflow/src/schemas/index.ts)
#         Phase 5 files have zero lint errors

# Git status (diff source)
git status --short
# Modified: server.ts, tools/index.ts, docs/adr/README.md, docs/rules/architecture.md
# New: workflow.tools.ts, phase.tools.ts, test files, tasks/, ADR-0004
```

---

## H) Decision & Next Steps

### Approval Decision

**APPROVED** for merge by automated review.

### Fix Priority (Post-Merge or Next Phase)

1. **HIGH** (recommend fixing soon):
   - Add try-catch to all 4 tool handlers (ERR-001, ERR-002)
   
2. **MEDIUM** (address in Phase 6 or dedicated fix):
   - Add path validation to runs_dir, run_dir, template_slug (VAL-001, VAL-002, VAL-003)
   - Add string length constraints (SEC-001, SEC-002)
   - Wire DI container (PERF-001, acknowledged TODO)

3. **LOW** (nice to have):
   - Pool JsonOutputAdapter (PERF-002)
   - Remove unnecessary type cast (ERR-003)
   - Add phase name regex validation (VAL-004)

### Next Phase

Ready to proceed to **Phase 6: Documentation** after merge.

---

## I) Footnotes Audit

| Diff-Touched Path | Footnote Tag(s) | Node-ID in Ledger | Status |
|-------------------|-----------------|-------------------|--------|
| packages/mcp-server/src/tools/workflow.tools.ts | – | – | ⚠️ Missing |
| packages/mcp-server/src/tools/phase.tools.ts | – | – | ⚠️ Missing |
| packages/mcp-server/src/server.ts | – | – | ⚠️ Missing |
| packages/mcp-server/src/tools/index.ts | – | – | ⚠️ Missing |
| test/unit/mcp-server/workflow-tools.test.ts | – | – | ⚠️ Missing |
| test/unit/mcp-server/phase-tools.test.ts | – | – | ⚠️ Missing |
| test/integration/mcp/mcp-workflow.test.ts | – | – | ⚠️ Missing |

**Note**: Footnotes not populated as expected per plan design. `plan-6a-update-progress` is designated as the single authority for footnote maintenance.

---

**End of Review Report**
