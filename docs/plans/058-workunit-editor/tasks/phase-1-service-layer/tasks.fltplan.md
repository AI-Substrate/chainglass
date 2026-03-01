# Flight Plan: Phase 1 — Service Layer

**Plan**: [workunit-editor-plan.md](../../workunit-editor-plan.md)
**Phase**: Phase 1: Service Layer — Extend IWorkUnitService with CRUD
**Generated**: 2026-02-28
**Status**: Ready for takeoff

---

## Departure → Destination

**Where we are**: `IWorkUnitService` is read-only — it has `list()`, `load()`, `validate()` but no write operations. Work units can only be created via CLI (`cg unit create` using the deprecated workgraph package) or manual YAML editing. The `FakeWorkUnitService` and contract tests only cover read operations.

**Where we're going**: A developer can call `workUnitService.create()`, `.update()`, `.delete()`, and `.rename()` from any consumer (web, CLI, tests). The fake matches exactly. Contract tests prove parity. Rename cascades to update all `unit_slug` references in workflow node.yaml files. This unlocks Phase 2 (editor UI) and Phase 4 (server actions).

---

## Domain Context

### Domains We're Changing

| Domain | What Changes | Key Files |
|--------|-------------|-----------|
| `_platform/positional-graph` | Extend IWorkUnitService with 4 CRUD methods + result types + error codes. Update WorkUnitService, FakeWorkUnitService, WorkUnitAdapter. | `workunit-service.interface.ts`, `workunit.service.ts`, `fake-workunit.service.ts`, `workunit-errors.ts`, `workunit.adapter.ts` |

### Domains We Depend On (no changes)

| Domain | What We Consume | Contract |
|--------|----------------|----------|
| `_platform/file-ops` | Filesystem operations (read, write, mkdir, rmdir, rename) | `IFileSystem`, `IPathResolver` |

---

## Flight Status

<!-- Updated by /plan-6-v2: pending → active → done. -->

```mermaid
stateDiagram-v2
    classDef pending fill:#9E9E9E,stroke:#757575,color:#fff
    classDef active fill:#FFC107,stroke:#FFA000,color:#000
    classDef done fill:#4CAF50,stroke:#388E3C,color:#fff
    classDef blocked fill:#F44336,stroke:#D32F2F,color:#fff

    state "1: Interface + errors" as S1
    state "2: Fake + contract RED" as S2
    state "3: Adapter + create GREEN" as S3
    state "4: update/delete GREEN" as S4
    state "5: rename + cascade GREEN" as S5
    state "6: Build verify" as S6

    [*] --> S1
    S1 --> S2
    S2 --> S3
    S3 --> S4
    S3 --> S5
    S4 --> S6
    S5 --> S6
    S6 --> [*]

    class S1,S2 done
    class S3,S4,S5,S6 done
```

**Legend**: grey = pending | yellow = active | red = blocked/needs input | green = done

---

## Stages

<!-- Updated by /plan-6-v2 during implementation: [ ] → [~] → [x] -->

- [x] **Stage 1: Define the contract** — Extend interface with 4 method signatures + result types + error codes (`workunit-service.interface.ts`, `workunit-errors.ts`)
- [x] **Stage 2: Build the test scaffold** — Update fake with write ops + assertion helpers, write contract tests RED (`fake-workunit.service.ts`, `workunit-service.contract.ts`)
- [x] **Stage 3: Implement create** — Adapter write helpers + create() with boilerplate scaffolding (`workunit.adapter.ts`, `workunit.service.ts`)
- [x] **Stage 4: Implement update + delete** — Partial patch merge + hard delete (`workunit.service.ts`)
- [x] **Stage 5: Implement rename + cascade** — Directory rename + node.yaml rewrite across all workflows (`workunit.service.ts`)
- [x] **Stage 6: Build verification** — Full rebuild + test suite pass

---

## Architecture: Before & After

```mermaid
flowchart LR
    classDef existing fill:#E8F5E9,stroke:#4CAF50,color:#000
    classDef changed fill:#FFF3E0,stroke:#FF9800,color:#000
    classDef new fill:#E3F2FD,stroke:#2196F3,color:#000

    subgraph Before["Before Phase 1"]
        B_IF["IWorkUnitService<br/>list / load / validate"]:::existing
        B_SVC["WorkUnitService<br/>(read-only)"]:::existing
        B_FAKE["FakeWorkUnitService<br/>(read-only)"]:::existing
        B_ADPT["WorkUnitAdapter<br/>(read helpers)"]:::existing
        B_IF --> B_SVC
        B_IF --> B_FAKE
        B_SVC --> B_ADPT
    end

    subgraph After["After Phase 1"]
        A_IF["IWorkUnitService<br/>list / load / validate<br/>+ create / update /<br/>delete / rename"]:::changed
        A_SVC["WorkUnitService<br/>(read + write)"]:::changed
        A_FAKE["FakeWorkUnitService<br/>(read + write<br/>+ assertion helpers)"]:::changed
        A_ADPT["WorkUnitAdapter<br/>(read + write helpers)"]:::changed
        A_ERR["E188 / E190<br/>error codes"]:::new
        A_CT["Contract tests<br/>(CRUD coverage)"]:::new
        A_IF --> A_SVC
        A_IF --> A_FAKE
        A_SVC --> A_ADPT
        A_SVC --> A_ERR
        A_CT --> A_IF
    end
```

**Legend**: existing (green, unchanged) | changed (orange, modified) | new (blue, created)

---

## Acceptance Criteria

- [ ] AC-1: Create unit with type/slug/description
- [ ] AC-2: Scaffold with boilerplate content
- [ ] AC-3: Duplicate slug rejected
- [ ] AC-5: Edit description and version
- [ ] AC-10: Add/edit/reorder/remove inputs (service layer)
- [ ] AC-11: Add/edit/reorder/remove outputs (service layer)
- [ ] AC-12: Input name validation (service layer)
- [ ] AC-13: data_type conditional (service layer)
- [ ] AC-14: Reserved params handling (service layer)
- [ ] AC-15: At least one output enforced (service layer)
- [ ] AC-16: Delete unit
- [ ] AC-17: Deletion removes directory
- [ ] AC-18: Rename unit
- [ ] AC-19: Rename auto-updates node.yaml references
- [ ] AC-20: Rename shows affected workflows summary
- [ ] AC-27: All mutations through IWorkUnitService
- [ ] AC-28: FakeWorkUnitService updated
- [ ] AC-29: Contract tests pass

## Goals & Non-Goals

**Goals**: Extend IWorkUnitService with full CRUD, update fake, prove parity with contract tests.

**Non-Goals**: No UI, no server actions, no file watcher, no workgraph changes, no CLI changes.

---

## Checklist

- [x] T001: Extend IWorkUnitService interface with 4 method signatures + result types
- [x] T002: Add error codes E188, E190
- [x] T003: Update FakeWorkUnitService with write operations + assertion helpers
- [x] T004: Write contract tests for all CRUD operations (RED)
- [x] T005: Add write helpers to WorkUnitAdapter
- [x] T006: Implement create() (GREEN)
- [x] T007: Implement update() (GREEN)
- [x] T008: Implement delete() (GREEN)
- [x] T009: Implement rename() with cascade (GREEN)
- [x] T010: Build verification
