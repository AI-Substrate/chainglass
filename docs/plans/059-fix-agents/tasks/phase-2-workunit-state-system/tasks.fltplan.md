# Flight Plan: Phase 2 — WorkUnit State System

**Plan**: [fix-agents-plan.md](../../fix-agents-plan.md) (Phase B)
**Phase**: Phase 2: WorkUnit State System
**Generated**: 2026-02-28
**Status**: Ready for takeoff

---

## Departure → Destination

**Where we are**: Agents can be created, listed, and chatted with (Phase 1). Status and questions are reported through three disconnected channels (AgentNotifierService, MessageService, NodeStatusResult). No single place to ask "who needs attention?" The GlobalStateSystem exists but no work unit domain is registered.

**Where we're going**: A developer can register any work unit (agent, code unit, workflow node) with `IWorkUnitStateService`, publish status changes, and have status reflected across the UI via SSE→ServerEventRoute→GlobalStateSystem. AgentWorkUnitBridge subscribes to WorkflowEvents observers (Plan 061) to auto-update status on questions. Service persists to JSON, emits via CentralEventNotifier, auto-expires stale entries after 24h.

---

## Domain Context

### Domains We're Changing

| Domain | What Changes | Key Files |
|--------|-------------|-----------|
| work-unit-state | NEW — interface, types, implementation, fake, contract tests, DI registration | `packages/shared/src/interfaces/work-unit-state.interface.ts`, `apps/web/src/lib/work-unit-state/work-unit-state.service.ts` |
| agents | Add AgentWorkUnitBridge to publish agent lifecycle to work-unit-state | `apps/web/src/features/059-fix-agents/agent-work-unit-bridge.ts` |
| _platform/state | Extend publish() with source metadata, add ServerEventRoute bridge, extend GlobalStateConnector | `apps/web/src/lib/state/server-event-route.tsx`, `apps/web/src/lib/state/server-event-router.ts`, `apps/web/src/lib/state/state-connector.tsx` |
| _platform/events | Add WorkUnitState channel to WorkspaceDomain | `packages/shared/src/features/027-central-notify-events/workspace-domain.ts` |

### Domains We Depend On (no changes)

| Domain | What We Consume | Contract |
|--------|----------------|----------|
| agents | Agent lifecycle events | IAgentNotifierService (broadcastCreated, broadcastStatus) |
| workflow-events | Question/answer observer hooks (Plan 061) | IWorkflowEvents (onQuestionAsked, onQuestionAnswered) |

---

## Flight Status

```mermaid
stateDiagram-v2
    classDef pending fill:#9E9E9E,stroke:#757575,color:#fff
    classDef active fill:#FFC107,stroke:#FFA000,color:#000
    classDef done fill:#4CAF50,stroke:#388E3C,color:#fff
    classDef blocked fill:#F44336,stroke:#D32F2F,color:#fff

    state "1: Interface + types" as S1
    state "2: Fake + contract tests" as S2
    state "3: Real implementation" as S3
    state "4: DI + bridge + routing" as S4
    state "5: Docs" as S5

    [*] --> S1
    S1 --> S2
    S2 --> S3
    S3 --> S4
    S4 --> S5
    S5 --> [*]

    class S1,S2,S3,S4,S5 pending
```

**Legend**: grey = pending | yellow = active | red = blocked/needs input | green = done

---

## Stages

- [ ] **Stage 1: Interface + types** — Define IWorkUnitStateService, WorkUnitEntry, getUnitBySourceRef(), SSE event shapes in packages/shared
- [ ] **Stage 2: Fake + contract tests** — FakeWorkUnitStateService + contract test factory covering register/unregister/updateStatus/getUnit/getUnits/getUnitBySourceRef/tidyUp
- [ ] **Stage 3: Real implementation** — WorkUnitStateService with in-memory registry, JSON persistence, CentralEventNotifier emit, ServerEventRouteDescriptor, tidyUp on startup+register
- [ ] **Stage 4: DI + bridge** — Register singleton in DI, create AgentWorkUnitBridge with WorkflowEvents observer subscription per sourceRef.graphSlug
- [ ] **Stage 5: Docs** — Integration guide (`docs/how/work-unit-state-integration.md`)

---

## Architecture: Before & After

```mermaid
flowchart LR
    classDef existing fill:#E8F5E9,stroke:#4CAF50,color:#000
    classDef new fill:#E3F2FD,stroke:#2196F3,color:#000

    subgraph Before["Before Phase 2"]
        B_AGT["Agent events<br/>(SSE only)"]:::existing
        B_MSG["MessageService<br/>(file-based)"]:::existing
        B_NODE["NodeStatusResult<br/>(disk read)"]:::existing
        B_GSS["GlobalStateSystem<br/>(no work-unit domain)"]:::existing
    end

    subgraph After["After Phase 2"]
        A_WUS["IWorkUnitStateService<br/>(centralized registry)"]:::new
        A_FAKE["FakeWorkUnitStateService"]:::new
        A_BRIDGE["AgentWorkUnitBridge"]:::new
        A_GSS["GlobalStateSystem<br/>+ work-unit domain"]:::existing
        A_JSON["work-unit-state.json<br/>(persistence)"]:::new

        A_BRIDGE -->|"register + status"| A_WUS
        A_WUS -->|"publish paths"| A_GSS
        A_WUS -->|"persist"| A_JSON
    end
```

**Legend**: existing (green, unchanged) | new (blue, created)

---

## Acceptance Criteria

- [ ] AC-09: IWorkUnitStateService interface in packages/shared with all methods (including getUnitBySourceRef)
- [ ] AC-10: Implementation persists to JSON + emits via CentralEventNotifier + ServerEventRouteDescriptor
- [ ] AC-11: tidyUp() removes entries > 24h that aren't working/waiting
- [ ] AC-12: Working entries + waiting_input entries never expire
- [ ] AC-13: FakeWorkUnitStateService with inspection methods
- [ ] AC-14: Contract tests pass for both real and fake
- [ ] AC-15: AgentWorkUnitBridge auto-registers agents + subscribes to WorkflowEvents observers
- [ ] AC-16: Observer-driven status: onQuestionAsked → waiting_input, onQuestionAnswered → working

## Goals & Non-Goals

**Goals**: Centralized work unit registry, JSON persistence, SSE→state path publishing via ServerEventRoute, agent bridge with WorkflowEvents observer subscription, contract-tested with fake parity, integration guide.

**Non-Goals**: UI components (Phase 3), cross-worktree queries (Phase 4), Q&A mechanics on WorkUnitStateService (handled by WorkflowEvents), replacing MessageService or NodeStatusResult.

---

## Checklist

- [ ] T001: Define IWorkUnitStateService interface + types + SSE event shapes
- [ ] T002: Create FakeWorkUnitStateService
- [ ] T003: Write contract test factory + runner
- [ ] T004: Implement WorkUnitStateService (persistence + CEN emit + route descriptor)
- [ ] T005: Implement tidyUp rules (startup + register invocation)
- [ ] T006: Register in DI container
- [ ] T007: Create AgentWorkUnitBridge + WorkflowEvents observer subscription
- [ ] T008: Write integration guide
