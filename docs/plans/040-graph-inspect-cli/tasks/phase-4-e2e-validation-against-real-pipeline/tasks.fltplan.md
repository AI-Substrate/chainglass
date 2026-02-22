# Flight Plan: Phase 4 — E2E Validation Against Real Pipeline

**Plan**: [graph-inspect-cli-plan.md](../../graph-inspect-cli-plan.md)
**Phase**: Phase 4: E2E Validation Against Real Pipeline
**Generated**: 2026-02-22
**Status**: Ready for takeoff

---

## Departure → Destination

**Where we are**: `cg wf inspect` works with unit tests and integration tests on fixture graphs. Never tested against real LLM agent output.

**Where we're going**: 3 inspect snapshots captured during a real 6-node pipeline run (Q&A → parallel → complete), proving the output is useful for debugging actual agent workflows.

---

## Stages

- [ ] **Stage 1: Build CLI** — `pnpm turbo build --force` to include inspect command in binary
- [ ] **Stage 2: Add snapshot infrastructure** — `captureInspectSnapshot()` helper in test script
- [ ] **Stage 3: Wire 3 snapshot triggers** — Q&A pause, parallel execution, completion
- [ ] **Stage 4: Run E2E** — `just test-advanced-pipeline` (~3-5 min with real agents)
- [ ] **Stage 5: Verify + add structural assertions** — check snapshot content, add assertions

---

## Checklist

- [ ] T001: Build CLI (CS-1)
- [ ] T002: Add captureInspectSnapshot helper (CS-2)
- [ ] T003: Snapshot at Q&A pause (CS-1)
- [ ] T004: Snapshot at parallel execution (CS-1)
- [ ] T005: Snapshot after completion + ADR-0012 check (CS-2)
- [ ] T006: Run full E2E — 23 existing + snapshot assertions (CS-2)
- [ ] T007: Structural assertions on captured snapshots (CS-2)
