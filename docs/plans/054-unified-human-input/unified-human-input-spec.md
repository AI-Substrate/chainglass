# Unified Human Input

**Mode**: Full
📚 This specification incorporates findings from workshops [006](./workshops/006-unified-human-input-design.md), [007](./workshops/007-human-input-ui-ux.md), [008](./workshops/008-save-persistence-strategy.md), and [010](./workshops/010-single-question-simplification.md).

## Summary

Enable user-input nodes in the workflow editor to collect data from humans. Each user-input node asks **one question** and produces **one output**. Need multiple pieces of data? Place multiple user-input nodes on a line — composability through the graph, not through complex modal forms. The feature builds a "Human Input" modal that reads configuration from `unit.yaml`, writes output data to `data.json`, and walks the existing node lifecycle to complete the node. After submission, the output becomes available to downstream nodes through the existing input resolution system.

> **Architectural note**: The engine's Q&A protocol (`askQuestion`/`answerQuestion`/`getAnswer` on `IPositionalGraphService`) is deprecated scaffolding from Plan 028 — never integrated into real agent execution. Human input collection is a **web-layer concern**. This feature does NOT use the engine Q&A methods. The existing `QAModal` and `answerQuestion` server action are also deprecated territory (they service pre-baked dope demo questions only).

## Goals

- **User-input nodes are usable**: Clicking a ready user-input node opens a modal pre-populated from its `unit.yaml → user_input` config (prompt, question type, options), allowing the human to provide data
- **One node = one question = one output**: Each user-input unit asks a single question and writes to a single output. Multiple questions are composed by placing multiple nodes on a line.
- **Data flows downstream**: After submission, the output is written to the node's data store and becomes available to downstream nodes through `collateInputs()` / the existing input resolution system
- **Immediate completion**: User-input nodes transition to `complete` after submission, unblocking downstream gates
- **Standard question types supported**: All 4 question types (text, single-choice, multi-choice, confirm) work for user-input nodes, with configuration sourced from `unit.yaml`
- **Always-on freeform**: Every human input modal shows a freeform text area alongside the structured input

## Non-Goals

- **Re-submission / edit after complete**: Once a user-input node completes, re-editing requires undo (Ctrl+Z). In-place re-submission is deferred
- **Multi-output user-input nodes**: Each node asks one question and produces one output. Multiple pieces of data = multiple nodes. No multi-field forms, no partial save state, no per-field save buttons.
- **Auto-open modal**: The modal does not auto-open when a user-input node becomes ready. Users click the badge to engage. Auto-open/toast notifications are a future enhancement
- **New node types**: This feature does not introduce new node types (e.g., "form", "approval"). It makes the existing `user-input` type functional
- **Orchestration changes**: No changes to the orchestration loop, ONBAS decisions, or drive cycle
- **Schema changes**: The existing `user_input` config in unit.yaml (question_type + prompt + options) is already sufficient. No schema extensions needed.

## Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|-------------|---------------------|
| workflow-ui | existing | **modify** | Build HumanInputModal, add `awaiting-input` display status, wire submit server action |
| _platform/positional-graph | existing | **modify** (minor) | Extend `NodeStatusResult` with `userInput` config field. Fix `collateInputs` to read Format A. |
| _platform/events | existing | **consume** | SSE broadcasts status changes after user-input submission (no changes needed) |

No new domains required.

## Complexity

- **Score**: CS-2 (small-medium)
- **Breakdown**: S=1, I=0, D=0, N=0, F=0, T=1
  - Surface Area (S=1): Multiple files across workflow-ui feature and positional-graph service, but focused changes
  - Integration (I=0): Purely internal — extends existing node status system
  - Data/State (D=0): Single atomic write to data.json per submission — no partial state, no new schemas
  - Novelty (N=0): All ambiguities resolved by workshops. Single-question design matches all 9 existing units exactly.
  - Non-Functional (F=0): Standard — no perf/security/compliance concerns
  - Testing/Rollout (T=1): Integration tests needed to verify data flows downstream
- **Confidence**: 0.95
- **Assumptions**: `collateInputs()` reads data.json (confirmed, needs one-line fix for Format A). `startNode` + `accept` + `endNode` walks the lifecycle (confirmed).
- **Dependencies**: Plan 050 complete (workflow editor exists), positional-graph service stable
- **Risks**: Low — single-question design is simple and matches all existing units
- **Phases**: 3 phases (NodeStatusResult + display status → modal + server action → demo + integration tests)

## Acceptance Criteria

### Node Display & Interaction

- **AC-01**: A `user-input` node that is `pending` and `ready` (all gates pass) displays with the violet `?` badge and "Awaiting Input" label
- **AC-02**: A `user-input` node that is `pending` but NOT `ready` (gates blocking) displays with standard gray `pending` treatment — no input badge shown
- **AC-03**: Clicking a `user-input` node in `awaiting-input` state opens the Human Input modal pre-populated with the node's `unit.yaml → user_input` config (prompt text, question type, options)
- **AC-04**: The modal header reads "Human Input" and shows the unit slug + type icon
- **AC-05**: All 4 question types render correctly in the modal when sourced from unit.yaml: text input, single-choice radio buttons, multi-choice checkboxes, confirm yes/no buttons
- **AC-06**: The always-on freeform text area appears below the structured input

### Data Submission & Storage

- **AC-07**: Submitting the modal writes the structured answer via `saveOutputData()` through `IPositionalGraphService` (data stored at `nodes/{id}/data/data.json` in Format A)
- **AC-08**: After submission, the user-input node transitions to `complete` status via the full lifecycle (`startNode` → `node:accepted` → `saveOutputData` → `endNode`)
- **AC-09**: Downstream nodes that reference the user-input node's output via `from_node` input resolution see `inputsAvailable: true` after submission
- **AC-10**: The freeform notes field content is preserved in `_metadata.freeform_notes` in data.json

### Robustness

- **AC-11**: If a user-input node's unit.yaml has no `user_input` config (malformed), the node shows an error state rather than a broken modal
- **AC-12**: Cancelling the modal (Cancel button or Escape key) does not change node status or write any data

### Demo & Testing

- **AC-14**: `just dope` generates at least one demo workflow with a user-input node in ready/awaiting-input state
- **AC-15**: Unit tests verify the display status computation: `user-input` + `pending` + `ready` → `awaiting-input`
- **AC-16**: Integration test verifies end-to-end: submit user input → node completes → downstream node gates open

## Risks & Assumptions

### Assumptions

1. **`collateInputs()` reads data.json** — CONFIRMED but needs one-line fix: currently reads `data[name]` (flat), needs `data?.outputs?.[name] ?? data?.[name]` to support Format A (wrapped). See Workshop 008.
2. **Full lifecycle available** — CONFIRMED: `startNode()` → `raiseNodeEvent('node:accepted')` → `endNode()`. Output written to data.json before lifecycle start. `canEnd()` validates outputs exist.
3. **Unit config accessible from graph status**: `NodeStatusResult` extended with optional `userInput` field populated from unit.yaml during `getNodeStatus()`.
4. **Orchestration safe** — CONFIRMED: 4 layers prevent interference (ONBAS skips user-input type + agent-accepted status, ODS skips user-input, PodManager has no user-input pod). All tested.

### Risks

1. **Output format mismatch** — RESOLVED: Workshop 008 identified collateInputs reads flat format while saveOutputData writes wrapped. Fix: one-line change in input-resolution.ts.
2. **UserInput config not in NodeStatusResult** (low): Requires service-level change to include it. Mitigation: small, backward-compatible optional field.

## Clarifications

### Session 2026-02-27

**Q1: Workflow Mode** → **Full** — CS-2 with cross-domain changes warrants full gates.

**Q2: Testing Strategy** → **Hybrid** — TDD for service-layer lifecycle walkthrough, lightweight for UI display logic.

**Q3: Mock Usage** → **Avoid mocks** — Real data/fixtures only.

**Q4: Documentation Strategy** → **No new documentation** — Existing domain.md sufficient.

**Q5: Domain Review** → **Confirmed** — Both domains modified (minor), no new domains.

**Q6: User-Input Lifecycle** → **Walk existing lifecycle in server action** — `submitUserInput` writes output to data.json, then calls `startNode` → `accept` → `endNode`.

**Q7–Q8: Multi-Output** → **Superseded by Workshop 010** — Single question per node. Multiple questions = multiple nodes on a line. No multi-output forms, no partial saves, no fields schema.

## Testing Strategy

- **Approach**: Hybrid
- **Rationale**: Service-layer lifecycle (write output → startNode → accept → endNode) and input resolution have complex contracts — TDD these. UI display status and modal rendering are simpler — lightweight tests.
- **Focus Areas**: Output data format compatibility with `collateInputs()` (Format A), full lifecycle walkthrough
- **Mock Usage**: Avoid mocks — FakePositionalGraphService for UI tests, real filesystem for service tests.
- **Excluded**: Visual regression, browser-based E2E

## Workshop Opportunities

| Topic | Type | Status | Reference |
|-------|------|--------|-----------|
| Unified Human Input Design | Integration Pattern | Partially superseded | [006](./workshops/006-unified-human-input-design.md) — data model valid, dual-mode modal superseded |
| Human Input UI/UX | UI Design | Partially superseded | [007](./workshops/007-human-input-ui-ux.md) — single-output layouts valid, multi-output sections superseded |
| Save & Persistence Strategy | Data Model | Valid | [008](./workshops/008-save-persistence-strategy.md) — single-output path is the only path now |
| Question Definition Schema | Schema Design | **Superseded** | [009](./workshops/009-question-definition-schema.md) — fields[] not needed, existing schema is sufficient |
| Single-Question Simplification | Architecture | **Authoritative** | [010](./workshops/010-single-question-simplification.md) — the governing design decision |
| Discriminated Type Architecture | Architecture | **Authoritative** | [011](./workshops/011-discriminated-type-architecture.md) — NarrowWorkUnit + NodeStatusResult as discriminated unions |
| Output Name Flow | Architecture | **Authoritative** | [012](./workshops/012-output-name-flow.md) — outputName on userInput config |
| Re-Edit UX | UX / State Machine | **Authoritative** | [013](./workshops/013-re-edit-ux.md) — node:restart from complete, atomic reset+submit |
