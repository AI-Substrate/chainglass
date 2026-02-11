# Code Review: Phase 6 — ODS Action Handlers

**Plan**: positional-orchestrator-plan.md
**Phase**: Phase 6: ODS Action Handlers
**Dossier**: `tasks/phase-6-ods-action-handlers/tasks.md`
**Reviewer**: plan-7-code-review
**Date**: 2026-02-09
**Mode**: Full

---

## A) Verdict

**APPROVE** (with advisory notes)

No CRITICAL findings. Two HIGH findings identified but both are deferred-by-design (acknowledged in plan/workshop scope). All mandatory gates pass.

---

## B) Summary

Phase 6 delivers the Orchestration Dispatch Service (ODS) — the executor that takes ONBAS decisions and performs state changes. The implementation is clean, well-tested (12 new ODS tests + 39 simplified ONBAS tests = 202 total across 030-orchestration), follows TDD discipline, and stays precisely within dossier scope.

Key accomplishments:
- ONBAS simplified by removing `visitWaitingQuestion()` per Workshop 11/12 alignment
- `IODS` interface, `ODS` implementation, and `FakeODS` test double delivered per ADR-0011
- Exhaustive dispatch table covers all 4 request types with TypeScript `never` default
- Fire-and-forget pattern correctly implemented for `pod.execute()`
- All tests pass; `just fft` clean (3702 tests, 0 failures)

Two advisory HIGH-severity notes relate to unhandled promise rejection safety and zombie node recovery — both are explicitly deferred to Phase 7's orchestration loop per Workshop 12 scope.

---

## C) Checklist

**Testing Approach: Full TDD**

- [x] Tests precede code (RED-GREEN-REFACTOR evidence) — execution log shows T005-T007 (RED) before T008 (GREEN)
- [x] Tests as docs (assertions show behavior) — test names are descriptive, Test Doc block present with 5 fields
- [x] Mock usage matches spec: Fakes only — zero vi.mock/jest.mock, uses FakePodManager, FakeAgentContextService, inline stubs
- [x] Negative/edge cases covered — NODE_NOT_READY, NODE_NOT_FOUND, START_NODE_FAILED, UNSUPPORTED_REQUEST_TYPE, user-input no-op
- [x] FakeODS follows ADR-0011 pattern — implements IODS with setNextResult/setResults/getHistory/reset

**Universal:**
- [x] BridgeContext patterns: N/A (not a VS Code extension)
- [x] Only in-scope files changed — all files in task table paths
- [x] Linters/type checks clean — `just fft` passes, `tsc --noEmit` clean
- [x] Absolute paths used (no hidden context)

---

## D) Findings Table

| ID | Severity | File:Lines | Summary | Recommendation |
|----|----------|------------|---------|----------------|
| ODS-001 | HIGH | ods.ts:122-127 | Fire-and-forget `pod.execute()` has no `.catch()` — unhandled promise rejection risk | Add `.catch()` handler or document Phase 7 recovery |
| ODS-002 | HIGH | ods.ts:101-129 | No rollback of `startNode()` state on pod creation/execution failure — zombie nodes | Phase 7 Settle should detect zombie `starting` nodes |
| ODS-003 | MEDIUM | ods.ts:25-56 | No logging anywhere in ODS — Act step has zero observability | Add logger to ODSDependencies; log request dispatch and outcomes |
| ODS-004 | MEDIUM | ods.ts:102-109 | `startNode()` failure loses structured error details — only `errors[0].message` captured | Include error code and node status in error response |
| ODS-005 | MEDIUM | ods.ts:113-116 | `contextService.getContextSource()` called unconditionally for all unit types | Guard with `if (node.unitType === 'agent')` |
| TDD-001 | LOW | ods.test.ts:346-366 | AC-14 input wiring test verifies pod execution but doesn't assert specific inputs reached pod | Strengthen assertion to verify actual input values in pod.execute() args |
| SCOPE-001 | LOW | plan:538-576 | Plan deliverables mention `ICentralEventNotifier` but dossier defers — documented deviation per Workshop 12 | Acknowledged in dossier compliance check |

---

## E) Detailed Findings

### E.0) Cross-Phase Regression Analysis

**Tests rerun**: All 202 tests across 030-orchestration feature pass (39 ONBAS + 12 ODS + 151 from Phases 1-5).

**Contract validation**: No breaking changes to prior phase interfaces.
- `PositionalGraphReality` (Phase 1): read-only access unchanged
- `OrchestrationRequest` (Phase 2): consumed as-is, all 4 types handled
- `IAgentContextService` (Phase 3): `getContextSource()` called correctly
- `IPodManager` (Phase 4): `createPod()` and `pod.execute()` used as designed
- `IONBAS` (Phase 5): `visitWaitingQuestion()` removal is the intended simplification

**Integration points**: Data flow from ONBAS → ODS is correctly wired. `buildFakeReality()` helper works across all test files.

**Backward compatibility**: ONBAS test reduction from 45 → 39 tests is intentional (removed question-production tests, added 3 skip-behavior tests). No regression in remaining 39 tests.

**Verdict**: PASS — no regressions detected.

### E.1) Doctrine & Testing Compliance

**TDD Compliance**: PASS
- Execution log documents RED-GREEN-REFACTOR cycle: T005-T007 (RED) → T008 (GREEN) → T009 (verify)
- Tests written before implementation in correct dependency order
- T001-T002 (ONBAS simplification) correctly precedes T003-T009 (ODS implementation)

**Mock Compliance**: PASS
- Zero `vi.mock()` or `jest.mock()` usage across all files
- Test doubles used: `FakePodManager`, `FakeAgentContextService`, inline `makeGraphServiceStub()`
- `FakeODS` follows ADR-0011 standard fake pattern with setNextResult/setResults/getHistory/reset

**Test Doc Block**: PASS
- `ods.test.ts` has complete 5-field Test Doc comment block (lines 1-9)
- `onbas.test.ts` Test Doc updated to reflect simplified contract (event-based lifecycle)

**Graph Integrity**: Partial — Phase Footnote Stubs section is empty. No footnotes have been added to the dossier or plan ledger for Phase 6 changes. This is a documentation gap but not a blocking issue since the files are clearly traceable from the task table.

| Item | Status |
|------|--------|
| TDD order evidence | ✅ PASS |
| Tests as documentation | ✅ PASS |
| Mock usage compliance | ✅ PASS |
| Test Doc blocks | ✅ PASS |
| Phase Footnote Stubs | ⚠️ Empty (no footnotes added) |

### E.2) Semantic Analysis

**Domain Logic Correctness**: PASS

The ODS dispatch table correctly implements Workshop 12 scope:
- `start-node`: Validates readiness → transitions state → resolves context → creates pod → fires execution
- `no-action`: Pass-through returning `{ ok: true }`
- `resume-node` / `question-pending`: Defensive errors with `UNSUPPORTED_REQUEST_TYPE`
- Default: TypeScript `never` exhaustive check with `UNKNOWN_REQUEST_TYPE`

**handleStartNode flow** matches Workshop 12 Part 8:
1. Look up node in reality ✅
2. User-input early return (no pod) ✅
3. Readiness validation ✅
4. State reservation via `graphService.startNode()` ✅
5. Context resolution via `contextService.getContextSource()` ✅
6. Pod creation via `podManager.createPod()` ✅
7. Fire-and-forget `pod.execute()` ✅
8. Return `{ ok: true, newStatus: 'starting' }` ✅

**ODSDependencies** correctly lists 5 deps: `graphService`, `podManager`, `contextService`, `agentAdapter`, `scriptRunner`. The discovery that Workshop 12's "Three dependencies" was incorrect is documented in the Discoveries table.

**Specification drift**: The plan task table (6.1-6.11) lists handlers for "all 4 request types" including full `resume-node` and `question-pending` implementation, plus `ICentralEventNotifier` integration. The dossier explicitly narrows scope per Workshop 12 Part 12 (resume-node/question-pending are defensive errors, event notification deferred). This is a **justified deviation** documented in the dossier's compliance check table.

### E.3) Quality & Safety Analysis

**Safety Score: 66/100** (CRITICAL: 0, HIGH: 2, MEDIUM: 3, LOW: 2)

#### ODS-001 [HIGH] — Unhandled Promise Rejection Risk
**File**: `ods.ts:122-127`
**Issue**: `pod.execute()` is called fire-and-forget without `.catch()`. If the returned Promise rejects, Node.js emits `unhandledRejection` which can crash the process depending on `--unhandled-rejections` flag.
**Impact**: Process crash in production on pod execution failure.
**Fix**: Add `.catch()` handler:
```diff
-    pod.execute({
+    pod.execute({
       inputs: request.inputs,
       contextSessionId,
       ctx: { worktreePath: ctx.worktreePath },
       graphSlug: request.graphSlug,
-    });
+    }).catch(() => {
+      // Fire-and-forget: pod failures are discovered by Settle phase.
+      // Rejection caught to prevent unhandled promise rejection crash.
+    });
```
**Mitigating factor**: `AgentPod.execute()` and `CodePod.execute()` internally catch exceptions and return error results. The rejection risk is only from unexpected bugs, not normal error paths. Phase 7's Settle step will discover pod outcomes.

#### ODS-002 [HIGH] — Zombie Node Risk After Pod Failure
**File**: `ods.ts:101-129`
**Issue**: If `podManager.createPod()` throws after `graphService.startNode()` has transitioned the node to `starting`, the node is permanently stuck in `starting` state with no recovery path.
**Impact**: Zombie nodes block the line and halt graph progress.
**Fix**: Wrap in try/catch or rely on Phase 7 Settle to detect stuck `starting` nodes:
```diff
+    try {
       const pod = this.deps.podManager.createPod(nodeId, this.buildPodParams(node));
       pod.execute({ ... }).catch(() => {});
       return { ok: true, request, newStatus: 'starting', sessionId: pod.sessionId };
+    } catch (err) {
+      return {
+        ok: false,
+        error: { code: 'POD_CREATION_FAILED', message: String(err), nodeId },
+        request,
+      };
+    }
```
**Mitigating factor**: `createPod()` is unlikely to throw — `FakePodManager` validates this in tests. Real `PodManager` is similarly defensive.

#### ODS-003 [MEDIUM] — No Logging in ODS
**File**: `ods.ts` (entire file)
**Issue**: Zero log statements. The Act step of the orchestration loop has no observability trail.
**Recommendation**: Add logger to `ODSDependencies`. Log: request type received, start-node dispatch, startNode failures, pod creation. Defer to Phase 7 when logger wiring is established.

#### ODS-004 [MEDIUM] — startNode Error Detail Loss
**File**: `ods.ts:102-109`
**Issue**: Only `startResult.errors[0].message` is captured. Error code and additional errors are discarded.
**Recommendation**: Include error code and node status: `startNode failed for ${nodeId} (status: ${node.status}): ${msg}`.

#### ODS-005 [MEDIUM] — Unnecessary contextService Call for Code Nodes
**File**: `ods.ts:113-116`
**Issue**: `getContextSource()` called for code nodes even though "code pods don't have sessions" (per comment).
**Recommendation**: Guard with `if (node.unitType === 'agent')` before calling context service.

#### TDD-001 [LOW] — Input Wiring Test Assertion Weakness
**File**: `ods.test.ts:346-366`
**Issue**: The AC-14 input wiring test creates custom inputs but only asserts `pod.wasExecuted === true` — doesn't verify the specific inputs reached the pod's `execute()` call args.
**Recommendation**: Assert that `pod.executeOptions.inputs` matches the custom inputs for stronger AC-14 coverage.

#### SCOPE-001 [LOW] — Plan vs Dossier Scope Deviation
**Issue**: Plan deliverables include `ICentralEventNotifier` integration but dossier defers per Workshop 12. This is a justified deviation documented in the dossier compliance check (MEDIUM severity in pre-implementation audit).

### E.4) Doctrine Evolution Recommendations (Advisory)

**New Rules Candidates**:
- **RULE-REC-001** (MEDIUM): Fire-and-forget async calls MUST have `.catch()` handlers. Evidence: `ods.ts:122` lacks `.catch()`, creating unhandled rejection risk. Enforcement: ESLint `@typescript-eslint/no-floating-promises`.

**Positive Alignment**:
- ADR-0011 (First-Class Domain Concepts): ODS correctly follows interface → fake → tests → implementation pattern
- ADR-0004 (DI): ODS is internal, no public DI token, constructed by Phase 7 as designed
- ADR-0006 (CLI Agent Invocation): ODS delegates to pod, does not call agents directly

| Category | New | Updates | Priority HIGH |
|----------|-----|---------|---------------|
| ADRs | 0 | 0 | 0 |
| Rules | 1 | 0 | 0 |
| Idioms | 0 | 0 | 0 |
| Architecture | 0 | 0 | 0 |

---

## F) Coverage Map

### Acceptance Criteria → Test Mapping

| AC | Description | Test(s) | Confidence | Notes |
|----|-------------|---------|------------|-------|
| AC-6 | ODS executes each request type | `agent node: creates pod...`, `code node: creates pod...`, `user-input node: returns ok...`, `no-action: returns ok...`, `resume-node: returns defensive...`, `question-pending: returns defensive...` | 100% | All 4 request types explicitly tested |
| AC-9 step 6 | restart-pending → ready → start-node → ODS | `context inheritance: passes contextSessionId...` | 75% | Context inheritance tested; restart-pending state transition tested via readiness validation |
| AC-14 | Input wiring flows through ODS to pods | `request.inputs flow through to pod.execute()`, `graphSlug flows through to pod.execute()` | 75% | Inputs pass through but assertion could be stronger (verifies pod executed, not specific input values) |
| Subtask 002 | ONBAS question logic removal | `waiting-question node is always skipped`, `waiting-question with unsurfaced question is skipped`, `sole waiting-question node on incomplete line → all-waiting` | 100% | 3 tests confirm skip behavior |

**Overall coverage confidence**: 88% (weighted average)
**Narrative tests**: None — all tests have clear criterion mapping

---

## G) Commands Executed

```bash
# TypeScript type check
pnpm exec tsc --noEmit -p packages/positional-graph/tsconfig.json
# ✅ Clean

# ODS tests
npx vitest run test/unit/positional-graph/features/030-orchestration/ods.test.ts --reporter=verbose
# ✅ 12 passed (12)

# ONBAS tests
npx vitest run test/unit/positional-graph/features/030-orchestration/onbas.test.ts --reporter=verbose
# ✅ 39 passed (39)

# All 030-orchestration tests
npx vitest run test/unit/positional-graph/features/030-orchestration/ --reporter=verbose
# ✅ 202 passed (202) across 7 test files

# Full quality gate
just fft
# ✅ 3702 passed | 41 skipped | 0 failed
```

---

## H) Decision & Next Steps

**Decision**: APPROVE

The two HIGH findings (ODS-001, ODS-002) are both fire-and-forget safety concerns that are mitigated by:
1. Pod implementations internally catching exceptions
2. Phase 7's Settle step discovering pod outcomes
3. Workshop 12 explicitly deferring event notification and post-execute state management

**Recommended follow-up for Phase 7**:
- Add `.catch()` to `pod.execute()` call in ODS (ODS-001)
- Add logger to `ODSDependencies` (ODS-003)
- Ensure Settle step detects zombie `starting` nodes (ODS-002)
- Wire `ICentralEventNotifier` for domain events (SCOPE-001)

**Phase 6 is ready to merge.** Proceed to Phase 7 planning via `/plan-5-phase-tasks-and-brief`.

---

## I) Footnotes Audit

| Diff-Touched Path | Footnote Tags | Plan Ledger Node-IDs |
|--------------------|---------------|---------------------|
| `ods.types.ts` (new) | — | — |
| `ods.ts` (new) | — | — |
| `fake-ods.ts` (new) | — | — |
| `ods.test.ts` (new) | — | — |
| `onbas.ts` (modified) | — | [^20] `function:onbas.ts:walkForNextAction` |
| `onbas.test.ts` (modified) | — | [^19] `file:onbas.test.ts` |
| `index.ts` (modified) | — | [^5], [^10], [^17], [^21] `file:index.ts` |

**Note**: Phase Footnote Stubs section in dossier is empty. No new footnotes were added for Phase 6 files (ods.types.ts, ods.ts, fake-ods.ts, ods.test.ts). This is a documentation gap — Phase 6 should add [^22]-[^25] (or similar) to the plan ledger for traceability. This does not block approval but should be addressed before merge.
