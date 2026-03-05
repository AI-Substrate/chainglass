# Domain: Work Unit State

**Slug**: work-unit-state
**Type**: business
**Status**: active
**Created By**: Plan 059 — Fix Agents (Phase 2)

## Purpose

Centralized status registry for all active work units (agents, workflow nodes, pods). Provides registration, status publishing via CentralEventNotifier → SSE → GlobalStateSystem, source ref lookup, and auto-cleanup of stale entries. Does NOT own Q&A mechanics — that is the `workflow-events` domain (Plan 061). This service is a status aggregator that enables the top bar, cross-worktree badges, and attention layers.

## Concepts

| Concept | Entry Point | What It Does |
|---------|-------------|-------------|
| Register a work unit | `service.register(input)` | Adds a work unit to the registry with creator info and optional source ref |
| Update status | `service.updateStatus(id, { status, intent? })` | Changes status + emits SSE event for UI reactivity |
| Source ref lookup | `service.getUnitBySourceRef(graphSlug, nodeId)` | Finds work unit by its graph origin — used by observer callbacks |
| Auto-cleanup (tidyUp) | `service.tidyUp()` | Removes stale entries (>24h) that aren't working/waiting_input |
| SSE → State routing | `workUnitStateRoute` descriptor | Maps SSE events to GlobalStateSystem paths for client consumption |
| Agent bridging | `AgentWorkUnitBridge` | Auto-registers agents + subscribes to WorkflowEvents observers |

### Example: Agent lifecycle via bridge

```typescript
const bridge = new AgentWorkUnitBridge(workUnitState, workflowEvents);

// Register — auto-subscribes to WF observers if sourceRef provided
bridge.registerAgent('agent-abc', 'Code Review', 'claude-code', {
  graphSlug: 'my-graph', nodeId: 'node-1',
});

// Observer-driven: onQuestionAsked → waiting_input, onQuestionAnswered → working

bridge.unregisterAgent('agent-abc'); // Cleanup + unsubscribe
```

## Boundary

### Owns
- **IWorkUnitStateService interface** — register, unregister, updateStatus, getUnit, getUnits, getUnitBySourceRef, tidyUp
- **WorkUnitEntry type** — id, name, status, creator, intent, sourceRef, registeredAt, lastActivityAt
- **WorkUnitStatus type** — `'idle' | 'working' | 'waiting_input' | 'error' | 'completed'`
- **SSE event shapes** — WorkUnitStatusEvent, WorkUnitRegisteredEvent, WorkUnitRemovedEvent
- **Tidy-up rules** — 24h expiry for non-working/non-waiting entries; called on startup + register
- **Persistence** — `<worktree>/.chainglass/data/work-unit-state.json` (per ADR-0008 Layer 2)
- **State path publishing** — `work-unit-state:{id}:status`, `work-unit-state:{id}:intent`, `work-unit-state:{id}:name`
- **DI token** — `POSITIONAL_GRAPH_DI_TOKENS.WORK_UNIT_STATE_SERVICE`
- **FakeWorkUnitStateService** — test double with getRegistered(), getRegisteredCount(), reset()
- **Contract tests** — factory + runner verifying real/fake parity (57 tests)
- **Route descriptor** — workUnitStateRoute (SSE → GlobalStateSystem bridge)

### Does NOT Own
- **Q&A mechanics** — owned by `workflow-events` (Plan 061). WorkUnitStateService only observes status.
- **Generic state pub/sub** — owned by `_platform/state`. Work-unit-state publishes via CEN → SSE.
- **SSE transport** — owned by `_platform/events`.
- **Agent lifecycle** — owned by `agents`. Bridge is in agents domain.
- **UI components** — top bar chips/overlay owned by `agents` (Phase 3).

## Contracts

| Contract | Type | Location | Consumers |
|----------|------|----------|-----------|
| `IWorkUnitStateService` | interface | `packages/shared/src/interfaces/work-unit-state.interface.ts` | agents (bridge), workflow-ui (future) |
| `WorkUnitEntry` | type | `packages/shared/src/work-unit-state/types.ts` | Any consumer reading unit state |
| `WorkUnitStatus` | type | `packages/shared/src/work-unit-state/types.ts` | Status indicators, badges |
| `WorkUnitEvent` (union) | type | `packages/shared/src/work-unit-state/types.ts` | Route descriptor |
| `FakeWorkUnitStateService` | fake | `packages/shared/src/fakes/fake-work-unit-state.ts` | All test consumers |
| `WORK_UNIT_STATE_SERVICE` | DI token | `packages/shared/src/di-tokens.ts` | DI container |

## Composition

| Component | Type | Location | Role |
|-----------|------|----------|------|
| `WorkUnitStateService` | service | `apps/web/src/lib/work-unit-state/work-unit-state.service.ts` | Real implementation with persistence + CEN emit |
| `workUnitStateRoute` | descriptor | `apps/web/src/lib/state/work-unit-state-route.ts` | SSE → GlobalStateSystem bridge |
| `AgentWorkUnitBridge` | bridge | `apps/web/src/features/059-fix-agents/agent-work-unit-bridge.ts` | Agent lifecycle → work-unit-state (in agents domain) |
| `/api/worktree-activity` | API route | `apps/web/app/api/worktree-activity/route.ts` | Cross-worktree activity reader (reads JSON directly, no interface change — Phase 4, DYK-P4-01) |

## Dependencies

### This Domain Depends On

| Domain | Contract | Why |
|--------|----------|-----|
| `_platform/events` | `ICentralEventNotifier` | Emit SSE events on state changes |
| `_platform/events` | `WorkspaceDomain.WorkUnitState` | SSE channel identity |
| `_platform/state` | `ServerEventRouteDescriptor` | Route SSE events to GlobalStateSystem |

### Domains That Depend On This

| Domain | Contract | Why |
|--------|----------|-----|
| `agents` | `IWorkUnitStateService` | Bridge publishes agent status |
| `workflow-ui` | `IWorkUnitStateService` (future) | Top bar chips read work unit status |

## Source Locations

```
packages/shared/src/
├── interfaces/work-unit-state.interface.ts   # IWorkUnitStateService
├── work-unit-state/
│   ├── types.ts                               # All types + SSE event shapes
│   └── index.ts                               # Barrel export
├── fakes/fake-work-unit-state.ts              # FakeWorkUnitStateService
└── di-tokens.ts                               # WORK_UNIT_STATE_SERVICE token

apps/web/src/
├── lib/work-unit-state/
│   ├── work-unit-state.service.ts             # Real implementation
│   └── index.ts                               # Barrel export
├── lib/state/work-unit-state-route.ts         # SSE route descriptor
├── lib/state/state-connector.tsx              # Route registered here
└── features/059-fix-agents/
    └── agent-work-unit-bridge.ts              # Agent → work-unit-state bridge

test/contracts/
├── work-unit-state.contract.ts                # Contract test factory (57 tests)
└── work-unit-state.contract.test.ts           # Contract test runner
```

## History

| Plan | What Changed | Date |
|------|-------------|------|
| 059-fix-agents Workshop 003 | System designed — data model, interfaces, state paths | 2026-02-28 |
| 059-fix-agents Phase 2 | Domain implemented: interface, types, fake, real impl (no Q&A — handled by WorkflowEvents), contract tests (57), bridge with WF observers, DI registration, route descriptor, integration guide | 2026-03-02 |
| 059-fix-agents Phase 4 | Cross-worktree activity API endpoint — reads work-unit-state.json directly from other worktrees (no interface change per DYK-P4-01), path validation against WorkspaceService | 2026-03-02 |
