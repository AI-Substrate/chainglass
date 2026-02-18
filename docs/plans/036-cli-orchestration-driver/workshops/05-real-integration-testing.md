# Workshop: Real Integration Testing with Faked Agents

**Type**: Integration Pattern
**Plan**: 036-cli-orchestration-driver (Subtask: Phase 5 deferred tests T001-T005)
**Spec**: [cli-orchestration-driver-spec.md](../cli-orchestration-driver-spec.md)
**Created**: 2026-02-18
**Status**: Draft

**Related Documents**:
- [01-cli-driver-experience-and-validation.md](./01-cli-driver-experience-and-validation.md) § Part 7, Part 9
- [04-drive-test-scenarios.md](./04-drive-test-scenarios.md) — unit test scenarios
- `test/e2e/positional-graph-orchestration-e2e.ts` — reference implementation

---

## Purpose

Design the integration test and standalone demo script that prove `drive()` works with real graph progression. No more canned fakes — real orchestration engine, real graph state on disk, real event processing. The only fake is the agent itself, which "plays its role" by raising events via the graph service between drive iterations.

## Key Questions Addressed

- How does a faked agent raise events that the orchestration settle phase picks up?
- How do we break the drive() loop to interleave agent actions?
- What's the exact sequence of calls to transition a node from pending → complete?
- How do we build a standalone script that shows each step visually?
- How does session inheritance work across serial nodes?

---

## Part 1: The Problem with drive()

`drive()` owns the loop. Once called, it runs continuously until the graph completes, fails, or hits max iterations. We can't interleave agent actions between iterations from outside.

**But we can from INSIDE.** The `FakeAgentInstance.run()` is called by ODS during each `run()` iteration. If we give the fake a callback that raises events on the graph, those events are picked up by the next iteration's settle phase.

```
drive() loop:
  iteration 1: settle → reality → ONBAS says start-node(worker-a)
               → ODS calls pod.execute() → pod calls agentInstance.run()
               → FAKE AGENT: raises node:accepted + node:completed via graphService
               → run() returns with 1 action
  iteration 2: settle picks up node:accepted + node:completed events
               → reality shows worker-a complete
               → ONBAS says start-node(worker-b)
               → same pattern
  iteration 3: settle picks up worker-b events
               → reality shows all complete
               → ONBAS says no-action(graph-complete)
               → drive() exits with exitReason: 'complete'
```

This is the key insight: **the fake agent does its work synchronously inside `run()`**, mutating graph state before returning. The settle phase on the next iteration processes those mutations.

---

## Part 2: The FakeAgentInstance onRun Callback

The existing `FakeAgentInstance` from `@chainglass/shared` has no callback mechanism. We need to add one.

### Option A: Add `onRun` to FakeAgentInstance (cross-plan-edit)

```typescript
// In FakeAgentInstance constructor options:
export interface FakeAgentInstanceOptions {
  initialStatus?: AgentInstanceStatus;
  runResult?: AgentResult;
  compactResult?: AgentResult;
  events?: Array<{ type: string; timestamp: string; data: unknown }>;
  onRun?: (options: AgentRunOptions) => Promise<void>;  // NEW
}

// In run():
async run(options: AgentRunOptions): Promise<AgentResult> {
  // ... existing status checks and history recording ...
  
  // Execute side-effect callback before returning result
  if (this._onRun) {
    await this._onRun(options);
  }
  
  // ... existing event emission and result return ...
}
```

**Pros**: Reusable by all future tests. Clean interface.
**Cons**: Cross-plan-edit to `@chainglass/shared`.

### Option B: Local subclass in integration test

```typescript
class AgentWithSideEffects extends FakeAgentInstance {
  private _sideEffect?: () => Promise<void>;

  setSideEffect(fn: () => Promise<void>): void {
    this._sideEffect = fn;
  }

  async run(options: AgentRunOptions): Promise<AgentResult> {
    if (this._sideEffect) {
      await this._sideEffect();
    }
    return super.run(options);
  }
}
```

**Pros**: No cross-plan-edit. Self-contained.
**Cons**: Fragile — depends on `super.run()` internals. Not reusable.

### Recommendation: Option A

Small, clean addition to `FakeAgentInstance`. One optional field. Benefits all future integration tests.

---

## Part 3: What the Fake Agent Does

When `run()` is called, the fake agent simulates what a real agent would do via CLI:

```typescript
// Configure the fake to "play the agent role"
function makeAgentSideEffect(
  graphService: IPositionalGraphService,
  ctx: WorkspaceContext,
  graphSlug: string,
  nodeId: string,
  outputs?: Record<string, unknown>
): () => Promise<void> {
  return async () => {
    // 1. Raise node:accepted event (starting → agent-accepted)
    await graphService.raiseNodeEvent(ctx, graphSlug, nodeId, 'node:accepted', {}, 'agent');

    // 2. Save outputs (if any)
    if (outputs) {
      for (const [name, value] of Object.entries(outputs)) {
        await graphService.saveOutputData(ctx, graphSlug, nodeId, name, value);
      }
    }

    // 3. Raise node:completed event (agent-accepted → complete)
    await graphService.raiseNodeEvent(ctx, graphSlug, nodeId, 'node:completed', {}, 'agent');
  };
}
```

**Note**: `raiseNodeEvent` is the service method used by the CLI handlers (`handleNodeAccept`, `handleNodeEnd`). It records the event AND processes it (settle + persist). The next `run()` iteration will see the state change.

Actually — let me check whether `raiseNodeEvent` does settle inline or just records. Let me trace this...

The CLI handler for `accept` calls `service.raiseNodeEvent()` which:
1. Validates event type against registry
2. Creates event record and appends to state
3. Calls `eventService.handleEvents()` → runs handler (sets status)
4. Persists state

So after `raiseNodeEvent('node:accepted')`, the state file on disk has `status: 'agent-accepted'`. The next `run()` iteration loads this state and the settle phase sees it.

For `node:completed` (via the `end` CLI command), the pattern uses `raiseNodeEvent('node:completed')` which sets `status: 'complete'`.

**But wait** — this is the CLI path. Inside the integration test, the fake agent is called by ODS during `run()`. If we call `raiseNodeEvent` inside the fake's `onRun`, we're modifying state while `run()` is still executing. Is that safe?

Yes — because:
1. `run()` calls ODS → pod → agent → `onRun` callback → modifies state on disk
2. Agent returns → ODS returns → `run()` records the action
3. `run()` loops back to step 1: loads fresh state from disk → settle → sees the events
4. If ONBAS finds another node to start, `run()` continues. If no-action, `run()` exits.
5. `drive()` checks the result and either loops or exits.

The state is persisted to disk inside `onRun`, and `run()` reloads from disk on each iteration. No in-memory conflict.

---

## Part 4: The Test Graph

From Workshop 01 Part 9 — minimal graph that exercises key scenarios:

```
Line 0: [setup]        (user-input) — pre-completed before drive()
Line 1: [worker-a] → [worker-b]   (agent, serial — session inheritance)
```

### Graph Setup

```typescript
// 1. Create graph
const createResult = await graphService.create(ctx, 'integration-test');
const defaultLineId = createResult.lineId; // line-000

// 2. Add second line
const line1 = await graphService.addLine(ctx, 'integration-test');

// 3. Add nodes
// Line 0: user-input node (on default line)
const setup = await graphService.addNode(ctx, 'integration-test', defaultLineId, 'setup-unit');

// Line 1: two serial agent nodes
const workerA = await graphService.addNode(ctx, 'integration-test', line1.lineId!, 'worker-a-unit');
const workerB = await graphService.addNode(ctx, 'integration-test', line1.lineId!, 'worker-b-unit');

// 4. Wire inputs: worker-a reads from setup, worker-b reads from worker-a
await graphService.setInput(ctx, 'integration-test', workerA.nodeId!, 'task', {
  from_node: setup.nodeId!,
  from_output: 'instructions',
});
await graphService.setInput(ctx, 'integration-test', workerB.nodeId!, 'previous-work', {
  from_node: workerA.nodeId!,
  from_output: 'result',
});
```

### Pre-Complete the User-Input Node

Before calling `drive()`, the user-input node must be completed (simulating a human providing inputs):

```typescript
// Play the "user" role for the setup node
await graphService.raiseNodeEvent(ctx, 'integration-test', setup.nodeId!, 'node:accepted', {}, 'cli');
await graphService.saveOutputData(ctx, 'integration-test', setup.nodeId!, 'instructions', 
  JSON.stringify({ task: 'Build a calculator' }));
await graphService.raiseNodeEvent(ctx, 'integration-test', setup.nodeId!, 'node:completed', {}, 'cli');
```

### Work Units on Disk

Each `unitSlug` must have a `unit.yaml` in `.chainglass/units/<slug>/`. For the integration test, create minimal work units:

```yaml
# .chainglass/units/setup-unit/unit.yaml
slug: setup-unit
type: user-input
version: 1.0.0
description: Test setup
outputs:
  - name: instructions
    type: data
    data_type: text
    required: true
user_input:
  question_type: text
  prompt: "Enter instructions"

# .chainglass/units/worker-a-unit/unit.yaml
slug: worker-a-unit
type: agent
version: 1.0.0
description: First worker
agent:
  prompt_template: prompts/main.md
  supported_agents: [claude-code]
inputs:
  - name: task
    type: data
    data_type: text
    required: true
outputs:
  - name: result
    type: data
    data_type: text
    required: true

# .chainglass/units/worker-b-unit/unit.yaml
slug: worker-b-unit
type: agent
version: 1.0.0
description: Second worker (inherits session)
agent:
  prompt_template: prompts/main.md
  supported_agents: [claude-code]
inputs:
  - name: previous-work
    type: data
    data_type: text
    required: true
outputs:
  - name: final-result
    type: data
    data_type: text
    required: true
```

Plus minimal prompt files:
```
# .chainglass/units/worker-a-unit/prompts/main.md
Do the work described in your inputs.

# .chainglass/units/worker-b-unit/prompts/main.md
Continue the work from the previous agent.
```

---

## Part 5: The Integration Test

```typescript
// test/integration/orchestration-drive.test.ts

describe('drive() full-stack integration', () => {
  let ctx: WorkspaceContext;
  let graphService: IPositionalGraphService;
  let orchestrationService: OrchestrationService;
  let agentManager: FakeAgentManagerService;

  beforeEach(async () => {
    // Create temp workspace with work units on disk
    const { service, ctx: testCtx } = await createTestServiceStack();
    ctx = testCtx;
    graphService = service;

    // Write work unit YAMLs to disk
    await writeWorkUnits(ctx);

    // Build orchestration stack (same as e2e)
    const stack = createOrchestrationStack(graphService, ctx);
    orchestrationService = stack.orchestrationService;
    agentManager = stack.agentManager;
  });

  it('drives 2-line, 3-node graph to completion with fake agents', async () => {
    // 1. Create graph
    const graph = await graphService.create(ctx, 'drive-test');
    const line1 = await graphService.addLine(ctx, 'drive-test');
    const setup = await graphService.addNode(ctx, 'drive-test', graph.lineId, 'setup-unit');
    const workerA = await graphService.addNode(ctx, 'drive-test', line1.lineId!, 'worker-a-unit');
    const workerB = await graphService.addNode(ctx, 'drive-test', line1.lineId!, 'worker-b-unit');

    // 2. Wire inputs
    await graphService.setInput(ctx, 'drive-test', workerA.nodeId!, 'task', {
      from_node: setup.nodeId!, from_output: 'instructions',
    });
    await graphService.setInput(ctx, 'drive-test', workerB.nodeId!, 'previous-work', {
      from_node: workerA.nodeId!, from_output: 'result',
    });

    // 3. Pre-complete user-input node
    await completeUserInputNode(graphService, ctx, 'drive-test', setup.nodeId!, {
      instructions: JSON.stringify({ task: 'Build it' }),
    });

    // 4. Configure fake agents to "play their role"
    agentManager.setOnInstanceCreated((instance, nodeId) => {
      instance.setOnRun(async () => {
        await completeAgentNode(graphService, ctx, 'drive-test', nodeId, {
          result: JSON.stringify({ done: true }),
        });
      });
    });

    // 5. Drive!
    const handle = await orchestrationService.get(ctx, 'drive-test');
    const events: DriveEvent[] = [];
    const result = await handle.drive({
      actionDelayMs: 0,
      idleDelayMs: 0,
      onEvent: async (e) => events.push(e),
    });

    // 6. Assert
    expect(result.exitReason).toBe('complete');
    expect(result.totalActions).toBeGreaterThan(0);

    // Verify all nodes are complete
    const reality = await handle.getReality();
    expect(reality.isComplete).toBe(true);

    // Verify status events were emitted
    const statusEvents = events.filter(e => e.type === 'status');
    expect(statusEvents.length).toBeGreaterThan(0);
  });
});
```

### Helper Functions

```typescript
async function completeUserInputNode(
  graphService: IPositionalGraphService,
  ctx: WorkspaceContext,
  graphSlug: string,
  nodeId: string,
  outputs: Record<string, string>
): Promise<void> {
  // Start + accept
  await graphService.raiseNodeEvent(ctx, graphSlug, nodeId, 'node:accepted', {}, 'cli');
  // Save outputs
  for (const [name, value] of Object.entries(outputs)) {
    await graphService.saveOutputData(ctx, graphSlug, nodeId, name, value);
  }
  // Complete
  await graphService.raiseNodeEvent(ctx, graphSlug, nodeId, 'node:completed', {}, 'cli');
}

async function completeAgentNode(
  graphService: IPositionalGraphService,
  ctx: WorkspaceContext,
  graphSlug: string,
  nodeId: string,
  outputs: Record<string, string>
): Promise<void> {
  await graphService.raiseNodeEvent(ctx, graphSlug, nodeId, 'node:accepted', {}, 'agent');
  for (const [name, value] of Object.entries(outputs)) {
    await graphService.saveOutputData(ctx, graphSlug, nodeId, name, value);
  }
  await graphService.raiseNodeEvent(ctx, graphSlug, nodeId, 'node:completed', {}, 'agent');
}
```

---

## Part 6: The Standalone Demo Script

A runnable script that shows EVERY step with visual output:

```typescript
// scripts/drive-demo.ts
// Run: npx tsx scripts/drive-demo.ts

import { ... } from '../packages/positional-graph/...';

async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log('  drive() Demo — Real Graph Progression');
  console.log('═══════════════════════════════════════════════\n');

  // 1. Setup workspace + graph
  console.log('📦 Creating workspace and graph...');
  const { service, ctx } = await createTestServiceStack();
  await writeWorkUnits(ctx);
  
  const graph = await service.create(ctx, 'demo-pipeline');
  const line1 = await service.addLine(ctx, 'demo-pipeline');
  const setup = await service.addNode(ctx, 'demo-pipeline', graph.lineId, 'setup-unit');
  const workerA = await service.addNode(ctx, 'demo-pipeline', line1.lineId!, 'worker-a-unit');
  const workerB = await service.addNode(ctx, 'demo-pipeline', line1.lineId!, 'worker-b-unit');
  console.log(`  ✅ Graph created: 2 lines, 3 nodes`);
  console.log(`     Line 0: ${setup.nodeId} (user-input)`);
  console.log(`     Line 1: ${workerA.nodeId} → ${workerB.nodeId} (agents)\n`);

  // 2. Wire inputs
  await service.setInput(ctx, 'demo-pipeline', workerA.nodeId!, 'task', {
    from_node: setup.nodeId!, from_output: 'instructions',
  });
  await service.setInput(ctx, 'demo-pipeline', workerB.nodeId!, 'previous-work', {
    from_node: workerA.nodeId!, from_output: 'result',
  });
  console.log('🔗 Inputs wired\n');

  // 3. Pre-complete user-input
  console.log('👤 Completing user-input node (setup)...');
  await completeUserInputNode(service, ctx, 'demo-pipeline', setup.nodeId!, {
    instructions: JSON.stringify({ task: 'Build a calculator app' }),
  });
  console.log('  ✅ User input provided\n');

  // 4. Build orchestration stack
  console.log('⚙️  Building orchestration stack...');
  const stack = createOrchestrationStack(service, ctx);
  
  // Configure fake agents
  stack.agentManager.setOnInstanceCreated((instance, nodeId) => {
    instance.setOnRun(async () => {
      console.log(`  🤖 Agent ${nodeId}: accepting + completing...`);
      await completeAgentNode(service, ctx, 'demo-pipeline', nodeId, {
        result: JSON.stringify({ status: 'done', by: nodeId }),
      });
    });
  });
  console.log('  ✅ Stack ready (fake agents configured)\n');

  // 5. Drive!
  console.log('🚀 Calling drive()...\n');
  const handle = await stack.orchestrationService.get(ctx, 'demo-pipeline');
  const result = await handle.drive({
    actionDelayMs: 100,
    idleDelayMs: 500,
    onEvent: async (event) => {
      switch (event.type) {
        case 'status':
          console.log(event.message);
          console.log();
          break;
        case 'iteration':
          console.log(`  → ${event.message}`);
          break;
        case 'idle':
          console.log(`  ⏳ ${event.message}`);
          break;
        case 'error':
          console.error(`  ❌ ${event.message}`);
          break;
      }
    },
  });

  // 6. Result
  console.log('\n═══════════════════════════════════════════════');
  console.log(`  Result: ${result.exitReason}`);
  console.log(`  Iterations: ${result.iterations}`);
  console.log(`  Total Actions: ${result.totalActions}`);
  console.log('═══════════════════════════════════════════════\n');

  // 7. Verify
  const reality = await handle.getReality();
  console.log(`  Graph complete: ${reality.isComplete}`);
  console.log(`  Completed nodes: ${reality.completedCount}/${reality.totalNodes}`);

  // Cleanup
  process.exit(result.exitReason === 'complete' ? 0 : 1);
}

main().catch((err) => {
  console.error('Demo failed:', err);
  process.exit(1);
});
```

**Expected output**:
```
═══════════════════════════════════════════════
  drive() Demo — Real Graph Progression
═══════════════════════════════════════════════

📦 Creating workspace and graph...
  ✅ Graph created: 2 lines, 3 nodes
     Line 0: setup (user-input)
     Line 1: worker-a → worker-b (agents)

🔗 Inputs wired

👤 Completing user-input node (setup)...
  ✅ User input provided

⚙️  Building orchestration stack...
  ✅ Stack ready (fake agents configured)

🚀 Calling drive()...

Graph: demo-pipeline (in_progress)
─────────────────────────────
  Line 0: ✅ setup
  Line 1: ⚪ worker-a → ⚪ worker-b
─────────────────────────────
  Progress: 1/3 complete

  → 1 action(s)
  🤖 Agent worker-a: accepting + completing...

Graph: demo-pipeline (in_progress)
─────────────────────────────
  Line 0: ✅ setup
  Line 1: ✅ worker-a → ⚪ worker-b
─────────────────────────────
  Progress: 2/3 complete

  → 1 action(s)
  🤖 Agent worker-b: accepting + completing...

Graph: demo-pipeline (complete)
─────────────────────────────
  Line 0: ✅ setup
  Line 1: ✅ worker-a → ✅ worker-b
─────────────────────────────
  Progress: 3/3 complete

  → Graph complete

═══════════════════════════════════════════════
  Result: complete
  Iterations: 3
  Total Actions: 2
═══════════════════════════════════════════════

  Graph complete: true
  Completed nodes: 3/3
```

---

## Part 7: Implementation Plan (Subtask)

### Prerequisites (before writing tests)

1. **Add `onRun` callback to FakeAgentInstance** (`@chainglass/shared`)
   - Optional `onRun?: (options: AgentRunOptions) => Promise<void>` on options
   - Called inside `run()` before returning result
   - Cross-plan-edit, 5 lines

2. **Add `setOnInstanceCreated` to FakeAgentManagerService** (optional)
   - Callback when a new instance is created: `(instance, nodeId) => void`
   - Lets tests configure agents dynamically as ODS creates them
   - OR: pre-configure agents by nodeId before drive()

3. **Verify `raiseNodeEvent` is available on IPositionalGraphService**
   - Already used by CLI handlers — confirmed available
   - Need to verify it works when called from inside a `run()` iteration

### Task Breakdown

| ID | Task | CS | Dependencies |
|----|------|-----|-------------|
| S001 | Add `onRun` callback to `FakeAgentInstance` | 1 | — |
| S002 | Create `createTestServiceStack()` helper for integration tests (temp workspace + real graph service) | 2 | — |
| S003 | Create work unit fixture writer (`writeWorkUnits()`) | 1 | S002 |
| S004 | Write integration test: graph completion | 3 | S001, S002, S003 |
| S005 | Write integration test: graph failure | 2 | S001, S002, S003 |
| S006 | Write integration test: max iterations | 1 | S002 |
| S007 | Create `scripts/drive-demo.ts` standalone script | 2 | S001, S002, S003 |
| S008 | Add `just drive-demo` to justfile | 1 | S007 |
| S009 | `just fft` clean | 1 | all |

### Estimated Scope

9 subtasks, ~CS-2 overall. The hardest part is S002 (test service stack) and S004 (making the full loop work). The rest follows from those.

---

## Part 8: Risk Analysis

| Risk | Severity | Mitigation |
|------|----------|------------|
| `raiseNodeEvent` inside `run()` causes state corruption | Medium | Events write to disk atomically. `run()` reloads from disk each iteration. No in-memory conflict. |
| ODS doesn't call `agentInstance.run()` for fake agents | Low | ODS calls `pod.execute()` → AgentPod calls `agentInstance.run()`. Proven in Phase 4 unit tests. |
| Work units not found on disk | Medium | `writeWorkUnits()` helper creates them in temp workspace. E2E pattern proven. |
| `FakeAgentManagerService` doesn't support per-node configuration | Medium | Either add `setOnInstanceCreated` callback or pre-register instances by nodeId. |
| Settle phase doesn't pick up events raised during same `run()` call | Low | `run()` loads fresh state from disk on each iteration. Events raised during ODS execution are persisted before the next settle. |

---

## Open Questions

### Q1: Should the fake agent call `raiseNodeEvent` or mutate state directly?

**RESOLVED**: Use `raiseNodeEvent` — it's the same path the CLI uses, validates event types, runs handlers, and persists atomically. Direct state mutation would bypass validation.

### Q2: Does ODS need the node to be in `starting` status before the fake agent can raise `node:accepted`?

**RESOLVED**: Yes — ODS calls `graphService.startNode()` (which transitions `pending` → `starting`), then calls `pod.execute()`. By the time the fake agent's `onRun` fires, the node is already in `starting` status. The `node:accepted` event handler validates the source state is `starting`. This all happens in the correct order within one `run()` iteration.

### Q3: Should the demo script clean up the temp workspace?

**OPEN**: The e2e creates a temp dir and doesn't clean up (useful for debugging). The demo script should probably do the same — print the workspace path so the user can inspect.
