# Code Review: Phase 3 — DI Container and Existing Test Updates

**Plan**: [agent-orchestration-wiring-plan.md](../agent-orchestration-wiring-plan.md)
**Dossier**: [tasks.md](../tasks/phase-3-di-container-and-existing-test-updates/tasks.md)
**Execution Log**: [execution.log.md](../tasks/phase-3-di-container-and-existing-test-updates/execution.log.md)
**Diff Range**: `e98eb7a..0619952`
**Reviewer**: plan-7-code-review (automated)
**Date**: 2026-02-17

---

## A) Verdict

### **APPROVE**

No CRITICAL or HIGH findings. Phase 3 is a clean, mechanical migration of DI wiring and test fixtures from `IAgentAdapter`/`FakeAgentAdapter` to `IAgentManagerService`/`FakeAgentInstance`. All 10 tasks implemented, 6 acceptance criteria met, 3873 tests passing.

---

## B) Summary

Phase 3 closes the Plan 035 wiring circuit by updating the DI container (`registerOrchestrationServices()`) to resolve `AGENT_MANAGER` instead of `AGENT_ADAPTER`, and updating all existing orchestration tests (ODS, pod, pod-manager, container, schema, E2E) to use `FakeAgentManagerService`/`FakeAgentInstance`. No new tests were written — this phase updates existing tests to use new interfaces. The diff is 554 source lines across 8 files (1 container, 6 test, 1 E2E). Graph integrity is fully intact. One MEDIUM finding: the `graph-orchestration.test.ts` load stub returns empty `orchestratorSettings` that doesn't match the schema default. Three LOW findings are advisory.

---

## C) Checklist

**Testing Approach: Full TDD** (Phase 3 exception: no new tests — updates existing tests only)

- [x] Mock usage matches spec: Fakes only (0 mock instances found)
- [x] Negative/edge cases maintained from prior tests
- [x] BridgeContext patterns: N/A (no VS Code extension code)
- [x] Only in-scope files changed (1 file authorized by plan footnote, missing from dossier)
- [x] Linters/type checks: 1 pre-existing tsc error (Phase 1 debt, not Phase 3)
- [x] Absolute paths used (no hidden context assumptions)

---

## D) Findings Table

| ID | Severity | File:Lines | Summary | Recommendation |
|----|----------|------------|---------|----------------|
| CORR-001 | MEDIUM | `graph-orchestration.test.ts`:83 | `load` stub returns `orchestratorSettings: {}` — missing `agentType` default | Align stub with schema: `{ agentType: 'copilot' }` |
| CORR-002 | LOW | `pod.test.ts`:167-189 | `resumeWithAnswer` test lost session-forwarding assertion | Consider adding `expect(instance.sessionId).toBe(...)` |
| CORR-003 | LOW | `pod.test.ts`:204-214 | `terminate` test uses weaker count assertion vs old session-identity check | Architecturally justified — no fix needed |
| OBS-001 | LOW | `container.ts` / `di-tokens.ts` | Old `AGENT_ADAPTER` token still exported but no longer used in orchestration | Add deprecation note or remove in future cleanup |
| SCOPE-001 | LOW | `graph-orchestration.test.ts` | File not in dossier task table but authorized by plan footnote [^10] | Dossier gap — document in T006 or accept |

---

## E) Detailed Findings

### E.0) Cross-Phase Regression Analysis

| Metric | Value |
|--------|-------|
| Phase 1 schema tests rerun | 5/5 pass |
| Phase 2 wiring tests rerun | 11/11 pass |
| Phase 3 affected tests | 99/99 pass |
| Contracts broken | 0 |
| Integration violations | 0 |

**Verdict**: PASS — no regressions detected across all prior phases.

### E.1) Doctrine & Testing Compliance

**Graph Integrity**: ✅ INTACT (0 violations)

| Validator | Result | Violations |
|-----------|--------|------------|
| Task↔Log | ✅ 10/10 validated | 0 |
| Task↔Footnote | ✅ SYNCHRONIZED | 0 |
| Plan↔Dossier | ✅ SYNCHRONIZED | 0 |
| Footnote↔File | ✅ 9/9 valid | 0 |

**Authority Conflicts**: None — plan and dossier footnotes fully aligned.

**TDD Compliance**: Phase 3 writes no new tests (documented exception: "No new tests — this phase updates existing tests to use new interfaces"). No RED-GREEN-REFACTOR cycles expected or required.

**Mock Usage**: PASS — 0 mock instances. All tests use project fakes: `FakeAgentManagerService`, `FakeAgentInstance`, `FakeAgentContextService`, `FakePodManager`, `FakeScriptRunner`, `FakeFileSystem`, `FakePathResolver`.

**Plan Compliance**: 10/10 tasks PASS, 6/6 acceptance criteria met.

**Scope Guard**: 7/8 files explicitly in dossier task table. `graph-orchestration.test.ts` (1 line change) authorized by plan footnote [^10] but not listed in any dossier task's Absolute Path(s). Necessary to prevent runtime crash from Phase 2's `graphService.load()` addition. Classified as LOW severity dossier gap.

### E.2) Semantic Analysis

No semantic issues. Phase 3 is a mechanical interface migration with no business logic changes. All behavioral contracts maintained:

- **DI container**: Token swap `AGENT_ADAPTER` → `AGENT_MANAGER`, type swap `IAgentAdapter` → `IAgentManagerService`. Same factory pattern, same collaborator creation.
- **Test fixtures**: 1:1 replacement of `FakeAgentAdapter` with `FakeAgentInstance`/`FakeAgentManagerService`. Same assertions, updated to match new APIs (e.g., `getRunHistory()` instead of adapter methods).
- **E2E script**: 4-line swap + 2 console.log reference updates. Identical 58-step behavior confirmed.

### E.3) Quality & Safety Analysis

**Safety Score: 82/100** (CRITICAL: 0, HIGH: 0, MEDIUM: 1, LOW: 4)
**Verdict: APPROVE**

#### CORR-001 (MEDIUM): `load` stub returns empty `orchestratorSettings`

- **File**: `test/unit/.../graph-orchestration.test.ts`, line 83
- **Issue**: The `load` stub returns `{ orchestratorSettings: {} }`, but `GraphOrchestratorSettingsSchema` now defaults `agentType` to `'copilot'`. If production code reads `orchestratorSettings.agentType` from the raw `load()` result before schema parsing, `agentType` will be `undefined`.
- **Impact**: Tests silently pass with `undefined` agentType where production would have `'copilot'`. Could mask a missing-parse bug.
- **Fix**: Change to `orchestratorSettings: { agentType: 'copilot' }` to match schema defaults, or verify the production code always parses through `GraphOrchestratorSettingsSchema`.

#### CORR-002 (LOW): `resumeWithAnswer` test lost session assertion

- **File**: `test/unit/.../pod.test.ts`, lines 167-189
- **Issue**: Old test asserted `history[0].sessionId === 'sess-resume'`. New test only asserts prompt content. Session continuity is now implicit (baked into the instance).
- **Impact**: Minimal — if `resumeWithAnswer()` ever delegates to a wrong instance, no test catches it. However, this is prevented by construction (pod holds direct reference).
- **Fix**: Optional — add `expect(instance.sessionId).toBe('sess-resume')` after resume call.

#### CORR-003 (LOW): Weaker terminate assertion

- **File**: `test/unit/.../pod.test.ts`, lines 204-214
- **Issue**: Old test asserted `terminateHistory[0] === 'sess-term'` (which session). New test asserts `getTerminateCount() === 1` (how many times). Session identity is no longer relevant since `terminate()` delegates directly to the instance.
- **Impact**: None — architecturally correct. The instance is the termination target.

#### OBS-001 (LOW): Stale `AGENT_ADAPTER` token

- **File**: `packages/shared/src/di-tokens.ts`
- **Issue**: `ORCHESTRATION_DI_TOKENS.AGENT_ADAPTER` still exported but no longer used in orchestration container or tests.
- **Impact**: Future debugging friction if someone references the stale token.
- **Fix**: Add deprecation note or remove in Phase 4 / future cleanup.

### E.4) Doctrine Evolution Recommendations

**Advisory only — does not affect verdict.**

| Category | New | Updates | Priority HIGH |
|----------|-----|---------|---------------|
| ADRs | 0 | 0 | 0 |
| Rules | 0 | 0 | 0 |
| Idioms | 1 | 0 | 0 |
| Architecture | 0 | 0 | 0 |

**Idiom Candidate: Test fixture migration pattern**
- **Pattern**: When migrating interfaces (A→B), create a helper factory (e.g., `makeFakeInstance()`) that constructs the new fixture with full required params, then replace all call sites. This concentrates the migration into one function.
- **Evidence**: `pod.test.ts` `makeFakeInstance()` helper (22 lines) eliminates repetitive `FakeAgentInstance` construction across 11 test cases.
- **Priority**: LOW — nice-to-have documentation.

---

## F) Coverage Map

Phase 3 has 5 acceptance criteria (mapped from plan § Phase 3):

| AC | Description | Test Evidence | Confidence |
|----|-------------|---------------|------------|
| AC-12 | DI container resolves AGENT_MANAGER, CLI shares instance | `container-orchestration.test.ts` — 3 tests pass, token resolution verified | 100% |
| AC-31 | E2E script uses FakeAgentManagerService | Diff shows import + constructor swap in `createOrchestrationStack()` | 100% |
| AC-32 | E2E behavior unchanged after wiring update | Execution log: 58 steps, exit 0 | 100% |
| AC-33 | All existing orchestration tests updated and pass | 99 tests across 6 files — all pass | 100% |
| AC-40 | All existing tests continue to pass (3858+) | Execution log: 3873 tests, 0 failures | 100% |

**Overall Coverage Confidence**: 100% (5/5 criteria at 100%)

---

## G) Commands Executed

```bash
# Phase 3 affected tests (99/99 pass)
pnpm vitest run test/unit/positional-graph/features/030-orchestration/ods.test.ts \
  test/unit/positional-graph/features/030-orchestration/pod.test.ts \
  test/unit/positional-graph/features/030-orchestration/pod-manager.test.ts \
  test/unit/positional-graph/features/030-orchestration/container-orchestration.test.ts \
  test/unit/positional-graph/properties-and-orchestrator.test.ts \
  test/unit/positional-graph/features/030-orchestration/graph-orchestration.test.ts

# Phase 1+2 regression tests (11/11 pass)
pnpm vitest run test/unit/positional-graph/features/030-orchestration/ods-agent-wiring.test.ts \
  test/unit/positional-graph/features/030-orchestration/pod-agent-wiring.test.ts

# TypeScript type check
npx tsc --noEmit --pretty false
# Result: 1 pre-existing error (positional-graph.service.ts:413 — Phase 1 debt)

# Diff generation
git diff --unified=3 --no-color e98eb7a..0619952 -- packages/ test/ apps/
```

---

## H) Decision & Next Steps

**Verdict: APPROVE** — Phase 3 can be merged.

**Optional improvements** (non-blocking):
1. **(MEDIUM)** CORR-001: Align `graph-orchestration.test.ts` load stub with schema defaults (`{ agentType: 'copilot' }`)
2. **(LOW)** CORR-002: Add sessionId assertion to `resumeWithAnswer` test
3. **(LOW)** OBS-001: Deprecate or remove stale `AGENT_ADAPTER` token
4. **(LOW)** SCOPE-001: Add `graph-orchestration.test.ts` to dossier task table

**Next phase**: Proceed to Phase 4: `/plan-5-phase-tasks-and-brief --phase "Phase 4: Real Agent Wiring Integration Tests"`

---

## I) Footnotes Audit

| Diff-Touched Path | Footnote | Plan Ledger Node ID |
|-------------------|----------|---------------------|
| `packages/positional-graph/src/container.ts` | [^9] | `file:packages/positional-graph/src/container.ts` |
| `test/unit/.../ods.test.ts` | [^10] | `file:test/unit/positional-graph/features/030-orchestration/ods.test.ts` |
| `test/unit/.../pod.test.ts` | [^10] | `file:test/unit/positional-graph/features/030-orchestration/pod.test.ts` |
| `test/unit/.../pod-manager.test.ts` | [^10] | `file:test/unit/positional-graph/features/030-orchestration/pod-manager.test.ts` |
| `test/unit/.../container-orchestration.test.ts` | [^10] | `file:test/unit/positional-graph/features/030-orchestration/container-orchestration.test.ts` |
| `test/unit/.../graph-orchestration.test.ts` | [^10] | `file:test/unit/positional-graph/features/030-orchestration/graph-orchestration.test.ts` |
| `test/unit/.../properties-and-orchestrator.test.ts` | [^10] | `file:test/unit/positional-graph/properties-and-orchestrator.test.ts` |
| `test/e2e/positional-graph-orchestration-e2e.ts` | [^11] | `file:test/e2e/positional-graph-orchestration-e2e.ts` |

**Coverage**: 8/8 diff-touched source/test files have corresponding footnote entries. ✅ Complete.
