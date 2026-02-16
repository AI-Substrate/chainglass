# Flight Plan: Phase 1 — Types, Interfaces, and PlanPak Setup

**Plan**: [agentic-cli-plan.md](../../agentic-cli-plan.md)
**Tasks**: [tasks.md](./tasks.md)
**Generated**: 2026-02-16

---

## Mission Summary

Define all type contracts and PlanPak directories for the redesigned agent system. No implementation — interfaces only. Five tasks, all CS-1 or CS-2.

## Before → After

### Before

```
packages/shared/src/features/
  └── 019-agent-manager-refactor/    ← IAgentInstance with getEvents/setIntent/notifier
      └── (no 034 directory)

apps/cli/src/features/               ← (no 034 directory)
test/unit/features/                   ← (no 034 directory)
```

### After

```
packages/shared/src/features/
  ├── 019-agent-manager-refactor/    ← UNCHANGED
  └── 034-agentic-cli/              ← NEW
      ├── types.ts                   AgentType, AgentInstanceStatus, AgentInstanceConfig,
      │                              CreateAgentParams, AgentRunOptions, AgentFilter
      ├── agent-instance.interface.ts  IAgentInstance (domain-agnostic, event pass-through)
      ├── agent-manager-service.interface.ts  IAgentManagerService (getNew/getWithSessionId)
      ├── index.ts                   barrel re-exports
      └── fakes/                     (empty, for Phase 2)

apps/cli/src/features/
  └── 034-agentic-cli/              ← NEW (empty, for Phase 3)

test/unit/features/
  └── 034-agentic-cli/              ← NEW (empty, for Phase 2)
```

## Stages

- [ ] **Stage 1**: Create PlanPak directories (T001)
- [ ] **Stage 2**: Define types.ts with 7 type exports (T002)
- [ ] **Stage 3**: Define IAgentInstance interface — 10 props, 6 methods (T003)
- [ ] **Stage 4**: Define IAgentManagerService interface — 6 methods (T004)
- [ ] **Stage 5**: Create barrel index.ts (T005)
- [ ] **Stage 6**: Verify `tsc --noEmit` passes, run `just fft`

## Key Constraints

- NO implementation code — interfaces and types only
- NO modification of Plan 019 files
- Import `AgentEvent`, `AgentResult`, `IAgentAdapter` from existing shared interfaces
- Re-export `AgentEventHandler` (do not re-define)
- `IAgentInstance` must NOT include `getEvents()`, `setIntent()`, notifier, or storage (AC-02)
- `AgentRunOptions` (instance-level) excludes `sessionId` — instance owns it
- `AgentRunOptions` includes optional `timeoutMs` per Discovery 09

## Validation

```bash
pnpm exec tsc --noEmit    # all types compile
just fft                   # no regressions
```
