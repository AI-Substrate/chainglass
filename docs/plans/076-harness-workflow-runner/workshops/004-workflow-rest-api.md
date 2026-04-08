# Workshop: Workflow REST API

**Type**: API Contract
**Plan**: 076-harness-workflow-runner
**Spec**: [harness-workflow-runner-spec.md](../harness-workflow-runner-spec.md)
**Created**: 2026-03-21
**Status**: Draft

**Related Documents**:
- [Workshop 001 — Harness Workflow Experience](001-harness-workflow-experience.md)
- [Workshop 002 — Telemetry Architecture](002-telemetry-architecture.md)
- [Workshop 003 — CG CLI Status Enhancement](003-cg-cli-status-enhancement.md)

**Domain Context**:
- **Primary Domain**: `_platform/positional-graph` (graph CRUD), `workflow-ui` (execution)
- **Related Domains**: `_platform/events` (SSE), `agents` (agent lifecycle), `workflow-events` (Q&A)
- **Consumer**: `_(harness)_` — external tooling calls these endpoints instead of CLI subprocess

---

## Purpose

Design a fully-featured REST API that exposes all workflow operations — work units, templates, graphs, lines, nodes, execution, diagnostics — through HTTP endpoints on the Next.js web server. This eliminates the split between CLI and web execution paths, enables the harness to control workflows through the same server the user sees, and makes the web execution path fully testable without browser automation.

## Key Questions Addressed

- What URL structure covers all 60+ service operations?
- How does workspace context flow through REST (vs. the CLI's `--workspace-path` flag)?
- Can the harness run a workflow "in the web" and have the user see it running in their browser?
- How does `cg wf run --server` differ from `cg wf run --local`?
- What's the minimum viable API surface to unblock Phase 4 validation?

---

## The Problem

Today there are **two execution paths** that don't coordinate:

```
┌─────────────────────────────────────────────────────────────┐
│ CLI Path (harness uses this)                                │
│                                                             │
│  cg wf run test-workflow                                    │
│    → CLI process creates OrchestrationService               │
│    → drive() runs in CLI process                            │
│    → filesystem lock in CLI                                 │
│    → events to stdout (NDJSON)                              │
│    → user doesn't see it in browser                         │
│                                                             │
│ Web Path (browser uses this)                                │
│                                                             │
│  Click "Run" button                                         │
│    → Server Action → WorkflowExecutionManager               │
│    → drive() runs in web server process                     │
│    → NO filesystem lock                                     │
│    → events via SSE to browser                              │
│    → user sees it live                                      │
│                                                             │
│ ⚠️  No cross-process lock. Both can run simultaneously.     │
│ ⚠️  Harness can't trigger the web path without browser.     │
│ ⚠️  CLI changes (like edits) don't appear in browser.       │
└─────────────────────────────────────────────────────────────┘
```

**With a REST API**, everything goes through the web server:

```
┌─────────────────────────────────────────────────────────────┐
│ Unified Path (REST API)                                     │
│                                                             │
│  POST /api/workflows/test-workflow/run                      │
│    → Same WorkflowExecutionManager as browser               │
│    → drive() runs in web server process                     │
│    → SSE events reach browser automatically                 │
│    → User sees it live (whether triggered by harness or UI) │
│    → One process, one lock, one source of truth             │
│                                                             │
│  Harness calls REST → user sees it in browser               │
│  Browser clicks Run → harness can observe via REST          │
│  CLI calls REST → same effect as browser click              │
└─────────────────────────────────────────────────────────────┘
```

---

## API Design Principles

1. **RESTful resource hierarchy** — workflows contain lines, lines contain nodes, nodes have inputs/outputs/events
2. **Workspace context via path** — `/api/workspaces/{slug}/workflows/...` scopes all operations to a workspace
3. **Worktree via query param** — `?worktree=/path/to/worktree` selects which worktree (default: main)
4. **Same auth** — `await auth()` check, 401 if unauthenticated (matches existing pattern)
5. **Same DI** — `getContainer().resolve<IService>(TOKEN)` (matches existing pattern)
6. **Result passthrough** — service methods return `{ok, errors[], ...data}` — pass through as JSON
7. **DISABLE_AUTH bypass** — when `DISABLE_AUTH=true`, skip auth check (for harness/testing)

---

## URL Structure

### Resource Hierarchy

```
/api/workspaces/{slug}
├── /units                              # Work Unit CRUD
│   ├── GET                             → list all units
│   ├── POST                            → create unit
│   └── /{unitSlug}
│       ├── GET                         → load unit definition
│       ├── PATCH                       → update unit
│       ├── DELETE                      → delete unit
│       └── /validate
│           └── GET                     → validate unit config
│
├── /templates                          # Template CRUD
│   ├── GET                             → list templates
│   ├── POST                            → save template from graph
│   └── /{templateSlug}
│       ├── GET                         → show template
│       ├── DELETE                      → delete template
│       ├── /instantiate
│       │   └── POST                    → create workflow from template
│       └── /instances
│           ├── GET                     → list instances
│           └── /{instanceId}/refresh
│               └── POST               → refresh instance from template
│
├── /workflows                          # Graph CRUD + Execution
│   ├── GET                             → list workflows
│   ├── POST                            → create empty workflow
│   └── /{graphSlug}
│       ├── GET                         → show workflow definition
│       ├── DELETE                      → delete workflow
│       │
│       ├── /status                     → Graph status
│       │   └── GET                     → full graph status (getStatus)
│       │
│       ├── /detailed                   → Rich diagnostics
│       │   └── GET                     → getReality() — node states, timing, sessions, blockers
│       │
│       ├── /execution                  → Execution control
│       │   ├── GET                     → current execution status
│       │   ├── POST                    → start (run) workflow
│       │   ├── DELETE                  → stop workflow
│       │   └── /restart
│       │       └── POST               → restart workflow
│       │
│       ├── /state                      → Raw graph state
│       │   ├── GET                     → loadGraphState
│       │   └── DELETE                  → resetGraphState
│       │
│       ├── /lines                      → Line management
│       │   ├── POST                    → add line
│       │   └── /{lineId}
│       │       ├── PATCH              → update label/description/properties
│       │       ├── DELETE             → remove line
│       │       ├── /move
│       │       │   └── POST           → move line to index
│       │       ├── /transition
│       │       │   └── POST           → trigger line transition
│       │       └── /status
│       │           └── GET            → line status
│       │
│       └── /nodes                      → Node management
│           ├── POST                    → add node (body: {lineId, unitSlug, options?})
│           └── /{nodeId}
│               ├── GET                → show node
│               ├── PATCH              → update description/properties
│               ├── DELETE             → remove node
│               ├── /move
│               │   └── POST          → move node
│               ├── /status
│               │   └── GET           → node status
│               ├── /lifecycle
│               │   ├── /start
│               │   │   └── POST      → startNode
│               │   └── /end
│               │       └── POST      → endNode
│               ├── /inputs
│               │   ├── /{inputName}
│               │   │   ├── GET       → getInputData
│               │   │   ├── PUT       → setInput (wire)
│               │   │   └── DELETE    → removeInput
│               │   └── /collate
│               │       └── GET       → collateInputs
│               ├── /outputs
│               │   └── /{outputName}
│               │       ├── GET       → getOutputData
│               │       └── PUT       → saveOutputData
│               └── /events
│                   ├── GET           → getNodeEvents
│                   └── POST          → raiseNodeEvent
```

---

## Priority Tiers

Not everything is needed immediately. Three tiers based on what unblocks what:

### Tier 1: Execution Control (unblocks Phase 4 validation)

These 5 endpoints let the harness trigger and observe workflow execution through the web server — the user sees it in their browser.

| Method | Path | Maps To | Why First |
|--------|------|---------|-----------|
| `POST` | `/api/workspaces/{slug}/workflows/{graph}/execution` | `WorkflowExecutionManager.start()` | Harness can trigger web execution |
| `GET` | `/api/workspaces/{slug}/workflows/{graph}/execution` | `WorkflowExecutionManager.getSerializableStatus()` | Harness can poll execution state |
| `DELETE` | `/api/workspaces/{slug}/workflows/{graph}/execution` | `WorkflowExecutionManager.stop()` | Harness can stop execution |
| `POST` | `/api/workspaces/{slug}/workflows/{graph}/execution/restart` | `WorkflowExecutionManager.restart()` | Harness can restart |
| `GET` | `/api/workspaces/{slug}/workflows/{graph}/detailed` | `getReality()` | Rich diagnostics |

### Tier 2: Graph + Node CRUD (unblocks harness test data via web)

These endpoints let the harness create/modify workflows through the web server instead of CLI, enabling full round-trip validation (create via API → verify in filesystem → verify in browser).

| Method | Path | Maps To |
|--------|------|---------|
| `GET` | `/api/workspaces/{slug}/workflows` | `graphService.list()` |
| `POST` | `/api/workspaces/{slug}/workflows` | `graphService.create()` |
| `GET` | `/api/workspaces/{slug}/workflows/{graph}` | `graphService.show()` |
| `DELETE` | `/api/workspaces/{slug}/workflows/{graph}` | `graphService.delete()` |
| `GET` | `/api/workspaces/{slug}/workflows/{graph}/status` | `graphService.getStatus()` |
| `POST` | `/api/workspaces/{slug}/workflows/{graph}/lines` | `graphService.addLine()` |
| `DELETE` | `/api/workspaces/{slug}/workflows/{graph}/lines/{lineId}` | `graphService.removeLine()` |
| `POST` | `/api/workspaces/{slug}/workflows/{graph}/nodes` | `graphService.addNode()` |
| `DELETE` | `/api/workspaces/{slug}/workflows/{graph}/nodes/{nodeId}` | `graphService.removeNode()` |

### Tier 3: Full CRUD (complete API surface)

Everything else: unit CRUD, template operations, input wiring, output storage, node events, properties, orchestrator settings, state management. Implement as needed.

---

## Endpoint Specifications (Tier 1)

### POST `/api/workspaces/{slug}/workflows/{graphSlug}/execution`

**Purpose**: Start a workflow execution — same as clicking "Run" in the browser.

```bash
$ curl -X POST http://localhost:3000/api/workspaces/my-ws/workflows/test-workflow/execution \
  -H "Content-Type: application/json" \
  -d '{"worktreePath": "/path/to/worktree"}'
```

**Request Body**:
```json
{
  "worktreePath": "/Users/jordan/substrate/074-actaul-real-agents"
}
```

**Response (200)**:
```json
{
  "ok": true,
  "key": "L1VzZXJzL2pvcmRhbi9zdWJzdHJhdGUvMDc0OmFjdC10ZXN0LXdvcmtmbG93",
  "already": false
}
```

**Response (409 — already running)**:
```json
{
  "ok": true,
  "key": "L1VzZXJz...",
  "already": true
}
```

**Response (400 — invalid worktree)**:
```json
{
  "ok": false,
  "error": "Invalid workspace or worktree"
}
```

**Implementation** (mirrors `runWorkflow` server action):
```typescript
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; graphSlug: string }> }
): Promise<Response> {
  if (!isAuthDisabled()) {
    const session = await auth();
    if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { slug, graphSlug } = await params;
  const body = await request.json();
  const worktreePath = body.worktreePath;

  const validatedPath = await resolveValidatedWorktreePath(slug, worktreePath);
  if (!validatedPath) {
    return Response.json({ ok: false, error: 'Invalid workspace or worktree' }, { status: 400 });
  }

  const manager = getWorkflowExecutionManager();
  const result = await manager.start(
    { workspaceSlug: slug, worktreePath: validatedPath },
    graphSlug,
  );

  return Response.json({
    ok: result.started,
    key: result.key,
    already: result.already,
  }, { status: result.already ? 409 : 200 });
}
```

---

### GET `/api/workspaces/{slug}/workflows/{graphSlug}/execution`

**Purpose**: Get current execution status — polling endpoint.

```bash
$ curl http://localhost:3000/api/workspaces/my-ws/workflows/test-workflow/execution?worktreePath=/path
```

**Response (200)**:
```json
{
  "status": "running",
  "iterations": 7,
  "totalActions": 3,
  "lastEventType": "iteration",
  "lastMessage": "ONBAS: start-node spec-writer-abc"
}
```

**Response (200 — not running)**:
```json
null
```

---

### DELETE `/api/workspaces/{slug}/workflows/{graphSlug}/execution`

**Purpose**: Stop a running workflow.

```bash
$ curl -X DELETE http://localhost:3000/api/workspaces/my-ws/workflows/test-workflow/execution \
  -d '{"worktreePath": "/path/to/worktree"}'
```

**Response (200)**:
```json
{ "ok": true, "stopped": true }
```

---

### GET `/api/workspaces/{slug}/workflows/{graphSlug}/detailed`

**Purpose**: Rich diagnostics — per-node status with timing, sessions, blockers. Same data as `cg wf show --detailed`.

```bash
$ curl http://localhost:3000/api/workspaces/my-ws/workflows/test-workflow/detailed?worktreePath=/path
```

**Response (200)**:
```json
{
  "slug": "test-workflow",
  "execution": {
    "status": "running",
    "totalNodes": 4,
    "completedNodes": 1,
    "progress": "25%"
  },
  "lines": [
    {
      "id": "line-e9b",
      "label": "Input",
      "nodes": [
        {
          "id": "test-user-input-e43",
          "unitSlug": "test-user-input",
          "type": "user-input",
          "status": "complete",
          "startedAt": "2026-03-21T01:00:00Z",
          "completedAt": "2026-03-21T01:00:05Z",
          "error": null,
          "sessionId": null,
          "blockedBy": []
        }
      ]
    }
  ],
  "questions": [],
  "sessions": {}
}
```

---

## Harness Integration Pattern

With Tier 1 endpoints, the harness `workflow run` command gains a `--server` mode:

```bash
# Current: drives locally via CLI subprocess
just harness workflow run

# New: drives via web server REST API — user sees it in browser
just harness workflow run --server
```

**Implementation in harness**:
```typescript
// --server mode: POST to web server, poll for status, auto-complete via REST
async function runViaServer(execOptions: CgExecOptions, timeout: number) {
  const base = `http://localhost:3000/api/workspaces/${wsSlug}`;

  // Start execution (user sees "Running" in browser immediately)
  await fetch(`${base}/workflows/${graphSlug}/execution`, {
    method: 'POST',
    body: JSON.stringify({ worktreePath }),
  });

  // Poll for completion
  while (true) {
    const status = await fetch(`${base}/workflows/${graphSlug}/execution`).then(r => r.json());
    if (status?.status === 'completed' || status?.status === 'failed') break;
    await sleep(2000);
  }

  // Get final diagnostics
  const detailed = await fetch(`${base}/workflows/${graphSlug}/detailed`).then(r => r.json());
  return detailed;
}
```

**What the user sees**: They open their browser, navigate to the workflow page, and the nodes are progressing — status badges updating in real-time via SSE. They didn't click anything. The harness triggered it via REST, but the experience is identical.

---

## CLI `--server` Variant

The CG CLI can also gain `--server` mode:

```bash
# Local drive (current)
cg wf run test-workflow --timeout 60

# Server drive (new) — POST to web server
cg wf run test-workflow --server --timeout 60

# Server show (new) — GET from web server
cg wf show test-workflow --detailed --server
```

This means one CLI, two backends. The `--server` flag routes to REST instead of local orchestration. Future-proof for the scenario where CLI always routes through the web server.

---

## Filesystem Lock Unification

Per DYK #1 (Phase 4 analysis): the CLI has a filesystem lock but the web doesn't. With REST API execution, both paths go through the web server, so:

**Option A (recommended)**: Move lock into `GraphOrchestration.drive()` — engine protects its own state. Both CLI-local and web-server paths are protected. One lock, one place.

**Option B**: Lock in `WorkflowExecutionManager` — web-only protection. CLI still has its own lock. Two locks, two places.

Per user decision: **Option A — must be same code, same system.**

```typescript
// In GraphOrchestration.drive()
async drive(options?: DriveOptions): Promise<DriveResult> {
  const lockPath = path.join(this.graphPath, 'drive.lock');
  await acquireLock(lockPath);
  try {
    // ... existing drive loop ...
  } finally {
    await releaseLock(lockPath);
  }
}
```

---

## Q&A: Auto-Completion via REST

For the harness to auto-complete nodes via REST (instead of direct `@chainglass/positional-graph` imports):

```bash
# Complete user-input node
POST /api/workspaces/{slug}/workflows/{graph}/nodes/{nodeId}/lifecycle/start
POST /api/workspaces/{slug}/workflows/{graph}/nodes/{nodeId}/events
  body: { eventType: "node:accepted", payload: {}, source: "agent" }
PUT /api/workspaces/{slug}/workflows/{graph}/nodes/{nodeId}/outputs/requirements
  body: { value: "Build a CLI tool..." }
POST /api/workspaces/{slug}/workflows/{graph}/nodes/{nodeId}/lifecycle/end

# Answer Q&A question
POST /api/workspaces/{slug}/workflows/{graph}/nodes/{nodeId}/events
  body: { eventType: "question:answer", payload: { questionId: "q1", answer: "python" }, source: "user" }
```

This replaces the direct `AutoCompletionRunner` imports — everything goes through HTTP. The harness becomes truly external tooling again (no ADR-0014 override needed for positional-graph imports).

---

## Implementation Scope & Phasing

### For Plan 076 Phase 4 (minimal — unblocks validation)

Add Tier 1 only (5 endpoints):
- `POST/GET/DELETE /api/workspaces/{slug}/workflows/{graph}/execution`
- `POST /api/workspaces/{slug}/workflows/{graph}/execution/restart`
- `GET /api/workspaces/{slug}/workflows/{graph}/detailed`

Plus: move filesystem lock into `GraphOrchestration.drive()`.

**Estimated effort**: ~2 tasks, each 30-60 min. These are thin wrappers around existing server actions.

### For Future Plan (077 or similar — full API surface)

- All Tier 2 and Tier 3 endpoints
- `cg wf run --server` CLI variant
- Harness `--server` mode for `workflow run/status`
- Auto-completion via REST (retire direct positional-graph imports from harness)
- OpenAPI spec generation
- API key auth for CI/automation (bypass session auth)

---

## File Structure

```
apps/web/app/api/workspaces/[slug]/
├── route.ts                          # existing
├── files/                            # existing
├── workflows/
│   ├── route.ts                      # GET list / POST create
│   └── [graphSlug]/
│       ├── route.ts                  # GET show / DELETE
│       ├── status/
│       │   └── route.ts              # GET status
│       ├── detailed/
│       │   └── route.ts              # GET getReality()
│       ├── execution/
│       │   ├── route.ts              # GET status / POST run / DELETE stop
│       │   └── restart/
│       │       └── route.ts          # POST restart
│       ├── state/
│       │   └── route.ts              # GET loadState / DELETE resetState
│       ├── lines/
│       │   ├── route.ts              # POST addLine
│       │   └── [lineId]/
│       │       └── route.ts          # PATCH update / DELETE remove
│       └── nodes/
│           ├── route.ts              # POST addNode
│           └── [nodeId]/
│               ├── route.ts          # GET show / PATCH update / DELETE remove
│               ├── lifecycle/
│               │   ├── start/route.ts  # POST startNode
│               │   └── end/route.ts    # POST endNode
│               ├── inputs/
│               │   └── [inputName]/route.ts  # GET/PUT/DELETE
│               ├── outputs/
│               │   └── [outputName]/route.ts # GET/PUT
│               └── events/
│                   └── route.ts      # GET list / POST raise
```

---

## Open Questions

### Q1: Should `--server` become the default for CLI?

**OPEN**: If the web server is always running during development (`just dev`), the CLI could default to `--server` and only fall back to `--local` when the server is unreachable. This would unify the execution path completely.

### Q2: SSE streaming for REST callers?

**OPEN**: The current SSE endpoint (`/api/events/mux?channels=workflow-execution`) requires an EventSource (browser API). For the harness/CLI, we could either:
- A) Poll `GET /execution` at intervals (simple, works now)
- B) Accept `text/event-stream` on `POST /execution` for long-poll streaming (more complex, richer)
- C) Use the existing mux endpoint from the harness via a Node.js EventSource library

### Q3: Auth for harness/CI?

**RESOLVED**: Use existing `DISABLE_AUTH=true` env var for local development. For CI, consider API key auth in a future plan.

---

## Quick Reference

```bash
# Tier 1: Execution Control
curl -X POST localhost:3000/api/workspaces/$WS/workflows/$WF/execution \
  -H 'Content-Type: application/json' -d '{"worktreePath":"'$WT'"}'

curl localhost:3000/api/workspaces/$WS/workflows/$WF/execution?worktreePath=$WT

curl -X DELETE localhost:3000/api/workspaces/$WS/workflows/$WF/execution \
  -H 'Content-Type: application/json' -d '{"worktreePath":"'$WT'"}'

curl localhost:3000/api/workspaces/$WS/workflows/$WF/detailed?worktreePath=$WT

# Tier 2: Graph CRUD
curl localhost:3000/api/workspaces/$WS/workflows
curl -X POST localhost:3000/api/workspaces/$WS/workflows \
  -d '{"slug":"my-workflow"}'
curl -X DELETE localhost:3000/api/workspaces/$WS/workflows/$WF
```
