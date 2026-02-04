# Flight Plan: Phase 3 — CLI Integration

**Plan**: [../../agentic-work-units-plan.md](../../agentic-work-units-plan.md)
**Phase**: Phase 3: CLI Integration
**Generated**: 2026-02-04
**Status**: Landed

---

## Departure → Destination

**Where we are**: Phases 1-2 completed the type system foundation and service layer. We have discriminated union types (`AgenticWorkUnit`, `CodeUnit`, `UserInputUnit`), Zod schemas, error factories (E180-E187), `WorkUnitService` with `list()`, `load()`, `validate()`, and rich domain objects with `getPrompt()` and `getScript()` methods. The infrastructure exists but has no user-facing access point — the CLI doesn't know about reserved parameters yet.

**Where we're going**: By the end of this phase, a running agent can call `cg wf node get-input-data <graph> <node> main-prompt` to retrieve its prompt template content. The CLI will detect reserved parameters (`main-prompt`, `main-script`), route them to `IWorkUnitService`, and return template content. Type mismatches (e.g., `main-prompt` on CodeUnit) will return E186 errors. The DI container will wire `IWorkUnitLoader` to the new `WorkUnitService`, and new `cg wf unit` subcommands will enable unit inspection.

---

## Flight Status

<!-- Updated by /plan-6: pending → active → done. Use blocked for problems/input needed. -->

```mermaid
stateDiagram-v2
    classDef pending fill:#9E9E9E,stroke:#757575,color:#fff
    classDef active fill:#FFC107,stroke:#FFA000,color:#000
    classDef done fill:#4CAF50,stroke:#388E3C,color:#fff
    classDef blocked fill:#F44336,stroke:#D32F2F,color:#fff

    state "1: DI registration" as S1
    state "2: DI tests" as S2
    state "3: Reserved param tests" as S3
    state "4: Implement routing" as S4
    state "5: Unit cmd tests" as S5
    state "6: Implement unit cmds" as S6
    state "7: Refactor" as S7

    [*] --> S1
    S1 --> S2
    S2 --> S3
    S3 --> S4
    S4 --> S5
    S5 --> S6
    S6 --> S7
    S7 --> [*]

    class S1,S2,S3,S4,S5,S6,S7 done
```

**Legend**: grey = pending | yellow = active | red = blocked/needs input | green = done

---

## Stages

<!-- Updated by /plan-6 during implementation: [ ] → [~] → [x] -->

- [x] **Stage 1: Register WorkUnit services in DI container** — add WorkUnitAdapter and WorkUnitService to positional-graph container, wire IWorkUnitLoader to WorkUnitService (`packages/positional-graph/src/container.ts`, `apps/cli/src/lib/container.ts`)
- [x] **Stage 2: Write DI resolution tests** — verify IWorkUnitService and IWorkUnitLoader resolve correctly (`test/unit/positional-graph/container.test.ts` — new file)
- [x] **Stage 3: Write reserved parameter tests** — TDD RED for main-prompt routing, main-script routing, E186 type mismatch (`test/unit/cli/positional-graph-command.test.ts` — new file)
- [x] **Stage 4: Implement reserved parameter routing** — add detection and routing logic to handleNodeGetInputData (`apps/cli/src/commands/positional-graph.command.ts`)
- [x] **Stage 5: Write unit subcommand tests** — TDD RED for list, info, get-template commands (`test/unit/cli/positional-graph-command.test.ts`)
- [x] **Stage 6: Implement unit subcommands** — add cg wf unit list/info/get-template commands (`apps/cli/src/commands/positional-graph.command.ts`)
- [x] **Stage 7: Refactor CLI structure** — clean up, verify all tests pass

---

## Acceptance Criteria

- [x] AC-2: `cg wf node get-input-data <graph> <node> main-prompt` returns prompt template content for AgenticWorkUnit
- [x] AC-3: `cg wf node get-input-data <graph> <node> main-script` returns script file content for CodeUnit
- [x] AC-4: `cg wf node get-input-data <graph> <code-node> main-prompt` returns E186 (UnitTypeMismatch) error

---

## Goals & Non-Goals

**Goals**:
- Add reserved parameter detection (`main-prompt`, `main-script`) in `get-input-data` command
- Route reserved parameters to `IWorkUnitService` template content methods
- Return E186 error for type mismatch (e.g., `main-prompt` on CodeUnit)
- Register `WorkUnitService` and `WorkUnitAdapter` in DI container
- Wire `IWorkUnitLoader` to new `WorkUnitService` (replacing workgraph bridge internally)
- Add `cg wf unit list`, `cg wf unit info`, `cg wf unit get-template` subcommands

**Non-Goals**:
- Remove workgraph bridge completely (Phase 5)
- Create on-disk unit YAML files (Phase 5)
- E2E test sections 13-15 (Phase 4)
- Template variable substitution (agents handle this themselves)
- Caching of unit definitions or templates

---

## Architecture: Before & After

```mermaid
flowchart LR
    classDef existing fill:#E8F5E9,stroke:#4CAF50,color:#000
    classDef changed fill:#FFF3E0,stroke:#FF9800,color:#000
    classDef new fill:#E3F2FD,stroke:#2196F3,color:#000

    subgraph Before["Before Phase 3"]
        CLI1[CLI Commands]:::existing
        PGS1[PositionalGraphService]:::existing
        WGB[Workgraph Bridge]:::existing
        WUS1[WorkUnitService]:::existing

        CLI1 --> PGS1
        PGS1 --> WGB
        WGB -.-> WUS1
    end

    subgraph After["After Phase 3"]
        CLI2[CLI Commands]:::changed
        PGS2[PositionalGraphService]:::changed
        WUS2[WorkUnitService]:::existing
        WUA2[WorkUnitAdapter]:::existing
        DI2[DI Container]:::changed
        UNIT2[Unit Subcommands]:::new

        CLI2 --> PGS2
        CLI2 --> UNIT2
        PGS2 --> WUS2
        UNIT2 --> WUS2
        DI2 --> WUS2
        DI2 --> WUA2
        WUS2 --> WUA2
    end
```

**Legend**: existing (green, unchanged) | changed (orange, modified) | new (blue, created)

---

## Checklist

- [x] T001: Write tests for reserved parameter detection (CS-2)
- [x] T002: Write tests for type mismatch error E186 (CS-1)
- [x] T003: Implement reserved parameter routing (CS-2)
- [x] T004: Write tests for `cg wf unit list` command (CS-1)
- [x] T005: Write tests for `cg wf unit info` command (CS-1)
- [x] T006: Write tests for `cg wf unit get-template` command (CS-1)
- [x] T007: Implement unit subcommands (CS-2)
- [x] T008: Add DI registration to positional-graph container.ts (CS-1)
- [x] T009: Write DI resolution tests (CS-1)
- [x] T010: Refactor CLI command structure (CS-1)

---

## PlanPak

Active — files organized under `features/029-agentic-work-units/`
