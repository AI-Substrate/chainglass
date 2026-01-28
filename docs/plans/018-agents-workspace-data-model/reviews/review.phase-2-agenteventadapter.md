# Phase 2: AgentEventAdapter - Code Review Report

**Plan**: Agent Workspace Data Model Migration (Plan 018)  
**Phase**: Phase 2: AgentEventAdapter (Workspace-Scoped Event Storage)  
**Reviewer**: plan-7-code-review  
**Date**: 2026-01-28  
**Diff Range**: `920f7d8..cd33aa2`

---

## A) Verdict

**REQUEST_CHANGES**

One CRITICAL security issue must be resolved before merge.

---

## B) Summary

Phase 2 implements workspace-scoped event storage via AgentEventAdapter, replacing the legacy EventStorageService. The implementation follows TDD with comprehensive test coverage (17 unit tests, 15 contract tests) and includes proper fake implementation with three-part API for testing.

**Strengths**:
- ✅ Clean TDD RED-GREEN cycle with excellent test documentation
- ✅ Comprehensive contract tests ensuring fake↔real parity
- ✅ Proper workspace isolation verified
- ✅ NDJSON malformed line handling preserved
- ✅ Complete cleanup of legacy EventStorageService
- ✅ Routes correctly migrated to workspace-scoped URLs

**Critical Issues**:
- ❌ **SEC-001**: Session ID validation missing in 4 of 5 adapter methods (path traversal vulnerability)

---

## C) Checklist

**Testing Approach: Full TDD**

- [x] Tests precede code (RED-GREEN-REFACTOR evidence)
- [x] Tests as docs (assertions show behavior)
- [x] Mock usage matches spec: Fakes Only (no vi.mock)
- [ ] Negative/edge cases covered - **PARTIAL: session ID validation tests only for append()**

**Universal (all approaches)**:
- [x] BridgeContext patterns followed (Uri, RelativePattern, module: 'pytest') - N/A (not VS Code extension)
- [x] Only in-scope files changed
- [x] Linters/type checks are clean
- [x] Absolute paths used (no hidden context)

---

## D) Findings Table

| ID | Severity | File:Lines | Summary | Recommendation |
|----|----------|------------|---------|----------------|
| SEC-001 | CRITICAL | `agent-event.adapter.ts:174,199,221,254` | Session ID validation missing in getAll, getSince, archive, exists | Add `isValidSessionId()` check at start of each method |
| TASK-001 | MEDIUM | `test/integration/sse-workspace-integration.test.ts` | T013 SSE integration test file not created | Create test file or mark task incomplete |
| ORPHAN-001 | LOW | `packages/shared/src/di-tokens.ts:24` | EVENT_STORAGE token still defined but unused | Remove orphan token |
| AC-001 | LOW | `tasks.md:52` | AC-11 checkbox unchecked despite T006 marked complete | Verify all ACs checked after fix |

---

## E) Detailed Findings

### E.0) Cross-Phase Regression Analysis

**Status**: ✅ PASS

- Tests rerun: 2391 tests (159 files)
- Failures: 0
- Phase 1 regression: None detected
- Integration points: AgentSessionAdapter from Phase 1 not modified
- Plan 015 SSE: Contract tests verify no regression

### E.1) Doctrine & Testing Compliance

#### Graph Integrity

**Status**: ⚠️ MINOR_ISSUES

| Link Type | Status | Issue |
|-----------|--------|-------|
| Task↔Log | ✅ | Execution log entries present for T001-T009 |
| Task↔Footnote | ⚠️ | Phase Footnote Stubs table empty (no plan-6a run) |
| Footnote↔File | N/A | No footnotes populated yet |
| Plan↔Dossier | ✅ | Task statuses match between plan and dossier |

**Note**: Footnote ledger shows placeholder entries (`[^1]: [To be added during implementation via plan-6a]`). This is expected if plan-6a was not run during implementation.

#### TDD Compliance

**Status**: ⚠️ NEEDS_IMPROVEMENT

- Test count: 17 unit tests + 15 contract tests = 32 tests
- RED-GREEN evidence: ✅ Present in execution log
- Test documentation: ✅ Excellent (Contract/Why/Quality blocks)
- Test naming: ✅ Clear behavioral names

**Gap**: Session ID validation tests only cover `append()`. Per AC-11 and Discovery 05, validation should be tested for all filesystem-accessing methods.

#### Mock Usage Compliance

**Status**: ✅ PASS

- Policy: Fakes Only (no vi.mock per R-TEST-007)
- Implementation: FakeAgentEventAdapter with three-part API
- Contract tests: Both fake and real pass identical tests
- No vi.mock/jest.mock usage found

### E.2) Semantic Analysis

**Status**: ⚠️ SPECIFICATION_VIOLATION

#### SEC-001: Session ID Validation Gap (CRITICAL)

**Spec Requirement** (Discovery 05, AC-11):
> "Session IDs validated before filesystem operations."
> "validateSessionId() MUST be called before filesystem ops"

**Implementation**:
```typescript
// ✅ CORRECT - append() validates (line 128)
async append(ctx: WorkspaceContext, sessionId: string, event: AgentStoredEvent) {
  if (!isValidSessionId(sessionId)) {
    return { ok: false, errorMessage: `Invalid session ID: '${sessionId}'` };
  }
  // ... filesystem operations
}

// ❌ MISSING - getAll() does NOT validate (line 174)
async getAll(ctx: WorkspaceContext, sessionId: string): Promise<StoredAgentEvent[]> {
  const eventsPath = this.getEventsPath(ctx, sessionId); // Path built without validation!
  // ...
}
```

**Vulnerable Methods**:
- `getAll()` (line 174) - path traversal allows reading arbitrary NDJSON files
- `getSince()` (line 199) - calls getAll() internally
- `archive()` (line 221) - path traversal allows moving arbitrary files
- `exists()` (line 254) - path traversal allows checking arbitrary paths

**Exploitation Scenario**:
```typescript
// Attacker can read events from other sessions
await adapter.getAll(ctx, '../other-session');
// Or check existence of arbitrary paths
await adapter.exists(ctx, '../../../etc/passwd');
```

**Impact**: Information disclosure, arbitrary file existence checks, potential data corruption via archive()

**Fix**: Add validation to all public methods (see fix-tasks.md)

### E.3) Quality & Safety Analysis

**Safety Score: 50/100** (CRITICAL: 1, HIGH: 0, MEDIUM: 1, LOW: 2)

#### Correctness

- ✅ NDJSON parsing correct with malformed line handling
- ✅ Event ID generation follows DYK-01 pattern
- ✅ Workspace isolation verified by tests

#### Security

- ❌ **SEC-001**: Path traversal in 4 methods (detailed above)
- ✅ No secrets in code
- ✅ No injection vulnerabilities beyond path traversal

#### Performance

- ✅ No unbounded scans (events loaded per-session)
- ✅ No N+1 patterns
- ⚠️ Read-modify-write in append() could lose data under concurrent writes (acceptable per spec Q5: no caching)

#### Observability

- ✅ Optional logger injection for malformed line warnings
- ✅ Error messages include context

### E.4) Doctrine Evolution Recommendations

**Status**: ADVISORY (does not affect verdict)

| Category | New | Updates | Priority HIGH |
|----------|-----|---------|---------------|
| ADRs | 0 | 0 | 0 |
| Rules | 1 | 0 | 1 |
| Idioms | 0 | 0 | 0 |

#### New Rule Candidate

**ID**: RULE-REC-001  
**Statement**: All adapter methods accepting user-provided identifiers MUST validate before filesystem operations  
**Evidence**: `agent-event.adapter.ts:128` (correct), `agent-session.adapter.ts:59,92,182,214` (correct)  
**Priority**: HIGH - Security critical, prevents path traversal  
**Enforcement**: Code review checklist, consider lint rule

---

## F) Coverage Map

**Testing Approach**: Full TDD  
**Overall Confidence**: 75%

| Acceptance Criterion | Test Coverage | Confidence | Notes |
|---------------------|---------------|------------|-------|
| AC-07: IAgentEventAdapter interface | `agent-event-adapter.interface.ts` | 100% | 5 methods + types defined |
| AC-08: Events at workspace path | `agent-event-adapter.test.ts:89-110` | 100% | Path verified in tests |
| AC-09: NDJSON preserved | `agent-event-adapter.test.ts:260-320` | 100% | Malformed line tests |
| AC-10: Workspace isolation | `agent-event-adapter.test.ts:380-420` | 100% | Multi-workspace test |
| AC-11: Session ID validation | `agent-event-adapter.test.ts:184-220` | 25% | **Only append() tested** |
| AC-12: FakeAgentEventAdapter | `contract.test.ts` | 100% | 15 contract tests |

**Criterion with Weak Coverage**:
- **AC-11**: Tests only verify validation in `append()`. Need tests for `getAll()`, `getSince()`, `archive()`, `exists()`.

---

## G) Commands Executed

```bash
# Generate diff
git diff 920f7d8..cd33aa2 --stat
git diff 920f7d8..cd33aa2 --name-only

# Run test suite
pnpm test
# Result: 2391 passed, 32 skipped, 0 failed

# Verify deleted files
ls packages/shared/src/services/event-storage.service.ts
# Result: No such file (correctly deleted)
```

---

## H) Decision & Next Steps

### Required Before Merge

1. **SEC-001**: Add `isValidSessionId()` validation to all public methods
   - Follow fix-tasks.phase-2-agenteventadapter.md for detailed patch
   - Requires ~20 lines of code changes
   - Requires 4 additional tests

### Recommended (Non-Blocking)

2. **TASK-001**: Create SSE integration test or update task status
3. **ORPHAN-001**: Remove EVENT_STORAGE token from di-tokens.ts

### Approval Path

- Fix SEC-001 → Re-run tests → Re-run `plan-7-code-review`
- Expect: APPROVE after security fix verified

---

## I) Footnotes Audit

**Status**: ⚠️ Footnotes not populated

| Diff-Touched Path | Expected Footnote | Plan Ledger Entry |
|-------------------|-------------------|-------------------|
| `packages/workflow/src/adapters/agent-event.adapter.ts` | [^1] | Placeholder |
| `packages/workflow/src/fakes/fake-agent-event-adapter.ts` | [^2] | Placeholder |
| `test/unit/workflow/agent-event-adapter.test.ts` | [^3] | Placeholder |
| `test/contracts/agent-event-adapter.contract.ts` | [^4] | Placeholder |

**Recommendation**: Run `plan-6a-update-progress` to populate footnote ledger after SEC-001 fix.

---

**Review Complete**: 2026-01-28T07:45:00Z
