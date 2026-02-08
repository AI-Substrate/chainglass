# Flight Plan: Phase 7 — IEventHandlerService

**Plan**: [node-event-system-plan.md](../../node-event-system-plan.md)
**Phase**: Phase 7: IEventHandlerService — Graph-Wide Event Processor
**Generated**: 2026-02-08
**Status**: Ready for takeoff

---

## Departure → Destination

**Where we are**: Phases 1-6 of Plan 032 are complete. The node event system has schemas, a registry, the core write path (`raiseEvent`), six event handlers for state transitions, a first-class per-node service (`INodeEventService` with `handleEvents`), and CLI commands for event discovery, raising, and inspection. Events can be raised, validated, handled, and stamped on individual nodes. But there's no way to process events across an entire graph in one call — the missing piece for the orchestration loop.

**Where we're going**: By the end of this phase, a single `processGraph(state, subscriber, context)` call will iterate every node, find unstamped events, delegate per-node handling to `INodeEventService`, and return a `ProcessGraphResult` with counts of nodes visited, events processed, and handler invocations. Plan 030's orchestration loop can then use this as its Settle phase: one call settles the entire graph before ONBAS decides what to do next.

---

## Flight Status

<!-- Updated by /plan-6: pending → active → done. Use blocked for problems/input needed. -->

```mermaid
stateDiagram-v2
    classDef pending fill:#9E9E9E,stroke:#757575,color:#fff
    classDef active fill:#FFC107,stroke:#FFA000,color:#000
    classDef done fill:#4CAF50,stroke:#388E3C,color:#fff
    classDef blocked fill:#F44336,stroke:#D32F2F,color:#fff

    state "1: Define interface" as S1
    state "2: Build fake" as S2
    state "3: Write tests RED" as S3
    state "4: Implement GREEN" as S4
    state "5: Contract tests" as S5
    state "6: Dispatch tests" as S6
    state "7: Integration test" as S7
    state "8: Exports + regression" as S8

    [*] --> S1
    S1 --> S2
    S2 --> S3
    S3 --> S4
    S4 --> S5
    S4 --> S6
    S4 --> S7
    S5 --> S8
    S6 --> S8
    S7 --> S8
    S8 --> [*]

    class S1,S2,S3,S4,S5,S6,S7,S8 pending
```

**Legend**: grey = pending | yellow = active | red = blocked/needs input | green = done

---

## Stages

<!-- Updated by /plan-6 during implementation: [ ] → [~] → [x] -->

- [ ] **Stage 1: Define IEventHandlerService interface** — `ProcessGraphResult` type with three count fields and `IEventHandlerService` with single `processGraph()` method (`event-handler-service.interface.ts` — new file)
- [ ] **Stage 2: Build FakeEventHandlerService** — test double with `getHistory()`, `setResult()`, `reset()` following the `FakeNodeEventService` pattern (`fake-event-handler-service.ts` — new file)
- [ ] **Stage 3: Write unit tests RED** — orchestration logic tests using `FakeNodeEventService`: empty graph, single node, multiple nodes, stamped-events-skipped, correct counts (`event-handler-service.test.ts` — new file)
- [ ] **Stage 4: Implement EventHandlerService GREEN** — single-dep constructor taking `INodeEventService`, iterates `state.nodes`, calls `getUnstampedEvents()` + `handleEvents()` per node (`event-handler-service.ts` — new file)
- [ ] **Stage 5: Contract tests** — shared contract verifying empty-graph result and return type shape, run against both fake and real implementations (`test/contracts/event-handler-service.contract.ts`, `.contract.test.ts` — new files)
- [ ] **Stage 6: Handler dispatch tests** — real EHS + real NES + spy handler functions proving dispatch pipeline: matching events fire handlers, stamped events skipped, context filtering works (`event-handler-service-handlers.test.ts` — new file)
- [ ] **Stage 7: Integration test** — real EHS + real NES + real handlers, multi-node graph with mixed event types, verify state mutations and idempotency (`test/integration/positional-graph/event-handler-service.integration.test.ts` — new file)
- [ ] **Stage 8: Update barrel exports and regression** — add `IEventHandlerService`, `ProcessGraphResult`, `EventHandlerService`, `FakeEventHandlerService` to `index.ts`; `just fft` clean

---

## Architecture: Before & After

```mermaid
flowchart LR
    classDef existing fill:#E8F5E9,stroke:#4CAF50,color:#000
    classDef changed fill:#FFF3E0,stroke:#FF9800,color:#000
    classDef new fill:#E3F2FD,stroke:#2196F3,color:#000

    subgraph Before["Before Phase 7"]
        NES1[NodeEventService<br/>per-node handling]:::existing
        REG1[EventHandlerRegistry<br/>handler dispatch]:::existing
        H1[6 Core Handlers<br/>state transitions]:::existing
        NES1 --> REG1
        REG1 --> H1
    end

    subgraph After["After Phase 7"]
        EHS[EventHandlerService<br/>graph-wide processing]:::new
        NES2[NodeEventService<br/>per-node handling]:::existing
        REG2[EventHandlerRegistry<br/>handler dispatch]:::existing
        H2[6 Core Handlers<br/>state transitions]:::existing
        EHS -->|"for each node"| NES2
        NES2 --> REG2
        REG2 --> H2
    end
```

**Legend**: existing (green, unchanged) | changed (orange, modified) | new (blue, created)

---

## Acceptance Criteria

- [ ] IEventHandlerService processes all unhandled events across the graph before ONBAS walks (AC-16 revised)
- [ ] processGraph() returns correct counts: nodesVisited, eventsProcessed, handlerInvocations
- [ ] Second processGraph() call with same subscriber returns eventsProcessed: 0 (idempotent)
- [ ] FakeEventHandlerService passes same contract tests as real implementation
- [ ] Barrel exports enable Plan 030 to import IEventHandlerService
- [ ] `just fft` clean

## Goals & Non-Goals

**Goals**:
- Define IEventHandlerService interface and ProcessGraphResult return type
- Implement EventHandlerService with single dependency on INodeEventService
- Implement FakeEventHandlerService with call history and pre-configured results
- Test coverage at three levels: orchestration, dispatch, contract
- Update barrel exports for downstream consumption

**Non-Goals**:
- ONBAS changes (not needed — EHS settles before ONBAS runs)
- Web-specific handlers (deferred to Plan 030 web integration)
- DI container registration (internal collaborator, not public DI token)
- Reality builder changes (NodeReality does not need events field)

---

## Checklist

- [ ] T001: Define IEventHandlerService interface + ProcessGraphResult (CS-1)
- [ ] T002: Implement FakeEventHandlerService with test helpers (CS-1)
- [ ] T003: Write unit tests RED — orchestration logic (CS-2)
- [ ] T004: Implement EventHandlerService GREEN (CS-2)
- [ ] T005: Write contract tests — fake/real parity (CS-2)
- [ ] T006: Write handler dispatch tests — spy handlers (CS-2)
- [ ] T007: Write integration test — multi-node graph processing (CS-2)
- [ ] T008: Update barrel exports + regression verification (CS-1)

---

## PlanPak

Not active for this plan.
