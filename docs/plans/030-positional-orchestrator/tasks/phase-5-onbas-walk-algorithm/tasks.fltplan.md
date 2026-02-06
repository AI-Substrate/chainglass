# Flight Plan: Phase 5 — ONBAS Walk Algorithm

**Plan**: [../../positional-orchestrator-plan.md](../../positional-orchestrator-plan.md)
**Phase**: Phase 5: ONBAS Walk Algorithm
**Generated**: 2026-02-06
**Status**: Landed

---

## Departure → Destination

**Where we are**: Phases 1-4 delivered four foundational pieces: an immutable `PositionalGraphReality` snapshot that captures the entire graph state with navigation helpers, a 4-type `OrchestrationRequest` discriminated union defining every possible action the orchestrator can take, a pure `getContextSource()` function for agent context inheritance, and execution containers (AgentPod, CodePod) with a PodManager for lifecycle and session persistence. The system can read graph state, express actions, determine context rules, and execute nodes — but nothing can decide *which* action to take next. There is no decision engine.

**Where we're going**: By the end of this phase, a developer can call `walkForNextAction(reality)` with any graph snapshot and get back the exact next action to take. The function walks lines in order, visits nodes by position, and returns the first actionable request — whether that's starting a ready node, resuming one with an answered question, or surfacing an unsurfaced question. When nothing can be done, it returns `no-action` with a diagnostic reason explaining why. The function is pure, synchronous, and stateless — same input always produces the same output.

---

## Flight Status

<!-- Updated by /plan-6: pending → active → done. Use blocked for problems/input needed. -->

```mermaid
stateDiagram-v2
    classDef pending fill:#9E9E9E,stroke:#757575,color:#fff
    classDef active fill:#FFC107,stroke:#FFA000,color:#000
    classDef done fill:#4CAF50,stroke:#388E3C,color:#fff
    classDef blocked fill:#F44336,stroke:#D32F2F,color:#fff

    state "1: Interface + fake + helper" as S1
    state "2: Basic walk tests" as S2
    state "3: Multi-line tests" as S3
    state "4: Question tests" as S4
    state "5: No-action tests" as S5
    state "6: Skip logic tests" as S6
    state "7: Implement walk" as S7
    state "8: Purity tests" as S8
    state "9: Barrel + verify" as S9

    [*] --> S1
    S1 --> S2
    S1 --> S3
    S1 --> S4
    S1 --> S5
    S1 --> S6
    S2 --> S7
    S3 --> S7
    S4 --> S7
    S5 --> S7
    S6 --> S7
    S7 --> S8
    S8 --> S9
    S9 --> [*]

    class S1 done
    class S2,S3,S4,S5,S6,S8 done
    class S7 done
    class S9 done
```

**Legend**: grey = pending | yellow = active | red = blocked/needs input | green = done

---

## Stages

<!-- Updated by /plan-6 during implementation: [ ] → [~] → [x] -->

- [x] **Stage 1: Define IONBAS interface, FakeONBAS, and buildFakeReality helper** — interface with `getNextAction()`, class wrapper, configurable fake, test fixture builder (`onbas.types.ts`, `fake-onbas.ts` — new files)
- [x] **Stage 2: Write basic walk tests** — single ready node, graph-level short circuits (complete, failed), empty graph (`onbas.test.ts` — new file)
- [x] **Stage 3: Write multi-line walk order tests** — positional ordering, cross-line traversal, empty line passthrough, first-match stops walk (`onbas.test.ts`)
- [x] **Stage 4: Write question handling tests** — 3 sub-states: unsurfaced → question-pending, surfaced+unanswered → skip, answered → resume-node (`onbas.test.ts`)
- [x] **Stage 5: Write no-action scenario tests** — all-running, transition-blocked, diagnoseStuckLine, all-blocked (`onbas.test.ts`)
- [x] **Stage 6: Write skip logic tests** — table-driven: running/complete/pending/blocked-error skipped, ready starts (`onbas.test.ts`)
- [x] **Stage 7: Implement walkForNextAction** — pure function with visitNode, visitWaitingQuestion, diagnoseStuckLine (`onbas.ts` — new file)
- [x] **Stage 8: Write purity/determinism tests** — same input → same output, no side effects (AC-4) (`onbas.test.ts`)
- [x] **Stage 9: Update barrel and verify** — add Phase 5 exports to index, run `just fft` (`index.ts`)

---

## Architecture: Before & After

```mermaid
flowchart LR
    classDef existing fill:#E8F5E9,stroke:#4CAF50,color:#000
    classDef changed fill:#FFF3E0,stroke:#FF9800,color:#000
    classDef new fill:#E3F2FD,stroke:#2196F3,color:#000

    subgraph Before["Before Phase 5"]
        PGS1["Positional Graph Service"]:::existing
        Reality1["PositionalGraphReality<br/>(snapshot + view)"]:::existing
        OR1["OrchestrationRequest<br/>(4-type union)"]:::existing
        ACS1["AgentContextService<br/>(context rules)"]:::existing
        PM1["PodManager<br/>(lifecycle + sessions)"]:::existing
        Pods1["AgentPod + CodePod<br/>(execution containers)"]:::existing

        PGS1 -->|"getStatus()"| Reality1
    end

    subgraph After["After Phase 5"]
        PGS2["Positional Graph Service"]:::existing
        Reality2["PositionalGraphReality<br/>(snapshot + view)"]:::existing
        OR2["OrchestrationRequest<br/>(4-type union)"]:::existing
        ACS2["AgentContextService<br/>(context rules)"]:::existing
        PM2["PodManager<br/>(lifecycle + sessions)"]:::existing
        Pods2["AgentPod + CodePod<br/>(execution containers)"]:::existing

        PGS2 -->|"getStatus()"| Reality2

        ONBAS["walkForNextAction<br/>(pure rules engine)"]:::new
        FONBAS["FakeONBAS<br/>(test double)"]:::new

        Reality2 -->|"input"| ONBAS
        ONBAS -->|"output"| OR2
    end
```

**Legend**: existing (green, unchanged) | changed (orange, modified) | new (blue, created)

---

## Acceptance Criteria

- [x] Walk visits lines in index order, nodes in position order (AC-3)
- [x] Each node status maps to the correct action or skip behavior (AC-3)
- [x] Pure, synchronous, stateless — same input always same output (AC-4)
- [x] Question lifecycle handled correctly for all 3 sub-states
- [x] `just fft` clean

---

## Goals & Non-Goals

**Goals**:
- Define `IONBAS` interface with `getNextAction(reality): OrchestrationRequest`
- Export `walkForNextAction()` as standalone pure function
- Implement `ONBAS` class wrapper for interface injection
- Implement `FakeONBAS` with configurable return values and call tracking
- Provide `buildFakeReality()` test helper
- Handle all 6 node statuses and 3 question sub-states
- Handle graph-level short circuits and line-level transition gates
- Enrich no-action with diagnostic reasons

**Non-Goals**:
- Action execution (Phase 6 ODS)
- Context inheritance (Phase 3 AgentContextService)
- Pod management (Phase 4 PodManager)
- Multiple actions per call
- Async or stateful behavior
- Unit type awareness (ONBAS reads `status` only)
- Infinite loop detection (Phase 7 loop responsibility)

---

## Checklist

- [x] T001: Define `IONBAS` interface + `FakeONBAS` + `buildFakeReality()` (CS-2)
- [x] T002: Write basic walk tests (CS-1)
- [x] T003: Write multi-line walk order tests (CS-2)
- [x] T004: Write question handling tests (CS-2)
- [x] T005: Write no-action scenario tests (CS-2)
- [x] T006: Write skip logic tests (CS-1)
- [x] T007: Implement `walkForNextAction()` (CS-3)
- [x] T008: Write purity/determinism tests (CS-1)
- [x] T009: Update barrel + `just fft` (CS-1)

---

## PlanPak

Active — files organized under `features/030-orchestration/`
