# Flight Plan: Phase 1 — Types, Interfaces, and Schema Changes

**Plan**: [agent-orchestration-wiring-plan.md](../../agent-orchestration-wiring-plan.md)
**Phase Dossier**: [tasks.md](./tasks.md)
**Generated**: 2026-02-17

---

## What This Phase Does

Updates 6 type definition files so the orchestration system compiles against `IAgentManagerService` / `IAgentInstance` from Plan 034. No runtime behavior changes. Downstream compile errors are expected and resolved in Phase 2-3.

## Before → After

### Before
```
ODSDependencies { agentAdapter: IAgentAdapter }
PodCreateParams  { adapter: IAgentAdapter }
PodExecuteOptions { contextSessionId?: string }
GraphOrchestratorSettingsSchema = z.object({}).strict()
PositionalGraphReality { /* no settings */ }
ORCHESTRATION_DI_TOKENS { /* no AGENT_MANAGER */ }
```

### After
```
ODSDependencies { agentManager: IAgentManagerService }
PodCreateParams  { agentInstance: IAgentInstance }
PodExecuteOptions { /* contextSessionId removed */ }
GraphOrchestratorSettingsSchema = z.object({ agentType: z.enum([...]).optional() })
PositionalGraphReality { settings: GraphOrchestratorSettings }
ORCHESTRATION_DI_TOKENS { AGENT_MANAGER: 'IAgentManagerService' }
```

## Checklist

- [ ] **Stage 1: Schema TDD** (T001→T002)
  - Write tests for `agentType` field on `GraphOrchestratorSettingsSchema`
  - Tests FAIL (RED) → add field → tests PASS (GREEN)
  - Files: `orchestrator-settings.schema.ts`, test file

- [ ] **Stage 2: Type Definitions** (T003, T004, T005 — parallel)
  - `ODSDependencies`: `agentAdapter` → `agentManager`
  - `PodCreateParams`: `adapter` → `agentInstance`
  - `PodExecuteOptions`: remove `contextSessionId`
  - Files: `ods.types.ts`, `pod-manager.types.ts`, `pod.types.ts`

- [ ] **Stage 3: Reality & DI** (T006, T007 — parallel)
  - `PositionalGraphReality`: add `settings` field
  - `ORCHESTRATION_DI_TOKENS`: add `AGENT_MANAGER`
  - Files: `reality.types.ts`, `di-tokens.ts`

## Gate

- [ ] Schema tests pass: `pnpm vitest run test/unit/schemas/orchestrator-settings.schema.test.ts`
- [ ] Expected compile errors exist in `ods.ts`, `pod.agent.ts`, `pod-manager.ts`, `reality.builder.ts`
- [ ] No NEW compile errors in unrelated files

## Key Risks

| Risk | Mitigation |
|------|------------|
| Unexpected compile cascade | All downstream consumers identified in audit |
| Schema default behavior change | `agentType` is optional — `{}` still parses |
