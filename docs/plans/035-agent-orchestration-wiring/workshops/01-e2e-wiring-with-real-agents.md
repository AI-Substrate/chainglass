# Workshop: E2E Testing the Wiring with Real Agents

**Type**: Integration Pattern
**Plan**: 035-agent-orchestration-wiring
**Spec**: [agent-orchestration-wiring-spec.md](../agent-orchestration-wiring-spec.md)
**Created**: 2026-02-17
**Status**: Draft

**Related Documents**:
- [033 Workshop 02: Unified AgentInstance / AgentManagerService Design](../../033-real-agent-pods/workshops/02-unified-agent-design.md) — ODS/AgentPod redesign
- [033 Workshop 06: Plan 030 E2E Upgrade Strategy](../../033-real-agent-pods/workshops/06-plan-030-e2e-upgrade-strategy.md) — Fake E2E wiring change
- [034 Workshop 01: CLI Agent Run and E2E Testing](../../034-agentic-cli/workshops/01-cli-agent-run-and-e2e-testing.md) — Real agent test tiers, skip logic, structural assertions
- `test/integration/agent-instance-real.test.ts` — Plan 034's real agent tests (13 tests, `describe.skip`)
- `test/integration/real-agent-multi-turn.test.ts` — Adapter-level real agent tests
- `test/e2e/positional-graph-orchestration-e2e.ts` — Plan 030 fake E2E (1128 lines)

---

## Purpose

Define how to prove the orchestration wiring (ODS → AgentManagerService → AgentInstance → real adapter) works end-to-end with BOTH Claude Code and Copilot SDK adapters. This is not about testing the full pipeline with prompts and `cg wf run` (that's Spec C) — this is about proving the wiring itself is correct: ODS creates instances, pods execute them, sessions flow through, events pass through, and the adapters actually run.

## Key Questions Addressed

- Q1: What exactly needs to be proven about the wiring with real agents?
- Q2: How do we construct a real orchestration stack (not fakes) for testing?
- Q3: What does the test graph look like — minimal but sufficient?
- Q4: How do we handle both Claude Code and Copilot in the same test suite?
- Q5: What skip/guard patterns apply?
- Q6: What assertions are valid for non-deterministic real agents in a wiring test?
- Q7: How does session inheritance work through the full ODS → PodManager → AgentPod chain with real sessions?
- Q8: Where do these tests live relative to Plan 034's real agent tests?

---

## What "Testing the Wiring" Means

Plan 034 already proved that `AgentInstance` works with real adapters (13 tests in `agent-instance-real.test.ts`). Those tests construct `AgentManagerService` directly and call `instance.run()`.

What Plan 034 did NOT test is the **orchestration path**:

```
ODS.handleAgentOrCode()
  → AgentContextService.getContextSource()
  → agentManager.getNew() or .getWithSessionId()
  → podManager.createPod(nodeId, { agentInstance })
  → pod.execute()
    → agentInstance.run({ prompt, cwd })
      → adapter.run({ prompt, sessionId, cwd })
        → REAL AGENT PROCESS
```

This is the chain we need to prove works. Each link has been tested individually with fakes. The wiring test proves they compose correctly with real adapters.

### What Each Link Proves

| Link | What Could Go Wrong | What We Verify |
|------|---------------------|----------------|
| ODS → agentManager.getNew() | Wrong params, type resolution fails | Instance created with correct type |
| ODS → agentManager.getWithSessionId() | Session lookup fails, wrong session | Instance has correct sessionId baked in |
| podManager.createPod() with agentInstance | PodCreateParams shape mismatch | Pod created successfully |
| pod.execute() → instance.run() | Prompt not passed, CWD wrong | Agent runs and returns result |
| instance.run() → adapter.run() | Adapter factory returns wrong type | Real process spawned |
| Event pass-through | Events lost in the chain | Handlers on instance receive adapter events |
| Session flow-through | sessionId not updated on pod | pod.sessionId reflects adapter result |
| Session inheritance | Second pod doesn't get first's session | Second agent resumes from first's history |

---

## Test Architecture: Minimal Orchestration Stack with Real Adapters

### Construction Pattern

The test constructs the SAME orchestration stack as production, but with real adapters instead of fakes:

```typescript
function createRealOrchestrationStack(
  service: IPositionalGraphService,
  ctx: WorkspaceContext,
  adapterType: 'claude-code' | 'copilot',
) {
  // Event system — same as fake E2E
  const eventRegistry = new FakeNodeEventRegistry();
  registerCoreEventTypes(eventRegistry);
  const handlerRegistry = createEventHandlerRegistry();
  const nes = new NodeEventService(
    {
      registry: eventRegistry,
      loadState: async (graphSlug) => service.loadGraphState(ctx, graphSlug),
      persistState: async (graphSlug, state) => service.persistGraphState(ctx, graphSlug, state),
    },
    handlerRegistry,
  );
  const eventHandlerService = new EventHandlerService(nes);

  // Real adapter factory — the KEY difference from fake E2E
  const adapterFactory = buildRealAdapterFactory(adapterType);

  // Real AgentManagerService — not FakeAgentManagerService
  const agentManager = new AgentManagerService(adapterFactory);

  // Orchestration components
  const nodeFs = new NodeFileSystemAdapter();
  const onbas = new ONBAS();
  const contextService = new AgentContextService();
  const podManager = new PodManager(nodeFs);
  const scriptRunner = new FakeScriptRunner(); // code pods still fake
  const ods = new ODS({
    graphService: service,
    podManager,
    contextService,
    agentManager,  // REAL manager with REAL adapters
    scriptRunner,
  });

  const orchestrationService = new OrchestrationService({
    graphService: service,
    onbas,
    ods,
    eventHandlerService,
  });

  return { orchestrationService, eventHandlerService, agentManager, podManager };
}
```

### Real Adapter Factory

```typescript
function buildRealAdapterFactory(type: 'claude-code' | 'copilot'): AdapterFactory {
  if (type === 'claude-code') {
    // Dynamic import to avoid loading in unit test context
    const logger = new FakeLogger();
    const processManager = new UnixProcessManager(logger);
    return (agentType: AgentType) => {
      if (agentType !== 'claude-code') throw new Error(`Expected claude-code, got ${agentType}`);
      return new ClaudeCodeAdapter(processManager, { logger });
    };
  }

  if (type === 'copilot') {
    // CopilotClient must be created once and shared (ESM-only, heavy init)
    const copilotClient = new CopilotClient();
    return (agentType: AgentType) => {
      if (agentType !== 'copilot') throw new Error(`Expected copilot, got ${agentType}`);
      return new SdkCopilotAdapter(copilotClient, { logger: new FakeLogger() });
    };
  }

  throw new Error(`Unknown adapter type: ${type}`);
}
```

### Dynamic Imports

Following Plan 034's established pattern, all real adapter imports are dynamic to avoid loading heavy dependencies in the unit test context:

```typescript
let ClaudeCodeAdapter: typeof import('@chainglass/shared')['ClaudeCodeAdapter'];
let UnixProcessManager: typeof import('@chainglass/shared')['UnixProcessManager'];
let SdkCopilotAdapter: Awaited<typeof import('@chainglass/shared/adapters')>['SdkCopilotAdapter'];
let CopilotClient: Awaited<typeof import('@github/copilot-sdk')>['CopilotClient'];

beforeAll(async () => {
  const shared = await import('@chainglass/shared');
  ClaudeCodeAdapter = shared.ClaudeCodeAdapter;
  UnixProcessManager = shared.UnixProcessManager;

  const adapters = await import('@chainglass/shared/adapters');
  SdkCopilotAdapter = adapters.SdkCopilotAdapter;

  const sdk = await import('@github/copilot-sdk');
  CopilotClient = sdk.CopilotClient;
});
```

---

## Test Graph: Minimal 2-Node Serial Pipeline

```
Line 0: node-a (agent, serial) → node-b (agent, serial, inherits from node-a)
```

No user-input nodes, no code pods, no parallel execution. The simplest graph that proves:
1. ODS creates an agent via `getNew()` for node-a
2. Agent runs and completes (pod.execute resolves)
3. Session is captured on the pod
4. ODS creates an agent via `getWithSessionId()` for node-b using node-a's session
5. Second agent runs with inherited session and completes

### Graph Setup

```typescript
async function createTestGraph(
  service: IPositionalGraphService,
  ctx: WorkspaceContext,
  graphSlug: string,
): Promise<void> {
  // Create graph with agent type setting
  await service.createGraph(ctx, graphSlug);
  await service.setGraphOrchestratorSettings(ctx, graphSlug, {
    agentType: 'claude-code', // or 'copilot' — parameterized per test suite
  });

  // Add line with 2 serial agent nodes
  const lineId = await service.addLine(ctx, graphSlug);
  await service.addNode(ctx, graphSlug, lineId, 'node-a', { unitType: 'agent' });
  await service.addNode(ctx, graphSlug, lineId, 'node-b', { unitType: 'agent' });
}
```

**Why no work unit prompts?** This is a wiring test, not a protocol test. The agent gets the current placeholder `node-starter-prompt.md` (24 lines of generic instructions). It doesn't need to DO anything meaningful — it just needs to run and return a result. The prompt says "use CLI commands to discover your task" — the agent will try, possibly fail to find inputs, and complete anyway. That's fine. We're testing the wiring, not the task.

---

## Test Suites

### Suite 1: Claude Code Wiring

```typescript
describe.skip('Orchestration Wiring: Claude Code', { timeout: 180_000 }, () => {
  let service: IPositionalGraphService;
  let ctx: WorkspaceContext;
  let stack: ReturnType<typeof createRealOrchestrationStack>;

  beforeAll(async () => {
    // Dynamic imports
    await loadRealAdapterModules();

    // Create service stack with real filesystem
    ({ service, ctx } = await createTestServiceStack('wiring-claude-e2e'));

    // Create orchestration stack with real Claude Code adapter
    stack = createRealOrchestrationStack(service, ctx, 'claude-code');
  });

  afterAll(async () => {
    // Cleanup test graph
    await cleanupTestGraph(service, ctx, GRAPH_SLUG);
  });

  describe('single node execution', () => {
    it('ODS creates instance via getNew, pod executes, agent runs', async () => {
      await createSingleNodeGraph(service, ctx, GRAPH_SLUG);

      // Run one settle-decide-act pass
      const handle = await stack.orchestrationService.get(ctx, GRAPH_SLUG);
      const result = await handle.run();

      // ODS should have started node-a
      expect(result.actions.length).toBeGreaterThan(0);
      expect(result.actions[0].request.type).toBe('start-node');

      // Wait for the real agent to finish (fire-and-forget, so we poll)
      const pod = stack.podManager.getPod('node-a');
      expect(pod).toBeDefined();

      // The agent was spawned — sessionId will be set after completion
      // For real agents, we need to wait for the pod to finish
      // Since we don't have execution tracking yet (that's Spec B),
      // we poll the pod's sessionId
      await waitForPodSession(pod!, 120_000);

      expect(pod!.sessionId).toBeTruthy();
    });
  });

  describe('session inheritance', () => {
    it('node-b inherits node-a session via getWithSessionId', async () => {
      await createTwoNodeGraph(service, ctx, GRAPH_SLUG);

      const handle = await stack.orchestrationService.get(ctx, GRAPH_SLUG);

      // Iteration 1: Start node-a
      const result1 = await handle.run();
      expect(result1.actions.some(a => a.request.nodeId === 'node-a')).toBe(true);

      // Wait for node-a to complete
      const podA = stack.podManager.getPod('node-a');
      await waitForPodSession(podA!, 120_000);
      const sessionA = podA!.sessionId;
      expect(sessionA).toBeTruthy();

      // Sync session so node-b can inherit
      stack.podManager.setSessionId('node-a', sessionA!);

      // We need to simulate node-a completion events in state
      // (real agent would have called cg wf node accept/end via CLI,
      //  but in the wiring test the agent gets a generic prompt and may not)
      // Instead, manually complete node-a in graph state:
      await completeNodeManually(service, ctx, GRAPH_SLUG, 'node-a');

      // Iteration 2: Settle sees node-a complete, starts node-b
      const result2 = await handle.run();
      expect(result2.actions.some(a => a.request.nodeId === 'node-b')).toBe(true);

      // node-b should have been created with getWithSessionId
      const podB = stack.podManager.getPod('node-b');
      await waitForPodSession(podB!, 120_000);

      expect(podB!.sessionId).toBeTruthy();
      // Fork: node-b gets a NEW session derived from node-a's
      expect(podB!.sessionId).not.toBe(sessionA);
    });
  });

  describe('event pass-through', () => {
    it('events from real adapter reach instance handlers', async () => {
      await createSingleNodeGraph(service, ctx, GRAPH_SLUG);

      // Capture events on any instance the manager creates
      const allEvents: AgentEvent[] = [];
      const agents = stack.agentManager.getAgents();
      // We'll attach handlers after ODS creates the instance

      const handle = await stack.orchestrationService.get(ctx, GRAPH_SLUG);
      await handle.run();

      // Get the instance ODS created
      const instances = stack.agentManager.getAgents();
      expect(instances.length).toBeGreaterThan(0);

      const instance = instances[0];
      instance.addEventHandler((e) => allEvents.push(e));

      // Wait for completion
      const pod = stack.podManager.getPod('node-a');
      await waitForPodSession(pod!, 120_000);

      // Real adapters emit events (text_delta, message, tool_call, etc.)
      expect(allEvents.length).toBeGreaterThan(0);
      expect(allEvents.some(e =>
        e.type === 'text_delta' || e.type === 'message'
      )).toBe(true);
    });
  });
});
```

### Suite 2: Copilot SDK Wiring

Same test structure, different adapter:

```typescript
describe.skip('Orchestration Wiring: Copilot SDK', { timeout: 180_000 }, () => {
  let service: IPositionalGraphService;
  let ctx: WorkspaceContext;
  let stack: ReturnType<typeof createRealOrchestrationStack>;

  beforeAll(async () => {
    await loadRealAdapterModules();
    ({ service, ctx } = await createTestServiceStack('wiring-copilot-e2e'));

    // Copilot adapter — same wiring, different factory
    stack = createRealOrchestrationStack(service, ctx, 'copilot');
  });

  // ... same 3 test cases as Claude Code suite ...
  // Only difference: agentType in graph settings and adapter factory
});
```

### Suite 3: Cross-Adapter Parity

```typescript
describe.skip('Orchestration Wiring: Cross-Adapter Parity', { timeout: 300_000 }, () => {
  it('both adapters produce a sessionId through the ODS→pod chain', async () => {
    // Run single-node graph with Claude Code
    const claudeStack = createRealOrchestrationStack(service, ctx, 'claude-code');
    // ... run and get sessionId ...

    // Run single-node graph with Copilot
    const copilotStack = createRealOrchestrationStack(service, ctx, 'copilot');
    // ... run and get sessionId ...

    // Both produced sessions
    expect(claudeSessionId).toBeTruthy();
    expect(copilotSessionId).toBeTruthy();
  });

  it('both adapters emit events through the instance chain', async () => {
    // Same test: capture events from both, verify both emit text events
  });
});
```

---

## The Waiting Problem: No Execution Tracking Yet

Spec A doesn't include `PodManager.trackExecution()` (that's Spec B). But real agents take 30-120 seconds. How does the test wait for completion?

### Solution: Poll `pod.sessionId`

```typescript
async function waitForPodSession(
  pod: IWorkUnitPod,
  timeoutMs: number,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (pod.sessionId) return;
    await new Promise(r => setTimeout(r, 1000));
  }
  throw new Error(`Pod did not acquire sessionId within ${timeoutMs}ms`);
}
```

**Why this works**: When `pod.execute()` fires (not awaited by ODS), the agent runs in the background. When the adapter returns, `AgentInstance.run()` sets the sessionId. The pod reads from the instance. Once `pod.sessionId` is truthy, the agent has finished.

**Why not await the execute() promise directly?** ODS discards the promise (fire-and-forget). The test doesn't have access to it. Polling sessionId is the simplest approach without adding execution tracking infrastructure.

**Alternative**: The test could capture the execute() promise by monkey-patching `podManager.createPod()` or by adding a test-only hook. But polling is simpler and adequate for `describe.skip` tests.

---

## Manual Node Completion for Session Inheritance Test

The session inheritance test has a subtlety: ODS fires node-a's pod, the real agent runs, but the agent gets a generic prompt and may NOT call `cg wf node accept` / `cg wf node end` (since there's no meaningful starter prompt yet — that's Spec B). So node-a stays in `starting` state in the graph, and ONBAS won't advance to node-b.

### Solution: Manually Complete Node-a in Graph State

```typescript
async function completeNodeManually(
  service: IPositionalGraphService,
  ctx: WorkspaceContext,
  graphSlug: string,
  nodeId: string,
): Promise<void> {
  // Load state, raise accept + complete events, persist
  const state = await service.loadGraphState(ctx, graphSlug);

  // Simulate the events the agent WOULD have raised
  raiseEvent(state, graphSlug, nodeId, 'node:accepted', { source: 'agent' });
  raiseEvent(state, graphSlug, nodeId, 'node:completed', {
    source: 'agent',
    message: 'Wiring test — manual completion',
  });

  await service.persistGraphState(ctx, graphSlug, state);
}
```

**Why manual?** The wiring test proves ODS→AgentManagerService→AgentPod→real adapter works. It does NOT prove the agent follows the WF protocol (that's Spec B's prompts + Spec C's E2E). Manually completing the node lets us test session inheritance without waiting for a real agent to figure out the protocol.

**This is a legitimate test design**: the Plan 030 fake E2E does exactly this — the test acts as the agent via CLI commands. We're doing the same thing, but the REAL agent also ran (proving the wiring), and we manually advance the graph state (since the agent didn't know the protocol yet).

---

## Skip Logic and Guards

### Pattern: `describe.skip` (Not `describe.skipIf`)

Per DYK-P4#2 and the project convention, real agent tests use hardcoded `describe.skip`:

```typescript
describe.skip('Orchestration Wiring: Claude Code', { timeout: 180_000 }, () => {
  // ...
});
```

**Why not `describe.skipIf(!hasClaudeCli())`?** These are documentation/validation tests. They're manually unskipped when you want to validate wiring changes. They cost money (LLM calls), take time (30-120s per test), and require auth. They should never auto-run.

### Copilot Additional Guard

Copilot SDK requires `@github/copilot-sdk` which is ESM-only and needs workspace-hoisted `node_modules`. An additional check in `beforeAll`:

```typescript
beforeAll(async () => {
  try {
    const { CopilotClient } = await import('@github/copilot-sdk');
    copilotClient = new CopilotClient();
  } catch (e) {
    console.warn('Copilot SDK not available — skipping Copilot wiring tests');
    // Can't dynamically skip from beforeAll, but the test will fail
    // with a clear message if CopilotClient can't be imported
  }
});

afterAll(async () => {
  if (copilotClient) await copilotClient.stop();
});
```

---

## Assertions: Structural Only

| What We Assert | Why Reliable |
|----------------|-------------|
| `pod.sessionId` is truthy after execution | Adapter always returns sessionId |
| `agentManager.getAgents().length > 0` | ODS called getNew/getWithSessionId |
| `result.actions[0].request.type === 'start-node'` | ONBAS decided correctly |
| `events.length > 0` (from handler) | Real adapters always emit events |
| `events.some(e => e.type === 'text_delta' \|\| e.type === 'message')` | Agent always produces text |
| `podB.sessionId !== podA.sessionId` | Fork creates new session |
| `instance.status === 'stopped'` after run | Adapter completed |

| What We Do NOT Assert |
|----------------------|
| Output text content |
| Specific event count |
| Whether agent followed WF protocol |
| Agent completion time |

---

## File Location

```
test/integration/
  orchestration-wiring-real.test.ts    # NEW — wiring tests with real agents
```

**Why `test/integration/` not `test/e2e/`?** This is an integration test — it tests component composition with real adapters, not the full CLI-driven pipeline. The E2E tests (Spec C) will go in `test/e2e/`.

**Relationship to existing tests**:

| File | Level | What It Tests |
|------|-------|---------------|
| `test/unit/.../ods.test.ts` | ODS + fakes | ODS calls getNew/getWithSessionId correctly |
| `test/unit/.../pod.test.ts` | Pod + fakes | Pod delegates to instance |
| `test/integration/agent-instance-real.test.ts` | Instance + real adapter | Instance lifecycle with real Claude/Copilot |
| **`test/integration/orchestration-wiring-real.test.ts`** | **ODS → Instance → real adapter** | **Full wiring chain** |
| `test/e2e/positional-graph-orchestration-e2e.ts` | Full pipeline + fakes | 58-step orchestration (fake agents) |

---

## Test Execution

```bash
# Unskip and run Claude Code wiring tests only
# (edit the file: change describe.skip to describe)
pnpm vitest run test/integration/orchestration-wiring-real.test.ts --timeout 300000

# Or via just (if we add a recipe)
just test-wiring-real
```

---

## Open Questions

### Q1: Should the wiring test actually create a graph with work units?

**OPEN**: The minimal test creates nodes without real work unit definitions. This means `node.unitSlug` is empty/fake and there's no `main-prompt` input. Options:
- A: No work units — wiring test only cares about the ODS→pod→adapter chain, not WF protocol
- B: Minimal work units — gives the agent something to read, more realistic

**Recommendation**: Option A — keep it minimal. The wiring test proves the chain works. Protocol compliance is Spec C's job.

### Q2: Should we add a `just test-wiring-real` recipe?

**OPEN**: Following the pattern from Plan 034 (`just test-e2e`), we could add a recipe.

**Recommendation**: Yes — add `test-wiring-real` to justfile. It communicates that these tests exist and how to run them.

### Q3: How do we handle the timing gap between fire-and-forget and completion?

**RESOLVED**: Poll `pod.sessionId` with a timeout (see "The Waiting Problem" section above). Simple, adequate for `describe.skip` tests. Spec B will add proper execution tracking.

---

## Quick Reference

```
WHAT WE'RE TESTING:
  ODS → agentManager.getNew() → instance → real adapter → process spawned
  ODS → agentManager.getWithSessionId() → instance → real adapter → session resumed
  Events flow: adapter → instance handlers → test collector

WHAT WE'RE NOT TESTING:
  Agent follows WF protocol (Spec B/C)
  cg wf run driver loop (Spec B)
  Prompts (Spec B)
  Full pipeline E2E (Spec C)

TEST STRUCTURE:
  3 suites: Claude Code, Copilot SDK, Cross-Adapter Parity
  3 tests each: single node, session inheritance, event pass-through
  All describe.skip — manual execution only

FILE: test/integration/orchestration-wiring-real.test.ts

CONSTRUCTION:
  Real AgentManagerService + real AdapterFactory
  Real ONBAS, ODS, PodManager, AgentContextService
  FakeScriptRunner (code pods not under test)
  FakeNodeEventRegistry + real EventHandlerService

WAITING STRATEGY:
  Poll pod.sessionId every 1s, timeout 120s
  (No execution tracking — that's Spec B)

MANUAL COMPLETION:
  For session inheritance test: manually raise accept/complete events
  (Agent doesn't know WF protocol yet — that's Spec B)
```
