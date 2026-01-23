# Code Review: Subtask 001 - Implement Message CLI Commands

**Phase**: Phase 3: Phase Operations
**Subtask**: 001-subtask-implement-message-cli-commands
**Review Date**: 2026-01-23
**Reviewer**: Automated Code Review (plan-7-code-review)
**Testing Approach**: Full TDD
**Diff Range**: cc3c991..ed29888 (4,318 lines added, 50 deleted)

---

## A) Verdict

**REQUEST_CHANGES** (STRICT mode: HIGH findings present)

---

## B) Summary

Subtask 001 implements message CLI commands (`cg phase message create/answer/list/read`) with strong TDD discipline and comprehensive testing (81 new tests, 738 total passing). The implementation follows all established patterns (Output Adapters, Fakes-only mocking, contract tests). However, **security vulnerabilities** (path traversal risk, unhandled JSON parse errors) and **documentation gaps** (10 missing execution log entries) require remediation before merge.

**Key Metrics**:
- Tests: 738 passing ✓
- Type checking: Pass ✓
- Lint: 17 style issues (not blocking)
- Security: 1 CRITICAL, 1 HIGH finding
- Correctness: 1 HIGH (race condition), 1 MEDIUM
- Documentation: 10 HIGH (missing log entries)

---

## C) Checklist

**Testing Approach: Full TDD**

- [x] Tests precede code (RED-GREEN-REFACTOR evidence in execution log)
- [x] Tests as docs (assertions show behavior, structured Test Doc comments)
- [x] Mock usage matches spec: Avoid ✓ (Fakes only, no vi.mock/jest.mock found)
- [x] Negative/edge cases covered (E060-E064 error codes, 8+ error scenarios)

**Universal (all approaches)**:
- [x] BridgeContext patterns followed (N/A - no VS Code extension code)
- [~] Only in-scope files changed (Index files modified but justified for exports)
- [x] Linters/type checks are clean (typecheck pass, lint has style-only issues)
- [ ] Absolute paths used (no hidden context) ⚠️ Missing validation

---

## D) Findings Table

| ID | Severity | File:Lines | Summary | Recommendation |
|----|----------|------------|---------|----------------|
| SEC-001 | CRITICAL | message.service.ts:50,241 | Path traversal via `phase` and `id` parameters | Add path canonicalization and validation |
| SEC-002 | HIGH | message.service.ts:137,211,260,417 | Uncaught JSON.parse errors | Wrap in try-catch with error result |
| COR-001 | HIGH | message.service.ts:415-432 | Race condition in appendStatusEntry() | Add file locking or atomic write |
| DOC-001 | HIGH | execution.log.md | Missing log entries for 10 completed tasks | Add entries for ST007-ST010, ST013-ST018 |
| LNT-001 | MEDIUM | message.service.ts:286 | Use Number.parseInt() instead of parseInt() | Lint fix |
| LNT-002 | LOW | Multiple test files | Import organization and formatting | Run `pnpm exec biome check --fix` |

---

## E) Detailed Findings

### E.0) Cross-Phase Regression Analysis

**Skipped**: Subtask review (no prior phases to regress against within subtask scope)

### E.1) Doctrine & Testing Compliance

#### Link Validation (Task↔Log)

**Status**: ❌ 10 HIGH violations

| Task ID | Issue | Fix |
|---------|-------|-----|
| ST007 | Missing log entry | Add execution log for list() tests |
| ST008 | Missing log entry | Add execution log for list() impl |
| ST009 | Missing log entry | Add execution log for read() tests |
| ST010 | Missing log entry | Add execution log for read() impl |
| ST013 | Missing log entry | Add execution log for CLI skeleton |
| ST014 | Missing log entry | Add execution log for create handler |
| ST015 | Missing log entry | Add execution log for answer handler |
| ST016 | Missing log entry | Add execution log for list handler |
| ST017 | Missing log entry | Add execution log for read handler |
| ST018 | Missing log entry | Add execution log for CLI registration |

**Note**: The execution log groups ST007-ST010 under "Tasks ST007-ST010" and ST013-ST018 under "Tasks ST013-ST018" headers. While the work was done, individual task entries per the dossier table format are missing.

#### TDD Compliance

**Status**: ✅ PASS

- RED-GREEN-REFACTOR cycles documented for create(), answer(), list(), read()
- Evidence: "11 tests failed (RED phase - expected)" before implementation
- Test names follow behavioral pattern
- 36 unit tests + 19 fake tests + 26 contract tests = 81 total

#### Mock Usage Compliance

**Status**: ✅ PASS

- Policy: "Fakes only, avoid mocks"
- No vi.mock, jest.mock, sinon patterns found
- Proper fakes: FakeMessageService, FakeFileSystem, FakeSchemaValidator
- Call capture pattern correctly implemented

#### Authority Conflicts

**Status**: N/A - No separate dossier footnotes (subtask uses inline task table)

### E.2) Semantic Analysis

**Status**: ✅ PASS

- Domain logic matches spec: create/answer/list/read operations per plan
- Error codes E060-E064 implemented correctly
- Status log integration (question/answer actions) implemented
- Message type validation (single_choice, multi_choice, free_text, confirm) correct

### E.3) Quality & Safety Analysis

**Safety Score: -150/100** (CRITICAL: 1, HIGH: 2, MEDIUM: 1, LOW: 1)
**Verdict: REQUEST_CHANGES**

#### SEC-001: Path Traversal Vulnerability (CRITICAL)

**File**: `/home/jak/substrate/003-wf-basics/packages/workflow/src/services/message.service.ts`
**Lines**: 50, 241

**Issue**: The `phase` and `id` parameters from CLI are directly used in path construction without validation:
```typescript
const messagesDir = path.join(runDir, 'phases', phase, 'run', 'messages');
const filePath = path.join(messagesDir, `m-${id}.json`);
```

**Impact**: Attacker could use `../` sequences to read/write arbitrary files:
```bash
cg phase message read --run-dir /legitimate --id "001/../../../etc/passwd"
cg phase message create "../../../malicious" --run-dir /legitimate ...
```

**Fix**:
```typescript
// Add path validation helper
function validatePath(basePath: string, relativePath: string): string {
  const resolved = path.resolve(basePath, relativePath);
  if (!resolved.startsWith(path.resolve(basePath))) {
    throw new Error(`Path traversal detected: ${relativePath}`);
  }
  return resolved;
}

// Validate phase name (alphanumeric + hyphen/underscore only)
function validatePhaseName(phase: string): void {
  if (!/^[a-zA-Z0-9_-]+$/.test(phase)) {
    throw new Error(`Invalid phase name: ${phase}`);
  }
}

// Usage:
validatePhaseName(phase);
const messagesDir = validatePath(runDir, path.join('phases', phase, 'run', 'messages'));
```

#### SEC-002: Uncaught JSON.parse Errors (HIGH)

**File**: `/home/jak/substrate/003-wf-basics/packages/workflow/src/services/message.service.ts`
**Lines**: 137, 211, 260, 417

**Issue**: `JSON.parse()` calls without try-catch. Malformed files crash the service.

**Impact**: DoS via corrupted message files.

**Fix**:
```typescript
try {
  message = JSON.parse(messageContent);
} catch (e) {
  return this.createErrorResult<MessageReadResult>(
    phase, runDir, MessageErrorCodes.MESSAGE_VALIDATION_FAILED,
    { message: 'Invalid JSON in message file', path: filePath, action: 'Check file integrity' },
    { message: null }
  );
}
```

#### COR-001: Race Condition in Status Log Update (HIGH)

**File**: `/home/jak/substrate/003-wf-basics/packages/workflow/src/services/message.service.ts`
**Lines**: 415-432

**Issue**: Read-modify-write on `wf-phase.json` is not atomic. Concurrent calls could lose status entries.

**Impact**: Status history loss under concurrent message operations.

**Fix**: Document single-writer constraint prominently OR implement file locking:
```typescript
// Option 1: Document constraint (acceptable given facilitator model)
/**
 * IMPORTANT: Single-writer constraint per facilitator model.
 * Only one actor (agent OR orchestrator) should call message operations at a time.
 * Concurrent calls from the same actor may lose status entries.
 */

// Option 2: File locking (more robust)
const lockPath = `${wfPhasePath}.lock`;
await this.fs.writeFile(lockPath, ''); // acquire
try {
  // read-modify-write
} finally {
  await this.fs.unlink(lockPath);
}
```

### E.4) Doctrine Evolution Recommendations

**Status**: Advisory (does not affect verdict)

| Category | Recommendation | Priority |
|----------|----------------|----------|
| **New Rule** | Add path validation rule: "All user-provided paths must be validated against base directory before use" | HIGH |
| **New Rule** | Add JSON parse rule: "All JSON.parse calls must be wrapped in try-catch with proper error handling" | HIGH |
| **ADR Candidate** | Document single-writer constraint for status log operations | MEDIUM |
| **Idiom** | Establish validatePath() utility pattern for path safety | MEDIUM |

---

## F) Coverage Map

**Testing Approach**: Full TDD

| Acceptance Criterion | Test(s) | Confidence |
|---------------------|---------|------------|
| Create message returns MessageCreateResult | create() happy path tests (5) | 100% |
| Sequential message IDs (001, 002, ...) | ID generation tests (2) | 100% |
| E064 for invalid content | validation tests (2) | 100% |
| All 4 message types supported | type-specific tests (4) | 100% |
| E060 for non-existent message | read/answer error tests (3) | 100% |
| E063 for already-answered | answer error test (1) | 100% |
| E061 for type mismatch | answer validation tests (8) | 100% |
| Status log integration | status entry tests (2) | 100% |
| CLI commands work with --json | Contract tests | 75% (unit only) |
| Real/Fake parity | Contract tests (26) | 100% |

**Overall Confidence**: 95% (deferred ST019 CLI integration tests)

---

## G) Commands Executed

```bash
# Tests
pnpm test
# Result: 738 tests passed

# Type checking
pnpm typecheck
# Result: Pass

# Linting
pnpm exec biome check packages/ apps/ test/
# Result: 17 style issues (formatting, import organization)

# Git diff
git diff cc3c991..ed29888 --stat
# Result: 21 files changed, 4318 insertions(+), 50 deletions(-)
```

---

## H) Decision & Next Steps

**Decision**: REQUEST_CHANGES

**Required Before Merge**:

1. **SEC-001 (CRITICAL)**: Add path validation to prevent traversal attacks
   - Add `validatePhaseName()` and `validatePath()` helpers
   - Apply to all path construction in MessageService

2. **SEC-002 (HIGH)**: Add try-catch around JSON.parse calls
   - Wrap all 4 occurrences with proper error handling
   - Return appropriate error result instead of crashing

3. **COR-001 (HIGH)**: Document single-writer constraint
   - Add prominent JSDoc comment on MessageService
   - OR implement file locking if concurrent access is expected

4. **DOC-001 (HIGH)**: Update execution log with missing task entries
   - Add individual entries for ST007-ST010, ST013-ST018
   - Follow established log entry format

**Optional (Recommended)**:

5. **LNT-001/002**: Run `pnpm exec biome check --fix --unsafe` to auto-fix style issues

**Process**:
1. Create fix-tasks.001-subtask-message-cli-commands.md with specific patches
2. Address findings in order: SEC-001 → SEC-002 → COR-001 → DOC-001
3. Re-run code review (plan-7-code-review)
4. On APPROVE: Merge subtask

---

## I) Footnotes Audit

**Status**: N/A - Subtask uses inline task table without FlowSpace footnotes

The subtask dossier has a "Phase Footnote Stubs" section placeholder (line 596) but no footnotes were populated during implementation. This is acceptable for subtask-level work that doesn't require plan ledger tracking.

---

**Review Complete**: 2026-01-23T07:45 UTC
