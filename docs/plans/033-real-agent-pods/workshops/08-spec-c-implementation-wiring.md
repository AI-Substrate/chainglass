# Workshop: Spec C Implementation — Real Agent Test Wiring

**Type**: Integration Pattern
**Plan**: 033-real-agent-pods
**Spec**: [spec-c-real-agent-e2e-tests.md](../spec-c-real-agent-e2e-tests.md)
**Created**: 2026-02-20
**Status**: Draft

**Related Documents**:
- [Workshop 07: Concept Drift Remediation](./07-spec-c-concept-drift-remediation.md) — what changed since Spec C
- [Plan 037 GOAT test](../../../../test/integration/orchestration-drive.test.ts) — proven patterns
- [Workshop 09: Disk Loader and Orchestration Wiring](../../037-codepod-and-goat-integration/workshops/09-disk-loader-and-orchestration-wiring.md) — stack wiring

---

## Purpose

Workshop 07 identified concept drift. This workshop resolves the two open questions and provides exact, copy-paste-ready implementation patterns for Spec C's real agent tests. After this workshop, the plan can be written in a single phase.

## Key Questions Addressed

- Q1: How to construct real AgentManagerService outside the DI container?
- Q2: Does the real agent need workspace context for test temp dirs?
- Q3: What's the exact wiring to combine `withTestGraph` + real agents?
- Q4: What should the agent fixture unit.yaml + prompts look like?
- Q5: How does session inheritance work across serial nodes in the test?

---

## Part 1: Real AgentManagerService Construction — RESOLVED

There are two AgentManagerService classes. **Plan 034's version** is current:

```typescript
// packages/shared/src/features/034-agentic-cli/agent-manager-service.ts
constructor(adapterFactory: AdapterFactory)
// where AdapterFactory = (type: AgentType) => IAgentAdapter
```

### Canonical Construction Pattern

From `test/integration/agent-instance-real.test.ts` (proven, existing):

```typescript
const { AgentManagerService } = await import(
  '@chainglass/shared/features/034-agentic-cli'
);
const { ClaudeCodeAdapter, UnixProcessManager, FakeLogger } = await import(
  '@chainglass/shared'
);

const logger = new FakeLogger();
const processManager = new UnixProcessManager(logger);
const realAgentManager = new AgentManagerService(
  () => new ClaudeCodeAdapter(processManager, { logger })
);
```

**Why dynamic imports?** Avoids loading real adapters (which check for CLI existence) during regular test collection. The `describe.skip` tests only import when manually unskipped.

**Why FakeLogger?** Real logger writes to pino. FakeLogger collects logs in memory — inspectable in test assertions.

### Environment Requirements

| Requirement | Check |
|------------|-------|
| `claude` CLI installed | `which claude` |
| `claude` authenticated | `claude --version` returns without auth error |
| Linux/macOS | `UnixProcessManager` (no Windows support) |

**Skip guard**:
```typescript
describe.skip('Real Agent E2E', { timeout: 180_000 }, () => {
  // Manual: remove .skip, ensure `claude --version` works
});
```

---

## Part 2: Workspace Context for Real Agents — RESOLVED

**Q2 Answer: Yes, the workspace path matters.** When ODS creates an `AgentPod`, it passes `ctx.worktreePath` as the agent's workspace:

```typescript
// ods.ts buildPodParams() for agent type:
agentInstance = this.deps.agentManager.getNew({
  name: node.unitSlug,
  type: agentType,
  workspace: ctx.worktreePath,  // ← this is the test's temp dir
});
```

The agent's `run()` gets `cwd: ctx.worktreePath`. For `withTestGraph`, this is the temp dir with `.chainglass/units/` and the graph data. The real Claude Code agent runs in that directory and can access the workspace.

**No extra work needed** — `withTestGraph` already sets `ctx.worktreePath = tmpDir`.

---

## Part 3: Combining withTestGraph + Real Agents

### The Problem

`createTestOrchestrationStack()` hardcodes `FakeAgentManagerService`. Real agent tests need a real one. Three options:

| Option | Approach | Verdict |
|--------|----------|---------|
| A | Add agentManager parameter to `createTestOrchestrationStack` | Over-engineers shared helper for a `describe.skip` use case |
| B | Create `createRealAgentOrchestrationStack` | Duplication with minor diff |
| **C** | Inline the stack wiring in the real agent test | Simple, explicit, `describe.skip` tests are documentation |

**Decision: Option C.** The real agent test inlines its orchestration stack (~25 lines) with the real `AgentManagerService` substituted. This is a `describe.skip` test — clarity matters more than DRY.

### Exact Wiring Pattern

```typescript
import { withTestGraph, buildDiskWorkUnitService, type TestGraphContext } from
  '../../dev/test-graphs/shared/graph-test-runner.js';
import { completeUserInputNode, ensureGraphsDir } from
  '../../dev/test-graphs/shared/helpers.js';
import { assertGraphComplete, assertNodeComplete, assertOutputExists } from
  '../../dev/test-graphs/shared/assertions.js';

// Orchestration imports
import {
  AgentContextService, ODS, ONBAS, OrchestrationService, PodManager, ScriptRunner,
} from '@chainglass/positional-graph/features/030-orchestration';
import {
  EventHandlerService, FakeNodeEventRegistry, NodeEventService,
  createEventHandlerRegistry, registerCoreEventTypes,
} from '@chainglass/positional-graph/features/032-node-event-system';
import { NodeFileSystemAdapter } from '@chainglass/shared';

describe.skip('Real Agent E2E', { timeout: 180_000 }, () => {
  it('drives a 2-node graph with real Claude Code agent', async () => {
    // Dynamic import — only loads when test is unskipped
    const { AgentManagerService } = await import(
      '@chainglass/shared/features/034-agentic-cli'
    );
    const { ClaudeCodeAdapter, UnixProcessManager, FakeLogger } = await import(
      '@chainglass/shared'
    );

    await withTestGraph('real-agent-serial', async (tgc) => {
      // Real agent manager
      const logger = new FakeLogger();
      const processManager = new UnixProcessManager(logger);
      const agentManager = new AgentManagerService(
        () => new ClaudeCodeAdapter(processManager, { logger })
      );

      // Orchestration stack with REAL agent manager
      const workUnitService = buildDiskWorkUnitService(tgc.workspacePath);
      const eventRegistry = new FakeNodeEventRegistry();
      registerCoreEventTypes(eventRegistry);
      const handlerRegistry = createEventHandlerRegistry();
      const nes = new NodeEventService(
        {
          registry: eventRegistry,
          loadState: async (slug: string) => tgc.service.loadGraphState(tgc.ctx, slug),
          persistState: async (slug: string, state: unknown) =>
            tgc.service.persistGraphState(tgc.ctx, slug, state),
        },
        handlerRegistry
      );
      const eventHandlerService = new EventHandlerService(nes);
      const nodeFs = new NodeFileSystemAdapter();
      const podManager = new PodManager(nodeFs);
      const contextService = new AgentContextService();
      const scriptRunner = new ScriptRunner();

      const ods = new ODS({
        graphService: tgc.service,
        podManager,
        contextService,
        agentManager,         // ← REAL, not fake
        scriptRunner,
        workUnitService,
      });

      const orchestrationService = new OrchestrationService({
        graphService: tgc.service,
        onbas: new ONBAS(),
        ods,
        eventHandlerService,
        podManager,
      });

      // Create graph, wire, drive...
      // (same pattern as GOAT test)
    });
  });
});
```

---

## Part 4: Agent Unit Fixtures

### Fixture: `dev/test-graphs/real-agent-serial/`

```
real-agent-serial/
  units/
    get-spec/
      unit.yaml              # type: user-input
    spec-writer/
      unit.yaml              # type: agent
      prompts/
        main.md              # Task: "Read spec, write summary"
    reviewer/
      unit.yaml              # type: agent
      prompts/
        main.md              # Task: "Review summary, output decision"
```

### get-spec/unit.yaml

```yaml
slug: get-spec
type: user-input
version: 1.0.0
description: User provides a spec for the agent pipeline
inputs: []
outputs:
  - name: spec
    type: data
    data_type: text
    required: true
user_input:
  question_type: text
  prompt: "Enter a spec for the agents to work on"
```

### spec-writer/unit.yaml

```yaml
slug: spec-writer
type: agent
version: 1.0.0
description: Agent reads spec and writes a summary
agent:
  prompt_template: prompts/main.md
inputs:
  - name: spec
    type: data
    data_type: text
    required: true
outputs:
  - name: summary
    type: data
    data_type: text
    required: true
```

### spec-writer/prompts/main.md

```markdown
You are a spec writer agent working in a Chainglass workflow.

## Your Task

Read the spec input and write a brief 2-3 sentence summary.

## Instructions

1. Run: `cg wf node accept {{graphSlug}} {{nodeId}} --workspace-path {{workspacePath}}`
2. Read the spec from your inputs (available as INPUT_SPEC environment variable)
3. Write a brief summary
4. Save your output: `cg wf node save-output-data {{graphSlug}} {{nodeId}} summary '"Your summary here"' --workspace-path {{workspacePath}}`
5. Complete: `cg wf node end {{graphSlug}} {{nodeId}} --workspace-path {{workspacePath}}`
```

### reviewer/unit.yaml

```yaml
slug: reviewer
type: agent
version: 1.0.0
description: Agent reviews summary and decides approved or needs-changes
agent:
  prompt_template: prompts/main.md
inputs:
  - name: summary
    type: data
    data_type: text
    required: true
outputs:
  - name: decision
    type: data
    data_type: text
    required: true
```

### reviewer/prompts/main.md

```markdown
You are a reviewer agent working in a Chainglass workflow.

## Your Task

Review the summary from the previous agent and output a decision.

## Instructions

1. Run: `cg wf node accept {{graphSlug}} {{nodeId}} --workspace-path {{workspacePath}}`
2. Read the summary from your inputs (INPUT_SUMMARY environment variable)
3. Decide: "approved" or "needs-changes"
4. Save: `cg wf node save-output-data {{graphSlug}} {{nodeId}} decision '"approved"' --workspace-path {{workspacePath}}`
5. Complete: `cg wf node end {{graphSlug}} {{nodeId}} --workspace-path {{workspacePath}}`
```

---

## Part 5: Session Inheritance in Tests

### How It Works

ODS's `buildPodParams()` checks `AgentContextService.getContextSource()`:

```typescript
if (contextResult.source === 'inherit') {
  const sessionId = this.deps.podManager.getSessionId(contextResult.fromNodeId);
  if (sessionId) {
    agentInstance = this.deps.agentManager.getWithSessionId(sessionId, { ... });
  }
}
```

For serial nodes on the same line, `getContextSource()` returns `{ source: 'inherit', fromNodeId: '<previous>' }`. The second agent gets the first's sessionId and resumes its conversation.

### What to Assert

```typescript
// After drive completes:
const writerSessionId = podManager.getSessionId(specWriterId);
const reviewerSessionId = podManager.getSessionId(reviewerId);

// Both should have session IDs
expect(writerSessionId).toBeTruthy();
expect(reviewerSessionId).toBeTruthy();

// Session IDs prove agent ran (structural assertion — not content)
// Note: sessionIds may or may not differ depending on fork behavior
```

### Graph Topology for Session Inheritance

```
Line 0: [get-spec] (user-input, pre-completed)
Line 1: [spec-writer] → [reviewer] (both agent, serial — reviewer inherits)
```

Both on Line 1 as serial nodes ensures `getContextSource` returns `inherit`.

---

## Part 6: Parallel Execution Fixture

### Fixture: `dev/test-graphs/real-agent-parallel/`

```
real-agent-parallel/
  units/
    get-spec/
      unit.yaml              # type: user-input
    worker-a/
      unit.yaml              # type: agent (parallel)
      prompts/main.md
    worker-b/
      unit.yaml              # type: agent (parallel)
      prompts/main.md
```

### Graph Topology

```
Line 0: [get-spec] (user-input)
Line 1: [worker-a] | [worker-b] (both agent, parallel — independent sessions)
```

### What to Assert

```typescript
const sessionA = podManager.getSessionId(workerAId);
const sessionB = podManager.getSessionId(workerBId);

// Both complete
await assertNodeComplete(tgc.service, tgc.ctx, SLUG, workerAId);
await assertNodeComplete(tgc.service, tgc.ctx, SLUG, workerBId);

// Different sessions (parallel = independent, not inherited)
expect(sessionA).not.toBe(sessionB);
```

---

## Part 7: Test File Structure

### Single test file: `test/integration/real-agent-e2e.test.ts`

```typescript
describe.skip('Real Agent E2E', { timeout: 180_000 }, () => {

  describe('serial pipeline with session inheritance (AC-34, AC-35, AC-36)', () => {
    it('drives get-spec → spec-writer → reviewer to completion', async () => {
      // withTestGraph('real-agent-serial', ...) + real agent manager
      // Assert: all nodes complete, outputs exist, session inheritance
    }, 120_000);
  });

  describe('parallel execution with independent sessions (AC-37)', () => {
    it('drives get-spec → worker-a + worker-b in parallel', async () => {
      // withTestGraph('real-agent-parallel', ...) + real agent manager
      // Assert: both complete, different sessions
    }, 120_000);
  });
});
```

**AC-38**: `describe.skip` ✓
**AC-39**: Structural assertions only (status, sessionId, output existence) ✓
**AC-40**: Existing tests unchanged ✓

---

## Part 8: Implementation Checklist

| # | Task | Complexity | Notes |
|---|------|------------|-------|
| 1 | Create `dev/test-graphs/real-agent-serial/` fixture | Small | 3 unit.yaml + 2 prompt files |
| 2 | Create `dev/test-graphs/real-agent-parallel/` fixture | Small | 3 unit.yaml + 2 prompt files |
| 3 | Write `test/integration/real-agent-e2e.test.ts` | Medium | 2 describe.skip tests, inline orchestration wiring |
| 4 | Update `dev/test-graphs/README.md` | Trivial | Add real-agent entries |
| 5 | `just fft` clean | Trivial | Existing tests unaffected (describe.skip) |

**Total estimated complexity: CS-2 (small)**. Single phase, ~5 tasks.

---

## Open Questions

### Q1: Do prompt templates support {{variable}} substitution?

**RESOLVED**: Yes — AgentPod resolves template variables (`{{graphSlug}}`, `{{nodeId}}`, `{{workspacePath}}`) from the pod execution context before passing to the agent. This is Plan 036 Phase 2 work (prompt templates).

### Q2: Does `withTestGraph` work for agent-type units?

**RESOLVED**: Yes — `withTestGraph` copies ALL files from `units/` including `prompts/` subdirectories. `makeScriptsExecutable` only touches `.sh` files. The `buildDiskWorkUnitService` reads `unit.yaml` regardless of type. `addNode()` validates the unit exists on disk via the loader.

### Q3: Will drive() work with real agents?

**RESOLVED**: Yes — drive() is agent-agnostic. It calls `run()` which calls ODS, which creates AgentPod or CodePod depending on `unit.type`. The drive loop polls the same way. The only difference is execution time (30-120s per agent node vs <1s for script nodes). Use higher `maxIterations` and `idleDelayMs` for real agent drives.

### Q4: What drive parameters for real agents?

**RESOLVED**: Real agents take 30-120s per node:
```typescript
const REAL_AGENT_DRIVE_OPTIONS = {
  maxIterations: 50,
  actionDelayMs: 1000,     // 1s between action iterations
  idleDelayMs: 5000,       // 5s idle polls (agent needs time)
  onEvent: (event) => console.log(`  [drive] ${event.type}: ${event.message}`),
};
```

---

## Decision Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| AgentManager construction | Manual (dynamic import) | Proven pattern from existing real agent tests |
| Orchestration stack wiring | Inline in test (Option C) | describe.skip = documentation, clarity > DRY |
| Fixture location | `dev/test-graphs/real-agent-serial/` + `real-agent-parallel/` | Separate from code-unit fixtures |
| GOAT agent variant | Defer | Too expensive; simple graphs prove the integration |
| Prompt template format | Use {{variable}} substitution | Plan 036 Phase 2 built this |
| Drive parameters | High delays (1s action, 5s idle) | Real agents need time |
| Test file | Single `real-agent-e2e.test.ts` | All real agent tests in one describe.skip block |
| Plan complexity | CS-2, single phase | All infrastructure exists |
