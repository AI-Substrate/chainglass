# Flight Plan: Phase 2 — State Schema Extension and Two-Phase Handshake

**Plan**: [node-event-system-plan.md](../../node-event-system-plan.md)
**Phase**: Phase 2: State Schema Extension and Two-Phase Handshake
**Generated**: 2026-02-07
**Status**: Landed

---

## Departure → Destination

**Where we are**: Phase 1 delivered the complete event type data model — 8 payload schemas, the NodeEventRegistry, event ID generation, and error codes E190-E195. All 94 Phase 1 tests pass (3523 total). The codebase still uses the single `'running'` status for all in-progress nodes, and there is no event log on node state entries.

**Where we're going**: By the end of this phase, the `'running'` status will be replaced by `'starting'` (orchestrator reserved) and `'agent-accepted'` (agent working). Every source file and test file that referenced `'running'` will use the new statuses. Node state entries will have an optional `events` array ready for Phase 3's `raiseEvent()`. A developer running `just fft` will see the full test suite pass with the new two-phase handshake model.

---

## Flight Status

<!-- Updated by /plan-6: pending → active → done. Use blocked for problems/input needed. -->

```mermaid
stateDiagram-v2
    classDef pending fill:#9E9E9E,stroke:#757575,color:#fff
    classDef active fill:#FFC107,stroke:#FFA000,color:#000
    classDef done fill:#4CAF50,stroke:#388E3C,color:#fff
    classDef blocked fill:#F44336,stroke:#D32F2F,color:#fff

    state "1: Update status enum" as S1
    state "2: Add events array" as S2
    state "3: Write predicate tests" as S3
    state "4: Implement predicates" as S4
    state "5: Update service layer" as S5
    state "6: Update transitions" as S6
    state "7: Migrate test fixtures" as S7
    state "8: Update ONBAS" as S8
    state "9: Update reality layer" as S9
    state "10: Backward compat test" as S10
    state "11: Final verification" as S11

    [*] --> S1
    S1 --> S2
    S2 --> S3
    S3 --> S4
    S4 --> S5
    S5 --> S6
    S6 --> S7
    S7 --> S8
    S8 --> S9
    S9 --> S10
    S10 --> S11
    S11 --> [*]

    class S1,S2,S3,S4,S5,S6 done
    class S7 done
    class S8,S9 done
    class S10 done
    class S11 done
```

**Legend**: grey = pending | yellow = active | red = blocked/needs input | green = done

---

## Stages

<!-- Updated by /plan-6 during implementation: [ ] → [~] → [x] -->

- [x] **Stage 1: Update status enum** — remove `'running'`, add `'starting'` + `'agent-accepted'` to `NodeExecutionStatusSchema` (`schemas/state.schema.ts`)
- [x] **Stage 2: Add events array** — add `events: z.array(NodeEventSchema).optional()` to `NodeStateEntrySchema` (`schemas/state.schema.ts`)
- [x] **Stage 3: Write predicate tests** — TDD red phase for `isNodeActive()` and `canNodeDoWork()` (`test/.../032-node-event-system/event-helpers.test.ts` — new file)
- [x] **Stage 4: Implement predicates** — create `isNodeActive()` and `canNodeDoWork()` in feature folder (`features/032-node-event-system/event-helpers.ts` — new file)
- [x] **Stage 5: Update service layer** — replace 12 `'running'` references with predicates and new statuses (`services/positional-graph.service.ts`)
- [x] **Stage 6: Update transitions** — rewrite valid-transitions map for `starting` and `agent-accepted` (`services/positional-graph.service.ts`)
- [x] **Stage 7: Migrate test fixtures** — update `'running'` references across ~12 positional-graph test files to use `'starting'` or `'agent-accepted'`
- [x] **Stage 8: Update ONBAS** — replace `case 'running':` with `case 'starting': case 'agent-accepted':` (`features/030-orchestration/onbas.ts`)
- [x] **Stage 9: Update reality layer** — update type unions, schema enum, builder filter, fake ONBAS, and interface types (5 files in `features/030-orchestration/` + `interfaces/`)
- [x] **Stage 10: Backward compat test** — verify old state.json without events parses correctly (`test/.../032-node-event-system/backward-compat.test.ts` — new file)
- [x] **Stage 11: Final verification** — run `just fft`, confirm full test suite green

---

## Architecture: Before & After

```mermaid
flowchart LR
    classDef existing fill:#E8F5E9,stroke:#4CAF50,color:#000
    classDef changed fill:#FFF3E0,stroke:#FF9800,color:#000
    classDef new fill:#E3F2FD,stroke:#2196F3,color:#000

    subgraph Before["Before Phase 2"]
        SS1["State Schema<br/>status: running"]:::existing
        PGS1["Graph Service<br/>12x === 'running'"]:::existing
        ONBAS1["ONBAS<br/>case 'running':"]:::existing
        REAL1["Reality Layer<br/>ExecutionStatus: running"]:::existing
        P1["Phase 1 Schemas<br/>NodeEventSchema"]:::existing
    end

    subgraph After["After Phase 2"]
        SS2["State Schema<br/>starting | agent-accepted<br/>+ events array"]:::changed
        EH["Event Helpers<br/>isNodeActive()<br/>canNodeDoWork()"]:::new
        PGS2["Graph Service<br/>uses predicates"]:::changed
        ONBAS2["ONBAS<br/>case starting/accepted"]:::changed
        REAL2["Reality Layer<br/>ExecutionStatus updated"]:::changed
        P1B["Phase 1 Schemas"]:::existing
    end

    P1B -->|NodeEventSchema| SS2
    EH --> PGS2
    EH --> ONBAS2
    SS2 --> PGS2
    SS2 --> REAL2
```

**Legend**: existing (green, unchanged) | changed (orange, modified) | new (blue, created)

---

## Acceptance Criteria

- [x] Two new statuses (`starting`, `agent-accepted`) replace `running` (AC-6)
- [x] `events` array on NodeStateEntry is optional (AC-17)
- [x] All existing tests updated and passing
- [x] Old state.json files parse without error (AC-17)
- [x] `just fft` clean

## Goals & Non-Goals

**Goals**:
- Replace `'running'` with `'starting'` + `'agent-accepted'` in all schemas and code
- Add optional `events` array to node state entries
- Create `isNodeActive()` and `canNodeDoWork()` predicate helpers
- Update ONBAS, reality layer, and all service references
- Migrate all test fixtures to new status values
- Verify backward compatibility with existing state files

**Non-Goals**:
- `raiseEvent()` write path (Phase 3)
- Event handlers and state transitions via events (Phase 4)
- Service method wrappers routing through events (Phase 5)
- CLI commands (Phase 6)
- ONBAS reading event log (Phase 7 — this phase only updates status switch)
- Web UI / E2E test updates (outside Plan 032 scope)

---

## Checklist

- [x] T001: Update `NodeExecutionStatusSchema` enum (CS-2)
- [x] T002: Add events array to `NodeStateEntrySchema` (CS-1)
- [x] T003: Write predicate tests — RED (CS-1)
- [x] T004: Implement predicates — GREEN (CS-1)
- [x] T005: Update service layer — replace `'running'` refs (CS-3)
- [x] T006: Update `transitionNodeState()` valid-states map (CS-2)
- [x] T007: Migrate test fixtures (CS-2)
- [x] T008: Update ONBAS switch cases (CS-2)
- [x] T009: Update FakeONBAS, reality, interfaces (CS-1)
- [x] T010: Backward compatibility test (CS-1)
- [x] T011: `just fft` verification (CS-1)

---

## PlanPak

Active — new files organized under `features/032-node-event-system/`. Cross-plan edits to 7 files in `schemas/`, `services/`, `interfaces/`, and `features/030-orchestration/`.
