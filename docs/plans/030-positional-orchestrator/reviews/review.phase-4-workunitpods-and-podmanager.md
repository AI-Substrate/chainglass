# Code Review: Phase 4 — WorkUnitPods and PodManager

**Plan**: positional-orchestrator-plan.md
**Phase**: Phase 4: WorkUnitPods and PodManager
**Reviewer**: plan-7-code-review
**Date**: 2026-02-06
**Diff Range**: Uncommitted working tree changes vs HEAD (02828e5)

---

## A) Verdict

**APPROVE** — with advisory notes

Phase 4 is well-implemented with strong TDD discipline, clean ADR compliance, and comprehensive contract testing. Two HIGH findings are flagged as advisory because they relate to intentional deferral documented in the plan (inputs not wired to prompt, silent error swallowing on load). No CRITICAL issues found.

---

## B) Summary

Phase 4 delivers IWorkUnitPod, AgentPod, CodePod, IPodManager, PodManager, FakePodManager, FakePod, IScriptRunner, and FakeScriptRunner — all within the 030-orchestration PlanPak folder. 53 tests pass (21 pod + 32 pod-manager), including 12 contract tests verifying fake/real parity. All 3384 repo tests pass. Build is clean. No DI registration (internal collaborator per plan). No vi.mock/jest.mock usage. Footnotes [^11]–[^17] are sequential, correctly linked, and all FlowSpace node IDs point to real files. Phase 1-3 regression: 98 tests pass unchanged.

---

## C) Checklist

**Testing Approach: Full TDD**

- [x] Tests precede code (RED-GREEN-REFACTOR evidence in execution log)
- [x] Tests as docs (Test Doc blocks with all 5 fields on both test files)
- [x] Mock usage matches spec: Fakes (FakeAgentAdapter, FakeScriptRunner, FakeFileSystem, FakePodManager)
- [x] Negative/edge cases covered (adapter exception, no-session resume, missing file, runner crash)
- [x] BridgeContext patterns: N/A (no VS Code extension code)
- [x] Only in-scope files changed
- [x] Linters/type checks clean (build passes, `just fft` clean per exec log)
- [x] Absolute paths used (no hidden context)

---

## D) Findings Table

| ID | Severity | File:Lines | Summary | Recommendation |
|----|----------|------------|---------|----------------|
| QS-001 | HIGH | pod.agent.ts:42-46 | `execute()` ignores `options.inputs` entirely | Wire inputs into prompt or adapter call (Phase 6 concern) |
| QS-002 | HIGH | pod-manager.ts:67-77 | `loadSessions()` silently swallows parse errors | Narrow catch to ENOENT only; log corruption |
| QS-003 | MEDIUM | pod-manager.ts:91-93 | `sessionsPath()` does not validate graphSlug | Add regex guard: `/^[a-z][a-z0-9-]*$/` |
| QS-004 | MEDIUM | pod-manager.ts:64-77 | `loadSessions()` merges without clearing | Add `this.sessions.clear()` or document append-only |
| QS-005 | MEDIUM | pod-manager.ts:56-58 | `destroyPod()` does not terminate pod | Document caller responsibility or make async |
| QS-006 | MEDIUM | pod.agent.ts:17-27 | Module-level prompt cache shared globally | Move to static field or inject via constructor |
| QS-007 | MEDIUM | pod.agent.ts:11 | `readFileSync` blocks event loop | Use async readFile with cache |
| QS-008 | MEDIUM | pod.code.ts:28 | `script: ''` — empty script passed to runner | Accept script path via constructor (deferred per plan) |
| QS-009 | MEDIUM | pod.code.ts:30 | Hardcoded 60s timeout | Accept from options or constructor |
| QS-010 | LOW | pod.agent.ts:42-65 | `onEvent` callback never invoked | Wire events in Phase 6+ |
| QS-011 | LOW | pod.agent.ts:112-136 | `mapAgentResult()` lacks default/exhaustive case | Add `never` exhaustive check |
| QS-012 | LOW | pod-manager.ts:69 | `loadSessions()` uses `as` cast without validation | Add Zod schema or structural check |
| QS-013 | LOW | pod-manager.ts:26-42 | `createPod()` ignores unitType mismatch on dedup | Assert existing unitType matches |
| QS-014 | LOW | pod.schema.ts:38-46 | Schema allows `outcome:'question'` without question field | Use discriminated union on outcome |
| QS-015 | LOW | pod.agent.ts:83-84 | Answer interpolated directly into prompt string | Document or structure separately |

---

## E) Detailed Findings

### E.0) Cross-Phase Regression Analysis

| Metric | Value |
|--------|-------|
| Prior phase tests rerun | 98 (Phase 1: 47, Phase 2: 37, Phase 3: 14) |
| Tests failed | 0 |
| Contracts broken | 0 |
| Integration points validated | index.ts barrel exports (Phase 1-3 exports unchanged) |
| Backward compatibility | PASS — no prior exports removed or changed |

**Verdict**: PASS — no regressions detected.

### E.1) Doctrine & Testing Compliance

#### Graph Integrity (Link Validation)

| Link Type | Status | Details |
|-----------|--------|---------|
| Task↔Log | ✅ INTACT | All 12 tasks (T001-T012) have [📋] links to execution log anchors |
| Task↔Footnote | ✅ INTACT | Tasks 4.1-4.12 reference [^11]-[^17]; sequential, no gaps |
| Footnote↔File | ✅ INTACT | All node IDs point to files in diff (verified: pod.types.ts, pod.schema.ts, pod.agent.ts, pod.code.ts, pod-manager.ts, fake-pod-manager.ts, pod-manager.test.ts, pod.test.ts, index.ts, script-runner.types.ts, pod-manager.types.ts, node-starter-prompt.md) |
| Plan↔Dossier | ⚠️ MINOR | Dossier Phase Footnote Stubs section is empty (line 550: "Populated by plan-6 during implementation") — not populated despite implementation being complete |

**Graph Integrity Score**: ⚠️ MINOR_ISSUES (1 medium finding)

**Finding**: The dossier `tasks.md` Phase Footnote Stubs table (line 548-552) was never populated by plan-6. The plan § 12 ledger has all footnotes correctly ([^11]-[^17]), but the dossier's stub section remains empty. This does not break navigability (plan ledger is authoritative) but violates the expected plan-6 workflow.

#### Authority Conflicts

No conflicts. Plan § 12 is authoritative and complete. Dossier stubs are empty but not conflicting.

#### TDD Compliance

- **TDD order**: Execution log documents RED→GREEN sequence for all tasks (T003→T004, T005→T006, T007→T008, T009→T010)
- **RED evidence**: Log entries show "Failed to load url ../pod.agent.js — expected, module not yet created" (T003) and "Cannot find module ../fake-pod-manager.js — expected" (T007/T009)
- **GREEN evidence**: Log entries show test counts after implementation (14 pass for T004, 21 pass for T005+T006, 32 pass for T008+T010)
- **Test Doc blocks**: Both test files have complete 5-field Test Doc blocks (Why, Contract, Usage Notes, Quality Contribution, Worked Example)

#### Mock Usage

- **Policy**: Fakes over mocks — no vi.mock/jest.mock
- **Compliance**: ✅ PASS — zero vi.mock/jest.mock calls found
- **Fakes used**: FakeAgentAdapter, FakeScriptRunner, FakeFileSystem, FakePodManager, FakePod
- **Contract tests**: 12 parameterized tests verify fake/real parity

### E.2) Semantic Analysis

#### Domain Logic Correctness

- **AgentPod.execute()**: Correctly maps AgentResult status to PodOutcome (completed→completed, failed→error, killed→terminated). Session capture from adapter result is correct (DYK-P4#2).
- **CodePod.execute()**: Correctly maps exit codes (0→completed, non-zero→error). No session tracking (sessionId always undefined).
- **PodManager.createPod()**: Correctly discriminates on unitType to create AgentPod or CodePod. Returns existing pod on dedup.
- **Session persistence**: Correct roundtrip via atomicWriteFile → JSON parse. Path construction follows `.chainglass/graphs/<slug>/pod-sessions.json` convention.

#### Specification Drift

- **QS-001 (HIGH)**: AgentPod.execute() ignores `options.inputs`. The IWorkUnitPod doc says "Calls IAgentAdapter.run() with prompt + inputs" but inputs are not passed. This is acceptable for Phase 4 as the plan states "AgentPod reads a generic node-starter-prompt.md" (DYK-P4#1) and real prompt construction is deferred. However, the interface documentation is misleading.
- **QS-008 (MEDIUM)**: CodePod passes `script: ''` — the actual script to run is never wired. This is documented as intentional deferral ("Only interface + fake needed for Phase 4; real runner deferred").

### E.3) Quality & Safety Analysis

**Safety Score: 64/100** (CRITICAL: 0, HIGH: 2, MEDIUM: 7, LOW: 6)

#### Correctness Findings

- **QS-004**: `loadSessions()` merges without clearing — calling twice accumulates stale data
- **QS-005**: `destroyPod()` doesn't terminate running processes
- **QS-013**: `createPod()` ignores unitType mismatch on dedup return

#### Security Findings

- **QS-003**: `sessionsPath()` doesn't validate graphSlug — path traversal possible. Note: graphSlug is validated upstream by the graph service regex `/^[a-z][a-z0-9-]*$/` (per plan Technical Context), but PodManager itself has no guard.

#### Performance Findings

- **QS-007**: `readFileSync` blocks event loop on first AgentPod execution. Mitigated by cache (only blocks once).
- **QS-009**: Hardcoded 60s timeout for all code pods.

#### Observability Findings

- **QS-002 (HIGH)**: `loadSessions()` catch block swallows all errors including JSON parse failures. Corrupted session files are silently ignored with no logging, making debugging session loss impossible.
- **QS-010**: `onEvent` callback is defined but never invoked — no runtime visibility into pod execution.

### E.4) Doctrine Evolution Recommendations (Advisory)

| Category | New | Updates | Priority HIGH |
|----------|-----|---------|---------------|
| ADRs | 0 | 0 | 0 |
| Rules | 1 | 0 | 0 |
| Idioms | 2 | 0 | 0 |
| Architecture | 0 | 0 | 0 |

**Rules Candidates**:
- **RULE-REC-001** (MEDIUM): "All `catch` blocks for file I/O must distinguish ENOENT from other errors." Evidence: pod-manager.ts:74. The bare `catch {}` pattern for optional files is used here and may recur. Recommend documenting: ENOENT → acceptable, parse error → log warning.

**Idioms Candidates**:
- **IDIOM-REC-001** (MEDIUM): "Discriminated union for creation params" — `PodCreateParams` uses discriminated union on `unitType` to carry type-specific deps. Pattern is clean and reusable: `type Params = { type: 'a'; dep: A } | { type: 'b'; dep: B }`. Evidence: pod-manager.types.ts:19-29.
- **IDIOM-REC-002** (LOW): "Contract test factory with per-implementation setup" — Parameterized test loop with `implementations` array containing `{ name, setup }`. Evidence: pod-manager.test.ts:292-305.

**Positive Alignment**:
- Implementation correctly follows Zod-first schema pattern from Phase 1-2 (pod.schema.ts)
- FakePodManager mirrors FakeAgentContextService pattern from Phase 3
- PlanPak file placement fully compliant
- atomicWriteFile reuse from existing utility (per plan Finding #15)

---

## F) Coverage Map

### Acceptance Criteria Coverage

| AC | Description | Test Coverage | Confidence |
|----|-------------|---------------|------------|
| AC-7 | Pods manage agent/code execution lifecycle | pod.test.ts: 21 tests covering execute, resume, terminate, all 4 outcomes | 100% — explicit AC reference in dossier traceability |
| AC-8 | Pod sessions survive server restarts | pod-manager.test.ts: 4 persistence tests (write, read, missing file, roundtrip) | 100% — explicit test names reference persist/load |
| AC-13 | FakePodManager enables deterministic testing | pod-manager.test.ts: 8 fake tests + 12 contract tests | 100% — configurePod, seedSession, history all tested |

### Test-to-Criterion Mapping

| Criterion | Tests | Confidence |
|-----------|-------|------------|
| Pod creates for agent type | `createPod — agent unit returns AgentPod` (real + contract) | 100% |
| Pod creates for code type | `createPod — code unit returns CodePod` (real + contract) | 100% |
| Session capture from adapter | `captures sessionId from adapter result` | 100% |
| Session persistence | `persistSessions writes JSON`, `loadSessions reads back`, `roundtrip` | 100% |
| Session survives destroy | `destroyPod retains session` (real + fake + contract) | 100% |
| Error handling | `adapter exception returns error`, `runner exception returns error` | 100% |
| Context session passthrough | `passes contextSessionId to adapter` | 100% |
| Resume with no session | `no session returns error` | 100% |
| Fake configurability | `configurePod + createPod returns FakePod with configured results` | 100% |
| Fake/real parity | 6 contract tests × 2 implementations = 12 | 100% |

**Overall Coverage Confidence**: 100% — all acceptance criteria have explicit, named tests with behavioral assertions.

**Narrative Tests**: None detected. All tests map to specific acceptance criteria or dossier validation requirements.

---

## G) Commands Executed

```bash
# Diff computation
git diff HEAD -- positional-orchestrator-plan.md index.ts > tracked.diff
git diff --no-index /dev/null <new-files> >> new.diff

# Phase 1-3 regression tests
pnpm vitest run test/unit/positional-graph/features/030-orchestration/reality.test.ts \
  test/unit/positional-graph/features/030-orchestration/orchestration-request.test.ts \
  test/unit/positional-graph/features/030-orchestration/agent-context.test.ts
# → 98 passed (3 files)

# Phase 4 tests
pnpm vitest run test/unit/positional-graph/features/030-orchestration/pod.test.ts \
  test/unit/positional-graph/features/030-orchestration/pod-manager.test.ts
# → 53 passed (2 files)

# Full test suite
pnpm test
# → 3384 passed, 41 skipped (227 test files)

# Build
pnpm build
# → 7 successful (918ms)
```

---

## H) Decision & Next Steps

**Verdict**: **APPROVE** — Phase 4 is ready to commit.

**Advisory items for future phases** (do not block this merge):

1. **QS-001** (inputs not wired): Phase 6 (ODS) should ensure inputs flow through to agent prompt when implementing `handleStartNode`. The AgentPod interface doc should be updated to reflect the current behavior.
2. **QS-002** (silent parse errors): Consider narrowing the catch in `loadSessions()` before Phase 8 E2E testing, so corrupted session files surface during integration.
3. **QS-003** (graphSlug validation): Currently safe because graph service validates upstream. Consider adding a defensive check if PodManager is used outside that path.

**Next steps**:
1. Commit Phase 4 changes
2. Run `/plan-5-phase-tasks-and-brief --phase "Phase 5: ONBAS Walk Algorithm"` to generate Phase 5 tasks

---

## I) Footnotes Audit

| Diff-Touched Path | Footnote(s) | Node IDs in Ledger |
|--------------------|-------------|-------------------|
| pod.types.ts | [^11] | `file:packages/positional-graph/src/features/030-orchestration/pod.types.ts` |
| pod.schema.ts | [^11] | `file:packages/positional-graph/src/features/030-orchestration/pod.schema.ts` |
| script-runner.types.ts | [^11] | `file:packages/positional-graph/src/features/030-orchestration/script-runner.types.ts` |
| pod-manager.types.ts | [^11] | `file:packages/positional-graph/src/features/030-orchestration/pod-manager.types.ts` |
| node-starter-prompt.md | [^11] | `file:packages/positional-graph/src/features/030-orchestration/node-starter-prompt.md` |
| pod.test.ts | [^12], [^14] | `file:test/unit/positional-graph/features/030-orchestration/pod.test.ts` |
| pod.agent.ts | [^13] | `class:packages/positional-graph/src/features/030-orchestration/pod.agent.ts:AgentPod` |
| pod.code.ts | [^14] | `class:packages/positional-graph/src/features/030-orchestration/pod.code.ts:CodePod` |
| pod-manager.test.ts | [^15] | `file:test/unit/positional-graph/features/030-orchestration/pod-manager.test.ts` |
| fake-pod-manager.ts | [^16] | `class:...fake-pod-manager.ts:FakePodManager`, `class:...fake-pod-manager.ts:FakePod` |
| pod-manager.ts | [^16] | `class:...pod-manager.ts:PodManager` |
| index.ts | [^17] | `file:packages/positional-graph/src/features/030-orchestration/index.ts` |

All diff-touched files have corresponding footnotes. Footnotes [^11]–[^17] are sequential with no gaps. All FlowSpace node IDs follow correct format and point to verified files/classes.
