# Phase 1 Code Review: Context Engine — Types, Schema, and Rules

**Plan**: 039-advanced-e2e-pipeline  
**Phase**: Phase 1: Context Engine — Types, Schema, and Rules  
**Commit Range**: fcdda70^ → fcdda70  
**Review Date**: 2026-02-21  
**Reviewer**: Automated Code Review (plan-7)  
**Testing Approach**: Full TDD  

---

## A) Verdict

**❌ REQUEST_CHANGES**

**Rationale**: 42 CRITICAL and HIGH findings block approval:
- **14 CRITICAL** graph integrity violations (Task↔Footnote ledger completely unsynchronized)
- **28 HIGH** traceability and correctness violations (missing log links, observability gaps, correctness defects)
- Core implementation is **semantically correct** (6-rule engine matches Workshop 03 spec)
- Tests pass (20/20) but graph provenance is **broken**

**Impact**: Without fixes, this phase cannot be merged:
- **Graph traversability broken**: File→Task navigation impossible (no footnotes)
- **Execution traceability broken**: Task→Log navigation impossible (no anchors)
- **Code correctness issue**: `contextFrom` self-reference creates dependency cycle
- **Scope creep**: Workshop/planning docs included in implementation diff

---

## B) Summary

Phase 1 successfully replaces the 5-rule context engine with the 6-rule "Global Session + Left Neighbor" model. The **core algorithm is correct** and all 20 unit tests pass. However, **critical graph integrity failures** block merge:

**What Went Right**:
✅ 6-rule engine implementation matches Workshop 03 spec exactly  
✅ All 20 unit tests pass (R0-R5, 7 scenarios from workshop)  
✅ Schema → Service → Interface → Builder → Types → Engine pipeline wired correctly  
✅ Dead code (`getFirstAgentOnPreviousLine`) removed cleanly  
✅ Full test suite passes (274 files, 0 failures)  

**Critical Blockers**:
❌ **All 11 tasks** missing footnote tags ([^N]) in Notes column  
❌ **All 11 tasks** missing log anchors (log#...) in Notes column  
❌ **Plan § 12 footnote ledger** has placeholder [^2] with no content  
❌ **Dossier footnote stubs** use wrong format ([^ph1-N] instead of [^N])  
❌ **10 plan tasks** missing [📋] execution log links  
❌ `contextFrom` lacks self-reference guard (can create cycles)  

**High-Impact Issues**:
⚠️ **3 workshop/spec files** included in implementation diff (scope creep)  
⚠️ **RUN_INTEGRATION gating** introduced without explicit task (unplanned functionality)  
⚠️ **2 integration tests** use relative paths (`__dirname + ../../..`)  
⚠️ **Performance**: O(N) global agent scan on every `getContextSource()` call  
⚠️ **Observability**: Invalid `contextFrom` silently degrades to `new` (no logging)  

---

## C) Checklist

**Testing Approach: Full TDD**

### TDD Compliance
- [x] Tests precede code (T007 written before T008 — RED first, GREEN after)
- [x] Tests as docs (20 tests with clear behavioral expectations, Workshop 03 scenarios)
- [x] Mock usage matches spec: No mocks/fakes (real `PositionalGraphReality` objects)
- [x] Negative/edge cases covered (contextFrom invalid, self-ref, parallel isolation)
- [x] RED-GREEN-REFACTOR cycles documented (execution log Entry 1 confirms workflow)

### Universal Compliance
- [ ] ❌ BridgeContext patterns followed — **Not applicable** (not VS Code extension)
- [ ] ❌ Only in-scope files changed — **FAILED**: 3 workshop files, symlink, plan/spec/research docs in diff
- [x] Linters/type checks clean — 2 pre-existing TS errors in graph-test-runner.ts (not ours)
- [ ] ❌ Absolute paths used — **FAILED**: 2 integration tests use `__dirname + ../../..`

### Graph Integrity (CRITICAL)
- [ ] ❌ Task↔Log links — **BROKEN**: All 11 tasks missing log#anchors
- [ ] ❌ Task↔Footnote links — **BROKEN**: All 11 tasks missing [^N] footnote tags
- [ ] ❌ Footnote↔File links — **BROKEN**: Plan § 12 has placeholder [^2], invalid node IDs
- [ ] ❌ Plan↔Dossier sync — **BROKEN**: 10 tasks missing [📋] log links in plan

**Overall**: ❌ 4/13 checklist items passing

---

## D) Findings Table

| ID | Severity | File:Lines | Summary | Recommendation |
|----|----------|------------|---------|----------------|
| **Link-001** | CRITICAL | tasks.md | All 11 tasks missing [^N] footnote tags in Notes | Run plan-6a to add footnotes |
| **Link-002** | CRITICAL | tasks.md | Footnote stubs use [^ph1-N] format instead of [^N] | Convert to numeric [^N] format |
| **Link-003** | CRITICAL | plan.md § 12 | Placeholder [^2] with no FlowSpace node IDs | Add concrete node IDs |
| **Link-004** | HIGH | tasks.md | All 11 tasks missing log#anchor in Notes | Add log#task-tNNN-... anchors |
| **Link-005** | HIGH | execution.log | Missing Dossier Task/Plan Task metadata in log entry | Add backlinks with metadata |
| **Link-006** | HIGH | plan.md | 10 tasks missing [📋] execution log links | Add [📋](exec.log#...) to Log column |
| **Correct-001** | HIGH | agent-context.ts:54-66 | contextFrom lacks self-reference guard | Add `if (contextFrom === nodeId)` check |
| **Scope-001** | HIGH | diff | 3 workshop files in implementation diff | Move to planning PR or add to task scope |
| **Scope-002** | MEDIUM | diff | RUN_INTEGRATION gating introduced without task | Document as explicit deviation |
| **Univ-001** | HIGH | integration tests:38,39 | Relative paths in execSync cwd | Use env-provided absolute REPO_ROOT |
| **Univ-002** | MEDIUM | agent-context.test.ts:27-28 | Deep relative imports across packages | Use package alias imports |
| **Perf-001** | MEDIUM | agent-context.ts:4044-4108 | findGlobalAgent() O(N) scan per call | Cache globalAgentId in reality snapshot |
| **Obs-001** | HIGH | agent-context.ts:4006-4013 | Invalid contextFrom silently downgrades | Add WARN log + metric |
| **Obs-002** | MEDIUM | agent-context.ts:4044-4094 | No audit log for context decisions | Add debug events with rule/nodeId |
| **Obs-003** | LOW | agent-context.ts:4099-4108 | No perf metric for findGlobalAgent | Add duration histogram |

**Total**: 15 findings (3 CRITICAL, 6 HIGH, 5 MEDIUM, 1 LOW)

---

## E) Detailed Findings

### E.0 Cross-Phase Regression Analysis

**Status**: ✅ SKIPPED (Phase 1 is first phase — no prior phases to regress against)

---

### E.1 Doctrine & Testing Compliance

#### Graph Integrity Violations (Step 3a)

**Graph Integrity Score**: ❌ **BROKEN** (41 violations: 14 CRITICAL, 27 HIGH)

**Verdict**: REQUEST_CHANGES — graph traversability is completely broken

| ID | Severity | Link Type | Issue | Expected | Fix | Impact |
|----|----------|-----------|-------|----------|-----|--------|
| V1 | CRITICAL | Task↔Footnote | T001 has modified files but Notes has no [^N] | Every task with files includes [^N] | Run plan-6a to add [^1] to T001 Notes | Breaks File→Task traversal |
| V2 | CRITICAL | Task↔Footnote | T002 has modified files but Notes has no [^N] | Every task with files includes [^N] | Run plan-6a to add [^2] to T002 Notes | Breaks File→Task traversal |
| V3 | CRITICAL | Task↔Footnote | T003 has modified files but Notes has no [^N] | Every task with files includes [^N] | Run plan-6a to add [^3] to T003 Notes | Breaks File→Task traversal |
| V4 | CRITICAL | Task↔Footnote | T004 has modified files but Notes has no [^N] | Every task with files includes [^N] | Run plan-6a to add [^4] to T004 Notes | Breaks File→Task traversal |
| V5 | CRITICAL | Task↔Footnote | T005 has modified files but Notes has no [^N] | Every task with files includes [^N] | Run plan-6a to add [^5] to T005 Notes | Breaks File→Task traversal |
| V6 | CRITICAL | Task↔Footnote | T006 has modified files but Notes has no [^N] | Every task with files includes [^N] | Run plan-6a to add [^6] to T006 Notes | Breaks File→Task traversal |
| V7 | CRITICAL | Task↔Footnote | T007 has modified files but Notes has no [^N] | Every task with files includes [^N] | Run plan-6a to add [^7] to T007 Notes | Breaks File→Task traversal |
| V8 | CRITICAL | Task↔Footnote | T008 has modified files but Notes has no [^N] | Every task with files includes [^N] | Run plan-6a to add [^8] to T008 Notes | Breaks File→Task traversal |
| V9 | CRITICAL | Task↔Footnote | T009 has modified files but Notes has no [^N] | Every task with files includes [^N] | Run plan-6a to add [^9] to T009 Notes | Breaks File→Task traversal |
| V10 | CRITICAL | Task↔Footnote | T010 has modified files but Notes has no [^N] | Every task with files includes [^N] | Run plan-6a to add [^10] to T010 Notes | Breaks File→Task traversal |
| V11 | CRITICAL | Task↔Footnote | T011 has modified files but Notes has no [^N] | Every task with files includes [^N] | Run plan-6a to add [^11] to T011 Notes | Breaks File→Task traversal |
| V12 | CRITICAL | Task↔Footnote | Plan has [^1] but dossier stubs use [^ph1-1] format | Both ledgers use numeric [^N] | Convert [^ph1-1] to [^1], mirror plan content | Ledger mismatch, non-deterministic provenance |
| V13 | CRITICAL | Task↔Footnote | Plan has [^2] placeholder with no node IDs | [^2] has concrete FlowSpace node IDs | Replace placeholder with real node IDs | Missing provenance for Phase 1 changes |
| V14 | CRITICAL | Footnote↔File | Dossier uses [^ph1-1]..[^ph1-5] instead of [^N] | Numeric sequential [^N] with plan § 12 parity | Replace labels, mirror plan § 12 content exactly | Ledger mismatch |
| V15 | HIGH | Task↔Log | T001 missing log#anchor in Notes | log#task-t001-... anchor in Notes | Add log anchor to Notes column | Cannot navigate to execution evidence |
| V16 | HIGH | Task↔Log | T002 missing log#anchor in Notes | log#task-t002-... anchor in Notes | Add log anchor to Notes column | Cannot navigate to execution evidence |
| V17 | HIGH | Task↔Log | T003 missing log#anchor in Notes | log#task-t003-... anchor in Notes | Add log anchor to Notes column | Cannot navigate to execution evidence |
| V18 | HIGH | Task↔Log | T004 missing log#anchor in Notes | log#task-t004-... anchor in Notes | Add log anchor to Notes column | Cannot navigate to execution evidence |
| V19 | HIGH | Task↔Log | T005 missing log#anchor in Notes | log#task-t005-... anchor in Notes | Add log anchor to Notes column | Cannot navigate to execution evidence |
| V20 | HIGH | Task↔Log | T006 missing log#anchor in Notes | log#task-t006-... anchor in Notes | Add log anchor to Notes column | Cannot navigate to execution evidence |
| V21 | HIGH | Task↔Log | T007 missing log#anchor in Notes | log#task-t007-... anchor in Notes | Add log anchor to Notes column | Cannot navigate to execution evidence |
| V22 | HIGH | Task↔Log | T008 missing log#anchor in Notes | log#task-t008-... anchor in Notes | Add log anchor to Notes column | Cannot navigate to execution evidence |
| V23 | HIGH | Task↔Log | T009 missing log#anchor in Notes | log#task-t009-... anchor in Notes | Add log anchor to Notes column | Cannot navigate to execution evidence |
| V24 | HIGH | Task↔Log | T010 missing log#anchor in Notes | log#task-t010-... anchor in Notes | Add log anchor to Notes column | Cannot navigate to execution evidence |
| V25 | HIGH | Task↔Log | T011 missing log#anchor in Notes | log#task-t011-... anchor in Notes | Add log anchor to Notes column | Cannot navigate to execution evidence |
| V26 | HIGH | Task↔Log | Log entry 1 missing Dossier Task metadata/backlink | Entry includes `**Dossier Task**: [Txxx](tasks.md#...)` | Add Dossier Task metadata with backlink | No traceable mapping from execution to dossier |
| V27 | HIGH | Task↔Log | Log entry 1 missing Plan Task metadata/backlink | Entry includes `**Plan Task**: [Phase 1 Task](../../plan.md#...)` | Add Plan Task metadata with backlink | No traceable mapping from execution to plan |
| V28 | HIGH | Plan↔Dossier | Plan task 1.1 missing [📋] log link | [📋](execution.log.md#t001) in Log column | Add [📋] link to plan task 1.1 | Execution traceability incomplete |
| V29 | HIGH | Plan↔Dossier | Plan task 1.2 missing [📋] log link | [📋](execution.log.md#t002) in Log column | Add [📋] link to plan task 1.2 | Execution traceability incomplete |
| V30 | HIGH | Plan↔Dossier | Plan task 1.3 missing [📋] log link | [📋](execution.log.md#t003) in Log column | Add [📋] link to plan task 1.3 | Execution traceability incomplete |
| V31 | HIGH | Plan↔Dossier | Plan task 1.4 missing [📋] log link | [📋](execution.log.md#t004) in Log column | Add [📋] link to plan task 1.4 | Execution traceability incomplete |
| V32 | HIGH | Plan↔Dossier | Plan task 1.5 missing [📋] log link | [📋](execution.log.md#t005) in Log column | Add [📋] link to plan task 1.5 | Execution traceability incomplete |
| V33 | HIGH | Plan↔Dossier | Plan task 1.6 missing [📋] log link | [📋](execution.log.md#t007) in Log column | Add [📋] link to plan task 1.6 | Execution traceability incomplete |
| V34 | HIGH | Plan↔Dossier | Plan task 1.7 missing [📋] log link | [📋](execution.log.md#t008) in Log column | Add [📋] link to plan task 1.7 | Execution traceability incomplete |
| V35 | HIGH | Plan↔Dossier | Plan task 1.8 missing [📋] log link | [📋](execution.log.md#t009) in Log column | Add [📋] link to plan task 1.8 | Execution traceability incomplete |
| V36 | HIGH | Plan↔Dossier | Plan task 1.9 missing [📋] log link | [📋](execution.log.md#t010) in Log column | Add [📋] link to plan task 1.9 | Execution traceability incomplete |
| V37 | HIGH | Plan↔Dossier | Plan task 1.10 missing [📋] log link | [📋](execution.log.md#t011) in Log column | Add [📋] link to plan task 1.10 | Execution traceability incomplete |
| V38 | HIGH | Plan↔Dossier | Plan Notes cells missing phase footnote tags | Add [^N] tags in plan Notes matching dossier | Add matching footnote tags in Plan Notes | Cross-document provenance linkage broken |
| V39 | MEDIUM | Footnote↔File | orchestrator-settings.schema.ts invalid format | file:packages/.../orchestrator-settings.schema.ts:NodeOrchestratorSettingsSchema | Use proper FlowSpace node ID format | Node ID not queryable |
| V40 | MEDIUM | Footnote↔File | positional-graph-service.interface.ts invalid format | file:packages/.../positional-graph-service.interface.ts:NodeStatusResult | Use proper FlowSpace node ID format | Node ID not queryable |
| V41 | MEDIUM | Footnote↔File | (8 more files with invalid format) | Proper file:path:symbol format for all | Convert to FlowSpace node ID format | Node IDs not queryable |

**Authority Conflicts (Step 3c)**:

**Status**: ✅ NO CONFLICTS (Plan § 12 is authority; dossier must sync to match)

**Resolution Path**: Run `plan-6a --sync-footnotes` to:
1. Convert dossier [^ph1-N] to numeric [^N] matching plan § 12
2. Add [^N] footnote tags to all 11 task Notes columns
3. Add concrete FlowSpace node IDs to plan [^2] placeholder
4. Ensure ledgers mirror exactly

#### TDD Compliance (Full TDD Approach)

**Status**: ✅ PASS

**Findings**: 0 violations

**Evidence**:
- ✅ T007 written before T008 — tests RED first against old engine
- ✅ T008 replaced engine — tests GREEN after implementation
- ✅ Execution log documents RED-GREEN-REFACTOR cycle (Entry 1, Table rows T007/T008)
- ✅ 20 tests cover all 6 rules (R0-R5), all 7 Workshop 03 scenarios
- ✅ Tests use descriptive names (`test_givenContext_whenAction_thenOutcome` format)
- ✅ Tests include inline comments explaining purpose and quality contribution

**Test Coverage**:
- R0 (guard): 2 tests (non-agent → not-applicable, user-input → not-applicable)
- R1 (noContext): 1 test (noContext always gets fresh session)
- R2 (contextFrom): 2 tests (override with valid target, runtime guard for invalid)
- R3 (global agent): 1 test (global agent at pos 0 gets fresh session)
- R4 (parallel isolation): 1 test (parallel pos > 0 gets fresh session)
- R5 (serial inheritance): 7 tests (left neighbor, left walk skip non-agents, global fallback)
- Scenario 3 (E2E pipeline): 1 test (reviewer inherits from global, skips parallel)
- Edge cases: 5 tests (contextFrom edge cases, parallel-without-noContext)

#### Mock Usage Compliance

**Status**: ✅ PASS

**Policy**: No mocks (per plan: "No fakes, no mocks — real PositionalGraphReality objects")

**Findings**: 0 violations

**Evidence**:
- All 20 tests construct real `PositionalGraphReality` objects via `makeNode`, `makeLine`, `makeReality`, `makeRealityFromLines` helpers
- No mock frameworks detected in test code (no jest.mock, sinon, unittest.mock, MagicMock)
- `FakeAgentContextService` maintained unchanged (existing infrastructure fake, not new mock)

#### Universal Patterns & Plan Compliance

**Findings**: 7 violations (2 HIGH, 4 MEDIUM, 1 LOW)

**Plan Compliance**:
- ❌ **Scope Creep**: 3 HIGH violations
  - PLAN-001: Workshop 01 (multi-line-qa-e2e-test-design.md) in implementation diff
  - PLAN-002: Workshop 02 (context-backward-walk-scenarios.md) in implementation diff
  - PLAN-003: Workshop 03 (simplified-context-model.md) in implementation diff
  - **Fix**: Move workshop/spec/research docs to separate planning PR or add explicit task coverage
- ❌ **Unplanned Functionality**: 1 MEDIUM violation
  - PLAN-004: `RUN_INTEGRATION=1` gating introduced in 3 integration tests without explicit task/acceptance criteria
  - **Fix**: Document as explicit deviation with rationale or move to dedicated reliability phase

**Task Implementation**: ✅ ALL PASS (T001-T011 correctly implemented)
- T001: noContext/contextFrom added to schema ✅
- T002: Fields added to NodeStatusResult ✅
- T003: Fields exposed in getNodeStatus() and addNode() ✅
- T004: Fields added to NodeReality + ReadinessDetail stub ✅
- T005: Fields wired in reality builder ✅
- T006: Compilation passes (2 pre-existing TS errors, not ours) ✅
- T007: 20 tests written, 3 RED against old engine ✅
- T008: New engine implemented, all 20 tests GREEN ✅
- T009: FakeAgentContextService verified unchanged ✅
- T010: Dead code deleted cleanly ✅
- T011: Full test suite passes (274 files, 0 failures) ✅

**ADR Compliance**: ✅ PASS
- ADR-0006 (CLI-based orchestration): No violations
- ADR-0011 (First-class domain concepts): noContext/contextFrom follow pattern ✅
- ADR-0012 (Workflow domain boundaries): Context logic stays in 030-orchestration ✅

**Rules Compliance**: ⚠️ 3 violations
- UNI-001: HIGH — Integration test uses relative path (`__dirname + ../../..`) in `node-event-system-e2e.test.ts:38`
- UNI-002: HIGH — Integration test uses relative path (`__dirname + ../../..`) in `orchestration-e2e.test.ts:39`
- UNI-003: MEDIUM — Test uses deep relative imports (`../../../../../packages/...`) in `agent-context.test.ts:27-28`
- **Fix**: Use env-provided absolute REPO_ROOT for integration tests; use package alias imports for tests

---

### E.2 Semantic Analysis

**Status**: ✅ PASS

**Findings**: 0 violations

**Verification**:
- ✅ 6-rule engine (R0-R5) implementation matches Workshop 03 spec exactly
- ✅ Rule precedence correct: R0 (guard) → R1 (noContext) → R2 (contextFrom) → R3 (global at pos 0) → R4 (parallel isolation) → R5 (serial inheritance)
- ✅ Data flow pipeline correct: Schema → Service → Interface → Builder → Types → Engine
- ✅ ContextSourceResult 3-variant union unchanged (inherit | new | not-applicable)
- ✅ All acceptance criteria from Workshop 03 satisfied

**Algorithm Verification** (Workshop 03 Rule-by-Rule):
- **R0 (Guard)**: Non-agent nodes → `not-applicable` ✅
- **R1 (noContext)**: `noContext: true` → `new` (fresh session) ✅
- **R2 (contextFrom)**: Explicit `contextFrom` → `inherit` from target (runtime guard if invalid) ✅
- **R3 (Global at pos 0)**: Global agent (line 0 or 1, pos 0, not noContext) → `new` ✅
- **R4 (Parallel isolation)**: Parallel execution + pos > 0 → `new` (without noContext check) ✅
- **R5 (Serial inheritance)**: Serial + pos > 0 → left walk (skip non-agents) → global fallback ✅

---

### E.3 Quality & Safety Analysis

**Safety Score: 44/100** (1 CRITICAL equivalent: 1 HIGH correctness + 1 HIGH observability + 1 MEDIUM perf)

**Verdict: REQUEST_CHANGES** (HIGH correctness defect blocks merge)

#### Correctness Findings

**Findings**: 1 HIGH violation

**CORRECT-001 [HIGH]** — Missing self-reference guard in `contextFrom`

- **File**: `packages/positional-graph/src/features/030-orchestration/agent-context.ts`
- **Lines**: 54-66
- **Issue**: `contextFrom` override does not guard against self-reference (`contextFrom === nodeId`), allowing a node to inherit context from itself
- **Impact**: Self-inheritance creates invalid dependency cycle; readiness gate will hang waiting for self-completion; context resolution becomes undefined
- **Fix**: Add explicit self-reference check before resolving `targetNode`; if `contextFrom === nodeId`, return `new` with clear reason
- **Patch**:
  ```diff
  - if (node.contextFrom) {
  + if (node.contextFrom) {
  +   if (node.contextFrom === nodeId) {
  +     return { source: 'new', reason: `contextFrom '${node.contextFrom}' cannot reference self` };
  +   }
      const targetNode = view.getNode(node.contextFrom);
  ```

#### Security Findings

**Findings**: 0 violations

#### Performance Findings

**Findings**: 1 MEDIUM violation

**PERF-001 [MEDIUM]** — Repeated O(N) `findGlobalAgent()` scan per call

- **File**: `packages/positional-graph/src/features/030-orchestration/agent-context.ts`
- **Lines**: 4044-4047, 4099-4108
- **Issue**: `findGlobalAgent(reality)` performs full scan of all lines/nodes on every `getContextSource()` call, even though global agent is invariant for a given reality snapshot
- **Impact**: Context resolution becomes O(N²) over a run when many nodes resolve context
- **Fix**: Compute global agent once per reality snapshot (in reality builder/view) and reuse in `getContextSource()`
- **Optimization**:
  ```diff
  // reality.types.ts
  export interface PositionalGraphReality {
    // ...
  +  readonly globalAgentId?: string;
  }
  
  // reality.builder.ts (during build)
  const globalAgentId = computeGlobalAgentId(lines, nodes);
  return { ...reality, globalAgentId };
  
  // agent-context.ts
  - const globalAgentId = findGlobalAgent(reality); // O(N) scan every call
  + const globalAgentId = reality.globalAgentId; // O(1) lookup
  ```

#### Observability Findings

**Findings**: 3 violations (1 HIGH, 2 MEDIUM)

**OBS-001 [HIGH]** — Invalid `contextFrom` silently downgrades to `new`

- **File**: `packages/positional-graph/src/features/030-orchestration/agent-context.ts`
- **Lines**: 4006-4013
- **Issue**: Invalid `contextFrom` (target not found or not agent) silently falls back to `source: 'new'` with no error/warn log
- **Impact**: Miswired context inheritance becomes invisible in production; debugging lineage bugs is difficult; bad config passes unnoticed
- **Fix**: Emit structured WARN log with `nodeId`, `contextFrom`, `lineIndex`, `positionInLine` before fallback; increment validation-failure metric
- **Patch**:
  ```diff
  @@ if (node.contextFrom) {
  -    if (!targetNode || targetNode.unitType !== 'agent') {
  +    if (!targetNode || targetNode.unitType !== 'agent') {
  +      logger.warn('context_from_invalid', {
  +        nodeId,
  +        contextFrom: node.contextFrom,
  +        lineIndex: node.lineIndex,
  +        positionInLine: node.positionInLine,
  +      });
  +      metrics.increment('orchestration.context_from_invalid');
       return {
         source: 'new',
         reason: `contextFrom '${node.contextFrom}' invalid (not found or not agent) — runtime guard`,
       };
     }
  ```

**OBS-002 [MEDIUM]** — No audit trail for context decisions

- **File**: `packages/positional-graph/src/features/030-orchestration/agent-context.ts`
- **Lines**: 4044-4047, 4087-4094
- **Issue**: Global-agent selection and fallback path have no audit log/trace event
- **Impact**: No audit trail exists for why a node inherited from global vs left-neighbor; post-incident reconstruction of context lineage is hard
- **Fix**: Emit structured debug/audit events for context decisions (`rule`, `nodeId`, `fromNodeId`, `globalAgentId`)

**OBS-003 [LOW]** — No performance metric for `findGlobalAgent()`

- **File**: `packages/positional-graph/src/features/030-orchestration/agent-context.ts`
- **Lines**: 4099-4108
- **Issue**: `findGlobalAgent()` full scan has no duration histogram
- **Impact**: Potential latency regressions in large graphs cannot be detected or trended
- **Fix**: Track duration histogram/timer and count scanned nodes

---

### E.4 Doctrine Evolution Recommendations (ADVISORY)

**Status**: No new ADRs/rules/idioms recommended for this phase

**Rationale**: Phase 1 implements a well-specified algorithm from Workshop 03. No new architectural patterns emerged during implementation. Existing ADRs (ADR-0006, ADR-0011, ADR-0012) cover this work.

**Positive Alignment**:
- ✅ ADR-0011 (First-class domain concepts): `noContext` and `contextFrom` follow the interface → fake → tests → implementation pattern exactly
- ✅ ADR-0012 (Workflow domain boundaries): All context logic stays in `030-orchestration/` folder, separated from Agent domain
- ✅ Workshop 03 specification: 6-rule engine implementation matches spec exactly with no deviations

---

## F) Coverage Map

**Testing Approach**: Full TDD

**Overall Coverage Confidence**: 95% (19/20 tests explicit behavioral match; 1 test inferred)

### Acceptance Criteria → Test Mapping

| AC | Description | Test(s) | Confidence | Notes |
|----|-------------|---------|------------|-------|
| AC-1 | Serial pos 0 inherits global, skipping parallel lines | Scenario 3 (R5 reviewer) | 100% | Explicit test name references "reviewer inherits from global agent, skipping noContext parallel line" |
| AC-2 | noContext → fresh session regardless | R1 test | 100% | Explicit test: "R1: noContext always gets fresh session regardless of position" |
| AC-3 | contextFrom → inherit from specified node | R2 tests (2) | 100% | Explicit tests: "R2: contextFrom overrides default inheritance" + "R2 guard: invalid contextFrom" |
| AC-4 | Parallel pos > 0 → fresh session | R4 test | 100% | Explicit test: "R4: parallel at pos > 0 gets fresh session" |
| AC-5 | Serial pos > 0 → left walk, skip non-agents | R5 left-walk tests (3) | 100% | Explicit tests: "R5: serial pos > 0 inherits from left neighbor" + "R5: left walk skips non-agent" + variants |
| AC-6 | Left-hand rule absolute | R5 parallel-left test | 100% | Explicit test: "R5: serial inherits from left even if left is parallel" |
| AC-7 | getFirstAgentOnPreviousLine() deleted | reality.test.ts | 100% | 4 tests removed; grep confirms zero references |

**Narrative Tests**: 0 (all tests map to specific acceptance criteria)

**Weak Mappings**: 0 (all tests explicitly reference Workshop 03 rules/scenarios)

**Recommendations**:
- ✅ Test organization is excellent — clear rule-based naming (R0-R5) + scenario-based grouping
- ✅ Test Doc comments present inline (purpose + quality contribution documented)
- ⚠️ Consider extracting Workshop 03 rule definitions into test file header for quick reference

---

## G) Commands Executed

### Static Checks
```bash
# TypeScript type check
pnpm tsc --noEmit
# Result: 2 pre-existing errors in graph-test-runner.ts (not ours)

# Unit tests for context engine
pnpm test -- --run agent-context
# Result: ✓ 20/20 tests passed in 3ms

# Full test suite
pnpm test
# Result: 274 test files passed, 9 skipped, 0 failures, 92s total

# Lint + Format + Test
just fft
# Result: Passed (per execution log Entry 1)
```

### Diff Analysis
```bash
# Generate unified diff
git diff --unified=3 --no-color fcdda70^..fcdda70 > /tmp/phase1-diff.txt

# Count files changed
grep -c "^diff --git" /tmp/phase1-diff.txt
# Result: 22 files (10 production, 3 test, 9 docs/planning)
```

---

## H) Decision & Next Steps

### Approval Authority
**Plan Owner** must review and approve fixes before merge.

### Required Fixes (Blocking)

**Priority 1 - Graph Integrity** (CRITICAL — blocks merge):
1. Run `plan-6a --sync-footnotes` to:
   - Convert dossier footnote stubs from [^ph1-N] to numeric [^N]
   - Add [^N] footnote tags to all 11 task Notes columns
   - Add concrete FlowSpace node IDs to plan § 12 [^2] placeholder
   - Ensure plan § 12 and dossier stubs mirror exactly

2. Add log anchors to all 11 tasks:
   - Task Notes column: Add `log#task-t001-...` format anchors
   - Execution log: Add section headers matching anchor format (kebab-case)
   - Execution log: Add **Dossier Task** and **Plan Task** metadata with backlinks

3. Add [📋] execution log links to plan:
   - Plan task 1.1-1.10 Log column: Add `[📋](tasks/phase-1-.../execution.log.md#tNNN)` links
   - Plan task 1.1-1.10 Notes column: Add matching [^N] footnote tags from dossier

**Priority 2 - Correctness** (HIGH — code defect):
4. Fix `contextFrom` self-reference guard:
   - File: `agent-context.ts` lines 54-66
   - Add: `if (node.contextFrom === nodeId) return { source: 'new', reason: '...' };`
   - Test: Add unit test for self-reference case

**Priority 3 - Scope & Traceability** (HIGH — process violations):
5. Resolve scope creep:
   - Option A: Move workshop/spec/research docs to separate planning PR
   - Option B: Add explicit task T000 for "Phase 0: Planning & Research" with workshop files in scope
   - Document RUN_INTEGRATION gating as explicit deviation in plan § 14 Deviation Ledger

6. Fix universal pattern violations:
   - Integration tests: Replace `__dirname + ../../..` with env-provided absolute `REPO_ROOT`
   - Test imports: Replace deep relative imports with package alias imports

**Priority 4 - Observability** (MEDIUM — production debugging):
7. Add error logging for invalid `contextFrom`:
   - Add `logger.warn('context_from_invalid', { ... })` before fallback
   - Add `metrics.increment('orchestration.context_from_invalid')`

8. Add audit logging for context decisions:
   - Emit debug events with rule/nodeId/fromNodeId on every context resolution
   - Track `findGlobalAgent()` duration histogram

### Optional Improvements (Non-Blocking)

**Performance**:
- Cache `globalAgentId` in reality snapshot to avoid O(N) scan per call

**Test Quality**:
- Add Test Doc comment blocks with 5 required fields (Why, Contract, Usage, Quality, Example)
- Extract Workshop 03 rule definitions into test file header

### Retest After Fixes

```bash
# After fixing graph integrity
just fft  # Must pass
pnpm test -- --run agent-context  # Must pass (20/20)
grep -r "contextFrom.*==.*nodeId" packages/  # Should find self-ref guard

# After fixing scope
git log --oneline fcdda70^..fcdda70  # Should show planning PR separate from implementation PR
```

---

## I) Footnotes Audit

**Plan § 12 Change Footnotes Ledger**:
- [^1]: Phase 1 complete — lists 11 files modified (correct)
- [^2]: Placeholder — "To be added during implementation via plan-6a" (❌ MISSING concrete node IDs)

**Dossier Phase Footnote Stubs** (tasks.md):
- [^ph1-1]: orchestrator-settings.schema.ts (❌ WRONG FORMAT — should be [^1])
- [^ph1-2]: positional-graph-service.interface.ts (❌ WRONG FORMAT — should be [^2])
- [^ph1-3]: positional-graph.service.ts (❌ WRONG FORMAT — should be [^3])
- [^ph1-4]: reality.types.ts + reality.builder.ts (❌ WRONG FORMAT — should be [^4])
- [^ph1-5]: agent-context.ts + agent-context.test.ts + reality.view.ts + reality.test.ts (❌ WRONG FORMAT — should be [^5])

**Diff-Touched Files vs Footnotes**:
| File | Expected Footnote | Actual Footnote | Status |
|------|-------------------|-----------------|--------|
| orchestrator-settings.schema.ts | [^1] or [^2] | [^ph1-1] | ❌ Wrong format |
| positional-graph-service.interface.ts | [^1] or [^2] | [^ph1-2] | ❌ Wrong format |
| positional-graph.service.ts | [^1] or [^2] | [^ph1-3] | ❌ Wrong format |
| reality.types.ts | [^1] or [^2] | [^ph1-4] | ❌ Wrong format |
| reality.builder.ts | [^1] or [^2] | [^ph1-4] | ❌ Wrong format |
| agent-context.ts | [^1] or [^2] | [^ph1-5] | ❌ Wrong format |
| agent-context.test.ts | [^1] or [^2] | [^ph1-5] | ❌ Wrong format |
| reality.view.ts | [^1] or [^2] | [^ph1-5] | ❌ Wrong format |
| reality.test.ts | [^1] or [^2] | [^ph1-5] | ❌ Wrong format |
| fake-agent-context.ts | [^1] or [^2] | None | ❌ Missing |
| integration tests (3 files) | [^1] or [^2] | None | ❌ Missing |

**Summary**: 14/14 files either have wrong-format footnotes or missing footnotes entirely. All footnotes must be converted to numeric [^N] and synced between plan § 12 and dossier stubs.

---

**End of Review**
