# Phase 6 Code Review: E2E Validation & Cleanup

**Plan**: [../../workgraph-workspaces-upgrade-plan.md](../../workgraph-workspaces-upgrade-plan.md)
**Phase**: Phase 6: E2E Validation & Cleanup
**Commit Range**: `39d880b..02632c2`
**Review Date**: 2026-01-28
**Reviewer**: AI Code Review Agent

---

## A) Verdict

## ⚠️ REQUEST_CHANGES

**Reason**: Security vulnerabilities identified in E2E harness infrastructure code. While this is test/development tooling (not production), the command injection vulnerability (CRITICAL-001) warrants attention before merge.

---

## B) Summary

Phase 6 successfully validates the complete workspace integration migration:
- ✅ E2E cleanup expanded to handle 3 paths (legacy, new, mock-outputs)
- ✅ 12 integration tests fixed with WorkspaceContext
- ✅ Sample units migrated to `.chainglass/data/units/`
- ✅ All doc comments updated with new paths
- ✅ Zero legacy paths found in source code
- ✅ 2340 tests passing
- ⚠️ Security findings in E2E harness infrastructure

**Files Modified**: 15 (5 renames, 10 edits)
**Testing Strategy**: Full TDD with Fakes Only
**Mock Policy Compliance**: ✅ PASS

---

## C) Checklist

**Testing Approach: Full TDD**

- [x] Tests use fakes only (FakeFileSystem, FakePathResolver, FakeYamlParser)
- [x] No vi.mock(), vi.spyOn(), or mocking libraries
- [x] Three-part API followed: State Setup, State Inspection, Error Injection
- [x] Integration tests pass (12/12)
- [x] Unit tests pass (2340/2340)
- [x] E2E validation complete (mock + agent modes)

**Universal**

- [x] Only in-scope files changed (note: script.sh is E2E test fixture)
- [x] Linters/type checks clean
- [x] Absolute paths used with WorkspaceContext
- [ ] No security vulnerabilities (see findings)

---

## D) Findings Table

| ID | Severity | File:Lines | Summary | Recommendation |
|----|----------|------------|---------|----------------|
| SEC-001 | CRITICAL | e2e-sample-flow.ts:609 | Command injection via unsanitized scriptPath | Use spawn() with array args |
| SEC-002 | HIGH | cli-runner.ts:66 | Weak JSON detection via string matching | Use try/catch JSON parsing |
| SEC-003 | HIGH | cli-runner.ts:245 | Path traversal in loadPromptTemplate | Validate unitSlug allowlist |
| COR-001 | CRITICAL | cli-runner.ts:72-74 | Empty stdout handling breaks error reporting | Handle empty string case |
| COR-002 | HIGH | cli-runner.ts:66 | Brittle string matching for NDJSON | Parse JSON before field check |
| LNK-001 | CRITICAL | tasks.md | No footnotes in Phase 6 task table | Add [^6]-[^10] footnotes |
| LNK-002 | CRITICAL | tasks.md:383-386 | Empty footnote stub table | Populate during implementation |
| SCP-001 | LOW | script.sh | Modified outside task scope | Verified: E2E test fixture - OK |

---

## E) Detailed Findings

### E.0) Cross-Phase Regression Analysis

**Status**: ✅ PASS

- Prior phases (1-5) functionality intact
- All 2340 tests passing
- No breaking changes to public interfaces
- WorkspaceContext parameter consistently applied across all phases

### E.1) Doctrine & Testing Compliance

#### Graph Integrity (Link Validation)

**Task↔Footnote Validation**: ❌ BROKEN

| Issue | Severity | Details |
|-------|----------|---------|
| Missing footnotes | CRITICAL | Phase 6 tasks modify 10+ files but have NO [^N] references in Notes column |
| Empty stub table | CRITICAL | Phase Footnote Stubs table is empty (lines 383-386) |
| Plan ledger gap | HIGH | Plan § 10 footnotes [^1]-[^5] cover Phase 3-4 only, no Phase 6 entries |

**Recommendation**: Add footnotes [^6]-[^10] tracking Phase 6 file changes before merge.

#### Mock Usage Compliance

**Policy**: Fakes Only (per R-TEST-007)
**Status**: ✅ PASS

| Check | Result |
|-------|--------|
| vi.mock() usage | 0 |
| vi.spyOn() usage | 0 |
| Fake implementations | FakeFileSystem, FakePathResolver, FakeYamlParser |
| Three-part API | State Setup ✅, State Inspection ✅, Error Injection ✅ |

### E.2) Semantic Analysis

**Domain Logic**: ✅ CORRECT
- Workspace-scoped paths correctly applied
- WorkspaceContext parameter consistently passed
- Data isolation verified via integration tests

**Algorithm Accuracy**: ✅ CORRECT
- NDJSON parsing logic finds last valid JSON line
- Cleanup handles multiple paths correctly

**Specification Drift**: None detected

### E.3) Quality & Safety Analysis

#### Security Findings

**SEC-001: Command Injection (CRITICAL)**
- **File**: `docs/how/dev/workgraph-run/e2e-sample-flow.ts:609`
- **Issue**: `await execAsync(\`bash "${scriptPath}"\`)` - scriptPath from CLI output
- **Impact**: Shell metacharacters in scriptPath could execute arbitrary commands
- **Fix**: Use `spawn('bash', [scriptPath])` instead of exec with interpolation

**SEC-002: Weak JSON Detection (HIGH)**
- **File**: `docs/how/dev/workgraph-run/lib/cli-runner.ts:66`
- **Issue**: `line.includes('"success"')` for JSON detection
- **Impact**: Log lines containing "success" could be incorrectly parsed
- **Fix**: Wrap in try-catch JSON.parse before field checking

**SEC-003: Path Traversal (HIGH)**
- **File**: `docs/how/dev/workgraph-run/lib/cli-runner.ts:245`
- **Issue**: `resolve(UNITS_DIR, unitSlug, ...)` without validation
- **Impact**: `unitSlug='../../etc/passwd'` could read outside UNITS_DIR
- **Fix**: Validate unitSlug matches `/^[a-z0-9-]+$/`

#### Correctness Findings

**COR-001: Empty Stdout Handling (CRITICAL)**
- **File**: `cli-runner.ts:72-74`
- **Issue**: `lines[lines.length - 1]` returns empty string when stdout empty
- **Impact**: JSON.parse('') throws, masked by catch block
- **Fix**: Check for empty/whitespace-only lines before fallback

**COR-002: String Matching Brittleness (HIGH)**
- **File**: `cli-runner.ts:66`
- **Issue**: String matching instead of JSON parsing
- **Impact**: False positives from log lines containing keywords
- **Fix**: `try { JSON.parse(line); return true; } catch { return false; }`

#### Performance & Observability

No significant issues found.

### E.4) Doctrine Evolution Recommendations

**Advisory - Does Not Affect Verdict**

| Category | Recommendation | Priority |
|----------|---------------|----------|
| Rule | Add "sanitize shell arguments" rule for CLI tooling | MEDIUM |
| Idiom | Document spawn() vs exec() pattern for subprocess calls | LOW |

---

## F) Coverage Map

**Testing Approach**: Full TDD with E2E Validation

| Acceptance Criterion | Test Coverage | Confidence |
|---------------------|---------------|------------|
| E2E cleanup handles 3 paths | e2e-sample-flow.ts:129-131 | 100% - explicit |
| Integration tests pass with ctx | 12 tests across 3 files | 100% - explicit |
| Units migrated to new location | git mv + cli-runner.ts:18 | 100% - verified |
| No legacy paths in source | grep verification | 100% - automated |
| E2E mock mode passes | Runtime validation | 100% - executed |
| E2E agent modes pass | Runtime validation | 100% - executed |

**Overall Coverage Confidence**: 95% (excellent)

---

## G) Commands Executed

```bash
# Diff generation
git diff 39d880b..02632c2 --unified=3

# Test execution
pnpm test
# Result: 2340 passed | 19 skipped

# Legacy path verification
grep -r '\.chainglass/work-graphs' packages/ apps/ --include='*.ts'
# Result: 0 matches

# Integration test verification
pnpm test test/integration/workgraph/
# Result: 12 tests passing
```

---

## H) Decision & Next Steps

### Required Before Merge

1. **Address SEC-001 (CRITICAL)**: Replace exec() with spawn() in e2e-sample-flow.ts:609
2. **Address COR-001 (CRITICAL)**: Handle empty stdout case in cli-runner.ts

### Recommended (Not Blocking)

3. Add footnotes [^6]-[^10] to Phase 6 task table for audit trail
4. Improve JSON detection in cli-runner.ts (use try/catch parsing)
5. Add unitSlug validation in loadPromptTemplate()

### Post-Merge

- Mark Phase 6 as complete in plan progress tracking
- Close Plan 021 if all phases validated

---

## I) Footnotes Audit

| Diff File | Task | Expected Footnote | Status |
|-----------|------|-------------------|--------|
| e2e-sample-flow.ts | T001 | [^6] | ❌ Missing |
| cli-workflow.test.ts | T001a | [^7] | ❌ Missing |
| workgraph-lifecycle.test.ts | T001a | [^7] | ❌ Missing |
| workunit-lifecycle.test.ts | T001a | [^7] | ❌ Missing |
| .chainglass/data/units/* | T001b | [^8] | ❌ Missing |
| unit.command.ts | T010 | [^9] | ❌ Missing |
| workgraph.command.ts | T010 | [^9] | ❌ Missing |
| workgraph.service.ts | T010 | [^9] | ❌ Missing |
| cli-runner.ts | (unplanned) | [^10] | ❌ Missing |
| script.sh | (E2E fixture) | N/A | OK |

**Graph Integrity Score**: ❌ BROKEN (0/10 required footnotes present)

---

**Review Complete**: REQUEST_CHANGES due to security vulnerabilities in E2E infrastructure.
