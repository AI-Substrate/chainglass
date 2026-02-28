# Phase 3: Demo + Integration + Cleanup — Tasks

**Plan**: [unified-human-input-plan.md](../../unified-human-input-plan.md)
**Phase**: Phase 3: Demo + Integration + Cleanup
**Generated**: 2026-02-28
**Status**: Ready

---

## Executive Briefing

**Purpose**: Make user-input nodes discoverable via `just dope` demo workflows, add integration tests proving end-to-end data flow, and handle the malformed-config error case. After Phase 3, a developer can run `just dope` and immediately interact with user-input nodes, the test suite covers the full submit → complete → downstream-gates-open path, and malformed units show a helpful error instead of a broken modal.

**What We're Building**: (1) A `demo-user-input` dope scenario with a single user-input node in ready/awaiting-input state, (2) a `demo-multi-input` scenario with 3 user-input nodes on one line demonstrating different input types, (3) an integration test exercising the full lifecycle through to downstream gate resolution, (4) error-state handling in the modal/editor for missing `user_input` config, and (5) Next.js MCP validation of zero errors.

**Goals**:
- ✅ `just dope` creates demo workflows with user-input nodes in awaiting-input state
- ✅ Multi-node composition pattern demonstrated (3 user-input nodes → downstream)
- ✅ Integration test proves submit → complete → downstream `inputsAvailable: true`
- ✅ Malformed user-input units show a clear error state, not a broken modal
- ✅ Next.js MCP reports zero errors on all routes

**Non-Goals**:
- ❌ No new features — this is demo, test, and polish only
- ❌ No changes to the modal, server action, or display status from Phase 2
- ❌ No browser-based E2E tests (per testing strategy)

---

## Prior Phase Context

### Phase 1: NodeStatusResult + Display Status

**A. Deliverables**:
- `packages/positional-graph/src/interfaces/positional-graph-service.interface.ts` — Discriminated unions for `NarrowWorkUnit` (3 variants) and `NodeStatusResult` (3 variants)
- `packages/positional-graph/src/services/input-resolution.ts` — Format A fallback fix (line 352)
- `packages/positional-graph/src/adapter/instance-workunit.adapter.ts` — Constructs `NarrowUserInputWorkUnit` with fail-fast on malformed config
- `apps/web/src/features/050-workflow-page/lib/display-status.ts` — `getDisplayStatus()` computing `awaiting-input`
- `apps/web/src/features/050-workflow-page/components/workflow-node-card.tsx` — `awaiting-input` in `NodeStatus` type + `STATUS_MAP`

**B. Dependencies Exported**:
- `UserInputNodeStatus.userInput: { prompt, inputType, outputName, options?, default? }` — modal reads this
- `isUserInputNodeStatus(node)` type guard
- `getDisplayStatus(unitType, status, ready)` returns `'awaiting-input'`

**C. Gotchas & Debt**:
- `awaiting-input` is UI-only — never in state.json
- Structural typing means test objects without `userInput` silently satisfy `NarrowAgentWorkUnit`
- `getDisplayStatus` checks both `'pending'` AND `'ready'` statuses — engine computes `ready` when `canRun` is true

**D. Incomplete Items**: None — all tasks complete.

**E. Patterns to Follow**:
- Discriminated union narrowing: `if (node.unitType === 'user-input') { node.userInput.prompt }`
- Pure functions for computed display states
- Server action pattern from `answerQuestion`: resolve ctx → resolve svc → call methods → check errors → `reloadStatus()`

### Phase 2: Human Input Modal + Server Action

**A. Deliverables**:
- `apps/web/src/features/050-workflow-page/components/human-input-modal.tsx` — Full modal with 4 input types + freeform + pre-fill
- `apps/web/app/actions/workflow-actions.ts` — `submitUserInput` (line 539), `resetUserInput` (line 580), `loadUserInputData` (line 604)
- `apps/web/src/features/050-workflow-page/components/workflow-editor.tsx` — Modal wiring, click routing, atomic reset+submit
- `apps/web/src/features/050-workflow-page/components/workflow-node-card.tsx` — "Provide Input" button on card
- `apps/web/src/features/050-workflow-page/components/node-properties-panel.tsx` — "Provide Input..." button

**B. Dependencies Exported**:
- `submitUserInput(ws, graph, nodeId, outputName, value, worktreePath)` — server action
- `resetUserInput(ws, graph, nodeId, worktreePath)` — fires `node:restart` from complete
- `loadUserInputData(ws, graph, nodeId, outputName, worktreePath)` — loads previous answer for pre-fill
- `HumanInputModal` component with `HumanInputModalProps`

**C. Gotchas & Debt**:
- `node:accepted` requires source `'executor'`, not `'human'` (E192 error)
- `node:restart` now allowed from `'complete'` state (added to VALID_FROM_STATES)
- Reset happens at submit time, NOT modal open — cancel preserves complete state
- `loadUserInputData` reads from `getOutputData` → `result.value` (NOT `result.data`)
- The web app uses `WorkUnitService` (via DI), NOT `InstanceWorkUnitAdapter` — critical `userInput` camelCase mapping was required

**D. Incomplete Items**: None — all 8 tasks + re-edit, pre-fill, card button extras complete.

**E. Patterns to Follow**:
- Dope scenarios pattern: `SCENARIOS` array with `{ slug, description, build }` objects
- `UNIT_USER_INPUT = 'sample-input'` constant already defined in dope-workflows.ts
- `injectState()` helper for setting node status
- Test lifecycle from `submit-user-input-lifecycle.test.ts`: create graph → wire inputs → walk lifecycle → assert downstream

---

## Pre-Implementation Check

| File | Exists? | Domain Check | Notes |
|------|---------|-------------|-------|
| `scripts/dope-workflows.ts` | ✅ Yes | workflow-ui ✅ | Add 2 new scenarios to `SCENARIOS` array. `UNIT_USER_INPUT = 'sample-input'` already defined. |
| `.chainglass/units/sample-input/unit.yaml` | ✅ Yes | workflow-ui ✅ | Existing unit — text input type. Need 2-3 more units for multi-input demo (different question types). |
| `apps/web/src/features/050-workflow-page/components/human-input-modal.tsx` | ✅ Yes | workflow-ui ✅ | Add error guard for missing/malformed `userInput` prop |
| `apps/web/src/features/050-workflow-page/components/workflow-editor.tsx` | ✅ Yes | workflow-ui ✅ | Add error guard in `openHumanInputModal` for missing `node.userInput` |
| `test/unit/positional-graph/submit-user-input-lifecycle.test.ts` | ✅ Yes | test ✅ | Existing file — add integration-style test for multi-node composition |

**Concept duplication check**: Demo scenarios follow established `SCENARIOS` pattern — no new concepts. Error state is a guard, not a new component. Integration test extends existing lifecycle test file.

---

## Architecture Map

```mermaid
flowchart TD
    classDef pending fill:#9E9E9E,stroke:#757575,color:#fff
    classDef completed fill:#4CAF50,stroke:#388E3C,color:#fff

    subgraph Phase1["Phase 1 (complete)"]
        P1["Discriminated unions"]:::completed
        P2["Display status"]:::completed
    end

    subgraph Phase2["Phase 2 (complete)"]
        P3["HumanInputModal"]:::completed
        P4["submitUserInput action"]:::completed
        P5["Editor wiring"]:::completed
    end

    subgraph Phase3["Phase 3: Demo + Integration + Cleanup"]
        T001["T001: demo-user-input scenario"]:::pending
        T002["T002: Multi-input demo units"]:::pending
        T003["T003: demo-multi-input scenario"]:::pending
        T004["T004: Integration test"]:::pending
        T005["T005: Error state guard"]:::pending
        T006["T006: Next.js MCP validation"]:::pending
    end

    P4 -->|"lifecycle pattern"| T001
    P5 -->|"wiring pattern"| T003
    P4 -->|"lifecycle test"| T004
    P3 -->|"error handling"| T005
    T002 --> T003
    T001 --> T006
    T003 --> T006
```

---

## Tasks

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [ ] | T001 | Add `demo-user-input` dope scenario | workflow-ui | `/scripts/dope-workflows.ts` | `just dope demo-user-input` creates a 2-line workflow: Line 0 has a `sample-input` (user-input) node, Line 1 has a `sample-coder` (agent) node wired to the user-input's output. No state injection — node starts at `pending`, becomes `ready`/`awaiting-input` at runtime because it's first on Line 0 with no gates. | AC-14. Follow `demo-serial` pattern. `UNIT_USER_INPUT` constant already exists. |
| [ ] | T002 | Create sample user-input units for multi-input demo | workflow-ui | `/.chainglass/units/sample-choice/unit.yaml`, `/.chainglass/units/sample-confirm/unit.yaml` | Two new committed units: `sample-choice` (question_type: single, with options) and `sample-confirm` (question_type: confirm). Both follow `sample-input` pattern. | Needed by T003. Minimal unit.yaml files — type, prompt, outputs, user_input config. |
| [ ] | T003 | Add `demo-multi-input` dope scenario | workflow-ui | `/scripts/dope-workflows.ts` | `just dope demo-multi-input` creates a workflow with Line 0 having 3 user-input nodes (`sample-input` text, `sample-choice` single, `sample-confirm` confirm), and Line 1 with a `sample-coder` wired to all 3 outputs. Demonstrates composition pattern (multiple questions = multiple nodes). | Multi-node composition. Depends on T002 for units. |
| [ ] | T004 | Integration test: submit → complete → downstream gates open | test | `/test/unit/positional-graph/submit-user-input-lifecycle.test.ts` | New test in existing file: 3 user-input nodes on Line 0 (different types), 1 downstream node on Line 1 wired to all 3 outputs. Submit all 3 → all complete → downstream `ready: true, inputsAvailable: true`. Proves multi-node composition works. | AC-16. Extend existing `describe('submitUserInput lifecycle')` block. Real filesystem fixture (no mocks). |
| [ ] | T005 | Error state for missing `user_input` config | workflow-ui | `/apps/web/src/features/050-workflow-page/components/human-input-modal.tsx`, `/apps/web/src/features/050-workflow-page/components/workflow-editor.tsx` | If `userInput` is falsy/missing in modal props → render error message ("This node is not configured for user input") instead of broken form. Editor `openHumanInputModal` guard: if `node.userInput` undefined, show toast error and don't open modal. | AC-11. Defensive guard — malformed units already fail-fast in adapter (Phase 1), but guard the UI layer too. |
| [ ] | T006 | Verify via Next.js MCP: zero errors, routes work | workflow-ui | N/A | Start dev server, query Next.js MCP `get_errors` → 0 errors. Navigate to workflow page with doped user-input workflows → renders correctly. | Final validation. Non-blocking if MCP not available — fallback to `pnpm build` clean. |

---

## Context Brief

### Key findings from plan

- **F01 (Critical)**: Format A mismatch — **FIXED in Phase 1**. `collateInputs` reads `data?.outputs?.[name] ?? data?.[name]`.
- **F02 (High)**: Lifecycle sequence `startNode → accept → saveOutputData → endNode` — **IMPLEMENTED in Phase 2**. Used by `submitUserInput` server action.
- **F04 (Medium)**: Orchestration safety — 4 layers prevent interference with user-input nodes. **No changes needed** for demo workflows.

### Domain dependencies

- `workflow-ui`: `dope-workflows.ts` scenario pattern — add scenarios to `SCENARIOS` array
- `_platform/positional-graph`: `IPositionalGraphService` — used by dope script for graph creation
- `_platform/positional-graph`: `collateInputs` / input resolution — tested by integration test (downstream gates)
- `workflow-ui`: `HumanInputModal` — add error guard for missing config

### Domain constraints

- Dope scenarios use `createScriptServices()` — a lightweight DI container separate from web bootstrap
- `UNIT_USER_INPUT = 'sample-input'` already defined; new units need committed `.chainglass/units/` directories
- Integration test uses `FakeFileSystem` + `FakePathResolver` (per Phase 2 lifecycle test pattern)
- Error guard in modal must not change the happy path — conditional rendering only

### Reusable from prior phases

- `UNIT_USER_INPUT = 'sample-input'` in `dope-workflows.ts`
- `injectState()` helper for state injection (though demo-user-input may not need it)
- Lifecycle test setup from `submit-user-input-lifecycle.test.ts`: `createFakeUnitLoader`, `createTestService`, `createTestContext`
- `demo-serial` scenario pattern: create graph → add lines → add nodes → wire inputs
- `assertDefined()` helper for safe ID extraction

### Dope scenario flow

```mermaid
flowchart LR
    A["just dope"] --> B["dope-workflows.ts"]
    B --> C["createScriptServices()"]
    C --> D["PositionalGraphService"]
    D --> E["create graph + add nodes"]
    E --> F["injectState() (optional)"]
    F --> G["Workflow in .chainglass/data/workflows/"]
```

### Integration test flow

```mermaid
sequenceDiagram
    participant Test
    participant Svc as PositionalGraphService
    participant CI as collateInputs

    Test->>Svc: create graph, 3 user-input + 1 downstream
    Test->>Svc: wire downstream inputs to user-input outputs
    loop For each user-input node
        Test->>Svc: startNode → accept → saveOutputData → endNode
    end
    Test->>Svc: getNodeStatus(downstream)
    Svc->>CI: collateInputs for downstream
    CI-->>Svc: all 3 inputs available
    Svc-->>Test: ready: true, inputsAvailable: true ✅
```

### Error state guard flow

```mermaid
flowchart TD
    A["User clicks user-input node"] --> B{"node.userInput defined?"}
    B -->|Yes| C["Open HumanInputModal"]
    B -->|No| D["Toast: 'Node not configured for input'"]
    C --> E{"userInput prop valid?"}
    E -->|Yes| F["Render form"]
    E -->|No| G["Render error message"]
```

---

## Discoveries & Learnings

_Populated during implementation by plan-6._

| Date | Task | Type | Discovery | Resolution | References |
|------|------|------|-----------|------------|------------|

---

## Directory Layout

```
docs/plans/054-unified-human-input/
  ├── unified-human-input-plan.md
  ├── unified-human-input-spec.md
  ├── workshops/
  │   ├── 010-single-question-simplification.md
  │   ├── 011-discriminated-type-architecture.md
  │   ├── 012-output-name-flow.md
  │   └── 013-re-edit-ux.md
  └── tasks/
      ├── phase-1-nodestatus-display/
      │   ├── tasks.md
      │   ├── tasks.fltplan.md
      │   └── execution.log.md
      ├── phase-2-human-input-modal/
      │   ├── tasks.md
      │   ├── tasks.fltplan.md
      │   └── execution.log.md
      └── phase-3-demo-integration-cleanup/
          ├── tasks.md              ← you are here
          ├── tasks.fltplan.md
          └── execution.log.md     # created by plan-6
```
