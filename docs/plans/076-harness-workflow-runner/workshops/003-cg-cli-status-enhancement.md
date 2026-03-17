# Workshop: CG CLI Status Enhancement

**Type**: API Contract
**Plan**: 076-harness-workflow-runner
**Spec**: [harness-workflow-runner-spec.md](../harness-workflow-runner-spec.md)
**Created**: 2026-03-16
**Status**: Draft

**Related Documents**:
- [Workshop 001 — Harness Workflow Experience](001-harness-workflow-experience.md)
- [Workshop 002 — Telemetry Architecture](002-telemetry-architecture.md)
- [Research Dossier](../research-dossier.md)

**Domain Context**:
- **Primary Domain**: `_platform/positional-graph` (owns IPositionalGraphService, GraphStatusResult)
- **Related Domains**: `agents` (pod session IDs), `workflow-events` (question state)

---

## Purpose

Design the `cg wf show --detailed` flag that exposes node-level execution status, pod sessions, timing, and orchestration state via the CG CLI. This is the product-side enhancement that the harness `workflow status` command wraps. Dogfooding principle: the product does the work, the harness wraps it with structure.

## Key Questions Addressed

- What JSON schema does `--detailed` output?
- What data sources does it combine (getStatus, loadGraphState, pod sessions)?
- How does it differ from the existing `cg wf show` output?
- Should it include ONBAS/ODS last action?

---

## Current State: `cg wf show`

The existing `cg wf show <slug>` command returns graph structure — lines, nodes, and their configuration. It does NOT include runtime execution status.

```bash
$ cg wf show test-workflow --json
```

```json
{
  "command": "wf.show",
  "status": "ok",
  "data": {
    "slug": "test-workflow",
    "version": "1.0.0",
    "description": "Test workflow from template",
    "lines": [
      {
        "id": "line-0",
        "label": "Input",
        "nodes": [
          { "id": "human-input-a1b", "unitSlug": "test-user-input", "type": "user-input" }
        ]
      },
      {
        "id": "line-1",
        "label": "Processing",
        "nodes": [
          { "id": "spec-builder-fa0", "unitSlug": "test-agent", "type": "agent" }
        ]
      },
      {
        "id": "line-2",
        "label": "Output",
        "nodes": [
          { "id": "coder-5ec", "unitSlug": "test-code", "type": "code" },
          { "id": "reviewer-881", "unitSlug": "test-agent", "type": "agent" }
        ]
      }
    ]
  }
}
```

**What's missing**: Node execution status, timing, pod sessions, questions, errors, overall graph progress.

---

## Proposed: `cg wf show --detailed`

### JSON Schema

```bash
$ cg wf show test-workflow --detailed --json
```

```json
{
  "command": "wf.show",
  "status": "ok",
  "data": {
    "slug": "test-workflow",
    "version": "1.0.0",

    "execution": {
      "status": "in_progress",
      "totalNodes": 4,
      "completedNodes": 2,
      "progress": "50%"
    },

    "lines": [
      {
        "id": "line-0",
        "label": "Input",
        "status": "complete",
        "nodes": [
          {
            "id": "human-input-a1b",
            "unitSlug": "test-user-input",
            "type": "user-input",
            "status": "complete",
            "startedAt": "2026-03-16T09:00:01Z",
            "completedAt": "2026-03-16T09:00:02Z",
            "duration": "1.0s"
          }
        ]
      },
      {
        "id": "line-1",
        "label": "Processing",
        "status": "complete",
        "nodes": [
          {
            "id": "spec-builder-fa0",
            "unitSlug": "test-agent",
            "type": "agent",
            "status": "complete",
            "startedAt": "2026-03-16T09:00:03Z",
            "completedAt": "2026-03-16T09:00:12Z",
            "duration": "9.0s",
            "sessionId": "ses_abc123"
          }
        ]
      },
      {
        "id": "line-2",
        "label": "Output",
        "status": "in_progress",
        "nodes": [
          {
            "id": "coder-5ec",
            "unitSlug": "test-code",
            "type": "code",
            "status": "starting",
            "startedAt": "2026-03-16T09:00:13Z",
            "completedAt": null,
            "duration": null,
            "sessionId": null,
            "waitingFor": "pod execution"
          },
          {
            "id": "reviewer-881",
            "unitSlug": "test-agent",
            "type": "agent",
            "status": "ready",
            "startedAt": null,
            "completedAt": null,
            "duration": null,
            "blockedBy": ["coder-5ec"]
          }
        ]
      }
    ],

    "questions": [],

    "sessions": {
      "spec-builder-fa0": "ses_abc123"
    }
  }
}
```

### TypeScript Types

```typescript
/** Enhanced graph status for --detailed flag */
interface DetailedGraphStatus {
  slug: string;
  version: string;

  execution: {
    status: 'pending' | 'in_progress' | 'complete' | 'failed';
    totalNodes: number;
    completedNodes: number;
    progress: string;  // "50%" human-readable
  };

  lines: DetailedLineStatus[];

  questions: PendingQuestion[];

  sessions: Record<string, string>;  // nodeId → sessionId
}

interface DetailedLineStatus {
  id: string;
  label: string;
  status: 'pending' | 'in_progress' | 'complete' | 'failed';
  nodes: DetailedNodeStatus[];
}

interface DetailedNodeStatus {
  id: string;
  unitSlug: string;
  type: 'agent' | 'code' | 'user-input';
  status: NodeExecutionStatus;
  startedAt: string | null;
  completedAt: string | null;
  duration: string | null;       // "9.0s" human-readable
  sessionId?: string | null;     // For agent nodes
  error?: string | null;         // For failed nodes
  blockedBy?: string[];           // Node IDs this is waiting on
  waitingFor?: string;           // Human-readable wait reason
}

type NodeExecutionStatus =
  | 'pending'          // Not yet reachable
  | 'ready'            // Can be started (upstream complete)
  | 'starting'         // ODS dispatched, pod creating
  | 'agent-accepted'   // Agent picked up the work
  | 'waiting-question' // Agent asked a Q&A question
  | 'complete'         // Done
  | 'error'            // Failed
  | 'interrupted';     // Stopped by user

interface PendingQuestion {
  questionId: string;
  nodeId: string;
  text: string;
  askedAt: string;
}
```

---

## Data Sources

`--detailed` combines data from three sources that already exist:

```
┌─────────────────────────────────────────────────────────────┐
│ Source 1: IPositionalGraphService.getStatus()                │
│                                                              │
│ Returns GraphStatusResult:                                   │
│   - graphSlug, version, description                         │
│   - status: 'pending'|'in_progress'|'complete'|'failed'    │
│   - totalNodes, completedNodes                              │
│   - lines[].nodes[].status (ready, running, complete, etc.) │
│   - readyNodes[], runningNodes[], completedNodeIds[]         │
│   - waitingQuestionNodes[], blockedNodes[]                   │
└─────────────────────────────────────────────────────────────┘
                              +
┌─────────────────────────────────────────────────────────────┐
│ Source 2: IPositionalGraphService.loadGraphState()            │
│                                                              │
│ Returns State:                                               │
│   - nodes[id].started_at, completed_at                      │
│   - nodes[id].error                                         │
│   - nodes[id].events[]                                      │
│   - questions[] (pending Q&A)                                │
└─────────────────────────────────────────────────────────────┘
                              +
┌─────────────────────────────────────────────────────────────┐
│ Source 3: PodManager.loadSessions() + getSessions()          │
│                                                              │
│ Returns Map<nodeId, sessionId>:                              │
│   - Read from .chainglass/data/workflows/{slug}/             │
│     pod-sessions.json                                        │
│   - Maps agent node IDs to Copilot/Claude session IDs       │
└─────────────────────────────────────────────────────────────┘
```

### Implementation Sketch

```typescript
// In positional-graph.command.ts, wf show handler:

if (options.detailed) {
  const statusResult = await service.getStatus(ctx, slug);
  const state = await service.loadGraphState(ctx, slug);
  const reality = buildPositionalGraphReality({
    statusResult, state,
    snapshotAt: new Date().toISOString()
  });

  // Load pod sessions
  const nodeFs = new NodeFileSystemAdapter();
  const podManager = new PodManager(nodeFs);
  await podManager.loadSessions(ctx, slug);
  const sessions = Object.fromEntries(podManager.getSessions());

  // Build detailed response
  const detailed: DetailedGraphStatus = {
    slug,
    version: statusResult.version,
    execution: {
      status: statusResult.status,
      totalNodes: statusResult.totalNodes,
      completedNodes: statusResult.completedNodes,
      progress: `${Math.round((statusResult.completedNodes / statusResult.totalNodes) * 100)}%`,
    },
    lines: statusResult.lines.map(line => ({
      id: line.id,
      label: line.label,
      status: deriveLineStatus(line),
      nodes: line.nodes.map(node => {
        const nodeState = state?.nodes?.[node.id];
        return {
          id: node.id,
          unitSlug: node.unitSlug,
          type: node.type,
          status: node.status,
          startedAt: nodeState?.started_at ?? null,
          completedAt: nodeState?.completed_at ?? null,
          duration: computeDuration(nodeState?.started_at, nodeState?.completed_at),
          sessionId: sessions[node.id] ?? null,
          error: nodeState?.error ?? null,
          blockedBy: findBlockers(node.id, reality),
          waitingFor: deriveWaitReason(node.status),
        };
      }),
    })),
    questions: reality.pendingQuestions,
    sessions,
  };

  return formatJson(detailed);
}
```

---

## Comparison: Without vs With `--detailed`

| Field | `cg wf show` | `cg wf show --detailed` |
|-------|-------------|------------------------|
| Graph slug, version | ✅ | ✅ |
| Line structure | ✅ | ✅ |
| Node IDs and types | ✅ | ✅ |
| **Execution status** | ❌ | ✅ (pending/in_progress/complete/failed) |
| **Node status** | ❌ | ✅ (ready/starting/running/complete/error) |
| **Timing** | ❌ | ✅ (startedAt, completedAt, duration) |
| **Progress** | ❌ | ✅ (completedNodes/totalNodes, %) |
| **Pod sessions** | ❌ | ✅ (nodeId → sessionId map) |
| **Questions** | ❌ | ✅ (pending Q&A with text) |
| **Errors** | ❌ | ✅ (per-node error messages) |
| **Blockers** | ❌ | ✅ (which nodes are blocking which) |

---

## How the Harness Uses This

### `harness workflow status`

```typescript
// harness/src/cli/commands/workflow.ts

async function workflowStatus(options: CgExecOptions): Promise<HarnessEnvelope> {
  const result = await runCg(
    ['wf', 'show', TEST_DATA.workflowId, '--detailed'],
    options
  );

  if (result.exitCode !== 0) {
    return formatError('workflow.status', ErrorCodes.UNKNOWN, 'Failed to get status');
  }

  const detailed = JSON.parse(result.stdout);
  return formatSuccess('workflow.status', detailed.data);
}
```

The harness wraps the CG CLI output in a HarnessEnvelope. No transformation needed — `--detailed` output IS the status response. This is dogfooding: the product provides the data, the harness provides the structure.

### Progressive Disclosure Integration

```
Level 1: harness workflow run
  → Uses --detailed AFTER run to get final snapshot
  → Shows summary: "4/4 nodes complete, 14 iterations, 42.3s"

Level 2: harness workflow status
  → Calls --detailed directly
  → Shows per-node table with status, timing, sessions

Level 3: harness workflow logs
  → Reads disk state (events.jsonl) + accumulated DriveEvents
  → Shows execution timeline

Level 4: harness workflow logs --node <id>
  → Filters to single node from Level 3 data
```

---

## Error Scenarios

### Node stuck at "starting" (the bug we're fixing)

```json
{
  "id": "coder-5ec",
  "status": "starting",
  "startedAt": "2026-03-16T09:00:13Z",
  "completedAt": null,
  "duration": null,
  "waitingFor": "pod execution"
}
```

The agent sees: node was started 30 seconds ago but hasn't progressed. This is the exact bug from Plan 074. `--detailed` makes it visible without reading logs.

### Node with error

```json
{
  "id": "coder-5ec",
  "status": "error",
  "startedAt": "2026-03-16T09:00:13Z",
  "completedAt": "2026-03-16T09:00:14Z",
  "duration": "1.0s",
  "error": "ENOENT: no such file or directory, open '.chainglass/data/workflows/test-workflow/pod-sessions.json'"
}
```

The agent sees: node failed after 1 second with an ENOENT error. Knows exactly what to fix.

### Node waiting for Q&A

```json
{
  "id": "spec-builder-fa0",
  "status": "waiting-question",
  "startedAt": "2026-03-16T09:00:03Z",
  "completedAt": null,
  "waitingFor": "question answer"
}
```

Plus the `questions` array shows the actual question text.

### Node blocked by upstream

```json
{
  "id": "reviewer-881",
  "status": "ready",
  "blockedBy": ["coder-5ec", "tester-442"]
}
```

The agent sees: this node CAN'T run yet because two upstream nodes haven't completed.

---

## Open Questions

### Q1: Should `--detailed` be a separate subcommand (`cg wf status`) instead of a flag?

**RESOLVED**: Flag on existing `show` command. Follows the `--verbose` precedent. `cg wf show` is the "tell me about this workflow" command; `--detailed` just adds runtime info. Less command surface to maintain.

### Q2: Should `--detailed` include the last ONBAS action?

**OPEN**: Could add a `lastAction` field showing what the orchestration engine decided most recently. Useful for debugging but requires reading the action log.

Recommendation: **Defer to v2.** The node-level status + timing + blockers is sufficient for the harness workflow commands. If agents need ONBAS action history, add `cg wf actions <slug>` later.

### Q3: Should PodManager session loading be lazy or always included?

**RESOLVED**: Always included when `--detailed` is used. Pod sessions are a single file read (~1ms). The session ID is critical for connecting workflow nodes to agent history.

---

**Workshop Location**: `docs/plans/076-harness-workflow-runner/workshops/003-cg-cli-status-enhancement.md`
