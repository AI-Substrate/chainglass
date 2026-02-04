# Flight Plan: Phase 3 — Node Lifecycle

**Plan**: [../../pos-agentic-cli-plan.md](../../pos-agentic-cli-plan.md)
**Phase**: Phase 3: Node Lifecycle
**Generated**: 2026-02-03
**Status**: Landed

---

## Departure → Destination

**Where we are**: Phases 1-2 established the foundation — 7 error codes (E172-E179), Question schema, NodeStateEntry extensions, test helpers, and output storage (4 service methods, 4 CLI commands). Agents can now save and retrieve outputs, but they cannot signal when they start or finish work — there are no lifecycle transition commands.

**Where we're going**: By the end of this phase, agents can signal their execution state via three new CLI commands. Running `cg wf node start sample-e2e node-1` transitions the node to `running`. Running `cg wf node can-end sample-e2e node-1` checks if all required outputs are saved. Running `cg wf node end sample-e2e node-1` transitions the node to `complete`. Running state is required for saving outputs (E176 returned otherwise).

---

## Flight Status

<!-- Updated by /plan-6: pending → active → done. Use blocked for problems/input needed. -->

```mermaid
stateDiagram-v2
    classDef pending fill:#9E9E9E,stroke:#757575,color:#fff
    classDef active fill:#FFC107,stroke:#FFA000,color:#000
    classDef done fill:#4CAF50,stroke:#388E3C,color:#fff
    classDef blocked fill:#F44336,stroke:#D32F2F,color:#fff

    state "1: Write lifecycle tests" as S1
    state "2: Impl transitionNodeState" as S2
    state "3: Add interface types" as S3
    state "4: Impl startNode" as S4
    state "5: Impl canEnd" as S5
    state "6: Add can-end CLI" as S6
    state "7: Add start CLI" as S7
    state "8: Impl endNode" as S8
    state "9: Write endNode tests" as S9
    state "10: Add end CLI" as S10

    [*] --> S1
    S1 --> S2
    S1 --> S3
    S2 --> S4
    S3 --> S4
    S3 --> S5
    S4 --> S7
    S5 --> S6
    S5 --> S8
    S9 --> S8
    S8 --> S10
    S10 --> [*]

    class S1,S2,S3,S4,S5,S6,S7,S8,S9,S10 done
```

**Legend**: grey = pending | yellow = active | red = blocked/needs input | green = done

---

## Stages

<!-- Updated by /plan-6 during implementation: [ ] → [~] → [x] -->

- [x] **Stage 1: Write lifecycle tests (TDD RED)** — Tests for transitionNodeState, startNode, canEnd (`execution-lifecycle.test.ts` — new file)
- [x] **Stage 2: Implement transitionNodeState helper** — Private method for atomic state mutations (`positional-graph.service.ts`)
- [x] **Stage 3: Add interface types and signatures** — StartNodeResult, CanEndResult, EndNodeResult (`positional-graph-service.interface.ts`)
- [x] **Stage 4: Implement startNode** — Transitions pending/ready → running with timestamp (`positional-graph.service.ts`)
- [x] **Stage 5: Implement canEnd** — Check required outputs against WorkUnit declarations (`positional-graph.service.ts`)
- [x] **Stage 6: Add can-end CLI** — Command handler with JSON output (`positional-graph.command.ts`)
- [x] **Stage 7: Add start CLI** — Command handler with JSON output (`positional-graph.command.ts`)
- [x] **Stage 8: Implement endNode** — Requires running state, validates outputs saved (`positional-graph.service.ts`)
- [x] **Stage 9: Write endNode tests (TDD RED)** — Tests including state validation (`execution-lifecycle.test.ts`)
- [x] **Stage 10: Add end CLI** — Command handler with JSON output (`positional-graph.command.ts`)

---

## Acceptance Criteria

- [x] AC-1: `cg wf node start <slug> <nodeId>` transitions ready node to `running` with `started_at` timestamp
- [x] AC-2: `cg wf node end <slug> <nodeId>` transitions running node to `complete` with `completed_at` timestamp
- [x] AC-3: `cg wf node can-end <slug> <nodeId>` returns `canEnd: true` only when all required outputs saved
- [x] AC-4: Running state required for outputs — `saveOutputData`/`saveOutputFile` return E176 if not running
- [x] AC-16: Invalid state transitions return E172
- [x] AC-17: Missing outputs on `end` returns E175 with list of missing output names

---

## Goals & Non-Goals

**Goals**:
- Create `transitionNodeState()` private helper for atomic state mutations
- Implement `canEnd` service method with output validation
- Implement `startNode` service method with state machine validation
- Implement `endNode` service method with running state requirement
- Add 3 CLI commands (`start`, `end`, `can-end`) with JSON output
- Full TDD coverage for all methods including error paths

**Non-Goals**:
- Question/answer protocol (Phase 4)
- Input retrieval (Phase 5)
- E2E test script (Phase 6)
- Fail command to set `blocked-error` status (documented gap)
- WorkUnit output declaration validation warnings (graceful degradation)

---

## Architecture: Before & After

```mermaid
flowchart LR
    classDef existing fill:#E8F5E9,stroke:#4CAF50,color:#000
    classDef changed fill:#FFF3E0,stroke:#FF9800,color:#000
    classDef new fill:#E3F2FD,stroke:#2196F3,color:#000

    subgraph Before["Before Phase 3"]
        PS1[PositionalGraphService<br/>37 methods]:::existing
        INT1[IPositionalGraphService<br/>37 signatures]:::existing
        CLI1[positional-graph.command.ts<br/>~39 commands]:::existing
        ERR1[Error Codes<br/>E172-E179]:::existing
        STATE1[state.json<br/>nodes status storage]:::existing
    end

    subgraph After["After Phase 3"]
        PS2[PositionalGraphService<br/>+3 lifecycle methods<br/>+1 private helper]:::changed
        INT2[IPositionalGraphService<br/>+3 signatures, +3 result types]:::changed
        CLI2[positional-graph.command.ts<br/>+3 commands]:::changed
        ERR2[Error Codes<br/>E172, E175, E176 used]:::existing
        STATE2[state.json<br/>status, started_at, completed_at]:::existing
        TST2[execution-lifecycle.test.ts<br/>22 tests]:::new

        PS2 --> STATE2
        CLI2 --> PS2
        PS2 --> ERR2
        TST2 --> PS2
    end
```

**Legend**: existing (green, unchanged) | changed (orange, modified) | new (blue, created)

---

## Checklist

- [x] T001: Write tests for transitionNodeState, startNode, canEnd (CS-3)
- [x] T002: Implement private transitionNodeState helper (CS-3)
- [x] T003: Add interface signatures and result types (CS-2)
- [x] T004: Implement startNode in service (CS-2)
- [x] T005: Implement canEnd in service (CS-2)
- [x] T006: Add CLI command `cg wf node can-end` (CS-2)
- [x] T007: Add CLI command `cg wf node start` (CS-2)
- [x] T008: Implement endNode in service (CS-3)
- [x] T009: Write tests for endNode including state validation (CS-3)
- [x] T010: Add CLI command `cg wf node end` (CS-2)
- [x] T011: Update saveOutputData/saveOutputFile to require running state (CS-2)

---

## PlanPak

Active — files organized under `packages/positional-graph/src/features/028-pos-agentic-cli/`
