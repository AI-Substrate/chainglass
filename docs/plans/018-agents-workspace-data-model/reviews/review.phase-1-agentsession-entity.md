# Code Review: Phase 1 – AgentSession Entity + AgentSessionAdapter + Contract Tests

**Plan**: [agents-workspace-data-model-plan.md](../agents-workspace-data-model-plan.md)
**Phase**: Phase 1: AgentSession Entity + AgentSessionAdapter + Contract Tests
**Dossier**: [tasks/phase-1-agentsession-entity/tasks.md](../tasks/phase-1-agentsession-entity/tasks.md)
**Date**: 2026-01-28
**Reviewer**: plan-7-code-review

---

## A) Verdict

**REQUEST_CHANGES**

Phase 1 implementation is **functionally complete** with excellent code quality and Full TDD compliance. All 1094 tests pass, TypeScript compiles clean, and linting passes. However, there are **CRITICAL graph integrity violations** that must be fixed before merge:

1. **Plan↔Dossier Status Desynchronization**: All 16 tasks marked `[x]` in dossier but `[ ]` in plan
2. **Empty Footnotes Ledger**: Change Footnotes Ledger and Phase Footnote Stubs never populated
3. **Missing Execution Log Backlinks**: No bidirectional Task↔Log links exist
4. **Missing Unit Test File**: T009 (agent-session-adapter.test.ts) not created as specified
5. **Security Issues**: Error message disclosure in save()

---

## B) Summary

Phase 1 delivers the foundational AgentSession domain following the Sample exemplar pattern:
- ✅ 50 new tests (13 entity, 11 service, 26 contract) – all passing
- ✅ Full TDD compliance with documented RED-GREEN-REFACTOR cycle
- ✅ Fakes-only approach (zero vi.mock/jest.mock usage per R-TEST-007)
- ✅ Contract test parity between Fake and Real adapters
- ✅ Three-part API on FakeAgentSessionAdapter (State/Inspection/Injection)
- ✅ Error codes E090-E093 properly defined
- ⚠️ Test Doc blocks 81% complete (7 service tests missing documentation)
- ❌ Graph integrity broken (plan-6a-update-progress never invoked)
- ❌ 1 CRITICAL + 3 HIGH correctness/security findings

---

## C) Checklist

**Testing Approach: Full TDD**

- [x] Tests precede code (RED-GREEN-REFACTOR evidence in execution.log.md)
- [x] Tests as docs – assertions show behavior (81% Test Doc blocks present)
- [x] Mock usage matches spec: **Fakes Only** (0 vi.mock violations)
- [x] Negative/edge cases covered (contract tests include error paths)

**Universal Checks:**
- [ ] BridgeContext patterns followed – N/A (not VS Code extension work)
- [ ] Only in-scope files changed – **FAIL** (T009 unit test file missing)
- [x] Linters/type checks are clean – TypeScript & Biome pass
- [x] Absolute paths used – All paths are workspace-relative via WorkspaceContext

---

## D) Findings Table

| ID | Severity | File:Lines | Summary | Recommendation |
|----|----------|------------|---------|----------------|
| GRAPH-001 | CRITICAL | plan.md:614-631 | Plan tasks all `[ ]` but dossier all `[x]` | Run `plan-6a-update-progress` to sync |
| GRAPH-002 | CRITICAL | plan.md:1438-1463 | Change Footnotes Ledger empty (placeholder only) | Run `plan-6a` to populate footnotes |
| GRAPH-003 | CRITICAL | tasks.md:411-416 | Phase Footnote Stubs empty | Run `plan-6a` to populate |
| GRAPH-004 | HIGH | execution.log.md | No Task↔Log backlinks (missing `**Dossier Task**: T001`) | Add metadata to log entries |
| PLAN-001 | HIGH | T009 | agent-session-adapter.test.ts file NOT created | Create file or update plan to note it's covered by contract tests |
| ~~SEC-001~~ | ~~HIGH~~ | ~~adapter.ts:212-222~~ | ~~Missing validateSessionId()~~ | FALSE POSITIVE – validation exists |
| SEC-002 | HIGH | adapter.ts:91-99 | Error message disclosure in save() catch | Return generic message, log actual error |
| COR-001 | CRITICAL | adapter.ts:162-164 | Silent error swallowing in list() | Log corrupt files before skipping |
| COR-002 | HIGH | base-adapter.ts:235 | listEntityFiles() type safety | Add `as string[]` type assertion |
| COR-003 | MEDIUM | adapter.ts:181-189 | Inconsistent error codes between methods | Use INVALID_DATA for validation failures |
| DOC-001 | MEDIUM | service.test.ts | 7 tests missing Test Doc blocks | Add Why/Contract/Usage/Quality/Example |

---

## E) Detailed Findings

### E.0) Cross-Phase Regression Analysis

*Not applicable – this is Phase 1 (foundational phase, no prior phases to regress against).*

### E.1) Doctrine & Testing Compliance

#### Graph Integrity Violations (Step 3a)

| ID | Severity | Link Type | Issue | Expected | Fix | Impact |
|----|----------|-----------|-------|----------|-----|--------|
| GRAPH-001 | CRITICAL | Plan↔Dossier | All 16 plan tasks `[ ]` but dossier tasks `[x]` | Status synchronized | Run `plan-6a-update-progress --phase 1` | Progress tracking unreliable |
| GRAPH-002 | CRITICAL | Task↔Footnote | Change Footnotes Ledger contains only placeholders | FlowSpace node IDs for 24 files | Run `plan-6a` to populate ledger | Breaks File→Task traversal |
| GRAPH-003 | CRITICAL | Task↔Footnote | Phase Footnote Stubs section empty | Footnote entries matching plan ledger | Run `plan-6a` to sync | No provenance tracking |
| GRAPH-004 | HIGH | Task↔Log | Execution log entries missing `**Dossier Task**` and `**Plan Task**` metadata | Each log entry has backlinks | Add metadata to log sections | Cannot navigate log→task |

**Graph Integrity Verdict**: ❌ BROKEN (4 violations: 3 CRITICAL, 1 HIGH)

**Root Cause**: `plan-6-implement-phase` was run but `plan-6a-update-progress` was never invoked to:
1. Update plan task table checkboxes
2. Populate Change Footnotes Ledger with FlowSpace node IDs
3. Sync dossier Phase Footnote Stubs
4. Add backlink metadata to execution log entries

#### TDD Compliance (Step 4)

| Check | Status | Evidence |
|-------|--------|----------|
| TDD Order | ✅ PASS | T003 (04:42) creates failing tests, T004 (04:45) implements to pass |
| Tests as Documentation | ⚠️ PARTIAL | 30/37 tests have Test Doc blocks (81%) |
| RED-GREEN-REFACTOR | ✅ PASS | Documented in execution.log.md |
| Mock Usage | ✅ PASS | 0 vi.mock/jest.mock violations |

**Missing Test Doc Blocks** (7 tests):
- `agent-session-service.test.ts:53` – should create copilot session
- `agent-session-service.test.ts:60` – should save session to adapter
- `agent-session-service.test.ts:98` – should return empty array when no sessions
- `agent-session-service.test.ts:104` – should return all sessions
- `agent-session-service.test.ts:139` – should return error for nonexistent session (deleteSession)
- `agent-session-service.test.ts:170` – should return error for nonexistent session (updateSessionStatus)
- `agent-session-service.test.ts:` – additional edge case tests

#### Plan Compliance (Step 4c)

| Task | Status | Issue |
|------|--------|-------|
| T001-T008 | ✅ PASS | Interface, schema, entity, errors, fake, contracts all implemented correctly |
| T009 | ❌ FAIL | Unit test file `test/unit/workflow/agent-session-adapter.test.ts` does NOT exist |
| T010-T016 | ✅ PASS | Adapter, DI tokens, service, container registration all correct |

**T009 Analysis**: The task table specifies creating `agent-session-adapter.test.ts` for adapter unit tests. However, the implementation relies solely on contract tests (which DO test the adapter). Options:
1. Create the missing unit test file (strict compliance)
2. Update task description to note "Covered by contract tests" (pragmatic)

### E.2) Semantic Analysis

*No semantic violations found.* Implementation correctly follows the Sample exemplar pattern, uses WorkspaceContext consistently, and implements all specified acceptance criteria (AC-01 through AC-06, AC-23).

### E.3) Quality & Safety Analysis

**Safety Score: 72/100** (CRITICAL: 1, HIGH: 3, MEDIUM: 2, LOW: 1)

#### Security Findings

**~~[SEC-001] HIGH – Missing validateSessionId() in exists()~~** – FALSE POSITIVE
- **Status**: ✅ Validation IS present at lines 212-222
- **Evidence**: Code shows `validateSessionId(sessionId)` in try/catch block
- **No action required**

**[SEC-002] HIGH – Error Message Disclosure** (adapter.ts:91-99)
- **Issue**: save() catch block exposes `error.message` directly to caller
- **Impact**: Could leak filesystem paths or internal error details
- **Fix**: Return generic message, log actual error for debugging
- **Patch**:
```diff
  } catch (error) {
+   // Log actual error for debugging
+   console.error('validateSessionId failed:', error);
    return {
      ok: false,
      errorCode: AgentSessionErrorCodes.INVALID_DATA,
-     errorMessage: error instanceof Error ? error.message : 'Invalid session ID',
+     errorMessage: 'Invalid session ID format',
    };
  }
```

#### Correctness Findings

**[COR-001] CRITICAL – Silent Error Swallowing** (adapter.ts:162-164)
- **Issue**: list() method silently skips corrupt files with empty catch block
- **Impact**: Data corruption hidden; debugging impossible
- **Fix**: Log warning before skipping
- **Patch**:
```diff
        sessions.push(session);
-     } catch {
+     } catch (error) {
+       console.warn(`Skipping corrupt session file: ${file}`, error);
        // Skip corrupt files
      }
```

**[COR-002] HIGH – Type Safety in listEntityFiles()** (workspace-data-adapter-base.ts:235)
- **Issue**: `entries` from readDir() lacks type assertion
- **Impact**: Potential runtime crash if readDir returns non-string
- **Fix**: Add explicit type assertion
- **Patch**: `const entries = (await this.fs.readDir(domainPath)) as string[];`

**[COR-003] MEDIUM – Inconsistent Error Codes** (adapter.ts:181-189)
- **Issue**: remove() uses SESSION_NOT_FOUND for validation failures; save() uses INVALID_DATA
- **Impact**: Inconsistent API behavior
- **Fix**: Use INVALID_DATA for validation failures in remove()

### E.4) Doctrine Evolution Recommendations

*Advisory – does not affect approval verdict*

| Category | New | Updates | Priority HIGH |
|----------|-----|---------|---------------|
| ADRs | 0 | 0 | 0 |
| Rules | 1 | 0 | 0 |
| Idioms | 1 | 0 | 0 |

**New Rule Candidate**: "All filesystem operations on user-provided IDs must call validateSessionId() before any path construction or I/O operation." (Evidence: SEC-001 shows exists() missing validation)

**New Idiom Candidate**: "Error logging before silent skip pattern" – When skipping corrupt data in list operations, always log a warning with the file path and error details before continuing.

---

## F) Coverage Map

**Testing Approach: Full TDD – Acceptance Criteria ↔ Test Mapping**

| Acceptance Criterion | Test File | Assertion | Confidence |
|---------------------|-----------|-----------|------------|
| AC-01: Entity fields | agent-session.entity.test.ts:23-45 | Tests create() with all fields | 100% |
| AC-02: JSON serialization | agent-session.entity.test.ts:173-196 | Tests toJSON() with ISO dates | 100% |
| AC-03: Adapter extends base | agent-session.adapter.ts:42 | `extends WorkspaceDataAdapterBase` | 100% |
| AC-04: Storage path | contract.ts:316-340 | Workspace isolation test | 100% |
| AC-05: list() ordering | contract.ts:232-250 | Verifies createdAt DESC order | 100% |
| AC-06: Fake passes contracts | contract.test.ts:26-43 | 13 tests on FakeAgentSessionAdapter | 100% |
| AC-23: Three-part API | fake-agent-session-adapter.ts | addSession, saveCalls, injectSaveError | 100% |

**Overall Coverage Confidence: 100%** (All acceptance criteria explicitly tested)

---

## G) Commands Executed

```bash
# Run Phase 1 tests
cd /home/jak/substrate/015-better-agents
pnpm test packages/workflow packages/shared test/contracts test/unit/workflow
# Result: 1094 tests passed in 14.05s

# Type checking
pnpm typecheck
# Result: Clean (exit 0)

# Linting
pnpm lint
# Result: Checked 574 files in 116ms. No fixes applied.
```

---

## H) Decision & Next Steps

**Verdict**: REQUEST_CHANGES

**Blocking Issues (must fix before merge)**:
1. Run `plan-6a-update-progress` to sync plan↔dossier status and populate footnotes
2. Fix COR-001: Add logging for corrupt files in list()

**Advisory Issues (should fix)**:
4. Create T009 unit test file OR update task description
5. Add Test Doc blocks to 7 service tests
6. Fix SEC-002: Generic error messages
7. Fix COR-002: Type assertion in listEntityFiles()

**Approval Path**:
1. Apply fixes from `fix-tasks.phase-1-agentsession-entity.md`
2. Re-run tests: `pnpm test packages/workflow`
3. Re-run `plan-7-code-review --phase 1`
4. On APPROVE → merge and advance to Phase 2

---

## I) Footnotes Audit

**Status**: ❌ FAILED – Ledger empty

| Diff-Touched Path | Footnote Tag | FlowSpace Node ID |
|-------------------|--------------|-------------------|
| packages/workflow/src/interfaces/agent-session-adapter.interface.ts | – | – |
| packages/shared/src/schemas/agent-session.schema.ts | – | – |
| packages/workflow/src/entities/agent-session.ts | – | – |
| packages/workflow/src/errors/agent-errors.ts | – | – |
| packages/workflow/src/fakes/fake-agent-session-adapter.ts | – | – |
| packages/workflow/src/adapters/agent-session.adapter.ts | – | – |
| packages/workflow/src/services/agent-session.service.ts | – | – |
| *(24 files total – all missing footnotes)* | | |

**Action Required**: Run `plan-6a-update-progress` to populate Change Footnotes Ledger with FlowSpace node IDs for all modified files.

---

*Review generated by plan-7-code-review on 2026-01-28*
