# Phase 1: Context Engine — Types, Schema, and Rules – Tasks & Alignment Brief

**Spec**: [../../advanced-e2e-pipeline-spec.md](../../advanced-e2e-pipeline-spec.md)
**Plan**: [../../advanced-e2e-pipeline-plan.md](../../advanced-e2e-pipeline-plan.md)
**Date**: 2026-02-21

---

## Executive Briefing

### Purpose
This phase replaces the 5-rule backward-walk context inheritance engine with the "Global Session + Left Neighbor" model. The current engine produces incorrect results when parallel agent nodes sit between source and target — a reviewer inherits from a programmer's session instead of the spec-writer's global session. This is the foundational change that makes multi-line workflows with parallel fan-out possible.

### What We're Building
A new `getContextSource()` function (~70 lines) with 6 flat rules (R0-R5), replacing the current 128-line engine. Supporting type/schema changes thread `noContext` and `contextFrom` settings from storage through the reality pipeline to the engine. Dead code (`getFirstAgentOnPreviousLine`) is deleted. The `FakeAgentContextService` is updated to match.

### User Value
Workflow designers can build multi-line graphs where:
- Parallel workers get isolated sessions (explicit via `noContext`)
- Serial reviewers inherit the global session, skipping over parallel lines
- Nodes can explicitly wire context to any other node via `contextFrom`

### Example
**Before**: `getContextSource(reality, 'reviewer')` → `{ source: 'inherit', fromNodeId: 'programmer-a' }` (WRONG — inherits from parallel worker)
**After**: `getContextSource(reality, 'reviewer')` → `{ source: 'inherit', fromNodeId: 'spec-writer' }` (CORRECT — inherits from global agent)

---

## Objectives & Scope

### Objective
Implement the Global Session + Left Neighbor context engine (Workshop 03), thread `noContext`/`contextFrom` through the status pipeline, and prove correctness with exhaustive TDD tests covering all 6 rules and 7 scenarios.

### Goals

- ✅ Add `noContext: boolean` (default `false`) and `contextFrom: string` (optional) to `NodeOrchestratorSettingsSchema`
- ✅ Thread both fields through `NodeStatusResult` → `NodeReality` via the reality builder
- ✅ Replace `getContextSource()` with the 6-rule engine from Workshop 03
- ✅ Write exhaustive unit tests (6 rules × 7 scenarios) — RED first, GREEN after
- ✅ Update `FakeAgentContextService` so existing ODS tests pass
- ✅ Delete dead `getFirstAgentOnPreviousLine()` method and its tests

### Non-Goals

- ❌ `contextFromReady` readiness gate (Phase 2)
- ❌ E2E test script or fixtures (Phase 3)
- ❌ Changes to ODS, ONBAS, or the DI container (interface unchanged)
- ❌ Changes to `agent-context.schema.ts` or `agent-context.types.ts` (ContextSourceResult type unchanged)
- ❌ CLI command changes for `noContext`/`contextFrom` (programmatic only via `addNode()`)
- ❌ `compactBefore` node setting (deferred to future plan)
- ❌ Barrel file / index.ts changes (no new exports needed)

---

## Pre-Implementation Audit

### Summary
| # | File | Action | Origin | Modified By | Recommendation |
|---|------|--------|--------|-------------|----------------|
| 1 | `orchestrator-settings.schema.ts` | Modify | Plan 026 | Plan 035 | cross-plan-edit |
| 2 | `positional-graph-service.interface.ts` | Modify | Plan 026 | Plans 030, 032 | cross-plan-edit |
| 3 | `positional-graph.service.ts` | Modify | Plan 026 | Plans 030, 032, 035 | cross-plan-edit |
| 4 | `reality.types.ts` | Modify | Plan 030 | Plans 032, 035 | cross-plan-edit |
| 5 | `reality.builder.ts` | Modify | Plan 030 | Plan 035 | cross-plan-edit |
| 6 | `agent-context.ts` | Modify | Plan 030 | — (untouched since origin) | cross-plan-edit |
| 7 | `fake-agent-context.ts` | Modify | Plan 030 | — (untouched since origin) | cross-plan-edit |
| 8 | `reality.view.ts` | Modify | Plan 030 | — (untouched since origin) | cross-plan-edit |
| 9 | `agent-context.test.ts` | Modify | Plan 030 | — (untouched since origin) | cross-plan-edit |
| 10 | `reality.test.ts` | Modify | Plan 030 | — (untouched since origin) | cross-plan-edit |

### Compliance Check
No violations found. All files are cross-plan-edits to existing `030-orchestration` module. Advisory: R-TEST-002 requires full 5-field Test Doc comment format — implementor must add complete Test Doc headers.

---

## Requirements Traceability

### Coverage Matrix
| AC | Description | Flow Summary | Files in Flow | Tasks | Status |
|----|-------------|-------------|---------------|-------|--------|
| AC-1 | Serial pos 0 inherits global, skipping parallel lines | schema → service → interface → builder → types → engine | 6 | T001-T006, T008 | ✅ Complete |
| AC-2 | noContext → fresh session regardless | schema → service → interface → builder → types → engine | 6 | T001-T006, T008 | ✅ Complete |
| AC-3 | contextFrom → inherit from specified node (runtime guard) | schema → service → interface → builder → types → engine (R2) | 6 | T001-T006, T008 | ✅ Complete |
| AC-4 | Parallel pos > 0 → fresh session | engine (R4 check) | 1 | T007, T008 | ✅ Complete |
| AC-5 | Serial pos > 0 → left walk, skip non-agents | engine (R5 left walk) | 1 | T007, T008 | ✅ Complete |
| AC-6 | Left-hand rule absolute (inherit from left even if parallel) | engine (R5 — no exec/noContext check on left) | 1 | T007, T008 | ✅ Complete |
| AC-7 | getFirstAgentOnPreviousLine() deleted | reality.view.ts + reality.test.ts | 2 | T010 | ✅ Complete |

### Gaps Found
No gaps — all acceptance criteria have complete file coverage.

### Files Confirmed No-Change
`agent-context.schema.ts`, `agent-context.types.ts`, `ods.ts`, `container.ts`, `index.ts`, `node.schema.ts` — verified no changes needed.

---

## Architecture Map

### Component Diagram
<!-- Status: grey=pending, orange=in-progress, green=completed, red=blocked -->
<!-- Updated by plan-6 during implementation -->

```mermaid
flowchart TD
    classDef pending fill:#9E9E9E,stroke:#757575,color:#fff
    classDef inprogress fill:#FF9800,stroke:#F57C00,color:#fff
    classDef completed fill:#4CAF50,stroke:#388E3C,color:#fff
    classDef blocked fill:#F44336,stroke:#D32F2F,color:#fff

    subgraph Schema["Schema & Types"]
        T001["T001: Schema fields"]:::completed
        T002["T002: NodeStatusResult"]:::completed
        T004["T004: NodeReality"]:::completed
    end

    subgraph Service["Service Layer"]
        T003["T003: getNodeStatus()"]:::completed
        T005["T005: Reality builder"]:::completed
    end

    subgraph Engine["Context Engine"]
        T007["T007: Write tests RED"]:::completed
        T008["T008: Replace engine GREEN"]:::completed
    end

    subgraph Cleanup["Cleanup & Verification"]
        T009["T009: Update fake"]:::completed
        T010["T010: Delete dead code"]:::completed
        T011["T011: Full test suite"]:::completed
    end

    T001 --> T002 --> T003
    T001 --> T004 --> T005
    T003 --> T005
    T005 --> T007
    T007 --> T008
    T008 --> T009
    T008 --> T010
    T009 --> T011
    T010 --> T011

    subgraph Files["Files"]
        F1["orchestrator-settings.schema.ts"]:::completed
        F2["positional-graph-service.interface.ts"]:::completed
        F3["positional-graph.service.ts"]:::completed
        F4["reality.types.ts"]:::completed
        F5["reality.builder.ts"]:::completed
        F6["agent-context.test.ts"]:::completed
        F7["agent-context.ts"]:::completed
        F8["fake-agent-context.ts"]:::completed
        F9["reality.view.ts"]:::completed
        F10["reality.test.ts"]:::completed
    end

    T001 -.-> F1
    T002 -.-> F2
    T003 -.-> F3
    T004 -.-> F4
    T005 -.-> F5
    T007 -.-> F6
    T008 -.-> F7
    T009 -.-> F8
    T010 -.-> F9
    T010 -.-> F10
```

### Task-to-Component Mapping

| Task | Component(s) | Files | Status | Comment |
|------|-------------|-------|--------|---------|
| T001 | Schema | orchestrator-settings.schema.ts | ✅ Done | Added noContext + contextFrom fields |
| T002 | Interface | positional-graph-service.interface.ts | ✅ Done | Added fields to NodeStatusResult |
| T003 | Service | positional-graph.service.ts | ✅ Done | Exposed fields in getNodeStatus() + addNode() |
| T004 | Types | reality.types.ts | ✅ Done | Added fields to NodeReality + ReadinessDetail stub |
| T005 | Builder | reality.builder.ts | ✅ Done | Wired fields from status → reality |
| T006 | Compile check | All above | ✅ Done | pnpm tsc --noEmit passes (2 pre-existing errors) |
| T007 | Tests | agent-context.test.ts | ✅ Done | 20 tests, 6 rules, 7 scenarios, makeRealityFromLines() |
| T008 | Engine | agent-context.ts | ✅ Done | Replaced getContextSource() — ~95 lines, all 20 tests GREEN |
| T009 | Fake | fake-agent-context.ts | ✅ Done | No changes needed — override-map, no rule logic |
| T010 | Cleanup | reality.view.ts, reality.test.ts | ✅ Done | Deleted getFirstAgentOnPreviousLine() + 4 tests |
| T011 | Verification | All | ✅ Done | 274 test files passed, 9 skipped, 0 failures, 92s |

---

## Tasks

| Status | ID | Task | CS | Type | Dependencies | Absolute Path(s) | Validation | Subtasks | Notes |
|--------|------|------|-----|------|-------------|-------------------|-----------|----------|-------|
| [x] | T001 | Add `noContext: z.boolean().default(false)` and `contextFrom: z.string().min(1).optional()` to `NodeOrchestratorSettingsSchema` | 1 | Core | – | `/home/jak/substrate/033-real-agent-pods/packages/positional-graph/src/schemas/orchestrator-settings.schema.ts` | `pnpm tsc --noEmit` passes; schema accepts `{}` (defaults), `{noContext: true}`, `{contextFrom: 'abc'}` | – | Plan 1.1; cross-plan-edit |
| [x] | T002 | Add `noContext?: boolean` and `contextFrom?: string` to `NodeStatusResult` interface | 1 | Core | T001 | `/home/jak/substrate/033-real-agent-pods/packages/positional-graph/src/interfaces/positional-graph-service.interface.ts` | Interface compiles; existing callers unaffected (optional fields) | – | Plan 1.2; cross-plan-edit |
| [x] | T003 | Expose `noContext` and `contextFrom` in `getNodeStatus()` AND `addNode()` — read from `node.config.orchestratorSettings` in getNodeStatus; add `noContext`/`contextFrom` to the cherry-picked settings object in addNode (~line 710) so caller values are persisted | 2 | Core | T001, T002 | `/home/jak/substrate/033-real-agent-pods/packages/positional-graph/src/services/positional-graph.service.ts` | Fields populated: `getNodeStatus()` returns `noContext: false` when not set, and the actual value when set. `addNode()` with `{ orchestratorSettings: { noContext: true } }` persists `noContext: true` to disk. | – | Plan 1.3; cross-plan-edit; surgical change ~line 710 (addNode) + ~line 1091 (getNodeStatus) |
| [x] | T004 | Add `readonly noContext?: boolean` and `readonly contextFrom?: string` to `NodeReality` interface and `ReadinessDetail` (add `contextFromReady?: boolean` stub for Phase 2) | 1 | Core | – | `/home/jak/substrate/033-real-agent-pods/packages/positional-graph/src/features/030-orchestration/reality.types.ts` | Interface compiles; existing spread/destructure patterns unaffected | – | Plan 1.4; cross-plan-edit |
| [x] | T005 | Wire `noContext` and `contextFrom` in reality builder — read from `NodeStatusResult`, set on `NodeReality` | 1 | Core | T002, T003, T004 | `/home/jak/substrate/033-real-agent-pods/packages/positional-graph/src/features/030-orchestration/reality.builder.ts` | Reality snapshot includes `noContext` and `contextFrom` from node status | – | Plan 1.5; cross-plan-edit |
| [x] | T006 | Compile check — verify the full pipeline compiles: schema → service → interface → builder → types | 1 | Setup | T001-T005 | All 5 files above | `pnpm tsc --noEmit` passes with zero errors across entire monorepo | – | Checkpoint before TDD |
| [x] | T007 | Write unit tests for new context engine — all 6 rules (R0-R5), all 7 scenarios from Workshop 03, plus `contextFrom` and parallel-without-noContext edge cases. Write a `makeRealityFromLines()` convenience helper (~10 lines) that accepts nested `[makeLine([makeNode(...)]), ...]` format for cleaner test construction. | 3 | Test | T006 | `/home/jak/substrate/033-real-agent-pods/test/unit/positional-graph/features/030-orchestration/agent-context.test.ts` | Tests written. New-rule tests (R1 noContext, R2 contextFrom, R4 parallel pos>0, R5 global-fallback) FAIL against old engine. R0/guard tests may pass (rules unchanged). Rewrite entire file (replacing 13 old tests). Use existing `makeNode`/`makeLine`/`makeReality` helpers extended with `noContext`/`contextFrom` fields + new `makeRealityFromLines()`. Full Test Doc header. | – | Plan 1.6; cross-plan-edit; TDD RED |
| [x] | T008 | Replace `getContextSource()` body with new 6-rule Global Session + Left Neighbor implementation from Workshop 03 (~70 lines) | 2 | Core | T007 | `/home/jak/substrate/033-real-agent-pods/packages/positional-graph/src/features/030-orchestration/agent-context.ts` | All tests from T007 pass GREEN. `pnpm test -- --run agent-context` passes. | – | Plan 1.7; cross-plan-edit; TDD GREEN |
| [x] | T009 | Update `FakeAgentContextService` to match new rules — keep as override-map but update default fallback behavior if needed | 1 | Core | T008 | `/home/jak/substrate/033-real-agent-pods/packages/positional-graph/src/features/030-orchestration/fake-agent-context.ts` | ODS unit tests still pass: `pnpm test -- --run ods` | – | Plan 1.8; cross-plan-edit |
| [x] | T010 | Delete `getFirstAgentOnPreviousLine()` from `reality.view.ts` (line ~54) and remove its tests from `reality.test.ts` (lines ~1018-1072) | 1 | Cleanup | T008 | `/home/jak/substrate/033-real-agent-pods/packages/positional-graph/src/features/030-orchestration/reality.view.ts`, `/home/jak/substrate/033-real-agent-pods/test/unit/positional-graph/features/030-orchestration/reality.test.ts` | No compile errors; `pnpm test -- --run reality` passes; grep confirms zero references to deleted method | – | Plan 1.9; cross-plan-edit; dead code |
| [x] | T011 | Run full test suite and quality gates | 1 | Verification | T009, T010 | All files | `pnpm test` all pass; `just fft` passes (lint + format + test); `just typecheck` zero new errors | – | Plan 1.10; shakedown checkpoint |

---

## Alignment Brief

### Critical Findings Affecting This Phase

| # | Finding | Constraint/Requirement | Tasks |
|---|---------|----------------------|-------|
| 01 | Single production consumer (`ods.ts:156`) | Interface must stay identical — `ContextSourceResult` 3-variant union unchanged | T008 |
| 02 | NodeReality gap — missing `noContext`/`contextFrom` | Must thread through full pipeline: schema → service → interface → builder → types | T001-T005 |
| 05 | Schema additive | `noContext` defaults to `false`, `contextFrom` defaults to `undefined` — existing graphs unaffected | T001 |
| 06 | FakeAgentContextService is minimal (53-line override-map) | Easy to update; verify ODS tests still pass | T009 |
| 07 | `getFirstAgentOnPreviousLine()` is dead code | Zero production callers confirmed — safe to delete | T010 |
| 10 | Test helpers: `makeNode`, `makeLine`, `makeReality` | Reuse and extend with `noContext`/`contextFrom` fields | T007 |
| 13 | ContextSourceResult is Zod-first, 55-line schema | No changes needed — schema stays identical | T008 |

### ADR Decision Constraints

- **ADR-0006**: CLI-based workflow agent orchestration — context engine is a core component of this architecture
- **ADR-0011**: First-class domain concepts — `noContext` and `contextFrom` follow the pattern: interface → fake → tests → implementation
- **ADR-0012**: Workflow domain boundaries — context logic stays in Orchestration domain (030-orchestration folder), not Agent domain

### PlanPak Placement Rules

All Phase 1 files are **cross-plan-edits** to existing `030-orchestration` module. No new feature folder needed. No new exports needed.

### Invariants & Guardrails

- `IAgentContextService` interface signature MUST NOT change
- `ContextSourceResult` type (3-variant union) MUST NOT change
- `ods.ts` MUST NOT be modified
- `container.ts` DI registration MUST NOT change
- All Zod schema additions MUST have defaults (backward compatible)
- Test helpers (`makeNode`, `makeLine`, `makeReality`) may be extended but existing signatures must still work

### Flow Diagram: Data Pipeline

```mermaid
flowchart LR
    subgraph Storage["Schema & Storage"]
        S1["NodeOrchestratorSettingsSchema<br/>+ noContext: bool<br/>+ contextFrom: string?"]
        S2["node.config.orchestratorSettings<br/>(persisted to disk)"]
    end

    subgraph Service["Service Layer"]
        S3["getNodeStatus()<br/>reads config → returns status"]
        S4["NodeStatusResult<br/>+ noContext?: bool<br/>+ contextFrom?: string"]
    end

    subgraph Reality["Reality Snapshot"]
        S5["reality.builder.ts<br/>maps status → reality"]
        S6["NodeReality<br/>+ noContext?: bool<br/>+ contextFrom?: string"]
    end

    subgraph Engine["Context Engine"]
        S7["getContextSource()<br/>6 rules: R0-R5"]
        S8["ContextSourceResult<br/>inherit | new | not-applicable"]
    end

    subgraph Consumer["Consumer (unchanged)"]
        S9["ods.ts:156<br/>reads context source"]
    end

    S1 --> S2 --> S3 --> S4 --> S5 --> S6 --> S7 --> S8 --> S9
```

### Sequence Diagram: TDD Flow

```mermaid
sequenceDiagram
    participant Dev as Developer
    participant Tests as agent-context.test.ts
    participant Engine as agent-context.ts
    participant Suite as pnpm test

    Note over Dev: T001-T006: Pipeline setup
    Dev->>Dev: Add fields to schema, interface, types, builder
    Dev->>Suite: pnpm tsc --noEmit
    Suite-->>Dev: ✅ Compiles

    Note over Dev: T007: Write tests RED
    Dev->>Tests: Rewrite all 13 tests → 6 rules, 7 scenarios
    Dev->>Suite: pnpm test -- --run agent-context
    Suite-->>Dev: ❌ Tests FAIL (old engine)

    Note over Dev: T008: Replace engine GREEN
    Dev->>Engine: New getContextSource() (~70 lines)
    Dev->>Suite: pnpm test -- --run agent-context
    Suite-->>Dev: ✅ Tests PASS

    Note over Dev: T009-T010: Cleanup
    Dev->>Dev: Update fake, delete dead code
    Dev->>Suite: pnpm test
    Suite-->>Dev: ✅ All pass

    Note over Dev: T011: Final gate
    Dev->>Suite: just fft
    Suite-->>Dev: ✅ Lint + format + test pass
```

### Test Plan (Full TDD — No Fakes, No Mocks)

All tests use real `PositionalGraphReality` objects constructed via `makeNode`/`makeLine`/`makeReality` helpers. No fakes, no mocks for this plan's tests.

**Test file**: `/home/jak/substrate/033-real-agent-pods/test/unit/positional-graph/features/030-orchestration/agent-context.test.ts`

| # | Test Name | Rule | Scenario | Fixtures | Expected |
|---|-----------|------|----------|----------|----------|
| 1 | R0: non-agent → not-applicable | R0 | — | code node | `{ source: 'not-applicable' }` |
| 2 | R0: user-input → not-applicable | R0 | — | user-input node | `{ source: 'not-applicable' }` |
| 3 | R1: noContext → new (serial) | R1 | S6 | serial agent with `noContext: true` | `{ source: 'new' }` |
| 4 | R1: noContext → new (parallel pos 0) | R1 | S3 | parallel agent at pos 0 with `noContext: true` | `{ source: 'new' }` |
| 5 | R2: contextFrom overrides default | R2 | S7 | agent with `contextFrom: 'B'` | `{ source: 'inherit', fromNodeId: 'B' }` |
| 6 | R2: contextFrom targeting non-agent → new (runtime guard) | R2 | — | agent with `contextFrom` pointing to code node | `{ source: 'new' }` |
| 7 | R3: global agent → new | R3 | S1 | first eligible agent in graph | `{ source: 'new' }` |
| 8 | R3: global agent on line > 0 (line 0 has only user-input) | R3 | S3 | user-input on line 0, agent on line 1 | `{ source: 'new' }` |
| 9 | R4: parallel pos > 0 → new | R4 | S4 | parallel agent at pos 1 WITHOUT noContext | `{ source: 'new' }` |
| 10 | R5: pos 0 no left → inherit from global | R5 | S1,S3 | serial agent at pos 0 on line > 0 | `{ source: 'inherit', fromNodeId: '<global>' }` |
| 11 | R5: left walk finds agent → inherit | R5 | S2 | serial agent at pos 2, agent at pos 1 | `{ source: 'inherit', fromNodeId: '<left>' }` |
| 12 | R5: left walk skips code nodes | R5 | — | [code, agent, serial] at pos 0,1,2 | serial at 2 inherits from agent at 1 |
| 13 | R5: left walk inherits from parallel left (absolute rule) | R5 | S5 | [parallel, serial] on same line | serial inherits from parallel |
| 14 | R5: noContext left neighbor — C inherits N's fresh session | R5 | S6 | [B, N(noContext), C] on same line | C inherits from N (sid-2), NOT from B |
| 15 | Scenario 3: E2E pipeline (motivating case) | R1,R3,R5 | S3 | 4-line graph: human→spec→[prog-a,prog-b]→[reviewer,summariser] | reviewer inherits from spec-writer |
| 16 | All agents noContext → every node gets new | R1,R3 | — | graph where every agent has noContext | all return `new` |
| 17 | Guard: nonexistent node → not-applicable | Guard | — | unknown nodeId | `{ source: 'not-applicable' }` |
| 18 | Every result has non-empty reason string | All | — | all above scenarios | `result.reason.length > 0` |

### Implementation Outline (1:1 with Tasks)

1. **T001**: Open `orchestrator-settings.schema.ts`, add 2 Zod fields after `waitForPrevious`
2. **T002**: Open interface file, add 2 optional fields to `NodeStatusResult`
3. **T003**: Open `positional-graph.service.ts`, find `getNodeStatus()` (~line 1091), add 2 lines reading from `node.config.orchestratorSettings`
4. **T004**: Open `reality.types.ts`, add 2 optional fields to `NodeReality`, add optional `contextFromReady` to `ReadinessDetail`
5. **T005**: Open `reality.builder.ts`, add 2 lines mapping from `NodeStatusResult` to `NodeReality`
6. **T006**: Run `pnpm tsc --noEmit` — verify zero errors
7. **T007**: Rewrite `agent-context.test.ts` — delete all 13 old tests, write 18 new tests per test plan. All must FAIL against old engine.
8. **T008**: Replace `getContextSource()` body in `agent-context.ts` with Workshop 03 implementation. Run `pnpm test -- --run agent-context` — all 18 tests must PASS.
9. **T009**: Open `fake-agent-context.ts`, update default behaviour if needed. Run `pnpm test -- --run ods` — ODS tests must pass.
10. **T010**: Delete `getFirstAgentOnPreviousLine()` from `reality.view.ts`. Delete its tests from `reality.test.ts`. Run `pnpm test -- --run reality`.
11. **T011**: Run `just fft` — lint, format, test. All pass.

### Commands to Run

```bash
# Compile check (after T001-T005)
pnpm tsc --noEmit

# Run context engine tests only (T007-T008)
pnpm test -- --run agent-context

# Run ODS tests (T009)
pnpm test -- --run ods

# Run reality tests (T010)
pnpm test -- --run reality

# Full suite + quality gate (T011)
just fft
```

### Risks & Unknowns

| Risk | Severity | Mitigation |
|------|----------|------------|
| Test helper `makeNode`/`makeReality` signatures may not accept `noContext`/`contextFrom` without TS errors | Medium | `makeNode` uses `Partial<NodeReality> & { nodeId: string }` — new optional fields flow through `...overrides` spread. Verify. |
| Old engine forward-compat guards (`'noContext' in node`) may interfere during transition | Low | T008 replaces entire function body — guards replaced with typed field access |
| `getNodeStatus()` may not have access to full `orchestratorSettings` struct | Medium | Research dossier confirms `node.config.orchestratorSettings` is available. Verify at T003. |

### Ready Check

- [x] All task files have absolute paths
- [x] ADR constraints mapped (ADR-0006, ADR-0011, ADR-0012)
- [x] Critical findings referenced in tasks
- [x] Test plan with named tests and expected results
- [x] No time estimates — CS scores only
- [x] PlanPak classification on all tasks (cross-plan-edit)
- [ ] **Awaiting GO from human sponsor**

---

## Phase Footnote Stubs

_Empty — populated by plan-6 during implementation via plan-6a._

| Footnote | Task | Description |
|----------|------|-------------|
| [^ph1-1] | T001-T005 | Schema + type + service pipeline: added noContext/contextFrom to settings schema, NodeStatusResult, NodeReality, reality builder |
| [^ph1-2] | T003 | addNode() cherry-pick fix: new fields were silently dropped (DYK #2) |
| [^ph1-3] | T007-T008 | Context engine rewrite: 20 tests + 6-rule Global Session + Left Neighbor (~95 lines) |
| [^ph1-4] | T010 | Dead code removal: getFirstAgentOnPreviousLine() + 4 tests |
| [^ph1-5] | T011 | Integration test fix: added RUN_INTEGRATION=1 gate to 3 files |

---

## Evidence Artifacts

Implementation evidence will be written to:
- **Execution log**: `docs/plans/039-advanced-e2e-pipeline/tasks/phase-1-context-engine-types-schema-and-rules/execution.log.md`
- **Supporting files**: Any additional evidence in this directory

---

## Discoveries & Learnings

_Populated during implementation by plan-6. Log anything of interest to your future self._

| Date | Task | Type | Discovery | Resolution | References |
|------|------|------|-----------|------------|------------|
| 2026-02-21 | T007 | gotcha | Workshop 03 Scenario 6 was wrong — left walk doesn't skip noContext agents | Fixed in workshop | DYK #1 |
| 2026-02-21 | T003 | gotcha | addNode() silently dropped noContext/contextFrom — cherry-pick object didn't include new fields | Added fields to cherry-pick object in addNode (~line 710) | DYK #2 |
| 2026-02-21 | T007 | insight | "All tests RED" was inaccurate — R0/guard tests pass against both old and new engines (rules unchanged) | 3 tests RED, rest GREEN from start | DYK #3 |
| 2026-02-21 | T011 | workaround | Integration tests timing out at 210s (orchestration-drive, node-event-system-e2e, orchestration-e2e) | Added RUN_INTEGRATION=1 env var gate to all 3 files | DYK #4 |
| 2026-02-21 | T011 | insight | Biome formatter required auto-fix after edits | Normal — just fft handles this | DYK #5 |

**Types**: `gotcha` | `research-needed` | `unexpected-behavior` | `workaround` | `decision` | `debt` | `insight`

**What to log**:
- Things that didn't work as expected
- External research that was required
- Implementation troubles and how they were resolved
- Gotchas and edge cases discovered
- Decisions made during implementation
- Technical debt introduced (and why)
- Insights that future phases should know about

_See also: `execution.log.md` for detailed narrative._

---

## Directory Layout

```
docs/plans/039-advanced-e2e-pipeline/
  ├── advanced-e2e-pipeline-spec.md
  ├── advanced-e2e-pipeline-plan.md
  ├── research-dossier.md
  ├── workshops/
  │   ├── 01-multi-line-qa-e2e-test-design.md
  │   ├── 02-context-backward-walk-scenarios.md  (DEPRECATED)
  │   └── 03-simplified-context-model.md
  └── tasks/
      └── phase-1-context-engine-types-schema-and-rules/
          ├── tasks.md                    ← this file
          ├── tasks.fltplan.md            ← generated by /plan-5b
          └── execution.log.md            ← created by /plan-6
```
