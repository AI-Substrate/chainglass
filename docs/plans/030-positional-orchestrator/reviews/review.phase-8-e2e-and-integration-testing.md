# Code Review: Phase 8 — E2E and Integration Testing

**Plan**: positional-orchestrator-plan.md
**Phase**: Phase 8: E2E and Integration Testing
**Phase Doc**: tasks/phase-8-e2e-and-integration-testing/tasks.md
**Execution Log**: tasks/phase-8-e2e-and-integration-testing/execution.log.md
**Reviewer**: plan-7-code-review
**Date**: 2026-02-10
**Diff Range**: Working tree vs HEAD (4eb6082) — uncommitted changes

---

## A) Verdict

**REQUEST_CHANGES**

Two HIGH findings require action before commit: plan progress tracking not updated (Plan↔Dossier sync), and no Phase 8 footnotes added to the Change Footnotes Ledger.

---

## B) Summary

Phase 8 delivers a comprehensive 1128-line E2E validation script that drives an 8-node, 4-line pipeline through 58 steps across 9 acts, covering all 7 orchestration patterns (user-input, serial agents, Q&A cycle, manual transitions, code nodes, parallel execution, error recovery). A supporting ONBAS bug fix (T000) and an import.meta.url CJS-compatibility fix in pod.agent.ts were discovered and resolved during E2E development. A Vitest wrapper provides CI integration with graceful skip-if-no-CLI. AC-1 through AC-14 are covered (AC-8 deferred). 3730 tests pass, lint clean. The implementation is solid — the only issues are bookkeeping gaps in plan metadata.

---

## C) Checklist

**Testing Approach: Full TDD**

- [x] Tests precede code (RED-GREEN-REFACTOR evidence) — T000 has clear RED→GREEN cycle; T001-T009 are inherently test-first (writing the E2E IS the test)
- [x] Tests as docs (assertions show behavior) — 58 steps with descriptive assertions, AC annotations throughout
- [x] Mock usage matches spec: Avoid (Fakes) — No vi.mock/jest.mock anywhere; FakeAgentAdapter and FakeScriptRunner implement real interfaces
- [x] Negative/edge cases covered — Error recovery (ACT E), cross-graph isolation, blocked manual transition, waiting-question no-action

**Universal:**
- [x] BridgeContext patterns followed — N/A (no VS Code extension code)
- [x] Only in-scope files changed — All files justified (see E.1 scope guard)
- [x] Linters/type checks are clean — TypeScript `--noEmit` clean, `just fft` passed per execution log
- [x] Absolute paths used (no hidden context) — E2E uses path.join with workspace root; no bare relative paths in production code

---

## D) Findings Table

| ID | Severity | File:Lines | Summary | Recommendation |
|----|----------|------------|---------|----------------|
| V1 | HIGH | positional-orchestrator-plan.md:744 | Plan progress tracking: Phase 8 still shows `[ ] Pending` | Run plan-6a to update to `[x] COMPLETE` |
| V2 | HIGH | positional-orchestrator-plan.md:667-678 | Plan task table: all 8.x tasks still `[ ]`, no Log/Notes columns updated | Run plan-6a to sync task statuses |
| V3 | HIGH | positional-orchestrator-plan.md:776+ | No Phase 8 footnotes in Change Footnotes Ledger | Add [^33]+[^34] entries for changed files |
| V4 | MEDIUM | pod.agent.ts:29 | `process.cwd()` fallback in `getModuleDir()` may find wrong prompt path | Add warning log or throw on fallback |
| V5 | MEDIUM | tasks.md:202,111 | Dossier T001 says "12 input wirings" but implementation has 7 | Update dossier text to say "7" |
| V6 | LOW | tasks.md:417-423 | Phase Footnote Stubs section empty ("Reserved for plan-6") | Populate with Phase 8 footnotes |
| V7 | LOW | tasks.md:441-443 | Discoveries & Learnings table empty | Populate with 4 bugs found during E2E |

---

## E) Detailed Findings

### E.0) Cross-Phase Regression Analysis

No cross-phase regressions detected. The execution log reports:
- **3730 tests pass** (up from ~3690 before Phase 8)
- **41 ONBAS tests pass** (39 existing + 2 new from T000)
- All prior phase test suites unaffected by onbas.ts and pod.agent.ts changes
- The onbas.ts change (`return null` for user-input) is additive (new early-return before existing `return` statement)
- The pod.agent.ts change replaces eager top-level evaluation with lazy function — same runtime behavior, just deferred

### E.1) Doctrine & Testing Compliance

#### Scope Guard

All modified files are justified:

| File | Task | Justification |
|------|------|--------------|
| `onbas.ts` | T000 | Bug fix: ONBAS was starting user-input nodes (infinite loop) |
| `onbas.test.ts` | T000 | TDD: 2 new tests for user-input skip behavior |
| `pod.agent.ts` | T001-T009 | Bug fix: import.meta.url crashes in CJS (execution log "Bugs Found #1") |
| `positional-graph-orchestration-e2e.ts` | T001-T011 | Primary deliverable |
| `orchestration-e2e.test.ts` | T010 | Vitest CI wrapper |
| `tasks.md`, `tasks.fltplan.md` | — | Dossier/flight plan updates |
| `execution.log.md` | — | Implementation log |

**pod.agent.ts deviation**: The plan Non-Goals state "Modifying any production code from Phases 1-7". This file was modified. However, the execution log justifies it as a blocking bug discovered during E2E: esbuild CJS output replaces `import.meta` with `{}`, causing `.url` to be undefined. The fix is minimal and correct (lazy evaluation with cascading fallbacks). **Verdict**: Justified deviation — document in plan's Deviation Ledger.

#### Graph Integrity: Plan↔Dossier Sync

**V1**: Plan progress checklist (line 744) shows `[ ] Phase 8: E2E and Integration Testing - Pending (awaiting Phase 7)`. Dossier shows all tasks complete. **Severity: HIGH** — breaks progress tracking.

**V2**: Plan task table (lines 667-678) shows `[ ]` status for all 8.x tasks. Dossier T000-T012 all show `[x]`. Log and Notes columns in plan are empty (`-`). **Severity: HIGH** — Plan↔Dossier desynchronized.

**V3**: Change Footnotes Ledger ends at [^32] (Phase 7). No Phase 8 footnotes exist for:
- `onbas.ts` (modified by T000)
- `onbas.test.ts` (modified by T000)
- `pod.agent.ts` (modified by T001-T009 bug fix)
- `positional-graph-orchestration-e2e.ts` (new, T001-T009)
- `orchestration-e2e.test.ts` (new, T010)

**Severity: HIGH** — Breaks file→task traversal for Phase 8 changes.

#### TDD Compliance

- **T000**: Full RED-GREEN-REFACTOR documented. 2 tests written first, both failed, then implementation added, all 41 tests pass. **PASS**.
- **T001-T009**: The E2E script IS the test. Writing the script is equivalent to "writing the test" in TDD terms. The RED phase was the bugs discovered and fixed (4 bugs documented). The GREEN phase was getting all 58 steps to pass. This is appropriate for E2E test development. **PASS** (with note: E2E test phases are inherently test-first since the deliverable is the test itself).
- **T010**: Vitest wrapper has complete 5-field Test Doc block (Why, Contract, Usage Notes, Quality Contribution, Worked Example). **PASS**.

#### Mock Usage Compliance

Zero violations. No `vi.mock`, `jest.mock`, `sinon`, or mock patterns found. All test doubles are fakes implementing real interfaces:
- `FakeAgentAdapter` from `@chainglass/shared`
- `FakeScriptRunner` from `030-orchestration` barrel
- `FakeNodeEventRegistry` from `032-node-event-system` barrel

### E.2) Semantic Analysis

No semantic errors found. The E2E script correctly exercises:
- The settle-decide-act loop via `handle.run()`
- Event system integration (question:ask → question:answer → node:restart)
- All node status transitions: pending → starting → agent-accepted → complete
- Manual transition semantics (transition on line N gates entry to line N+1)
- Parallel node execution (2 actions in one run())
- Serial gate enforcement (pr-creator blocked until parallel nodes complete)
- Error recovery (blocked-error state, cross-graph isolation)

The ONBAS change correctly prevents orchestration from starting user-input nodes (which are a UI concern, not orchestrator-driven).

### E.3) Quality & Safety Analysis

**Safety Score: 90/100** (0 CRITICAL, 0 HIGH, 1 MEDIUM, 0 LOW)

#### V4: `process.cwd()` fallback in getModuleDir() — MEDIUM

**File**: `packages/positional-graph/src/features/030-orchestration/pod.agent.ts`, line 29
**Issue**: The final fallback in `getModuleDir()` returns `process.cwd()`, which could resolve to the wrong directory if the process CWD is not the package root.
**Impact**: `loadStarterPrompt()` would fail with `ENOENT` when trying to read `node-starter-prompt.md` relative to CWD instead of the module directory. In practice, this fallback should never fire (import.meta.dirname or import.meta.url should always be available in ESM, and __dirname in CJS), but defensive code should not silently use wrong paths.
**Fix**: Log a warning when using the CWD fallback, or throw an error with a descriptive message explaining that the prompt file location cannot be determined. This makes debugging easier if the fallback ever fires.
```diff
   if (typeof __dirname === 'string') {
     return __dirname;
   }
-  return process.cwd();
+  console.warn('[pod.agent] getModuleDir: falling back to process.cwd() — prompt file may not be found');
+  return process.cwd();
```

### E.4) Doctrine Evolution Recommendations

**Advisory — does not affect verdict.**

| Category | Recommendation | Priority |
|----------|---------------|----------|
| Rule | E2E scripts should document bugs-found-and-fixed in execution log (already done — codify as practice) | LOW |
| Idiom | The "lazy getModuleDir()" pattern for CJS/ESM compatibility could be extracted to shared utils if needed elsewhere | LOW |
| Idiom | The "FakeAgentAdapter + FakeScriptRunner" stack wiring pattern in `createOrchestrationStack()` could be documented as the standard E2E test setup idiom | MEDIUM |

No new ADR candidates. No architecture updates needed.

---

## F) Coverage Map

| AC | Description | Test Evidence | Confidence |
|----|-------------|---------------|------------|
| AC-1 | Reality snapshot captures full state | ACT 8: `handle.getReality()` asserts `isComplete`, `totalNodes===8`, `completedCount===8`, `!isFailed` | 100% (explicit) |
| AC-2 | OrchestrationRequest closed union | Multiple: `request.type === 'start-node'` checks (lines 576-577, 642, 706, 808, 947) | 100% (explicit) |
| AC-3 | ONBAS walks deterministically | ACTs 2,6,7: serial ordering verified, parallel nodes both start, serial gate blocks | 100% (explicit) |
| AC-4 | ONBAS pure/synchronous | All ACTs: real ONBAS instance used in `createOrchestrationStack()` | 75% (behavioral — no explicit purity assertion) |
| AC-5 | AgentContextService position-based | ACT 2: serial chain spec-builder → spec-reviewer (line 643 "AC-5") | 75% (behavioral — context inheritance exercised, not directly asserted) |
| AC-6 | ODS executes each request type | ACT 1 (user-input), ACTs 2-7 (agent), ACT 5 (code) | 100% (explicit) |
| AC-7 | Pods manage lifecycle | ACTs 2-7: FakeAgentAdapter; ACT 5: FakeScriptRunner | 75% (behavioral — pod creation exercised but not directly asserted) |
| AC-8 | Pod sessions survive restarts | DEFERRED — unit-level scope | N/A |
| AC-9 | Question lifecycle via events | ACT 4: ask → answer → node:restart → re-start (lines 741-809) | 100% (explicit) |
| AC-10 | Two-level entry point | ACT 0: `orchestrationService.get()` → `handle.run()` (lines 520-525) | 100% (explicit) |
| AC-11 | Loop exercised in-process | All ACTs: `handle.run()` called directly | 100% (explicit) |
| AC-12 | E2E without real agents | 8 nodes, FakeAgentAdapter + FakeScriptRunner | 100% (explicit — lines 1112-1113) |
| AC-13 | Deterministic integration tests | Real PodManager + fake adapters | 75% (behavioral — determinism implicit from consistent results) |
| AC-14 | Input wiring flows through | ACT 0: 7 `setInput()` calls; data validated in downstream ACTs | 100% (explicit — line 1114) |

**Overall Confidence**: 91% (12/14 at 75%+ confidence, 1 deferred)

**Notes**:
- AC-4, AC-5, AC-7, AC-13: Coverage via behavioral exercise rather than explicit assertion. The real services are used and work correctly, proving the criteria implicitly. Consider adding brief inline comments mapping these to specific assertions.
- AC-14: E2E script says "7 connections" but dossier Requirements Traceability (line 111) says "12 connections". The E2E script is correct — 7 is the actual count of `setInput` calls.

---

## G) Commands Executed

```bash
# Type checking
npx tsc --noEmit                    # Clean (exit 0)

# Diff analysis
git --no-pager diff --unified=3 --no-color    # Full working tree diff
git --no-pager status --short                  # 5 modified, 3 untracked

# Evidence from execution log (not re-run — taken from log)
# just fft → 3730 tests pass, lint clean, format clean
# npx tsx test/e2e/positional-graph-orchestration-e2e.ts → 58 steps pass
```

---

## H) Decision & Next Steps

**Verdict: REQUEST_CHANGES** — 3 HIGH findings (V1, V2, V3) require bookkeeping updates before commit.

### Required Actions (blocking)

1. **Run `plan-6a --update-progress`** to sync plan progress:
   - Update Phase 8 checklist: `[ ] → [x] COMPLETE`
   - Update plan task table 8.1-8.12 statuses to `[x]`
   - Add Log/Notes columns to plan task table

2. **Add Phase 8 Change Footnotes** to plan § 14 (Change Footnotes Ledger):
   ```
   [^33]: Phase 8 Task T000 — ONBAS user-input skip fix
     - `function:packages/positional-graph/src/features/030-orchestration/onbas.ts:visitNode`
     - `file:test/unit/positional-graph/features/030-orchestration/onbas.test.ts`

   [^34]: Phase 8 Tasks T001-T009 — E2E validation script + pod.agent.ts bug fix
     - `file:test/e2e/positional-graph-orchestration-e2e.ts`
     - `class:packages/positional-graph/src/features/030-orchestration/pod.agent.ts:AgentPod`

   [^35]: Phase 8 Task T010 — Vitest wrapper
     - `file:test/integration/positional-graph/orchestration-e2e.test.ts`
   ```

3. **Update dossier Phase Footnote Stubs** (tasks.md line 417-423) to reference [^33], [^34], [^35].

### Recommended Actions (non-blocking)

4. **V4**: Consider adding a warning log to the `process.cwd()` fallback in `getModuleDir()`.
5. **V5**: Fix "12 input wirings" → "7 input wirings" in dossier text (lines 111, 202, 400).
6. **V7**: Populate Discoveries & Learnings table with the 4 bugs found during E2E.
7. **Add plan Deviation Ledger entry** for the pod.agent.ts production code change.

### After Fixes

Re-run `/plan-7-code-review` to verify bookkeeping is clean, then commit and mark Phase 8 complete.

---

## I) Footnotes Audit

| Diff-Touched Path | Task(s) | Footnote(s) | Plan Ledger Entry |
|-------------------|---------|-------------|-------------------|
| `packages/positional-graph/src/features/030-orchestration/onbas.ts` | T000 | MISSING | MISSING — needs [^33] |
| `test/unit/positional-graph/features/030-orchestration/onbas.test.ts` | T000 | MISSING | MISSING — needs [^33] |
| `packages/positional-graph/src/features/030-orchestration/pod.agent.ts` | T001-T009 (bug fix) | MISSING | MISSING — needs [^34] |
| `test/e2e/positional-graph-orchestration-e2e.ts` | T001-T011 | MISSING | MISSING — needs [^34] |
| `test/integration/positional-graph/orchestration-e2e.test.ts` | T010 | MISSING | MISSING — needs [^35] |
