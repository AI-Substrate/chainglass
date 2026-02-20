# Workshop: Unified Disk Loader and Orchestration Stack Wiring

**Type**: Integration Pattern
**Plan**: 037-codepod-and-goat-integration
**Spec**: [codepod-and-goat-integration-spec.md](../codepod-and-goat-integration-spec.md)
**Created**: 2026-02-20
**Status**: Draft

**Related Documents**:
- [08-fire-and-forget-sync.md](./08-fire-and-forget-sync.md) — drive() polling parameters
- [05-real-integration-testing.md](./05-real-integration-testing.md) — onRun callback, agent simulation
- Phase 3 tasks: [tasks.md](../tasks/phase-3-simple-test-graphs/tasks.md) — DYK#3, DYK#4

---

## Purpose

Phase 3 integration tests need a full orchestration stack wired with real components. Two problems:
1. **Two separate loaders** (`IWorkUnitLoader` for graph service, `IWorkUnitService` for ODS) — misconfiguration causes silent failures
2. **No copy-paste wiring reference** — `createOrchestrationStack` is private in the e2e file

This workshop provides exact, tested wiring code that Phase 3 can use directly.

## Key Questions Addressed

- How do we share one source of truth for work units between graph service and ODS?
- What are the exact constructor signatures for every orchestration component?
- What's the minimal wiring code for a working integration test?

---

## Part 1: The Two-Loader Problem — Solved by Sharing

### Current State

```
PositionalGraphService                    ODS
  needs: IWorkUnitLoader                   needs: IWorkUnitService
  uses: { load(ctx, slug) →               uses: { load(ctx, slug) →
           NarrowWorkUnit }                         WorkUnitInstance }
  for: addNode() validation                for: script path resolution
```

### Why They Can Share

`WorkUnitInstance` is a structural superset of `NarrowWorkUnit` — it has `slug`, `type`, `inputs[]`, `outputs[]` plus additional fields like `code.script`. TypeScript structural typing means `IWorkUnitService` is assignable where `IWorkUnitLoader` is expected.

**One `IWorkUnitService` instance serves both consumers.** No adapter, no wrapper, no duplication.

### Solution: Build One Disk-Backed IWorkUnitService

```typescript
function buildDiskWorkUnitService(workspacePath: string): IWorkUnitService {
  const nodeFs = new NodeFileSystemAdapter();
  const yamlParser = new YamlParserAdapter();

  return {
    async load(ctx: WorkspaceContext, slug: string) {
      const unitPath = path.join(
        workspacePath, '.chainglass', 'units', slug, 'unit.yaml'
      );
      try {
        const content = await nodeFs.readFile(unitPath);
        const parsed = yamlParser.parse(content, unitPath);
        return { unit: parsed as WorkUnitInstance, errors: [] };
      } catch {
        return {
          unit: undefined,
          errors: [{ code: 'UNIT_NOT_FOUND', message: `Unit '${slug}' not found` }],
        };
      }
    },
    async list() {
      return { units: [], errors: [] };
    },
    async validate() {
      return { valid: true, errors: [] };
    },
  };
}
```

### Wiring

```typescript
const workUnitService = buildDiskWorkUnitService(tgc.workspacePath);

// Pass to BOTH consumers:
const service = new PositionalGraphService(
  nodeFs, pathResolver, yamlParser, adapter,
  workUnitService  // ← accepts IWorkUnitLoader, gets IWorkUnitService (structural subtype)
);

const ods = new ODS({
  graphService: service,
  workUnitService,  // ← same instance
  ...
});
```

One source. Both consumers. Same disk reads. No configuration drift.

---

## Part 2: Exact Orchestration Stack Wiring

### The Proven Pattern

From `test/e2e/positional-graph-orchestration-e2e.ts` lines 68-119, adapted for real ScriptRunner:

```typescript
import { NodeFileSystemAdapter, YamlParserAdapter } from '@chainglass/shared';
import {
  FakeNodeEventRegistry,
  NodeEventService,
  EventHandlerService,
  createEventHandlerRegistry,
  registerCoreEventTypes,
} from '@chainglass/positional-graph/features/032-node-event-system';
import {
  ONBAS,
  ODS,
  PodManager,
  OrchestrationService,
  AgentContextService,
  ScriptRunner,
} from '@chainglass/positional-graph/features/030-orchestration';
import { FakeAgentManagerService } from '@chainglass/shared/features/034-agentic-cli';
import type { IPositionalGraphService } from '@chainglass/positional-graph/interfaces';
import type { WorkspaceContext } from '@chainglass/workflow';
import type { IWorkUnitService } from '@chainglass/positional-graph/features/029-agentic-work-units';
```

### The Function

```typescript
interface TestOrchestrationStack {
  orchestrationService: OrchestrationService;
  eventHandlerService: EventHandlerService;
  agentManager: FakeAgentManagerService;
  podManager: PodManager;
}

function createTestOrchestrationStack(
  service: IPositionalGraphService,
  ctx: WorkspaceContext,
  workUnitService: IWorkUnitService
): TestOrchestrationStack {
  // ── Event System ──────────────────────────────────
  const eventRegistry = new FakeNodeEventRegistry();
  registerCoreEventTypes(eventRegistry);
  const handlerRegistry = createEventHandlerRegistry();
  const nes = new NodeEventService(
    {
      registry: eventRegistry,
      loadState: async (graphSlug) => service.loadGraphState(ctx, graphSlug),
      persistState: async (graphSlug, state) =>
        service.persistGraphState(ctx, graphSlug, state),
    },
    handlerRegistry
  );
  const eventHandlerService = new EventHandlerService(nes);

  // ── Orchestration Components ──────────────────────
  const nodeFs = new NodeFileSystemAdapter();
  const onbas = new ONBAS();
  const contextService = new AgentContextService();
  const podManager = new PodManager(nodeFs);
  const agentManager = new FakeAgentManagerService();
  const scriptRunner = new ScriptRunner();  // REAL — not fake

  const ods = new ODS({
    graphService: service,
    podManager,
    contextService,
    agentManager,
    scriptRunner,
    workUnitService,  // ← same instance as graph service's loader
  });

  const orchestrationService = new OrchestrationService({
    graphService: service,
    onbas,
    ods,
    eventHandlerService,
    podManager,
  });

  return { orchestrationService, eventHandlerService, agentManager, podManager };
}
```

### Key Differences from E2E

| Aspect | E2E (`positional-graph-orchestration-e2e.ts`) | Phase 3 Integration Tests |
|--------|-----------------------------------------------|---------------------------|
| ScriptRunner | `new FakeScriptRunner()` | `new ScriptRunner()` — **REAL** |
| WorkUnitService | `new FakeWorkUnitService()` (unconfigured) | `buildDiskWorkUnitService(workspacePath)` — **shared by graph service + ODS** |
| Workspace | Registered via CLI subprocess | Registered via WorkspaceService in `withTestGraph` |
| Graph creation | Inline in test file | Inline in `withTestGraph` callback |

---

## Part 3: Complete Integration Test Pattern

### Putting It All Together

```typescript
import { withTestGraph, type TestGraphContext } from '../../dev/test-graphs/shared/graph-test-runner.js';
import { completeUserInputNode } from '../../dev/test-graphs/shared/helpers.js';
import { assertGraphComplete, assertNodeComplete } from '../../dev/test-graphs/shared/assertions.js';

describe('simple-serial', () => {
  it('drives to completion', async () => {
    await withTestGraph('simple-serial', async (tgc) => {
      // 1. Build work unit service from disk (shared by graph service AND ODS)
      const workUnitService = buildDiskWorkUnitService(tgc.workspacePath);

      // 2. Build orchestration stack
      const { orchestrationService } = createTestOrchestrationStack(
        tgc.service, tgc.ctx, workUnitService
      );

      // 3. Create graph
      const { lineId } = await tgc.service.create(tgc.ctx, 'simple-serial');
      const setup = await tgc.service.addNode(tgc.ctx, 'simple-serial', lineId, 'setup');
      const worker = await tgc.service.addNode(tgc.ctx, 'simple-serial', lineId, 'worker');

      // 4. Wire inputs
      await tgc.service.setInput(tgc.ctx, 'simple-serial', worker.nodeId, 'task', {
        from_node: setup.nodeId,
        from_output: 'instructions',
      });

      // 5. Complete user-input node
      await completeUserInputNode(
        tgc.service, tgc.ctx, 'simple-serial', setup.nodeId,
        { instructions: 'Build the widget' }
      );

      // 6. Drive with test-tuned parameters (Workshop 08)
      const handle = await orchestrationService.get(tgc.ctx, 'simple-serial');
      const result = await handle.drive({
        maxIterations: 100,
        actionDelayMs: 50,
        idleDelayMs: 1000,
        onEvent: (event) => {
          if (event.type !== 'status') {
            console.log(`  [drive] ${event.type}: ${event.message}`);
          }
        },
      });

      // 7. Assert
      expect(result.exitReason).toBe('complete');
      await assertGraphComplete(tgc.service, tgc.ctx, 'simple-serial');
      await assertNodeComplete(tgc.service, tgc.ctx, 'simple-serial', setup.nodeId);
      await assertNodeComplete(tgc.service, tgc.ctx, 'simple-serial', worker.nodeId);
    });
  }, 60_000);
});
```

---

## Part 4: Where to Put the Wiring Code

### Option A: In `dev/test-graphs/shared/` (RECOMMENDED)

Add to `graph-test-runner.ts`:
- `buildDiskUnitLoaders()` — replaces existing `buildDiskLoader()`
- `createTestOrchestrationStack()` — new export

**Why**: Phase 3 and Phase 4 both need it. Co-located with `withTestGraph`. One import path.

### Option B: In `test/helpers/`

Extract to `test/helpers/orchestration-test-helpers.ts`.

**Why not**: This is specific to test graph fixtures. The e2e helpers are for standalone E2E scripts. Different audience.

### Decision: Option A

```typescript
// dev/test-graphs/shared/graph-test-runner.ts exports:
export { withTestGraph, type TestGraphContext }   // Phase 2
export { buildDiskWorkUnitService }               // Phase 3 (replaces buildDiskLoader)
export { createTestOrchestrationStack }           // Phase 3
```

---

## Part 5: Import Map for Phase 3 Tests

All imports the integration test needs:

```typescript
// Test infrastructure (Phase 2)
import {
  withTestGraph,
  buildDiskWorkUnitService,
  createTestOrchestrationStack,
} from '../../dev/test-graphs/shared/graph-test-runner.js';
import { completeUserInputNode } from '../../dev/test-graphs/shared/helpers.js';
import {
  assertGraphComplete,
  assertNodeComplete,
  assertOutputExists,
} from '../../dev/test-graphs/shared/assertions.js';

// Vitest
import { describe, expect, it } from 'vitest';

// Types only
import type { DriveEvent } from '@chainglass/positional-graph/features/030-orchestration';
```

No direct imports of ONBAS, ODS, PodManager, etc. — all hidden inside `createTestOrchestrationStack`.

---

## Open Questions

### Q1: Should `withTestGraph` call `createTestOrchestrationStack` internally?

**RESOLVED: No.** Keep them separate. `withTestGraph` handles workspace lifecycle (filesystem). `createTestOrchestrationStack` handles orchestration wiring (services). Phase 3 tests compose both. Some future tests may want `withTestGraph` without orchestration (e.g., testing graph creation only).

### Q2: Does `buildDiskUnitLoaders` need to implement `IWorkUnitService.list()`?

**RESOLVED: No.** ODS only calls `load()`. Return empty stubs for `list()` and `validate()`. If Phase 4 GOAT needs them, add then.

### Q3: Should we handle `loadGraphState`/`persistGraphState` differently?

**RESOLVED: No.** The `service.loadGraphState(ctx, slug)` / `service.persistGraphState(ctx, slug, state)` pattern works because `PositionalGraphService` reads/writes state to the temp workspace. The NES deps are thin wrappers over these service methods, same as in the E2E test.

---

## Decision Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Single disk source | `buildDiskWorkUnitService()` — one IWorkUnitService shared by both consumers | Structural subtyping: IWorkUnitService satisfies IWorkUnitLoader. No adapter needed. |
| Wiring location | `dev/test-graphs/shared/graph-test-runner.ts` | Co-located with `withTestGraph`, shared across Phase 3+4 |
| ScriptRunner | Real `ScriptRunner()` (not fake) | Scripts actually execute in integration tests |
| AgentManager | `FakeAgentManagerService` | No agent nodes in Phase 3 (code-only) |
| Separation | `withTestGraph` ≠ orchestration stack | Different concerns, composable |
