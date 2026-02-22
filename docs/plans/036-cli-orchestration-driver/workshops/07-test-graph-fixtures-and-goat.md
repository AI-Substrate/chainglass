# Workshop: Test Graph Fixtures and the GOAT Graph

**Type**: Storage Design / Test Infrastructure
**Plan**: 036-cli-orchestration-driver
**Created**: 2026-02-18
**Status**: Draft

**Related Documents**:
- [05-real-integration-testing.md](./05-real-integration-testing.md) — integration test design
- [06-finishing-codepod.md](./06-finishing-codepod.md) — CodePod completion
- [03-graph-status-visual-gallery.md](./03-graph-status-visual-gallery.md) — visual scenarios
- `test/e2e/positional-graph-orchestration-e2e.ts` — existing dynamic fixture pattern

---

## Purpose

Define a library of pre-made test graphs that live in the repository, can be deployed to a real temporary workspace, driven to completion via the real CLI, and validated. These same graphs will later be used with real agents — the only thing that changes is the work unit type (code → agent). The centrepiece is the GOAT graph — a comprehensive fixture that exercises every orchestration scenario in one graph.

## Key Questions Addressed

- How do we store pre-made graphs and work units in the repo?
- How do we deploy them to a real workspace that the CLI can resolve?
- How do we handle workspace registration and cleanup?
- What graph configurations cover all the scenarios we need?
- What is the GOAT graph and what does it test?
- How do we reuse the same graphs for code-unit testing AND real agent testing?

---

## Part 1: The Full Test Lifecycle

Every integration test and demo follows this lifecycle:

```
┌─────────────────────────────────────────────────────────────┐
│  1. CREATE temp workspace                                    │
│     mkdtemp('/tmp/goat-test-...')                            │
│     mkdir -p .chainglass/data/workflows/                     │
│     mkdir -p .chainglass/units/                              │
│                                                              │
│  2. REGISTER workspace                                       │
│     cg workspace add goat-test /tmp/goat-test-.../           │
│     This enters the workspace into the registry so the CLI   │
│     can resolve it when scripts call cg wf node ... from     │
│     that cwd.                                                │
│                                                              │
│  3. COPY work units from dev/test-graphs/<name>/units/       │
│     → /tmp/goat-test-.../.chainglass/units/                  │
│     Including: unit.yaml, scripts/, prompts/                 │
│     chmod +x on all .sh files                                │
│                                                              │
│  4. CREATE graph via service API                             │
│     graph.setup.ts: create → addLine → addNode → setInput   │
│     addNode() validates unit exists on disk (loads + parses  │
│     unit.yaml via WorkUnitLoader — E177/E178 if missing)     │
│                                                              │
│  5. PRE-COMPLETE user-input nodes                            │
│     cg wf node accept → save-output-data → end              │
│     (or via graphService.raiseNodeEvent in-process)          │
│                                                              │
│  6. DRIVE the graph                                          │
│     cg wf run <slug> --workspace-path /tmp/goat-test-.../    │
│     OR: handle.drive() in-process for faster tests           │
│     Scripts run via CodePod → ScriptRunner → subprocess      │
│     Scripts call cg wf node accept/save/end from cwd         │
│                                                              │
│  7. VALIDATE                                                 │
│     Assert graph complete, node statuses, outputs saved      │
│                                                              │
│  8. CLEANUP                                                  │
│     cg workspace remove goat-test                            │
│     rm -rf /tmp/goat-test-.../                               │
└─────────────────────────────────────────────────────────────┘
```

### Why Real Workspace Registration Matters

The CLI resolves workspace by querying a **registered workspace registry** (`~/.chainglass/config/workspaces.json`). It does NOT walk up the filesystem looking for `.chainglass/`. If a script inside a CodePod calls `cg wf node accept` from `/tmp/goat-test-xyz/`, the CLI must find that path in the registry.

By registering the temp workspace, we test the full vertical:
- Workspace registration and resolution
- Work unit loading and validation
- Graph creation with unit validation
- Orchestration with real event processing
- CLI command execution from subprocess scripts
- Graph completion and state persistence

If any of these layers break, the test catches it.

---

## Part 2: On-Disk Structure

### Repository Layout

```
dev/test-graphs/
├── README.md                        # Catalogue of all test graphs
├── shared/
│   ├── assertions.ts                # Shared validation assertions
│   ├── graph-test-runner.ts         # withTestGraph() helper
│   └── helpers.ts                   # completeUserInputNode(), etc.
│
├── simple-serial/
│   ├── graph.setup.ts               # Graph creation script
│   └── units/
│       ├── setup/
│       │   └── unit.yaml            # type: user-input
│       └── worker/
│           ├── unit.yaml            # type: code
│           └── scripts/
│               └── simulate.sh      # accept → save → end
│
├── two-serial-chain/
│   ├── graph.setup.ts
│   └── units/
│       ├── setup/...
│       ├── worker-a/
│       │   ├── unit.yaml
│       │   └── scripts/simulate.sh
│       └── worker-b/
│           ├── unit.yaml
│           └── scripts/simulate.sh
│
├── parallel-fan-out/
│   ├── graph.setup.ts
│   └── units/
│       ├── setup/...
│       ├── parallel-1/...
│       ├── parallel-2/...
│       ├── parallel-3/...
│       └── combiner/...
│
├── error-recovery/...
├── manual-transition/...
├── question-answer/...
├── input-not-ready/...
│
└── goat/
    ├── graph.setup.ts
    ├── units-code/                  # Code units — for CI/fast testing
    │   ├── user-setup/...
    │   ├── serial-a/...
    │   ├── serial-b/...
    │   ├── parallel-1/...
    │   ├── parallel-2/...
    │   ├── parallel-3/...
    │   ├── error-node/...
    │   ├── questioner/...
    │   └── final-combiner/...
    └── units-agent/                 # Agent units — for real agent testing
        ├── user-setup/...           # Same slugs, type: agent + prompts
        ├── serial-a/...
        └── ...
```

### Work Unit Requirements

Every work unit on disk must have:

```
.chainglass/units/<slug>/
├── unit.yaml                    # REQUIRED — validated by Zod schema on addNode()
├── prompts/                     # REQUIRED for type: agent
│   └── main.md                  # Referenced by agent.prompt_template
└── scripts/                     # REQUIRED for type: code
    └── simulate.sh              # Referenced by code.script, must be chmod +x
```

**`addNode()` validates the unit exists**: It calls `workUnitLoader.load(ctx, unitSlug)` which reads and parses `unit.yaml` against the full Zod schema. If the unit is missing or invalid → E177/E178/E179 errors → `addNode()` fails.

### unit.yaml Reference (All Types)

**Shared required fields**: `slug`, `type`, `version`, `outputs` (min 1)
**Shared optional**: `description`, `inputs`

**Agent units**:
```yaml
slug: serial-a
type: agent
version: 1.0.0
description: First serial worker
agent:
  prompt_template: prompts/main.md    # REQUIRED, relative path
  supported_agents: [claude-code]     # Optional
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
```

**Code units**:
```yaml
slug: serial-a
type: code
version: 1.0.0
description: First serial worker (simulated)
code:
  script: scripts/simulate.sh        # REQUIRED, relative path
  timeout: 60                         # Optional, 1-3600 seconds
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
```

**User-input units**:
```yaml
slug: user-setup
type: user-input
version: 1.0.0
description: User provides task instructions
user_input:
  question_type: text
  prompt: "Enter task instructions"
outputs:
  - name: instructions
    type: data
    data_type: text
    required: true
```

**Input/output name format**: lowercase alphanumeric + underscores (`/^[a-z][a-z0-9_]*$/`)
**Slug format**: lowercase alphanumeric + hyphens (`/^[a-z][a-z0-9-]*$/`)
**Template security**: Path containment validated — no absolute paths, no `../`

---

## Part 3: graph.setup.ts Pattern

Each graph has a TypeScript setup script that creates the graph via the service API:

```typescript
// dev/test-graphs/simple-serial/graph.setup.ts

import type { IPositionalGraphService } from '@chainglass/positional-graph';
import type { WorkspaceContext } from '@chainglass/workflow';

export const GRAPH_SLUG = 'simple-serial';

export interface GraphSetupResult {
  graphSlug: string;
  nodeIds: Record<string, string>;
  lineIds: Record<string, string>;
}

export async function setupGraph(
  service: IPositionalGraphService,
  ctx: WorkspaceContext
): Promise<GraphSetupResult> {
  // Create graph (returns default line-000)
  const create = await service.create(ctx, GRAPH_SLUG);

  // Add second line
  const line1 = await service.addLine(ctx, GRAPH_SLUG);

  // Add nodes — addNode validates unit.yaml exists on disk
  const setup = await service.addNode(ctx, GRAPH_SLUG, create.lineId, 'setup');
  const worker = await service.addNode(ctx, GRAPH_SLUG, line1.lineId!, 'worker');

  // Wire inputs — worker reads from setup
  await service.setInput(ctx, GRAPH_SLUG, worker.nodeId!, 'task', {
    from_node: setup.nodeId!,
    from_output: 'instructions',
  });

  return {
    graphSlug: GRAPH_SLUG,
    nodeIds: { setup: setup.nodeId!, worker: worker.nodeId! },
    lineIds: { line0: create.lineId, line1: line1.lineId! },
  };
}
```

---

## Part 4: The Test Runner

```typescript
// dev/test-graphs/shared/graph-test-runner.ts

import { cp, mkdtemp, rm, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createTestServiceStack } from '../../test/helpers/positional-graph-e2e-helpers.js';

export interface TestGraphOptions {
  graphName: string;
  unitVariant?: 'code' | 'agent';  // Default: 'code'
  keepWorkspace?: boolean;          // Default: false — keep for debugging
}

export interface TestGraphContext {
  ctx: WorkspaceContext;
  service: IPositionalGraphService;
  graph: GraphSetupResult;
  workspacePath: string;
  workspaceSlug: string;
}

export async function withTestGraph(
  options: TestGraphOptions,
  testFn: (tgc: TestGraphContext) => Promise<void>
): Promise<void> {
  const { graphName, unitVariant = 'code', keepWorkspace = false } = options;
  const workspaceSlug = `test-${graphName}-${Date.now()}`;

  // 1. Create temp workspace
  const { service, ctx, workspacePath } = await createTestServiceStack(workspaceSlug);

  // 2. Register workspace in CLI registry
  //    This makes the CLI resolve correctly when scripts call cg wf node ...
  await registerWorkspace(workspaceSlug, workspacePath);

  // 3. Copy work units to workspace
  const unitsSource = resolve(__dirname, '..', graphName,
    graphName === 'goat' ? `units-${unitVariant}` : 'units');
  const unitsTarget = join(workspacePath, '.chainglass', 'units');
  await cp(unitsSource, unitsTarget, { recursive: true });
  // Make all .sh files executable
  await makeScriptsExecutable(unitsTarget);

  // 4. Create graph via setup script
  const { setupGraph } = await import(`../${graphName}/graph.setup.ts`);
  const graph = await setupGraph(service, ctx);

  try {
    // 5. Run the test
    await testFn({ ctx, service, graph, workspacePath, workspaceSlug });
  } finally {
    // 6. Cleanup
    await unregisterWorkspace(workspaceSlug);
    if (!keepWorkspace) {
      await rm(workspacePath, { recursive: true, force: true });
    } else {
      console.log(`  Workspace kept at: ${workspacePath}`);
    }
  }
}

async function registerWorkspace(slug: string, path: string): Promise<void> {
  // Call cg workspace add OR use WorkspaceService directly
  // Using service directly avoids subprocess overhead
  const container = createCliProductionContainer();
  const workspaceService = container.resolve(WORKSPACE_DI_TOKENS.WORKSPACE_SERVICE);
  await workspaceService.register({ slug, name: slug, path });
}

async function unregisterWorkspace(slug: string): Promise<void> {
  const container = createCliProductionContainer();
  const workspaceService = container.resolve(WORKSPACE_DI_TOKENS.WORKSPACE_SERVICE);
  await workspaceService.unregister(slug);
}
```

---

## Part 5: Simulation Scripts

### Standard Agent Simulation Script

The most common script — accepts the node, saves outputs, completes:

```bash
#!/bin/bash
# simulate.sh — Standard code unit that behaves like an agent
# Receives: CG_GRAPH_SLUG, CG_NODE_ID, CG_WORKSPACE_PATH via env
# Receives: INPUT_* env vars for each input
set -e

# Accept assignment
cg wf node accept "$CG_GRAPH_SLUG" "$CG_NODE_ID" --workspace-path "$CG_WORKSPACE_PATH"

# Read inputs (optional — scripts get inputs as INPUT_* env vars too)
# TASK=$INPUT_TASK

# Save outputs
cg wf node save-output-data "$CG_GRAPH_SLUG" "$CG_NODE_ID" result \
  '{"status":"done","by":"'"$CG_NODE_ID"'"}' \
  --workspace-path "$CG_WORKSPACE_PATH"

# Complete
cg wf node end "$CG_GRAPH_SLUG" "$CG_NODE_ID" \
  --message "Simulated agent $CG_NODE_ID complete" \
  --workspace-path "$CG_WORKSPACE_PATH"
```

### Error Script (Fails Deliberately)

```bash
#!/bin/bash
set -e
cg wf node accept "$CG_GRAPH_SLUG" "$CG_NODE_ID" --workspace-path "$CG_WORKSPACE_PATH"
cg wf node error "$CG_GRAPH_SLUG" "$CG_NODE_ID" \
  --code DELIBERATE_FAIL --message "Testing error recovery" \
  --workspace-path "$CG_WORKSPACE_PATH"
exit 1
```

### Question Script (Asks Then Stops)

```bash
#!/bin/bash
set -e
cg wf node accept "$CG_GRAPH_SLUG" "$CG_NODE_ID" --workspace-path "$CG_WORKSPACE_PATH"

# Check if we have an answer (resuming after question was answered)
ANSWER=$(cg wf node get-answer "$CG_GRAPH_SLUG" "$CG_NODE_ID" latest \
  --workspace-path "$CG_WORKSPACE_PATH" --json 2>/dev/null || echo "")

if [ -z "$ANSWER" ] || [ "$ANSWER" = "" ]; then
  # No answer — ask the question and stop
  cg wf node ask "$CG_GRAPH_SLUG" "$CG_NODE_ID" \
    --type text --text "What colour should the widget be?" \
    --workspace-path "$CG_WORKSPACE_PATH"
  exit 0  # Exit cleanly — node paused at waiting-question
else
  # Answer received — complete the work
  cg wf node save-output-data "$CG_GRAPH_SLUG" "$CG_NODE_ID" result \
    '{"colour":"'"$ANSWER"'"}' \
    --workspace-path "$CG_WORKSPACE_PATH"
  cg wf node end "$CG_GRAPH_SLUG" "$CG_NODE_ID" \
    --message "Question answered, work complete" \
    --workspace-path "$CG_WORKSPACE_PATH"
fi
```

### Recovery Script (Fails First Time, Succeeds Second)

```bash
#!/bin/bash
set -e
MARKER="/tmp/goat-$CG_NODE_ID-ran"

cg wf node accept "$CG_GRAPH_SLUG" "$CG_NODE_ID" --workspace-path "$CG_WORKSPACE_PATH"

if [ ! -f "$MARKER" ]; then
  # First run — fail
  touch "$MARKER"
  cg wf node error "$CG_GRAPH_SLUG" "$CG_NODE_ID" \
    --code TEST_FAIL --message "First run fails deliberately" \
    --workspace-path "$CG_WORKSPACE_PATH"
  exit 1
else
  # Retry — succeed
  rm -f "$MARKER"
  cg wf node save-output-data "$CG_GRAPH_SLUG" "$CG_NODE_ID" result \
    '{"recovered":true}' \
    --workspace-path "$CG_WORKSPACE_PATH"
  cg wf node end "$CG_GRAPH_SLUG" "$CG_NODE_ID" \
    --message "Recovered on retry" \
    --workspace-path "$CG_WORKSPACE_PATH"
fi
```

**Note**: All scripts pass `--workspace-path "$CG_WORKSPACE_PATH"` explicitly. This is needed because the CodePod's ScriptRunner sets `cwd` to `ctx.worktreePath`, but the CLI resolves workspace from the registry. The `--workspace-path` flag tells `resolveOrOverrideContext()` to use that path directly for resolution.

---

## Part 6: The GOAT Graph

### Structure

```
Line 0: [user-setup]                                    (user-input)
         ↓
Line 1: [serial-a] → [serial-b]                         (code, serial)
         ↓
Line 2: [parallel-1] │ [parallel-2] │ [parallel-3]      (code, parallel)
         ↓ (manual transition)
Line 3: [error-node]                                     (code — fails first, succeeds on retry)
         ↓
Line 4: [questioner]                                     (code — asks question, completes after answer)
         ↓
Line 5: [final-combiner]                                 (code — reads from multiple upstream outputs)
```

### Scenarios Exercised

| # | Scenario | Node(s) | What's Tested |
|---|----------|---------|---------------|
| 1 | User-input completion | `user-setup` | User provides data, Line 0 completes |
| 2 | Serial progression | `serial-a` → `serial-b` | Output wiring, sequential execution, input resolution |
| 3 | Parallel fan-out | `parallel-1/2/3` | All 3 run concurrently, all must complete before Line 3 |
| 4 | Manual transition | Line 2→3 boundary | drive() idles at `transition-blocked`, external trigger opens gate |
| 5 | Error + recovery | `error-node` | Node fails, `blocked-error` status, error cleared, `node:restart`, succeeds on retry |
| 6 | Question/Answer | `questioner` | Agent asks question, `waiting-question` status, answer provided, `node:restart`, completes |
| 7 | Multi-input aggregation | `final-combiner` | Reads outputs from multiple upstream nodes (serial-b, parallel-*, error-node, questioner) |
| 8 | Full graph completion | All | `isComplete: true`, all nodes ✅, all outputs saved |

### GOAT Test Sequence (Automated)

```
 Step 1: Setup
   └── Pre-complete user-setup node (accept → save-output → end)

 Step 2: drive() run 1
   └── maxIterations: 50
   └── Expected: serial-a, serial-b execute. parallel-1/2/3 execute.
       Idles at manual transition (transition-blocked).
       Exits via max-iterations.

 Step 3: Intervention — trigger manual transition
   └── cg wf trigger goat-test <line2-id>

 Step 4: drive() run 2
   └── Expected: error-node runs, fails (blocked-error).
       Exits via max-iterations (or no-action with graph stuck).

 Step 5: Intervention — clear error + restart node
   └── cg wf node raise-event goat-test error-node node:restart

 Step 6: drive() run 3
   └── Expected: error-node retries, succeeds.
       questioner runs, asks question (waiting-question).
       Exits via max-iterations.

 Step 7: Intervention — answer question + restart
   └── cg wf node raise-event goat-test questioner question:answer --payload '{"answer":"blue"}'
   └── cg wf node raise-event goat-test questioner node:restart

 Step 8: drive() run 4
   └── Expected: questioner resumes, completes.
       final-combiner runs, completes.
       Graph complete! exitReason: 'complete'.

 Step 9: Validate
   └── Assert all nodes complete, all outputs saved, graph isComplete
```

---

## Part 7: Reuse Strategy — Code Units → Agent Units

The critical design: **same graph structure, same assertions, different executors**.

```
dev/test-graphs/goat/
├── graph.setup.ts              # SHARED — identical graph structure
├── assertions.ts               # SHARED — identical validation
├── units-code/                 # Code units (CI — fast, deterministic)
│   ├── serial-a/
│   │   ├── unit.yaml           # type: code, script: scripts/simulate.sh
│   │   └── scripts/simulate.sh
│   └── ...
└── units-agent/                # Agent units (real LLMs — slow, real)
    ├── serial-a/
    │   ├── unit.yaml           # type: agent, prompt_template: prompts/main.md
    │   └── prompts/main.md     # Real task prompt
    └── ...
```

**Why this works**: The graph doesn't care who does the work. It only cares that:
- `node:accepted` event is raised (agent does it, script does it — same event)
- Outputs are saved via `cg wf node save-output-data` (same CLI command)
- `node:completed` event is raised via `cg wf node end` (same CLI command)

**The test runner selects the variant**:
```typescript
await withTestGraph({ graphName: 'goat', unitVariant: 'code' }, async (tgc) => {
  // Fast CI test — code units with simulation scripts
});

await withTestGraph({ graphName: 'goat', unitVariant: 'agent' }, async (tgc) => {
  // Real agent test — same graph, same assertions, real LLMs
});
```

---

## Part 8: Shared Assertion Library

```typescript
// dev/test-graphs/shared/assertions.ts

export async function assertGraphComplete(tgc: TestGraphContext): Promise<void> {
  const stack = createOrchestrationStack(tgc.service, tgc.ctx);
  const handle = await stack.orchestrationService.get(tgc.ctx, tgc.graph.graphSlug);
  const reality = await handle.getReality();

  expect(reality.isComplete).toBe(true);
  expect(reality.isFailed).toBe(false);
  expect(reality.completedCount).toBe(reality.totalNodes);
}

export async function assertNodeComplete(
  tgc: TestGraphContext,
  nodeName: string
): Promise<void> {
  const nodeId = tgc.graph.nodeIds[nodeName];
  const state = await tgc.service.loadGraphState(tgc.ctx, tgc.graph.graphSlug);
  expect(state.nodes[nodeId]?.status).toBe('complete');
}

export async function assertNodeFailed(
  tgc: TestGraphContext,
  nodeName: string
): Promise<void> {
  const nodeId = tgc.graph.nodeIds[nodeName];
  const state = await tgc.service.loadGraphState(tgc.ctx, tgc.graph.graphSlug);
  expect(state.nodes[nodeId]?.status).toBe('blocked-error');
}

export async function assertOutputExists(
  tgc: TestGraphContext,
  nodeName: string,
  outputName: string
): Promise<unknown> {
  const nodeId = tgc.graph.nodeIds[nodeName];
  const result = await tgc.service.getOutputData(tgc.ctx, tgc.graph.graphSlug, nodeId, outputName);
  expect(result.errors).toHaveLength(0);
  return result.value;
}
```

---

## Open Questions

### Q1: Should we register temp workspace via service directly or CLI subprocess?

**RESOLVED**: Use the service directly (in-process). Avoids subprocess overhead. Still tests the registration code path — just not the CLI parsing layer.

### Q2: How do we handle the GOAT's external interventions in automated tests?

**RESOLVED**: Multiple `drive()` calls with max-iterations exit. Intervene between calls (trigger transitions, answer questions, clear errors), then re-drive. Matches real-world usage.

### Q3: Where do test graphs live?

**RESOLVED**: `dev/test-graphs/`. Not in `test/fixtures/` because they're also used by standalone demo scripts and eventually real agent runs. `dev/` is the right home for development and validation tools.

### Q4: Should each `--workspace-path` be passed to every CLI call in scripts?

**RESOLVED**: Yes — scripts pass `--workspace-path "$CG_WORKSPACE_PATH"` explicitly. This is the safest approach since the script's cwd may not be sufficient for registry resolution in all cases. CodePod passes `CG_WORKSPACE_PATH` as an env var (see Workshop 06, Change 2).

