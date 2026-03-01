# Flight Plan: Phase 5 — Polish & End-to-End Verification

**Plan**: [workunit-editor-plan.md](../../workunit-editor-plan.md)
**Phase**: Phase 5: Polish & End-to-End Verification
**Generated**: 2026-03-01
**Status**: Landed

---

## Departure → Destination

**Where we are**: Phases 1-4 are complete — IWorkUnitService CRUD, editor pages with type-specific editors, inputs/outputs configuration with drag-reorder, file change notifications with SSE banner, "Edit Template" button with return navigation. 4749 tests passing, `just fft` clean. The doping script creates demo workflows but does not exercise work unit CRUD.

**Where we're going**: A developer can run `just dope` and get demo work units (all 3 types) alongside demo workflows. All 29 acceptance criteria are verified and checked off. File-browser confirmed no regression from CodeEditor extraction.

---

## Domain Context

### Domains We're Changing

| Domain | What Changes | Key Files |
|--------|-------------|-----------|
| test | Extend doping script with work unit CRUD scenarios | `scripts/dope-workflows.ts` |
| plan | Mark all 29 ACs complete | `docs/plans/058-workunit-editor/workunit-editor-plan.md` |

### Domains We Depend On (no changes)

| Domain | What We Consume | Contract |
|--------|----------------|----------|
| `_platform/positional-graph` | Work unit CRUD | `IWorkUnitService.create()`, `update()` |
| `058-workunit-editor` | Editor pages | `/work-units/`, `/work-units/[unitSlug]/` |
| `file-browser` | CodeEditor re-export | `code-editor.tsx` (backward compat) |

---

## Flight Status

<!-- Updated by /plan-6-v2: pending → active → done. Use blocked for problems/input needed. -->

```mermaid
stateDiagram-v2
    classDef pending fill:#9E9E9E,stroke:#757575,color:#fff
    classDef active fill:#FFC107,stroke:#FFA000,color:#000
    classDef done fill:#4CAF50,stroke:#388E3C,color:#fff
    classDef blocked fill:#F44336,stroke:#D32F2F,color:#fff

    state "1: Doping script" as S1
    state "2: AC checklist" as S2
    state "3: E2E walkthrough" as S3
    state "4: FFT + regression" as S4

    [*] --> S1
    [*] --> S2
    S1 --> S3
    S2 --> S3
    S3 --> S4
    S4 --> [*]

    class S1,S2,S3,S4 done
```

**Legend**: grey = pending | yellow = active | red = blocked/needs input | green = done

---

## Stages

<!-- Updated by /plan-6-v2 during implementation: [ ] → [~] → [x] -->

- [x] **Stage 1: Extend doping script** — Add work unit CRUD scenarios (3 unit types with inputs/outputs) (`scripts/dope-workflows.ts`)
- [x] **Stage 2: Update AC checklist** — Mark Phase 3+4 ACs complete in plan (`workunit-editor-plan.md`)
- [x] **Stage 3: End-to-end walkthrough** — Verify full lifecycle via browser/MCP
- [x] **Stage 4: Final verification** — `just fft` + file-browser regression check

---

## Architecture: Before & After

```mermaid
flowchart LR
    classDef existing fill:#E8F5E9,stroke:#4CAF50,color:#000
    classDef changed fill:#FFF3E0,stroke:#FF9800,color:#000
    classDef new fill:#E3F2FD,stroke:#2196F3,color:#000

    subgraph Before["Before Phase 5"]
        B1["Doping Script<br/>(workflows only)"]:::existing
        B2["Editor Pages"]:::existing
        B3["File Browser"]:::existing
    end

    subgraph After["After Phase 5"]
        A1["Doping Script<br/>(workflows + units)"]:::changed
        A2["Editor Pages<br/>(verified E2E)"]:::existing
        A3["File Browser<br/>(regression clear)"]:::existing
        A4["Plan: 29/29 ACs"]:::changed
    end
```

**Legend**: existing (green, unchanged) | changed (orange, modified) | new (blue, created)

---

## Acceptance Criteria

- [x] All 29 acceptance criteria from spec verified and checked in plan
- [x] `just fft` passes with zero failures
- [x] File-browser renders code with syntax highlighting (no regression)
- [x] `just dope` creates demo work units covering all 3 types

## Goals & Non-Goals

**Goals**:
- Doping script exercises work unit CRUD (all 3 types)
- Full lifecycle verified end-to-end
- All ACs marked complete
- No regressions

**Non-Goals**:
- No new features or UI changes
- No new Playwright browser tests
- No new unit tests

---

## Checklist

- [x] T001: Extend doping script with work unit CRUD scenarios
- [x] T002: Mark Phase 3+4 ACs complete in plan
- [x] T003: End-to-end walkthrough
- [x] T004: Run `just fft` — zero failures
- [x] T005: File-browser CodeEditor regression check
