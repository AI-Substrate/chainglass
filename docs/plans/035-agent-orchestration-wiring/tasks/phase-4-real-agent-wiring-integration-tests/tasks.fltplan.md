# Flight Plan: Phase 4 — Real Agent Wiring Integration Tests

**Plan**: [agent-orchestration-wiring-plan.md](../../agent-orchestration-wiring-plan.md)
**Phase Dossier**: [tasks.md](./tasks.md)
**Generated**: 2026-02-17

---

## What This Phase Does

Creates `describe.skip` integration tests proving the ODS → AgentManagerService → IAgentInstance → real adapter chain works with both Claude Code and Copilot SDK. One new test file, 7 skipped test cases.

## Before → After

### Before
```
Orchestration wiring proven with fakes only (Phases 1-3)
No real adapter integration tests exist for the wiring chain
```

### After
```
test/integration/orchestration-wiring-real.test.ts exists with:
- createRealOrchestrationStack() helper (dynamic imports)
- 3 Claude Code tests (single-node, inheritance, events)
- 3 Copilot SDK tests (same)
- 1 cross-adapter parity test
- All describe.skip — manually unskipped to validate
just fft: 3873+ tests still pass
```

## Checklist

- [ ] **Stage 1: Scaffolding** (T001)
  - createRealOrchestrationStack with dynamic imports
  - waitForPodSession and completeNodeManually helpers
  - File compiles

- [ ] **Stage 2: Claude Code Suite** (T002-T004)
  - Single-node, session inheritance, event pass-through
  - All describe.skip

- [ ] **Stage 3: Copilot SDK Suite** (T005-T007)
  - Same 3 tests with Copilot adapter
  - All describe.skip

- [ ] **Stage 4: Parity + Gate** (T008-T009)
  - Cross-adapter parity test
  - just fft passes

## Gate

- [ ] File exists and compiles: `test/integration/orchestration-wiring-real.test.ts`
- [ ] All test cases use `describe.skip` (not `skipIf`)
- [ ] All assertions are structural
- [ ] `just fft` passes (3873+ tests, skipped tests don't interfere)

## Key Risks

| Risk | Mitigation |
|------|------------|
| Dynamic import fails | Follow Plan 034 proven pattern |
| Tests accidentally run in CI | describe.skip (hardcoded) |
