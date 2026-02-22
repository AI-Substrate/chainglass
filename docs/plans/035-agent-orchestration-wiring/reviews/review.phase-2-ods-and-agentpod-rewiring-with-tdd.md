# Code Review: Phase 2 — ODS and AgentPod Rewiring with TDD

**Plan**: [agent-orchestration-wiring-plan.md](../agent-orchestration-wiring-plan.md)
**Dossier**: [tasks.md](../tasks/phase-2-ods-and-agentpod-rewiring-with-tdd/tasks.md)
**Diff Range**: `9377f77..e98eb7a` (8 source/test files, 565 lines)
**Reviewed**: 2026-02-17

---

## A) Verdict

**APPROVE**

No CRITICAL or HIGH findings in code quality or safety. All acceptance criteria satisfied. TDD discipline verified. Graph integrity has documentation-only link violations (MEDIUM) that do not block merge.

---

## B) Summary

Phase 2 rewires ODS and AgentPod to use `AgentManagerService`/`IAgentInstance` instead of raw `IAgentAdapter`. The implementation is clean, correct, and follows TDD discipline with 11 new tests (5 ODS wiring + 6 AgentPod wiring). All 4 ODS code paths (getNew, getWithSessionId, inherit-fallback, type-resolution) are covered. AgentPod correctly delegates to the instance and bridges `null→undefined` for sessionId. No mocks used — fakes only per R-TEST-006. One MEDIUM performance concern: `graphService.load()` is called every orchestration loop iteration for immutable data.

---

## C) Checklist

**Testing Approach: Full TDD**

- [x] Tests precede code (RED-GREEN-REFACTOR evidence in execution log)
- [x] Tests as docs (assertions show behavior — AC IDs in describe blocks)
- [x] Mock usage matches spec: Fakes only (zero vi.mock/vi.spyOn)
- [x] Negative/edge cases covered (inherit-fallback, null→undefined bridge, missing settings)
- [x] BridgeContext patterns followed (N/A — no VS Code extension code)
- [x] Only in-scope files changed (ods.types.ts JSDoc fix pre-approved in dossier)
- [x] Linters/type checks are clean (`tsc --noEmit` 0 errors in modified files)
- [x] Absolute paths used (no hidden context)

---

## D) Findings Table

| ID | Severity | File:Lines | Summary | Recommendation |
|----|----------|------------|---------|----------------|
| PERF-001 | MEDIUM | `graph-orchestration.ts:130-134` | `graphService.load()` called every loop iteration for immutable data | Cache definition before loop |
| PLAN-001 | MEDIUM | `pod-agent-wiring.test.ts` | No `resumeWithAnswer` test despite plan risk table "test resume path explicitly" | Add test or document Phase 3 coverage |
| CORR-001 | LOW | `graph-orchestration.ts:130-134` | `loadResult.errors` silently ignored — corrupted YAML defaults to copilot | Log warning on load errors |
| CORR-002 | LOW | `pod.agent.ts:46` | `unitSlug` stored in constructor but never used in class body | Remove or add comment for future use |
| TDD-001 | LOW | `ods-agent-wiring.test.ts:15` | Unused type import `IAgentManagerService` | Remove unused import |
| LINK-001 | MEDIUM | `execution.log.md:49` | T006 missing Plan Task metadata in log header | Add `\| **Plan Task**: 2.6` |
| LINK-002 | MEDIUM | `tasks.md:374-379` | Phase Footnote Stubs missing [^7] row for T006 | Add [^7] stub entry |
| LINK-003 | LOW | `tasks.md:377` | [^6] dossier stub lacks "Critical Finding #01" mention present in plan | Align stub with plan ledger text |
| LINK-004 | LOW | `tasks.md:200` | T012 has no footnote reference (verification task) | Consider if footnote needed |

---

## E) Detailed Findings

### E.0) Cross-Phase Regression Analysis

**Phase 1 tests re-run against current code state:**
- `orchestrator-settings.schema.test.ts`: **5/5 PASS**
- No breaking changes to Phase 1 interfaces
- All Phase 1 type definitions compile cleanly

**Verdict**: PASS — no regressions.

### E.1) Doctrine & Testing Compliance

#### Graph Integrity (Link Validation)

| Link Type | Status | Violations |
|-----------|--------|------------|
| Task↔Log | ⚠️ MINOR | T006 missing Plan Task reference in log (MEDIUM) |
| Task↔Footnote | ⚠️ MINOR | [^7] stub missing in dossier (MEDIUM); [^6] content divergence (LOW) |
| Footnote↔File | ✅ INTACT | All 8 files covered by footnotes [^5]-[^8] |
| Plan↔Dossier | ✅ INTACT | All 11 plan tasks map to dossier T001-T012, statuses synchronized |
| Parent↔Subtask | N/A | No subtasks in Phase 2 |

**Graph Integrity Score**: ⚠️ MINOR_ISSUES (2 MEDIUM + 2 LOW link violations — documentation only)

#### TDD Compliance

- **RED→GREEN order**: T001-T004 (RED) → T005 (GREEN); T007-T008 (RED) → T009 (GREEN). Verified in execution log.
- **REFACTOR**: T012 runs full test suite as verification gate.
- **Impure RED**: T007-T008 had 3/6 tests passing during RED phase due to structural compatibility — documented honestly in execution log. Not a violation.
- **Test-as-documentation**: Both test files include Purpose/Quality Contribution/Acceptance Criteria header blocks. Test names are behavior-descriptive with AC IDs.

#### Mock/Fake Usage (R-TEST-006)

- **Zero violations**: No `vi.mock`, `vi.spyOn`, `vi.fn`, or mock libraries detected.
- `FakeAgentManagerService`, `FakeAgentContextService`, `FakePodManager`, `FakeAgentInstance` — all project fakes.
- One inline stub (`makeGraphServiceStub`) uses `as unknown as` cast — acceptable for data-only partial.

### E.2) Semantic Analysis

**Domain logic correctness**: All 4 ODS paths verified correct:
- `source='new'` → `getNew()` with correct params (name=unitSlug, type=agentType, workspace) ✓
- `source='inherit'` + session → `getWithSessionId(sessionId, params)` ✓
- `source='inherit'` + no session → fallback to `getNew()` ✓
- `agentType` from `reality.settings?.agentType ?? 'copilot'` ✓

**AgentPod delegation**: Constructor, run, terminate, sessionId all correctly delegate to `agentInstance`. The `null→undefined` bridge (`?? undefined`) correctly maps `IAgentInstance.sessionId: string|null` to `IWorkUnitPod.sessionId: string|undefined`. `resumeWithAnswer` guard uses `!this.agentInstance.sessionId` which correctly treats `null` as falsy.

**No specification drift detected.**

### E.3) Quality & Safety Analysis

**Safety Score: 82/100** (CRITICAL: 0, HIGH: 0, MEDIUM: 2, LOW: 3)

#### Performance

**PERF-001** (MEDIUM) — `graph-orchestration.ts:130-134`
- `graphService.load()` added to `buildReality()` Promise.all, which runs every settle-decide-act iteration (up to 100x). The graph definition is immutable during orchestration.
- **Impact**: Unnecessary disk I/O + Zod parsing per cycle. Not a correctness bug.
- **Fix**: Cache the definition before the loop:
  ```ts
  // In run(), before loop:
  const loadResult = await this.graphService.load(this.ctx, this.graphSlug);
  const settings = loadResult.definition?.orchestratorSettings;
  // Pass settings to buildReality() instead of calling load()
  ```
- **Note**: Execution log explicitly states "Load every cycle (no caching)" — this appears to be a deliberate choice, possibly for simplicity. Acceptable for now but should be optimized.

#### Correctness

**CORR-001** (LOW) — `graph-orchestration.ts:130-134`
- `loadResult.errors` not checked. If definition YAML is corrupted, `definition` is `undefined`, settings silently default to `copilot`.
- **Fix**: Log warning when `loadResult.errors.length > 0`.

**CORR-002** (LOW) — `pod.agent.ts:46`
- `unitSlug` stored via `private readonly unitSlug: string` but never used in the class body.
- **Fix**: Remove parameter or add `// Used by PodCreateParams discriminated union` comment.

#### Security

No vulnerabilities detected. All paths from trusted `WorkspaceContext`. No secrets, injection, or path traversal risks.

#### Observability

No new logging requirements per plan § Cross-Cutting Concerns. Existing adapter logging continues to work through `IAgentInstance` delegation.

### E.4) Doctrine Evolution Recommendations

_Advisory — does not affect verdict._

| Category | Recommendation | Evidence | Priority |
|----------|---------------|----------|----------|
| Idiom | `null→undefined` bridge pattern (`?? undefined`) for interface boundaries | `pod.agent.ts:50` | LOW |
| Rule | Consider rule: "Immutable config should be loaded once, not per-iteration" | `graph-orchestration.ts:130-134` | LOW |

No new ADR candidates. Implementation correctly follows ADR-0011 (first-class domain concepts) and ADR-0006 (CLI-based orchestration).

---

## F) Coverage Map

| AC | Description | Test | Key Assertion | Confidence |
|----|-------------|------|---------------|------------|
| AC-02 | ODS getNew for source='new' | `getNew path: calls agentManager.getNew with correct params when source is new` | `agents[0].name === 'spec-builder'`, `agents[0].type === 'copilot'` | 100% (explicit AC ID) |
| AC-03 | ODS getWithSessionId for inherit | `getWithSessionId path: calls agentManager.getWithSessionId when inheriting and session exists` | `agents[0].sessionId === 'session-abc'` | 100% (explicit AC ID) |
| AC-04 | ODS fallback to getNew (no session) | `inherit fallback: falls back to getNew when inheriting but source node has no session` | `agents[0].sessionId === null` (i.e., getNew called) | 100% (explicit AC ID) |
| AC-05 | AgentPod wraps IAgentInstance | `constructor: constructs with (nodeId, agentInstance, unitSlug)` | `pod.nodeId === 'n1'`, `pod.unitType === 'agent'` | 100% (explicit AC ID) |
| AC-06 | AgentPod sessionId from instance | `sessionId: reads sessionId from agentInstance` + `bridges null sessionId to undefined` | `pod.sessionId === 'sess-abc'`, `pod.sessionId === undefined` | 100% (explicit AC ID) |
| AC-07 | AgentPod delegates run/terminate | `delegates run to agentInstance.run` + `delegates terminate to agentInstance.terminate` | `history[0].cwd === '/test/workspace'`, `terminateCount === 1` | 100% (explicit AC ID) |
| AC-11 | ODS agent type from reality.settings | `type resolution: uses reality.settings.agentType when present` + `defaults to copilot when settings is missing` | `agents[0].type === 'claude-code'`, `agents[0].type === 'copilot'` | 100% (explicit AC ID) |

**Overall Coverage Confidence: 100%** — All 7 acceptance criteria have explicit test coverage with AC IDs in describe blocks.

**Narrative Tests**: None. All tests map directly to acceptance criteria.

**Missing Coverage** (MEDIUM):
- `resumeWithAnswer` path has no test in Phase 2 test files. Plan risk table says "Test resume path explicitly (T011)." The implementation was done (T011 in diff) but no test validates it. Existing `pod.test.ts` covers resume with old interface and will be updated in Phase 3.

---

## G) Commands Executed

```bash
# Diff generation
git --no-pager diff --unified=3 --no-color 9377f77..e98eb7a -- packages/ test/ > /tmp/phase2.diff

# Type checking (modified files only)
npx tsc --noEmit --pretty false 2>&1 | grep -E "ods\.ts|pod\.agent\.ts|pod-manager\.ts|reality\.builder\.ts|graph-orchestration\.ts"
# Result: 0 errors

# Phase 2 tests
pnpm vitest run test/unit/positional-graph/features/030-orchestration/ods-agent-wiring.test.ts test/unit/positional-graph/features/030-orchestration/pod-agent-wiring.test.ts
# Result: 11/11 pass

# Phase 1 regression
pnpm vitest run test/unit/schemas/orchestrator-settings.schema.test.ts
# Result: 5/5 pass

# Combined run
pnpm vitest run test/unit/schemas/orchestrator-settings.schema.test.ts test/unit/positional-graph/features/030-orchestration/ods-agent-wiring.test.ts test/unit/positional-graph/features/030-orchestration/pod-agent-wiring.test.ts
# Result: 16/16 pass
```

---

## H) Decision & Next Steps

**Decision**: APPROVE — Phase 2 implementation is correct, well-tested, and follows TDD discipline. No blocking issues.

**Recommended before Phase 3**:
1. (Optional) Add `resumeWithAnswer` test to `pod-agent-wiring.test.ts` — or document Phase 3 deferred coverage
2. (Optional) Fix documentation link violations (LINK-001 through LINK-004) via `plan-6a`
3. (Optional) Cache `graphService.load()` result before orchestration loop

**Next Step**: Proceed to Phase 3 (`/plan-5-phase-tasks-and-brief --phase "Phase 3: DI Container and Existing Test Updates"`)

---

## I) Footnotes Audit

| Diff-Touched Path | Footnote(s) | Plan Ledger Node IDs |
|---|---|---|
| `test/.../ods-agent-wiring.test.ts` (new) | [^5] | `file:test/unit/positional-graph/features/030-orchestration/ods-agent-wiring.test.ts` |
| `packages/.../ods.ts` | [^6] | `file:packages/positional-graph/src/features/030-orchestration/ods.ts` |
| `packages/.../ods.types.ts` | [^6] | `file:packages/positional-graph/src/features/030-orchestration/ods.types.ts` |
| `packages/.../reality.builder.ts` | [^7] | `file:packages/positional-graph/src/features/030-orchestration/reality.builder.ts` |
| `packages/.../graph-orchestration.ts` | [^7] | `file:packages/positional-graph/src/features/030-orchestration/graph-orchestration.ts` |
| `test/.../pod-agent-wiring.test.ts` (new) | [^8] | `file:test/unit/positional-graph/features/030-orchestration/pod-agent-wiring.test.ts` |
| `packages/.../pod.agent.ts` | [^8] | `file:packages/positional-graph/src/features/030-orchestration/pod.agent.ts` |
| `packages/.../pod-manager.ts` | [^8] | `file:packages/positional-graph/src/features/030-orchestration/pod-manager.ts` |

All 8 diff-touched paths have corresponding footnote coverage in the plan ledger.
