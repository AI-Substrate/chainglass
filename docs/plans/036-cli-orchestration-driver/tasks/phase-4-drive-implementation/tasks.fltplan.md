# Flight Plan: Phase 4 — drive() Implementation

**Plan**: [cli-orchestration-driver-plan.md](../../cli-orchestration-driver-plan.md)
**Phase**: Phase 4: drive() Implementation
**Generated**: 2026-02-17
**Status**: Ready for takeoff

---

## Departure → Destination

**Where we are**: `drive()` exists as a stub that throws "not implemented". Types are defined (Phase 1), prompts work (Phase 2), and `formatGraphStatus()` renders visual state (Phase 3). But there's no way to drive a graph to completion — only manual `run()` calls.

**Where we're going**: A working `drive()` that polls `run()` repeatedly until the graph completes, fails, or hits max iterations. Emits status events after each iteration. Persists sessions after actions. Agent-agnostic per ADR-0012.

---

## Flight Status

```mermaid
stateDiagram-v2
    classDef pending fill:#9E9E9E,stroke:#757575,color:#fff
    classDef done fill:#4CAF50,stroke:#388E3C,color:#fff

    state "1: RED tests (all)" as S1
    state "2: FakePodManager enhancement" as S2
    state "3: Implement drive() (GREEN)" as S3
    state "4: Validate + fft" as S4

    [*] --> S1
    S1 --> S2
    S2 --> S3
    S3 --> S4
    S4 --> [*]

    class S1,S2,S3,S4 pending
```

---

## Stages

- [ ] **Stage 1: Write all RED tests** — happy path, failures, delays, events, sessions (T001-T004)
- [ ] **Stage 2: Enhance FakePodManager** — add persistSessions tracking + write session RED tests (T005)
- [ ] **Stage 3: Implement drive()** — replace stub, all tests GREEN (T006)
- [ ] **Stage 4: Validate** — domain boundary check + `just fft` clean (T007)

---

## Acceptance Criteria

- [ ] drive() calls run() repeatedly until terminal stopReason (AC-22)
- [ ] Returns DriveResult with exitReason, iterations, totalActions
- [ ] Short delay after actions, long delay after no-action (AC-23)
- [ ] Exits on graph-complete or graph-failed (AC-24)
- [ ] Configurable max iterations (AC-25)
- [ ] Emits DriveEvent for orchestration status (AC-26)
- [ ] Agent-agnostic: no pod/agent/event knowledge (ADR-0012)
- [ ] `just fft` clean

---

## Checklist

- [ ] T001: RED happy path tests (CS-3)
- [ ] T002: RED failure path tests (CS-2)
- [ ] T003: RED delay strategy tests (CS-2)
- [ ] T004: RED event emission tests (CS-2)
- [ ] T005: FakePodManager enhancement + RED session tests (CS-2)
- [ ] T006: Implement GraphOrchestration.drive() (CS-3)
- [ ] T007: Refactor + domain boundary + just fft (CS-1)

---

## Architecture: Before & After

```mermaid
flowchart LR
    classDef existing fill:#E8F5E9,stroke:#4CAF50,color:#000
    classDef changed fill:#FFF3E0,stroke:#FF9800,color:#000

    subgraph Before["Before Phase 4"]
        GO1["GraphOrchestration<br/>run() + drive() STUB"]:::existing
        FS1["formatGraphStatus()"]:::existing
    end

    subgraph After["After Phase 4"]
        GO2["GraphOrchestration<br/>run() + drive() REAL"]:::changed
        FS2["formatGraphStatus()"]:::existing
        GO2 -->|"calls per iteration"| FS2
        GO2 -->|"loop: run() → check → emit → persist → delay"| GO2
    end
```

---

## PlanPak

`graph-orchestration.ts` is a cross-plan-edit. `drive.test.ts` is plan-scoped. `fake-pod-manager.ts` is a cross-plan-edit (GAP-1 enhancement).
