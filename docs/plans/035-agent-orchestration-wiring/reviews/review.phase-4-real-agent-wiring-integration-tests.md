# Code Review: Phase 4 — Real Agent Wiring Integration Tests

**Plan**: [agent-orchestration-wiring-plan.md](../agent-orchestration-wiring-plan.md)
**Dossier**: [tasks.md](../tasks/phase-4-real-agent-wiring-integration-tests/tasks.md)
**Reviewer**: plan-7-code-review (automated)
**Date**: 2026-02-17
**Diff Range**: `352a5fd..6ac3c1a` (1 commit)
**Testing Approach**: Full TDD (per spec/plan)
**Mock Policy**: Fakes only (R-TEST-006)

---

## A. Verdict

### **REQUEST_CHANGES**

2 CRITICAL findings, 2 HIGH findings, 7 MEDIUM findings, 3 LOW findings.

CRITICAL and HIGH findings must be resolved before merge. See `fix-tasks.phase-4-real-agent-wiring-integration-tests.md` for remediation.

---

## B. Summary

Phase 4 adds a single test file (`test/integration/orchestration-wiring-real.test.ts`, 437 lines) with 4 `describe.skip` suites proving the ODS → AgentManagerService → IAgentInstance → real adapter chain works for both Claude Code and Copilot SDK. The code correctly implements all 10 dossier tasks (T001–T010) and covers all 6 acceptance criteria (AC-50 through AC-55). Structural assertions only — no content assertions.

However, the execution log is **completely empty** (header only, no task entries), the plan task table is **out of sync** with the dossier (T010 missing from plan), and the test file has **21 lint violations** and a **race condition** in the event pass-through tests. The Full TDD approach specified in the plan is structurally inapplicable to `describe.skip` tests but this adaptation is undocumented.

---

## C. Checklist

**Testing Approach: Full TDD** (with Phase 4 adaptation needed for `describe.skip`)

- [ ] Tests precede code (RED-GREEN-REFACTOR evidence) — **FAIL**: Execution log empty
- [x] Tests as docs (assertions show behavior) — structural assertions throughout
- [x] Mock usage matches spec: Fakes only — `FakeScriptRunner`, `FakeNodeEventRegistry`, `FakeLogger`; zero mock libraries
- [x] Negative/edge cases covered — session inheritance fork differs, event type checks

**Universal:**
- [x] BridgeContext patterns followed — N/A (not a VS Code extension)
- [x] Only in-scope files changed — 1 test file + 1 execution log (both plan-scoped)
- [ ] Linters/type checks are clean — **FAIL**: 21 `noNonNullAssertion` lint errors
- [x] Absolute paths used (no hidden context) — all imports use package specifiers

---

## D. Findings Table

| ID | Severity | File:Lines | Summary | Recommendation |
|----|----------|------------|---------|----------------|
| F-01 | CRITICAL | `execution.log.md:1-8` | Execution log completely empty — header only, no task entries | Populate with task evidence for all T001-T010 |
| F-02 | CRITICAL | Plan task table 4.1-4.9 | T010 missing from plan — plan has 9 tasks, dossier has 10 | Add row 4.10 for Workshop 02 session durability |
| F-03 | HIGH | `test:216-228,296-306,331-335` | Event handler race: attached after `run()`, may miss events | Attach handler before `orchestrationService.run()` |
| F-04 | HIGH | Plan task table 4.1-4.9 | Plan [📋] links have no anchor hashes — all point to same empty URL | Add `#task-slug` anchors matching execution log headings |
| F-05 | MEDIUM | `test:80,92` | `adapterFactory` typed as `ClaudeCodeAdapter` return; Copilot uses `as never` cast | Type as `(type: string) => IAgentAdapter` |
| F-06 | MEDIUM | `test:multiple` | 21 `noNonNullAssertion` lint violations (biome) | Add guards before `!` or restructure |
| F-07 | MEDIUM | `test:138-230,236-308` | Shared `stack` leaks state between tests; `agents[0]` may be stale | Fresh stack per test or use array delta |
| F-08 | MEDIUM | `test:143-148,239-246` | No `afterAll` cleanup for temp directories | Add `afterAll(() => cleanup(...))` |
| F-09 | MEDIUM | Plan/dossier | Full TDD inapplicable to `describe.skip` — undocumented adaptation | Document "Compile TDD" approach in dossier/exec log |
| F-10 | MEDIUM | Dossier L15, Plan L346 | Deliverables say "3 suites" but T010 adds 4th suite | Update to "4 suites" |
| F-11 | MEDIUM | T009 Notes | T009 has no footnote reference (breaks convention) | Accept as intentional or add empty footnote |
| F-12 | LOW | Plan L371 | Test baseline says "3858+" but actual is 3873+ | Update to match current count |
| F-13 | LOW | `execution.log.md` | No commit SHAs for traceability | Add git SHAs to log entries |
| F-14 | LOW | `test:57-58` | 1s polling interval — acceptable for manual tests | No action needed |

---

## E. Detailed Findings

### E.0 Cross-Phase Regression Analysis

**Tests rerun**: 3873 passed, 62 skipped, 1 failed (pre-existing — `positional-graph-orchestration-e2e` CLI path check, unrelated to Phase 4).

**Regression verdict**: PASS — Phase 4 adds only `describe.skip` tests that never execute in CI. No prior phase functionality is affected. The skipped tests add zero runtime overhead to the test suite.

**Contract validation**: No interfaces were modified. No prior phase exports were changed. Phase 4 is purely additive (1 new test file).

---

### E.1 Doctrine & Testing Compliance

#### Graph Integrity

| Check | Result |
|-------|--------|
| Footnote numbering sequential [^12]→[^15] | ✅ Pass |
| Dossier [^N] stubs match plan § 12 | ✅ Pass |
| FlowSpace node IDs valid (`file:path` format) | ✅ Pass |
| All footnotes point to files in diff | ✅ Pass |
| Plan↔Dossier task mapping (4.1-4.9 ↔ T001-T009) | ✅ Pass |
| **T010 in dossier without plan row** | ❌ CRITICAL (F-02) |
| **Execution log has task entries** | ❌ CRITICAL (F-01) |
| **Plan [📋] links resolve to anchors** | ❌ HIGH (F-04) |

**Graph Integrity Score**: ❌ BROKEN — 2 CRITICAL + 1 HIGH violation

#### TDD Doctrine

**F-01 (CRITICAL)**: The execution log is completely empty — 8 lines total (header + metadata + separator). No task entries, no RED/GREEN/REFACTOR evidence, no compile verification notes, no timestamps, no commit SHAs. For a "Full TDD" plan, this is a critical documentation gap.

**F-09 (MEDIUM)**: Phase 4 tests are all `describe.skip` — they cannot be run without real agent auth and incur real cost. The RED phase (run test, watch it fail) is structurally impossible in CI. This is a legitimate adaptation but must be explicitly documented. The dossier and execution log should state that Phase 4 follows "Compile TDD" (write test → verify compilation → verify structure) rather than classical RED/GREEN/REFACTOR.

#### Mock Usage

✅ **CLEAN** — Zero mock libraries (`vi.mock`, `vi.spyOn`, `sinon`). Only acceptable fakes used:
- `FakeScriptRunner` (L115)
- `FakeNodeEventRegistry` (L100)
- `FakeLogger` (L85, via dynamic import)

---

### E.2 Semantic Analysis

**AC-50 through AC-55**: All acceptance criteria are implemented in the test file. The code correctly:
- Builds real orchestration stacks with both Claude Code and Copilot adapters (AC-50)
- Tests single-node wiring for both adapters (AC-51)
- Tests session inheritance with fork verification (AC-52)
- Tests event pass-through (AC-53, but see F-03 race condition)
- Verifies cross-adapter parity (AC-54)
- Uses `describe.skip` throughout (AC-55)

**T010 (Workshop 02)**: Session durability test (poem→compact→recall) correctly validates session continuity through multi-turn interaction. Implementation matches Workshop 02 design exactly.

**Deviation**: Dossier T001 specifies a `completeNodeManually()` helper. The test uses `service.completeNode()` directly (L194, L279). Trivial naming deviation — no functional gap.

---

### E.3 Quality & Safety Analysis

**Safety Score: 0/100** (CRITICAL: 0, HIGH: 1, MEDIUM: 4, LOW: 1)
**Verdict: REQUEST_CHANGES**

#### Correctness

**F-03 (HIGH)** — Lines 216–228, 296–306, 331–335: Event handler race condition

The event handler is attached *after* `orchestrationService.run()` returns:
```typescript
await stack.orchestrationService.run(ctx, graphSlug);
const agents = stack.agentManager.getAgents();
agents[0].addEventHandler((e) => events.push(e));  // too late?
```

If the adapter emits events synchronously during `run()`, or if the fire-and-forget agent emits events before the handler is wired, those events are lost. The test then asserts `events.length > 0`, which may flake.

**Fix**: Capture the instance and attach handler before `run()`, or hook into `agentManager` creation to auto-attach. Since ODS creates the instance inside `run()`, consider using a factory wrapper or post-creation callback.

**F-07 (MEDIUM)** — Lines 138–230, 236–308: State leakage

Within each `describe` block, `stack` (including `agentManager`, `podManager`) is shared across all 3 tests. The AC-53 test asserts `agents[0]` but if run after AC-51, `agents` already contains the prior instance. The test may attach the event handler to the wrong agent.

**Fix**: Use `agents.at(-1)` (last agent) instead of `agents[0]`, or capture agent count before `run()` and index by delta.

#### Security

✅ No findings. No secrets, safe dynamic imports (hardcoded package specifiers), no path traversal.

#### Performance

**F-14 (LOW)**: 1s polling interval is acceptable for manual `describe.skip` tests with 120s timeout.

#### Observability

No findings — test infrastructure, not production code.

---

### E.4 Doctrine Evolution Recommendations (Advisory)

**Positive Alignment**:
- Dynamic import pattern from Plan 034 correctly reused in Phase 4
- `describe.skip` approach for costly real-agent tests is architecturally sound
- Structural-only assertions avoid non-deterministic LLM output flakiness
- PlanPak file placement correct (test in `test/integration/`, plan-scoped)

**Doctrine Gap**:
- No guidance in rules.md about when Full TDD is inapplicable (e.g., `describe.skip` integration tests that can't be run in CI). Consider adding a rule about "Compile TDD" as a recognized adaptation.

---

## F. Coverage Map

| AC | Description | Test Location | Confidence |
|----|-------------|---------------|------------|
| AC-50 | Real stack with both adapters | `createRealOrchestrationStack` L72-132 | 100% — explicit factory for both types |
| AC-51 | Single-node wiring | Claude L150-173, Copilot L248-261 | 100% — `sessionId` truthy assertion |
| AC-52 | Session inheritance | Claude L175-205, Copilot L263-286 | 100% — `not.toBe(sessionA)` |
| AC-53 | Event pass-through | Claude L207-229, Copilot L288-307 | 75% — events asserted but race condition (F-03) |
| AC-54 | Cross-adapter parity | L314-356 | 100% — both adapters in loop |
| AC-55 | All use describe.skip | L138, L236, L314, L363 | 100% — verified all 4 blocks |

**Overall Coverage Confidence**: 96% (AC-53 weakened by event race)
**Narrative Tests**: T010 (session durability) is a narrative multi-turn test — validates session continuity but not mapped to a specific numbered AC.

---

## G. Commands Executed

```bash
# Diff computation
git diff --unified=3 --no-color 352a5fd..6ac3c1a

# Lint check (Phase 4 file only)
npx biome check test/integration/orchestration-wiring-real.test.ts
# Result: 21 errors (all noNonNullAssertion)

# Full lint check
npx biome check
# Result: 28 errors (21 from Phase 4 + 7 pre-existing)

# Test suite
pnpm test
# Result: 3873 passed, 62 skipped, 1 failed (pre-existing e2e path check)

# Pre-existing failure verification
git stash && pnpm test && git stash pop
# Same 1 failure — pre-existing, not from Phase 4
```

---

## H. Decision & Next Steps

**Verdict**: REQUEST_CHANGES

**Blocking items** (must fix before merge):
1. **F-01**: Populate execution log with task evidence (at minimum: task entries, compile verification, timestamps)
2. **F-02**: Add row 4.10 to plan's Phase 4 task table for T010/Workshop 02
3. **F-03**: Fix event handler race condition in AC-53 tests (attach before `run()`)
4. **F-04**: Add anchor hashes to plan [📋] log links

**Recommended items** (improve quality):
5. **F-05**: Fix `adapterFactory` type — use `IAgentAdapter` instead of `ClaudeCodeAdapter` return type
6. **F-06**: Address 21 lint violations with proper guards
7. **F-07**: Fix state leakage — use `agents.at(-1)` or fresh stack per test
8. **F-09**: Document "Compile TDD" adaptation in dossier

**Process**: Fix items in `fix-tasks.phase-4-real-agent-wiring-integration-tests.md`, then rerun `/plan-6` for fixes, then rerun `/plan-7`.

---

## I. Footnotes Audit

| Diff-Touched Path | Footnote(s) | Plan Ledger Entry |
|-------------------|-------------|-------------------|
| `test/integration/orchestration-wiring-real.test.ts` | [^12], [^13], [^14], [^15] | `file:test/integration/orchestration-wiring-real.test.ts` — all 4 footnotes reference same file |
| `execution.log.md` | — | Not footnoted (infrastructure artifact) |

**Footnote integrity**: ✅ All [^12]–[^15] reference the correct file. Sequential numbering. No gaps from [^11] to [^12].
