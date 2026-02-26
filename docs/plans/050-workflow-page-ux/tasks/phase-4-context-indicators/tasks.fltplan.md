# Flight Plan: Phase 4 — Context Indicators + Select-to-Reveal

**Plan**: [workflow-page-ux-plan.md](../../workflow-page-ux-plan.md)
**Phase**: Phase 4: Context Indicators + Select-to-Reveal
**Generated**: 2026-02-26
**Status**: Landed

---

## Departure → Destination

**Where we are**: Phase 3 delivered drag-and-drop from toolbox to canvas, node deletion, line management, and naming modals. Users can build workflows interactively. But node cards show placeholder context badges, no gate chips explain why nodes are blocked, and selecting a node doesn't reveal its dependency neighborhood.

**Where we're going**: Every node card shows its real context badge color (green/blue/purple/gray), blocked nodes display gate chips explaining the blocking reason, selecting a node dims unrelated nodes and shows a properties panel with inputs/outputs/status. Line transition gates are interactive.

---

## Flight Status

```mermaid
stateDiagram-v2
    classDef pending fill:#9E9E9E,stroke:#757575,color:#fff

    state "1: Context badge + lock" as S1
    state "2: Gate chips" as S2
    state "3: Select-to-reveal + properties" as S3
    state "4: Transition gates + tests" as S4

    [*] --> S1
    S1 --> S2
    S2 --> S3
    S3 --> S4
    S4 --> [*]

    class S1,S2,S3,S4 pending
```

---

## Stages

- [x] **Stage 1: Context badge + lock** — Pure computation function + wire into node cards + noContext lock icon (T001, T002, T003)
- [x] **Stage 2: Gate chips** — GateChip component + wire into node cards for blocked nodes (T004)
- [x] **Stage 3: Select-to-reveal + properties** — Node dimming + properties panel replacing toolbox on select (T005, T006)
- [x] **Stage 4: Transition gates + tests** — Interactive manual gates + unit tests for all visual states (T007, T008)

---

## Acceptance Criteria

- [x] AC-12: Gate chips on blocked nodes (5 gate types)
- [x] AC-13: Context badges (green/blue/purple/gray)
- [x] AC-14: noContext lock icon
- [x] AC-15: Select-to-reveal: upstream traces, downstream muted, unrelated dim, properties panel
- [x] AC-17: Line transition gates (auto/manual)
- [x] AC-35: Unit tests with fakes (partial — context + gates + properties)

---

## Checklist

- [x] T001: Context badge computation (pure function)
- [x] T002: Wire real context badges into node cards
- [x] T003: noContext lock icon
- [x] T004: GateChip component with expandable gate list
- [x] T004b: Context flow indicators between adjacent nodes (arrow/X/dots)
- [x] T005: Select-to-reveal dimming (computeRelatedNodes)
- [x] T006: Node properties panel
- [x] T007: Interactive line transition gates
- [x] T008: Unit tests
