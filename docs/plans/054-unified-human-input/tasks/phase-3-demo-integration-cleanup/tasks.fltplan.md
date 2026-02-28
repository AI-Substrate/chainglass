# Flight Plan: Phase 3 — Demo + Integration + Cleanup

**Plan**: [unified-human-input-plan.md](../../unified-human-input-plan.md)
**Phase**: Phase 3: Demo + Integration + Cleanup
**Generated**: 2026-02-28
**Status**: Ready for takeoff

---

## Departure → Destination

**Where we are**: Phases 1-2 are complete. User-input nodes display `awaiting-input` badges, the HumanInputModal works with all 4 input types + freeform + pre-fill + re-edit. The `submitUserInput` server action walks the full lifecycle. Everything is browser-verified. But `just dope` has no user-input demo workflows, there's no integration test proving downstream gates open, and malformed units have no UI error guard.

**Where we're going**: A developer runs `just dope` and sees user-input nodes ready for interaction, demonstrating both single-node and multi-node composition. The test suite proves end-to-end data flow. Malformed configs get a clear error message. All 16 ACs pass.

---

## Domain Context

### Domains We're Changing

| Domain | What Changes | Key Files |
|--------|-------------|-----------|
| workflow-ui | Add 2 dope scenarios, error guard in modal/editor | `scripts/dope-workflows.ts`, `human-input-modal.tsx`, `workflow-editor.tsx` |
| test | Add integration test for multi-node composition | `submit-user-input-lifecycle.test.ts` |

### Domains We Depend On (no changes)

| Domain | What We Consume | Contract |
|--------|----------------|----------|
| _platform/positional-graph | `IPositionalGraphService` create/addNode/setInput/startNode/accept/saveOutput/endNode | Service interface |
| _platform/positional-graph | `collateInputs` Format A resolution | input-resolution.ts |
| _platform/events | SSE status broadcasts | No contract changes |

---

## Flight Status

<!-- Updated by /plan-6-v2: pending → active → done. Use blocked for problems/input needed. -->

```mermaid
stateDiagram-v2
    classDef pending fill:#9E9E9E,stroke:#757575,color:#fff
    classDef active fill:#FFC107,stroke:#FFA000,color:#000
    classDef done fill:#4CAF50,stroke:#388E3C,color:#fff
    classDef blocked fill:#F44336,stroke:#D32F2F,color:#fff

    state "1: Dope scenarios" as S1
    state "2: Integration test" as S2
    state "3: Error guard + validation" as S3

    [*] --> S1
    S1 --> S2
    S2 --> S3
    S3 --> [*]

    class S1,S2,S3 pending
```

**Legend**: grey = pending | yellow = active | red = blocked/needs input | green = done

---

## Stages

<!-- Updated by /plan-6-v2 during implementation: [ ] → [~] → [x] -->

- [ ] **Stage 1: Dope demo scenarios** — Create sample units + 2 dope scenarios for user-input nodes (`dope-workflows.ts`, `sample-choice/unit.yaml`, `sample-confirm/unit.yaml`)
- [ ] **Stage 2: Integration test** — Multi-node composition lifecycle test proving downstream gates open (`submit-user-input-lifecycle.test.ts`)
- [ ] **Stage 3: Error guard + validation** — Malformed config error state in modal/editor + Next.js MCP validation (`human-input-modal.tsx`, `workflow-editor.tsx`)

---

## Architecture: Before & After

```mermaid
flowchart LR
    classDef existing fill:#E8F5E9,stroke:#4CAF50,color:#000
    classDef changed fill:#FFF3E0,stroke:#FF9800,color:#000
    classDef new fill:#E3F2FD,stroke:#2196F3,color:#000

    subgraph Before["Before Phase 3"]
        B1["HumanInputModal"]:::existing
        B2["dope-workflows.ts<br/>(no user-input demos)"]:::existing
        B3["lifecycle test<br/>(2 tests)"]:::existing
    end

    subgraph After["After Phase 3"]
        A1["HumanInputModal<br/>+ error guard"]:::changed
        A2["dope-workflows.ts<br/>+ 2 user-input scenarios"]:::changed
        A3["lifecycle test<br/>+ multi-node integration"]:::changed
        A4["sample-choice/unit.yaml"]:::new
        A5["sample-confirm/unit.yaml"]:::new
    end
```

**Legend**: existing (green, unchanged) | changed (orange, modified) | new (blue, created)

---

## Acceptance Criteria

- [ ] AC-11: Missing `user_input` config → error state in modal
- [ ] AC-14: `just dope` creates user-input demo workflow
- [ ] AC-16: Integration test: submit → complete → downstream gates open

## Goals & Non-Goals

**Goals**: Demo workflows, integration test, error handling, final validation
**Non-Goals**: No new features, no changes to modal/action/display status from Phase 2

---

## Checklist

- [ ] T001: Add `demo-user-input` dope scenario
- [ ] T002: Create sample user-input units for multi-input demo
- [ ] T003: Add `demo-multi-input` dope scenario
- [ ] T004: Integration test: submit → complete → downstream gates open
- [ ] T005: Error state for missing `user_input` config
- [ ] T006: Verify via Next.js MCP: zero errors, routes work
