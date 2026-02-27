# Unified Human Input — Implementation Plan

**Plan Version**: 1.0.0
**Created**: 2026-02-27
**Spec**: [unified-human-input-spec.md](./unified-human-input-spec.md)
**Status**: DRAFT
**Mode**: Full
**Complexity**: CS-3 (medium) — S=1, I=0, D=1, N=1, F=0, T=1

## Summary

User-input nodes in the workflow editor currently have no input mechanism — they sit at `pending` status forever. This plan makes them functional by: (1) extending `NodeStatusResult` to surface unit config and output save state, (2) adding computed display statuses (`awaiting-input`, `partially-filled`) to the node card, (3) building a Human Input modal for user-input nodes (replacing the deprecated engine Q&A protocol with a pure web-layer approach), and (4) creating server actions that walk the existing positional-graph lifecycle (`startNode` → `node:accepted` → `endNode`) to submit user-input data. Multi-output nodes support per-field partial saves with persistence between modal sessions.

> **Architectural note**: The engine's Q&A protocol (`askQuestion`/`answerQuestion`/`getAnswer` on `IPositionalGraphService`) is deprecated scaffolding — never integrated into real agent execution. Human input collection is a **web-layer concern**. Plan 054 does NOT use the engine Q&A methods. Instead, server actions write directly to `data.json` via `IFileSystem` and walk the node lifecycle. The existing `answerQuestion` server action in `workflow-actions.ts` only services pre-baked dope demo questions and is also deprecated territory.

## Target Domains

| Domain | Status | Relationship | Role |
|--------|--------|-------------|------|
| workflow-ui | existing | **modify** | Extend modal, add display statuses, server actions, node card routing, properties panel |
| _platform/positional-graph | existing | **modify** (minor) | Extend `NodeStatusResult` with `userInput` config + `savedOutputCount`. No new service methods. |
| _platform/events | existing | **consume** | SSE broadcasts status changes (no changes) |

## Domain Manifest

| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| `packages/positional-graph/src/interfaces/positional-graph-service.interface.ts` | _platform/positional-graph | contract | Extend `NodeStatusResult` with `userInput` and `savedOutputCount` fields |
| `packages/positional-graph/src/services/positional-graph.service.ts` | _platform/positional-graph | internal | Populate new `NodeStatusResult` fields from unit.yaml + data.json |
| `packages/positional-graph/src/services/input-resolution.ts` | _platform/positional-graph | internal | Fix `collateInputs` to read wrapped data.json format (Format A). See Workshop 008. |
| `apps/web/src/features/050-workflow-page/components/qa-modal.tsx` | workflow-ui | internal | Refactor into `HumanInputModal` — user-input mode only. Agent question mode (`pendingQuestion`) is deprecated scaffolding and NOT extended. |
| `apps/web/src/features/050-workflow-page/components/workflow-node-card.tsx` | workflow-ui | internal | Add `awaiting-input` + `partially-filled` to STATUS_MAP, click routing |
| `apps/web/src/features/050-workflow-page/components/node-properties-panel.tsx` | workflow-ui | internal | Add Outputs section, "Provide Input..." button |
| `apps/web/src/features/050-workflow-page/components/workflow-editor.tsx` | workflow-ui | internal | Wire modal routing for user-input nodes |
| `apps/web/src/features/050-workflow-page/lib/display-status.ts` | workflow-ui | internal | NEW — display status computation helper |
| `apps/web/app/actions/workflow-actions.ts` | workflow-ui | internal | Add `submitUserInput` + `saveUserInputField` server actions |
| `scripts/dope-workflows.ts` | workflow-ui | internal | Add user-input demo scenarios |
| `test/unit/positional-graph/node-status-user-input.test.ts` | _platform/positional-graph | internal | TDD for NodeStatusResult extension |
| `test/unit/web/features/050-workflow-page/human-input-modal.test.ts` | workflow-ui | internal | Modal rendering + mode tests |
| `test/unit/web/features/050-workflow-page/display-status.test.ts` | workflow-ui | internal | Display status computation tests |

## Key Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| F01 | Critical | **data.json format mismatch**: `saveOutputData()` writes Format A (`{ outputs: { name: value } }`), but `collateInputs()` reads flat (`data[name]`). Production write→read path is broken. See [Workshop 008](./workshops/008-save-persistence-strategy.md). | Phase 1 fixes `collateInputs` with one-line fallback: `data?.outputs?.[name] ?? data?.[name]`. All Plan 054 writes use Format A. |
| F02 | Critical | `saveOutputData()` requires `agent-accepted` status (guard at line 1655). Cannot save partial outputs before walking the lifecycle. | All writes go directly to data.json via `IFileSystem`. Node stays `pending` during partial saves. `Complete` walks lifecycle: `startNode` → `accept` → `endNode` (`canEnd` validates outputs on disk). |
| F03 | High | Node lifecycle requires explicit `raiseNodeEvent('node:accepted')` to transition `starting` → `agent-accepted`. | Server action calls `startNode()` then `raiseNodeEvent('node:accepted', {}, 'human')` then `endNode()`. Outputs already on disk before lifecycle. |
| F04 | High | `NodeStatusResult` has no `userInput` config — only `unitType`. | Phase 1 extends the interface and populates from unit.yaml during `getNodeStatus()`. |
| F05 | Medium | Orchestration safety: ONBAS skips user-input type (line 95) + skips agent-accepted (line 84). ODS skips user-input (line 80). 4 layers, all tested. | No risk. No changes needed. |
| F06 | Low | FakePositionalGraphService needs extension for user-input test scenarios. | Phase 4 extends the fake. |

## Phases

### Phase 1: NodeStatusResult Extension + Display Status

**Objective**: Surface user-input config and output save state in the graph status API, and add computed display statuses to the node card.
**Domain**: `_platform/positional-graph` (modify) + `workflow-ui` (modify)
**Delivers**:
- `NodeStatusResult.userInput` field populated from unit.yaml for user-input nodes
- `NodeStatusResult.savedOutputCount` + `requiredOutputCount` computed from data.json
- `display-status.ts` helper computing `awaiting-input` / `partially-filled`
- `STATUS_MAP` additions in node card
- TDD tests for NodeStatusResult extension
**Depends on**: None
**Key risks**: Extending the positional-graph interface is a contract change; must be backward-compatible (optional fields only).

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 1.1 | Fix `collateInputs` to read wrapped format (Format A) | _platform/positional-graph | `data?.outputs?.[fromOutput] ?? data?.[fromOutput]` — reads Format A, falls back to flat for backward compat | One-line fix in input-resolution.ts line 352. Per Workshop 008 F01. |
| 1.2 | Update `collate-inputs.test.ts` to use Format A fixtures | _platform/positional-graph | Existing tests pass with wrapped format; backward compat verified via fallback | Update writeNodeData to write `{ outputs: { name: value } }` |
| 1.3 | Extend `NodeStatusResult` interface with `userInput` config | _platform/positional-graph | Interface has optional `userInput?: { prompt, questionType, options?, defaultValue? }` field | Per F04 |
| 1.4 | Extend `NodeStatusResult` with `savedOutputCount` + `requiredOutputCount` | _platform/positional-graph | Interface has optional `savedOutputCount?: number`, `requiredOutputCount?: number` fields | For multi-output progress |
| 1.5 | Populate `userInput` in `getNodeStatus()` from loaded WorkUnit | _platform/positional-graph | Unit test: user-input node returns config; agent/code nodes return undefined | Service already loads unit at line 1041 |
| 1.6 | Populate `savedOutputCount` from data.json scan | _platform/positional-graph | Unit test: node with 2/3 outputs saved returns `{ savedOutputCount: 2, requiredOutputCount: 3 }` | Read data.json outputs keys, compare to unit required outputs |
| 1.7 | Create `display-status.ts` helper | workflow-ui | `getDisplayStatus()` maps `user-input` + `pending` + `ready` → `awaiting-input`; with partial saves → `partially-filled` | Per Workshop 007 |
| 1.8 | Add `awaiting-input` + `partially-filled` to `STATUS_MAP` | workflow-ui | Node card renders violet badge with correct label for both statuses | Per Workshop 007 status config |
| 1.9 | Update node card click routing for `awaiting-input` | workflow-ui | Clicking `awaiting-input` or `partially-filled` node fires `onQuestionClick` handler | Whole card is click target for user-input nodes |
| 1.10 | TDD tests for 1.1–1.6 | _platform/positional-graph | Tests pass: collateInputs reads Format A, user-input config surfaced, output counts computed | New test file + updated existing |
| 1.11 | Lightweight tests for 1.7–1.9 | workflow-ui | Display status computation returns correct values for all combinations | New test file |

### Phase 2: Human Input Modal — Single Output

**Objective**: Build a Human Input modal for user-input nodes. This is a new modal, not a refactor of the deprecated QA modal.
**Domain**: `workflow-ui` (modify)
**Delivers**:
- New `HumanInputModal` component for user-input nodes
- "Human Input" header, unit slug + icon, output name + type badge
- Single-output layout with prompt from unit.yaml config
- Properties panel "Provide Input..." button
**Depends on**: Phase 1 (display status + NodeStatusResult extension)
**Key risks**: None significant — new component, no refactoring of deprecated code.

> **Note**: The existing `QAModal` + `answerQuestion` server action are deprecated scaffolding for pre-baked dope demo questions. Plan 054 does NOT extend or refactor them. The `HumanInputModal` is a separate component with its own server actions.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 2.1 | Create `HumanInputModal` component | workflow-ui | Modal renders prompt from `userInput` config, input field matching question type, freeform textarea | New file, does not modify qa-modal.tsx |
| 2.2 | Modal header: "Human Input" with unit slug + icon | workflow-ui | Header shows "Human Input", unit slug, 👤 icon | Per Workshop 007 |
| 2.3 | Single-output layout: output name + type badge above prompt | workflow-ui | Output name shown in uppercase with type pill (e.g., `SPEC  text`); prompt below | Per Workshop 007 |
| 2.4 | Wire modal routing in `workflow-editor.tsx` | workflow-ui | `awaiting-input`/`partially-filled` nodes open `HumanInputModal`; deprecated `waiting-question` nodes continue to open legacy `QAModal` | Separate code paths, no shared modal |
| 2.5 | Update properties panel: Outputs section + "Provide Input..." button | workflow-ui | User-input nodes show output save state and "Provide Input..." button instead of "Edit Properties..." | Per Workshop 007 panel layout |
| 2.6 | Modal rendering tests for single-output | workflow-ui | Modal renders prompt, input field, freeform textarea | |

### Phase 3: Server Actions + Single-Output Lifecycle

**Objective**: Create the server action that walks the full lifecycle to submit user-input data, wiring it to the modal.
**Domain**: `workflow-ui` (modify) + `_platform/positional-graph` (consume)
**Delivers**:
- `submitUserInput` server action (startNode → accept → saveOutputData → endNode)
- Modal onSubmit wired to server action
- Downstream node gates open after submission
- Demo workflow with user-input node in ready state
- TDD for lifecycle walkthrough
**Depends on**: Phase 2 (modal exists and can render user-input mode)
**Key risks**: Four-step lifecycle must be atomic. If `endNode` fails (e.g., missing output), node is stuck in `agent-accepted`. Mitigation: error recovery in server action.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 3.1 | Create `submitUserInput` server action | workflow-ui | Action writes output to data.json via `IFileSystem` (Format A), then calls `startNode` → `raiseNodeEvent('node:accepted')` → `endNode`; returns updated `GraphStatusResult` | Per Workshop 008 sequence diagram |
| 3.2 | Wire modal `onSubmit` to `submitUserInput` for single-output | workflow-ui | Clicking Submit in user-input mode calls action; node transitions to complete; modal closes | |
| 3.3 | Error handling: lifecycle rollback on failure | workflow-ui | If `endNode` fails, node stays in `agent-accepted` with data saved; error displayed in toast | Per F04 |
| 3.4 | Verify downstream gates open after submission | workflow-ui | After user-input completes, downstream node's `inputsAvailable` gate passes | AC-09; collateInputs reads data.json |
| 3.5 | Update `dope-workflows.ts`: add user-input demo scenario | workflow-ui | `just dope` creates `demo-user-input` workflow with user-input node in ready state | AC-14 |
| 3.6 | TDD: lifecycle walkthrough test | _platform/positional-graph | Test: startNode + accept + saveOutputData + endNode succeeds for user-input unit type | Real filesystem fixture test |
| 3.7 | Integration test: submit → complete → downstream gates | workflow-ui | Test: submit user input → node complete → downstream node inputs available | AC-16 |

### Phase 4: Multi-Output Support + Final Integration

**Objective**: Extend the modal to support multi-output user-input nodes with per-field saves and partial state persistence.
**Domain**: `workflow-ui` (modify)
**Delivers**:
- Multi-output form layout in modal (one field per output)
- Per-field save via direct filesystem write (data.json)
- Partial save state tracking and pre-population on re-open
- "Complete ✓" button enabled when all required outputs saved
- Complete button walks lifecycle (startNode → accept → endNode, outputs already in data.json)
- Comprehensive tests
**Depends on**: Phase 3 (single-output lifecycle working)
**Key risks**: Per-field saves write directly to `data.json` via `IFileSystem`, bypassing `saveOutputData()` guard (which requires `agent-accepted`). This is intentional — partial saves happen before the node starts its lifecycle. `endNode`'s `canEnd()` validation confirms all outputs exist.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 4.1 | Multi-output form layout in modal | workflow-ui | Modal shows one field per output with per-field `[Save]` buttons; primary output uses `user_input.prompt`, others use `description` | Per Workshop 007 |
| 4.2 | `saveUserInputField` server action | workflow-ui | Writes single output to `nodes/{id}/data/data.json` via `IFileSystem`; returns updated save count | Per F01 — bypasses service guard for partial saves |
| 4.3 | Pre-populate modal from saved data.json on re-open | workflow-ui | Opening modal for partially-filled node shows previously saved values | AC-19 |
| 4.4 | Progress counter in badge and modal header | workflow-ui | Badge: "N/M filled"; Modal header: "N/M saved" | AC-18 |
| 4.5 | "Complete ✓" button: walk lifecycle when all required outputs saved | workflow-ui | Button enabled only when `savedOutputCount >= requiredOutputCount`; calls `startNode` → `accept` → `endNode` | Per F04 — canEnd validates outputs |
| 4.6 | Error state: missing unit.yaml `user_input` config | workflow-ui | Modal shows configuration error message for malformed units | AC-11 |
| 4.7 | Extend FakePositionalGraphService for user-input tests | workflow-ui | Fake supports `startNode`, `raiseNodeEvent`, `saveOutputData`, `endNode` call tracking | Per F06 |
| 4.8 | Unit tests: multi-output modal, partial save, pre-population | workflow-ui | Tests cover: N fields rendered, save per field, re-open with saved values, Complete enabled at N/N | AC-17, AC-18, AC-19, AC-20 |
| 4.9 | Display status computation tests | workflow-ui | Tests: all combinations of unitType × status × ready × savedOutputCount | AC-15 |

## Acceptance Criteria

### Node Display & Interaction
- [ ] **AC-01**: `user-input` + `pending` + `ready` → violet `?` badge, "Awaiting Input" label
- [ ] **AC-02**: `user-input` + `pending` + NOT `ready` → gray `pending` treatment
- [ ] **AC-03**: Click `awaiting-input` node → Human Input modal with unit.yaml config
- [ ] **AC-04**: Modal header: "Human Input" with unit slug + type icon
- [ ] **AC-05**: All 4 question types render from unit.yaml: text, single, multi, confirm
- [ ] **AC-06**: Freeform textarea appears for user-input nodes

### Data Submission & Storage
- [ ] **AC-07**: Submit writes to `nodes/{id}/data/data.json` via `IFileSystem` (Format A)
- [ ] **AC-08**: After all required outputs filled, node → `complete` via full lifecycle
- [ ] **AC-09**: Downstream `from_node` input resolution sees `inputsAvailable: true`
- [ ] **AC-10**: Freeform notes preserved in output data

### Robustness
- [ ] **AC-11**: Missing `user_input` config → error state in modal
- [ ] **AC-12**: Cancel/Escape → no data change, no status change

### Demo & Testing
- [ ] **AC-14**: `just dope` creates user-input demo workflow
- [ ] **AC-15**: Unit tests for display status computation
- [ ] **AC-16**: Integration test: submit → complete → downstream gates

### Multi-Output
- [ ] **AC-17**: Multi-output modal shows one field per output
- [ ] **AC-18**: Per-field save supported
- [ ] **AC-19**: Partial save persisted; re-open shows saved values
- [ ] **AC-20**: Primary output uses `user_input.prompt`; others use output `description`

## Progress

| Phase | Status | Tasks | Notes |
|-------|--------|-------|-------|
| Phase 1: NodeStatusResult + Display Status | Not started | 0/11 | |
| Phase 2: Human Input Modal — Single Output | Not started | 0/6 | |
| Phase 3: Server Actions + Single-Output Lifecycle | Not started | 0/7 | |
| Phase 4: Multi-Output Support + Final Integration | Not started | 0/9 | |

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Lifecycle stuck at `agent-accepted` if `endNode` fails | Low | Medium | Server action catches error, displays toast. Node can be recovered via undo or CLI `cg wf end`. |
| Partial data.json writes bypass service guard | Low | Low | Intentional design — `canEnd()` validates all outputs on completion. Format matches `saveOutputData()` output format. |
| Orchestration (`cg wf drive`) tries to launch pod for `agent-accepted` user-input node | Low | Medium | ODS pod launch discriminates by unit type. Add guard: skip user-input nodes in ODS pod selection. Verify during Phase 3. |
| Multi-output modal scroll performance with many fields | Very Low | Low | `max-h-[60vh]` with `overflow-y-auto`. Most user-input units have 1-3 outputs. |
