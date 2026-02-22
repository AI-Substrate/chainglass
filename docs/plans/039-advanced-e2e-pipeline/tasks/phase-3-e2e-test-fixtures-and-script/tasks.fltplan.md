# Flight Plan: Phase 3 — E2E Test Fixtures and Script

**Plan**: [../../advanced-e2e-pipeline-plan.md](../../advanced-e2e-pipeline-plan.md)
**Phase**: Phase 3: E2E Test Fixtures and Script
**Generated**: 2026-02-21
**Status**: Ready for takeoff

---

## Departure → Destination

**Where we are**: The context engine (Phase 1) and readiness gate (Phase 2) are proven with unit tests, but no real agent has run through the pipeline yet. There are no fixtures for the advanced pipeline and no test script.

**Where we're going**: By the end of this phase, 6 fixture work units exist, a complete test script can build the 4-line pipeline graph, drive orchestration with Q&A handling, and run 17 assertions verifying session chain, isolation, and output existence. The script is ready for Phase 4's real agent run.

---

## Stages

- [ ] **Stage 1: Create 6 fixture work units** — human-input, spec-writer (with Q&A prompt), programmer-a, programmer-b, reviewer, summariser — all with unit.yaml and prompts
- [ ] **Stage 2: Script skeleton + VerboseCopilotAdapter** — imports, constants, SDK wrapper with event streaming
- [ ] **Stage 3: QuestionWatcher + graph builder** — Q&A handler (scripted + interactive), buildAdvancedPipeline() with full input wiring and noContext
- [ ] **Stage 4: Drive loop + assertions + main** — drive with Q&A integration, 17 assertions, output display, --interactive flag, justfile entry

---

## Acceptance Criteria

- [ ] All 6 fixture units have valid unit.yaml files (AC-8)
- [ ] Script compiles and runs without errors
- [ ] QuestionWatcher handles scripted answers (AC-11)
- [ ] Graph builder creates correct topology with noContext on parallel nodes
- [ ] 17 assertions defined per Workshop 01 matrix
- [ ] --interactive flag switches to human input mode
- [ ] just test-advanced-pipeline works

---

## Checklist

- [ ] T001: human-input fixture (CS-1)
- [ ] T002: spec-writer fixture + Q&A prompt (CS-2)
- [ ] T003: programmer-a fixture (CS-1)
- [ ] T004: programmer-b fixture (CS-1)
- [ ] T005: reviewer fixture (CS-2)
- [ ] T006: summariser fixture (CS-1)
- [ ] T007: Script imports + VerboseCopilotAdapter (CS-2)
- [ ] T008: QuestionWatcher class (CS-2)
- [ ] T009: buildAdvancedPipeline graph builder (CS-3)
- [ ] T010: Drive loop with Q&A (CS-3)
- [ ] T011: 17 assertions (CS-2)
- [ ] T012: Output display + main entry (CS-1)
- [ ] T013: justfile entry (CS-1)
