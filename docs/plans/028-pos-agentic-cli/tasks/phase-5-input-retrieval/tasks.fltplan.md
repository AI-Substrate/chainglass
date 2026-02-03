# Flight Plan: Phase 5 — Input Retrieval

**Plan**: [../../pos-agentic-cli-plan.md](../../pos-agentic-cli-plan.md)
**Phase**: Phase 5: Input Retrieval
**Generated**: 2026-02-04
**Status**: Landed

---

## Departure → Destination

**Where we are**: Phases 1-4 established the foundation — 7 error codes (E172-E179), Question schema, NodeStateEntry extensions, output storage (4 methods, 4 CLI commands), node lifecycle (3 methods, 3 CLI commands), and question/answer protocol (3 methods, 3 CLI commands). Agents can now start work, save outputs, ask questions, and complete execution. The existing `collateInputs` algorithm (Plan 026) resolves inputs from upstream nodes, but there are no commands to retrieve those resolved inputs.

**Where we're going**: By the end of this phase, agents can retrieve inputs from completed upstream nodes. Running `cg wf node get-input-data sample-e2e node-B language` returns the value saved by an upstream node that node-B's input wires to. Similarly, `cg wf node get-input-file` returns the file path. A developer can complete a 3-node pipeline where node-3 retrieves inputs from node-2, which retrieved inputs from node-1.

---

## Flight Status

<!-- Updated by /plan-6: pending → active → done. Use blocked for problems/input needed. -->

```mermaid
stateDiagram-v2
    classDef pending fill:#9E9E9E,stroke:#757575,color:#fff
    classDef active fill:#FFC107,stroke:#FFA000,color:#000
    classDef done fill:#4CAF50,stroke:#388E3C,color:#fff
    classDef blocked fill:#F44336,stroke:#D32F2F,color:#fff

    state "1: Write tests (TDD RED)" as S1
    state "2: Add interface types" as S2
    state "3: Impl getInputData" as S3
    state "4: Add get-input-data CLI" as S4
    state "5: Impl getInputFile" as S5
    state "6: Add get-input-file CLI" as S6

    [*] --> S1
    S1 --> S2
    S2 --> S3
    S2 --> S5
    S3 --> S4
    S5 --> S6
    S4 --> [*]
    S6 --> [*]

    class S1,S2,S3,S4,S5,S6 done
```

**Legend**: grey = pending | yellow = active | red = blocked/needs input | green = done

---

## Stages

<!-- Updated by /plan-6 during implementation: [ ] → [~] → [x] -->

- [x] **Stage 1: Write input retrieval tests (TDD RED)** — Tests for getInputData, getInputFile (13 tests) (`test/unit/positional-graph/input-retrieval.test.ts` — new file)
- [x] **Stage 2: Add interface signatures** — GetInputDataResult, GetInputFileResult types + 2 method signatures (`positional-graph-service.interface.ts`)
- [x] **Stage 3: Implement getInputData** — Thin wrapper around collateInputs, calls getOutputData on source (`positional-graph.service.ts`)
- [x] **Stage 4: Add get-input-data CLI** — Command handler with JSON output (`positional-graph.command.ts`)
- [x] **Stage 5: Implement getInputFile** — Thin wrapper around collateInputs, calls getOutputFile on source (`positional-graph.service.ts`)
- [x] **Stage 6: Add get-input-file CLI** — Command handler with JSON output (`positional-graph.command.ts`)

---

## Acceptance Criteria

- [x] AC-12: `cg wf node get-input-data <slug> <nodeId> <name>` resolves the input wiring and returns the value from the source node
- [x] AC-13: `cg wf node get-input-file <slug> <nodeId> <name>` resolves the input wiring and returns the file path from the source node

---

## Goals & Non-Goals

**Goals**:
- Implement `getInputData` service method using `collateInputs` for resolution
- Implement `getInputFile` service method using `collateInputs` for resolution
- Add 2 CLI commands (`get-input-data`, `get-input-file`) under `cg wf node`
- Return E178 (InputNotAvailable) when source node is incomplete
- Return E175 (OutputNotFound) when source node complete but output missing
- Full TDD coverage including error paths

**Non-Goals**:
- New resolution algorithm (reuse `collateInputs`, per CF-07)
- Caching of resolved inputs (not needed for MVP)
- Input validation against WorkUnit declarations (collateInputs handles this)
- Multi-source aggregation (return first available source)
- E2E test (Phase 6)

---

## Architecture: Before & After

```mermaid
flowchart LR
    classDef existing fill:#E8F5E9,stroke:#4CAF50,color:#000
    classDef changed fill:#FFF3E0,stroke:#FF9800,color:#000
    classDef new fill:#E3F2FD,stroke:#2196F3,color:#000

    subgraph Before["Before Phase 5"]
        PS1[PositionalGraphService<br/>43 methods]:::existing
        INT1[IPositionalGraphService<br/>43 signatures]:::existing
        CLI1[positional-graph.command.ts<br/>~45 commands]:::existing
        CI1[collateInputs]:::existing
        GO1[getOutputData/File]:::existing

        PS1 --> CI1
        PS1 --> GO1
    end

    subgraph After["After Phase 5"]
        PS2[PositionalGraphService<br/>+2 input methods]:::changed
        INT2[IPositionalGraphService<br/>+2 signatures, +2 result types]:::changed
        CLI2[positional-graph.command.ts<br/>+2 commands]:::changed
        CI2[collateInputs]:::existing
        GO2[getOutputData/File]:::existing
        TST2[input-retrieval.test.ts<br/>~12-14 tests]:::new

        PS2 --> CI2
        PS2 --> GO2
        CLI2 --> PS2
        TST2 --> PS2
    end
```

**Legend**: existing (green, unchanged) | changed (orange, modified) | new (blue, created)

---

## Checklist

- [x] T001: Write tests for getInputData and getInputFile (CS-3)
- [x] T002: Add interface signatures and result types (CS-2)
- [x] T003: Implement getInputData in service (CS-2)
- [x] T004: Add CLI command `cg wf node get-input-data` (CS-2)
- [x] T005: Implement getInputFile in service (CS-2)
- [x] T006: Add CLI command `cg wf node get-input-file` (CS-2)

---

## PlanPak

Active — files organized under `packages/positional-graph/src/features/028-pos-agentic-cli/`
