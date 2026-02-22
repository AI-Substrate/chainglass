# Flight Plan: Phase 3 — DI Container and Existing Test Updates

**Plan**: [agent-orchestration-wiring-plan.md](../../agent-orchestration-wiring-plan.md)
**Phase Dossier**: [tasks.md](./tasks.md)
**Generated**: 2026-02-17

---

## What This Phase Does

Aligns the DI container and updates all existing tests so the full codebase compiles and passes with the new `IAgentManagerService` wiring. Eliminates all `agentAdapter`/`FakeAgentAdapter` references from orchestration code.

## Before → After

### Before
```
registerOrchestrationServices(): resolves IAgentAdapter → passes to ODS
CLI container: only CLI_DI_TOKENS.AGENT_MANAGER registered
Existing tests: use FakeAgentAdapter, stubAdapter, contextSessionId
E2E script: FakeAgentAdapter in 4 places
Schema test: asserts parse({}) === {}
```

### After
```
registerOrchestrationServices(): resolves IAgentManagerService → passes to ODS
CLI container: both CLI + ORCHESTRATION tokens → same instance
Existing tests: use FakeAgentManagerService, FakeAgentInstance
E2E script: FakeAgentManagerService
Schema test: asserts parse({}) === { agentType: 'copilot' }
just fft: 3858+ tests pass, 0 stale references
```

## Checklist

- [ ] **Stage 1: DI Wiring** (T001-T002)
  - Update `registerOrchestrationServices()` to resolve AGENT_MANAGER
  - Register orchestration token alias in CLI container
  - Files: `container.ts` (pkg), `container.ts` (cli)

- [ ] **Stage 2: Existing Test Updates** (T003-T007)
  - Update ods.test.ts, pod.test.ts, pod-manager.test.ts
  - Update container-orchestration.test.ts, properties-and-orchestrator.test.ts
  - All existing tests pass with new interfaces

- [ ] **Stage 3: E2E** (T008-T009)
  - Swap FakeAgentAdapter → FakeAgentManagerService in E2E script
  - Verify 58-step pipeline passes
  - Build CLI first: `pnpm build --filter=@chainglass/cli`

- [ ] **Stage 4: Final Gate** (T010)
  - `just fft` passes (3858+ tests)
  - `grep` sweep: 0 agentAdapter/FakeAgentAdapter references

## Gate

- [ ] All existing orchestration tests pass
- [ ] E2E exits 0 with 58 steps
- [ ] `just fft` passes (3858+ tests, 0 failures)
- [ ] `grep -rn 'agentAdapter\|FakeAgentAdapter'` returns 0 hits in orchestration

## Key Risks

| Risk | Mitigation |
|------|------------|
| Missed test file | T010 grep sweep |
| E2E output differs | Workshop 06 confirmed identical |
| CLI build stale | Build before E2E run |
