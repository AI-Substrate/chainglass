# Unified Human Input

**Mode**: Full
📚 This specification incorporates findings from workshop [006-unified-human-input-design.md](./workshops/006-unified-human-input-design.md), produced during Plan 050 Phase 5 analysis.

## Summary

Enable user-input nodes in the workflow editor to actually collect data from humans. Today, agent-initiated questions work through the QA modal, but dedicated `user-input` type nodes have no input mechanism — they sit at `pending` status with no way to provide data. This feature unifies both interaction patterns under a single "Human Input" UI: the same modal, the same visual treatment, but with storage and lifecycle paths appropriate to each case. After submission, user-input node outputs become available to downstream nodes through the existing input resolution system.

## Goals

- **User-input nodes are usable**: Clicking a ready user-input node opens a modal pre-populated from its `unit.yaml → user_input` config (prompt, question type, options), allowing the human to provide data
- **Unified visual language**: Both agent questions and user-input nodes present with the same violet badge, "Human Input" header, and always-on freeform text area — users don't need to understand the internal distinction
- **Data flows downstream**: After submission, user-input outputs are written to the node's data store and become available to downstream nodes through `collateInputs()` / the existing input resolution system
- **Immediate completion**: User-input nodes transition directly to `complete` after submission (no agent to resume), unblocking downstream gates
- **Standard question types supported**: All 4 question types (text, single-choice, multi-choice, confirm) work for user-input nodes, with configuration sourced from `unit.yaml`
- **Always-on freeform**: Every human input interaction (whether question or user-input) always shows the freeform text area alongside structured input, consistent with the existing QA modal design

## Non-Goals

- **Re-submission / edit after complete**: Once a user-input node completes, re-editing requires undo (Ctrl+Z). In-place re-submission is deferred
- **Multi-step form wizards**: Complex multi-page form flows are deferred. Multi-output nodes show all fields in one modal view
- **Auto-open modal**: The modal does not auto-open when a user-input node becomes ready. Users click the badge to engage. Auto-open/toast notifications are a future enhancement
- **New node types**: This feature does not introduce new node types (e.g., "form", "approval"). It makes the existing `user-input` type functional
- **Orchestration changes**: No changes to the orchestration loop, ONBAS decisions, or drive cycle. The positional-graph service may need minor additions (output writing, status transition), but the orchestration architecture is untouched

## Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|-------------|---------------------|
| workflow-ui | existing | **modify** | Extend modal to handle user-input nodes (including multi-output forms), add `awaiting-input` display status, wire submit server action |
| _platform/positional-graph | existing | **consume** | Use existing lifecycle methods (`startNode`, `saveOutputData`, `endNode`) — no new service methods needed. `collateInputs()` already reads `data.json` outputs via `from_node` resolution |
| _platform/events | existing | **consume** | SSE broadcasts status changes after user-input submission (no changes needed) |

No new domains required. Positional-graph changes are lighter than originally estimated — we consume existing methods in sequence rather than adding new ones.

## Complexity

- **Score**: CS-3 (medium)
- **Breakdown**: S=1, I=0, D=1, N=1, F=0, T=1
  - Surface Area (S=1): Multiple files across workflow-ui feature and positional-graph service, but focused changes
  - Integration (I=0): Purely internal — extends existing question protocol and node status system
  - Data/State (D=1): Minor additions — node output data writing (data.json), potential NodeStatusResult extension with `userInput` field
  - Novelty (N=1): Some ambiguity around output writing mechanism and multi-output mapping, but workshop resolved the core design
  - Non-Functional (F=0): Standard — no perf/security/compliance concerns beyond existing patterns
  - Testing/Rollout (T=1): Integration tests needed to verify data flows downstream; unit tests for modal modes and display status computation
- **Confidence**: 0.90
- **Assumptions**: `collateInputs()` reads `nodes/{id}/data/data.json` → `data[outputName]` for `from_node` resolution (confirmed via code inspection). `startNode()` + `saveOutputData()` + `endNode()` walks the full lifecycle for user-input nodes (confirmed: no service changes needed).
- **Dependencies**: Plan 050 complete (workflow editor and QA modal exist), positional-graph service stable
- **Risks**: Multi-output modal UX may need iteration; partial save state adds UI complexity
- **Phases**: ~3 phases (UI display status + modal extension → server action + lifecycle → demo workflows + integration tests)

## Acceptance Criteria

### Node Display & Interaction

- **AC-01**: A `user-input` node that is `pending` and `ready` (all gates pass) displays with the violet `?` badge and "Awaiting Input" label, matching the visual treatment of `waiting-question` nodes
- **AC-02**: A `user-input` node that is `pending` but NOT `ready` (gates blocking) displays with standard gray `pending` treatment — no input badge shown
- **AC-03**: Clicking a `user-input` node in `awaiting-input` state opens the Human Input modal pre-populated with the node's `unit.yaml → user_input` config (prompt text, question type, options)
- **AC-04**: The modal header reads "Human Input" for both agent questions and user-input nodes (unified language)
- **AC-05**: All 4 question types render correctly in the modal when sourced from unit.yaml: text input, single-choice radio buttons, multi-choice checkboxes, confirm yes/no buttons
- **AC-06**: The always-on freeform text area appears below the structured input for user-input nodes, consistent with existing agent question behavior

### Data Submission & Storage

- **AC-07**: Submitting the modal for a user-input node writes the structured answer to the node's output data via `saveOutputData()` (data stored at `nodes/{id}/data/data.json`, readable by downstream `collateInputs()`)
- **AC-08**: After all required outputs are filled, the user-input node transitions to `complete` status via the full lifecycle (`startNode()` → `saveOutputData()` per output → `endNode()`)
- **AC-09**: Downstream nodes that reference the user-input node's outputs via `from_node` input resolution see `inputsAvailable: true` after submission
- **AC-10**: The freeform notes field content is preserved alongside the structured answer in the node's output data

### Multi-Output Nodes

- **AC-17**: For user-input units with multiple declared outputs, the modal shows one input field per output — each output becomes a question/field in the form
- **AC-18**: Each output field can be saved independently within the modal (partial completion supported)
- **AC-19**: If the modal is closed before all required outputs are filled, the node remains in `awaiting-input` state. Re-opening the modal shows previously saved values.
- **AC-20**: The primary output uses the `user_input.prompt` and `user_input.question_type` from unit.yaml. Additional outputs infer their prompt from the output's `description` field and default to `text` type

### Robustness

- **AC-11**: If a user-input node's unit.yaml has no `user_input` config (malformed), the node shows an error state rather than a broken modal
- **AC-12**: Cancelling the modal (Cancel button or Escape key) does not change node status or write any data
- **AC-13**: The existing agent question flow (`waiting-question` → QA modal → answer → restart) continues to work unchanged

### Demo & Testing

- **AC-14**: `just dope` generates at least one demo workflow with a user-input node in ready/awaiting-input state for development testing
- **AC-15**: Unit tests verify the display status computation: `user-input` + `pending` + `ready` → `awaiting-input`
- **AC-16**: Integration test verifies end-to-end: submit user input → node completes → downstream node gates open

## Risks & Assumptions

### Assumptions

1. **`collateInputs()` reads data.json** — CONFIRMED: `loadNodeData()` reads `nodes/{id}/data/data.json`, returns `Record<string, unknown>`. `collateInputs()` accesses `data?.[fromOutput]`. The existing `saveOutputData()` writes to `{ outputs: { outputName: value } }` format.
2. **Full lifecycle available** — CONFIRMED: `startNode()` accepts `pending` → `starting`, then `node:accept` event → `agent-accepted`, then `saveOutputData()` (requires `agent-accepted`), then `endNode()` → `complete`. All existing methods, no new code needed in positional-graph.
3. **Unit config accessible from graph status**: `NodeStatusResult` can be extended to include `userInput` config, or the UI can resolve it from the `WorkUnitSummary` data already loaded for the toolbox.

### Risks

1. **Output format mismatch** — RESOLVED (low): Confirmed data.json schema via code inspection. `saveOutputData()` writes the correct format that `collateInputs()` reads.
2. **Node status transition** — RESOLVED (none): Full lifecycle walkthrough confirmed. Server action calls `startNode()` + `saveOutputData()` + `endNode()` in sequence — no guards bypassed, no new methods needed.
3. **Multi-output partial save UX** (medium): Saving outputs independently while the node hasn't been "started" yet requires careful sequencing. May need to `startNode()` on first field save, then `endNode()` only when all required outputs are filled. Mitigation: design the server action to handle partial saves correctly.
4. **UserInput config not in NodeStatusResult** (low): The current `NodeStatusResult` doesn't include unit config for user-input nodes. This requires a service-level change to include it. Mitigation: could alternatively fetch unit config via a separate call, but co-location is cleaner.

## Clarifications

### Session 2026-02-27

**Q1: Workflow Mode** → **Full** — CS-3 with cross-domain changes warrants full gates.

**Q2: Testing Strategy** → **Hybrid** — TDD for service-layer output writing + status transitions (positional-graph lifecycle walkthrough), lightweight for UI display logic (display status computation, modal prop mapping).

**Q3: Mock Usage** → **Avoid mocks** — Real data/fixtures only. Follow existing patterns: FakePositionalGraphService for UI tests, real filesystem fixtures for service-layer tests.

**Q4: Documentation Strategy** → **No new documentation** — Existing `workflow-ui/domain.md` How to Use section + workshop 006 is sufficient.

**Q5: Domain Review** → **Confirmed** — Both domains modified, no new domains, no contract-breaking changes. Positional-graph changes lighter than expected (consume existing `startNode` + `saveOutputData` + `endNode` methods).

**Q6: User-Input Lifecycle** → **Walk existing lifecycle in server action** — `submitUserInput` action calls `startNode()`, `saveOutputData()`, `endNode()` sequentially. No new positional-graph service methods. The `starting` → `agent-accepted` transition is instant and invisible to the user.

**Q7: Multi-Output Mapping** → **One field per output in the modal** — Each declared output becomes a question/field. Save individually, partial completion supported. Node stays `awaiting-input` until all required outputs filled. Re-open shows previously saved values.

**Q8: Multi-Output Confirmation** → **Confirmed** — Modal extended to show N questions (one per output). Primary output uses `user_input` config, additional outputs use their `description` field as prompt and default to `text` type.

## Testing Strategy

- **Approach**: Hybrid
- **Rationale**: Service-layer lifecycle (startNode → saveOutputData → endNode) and input resolution have complex contracts with downstream effects — TDD these paths. UI display status computation and modal prop mapping are simpler wiring — lightweight tests.
- **Focus Areas**: Output data format compatibility with `collateInputs()`, full lifecycle walkthrough for user-input nodes, partial save state management for multi-output nodes
- **Mock Usage**: Avoid mocks — real data/fixtures only. FakePositionalGraphService for UI component tests, real filesystem for service integration tests.
- **Excluded**: Visual regression testing, browser-based E2E tests

## Workshop Opportunities

| Topic | Type | Status | Reference |
|-------|------|--------|-----------|
| Unified Human Input Design | Integration Pattern | ✅ Done | [006-unified-human-input-design.md](./workshops/006-unified-human-input-design.md) |
| ~~Output Data Contract~~ | ~~Data Model~~ | ✅ Resolved via code inspection | `saveOutputData()` writes `{ outputs: { name: value } }`, `collateInputs()` reads `data?.[outputName]` |
| ~~User-Input State Transitions~~ | ~~State Machine~~ | ✅ Resolved via code inspection | Full lifecycle walkthrough: `startNode()` → `saveOutputData()` → `endNode()`. No new methods needed. |
