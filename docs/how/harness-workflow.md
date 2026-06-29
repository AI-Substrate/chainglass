# Running Workflows via the Harness

This guide covers how to execute, monitor, and debug workflow pipelines using the Chainglass **harness-tools** toolset — the Docker-containerized dev environment for agentic development.

> **Naming:** `harness-tools` is canonical for this OLD Docker toolset; `just harness <cmd>` still works as a back-compat alias. The bare `harness` command (no `just`) is the separate AI-Substrate proof-loop CLI — see `.harness/engineering-harness.md`.

> **Harness Docs**: [Agent Rules](../../AGENTS.md#the-harness-is-non-negotiable) |
> [Architecture](../../harness/README.md) |
> [Project Rules](../project-rules/harness.md) |
> **This file**

## Prerequisites

```bash
# 1. Install harness deps (first time only)
just harness-tools-install

# 2. Boot the container (~2 min cold boot)
just harness-tools dev

# 3. Verify healthy
just harness-tools doctor --wait

# 4. Seed test data (creates workspace + worktrees + test workflow)
just harness-tools seed
```

## Quick Start: Run a Workflow

```bash
# Start workflow (returns immediately)
just harness-tools-cg wf run test-workflow --server

# Poll status (repeat until completed/failed/stopped)
just harness-tools-cg wf show test-workflow --detailed --server

# Stop it
just harness-tools-cg wf stop test-workflow

# Restart (reset + start fresh)
just harness-tools-cg wf restart test-workflow
```

The `run --server` command is fire-and-forget: it POSTs to start the workflow, prints the result with actionable next steps, and exits immediately. The server owns the execution lifecycle.

## Two Paths: Ad-hoc vs Automated

| Path | Command | When to Use |
|------|---------|-------------|
| **Ad-hoc** | `just harness-tools-cg wf ...` | Exploration, debugging, manual testing. Raw JSON output. |
| **Automated** | `just harness-tools workflow ...` | CI, agent tests, assertions. HarnessEnvelope output with `exitReason`. |

### Ad-hoc: `harness-tools-cg`

Runs `cg` CLI commands inside the Docker container. Auto-adds `--json`, `--workspace-path`, and `--server-url`.

```bash
just harness-tools-cg wf create my-test                    # Create workflow
just harness-tools-cg wf show my-test --detailed --server  # Per-node diagnostics
just harness-tools-cg wf run my-test --server              # Start (fire-and-forget)
just harness-tools-cg wf stop my-test                      # Stop
just harness-tools-cg wf restart my-test                   # Reset + restart
just harness-tools-cg unit list                            # List work units
```

### Automated: `harness-tools workflow`

Structured testing with assertions and HarnessEnvelope output:

```bash
just harness-tools workflow run --server     # Run with structured output
just harness-tools workflow status --server  # Node-level status
just harness-tools workflow reset            # Clean + recreate test data
just harness-tools workflow logs --errors    # Show error events only
```

## Understanding Output

### `run --server` Response

```json
{
  "data": {
    "mode": "server",
    "started": true,
    "already": false,
    "key": "base64-encoded-key",
    "nextSteps": {
      "poll": "cg wf show test-workflow --detailed --server",
      "stop": "cg wf stop test-workflow",
      "restart": "cg wf restart test-workflow"
    }
  }
}
```

- `started: true` — new execution started
- `already: true` — workflow was already running (idempotent, not an error)
- `nextSteps` — actionable commands to run next

### `show --detailed --server` Response

```json
{
  "data": {
    "slug": "test-workflow",
    "execution": {
      "status": "pending",
      "totalNodes": 4,
      "completedNodes": 0,
      "progress": "0%"
    },
    "lines": [
      {
        "id": "line-xxx",
        "label": "Input",
        "nodes": [
          {
            "id": "test-user-input-xxx",
            "type": "user-input",
            "status": "ready",
            "blockedBy": []
          }
        ]
      }
    ]
  }
}
```

Node statuses: `ready` → `accepted` → `complete` (or `error`). Nodes blocked by `preceding-lines` or `inputs` are waiting for dependencies.

## Lifecycle

```
run --server    → POST /execution      → "started"  → exit 0
show --server   → GET  /detailed       → per-node status
stop            → DELETE /execution    → "stopped"  → exit 0
restart         → POST /execution/restart → "restarted" → exit 0
```

The server manages the execution. `stop` immediately kills the drive loop. `restart` clears all progress and starts fresh.

## Programmatic Access

For harness agents and test code:

```typescript
import { runCgInContainer } from '../test-data/cg-runner.js';
import { spawnCgInContainer } from '../test-data/cg-spawner.js';

// Buffered — wait for result
const result = await runCgInContainer(['wf', 'show', 'my-test', '--detailed', '--server']);

// Streaming — fire-and-forget
const handle = spawnCgInContainer(['wf', 'run', 'my-test', '--server']);
```

For SDK-level access (from any TypeScript code):

```typescript
import { WorkflowApiClient } from '@chainglass/shared/sdk/workflow';

const client = new WorkflowApiClient({
  baseUrl: 'http://localhost:3000',
  workspaceSlug: 'chainglass',
  worktreePath: '/path/to/worktree',
  localToken: 'token-from-server.json',
});

await client.run('test-workflow');
const status = await client.getStatus('test-workflow');
await client.stop('test-workflow');
```

## Troubleshooting

### "Container not running" error

```bash
just harness-tools dev          # Boot the container
just harness-tools doctor --wait  # Wait until healthy
```

### "Workspace not registered" error

The container needs seeded test data:
```bash
just harness-tools seed
```

### Workflow stuck in "pending"

If the first node is `user-input` type, the workflow is waiting for human input. This is expected behavior — the node needs external completion. Use auto-completion for testing:
```bash
just harness-tools workflow run --server  # Automated path handles auto-completion
```

### CLI build stale

If commands return unexpected errors after code changes:
```bash
pnpm --filter @chainglass/cli build  # Rebuild CLI (container uses bind-mounted dist/)
```

### Server not found (--server fails)

The `--server-url` is auto-injected by the justfile recipe. If running outside the recipe:
```bash
# Manually specify the server URL
just harness-tools-cg wf show my-test --detailed --server --server-url http://localhost:3101
```

## Related Documentation

- [Running Workflows from Web UI](./workflow-execution.md) — Browser-based execution
- [Harness README](../../harness/README.md) — Docker environment, agent definitions
- [Harness Project Rules](../project-rules/harness.md) — CLI table, error codes, conventions
- [SSE Integration Guide](./sse-integration.md) — Real-time event updates
