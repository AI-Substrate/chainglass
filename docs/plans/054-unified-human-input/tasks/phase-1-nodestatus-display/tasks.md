# Phase 1: NodeStatusResult + Display Status — Tasks

**Plan**: [unified-human-input-plan.md](../../unified-human-input-plan.md)
**Phase**: Phase 1: NodeStatusResult + Display Status
**Generated**: 2026-02-27
**Status**: Ready

---

## Executive Briefing

**Purpose**: Make user-input node configuration visible to the UI and fix the critical data format mismatch that prevents downstream input resolution. This phase is entirely foundational — no modals, no server actions, just plumbing.

**What We're Building**: Three things: (1) fix `collateInputs` to read Format A data written by `saveOutputData`, (2) refactor `NarrowWorkUnit` and `NodeStatusResult` into discriminated unions so `user_input` config lives on the correct variant type (not the base), and (3) add an `awaiting-input` computed display status to the node card so users can see which nodes need human input. See [Workshop 011](../../workshops/011-discriminated-type-architecture.md) for the type architecture.

**Goals**:
- ✅ `collateInputs` reads both Format A (`{ outputs: { name: value } }`) and flat (`{ name: value }`) — backward compatible
- ✅ `NarrowWorkUnit` and `NodeStatusResult` are proper discriminated unions — `userInput` config lives on the `user-input` variant only (per [Workshop 011](../../workshops/011-discriminated-type-architecture.md))
- ✅ `awaiting-input` display status computed when `unitType === 'user-input'` + `pending` + `ready`
- ✅ Node card shows violet `?` badge for `awaiting-input` nodes
- ✅ TDD for service-layer changes, lightweight tests for UI helpers

**Non-Goals**:
- ❌ No modal — that's Phase 2
- ❌ No server action — that's Phase 2
- ❌ No click-to-open behavior — that's Phase 2 wiring
- ❌ No demo workflows — that's Phase 3

---

## Prior Phase Context

_Phase 1 — no prior phases to review._

---

## Pre-Implementation Check

| File | Exists? | Domain Check | Notes |
|------|---------|-------------|-------|
| `packages/positional-graph/src/services/input-resolution.ts` | ✅ Yes | _platform/positional-graph ✅ | Modify line 352: `data?.[fromOutput]` → `data?.outputs?.[fromOutput] ?? data?.[fromOutput]` |
| `packages/positional-graph/src/interfaces/positional-graph-service.interface.ts` | ✅ Yes | _platform/positional-graph ✅ | Refactor `NarrowWorkUnit` (line 49) into discriminated union + refactor `NodeStatusResult` (line 244) into discriminated union. Per [Workshop 011](../../workshops/011-discriminated-type-architecture.md). |
| `packages/positional-graph/src/services/positional-graph.service.ts` | ✅ Yes | _platform/positional-graph ✅ | Build correct `NodeStatusResult` variant in `getNodeStatus()` at ~line 1115 |
| `packages/positional-graph/src/adapter/instance-workunit.adapter.ts` | ✅ Yes | _platform/positional-graph ✅ | Construct correct `NarrowWorkUnit` variant (line 68) + extend YAML parse type |
| `apps/web/src/features/050-workflow-page/lib/display-status.ts` | ❌ NEW | workflow-ui ✅ | Create in existing `lib/` dir (has 4 files already) |
| `apps/web/src/features/050-workflow-page/components/workflow-node-card.tsx` | ✅ Yes | workflow-ui ✅ | Add `awaiting-input` to `NodeStatus` type (line 18) + `STATUS_MAP` (line 37) |
| `test/unit/positional-graph/test-helpers.ts` | ✅ Yes | test ✅ | Update `createWorkUnit()` + `stubWorkUnitLoader()` for discriminated variants |
| `test/unit/positional-graph/collate-inputs.test.ts` | ✅ Yes | test ✅ | Add Format A test, update fixtures + inline `NarrowWorkUnit` literals |
| `test/unit/web/features/050-workflow-page/*.test.*` | ✅ Yes | test ✅ | Update `makeNode()` helpers for discriminated `NodeStatusResult` variants |

**Concept duplication check**: `awaiting-input` display status is a new concept not present anywhere in the codebase except Plan 054 docs. `display-status.ts` helper pattern matches existing `lib/` utilities (`compute-available-sources.ts`, `context-badge.ts`). No duplication risk.

---

## Architecture Map

```mermaid
flowchart TD
    classDef pending fill:#9E9E9E,stroke:#757575,color:#fff
    classDef platform fill:#E3F2FD,stroke:#2196F3,color:#000
    classDef ui fill:#FFF3E0,stroke:#FF9800,color:#000

    subgraph Platform["_platform/positional-graph"]
        T001["T001: Format A test"]:::pending
        T002["T002: Fix collateInputs"]:::pending
        T003["T003: Update test fixtures"]:::pending
        T004["T004: userInput config test"]:::pending
        T005["T005: NarrowWorkUnit union"]:::pending
        T006["T006: NodeStatusResult union"]:::pending
        T007["T007: Type guards"]:::pending
        T008["T008: Adapter variants"]:::pending
        T009["T009: Populate getNodeStatus"]:::pending
    end

    subgraph Test["Test infrastructure"]
        T010["T010: Test helpers"]:::pending
        T011["T011: Inline literals"]:::pending
        T012["T012: Web test helpers"]:::pending
    end

    subgraph UI["workflow-ui"]
        T013["T013: display-status.ts"]:::pending
        T014["T014: STATUS_MAP + type"]:::pending
        T015["T015: Display status tests"]:::pending
    end

    T001 --> T002
    T002 --> T003
    T004 --> T005
    T005 --> T006
    T006 --> T007
    T005 --> T008
    T008 --> T009
    T006 --> T009
    T005 --> T010
    T006 --> T010
    T010 --> T011
    T006 --> T012
    T009 --> T013
    T013 --> T014
    T014 --> T015
```

---

## Tasks

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [ ] | T001 | TDD: Write collateInputs Format A test | _platform/positional-graph | `/test/unit/positional-graph/collate-inputs.test.ts` | Test: `writeNodeData` with `{ outputs: { spec: { type: 'data', dataType: 'text', value: 'hello' } } }` (Format A), `collateInputs` resolves `spec` output with correct data. Test FAILS before fix. | Per F01. Use existing `writeNodeData` helper. |
| [ ] | T002 | Fix `collateInputs` to read Format A | _platform/positional-graph | `/packages/positional-graph/src/services/input-resolution.ts` | Line 352: `data?.[fromOutput]` → `data?.outputs?.[fromOutput] ?? data?.[fromOutput]`. Test from T001 passes. All existing tests still pass. | One-line fix. Fallback preserves flat format backward compat. |
| [ ] | T003 | Update `writeNodeData` test helper to use Format A | _platform/positional-graph | `/test/unit/positional-graph/collate-inputs.test.ts` | `writeNodeData` wraps data as `{ outputs: { ...data } }`. All existing tests pass with wrapped format. | Standardize on Format A going forward. |
| [ ] | T004 | TDD: Write discriminated NodeStatusResult userInput test | _platform/positional-graph | `/test/unit/positional-graph/` (new or existing node-status test file) | Test: `getNodeStatus()` for `user-input` unit returns `UserInputNodeStatus` with `userInput` config. Narrow with `node.unitType === 'user-input'` to access `node.userInput.prompt`. Agent/code units return `AgentNodeStatus`/`CodeNodeStatus` (no `userInput` field). Test FAILS before implementation. | Test-first per Hybrid TDD. |
| [ ] | T005 | Refactor `NarrowWorkUnit` into discriminated union | _platform/positional-graph | `/packages/positional-graph/src/interfaces/positional-graph-service.interface.ts` | Create `NarrowWorkUnitBase` (slug, inputs, outputs) + `NarrowAgentWorkUnit` (type: 'agent') + `NarrowCodeWorkUnit` (type: 'code') + `NarrowUserInputWorkUnit` (type: 'user-input', userInput config). `NarrowWorkUnit` = union of 3. Build passes. | Per [Workshop 011](../../workshops/011-discriminated-type-architecture.md). Export all types. |
| [ ] | T006 | Refactor `NodeStatusResult` into discriminated union | _platform/positional-graph | `/packages/positional-graph/src/interfaces/positional-graph-service.interface.ts` | Create `NodeStatusResultBase` (all existing common fields + `pendingQuestion?` + `error?`) + `AgentNodeStatus` (unitType: 'agent') + `CodeNodeStatus` (unitType: 'code') + `UserInputNodeStatus` (unitType: 'user-input', userInput config). `NodeStatusResult` = union of 3. Build passes. | Per [Workshop 011](../../workshops/011-discriminated-type-architecture.md). |
| [ ] | T007 | Add type guard functions | _platform/positional-graph | `/packages/positional-graph/src/interfaces/positional-graph-service.interface.ts` | `isNarrowUserInputUnit(unit): unit is NarrowUserInputWorkUnit` and `isUserInputNodeStatus(node): node is UserInputNodeStatus`. Exported. Build passes. | Alongside existing `isUserInputUnit()` guards in workunit types. |
| [ ] | T008 | Update `InstanceWorkUnitAdapter` to construct correct variant | _platform/positional-graph | `/packages/positional-graph/src/adapter/instance-workunit.adapter.ts` | When `type === 'user-input'`, construct `NarrowUserInputWorkUnit` with `userInput` mapped from `unitDef.user_input`. Other types construct `NarrowAgentWorkUnit`/`NarrowCodeWorkUnit`. Extend YAML parse generic type to include `user_input?`. Build passes. | Per [Workshop 011](../../workshops/011-discriminated-type-architecture.md). |
| [ ] | T009 | Populate `userInput` in `getNodeStatus()` — build correct variant | _platform/positional-graph | `/packages/positional-graph/src/services/positional-graph.service.ts` | When loaded unit is `NarrowUserInputWorkUnit`, return `UserInputNodeStatus` with `userInput`. Otherwise return `AgentNodeStatus`/`CodeNodeStatus`. Test from T004 passes end-to-end. | ~Line 1115 return object. Conditional construction. |
| [ ] | T010 | Update test helpers for discriminated variants | _platform/positional-graph + test | `/test/unit/positional-graph/test-helpers.ts`, `/test/e2e/positional-graph-e2e.ts`, `/test/integration/positional-graph/graph-lifecycle.test.ts` | `createWorkUnit()` accepts optional `userInput` config and constructs correct variant. `stubWorkUnitLoader()` supports user-input units. `createTestUnit()` helpers accept `type` param. All existing tests pass. | ~10 test sites. See [Workshop 011](../../workshops/011-discriminated-type-architecture.md) impact table. |
| [ ] | T011 | Update inline `NarrowWorkUnit` literals in test files | test | `/test/unit/positional-graph/collate-inputs.test.ts`, `input-wiring.test.ts`, `status.test.ts`, `can-run.test.ts`, `input-retrieval.test.ts` | All inline `NarrowWorkUnit` object literals satisfy the correct union variant type. `user-input` type literals include `userInput` config. Build passes, all tests pass. | Mechanical — add `userInput` where `type: 'user-input'`. |
| [ ] | T012 | Update web test helpers (`makeNode`, `makeNodeStatus`) | test | `/test/unit/web/features/050-workflow-page/*.test.*`, `/test/unit/positional-graph/features/030-orchestration/*.test.ts` | `makeNode()` and `makeNodeStatus()` helpers produce correct `NodeStatusResult` variant based on `unitType` override. All existing tests pass. | ~6 test files. |
| [ ] | T013 | Create `display-status.ts` helper | workflow-ui | `/apps/web/src/features/050-workflow-page/lib/display-status.ts` | `getDisplayStatus(unitType, status, ready)` returns `'awaiting-input'` when `unitType === 'user-input' && status === 'pending' && ready === true`. Returns original status otherwise. Exported function. | New file in existing `lib/` dir. Pure function. |
| [ ] | T014 | Add `awaiting-input` to `NodeStatus` type + `STATUS_MAP` | workflow-ui | `/apps/web/src/features/050-workflow-page/components/workflow-node-card.tsx` | `NodeStatus` union type includes `'awaiting-input'`. `STATUS_MAP['awaiting-input']` = violet treatment matching `waiting-question` (`#8B5CF6`, violet tailwind classes, `?` icon, "Awaiting Input" label). Build passes. | Lines 18-26 (type) + lines 37-88 (map). |
| [ ] | T015 | Lightweight tests for display status + STATUS_MAP | workflow-ui | `/test/unit/` (new display-status test file) | Tests: (1) `user-input` + `pending` + `ready` → `awaiting-input`. (2) `user-input` + `pending` + NOT ready → `pending`. (3) `agent` + `pending` + `ready` → unchanged. (4) `STATUS_MAP` has `awaiting-input` entry. All pass. | AC-15. Pure function tests — no mocks needed. |

---

## Context Brief

### Key findings from plan

- **F01 (Critical)**: `saveOutputData()` writes `{ outputs: { name: value } }` but `collateInputs()` reads `data[name]` (flat). Tasks T001-T003 fix this with a one-line fallback + fixture update.
- **F02 (High)**: Node lifecycle requires explicit `raiseNodeEvent('node:accepted')` to transition to `agent-accepted`. Relevant to Phase 2 server action — no direct impact on Phase 1.
- **F03 (High)**: `NodeStatusResult` has no `userInput` config. Tasks T004-T008 fix this by extending interface, adapter, and service.
- **F04 (Medium)**: Orchestration safety confirmed — 4 layers prevent interference with user-input nodes. No changes needed.

### Domain dependencies

- `_platform/positional-graph`: `IPositionalGraphService.getNodeStatus()` — the API we extend with `userInput`
- `_platform/positional-graph`: `collateInputs()` in `input-resolution.ts` — the function we fix for Format A
- `_platform/positional-graph`: `NarrowWorkUnit` interface — the contract we extend with `userInput`
- `_platform/positional-graph`: `InstanceWorkUnitAdapter` — maps unit.yaml → `NarrowWorkUnit`

### Domain constraints

- `NarrowWorkUnit` is refactored from a single interface into a discriminated union (`NarrowAgentWorkUnit | NarrowCodeWorkUnit | NarrowUserInputWorkUnit`). Base type `NarrowWorkUnitBase` stays lean — no type-specific config. Per [Workshop 011](../../workshops/011-discriminated-type-architecture.md).
- `NodeStatusResult` is refactored similarly — `NodeStatusResultBase` has all common fields, `UserInputNodeStatus` carries `userInput`. Per [Workshop 011](../../workshops/011-discriminated-type-architecture.md).
- `display-status.ts` is a pure function — no server imports, no service dependencies. It computes display status from primitive inputs.
- `workflow-node-card.tsx` `NodeStatus` type and `STATUS_MAP` must stay in sync.

### Reusable from prior phases

- `writeNodeData` helper in `collate-inputs.test.ts` (line 51) — reuse for Format A test
- `writeState` helper in same file — reuse for setting node status
- FakeFileSystem / FakePathResolver from `@chainglass/shared` — already used in all positional-graph tests
- Existing user-input unit fixtures in `test/unit/positional-graph/` — may exist from Plan 029 agentic work units

### System state flow

```mermaid
flowchart LR
    A["unit.yaml<br/>(user_input config)"] --> B["InstanceWorkUnitAdapter<br/>(parse + construct variant)"]
    B --> C["NarrowUserInputWorkUnit<br/>(discriminated union variant)"]
    C --> D["getNodeStatus()<br/>(build correct status variant)"]
    D --> E["UserInputNodeStatus<br/>(discriminated union variant)"]
    E --> F["getDisplayStatus()<br/>(compute awaiting-input)"]
    F --> G["workflow-node-card<br/>(violet badge)"]
```

### Data format fix flow

```mermaid
sequenceDiagram
    participant SA as Server Action (Phase 2)
    participant SVC as saveOutputData()
    participant DJ as data.json
    participant CI as collateInputs()
    participant DN as Downstream Node

    SA->>SVC: save("spec", "hello")
    SVC->>DJ: { outputs: { spec: "hello" } }
    Note over DJ: Format A (wrapped)
    CI->>DJ: loadNodeData()
    DJ-->>CI: { outputs: { spec: "hello" } }
    Note over CI: data?.outputs?.["spec"] ?? data?.["spec"]
    CI-->>DN: data = "hello" ✅
```

---

## Discoveries & Learnings

_Populated during implementation by plan-6._

| Date | Task | Type | Discovery | Resolution | References |
|------|------|------|-----------|------------|------------|

