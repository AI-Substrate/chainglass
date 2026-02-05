# Flight Plan: Phase 4 — Test Enrichment

**Plan**: [../../agentic-work-units-plan.md](../../agentic-work-units-plan.md)
**Phase**: Phase 4: Test Enrichment
**Generated**: 2026-02-04
**Status**: Landed

---

## Departure → Destination

**Where we are**: Phases 1-3 established the complete WorkUnit infrastructure — discriminated types (`AgenticWorkUnit`, `CodeUnit`, `UserInputUnit`), Zod schemas, `WorkUnitService` with template access, and CLI integration with reserved parameter routing (`main-prompt`, `main-script`). The infrastructure exists and passes 137+ unit tests, but the E2E test suite from Plan 028 still uses the narrow `NarrowWorkUnit` fixtures and doesn't exercise the new type discrimination or reserved parameter features.

**Where we're going**: By the end of this phase, the E2E test suite will verify the complete agentic work unit infrastructure end-to-end. A developer running `pnpm test test/e2e/positional-graph-execution-e2e.test.ts` will see 15 sections pass, including: Section 13 verifying unit types via CLI, Section 14 verifying reserved parameter routing works on both completed and pending nodes, and Section 15 verifying UserInputUnit on Line 0 is immediately ready as a workflow entry point.

---

## Flight Status

<!-- Updated by /plan-6: pending → active → done. Use blocked for problems/input needed. -->

```mermaid
stateDiagram-v2
    classDef pending fill:#9E9E9E,stroke:#757575,color:#fff
    classDef active fill:#FFC107,stroke:#FFA000,color:#000
    classDef done fill:#4CAF50,stroke:#388E3C,color:#fff
    classDef blocked fill:#F44336,stroke:#D32F2F,color:#fff

    state "0: CodeUnit on disk" as S0
    state "1: Enriched fixtures" as S1
    state "2: UserInput fixtures" as S2
    state "3: stubWorkUnitService" as S3
    state "4: Naming fix" as S4
    state "5: E2E Section 13" as S5
    state "6: E2E Section 14" as S6
    state "7: E2E Section 15" as S7
    state "8: Wire sections" as S8
    state "9: Verify E2E" as S9

    [*] --> S0
    S0 --> S1
    S1 --> S3
    S2 --> S3
    S3 --> S5
    S3 --> S6
    S4 --> S8
    S5 --> S8
    S6 --> S8
    S7 --> S8
    S8 --> S9
    S9 --> [*]

    class S0,S1,S2,S3,S4,S5,S6,S7,S8,S9 done
```

**Legend**: grey = pending | yellow = active | red = blocked/needs input | green = done

---

## Stages

<!-- Updated by /plan-6 during implementation: [ ] → [~] → [x] -->

- [x] **Stage 0: Create CodeUnit on disk** — create `sample-pr-creator` with `type: code` and script file (`.chainglass/units/sample-pr-creator/` — new files)
- [x] **Stage 1: Add enriched fixtures** — define all 7 pipeline units with full `AgenticWorkUnit`/`CodeUnit` types using `satisfies` pattern (`test/unit/positional-graph/test-helpers.ts`)
- [x] **Stage 2: Add UserInput fixtures** — add `sampleUserRequirements` and `sampleLanguageSelector` UserInputUnit fixtures (`test-helpers.ts`)
- [x] **Stage 3: Implement stubWorkUnitService** — create test helper supporting template content map, strict mode, proper error types (`test-helpers.ts`)
- [x] **Stage 4: Fix naming inconsistency** — rename `samplePRCreator` → `samplePrCreator` for consistent camelCase (`test-helpers.ts`)
- [x] **Stage 5: Write E2E Section 13** — unit type verification tests verifying CLI returns correct type for agent/code/user-input units (`e2e test`)
- [x] **Stage 6: Write E2E Section 14** — reserved parameter routing tests for main-prompt/main-script and E186 type mismatch (`e2e test`)
- [x] **Stage 7: Write E2E Section 15** — Row 0 UserInputUnit tests verifying entry point is immediately ready (`e2e test`)
- [x] **Stage 8: Wire sections into main** — integrate sections 13-15 into E2E test orchestration (`e2e test`)
- [x] **Stage 9: Verify full E2E** — run complete test suite, all 15 sections pass

---

## Acceptance Criteria

- [x] AC-8: E2E Section 13 (Unit Type Verification) verifies: `sample-coder` is `type='agent'`, `sample-pr-creator` is `type='code'`, `sample-input` is `type='user-input'`
- [x] AC-9: E2E Section 14 (Reserved Parameter Routing) verifies: `main-prompt` returns content, `main-script` returns content, type mismatch returns E186
- [x] AC-10: E2E Section 15 (Row 0 UserInputUnit) verifies: UserInputUnit on Line 0 is immediately ready

---

## Goals & Non-Goals

**Goals**:
- Create `sample-pr-creator` CodeUnit on disk (minimal unit for E2E type verification)
- Add `e2eEnrichedFixtures` to test-helpers.ts with full WorkUnit types
- Add `sampleUserRequirements` and `sampleLanguageSelector` UserInputUnit fixtures
- Implement `stubWorkUnitService()` helper with controllable template content
- Fix naming inconsistency: `samplePRCreator` → `samplePrCreator`
- Add E2E Sections 13-15 per workshop specification
- All 15 E2E sections pass

**Non-Goals**:
- Full on-disk unit YAML file suite (Phase 5) — only `sample-pr-creator` created here
- Workgraph bridge removal (Phase 5)
- Documentation (Phase 5)
- Migration of existing unit files (Phase 5)

---

## Architecture: Before & After

```mermaid
flowchart LR
    classDef existing fill:#E8F5E9,stroke:#4CAF50,color:#000
    classDef changed fill:#FFF3E0,stroke:#FF9800,color:#000
    classDef new fill:#E3F2FD,stroke:#2196F3,color:#000

    subgraph Before["Before Phase 4"]
        TH1[test-helpers.ts]:::existing
        E2E1[E2E Test]:::existing
        NWU1[NarrowWorkUnit fixtures]:::existing
        STUB1[stubWorkUnitLoader]:::existing
        UNITS1[On-disk units: 3]:::existing

        TH1 --> NWU1
        TH1 --> STUB1
        E2E1 --> TH1
        E2E1 --> UNITS1
    end

    subgraph After["After Phase 4"]
        TH2[test-helpers.ts]:::changed
        E2E2[E2E Test]:::changed
        NWU2[NarrowWorkUnit fixtures]:::existing
        EF2[e2eEnrichedFixtures]:::new
        UIF2[UserInput fixtures]:::new
        STUB2[stubWorkUnitLoader]:::existing
        STUWS[stubWorkUnitService]:::new
        UNITS2[On-disk units: 4]:::changed
        PRC[sample-pr-creator CodeUnit]:::new
        S13[Section 13: Type Verification]:::new
        S14[Section 14: Reserved Params]:::new
        S15[Section 15: Row 0 UserInput]:::new

        TH2 --> NWU2
        TH2 --> EF2
        TH2 --> UIF2
        TH2 --> STUB2
        TH2 --> STUWS
        E2E2 --> TH2
        E2E2 --> UNITS2
        UNITS2 --> PRC
        E2E2 --> S13
        E2E2 --> S14
        E2E2 --> S15
    end
```

**Legend**: existing (green, unchanged) | changed (orange, modified) | new (blue, created)

---

## Checklist

- [x] T000: Create `sample-pr-creator` CodeUnit on disk (CS-1)
- [x] T001: Add `e2eEnrichedFixtures` to test-helpers.ts (CS-2)
- [x] T002: Add `sampleUserRequirements` and `sampleLanguageSelector` fixtures (CS-1)
- [x] T003: Implement `stubWorkUnitService()` helper (CS-2)
- [x] T004: Fix naming inconsistency: samplePRCreator → samplePrCreator (CS-1)
- [x] T005: Write E2E Section 13: Unit Type Verification (CS-2)
- [x] T006: Write E2E Section 14: Reserved Parameter Routing (CS-2)
- [x] T007: Write E2E Section 15: Row 0 UserInputUnit (CS-2)
- [x] T008: Update E2E main flow to include new sections (CS-1)
- [x] T009: Run full E2E test and verify (CS-1)

---

## PlanPak

Active — files organized under `features/029-agentic-work-units/`
