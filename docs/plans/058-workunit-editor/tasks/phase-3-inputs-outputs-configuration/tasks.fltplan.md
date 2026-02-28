# Flight Plan: Phase 3 — Inputs/Outputs Configuration

**Plan**: [workunit-editor-plan.md](../../workunit-editor-plan.md)
**Phase**: Phase 3: Inputs/Outputs Configuration
**Generated**: 2026-02-28
**Status**: Ready for takeoff

---

## Departure → Destination

**Where we are**: Phase 2 delivered the editor page with type-specific content editors (agent prompt, code script, user-input form), auto-save, sidebar navigation, and creation flow. But there's no UI for configuring a unit's inputs and outputs — the data ports that wire units together in workflows. The service layer (Phase 1) already supports `update(slug, { inputs, outputs })`.

**Where we're going**: A user opens any work unit editor, scrolls below the content editor, and sees expandable card lists for Inputs and Outputs. They can add new ports, drag to reorder, edit field properties (name, type, data_type, required, description), and see reserved params as locked cards. Changes save immediately for structural ops, debounced for field edits.

---

## Domain Context

### Domains We're Changing

| Domain | What Changes | Key Files |
|--------|-------------|-----------|
| `058-workunit-editor` | New: InputOutputCard, InputOutputCardList; Modified: WorkUnitEditor, editor page | `input-output-card.tsx`, `input-output-card-list.tsx`, `workunit-editor.tsx` |

### Domains We Depend On (no changes)

| Domain | What We Consume | Contract |
|--------|----------------|----------|
| `_platform/positional-graph` | `UpdateUnitPatch.inputs/outputs` | Arrays replace wholesale |
| `_platform/hooks` | `useAutoSave` | Debounced save + status |
| `058-workunit-editor` | `updateUnit()` server action | DI-wired persistence |

---

## Flight Status

<!-- Updated by /plan-6-v2: pending → active → done. -->

```mermaid
stateDiagram-v2
    classDef pending fill:#9E9E9E,stroke:#757575,color:#fff
    classDef active fill:#FFC107,stroke:#FFA000,color:#000
    classDef done fill:#4CAF50,stroke:#388E3C,color:#fff
    classDef blocked fill:#F44336,stroke:#D32F2F,color:#fff

    state "1: Card component" as S1
    state "2: List + DnD" as S2
    state "3: Wire + save" as S3

    [*] --> S1
    S1 --> S2
    S2 --> S3
    S3 --> [*]

    class S1,S2,S3 pending
```

**Legend**: grey = pending | yellow = active | red = blocked/needs input | green = done

---

## Stages

- [ ] **Stage 1: Card component** — Build expandable InputOutputCard with form fields, validation, reserved param support (`input-output-card.tsx` — new file)
- [ ] **Stage 2: List + DnD** — Build InputOutputCardList with DndContext, SortableContext, add/delete, drag reorder (`input-output-card-list.tsx` — new file)
- [ ] **Stage 3: Wire + save** — Integrate into WorkUnitEditor, wire auto-save with dual delay (0ms structural, 500ms fields), pass data from server (`workunit-editor.tsx`, `page.tsx`)

---

## Architecture: Before & After

```mermaid
flowchart LR
    classDef existing fill:#E8F5E9,stroke:#4CAF50,color:#000
    classDef changed fill:#FFF3E0,stroke:#FF9800,color:#000
    classDef new fill:#E3F2FD,stroke:#2196F3,color:#000

    subgraph Before["Before Phase 3"]
        B_WUE["WorkUnitEditor\n(content only)"]:::existing
        B_ACT["updateUnit()"]:::existing
        B_HOOK["useAutoSave"]:::existing
    end

    subgraph After["After Phase 3"]
        A_WUE["WorkUnitEditor\n(content + I/O)"]:::changed
        A_CARD["InputOutputCard\n(expandable)"]:::new
        A_LIST["InputOutputCardList\n(DnD + CRUD)"]:::new
        A_ACT["updateUnit()"]:::existing
        A_HOOK["useAutoSave"]:::existing

        A_WUE --> A_LIST
        A_LIST --> A_CARD
        A_LIST --> A_HOOK
        A_LIST --> A_ACT
    end
```

**Legend**: existing (green, unchanged) | changed (orange, modified) | new (blue, created)

---

## Acceptance Criteria

- [ ] AC-10: Add, edit, reorder, remove inputs
- [ ] AC-11: Add, edit, reorder, remove outputs
- [ ] AC-12: Name validation with real-time feedback
- [ ] AC-13: data_type conditional on type
- [ ] AC-14: Reserved params read-only
- [ ] AC-15: At least one output enforced

## Goals & Non-Goals

**Goals**: Expandable card list for inputs/outputs. Drag reorder. Validation. Reserved params. Auto-save.
**Non-Goals**: No file watcher (Phase 4). No "Edit Template" button (Phase 4). No undo/redo.

---

## Checklist

- [ ] T001: Build InputOutputCard (expandable, form fields, ARIA)
- [ ] T002: Build InputOutputCardList (DndContext, add/delete)
- [ ] T003: Wire into WorkUnitEditor + editor page
- [ ] T004: Reserved params (locked cards)
- [ ] T005: Real-time validation (name regex, data_type conditional)
- [ ] T006: Drag reorder (useSortable, arrayMove)
- [ ] T007: Auto-save structural changes (dual delay)
