# Flight Plan: Phase 2 — Human Input Modal + Server Action

**Plan**: [unified-human-input-plan.md](../../unified-human-input-plan.md)
**Phase**: Phase 2: Human Input Modal + Server Action
**Generated**: 2026-02-27
**Status**: Ready for takeoff

---

## Departure → Destination

**Where we are**: Phase 1 delivered the plumbing — `awaiting-input` badge renders on ready user-input nodes, `NodeStatusResult` carries `userInput` config via discriminated union, `collateInputs` reads Format A data. But clicking the badge does nothing — there's no modal and no way to submit data.

**Where we're going**: After Phase 2, clicking an `awaiting-input` node opens a Human Input modal showing the question from unit.yaml. The user types their answer, clicks Submit, and the node walks the full lifecycle (startNode → accept → saveOutputData → endNode) to `complete`. Downstream nodes see the output as available.

---

## Domain Context

### Domains We're Changing

| Domain | What Changes | Key Files |
|--------|-------------|-----------|
| workflow-ui | New HumanInputModal component, submitUserInput server action, editor modal wiring, properties panel button | `human-input-modal.tsx` (new), `workflow-actions.ts`, `workflow-editor.tsx`, `node-properties-panel.tsx` |

### Domains We Depend On (no changes)

| Domain | What We Consume | Contract |
|--------|----------------|----------|
| _platform/positional-graph | startNode, raiseNodeEvent, saveOutputData, endNode | IPositionalGraphService lifecycle methods |
| _platform/positional-graph | UserInputNodeStatus.userInput | Discriminated union from Phase 1 |
| _platform/events | SSE status broadcasts | Auto-refresh after lifecycle changes |

---

## Flight Status

```mermaid
stateDiagram-v2
    classDef pending fill:#9E9E9E,stroke:#757575,color:#fff
    classDef active fill:#FFC107,stroke:#FFA000,color:#000
    classDef done fill:#4CAF50,stroke:#388E3C,color:#fff
    classDef blocked fill:#F44336,stroke:#D32F2F,color:#fff

    state "1: Modal component" as S1
    state "2: Server action" as S2
    state "3: Editor wiring" as S3

    [*] --> S1
    S1 --> S2
    S2 --> S3
    S3 --> [*]

    class S1,S2,S3 pending
```

**Legend**: grey = pending | yellow = active | red = blocked/needs input | green = done

---

## Stages

- [ ] **Stage 1: Build HumanInputModal** — 4 question types + freeform + header (`human-input-modal.tsx` — new)
- [ ] **Stage 2: TDD lifecycle + server action** — Test lifecycle walkthrough, create `submitUserInput` (`workflow-actions.ts`)
- [ ] **Stage 3: Wire editor + properties panel** — Modal routing, onSubmit, properties panel button (`workflow-editor.tsx`, `node-properties-panel.tsx`)

---

## Architecture: Before & After

```mermaid
flowchart LR
    classDef existing fill:#E8F5E9,stroke:#4CAF50,color:#000
    classDef changed fill:#FFF3E0,stroke:#FF9800,color:#000
    classDef new fill:#E3F2FD,stroke:#2196F3,color:#000

    subgraph Before["Before Phase 2"]
        B1["workflow-editor<br/>QA modal only"]:::existing
        B2["awaiting-input badge<br/>not clickable"]:::existing
        B3["properties panel<br/>Edit Properties only"]:::existing
    end

    subgraph After["After Phase 2"]
        A1["workflow-editor<br/>QA + Human Input modals"]:::changed
        A2["HumanInputModal<br/>4 question types"]:::new
        A3["submitUserInput<br/>server action"]:::new
        A4["properties panel<br/>Provide Input button"]:::changed
        A1 --> A2
        A2 --> A3
        A1 --> A4
    end
```

---

## Acceptance Criteria

- [ ] AC-03: Click awaiting-input node → Human Input modal with unit.yaml config
- [ ] AC-04: Modal header: "Human Input" with unit slug + type icon
- [ ] AC-05: All 4 question types render from unit.yaml
- [ ] AC-06: Freeform textarea appears for user-input nodes
- [ ] AC-07: Submit writes via saveOutputData through IPositionalGraphService
- [ ] AC-08: After submission, node → complete via full lifecycle
- [ ] AC-10: Freeform notes preserved in _metadata.freeform_notes
- [ ] AC-12: Cancel/Escape → no data change, no status change

---

## Goals & Non-Goals

**Goals**: Interactive modal, server action lifecycle, editor wiring, properties panel button
**Non-Goals**: Re-submission, auto-open, demo workflows, QAModal changes

---

## Checklist

- [ ] T001: Create HumanInputModal with 4 question types
- [ ] T002: Modal header with slug + icon
- [ ] T003: TDD: Write submitUserInput lifecycle test
- [ ] T004: Create submitUserInput server action
- [ ] T005: Wire modal to workflow-editor.tsx
- [ ] T006: Wire onSubmit to server action + refresh
- [ ] T007: Properties panel "Provide Input..." button
- [ ] T008: Lightweight rendering tests
