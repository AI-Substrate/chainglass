# Running Workflows from the Web UI

This guide covers how to execute workflow pipelines from the Chainglass web interface, set up test environments, and troubleshoot common issues.

## Architecture Overview

The workflow execution system has three layers:

```
Browser (UI)              Server (Next.js)           Engine
┌────────────────┐       ┌───────────────────┐      ┌──────────────────┐
│ Run/Stop/Restart│──────▸│ Server Actions     │─────▸│ drive() loop     │
│ Buttons         │       │ (workflow-execution│      │ ONBAS → ODS → Pod│
│                 │◂──────│  -actions.ts)      │      │                  │
│ Status display  │  SSE  │                    │      │ Graph state on   │
│ Node locking    │       │ ExecutionManager   │      │ disk (node.yaml, │
│ Undo/redo gate  │       │ (singleton)        │      │ state.json)      │
└────────────────┘       └───────────────────┘      └──────────────────┘
```

### Key Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `WorkflowExecutionManager` | `apps/web/src/features/074-workflow-execution/` | Central singleton managing all active executions |
| `useWorkflowExecution` hook | Same feature folder | Client-side React hook for UI state |
| `deriveButtonState()` | Same feature folder | Maps execution status → button visibility |
| Server Actions | `apps/web/app/actions/workflow-execution-actions.ts` | 4 actions: run, stop, restart, getStatus |
| SSE Route | `apps/web/src/lib/state/workflow-execution-route.ts` | Maps SSE events → GlobalState properties |
| Execution Registry | `~/.config/chainglass/execution-registry.json` | Persists state for server restart recovery |

## Running a Workflow

1. Navigate to a workflow in the web UI
2. Click the green **Run** button in the toolbar
3. The workflow begins executing — you'll see:
   - Status badge updates (starting → running → completed)
   - Iteration counter incrementing
   - Nodes locking as they execute (completed/running nodes are locked)
   - Last event message updates
4. Click **Stop** (red) to interrupt execution — active nodes become "interrupted"
5. Click **Restart** to reset all state and start fresh

### During Execution

- **Locked nodes**: Completed and running nodes cannot be edited
- **Future nodes**: Nodes not yet reached CAN still be edited while the workflow runs
- **Undo/redo**: Blocked during active execution (starting/running/stopping)
- **Stopping**: Sets all nodes to locked while the engine winds down

## Setting Up Test Data

Use the harness test-data commands to create a deterministic test workflow:

```bash
# Create complete test environment (3 units + template + workflow)
just test-data create env

# Or step by step:
just test-data create units      # Create test-agent, test-code, test-user-input
just test-data create template   # Build template from units
just test-data create workflow   # Instantiate from template

# Check what exists
just test-data status

# Run the test workflow (CLI path — visible in web UI via file watchers)
just test-data run

# Clean up
just test-data clean
```

### Test Data Structure

| Component | Slug | Type |
|-----------|------|------|
| Agent unit | `test-agent` | Processes a spec, returns result + summary |
| Code unit | `test-code` | Transforms input data to output |
| User-input unit | `test-user-input` | Collects user specification text |
| Template | `test-workflow-tpl` | 3-line workflow: input → processing → output |
| Workflow | `test-workflow` | Instance ready for execution |

### CLI vs Web Execution

Both paths share the same underlying engine (`ONBAS/ODS/drive()`) and write to the same files on disk. When `cg wf run` (CLI) or the web UI executes a workflow:

- The same node events are processed
- The same graph state files are written
- The web UI updates via filesystem watchers regardless of who started the execution

The difference is lifecycle management:
- **Web path**: Uses `WorkflowExecutionManager` with AbortController, SSE broadcasting, execution registry, and UI controls
- **CLI path**: Direct `drive()` call with simpler lifecycle

## Server Restart Recovery

If the dev server restarts while a workflow is running:

1. The execution registry (`~/.config/chainglass/execution-registry.json`) tracks all active executions
2. On restart, `resumeAll()` reads the registry and re-starts any workflows that were running
3. Completed nodes are NOT re-executed (ONBAS skips them — the engine is idempotent)
4. Stale entries (deleted worktrees) are automatically cleaned up
5. Corrupt registry files self-heal (deleted, next restart is clean)

## Troubleshooting

### Workflow stuck in "starting"

The workspace context couldn't be resolved. Check that:
- The worktree path exists on disk
- The workspace is registered (`cg workspace list`)

### Nodes not updating in real-time

Check the SSE connection:
- Browser devtools → Network → EventSource connections
- Look for `/api/events/mux` connection
- The `workflow-execution` channel should be in the connection

### Registry file issues

If the execution registry gets corrupted:
```bash
# The file self-heals on next restart, but you can manually clear it:
rm ~/.config/chainglass/execution-registry.json
```

### CLI build stale

If `just test-data create env` fails with "unknown command: update":
```bash
# Rebuild the CLI
pnpm --filter @chainglass/cli build
```

## Related Documentation

- [Harness README](../../harness/README.md) — Docker dev environment, agent definitions
- [SSE Integration Guide](./sse-integration.md) — How SSE channels work
- [Plan 074 Spec](../plans/074-workflow-execution/workflow-execution-spec.md) — Full feature specification
