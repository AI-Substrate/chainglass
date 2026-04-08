# Workshop: CG CLI Server Mode — SDK Integration

**Type**: CLI Flow + Integration Pattern
**Plan**: 076-harness-workflow-runner
**Spec**: [harness-workflow-runner-spec.md](../harness-workflow-runner-spec.md)
**Created**: 2026-03-23
**Status**: Draft

**Related Documents**:
- [Workshop 004 — Workflow REST API](004-workflow-rest-api.md) (endpoint design)
- [Workshop 005 — PACT Contract Testing](005-pact-contract-testing.md) (SDK testing)
- [Subtask 001 — REST API + SDK](../tasks/phase-4-end-to-end-validation-docs/001-subtask-workflow-rest-api-sdk.md) (implementation)

**Domain Context**:
- **Primary Domain**: `_platform/positional-graph` (CLI commands live here)
- **Related Domains**: `workflow-ui` (REST endpoints), `_(harness)_` (current SDK home)

---

## Purpose

Design what it looks like to add `--server` mode to the `cg` CLI, so users and agents can drive workflows through the web server (REST API) instead of locally. This unifies the execution path — whether you click Run in the browser, call the harness, or type `cg wf run`, the same server process does the work and the user sees it live.

Not all commands make sense. This workshop identifies which ones do, which don't, and where the SDK should live.

## Key Questions Addressed

- Which `cg wf` commands benefit from server mode?
- Where should the SDK live — harness, shared, or its own package?
- How does workspace context flow through `--server`?
- What new commands does server mode enable (e.g. `cg wf stop`)?
- How do streaming events (`--json-events`) work via server?

---

## Current State

### Two CLIs, Two Paths

```
┌─────────────────────────────────────────────────────────────┐
│ cg wf run test-workflow                                     │
│   → CLI process calls GraphOrchestration.drive() directly   │
│   → events to stdout (NDJSON via --json-events)             │
│   → user does NOT see it in browser                         │
│   → filesystem lock in engine (drive.lock)                  │
│                                                             │
│ just harness workflow run --server                          │
│   → POST /api/.../execution via WorkflowApiClient SDK       │
│   → polls GET /execution for status                         │
│   → user DOES see it in browser (same WEM + SSE)            │
│   → engine lock protects against concurrent drives          │
└─────────────────────────────────────────────────────────────┘
```

### CG CLI Command Surface (30+ commands)

| Category | Commands | Count |
|----------|----------|-------|
| Graph CRUD | `create`, `show`, `delete`, `list`, `set`, `get` | 6 |
| Execution | `run`, `status`, `inspect`, `trigger` | 4 |
| Line CRUD | `line add/remove/move/get/set/set-label/set-description` | 7 |
| Node CRUD | `line add/remove/move/show/get/set/set-description`, `node event list-types/schema` | 9 |
| Unit | `unit list/info/get-template` | 3 |
| **Total** | | **29** |

### What Harness Has That CG Doesn't

| Harness Command | CG Equivalent | Gap |
|----------------|---------------|-----|
| `workflow run --server` | `cg wf run` (local only) | No server mode |
| `workflow status --server` | `cg wf show --detailed` (local only) | No server mode |
| `workflow reset` | None | Harness-specific |
| `workflow logs` | None | Harness-specific (reads .cache/) |
| — | `cg wf stop` doesn't exist! | No way to stop from CLI |

---

## Command Triage — What Moves, What Stays

### ✅ Commands That Benefit From `--server`

These commands have a clear value prop: run through the web server so the user sees it in their browser, or so you can interact with a running web-hosted execution.

| Command | Why Server Mode Helps | Priority |
|---------|----------------------|----------|
| `cg wf run <slug>` | User sees nodes progressing in browser. Same WEM, same SSE. One execution path. | **P0** |
| `cg wf show <slug> --detailed` | Get reality from the server (includes web-only execution state) | **P0** |
| `cg wf status <slug>` | Poll execution status of a web-hosted run | **P1** |
| **NEW: `cg wf stop <slug>`** | Stop a running execution (currently impossible from CLI!) | **P1** |
| **NEW: `cg wf restart <slug>`** | Restart a running execution | **P2** |

### ❌ Commands That Don't Benefit

These are filesystem operations. The server would just proxy to the same filesystem calls. No value.

| Command | Why NOT | Notes |
|---------|---------|-------|
| `cg wf create/delete/list` | Pure filesystem CRUD — no execution involved | Could proxy later for Tier 2/3 REST |
| `cg wf line *` | Structural graph editing — filesystem only | Same |
| `cg wf node *` | Structural graph editing — filesystem only | Same |
| `cg wf unit *` | Work unit definitions — filesystem only | Same |
| `cg wf set` | Properties — filesystem only | Same |
| `cg wf inspect` | Deep state dump — could benefit but not urgent | Future Tier 3 |
| `cg wf trigger` | Manual line transition — local only today | Could proxy later |

### 🔶 Harness-Only (Don't Move)

| Command | Why Stays in Harness |
|---------|---------------------|
| `workflow reset` | Test data management — not a user workflow |
| `workflow logs` | Reads `.cache/` — harness-specific artifact |
| `workflow run --no-auto-complete` | Auto-completion is harness test infrastructure |

---

## Proposed Design

### Flag: `--server` on `cg wf`

Add `--server` as a **parent-level option** on the `wf` command group. This makes it available to all subcommands without repeating the option definition.

```bash
# Local mode (default — unchanged behavior)
cg wf run test-workflow
cg wf show test-workflow --detailed

# Server mode — same commands, different execution path
cg wf run test-workflow --server
cg wf show test-workflow --detailed --server
cg wf stop test-workflow --server
cg wf restart test-workflow --server

# With explicit URL override
cg wf run test-workflow --server --server-url http://localhost:3000

# With explicit workspace slug (if different from auto-resolved)
cg wf run test-workflow --server --workspace-slug my-workspace
```

### Workspace Context Resolution

The CLI currently resolves context via `--workspace-path` (defaults to cwd). For `--server` mode, we need the **workspace slug** (for the URL) and **worktree path** (for the request body).

```
┌─────────────────────────────────────────────────────────────┐
│ Local mode (existing):                                      │
│   --workspace-path /Users/jordan/substrate/074...           │
│   → resolveOrOverrideContext() → WorkspaceContext            │
│   → has worktreePath, workspaceSlug, etc.                    │
│                                                             │
│ Server mode (new):                                          │
│   Same --workspace-path resolution BUT:                     │
│   1. Resolve WorkspaceContext from path (get slug)          │
│   2. Use slug in URL: /api/workspaces/{slug}/...            │
│   3. Send worktreePath in request body                      │
│                                                             │
│ Override: --workspace-slug explicitly sets the slug         │
│ Override: --server-url explicitly sets the base URL         │
└─────────────────────────────────────────────────────────────┘
```

The resolution is already done by `resolveOrOverrideContext()` which returns a `WorkspaceContext` with both `workspaceSlug` and `worktreePath`. Server mode just uses those values differently.

### Server URL Resolution — Existing `server.json` Discovery

The infrastructure already exists. Plan 067 (Event Popper) built a complete port discovery system:

**Server writes** `.chainglass/server.json` on boot (`apps/web/instrumentation.ts`):
```json
{
  "port": 3000,
  "pid": 12345,
  "startedAt": "2026-03-23T03:00:00.000Z"
}
```

**CLI reads** via `readServerInfo(worktreePath)` from `@chainglass/shared/event-popper`:
- Validates JSON with Zod schema (`ServerInfoSchema`)
- Checks PID is alive (`process.kill(pid, 0)`)
- Guards against PID recycling (OS start time vs recorded `startedAt`, 5s tolerance)
- Returns `null` if server isn't running → caller can throw a helpful error

**Existing pattern** in `apps/cli/src/commands/event-popper-client.ts`:
```typescript
import { readServerInfo } from '@chainglass/shared/event-popper';

export function discoverServerUrl(worktreePath?: string): string {
  const cwd = worktreePath ?? process.cwd();
  // Try cwd first, then apps/web (Next.js cwd differs from repo root)
  const info = readServerInfo(cwd) ?? readServerInfo(join(cwd, 'apps', 'web'));
  if (!info) {
    throw new Error('Chainglass server not running. Start with: just dev');
  }
  return `http://localhost:${info.port}`;
}
```

**For `cg wf --server`**, we reuse this exact pattern — zero new discovery infrastructure:

```typescript
import { readServerInfo } from '@chainglass/shared/event-popper';

function resolveServerUrl(worktreePath: string, override?: string): string {
  if (override) return override;
  if (process.env.CG_SERVER_URL) return process.env.CG_SERVER_URL;

  const info = readServerInfo(worktreePath)
    ?? readServerInfo(join(worktreePath, 'apps', 'web'));
  if (!info) {
    throw new Error(
      'Chainglass server not running (no .chainglass/server.json). Start with: just dev'
    );
  }
  return `http://localhost:${info.port}`;
}
```

**Precedence**: `--server-url` flag → `CG_SERVER_URL` env → `server.json` auto-discovery.

**Why not hardcode port 3000?** The dev server port comes from `process.env.PORT` (defaults to 3000 but can vary). The `server.json` file records the actual port at runtime. Hardcoding would break if the user runs on a non-standard port.

**Why not `computePorts()`?** That's harness-specific — computes unique ports per worktree for Docker containers. The `cg` CLI talks to the user's actual dev server, which writes its own port to `server.json`.

### Command Implementations

#### `cg wf run <slug> --server`

```
$ cg wf run test-workflow --server --json-events

┌─────────────────────────────────────────────────────────────┐
│ 1. Resolve workspace context from cwd / --workspace-path    │
│ 2. Discover server URL from .chainglass/server.json         │
│ 3. POST /api/workspaces/{slug}/workflows/{graph}/execution  │
│    Body: { worktreePath: "/Users/jordan/substrate/074..." } │
│ 4. If --json-events: poll + emit NDJSON status events       │
│    If not: poll silently, print final status                │
│ 5. On completion/failure/timeout: GET /detailed             │
│ 6. Print result                                            │
└─────────────────────────────────────────────────────────────┘
```

**NDJSON streaming via polling** (vs local's direct event callback):

```jsonl
{"type":"status","message":"running","iterations":0,"timestamp":"2026-03-23T03:00:00Z"}
{"type":"status","message":"running","iterations":3,"timestamp":"2026-03-23T03:00:06Z"}
{"type":"status","message":"running","iterations":7,"timestamp":"2026-03-23T03:00:12Z"}
{"type":"status","message":"completed","iterations":12,"timestamp":"2026-03-23T03:00:20Z"}
```

**Streaming fidelity trade-off**: Local `--json-events` emits one event per drive iteration (real-time, sub-second). Server `--json-events` polls every 2s and synthesizes status events. The user sees updates, but at lower resolution. This is acceptable — the point of `--server` is that the user sees the *real* progress in their browser.

#### `cg wf show <slug> --detailed --server`

```
$ cg wf show test-workflow --detailed --server --json

→ GET /api/workspaces/{slug}/workflows/{graph}/detailed?worktreePath=...

{
  "slug": "test-workflow",
  "execution": { "status": "running", "totalNodes": 4, "completedNodes": 1, "progress": "25%" },
  "lines": [...],
  "sessions": {...}
}
```

Identical output to local `--detailed`. The only difference is the data source.

#### `cg wf stop <slug> --server` (NEW)

```
$ cg wf stop test-workflow --server

→ DELETE /api/workspaces/{slug}/workflows/{graph}/execution
  Body: { worktreePath: "..." }

Workflow 'test-workflow' stopped.
```

**This command only works in `--server` mode.** There's no local equivalent because the CLI `wf run` command owns its own process — you stop it with Ctrl+C. But when the web server is driving, you need a way to tell it to stop.

**Design choice**: `cg wf stop` without `--server` could print a helpful error:
```
Error: `cg wf stop` only works with --server mode.
To stop a local `cg wf run`, press Ctrl+C.
```

#### `cg wf restart <slug> --server` (NEW)

```
$ cg wf restart test-workflow --server

→ POST /api/workspaces/{slug}/workflows/{graph}/execution/restart
  Body: { worktreePath: "..." }

Workflow 'test-workflow' restarted.
```

Same as stop — only meaningful for server-hosted executions.

---

## SDK Placement

### Option A: Keep in Harness (Status Quo)

```
harness/src/sdk/
├── workflow-api-client.interface.ts
├── workflow-api-client.ts
└── fake-workflow-api-client.ts
```

**Pros**: Simple, no package changes, ADR-0014 compliant
**Cons**: CG CLI can't import it (different package). Would need to duplicate or move.

### Option B: Move to `packages/shared` (Recommended)

```
packages/shared/src/sdk/workflow/
├── workflow-api-client.interface.ts
├── workflow-api-client.ts
└── index.ts  (barrel export)
```

Harness imports `@chainglass/shared/sdk/workflow`. CG CLI already depends on `@chainglass/shared`.

**Pros**: Single source of truth, both consumers can use it, follows existing pattern
**Cons**: SDK types in shared package (acceptable — shared already has interfaces)

### Option C: New `packages/workflow-sdk` Package

**Pros**: Clean separation, own versioning
**Cons**: Overkill for 3 files, another package to maintain, build pipeline complexity

### Recommendation: **Option B**

Move the interface + client to `packages/shared/src/sdk/workflow/`. Keep `FakeWorkflowApiClient` in `harness/` (it's a test double, not production code). The interface and real client are production contracts that both CLI and harness consume.

```typescript
// In CG CLI:
import { WorkflowApiClient } from '@chainglass/shared/sdk/workflow';

// In harness:
import { WorkflowApiClient } from '@chainglass/shared/sdk/workflow';
import { FakeWorkflowApiClient } from '../sdk/fake-workflow-api-client.js';
```

---

## Implementation Shape

### Where the Code Goes

```
apps/cli/src/commands/positional-graph.command.ts
  └── wf parent command
       ├── --server (boolean) — new parent-level option
       ├── --server-url <url> — new parent-level option
       ├── --workspace-slug <slug> — new parent-level option
       │
       ├── run <slug>
       │   └── if --server → runViaServer() [new function]
       │       else → existing cliDriveGraph()
       │
       ├── show <slug> --detailed
       │   └── if --server → GET /detailed via SDK
       │       else → existing getReality() + format
       │
       ├── stop <slug>        ← NEW command
       │   └── --server required → DELETE /execution via SDK
       │
       ├── restart <slug>     ← NEW command
       │   └── --server required → POST /execution/restart via SDK
       │
       └── status <slug>
           └── if --server → GET /execution via SDK
               else → existing getStatus()
```

### Estimated Scope

| Item | Files | Effort |
|------|-------|--------|
| Move SDK to shared | 3 files moved, 2 import updates | Small |
| Add `--server` parent flag | 1 file (positional-graph.command.ts) | Small |
| Server URL discovery | Reuse `readServerInfo()` from `@chainglass/shared/event-popper` — **zero new code** | None |
| `cg wf run --server` | ~80 lines (poll loop + NDJSON synthesis) | Medium |
| `cg wf show --detailed --server` | ~15 lines (GET + format) | Small |
| `cg wf status --server` | ~15 lines (GET + format) | Small |
| `cg wf stop` (new cmd) | ~30 lines | Small |
| `cg wf restart` (new cmd) | ~30 lines | Small |
| Tests | Contract tests update imports | Small |
| **Total** | ~3-4 files changed | **1 phase** |

---

## Quick Reference

```bash
# P0 — Run workflow through web server (auto-discovers port from .chainglass/server.json)
cg wf run test-workflow --server
cg wf run test-workflow --server --json-events --timeout 120

# P0 — Get detailed status from server
cg wf show test-workflow --detailed --server --json

# P1 — Poll execution status
cg wf status test-workflow --server

# P1 — Stop a server-hosted execution
cg wf stop test-workflow --server

# P2 — Restart
cg wf restart test-workflow --server

# Override server URL (non-standard port, remote, or server.json missing)
cg wf run test-workflow --server --server-url http://10.0.0.5:3000

# Override workspace slug (if auto-resolution fails)
cg wf run test-workflow --server --workspace-slug my-workspace

# Environment variable alternative (overrides server.json)
export CG_SERVER_URL=http://localhost:3100
cg wf run test-workflow --server
```

---

## Open Questions

### Q1: Should `--server` be the default eventually?

**OPEN**: Once the REST API covers Tier 2/3 (graph CRUD, node CRUD), `--server` could become the default and `--local` the override. This would unify all paths through the web server. But that's a bigger decision for a future plan.

### Q2: Should `cg wf stop` work without `--server`?

**OPEN**: Could potentially write a signal to the lock file or use a Unix signal to stop a local `cg wf run` in another terminal. But this is niche — Ctrl+C is the normal local stop. Start with server-only.

### Q3: SSE streaming vs polling?

**OPEN**: Server `--json-events` currently polls GET /execution every 2s. A future enhancement could open an SSE connection to the mux endpoint for real-time events. But polling is simpler and good enough for v1.

### Q4: What about `cg wf inspect --server`?

**OPEN**: The inspect command does a deep state dump (inputs, outputs, events). This would need Tier 3 REST endpoints. Defer until those exist.
