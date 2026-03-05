# Work Unit State — Integration Guide

**Domain**: work-unit-state
**Plan**: 059 — Fix Agents (Phase 2)

## What Is WorkUnitStateService?

A centralized in-memory registry that tracks the status of all active work units (agents, workflow nodes, pods). It provides:

- **Registration** — any work unit source can register itself
- **Status publishing** — changes emit via CentralEventNotifier → SSE → GlobalStateSystem
- **Source ref lookup** — find work units by their graph origin (graphSlug + nodeId)
- **Auto-cleanup** — stale entries expire after 24h (working/waiting_input entries never expire)

It does NOT handle Q&A mechanics — that is WorkflowEvents (Plan 061). This service is a status aggregator.

## Key Types

```typescript
import type { IWorkUnitStateService } from '@chainglass/shared/interfaces/work-unit-state.interface';
import type {
  WorkUnitEntry,
  WorkUnitStatus,       // 'idle' | 'working' | 'waiting_input' | 'error' | 'completed'
  WorkUnitCreator,      // { type: string, label: string }
  WorkUnitSourceRef,    // { graphSlug: string, nodeId: string }
  RegisterWorkUnitInput,
  UpdateWorkUnitInput,
  WorkUnitFilter,
} from '@chainglass/shared/work-unit-state';
```

## Registering a Work Unit Source

```typescript
// From any server-side code with access to the DI container
const workUnitState = container.resolve<IWorkUnitStateService>(
  POSITIONAL_GRAPH_DI_TOKENS.WORK_UNIT_STATE_SERVICE
);

// Register an agent
workUnitState.register({
  id: 'agent-abc',
  name: 'Code Review Agent',
  creator: { type: 'agent', label: 'claude-code' },
  sourceRef: { graphSlug: 'my-graph', nodeId: 'review-node' },
});
```

## Publishing Status Updates

```typescript
// Agent starts working
workUnitState.updateStatus('agent-abc', {
  status: 'working',
  intent: 'Reviewing PR #42',
});

// Agent waiting for user input (set by bridge observers)
workUnitState.updateStatus('agent-abc', {
  status: 'waiting_input',
  intent: 'Needs approval to deploy',
});

// Agent completed
workUnitState.updateStatus('agent-abc', { status: 'completed' });
```

## Looking Up by Source Reference

```typescript
// Used by observer callbacks that receive (graphSlug, nodeId)
const unit = workUnitState.getUnitBySourceRef('my-graph', 'review-node');
if (unit) {
  console.log(`Found work unit: ${unit.id} (${unit.status})`);
}
```

## Using the AgentWorkUnitBridge

For agents, use the bridge instead of calling WorkUnitStateService directly:

```typescript
import { AgentWorkUnitBridge } from '@/features/059-fix-agents/agent-work-unit-bridge';

const bridge = new AgentWorkUnitBridge(workUnitState, workflowEvents);

// Register — auto-subscribes to WF observers if sourceRef provided
bridge.registerAgent('agent-abc', 'Code Review', 'claude-code', {
  graphSlug: 'my-graph',
  nodeId: 'review-node',
});

// Status updates
bridge.updateAgentStatus('agent-abc', 'working', 'Building');

// Unregister — auto-unsubscribes from WF observers
bridge.unregisterAgent('agent-abc');
```

The bridge auto-handles:
- `onQuestionAsked` → sets status to `'waiting_input'` with question text as intent
- `onQuestionAnswered` → sets status back to `'working'`

## State Path Schema

State paths follow the pattern: `work-unit-state:{id}:{property}`

| Path | Type | Description |
|------|------|-------------|
| `work-unit-state:{id}:status` | `WorkUnitStatus` | Current status |
| `work-unit-state:{id}:intent` | `string \| undefined` | Current activity |
| `work-unit-state:{id}:name` | `string` | Display name |

## SSE Event Shapes

Events emitted via `CentralEventNotifier.emit('work-unit-state', eventType, data)`:

| Event Type | When | Key Fields |
|-----------|------|------------|
| `registered` | New work unit registered | `id`, `name`, `status`, `creatorType`, `creatorLabel` |
| `status-changed` | Status updated | `id`, `status`, `intent`, `name` |
| `removed` | Work unit unregistered | `id` |

## Server Event Route

The `workUnitStateRoute` descriptor (in `apps/web/src/lib/state/work-unit-state-route.ts`) maps SSE events to GlobalStateSystem paths. It's registered in `SERVER_EVENT_ROUTES` in `state-connector.tsx`.

## tidyUp Lifecycle

- Called automatically on startup hydration and every `register()` call
- Removes entries with `lastActivityAt > 24h` ago
- **Never removes** entries with status `'working'` or `'waiting_input'`
- Public method — available for future housekeeping orchestrators

## Persistence

Data persists to `<worktree>/.chainglass/data/work-unit-state.json` per ADR-0008 Layer 2. The service hydrates lazily on first access.

## Relationship to WorkflowEvents (Plan 061)

| Concern | Owner |
|---------|-------|
| Q&A mechanics (ask, answer, get-answer) | WorkflowEvents |
| Event handshake (question:answer + node:restart) | WorkflowEvents |
| Status observation (waiting_input, working) | WorkUnitStateService (via bridge observers) |
| Cross-component visibility | WorkUnitStateService → GlobalStateSystem |

WorkUnitStateService does NOT duplicate Q&A. It only observes status changes through WorkflowEvents observer hooks.

## DI Token

```typescript
import { POSITIONAL_GRAPH_DI_TOKENS } from '@chainglass/shared';

const service = container.resolve<IWorkUnitStateService>(
  POSITIONAL_GRAPH_DI_TOKENS.WORK_UNIT_STATE_SERVICE
);
```

## Testing

Use `FakeWorkUnitStateService` from `@chainglass/shared/fakes`:

```typescript
import { FakeWorkUnitStateService } from '@chainglass/shared/fakes';

const fakeState = new FakeWorkUnitStateService();
fakeState.register({ id: 'test', name: 'Test', creator: { type: 'test', label: 'Test' } });
expect(fakeState.getRegistered()).toHaveLength(1);
fakeState.reset(); // Clear all entries
```

Contract tests in `test/contracts/work-unit-state.contract.ts` cover all methods for both real and fake.
