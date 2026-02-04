# Phase 4: Question/Answer Protocol — Code Review

**Phase**: Phase 4: Question/Answer Protocol
**Plan**: [../../pos-agentic-cli-plan.md](../../pos-agentic-cli-plan.md)
**Dossier**: [../tasks/phase-4-question-answer-protocol/tasks.md](../tasks/phase-4-question-answer-protocol/tasks.md)
**Reviewed**: 2026-02-03
**Reviewer**: LLM Code Review Agent (plan-7-code-review)

---

## A) Verdict

**✅ APPROVE**

All acceptance criteria met. Full TDD compliance verified. No blocking issues found.

---

## B) Summary

Phase 4 implements the question/answer protocol enabling agent-orchestrator handoff with 3 service methods (`askQuestion`, `answerQuestion`, `getAnswer`) and 3 CLI commands (`cg wf node ask|answer|get-answer`).

**Key Metrics:**
- 17 new unit tests (all passing)
- 339 total positional-graph tests passing
- 3083 total project tests passing
- `just fft` passes (lint, format, test)
- Package builds successfully

**Implementation Quality:**
- Full TDD discipline followed (RED → GREEN → REFACTOR)
- Avoid mocks policy enforced (FakeFileSystem/FakePathResolver used)
- All 8 tasks completed per task table
- State machine transitions correctly implemented
- Error codes E173, E176, E177 properly used

---

## C) Checklist

**Testing Approach: Full TDD**

- [x] Tests precede code (RED-GREEN-REFACTOR evidence in execution.log.md)
- [x] Tests as docs (assertions show behavior with Purpose/Quality/Acceptance comments)
- [x] Mock usage matches spec: **Avoid mocks** (FakeFileSystem/FakePathResolver used)
- [x] Negative/edge cases covered (E153 unknown node, E173 invalid qId, E176 not running, E177 not waiting)

**Universal:**
- [x] BridgeContext patterns followed (N/A - not VS Code extension code)
- [x] Only in-scope files changed (4 files per task table)
- [x] Linters/type checks are clean (`just fft` passes)
- [x] Absolute paths used (no hidden context)

---

## D) Findings Table

| ID | Severity | File:Lines | Summary | Recommendation |
|----|----------|------------|---------|----------------|
| MED-001 | MEDIUM | positional-graph.service.ts:1958+1985 | TOCTOU pattern between status check and state load | Acceptable per spec assumption (no concurrent access) |
| LOW-001 | LOW | execution.log.md | Phase Footnote Stubs not populated | Update footnotes in tasks.md |

---

## E) Detailed Findings

### E.0) Cross-Phase Regression Analysis

**Previous phases verified:**
- Phase 1: Error codes E172-E179 present and exported ✅
- Phase 2: Output storage patterns working ✅
- Phase 3: `transitionNodeState()` helper available and reusable ✅

**Regression check result:** ✅ PASS
- All 339 positional-graph tests passing
- No breaking changes to prior phase functionality
- Phase 4 correctly uses foundation work from Phase 1 (error codes, schemas)

### E.1) Doctrine & Testing Compliance

#### TDD Compliance: ✅ PASS

| Check | Status | Evidence |
|-------|--------|----------|
| TDD order | ✅ | T001 (tests) completed before T003, T005, T007 (implementation) |
| Tests as documentation | ✅ | All 17 tests have Purpose/Quality/Acceptance comments |
| RED-GREEN-REFACTOR | ✅ | Execution log documents: "All 17 tests fail with 'service.askQuestion is not a function'" |

#### Mock Usage Compliance: ✅ PASS

| Check | Status | Evidence |
|-------|--------|----------|
| Policy | Avoid mocks | Per plan Testing Philosophy |
| Mocks found | None | No jest.mock, vi.mock, sinon detected |
| Approved fakes | ✅ | FakeFileSystem, FakePathResolver, YamlParserAdapter used |

#### Plan Compliance: ✅ PASS

All 8 tasks completed per task table:

| Task | Component | Status | Evidence |
|------|-----------|--------|----------|
| T001 | Tests (TDD RED) | ✅ | 17 tests in question-answer.test.ts |
| T002 | Interface signatures | ✅ | 4 types + 3 signatures added |
| T003 | askQuestion | ✅ | Service method implemented |
| T004 | CLI ask | ✅ | handleNodeAsk handler + command |
| T005 | answerQuestion | ✅ | Service method implemented |
| T006 | CLI answer | ✅ | handleNodeAnswer handler + command |
| T007 | getAnswer | ✅ | Service method implemented |
| T008 | CLI get-answer | ✅ | handleNodeGetAnswer handler + command |

### E.2) Semantic Analysis

**Domain Logic Correctness:** ✅ PASS

| Check | Status | Evidence |
|-------|--------|----------|
| State machine transitions | ✅ | running → waiting-question → running correctly implemented |
| Question ID generation | ✅ | Timestamp + random suffix ensures uniqueness |
| Answer storage | ✅ | Stored atomically with answered_at timestamp |
| Error code usage | ✅ | E173 (invalid qId), E176 (not running), E177 (not waiting) |

**Specification Alignment:**
- AC-5: `ask` transitions to waiting-question ✅
- AC-6: `answer` stores answer, transitions to running ✅
- AC-7: `get-answer` returns stored answer ✅
- AC-18: Invalid question ID returns E173 ✅

### E.3) Quality & Safety Analysis

**Safety Score: 90/100** (CRITICAL: 0, HIGH: 0, MEDIUM: 1, LOW: 1)
**Verdict: APPROVE**

#### MED-001: TOCTOU Pattern in State Access

**File:** `packages/positional-graph/src/services/positional-graph.service.ts`
**Lines:** 1958, 1985 (askQuestion); 2037, 2045 (answerQuestion)

**Issue:** Status check via `getNodeExecutionStatus()` (line 1958) loads state, then state is loaded again (line 1985) before modification. This creates a TOCTOU window.

**Impact:** If concurrent access occurs, state could be inconsistent.

**Assessment:** **Acceptable per spec constraints.**

The plan explicitly documents (Section 85): "No concurrent access support: Per spec assumption, agents call commands sequentially per node."

This is a documented limitation, not a bug. The implementation correctly follows Critical Finding 05 by ensuring all state changes are persisted in a single atomic write.

**No fix required** unless concurrent access requirements change.

#### LOW-001: Phase Footnote Stubs Not Populated

**File:** `tasks/phase-4-question-answer-protocol/tasks.md`
**Lines:** 427-431

**Issue:** Phase Footnote Stubs section shows "(pending)" instead of actual FlowSpace node IDs.

**Assessment:** Documentation gap, does not affect functionality.

**Recommendation:** Run `plan-6a` to sync footnotes after commit.

### E.4) Doctrine Evolution Recommendations

*Advisory — does not affect approval*

**No new ADR/Rules/Idioms candidates identified.**

The Phase 4 implementation correctly follows existing patterns:
- ✅ Uses existing error code pattern from Phase 1
- ✅ Uses existing CLI handler pattern from Phase 2/3
- ✅ Uses existing state persistence pattern
- ✅ Uses existing test helper patterns (FakeFileSystem, FakePathResolver)

**Positive Alignment:**
- Implementation follows ADR-0006 (CLI-Based Orchestration)
- Implementation follows ADR-0008 (Workspace Split Storage)
- Critical Finding 05 (atomic writes) addressed

---

## F) Coverage Map

**Testing Approach:** Full TDD

| Acceptance Criterion | Test(s) | Confidence | Status |
|---------------------|---------|------------|--------|
| AC-5: `ask` transitions to waiting-question | `askQuestion — transitions to waiting-question` (line 99) | 100% | ✅ |
| AC-5: Returns question ID | `askQuestion — generates timestamp-based question ID` (line 81) | 100% | ✅ |
| AC-6: `answer` stores answer | `answerQuestion — stores answer in question` (line 234) | 100% | ✅ |
| AC-6: Transitions to running | `answerQuestion — transitions to running` (line 276) | 100% | ✅ |
| AC-7: `get-answer` returns answer | `getAnswer — returns answered: true with answer` (line 380) | 100% | ✅ |
| AC-18: Invalid qId returns E173 | `answerQuestion — returns E173 for invalid questionId` (line 308), `getAnswer — returns E173 for invalid questionId` (line 409) | 100% | ✅ |

**Additional Coverage:**
- E176 (node not running): Test at line 160 ✅
- E177 (node not waiting): Test at line 327 ✅
- E153 (unknown node): Tests at lines 182, 422 ✅
- Multiple questions: Test at line 462 ✅

**Overall Coverage Confidence:** 100%

---

## G) Commands Executed

```bash
# Test verification
pnpm test question-answer     # 17 tests pass
pnpm test positional-graph    # 339 tests pass

# Build verification
pnpm --filter @chainglass/positional-graph build   # No errors

# Full quality check
just fft                      # Lint, format, test all pass (3083 tests)

# Diff generation
git diff HEAD > /tmp/phase4-review.diff   # 590 lines, 5 files
```

---

## H) Decision & Next Steps

### Decision: ✅ APPROVE

Phase 4 implementation is **approved for merge**. All acceptance criteria met with full TDD compliance.

### Next Steps

1. **Commit Phase 4 changes** with message: `feat(positional-graph): Phase 4 Q&A protocol - ask, answer, get-answer commands`
2. **Update footnotes** by running `plan-6a` to populate Phase Footnote Stubs
3. **Proceed to Phase 5** (Input Retrieval) — run `/plan-5` for phase-5-input-retrieval

---

## I) Footnotes Audit

| File | Footnote | Node ID |
|------|----------|---------|
| `test/unit/positional-graph/question-answer.test.ts` | [^6] | file:test/unit/positional-graph/question-answer.test.ts |
| `packages/positional-graph/src/interfaces/positional-graph-service.interface.ts` | [^6] | file:packages/positional-graph/src/interfaces/positional-graph-service.interface.ts |
| `packages/positional-graph/src/services/positional-graph.service.ts` | [^6] | file:packages/positional-graph/src/services/positional-graph.service.ts |
| `apps/cli/src/commands/positional-graph.command.ts` | [^6] | file:apps/cli/src/commands/positional-graph.command.ts |

**Note:** Footnote stubs in tasks.md show "(pending)" — should be populated via plan-6a after implementation.

---

*Review generated by plan-7-code-review*
