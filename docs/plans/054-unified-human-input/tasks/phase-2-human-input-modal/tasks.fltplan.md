# Flight Plan: Phase 2 — Human Input Modal + Server Action

**Plan**: [unified-human-input-plan.md](../../unified-human-input-plan.md)
**Phase**: Phase 2: Human Input Modal + Server Action
**Generated**: 2026-02-27
**Status**: Landed

---

## Departure → Destination

**Where we are**: ~~Phase 1 plumbing only~~ **DONE**: Clicking an `awaiting-input` node opens the Human Input modal. User types answer, clicks Submit, node walks the full lifecycle to `complete`. Properties panel shows "Provide Input..." button for user-input nodes.

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

    class S1,S2,S3 done
```

**Legend**: grey = pending | yellow = active | red = blocked/needs input | green = done

---

## Stages

- [x] **Stage 1: Build HumanInputModal** — 4 question types + freeform + header (`human-input-modal.tsx` — new)
- [x] **Stage 2: TDD lifecycle + server action** — Test lifecycle walkthrough, create `submitUserInput` (`workflow-actions.ts`)
- [x] **Stage 3: Wire editor + properties panel** — Modal routing, onSubmit, properties panel button (`workflow-editor.tsx`, `node-properties-panel.tsx`)

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

- [x] AC-03: Click awaiting-input node → Human Input modal with unit.yaml config
- [x] AC-04: Modal header: "Human Input" with unit slug + type icon
- [x] AC-05: All 4 question types render from unit.yaml
- [x] AC-06: Freeform textarea appears for user-input nodes
- [x] AC-07: Submit writes via saveOutputData through IPositionalGraphService
- [x] AC-08: After submission, node → complete via full lifecycle
- [x] AC-10: Freeform notes preserved in _metadata.freeform_notes
- [x] AC-12: Cancel/Escape → no data change, no status change

---

## Goals & Non-Goals

**Goals**: Interactive modal, server action lifecycle, editor wiring, properties panel button
**Non-Goals**: Re-submission, auto-open, demo workflows, QAModal changes

---

## Checklist

- [x] T001: Create HumanInputModal with 4 question types
- [x] T002: Modal header with slug + icon
- [x] T003: TDD: Write submitUserInput lifecycle test
- [x] T004: Create submitUserInput server action
- [x] T005: Wire modal to workflow-editor.tsx
- [x] T006: Wire onSubmit to server action + refresh
- [x] T007: Properties panel "Provide Input..." button
- [x] T008: Lightweight rendering tests
