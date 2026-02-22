# Flight Plan: Phase 2 — ODS and AgentPod Rewiring with TDD

**Plan**: [agent-orchestration-wiring-plan.md](../../agent-orchestration-wiring-plan.md)
**Phase Dossier**: [tasks.md](./tasks.md)
**Generated**: 2026-02-17

---

## What This Phase Does

Rewires ODS and AgentPod to use `AgentManagerService` and `IAgentInstance` instead of raw `IAgentAdapter`. Resolves all 5 compile errors from Phase 1 type changes. Full TDD: RED tests first, then GREEN implementation.

## Before → After

### Before
```
ODS.handleAgentOrCode()
  → buildPodParams() → { adapter: this.deps.agentAdapter }
  → pod.execute({ contextSessionId, ... })
  → agentAdapter.run({ prompt, sessionId, cwd })
```

### After
```
ODS.handleAgentOrCode()
  → agentManager.getNew(params) or .getWithSessionId(sessionId, params)
  → pod.execute({ inputs, ctx, graphSlug })
  → agentInstance.run({ prompt, cwd })
```

## Checklist

- [ ] **Stage 1: ODS TDD** (T001-T005)
  - Write 4 RED test cases (getNew, inherit, fallback, type resolution)
  - Rewire ODS.handleAgentOrCode() → all tests GREEN
  - Resolve 3 compile errors in ods.ts
  - Files: `ods.ts`, `ods-agent-wiring.test.ts`

- [ ] **Stage 2: Reality Settings** (T006)
  - Populate `settings` in reality builder
  - Update `graph-orchestration.ts` caller
  - Files: `reality.builder.ts`, `graph-orchestration.ts`

- [ ] **Stage 3: AgentPod TDD** (T007-T009)
  - Write 2 RED test cases (constructor/delegation, sessionId/no-contextSessionId)
  - Rewire AgentPod → all tests GREEN
  - Resolve 1 compile error in pod.agent.ts
  - Files: `pod.agent.ts`, `pod-agent-wiring.test.ts`

- [ ] **Stage 4: PodManager + Resume** (T010-T011)
  - Update PodManager.createPod (1-line fix)
  - Update resumeWithAnswer delegation
  - Resolve 1 compile error in pod-manager.ts
  - Files: `pod-manager.ts`, `pod.agent.ts`

- [ ] **Stage 5: Final Verification** (T012)
  - All Phase 2 tests pass together
  - 0 compile errors in modified files
  - 5 Phase 1 compile errors all resolved

## Gate

- [ ] ODS wiring tests pass: `pnpm vitest run test/unit/.../ods-agent-wiring.test.ts`
- [ ] AgentPod wiring tests pass: `pnpm vitest run test/unit/.../pod-agent-wiring.test.ts`
- [ ] 0 compile errors in `ods.ts`, `pod.agent.ts`, `pod-manager.ts`, `reality.builder.ts`, `graph-orchestration.ts`
- [ ] All 5 Phase 1 compile errors resolved

## Key Risks

| Risk | Mitigation |
|------|------------|
| ODS code paths interleave | Only modify handleAgentOrCode + buildPodParams |
| resumeWithAnswer guard logic | Explicit test in T011 |
| sessionId null→undefined bridge | Test in T008, implement in T009 |
