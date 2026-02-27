# Unified Human Input — Implementation Plan

**Plan Version**: 2.0.0
**Created**: 2026-02-27
**Spec**: [unified-human-input-spec.md](./unified-human-input-spec.md)
**Status**: DRAFT
**Mode**: Full
**Complexity**: CS-2 (small-medium) — S=1, I=0, D=0, N=0, F=0, T=1

> **Governing design decision**: One node = one question = one output. Multiple questions = multiple nodes on a line. See [Workshop 010](./workshops/010-single-question-simplification.md).

## Summary

User-input nodes in the workflow editor currently have no input mechanism — they sit at `pending` status forever. This plan makes them functional by: (1) extending `NodeStatusResult` to surface unit config, (2) adding an `awaiting-input` computed display status to the node card, (3) building a standalone Human Input modal, and (4) creating a `submitUserInput` server action that writes the output to `data.json` and walks the existing node lifecycle. Each user-input node asks one question and produces one output. Multiple questions are composed by placing multiple nodes on a line.

> **Architectural note**: The engine's Q&A protocol (`askQuestion`/`answerQuestion`/`getAnswer` on `IPositionalGraphService`) is deprecated scaffolding — never integrated into real agent execution. Human input collection is a **web-layer concern**. Plan 054 does NOT use the engine Q&A methods. The existing `QAModal` and `answerQuestion` server action are deprecated territory.

## Target Domains

| Domain | Status | Relationship | Role |
|--------|--------|-------------|------|
| workflow-ui | existing | **modify** | Build HumanInputModal, add display status, server action, node card routing |
| _platform/positional-graph | existing | **modify** (minor) | Extend `NodeStatusResult` with `userInput` config. Fix `collateInputs` Format A. |
| _platform/events | existing | **consume** | SSE broadcasts status changes (no changes) |

## Domain Manifest

| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| `packages/positional-graph/src/interfaces/positional-graph-service.interface.ts` | _platform/positional-graph | contract | Extend `NodeStatusResult` with `userInput` field |
| `packages/positional-graph/src/services/positional-graph.service.ts` | _platform/positional-graph | internal | Populate `userInput` from unit.yaml |
| `packages/positional-graph/src/services/input-resolution.ts` | _platform/positional-graph | internal | Fix `collateInputs` to read Format A |
| `apps/web/src/features/050-workflow-page/components/human-input-modal.tsx` | workflow-ui | internal | NEW — standalone Human Input modal |
| `apps/web/src/features/050-workflow-page/components/workflow-node-card.tsx` | workflow-ui | internal | Add `awaiting-input` to STATUS_MAP, click routing |
| `apps/web/src/features/050-workflow-page/components/node-properties-panel.tsx` | workflow-ui | internal | "Provide Input..." button for user-input nodes |
| `apps/web/src/features/050-workflow-page/components/workflow-editor.tsx` | workflow-ui | internal | Wire modal routing for user-input nodes |
| `apps/web/src/features/050-workflow-page/lib/display-status.ts` | workflow-ui | internal | NEW — display status computation helper |
| `apps/web/app/actions/workflow-actions.ts` | workflow-ui | internal | Add `submitUserInput` server action |
| `scripts/dope-workflows.ts` | workflow-ui | internal | Add user-input demo scenarios |

## Key Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| F01 | Critical | **data.json format mismatch**: `saveOutputData()` writes Format A (`{ outputs: { name: value } }`), but `collateInputs()` reads flat (`data[name]`). See [Workshop 008](./workshops/008-save-persistence-strategy.md). | Phase 1 fixes `collateInputs` with one-line fallback: `data?.outputs?.[name] ?? data?.[name]`. |
| F02 | High | Node lifecycle requires explicit `raiseNodeEvent('node:accepted')` to transition `starting` → `agent-accepted`. | Server action calls `startNode()` then `raiseNodeEvent('node:accepted', {}, 'human')` then `endNode()`. Output written to data.json before lifecycle. |
| F03 | High | `NodeStatusResult` has no `userInput` config — only `unitType`. | Phase 1 extends the interface and populates from unit.yaml. |
| F04 | Medium | Orchestration safety: ONBAS skips user-input type + agent-accepted status. ODS skips user-input. 4 layers, all tested. | No risk. No changes needed. |

## Phases

### Phase 1: NodeStatusResult + Display Status

**Objective**: Surface user-input config in the graph status API, fix collateInputs Format A, and add `awaiting-input` display status to the node card.
**Domain**: `_platform/positional-graph` (modify) + `workflow-ui` (modify)
**Delivers**:
- `collateInputs` reads Format A (one-line fix)
- `NodeStatusResult.userInput` field populated from unit.yaml
- `display-status.ts` helper computing `awaiting-input`
- `STATUS_MAP` addition in node card
- TDD tests for service changes
**Depends on**: None

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 1.1 | Fix `collateInputs` to read Format A | _platform/positional-graph | `data?.outputs?.[fromOutput] ?? data?.[fromOutput]` — backward compat fallback | One-line fix in input-resolution.ts line 352 |
| 1.2 | Update `collate-inputs.test.ts` to use Format A fixtures | _platform/positional-graph | Existing tests pass with wrapped format | Update writeNodeData helper |
| 1.3 | Extend `NodeStatusResult` with `userInput` config | _platform/positional-graph | Optional `userInput?: { prompt, questionType, options?, defaultValue? }` | Per F03 |
| 1.4 | Populate `userInput` in `getNodeStatus()` from loaded WorkUnit | _platform/positional-graph | Unit test: user-input node returns config; agent/code return undefined | Service already loads unit |
| 1.5 | Create `display-status.ts` helper | workflow-ui | `getDisplayStatus()` maps `user-input` + `pending` + `ready` → `awaiting-input` | |
| 1.6 | Add `awaiting-input` to STATUS_MAP + click routing | workflow-ui | Violet badge, clickable, fires input handler | |
| 1.7 | TDD tests for 1.1–1.4, lightweight for 1.5–1.6 | both | All tests pass | |

### Phase 2: Human Input Modal + Server Action

**Objective**: Build the Human Input modal and the `submitUserInput` server action. Wire to the editor.
**Domain**: `workflow-ui` (modify) + `_platform/positional-graph` (consume)
**Delivers**:
- `HumanInputModal` component (standalone, does not modify qa-modal.tsx)
- `submitUserInput` server action (write output → startNode → accept → endNode)
- Modal wired to editor via display status routing
- Properties panel "Provide Input..." button
**Depends on**: Phase 1

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 2.1 | Create `HumanInputModal` component | workflow-ui | Renders prompt, 4 question types, freeform textarea, Submit button | New file |
| 2.2 | Modal header: "Human Input" + unit slug + icon | workflow-ui | Per Workshop 007 | |
| 2.3 | Create `submitUserInput` server action | workflow-ui | Writes output to data.json (Format A), calls startNode → accept → endNode | Per Workshop 008 |
| 2.4 | Wire modal to `workflow-editor.tsx` | workflow-ui | `awaiting-input` nodes open HumanInputModal; `waiting-question` continues to open legacy QAModal | Separate code paths |
| 2.5 | Wire modal onSubmit to server action | workflow-ui | Submit → node completes → modal closes → status updates | |
| 2.6 | Update properties panel: "Provide Input..." button | workflow-ui | User-input nodes show button instead of "Edit Properties..." | |
| 2.7 | Modal + action tests | workflow-ui | Rendering tests + server action lifecycle test | |

### Phase 3: Demo + Integration + Cleanup

**Objective**: Demo workflows, integration tests, error handling, final validation.
**Domain**: `workflow-ui` (modify)
**Delivers**:
- Demo workflows with user-input nodes in ready state
- Multi-node user-input demo (3 nodes on same line)
- Integration test: submit → complete → downstream gates
- Error state for malformed unit config
- Next.js MCP validation
**Depends on**: Phase 2

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 3.1 | Update `dope-workflows.ts`: single user-input demo | workflow-ui | `demo-user-input` with user-input node in ready state | AC-14 |
| 3.2 | Add multi-node user-input demo | workflow-ui | 3 user-input nodes on same line, different question types | Composition pattern |
| 3.3 | Integration test: submit → complete → downstream gates | workflow-ui | End-to-end flow works | AC-16 |
| 3.4 | Error state: missing `user_input` config | workflow-ui | Modal shows error for malformed units | AC-11 |
| 3.5 | Verify via Next.js MCP: zero errors, routes work | workflow-ui | Final validation | |

## Acceptance Criteria

### Node Display & Interaction
- [ ] **AC-01**: `user-input` + `pending` + `ready` → violet `?` badge, "Awaiting Input" label
- [ ] **AC-02**: `user-input` + `pending` + NOT `ready` → gray `pending` treatment
- [ ] **AC-03**: Click `awaiting-input` node → Human Input modal with unit.yaml config
- [ ] **AC-04**: Modal header: "Human Input" with unit slug + type icon
- [ ] **AC-05**: All 4 question types render from unit.yaml: text, single, multi, confirm
- [ ] **AC-06**: Freeform textarea appears for user-input nodes

### Data Submission & Storage
- [ ] **AC-07**: Submit writes to `nodes/{id}/data/data.json` in Format A
- [ ] **AC-08**: After submission, node → `complete` via full lifecycle
- [ ] **AC-09**: Downstream `from_node` input resolution sees `inputsAvailable: true`
- [ ] **AC-10**: Freeform notes preserved in `_metadata.freeform_notes`

### Robustness
- [ ] **AC-11**: Missing `user_input` config → error state in modal
- [ ] **AC-12**: Cancel/Escape → no data change, no status change

### Demo & Testing
- [ ] **AC-14**: `just dope` creates user-input demo workflow
- [ ] **AC-15**: Unit tests for display status computation
- [ ] **AC-16**: Integration test: submit → complete → downstream gates

## Progress

| Phase | Status | Tasks | Notes |
|-------|--------|-------|-------|
| Phase 1: NodeStatusResult + Display Status | Not started | 0/7 | |
| Phase 2: Human Input Modal + Server Action | Not started | 0/7 | |
| Phase 3: Demo + Integration + Cleanup | Not started | 0/5 | |

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Lifecycle stuck at `agent-accepted` if `endNode` fails | Low | Medium | Server action catches error, displays toast. Node recoverable via undo or CLI. |
| Orchestration interference with `agent-accepted` user-input node | None | None | 4 layers of defense verified and tested (ONBAS, ODS, PodManager). |
