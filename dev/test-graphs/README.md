# Test Graph Fixtures

Pre-made graph configurations for integration testing of the orchestration pipeline.

## Directory Convention

```
dev/test-graphs/
├── shared/                     # Reusable helpers
│   ├── graph-test-runner.ts    # withTestGraph() lifecycle helper
│   ├── helpers.ts              # completeUserInputNode(), makeScriptsExecutable()
│   └── assertions.ts           # assertGraphComplete(), assertNodeComplete(), etc.
├── smoke/                      # Minimal fixture for infrastructure smoke test
│   └── units/
│       └── ping/
│           ├── unit.yaml
│           └── scripts/ping.sh
├── simple-serial/              # (Phase 3) Serial: user-input → code worker
├── parallel-fan-out/           # (Phase 3) 3 parallel code nodes + combiner
├── error-recovery/             # (Phase 3) Node that fails
├── goat/                       # (Phase 4) All scenarios in one graph
├── real-agent-serial/          # (Plan 038) Agent: get-spec → spec-writer → reviewer
└── real-agent-parallel/        # (Plan 038) Agent: get-spec → worker-a + worker-b parallel
```

## Fixture Structure

Each fixture directory contains:
- `units/` — Work unit definitions (copied to `.chainglass/units/` in temp workspace)
  - `<slug>/unit.yaml` — Unit configuration (type, inputs, outputs, code.script)
  - `<slug>/scripts/*.sh` — Simulation scripts (made executable by helper)

## Usage

```typescript
import { withTestGraph } from '../../../dev/test-graphs/shared/graph-test-runner.js';

await withTestGraph('simple-serial', async (tgc) => {
  // tgc.ctx — WorkspaceContext
  // tgc.service — IPositionalGraphService
  // tgc.workspacePath — temp directory path

  // Create graph + add nodes using tgc.service
  const graph = await tgc.service.create(tgc.ctx, 'my-graph');
  // ... add nodes, drive, assert ...
});
// Workspace auto-cleaned up
```

## Simulation Scripts

Scripts receive environment variables from CodePod:
- `CG_GRAPH_SLUG` — Graph being driven
- `CG_NODE_ID` — Node being executed
- `CG_WORKSPACE_PATH` — Workspace root path
- `INPUT_*` — Node inputs as env vars

Scripts call CLI commands to progress the graph:
```bash
cg wf node accept "$CG_GRAPH_SLUG" "$CG_NODE_ID" --workspace-path "$CG_WORKSPACE_PATH"
cg wf node save-output-data "$CG_GRAPH_SLUG" "$CG_NODE_ID" result '{"done":true}' --workspace-path "$CG_WORKSPACE_PATH"
cg wf node end "$CG_GRAPH_SLUG" "$CG_NODE_ID" --workspace-path "$CG_WORKSPACE_PATH"
```

## Plans

- **Plan 037 Phase 2**: Infrastructure (this directory, helpers, assertions)
- **Plan 037 Phase 3**: Simple fixtures (simple-serial, parallel-fan-out, error-recovery)
- **Plan 037 Phase 4**: GOAT fixture (comprehensive integration test)
- **Plan 038**: Real agent fixtures (agent-type units with prompt templates, describe.skip tests)
