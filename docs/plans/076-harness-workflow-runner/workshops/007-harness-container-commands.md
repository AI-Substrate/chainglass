# Workshop: Executing CG Commands Inside the Harness Container

**Type**: Integration Pattern
**Plan**: 076-harness-workflow-runner
**Spec**: [harness-workflow-runner-spec.md](../harness-workflow-runner-spec.md)
**Created**: 2026-03-23
**Status**: Draft

**Related Documents**:
- [Workshop 006 — CG CLI Server Mode](006-cg-cli-server-mode.md) (--server flag design)
- [harness/README.md](../../../../harness/README.md) (harness architecture)
- [harness/Dockerfile](../../../../harness/Dockerfile) (container build)

**Domain Context**:
- **Primary Domain**: `_(harness)_` (container execution infrastructure)
- **Related Domains**: `_platform/positional-graph` (CG CLI commands)

---

## Purpose

Design how agents execute `cg` CLI commands **inside the harness Docker container**, so they can create workflows, run them via `--server`, observe progress, and verify results — all against the container's web server. This is the missing link between "CG CLI has --server mode" and "the harness can prove it works end-to-end."

## Key Questions Addressed

- How does an agent run `cg wf create` inside the container today?
- What does a `just harness cg` convenience command look like?
- How does `--server` mode auto-discover the container's server.json?
- How does an agent combine CLI commands with Playwright visual verification?
- What's the full end-to-end flow: create → run → observe → stop → verify?

---

## Current State

### What Already Works

The harness already has full `docker exec` infrastructure:

```
┌──────────────────────────────────────────────────────────┐
│ Host (agent runs here)                                    │
│                                                          │
│  runCg(['wf', 'show', 'test-workflow'], {                │
│    target: 'container',                                  │
│    containerName: 'chainglass-074-actaul-real-agents'     │
│  })                                                      │
│    ↓                                                     │
│  docker exec chainglass-074-... \                        │
│    node /app/apps/cli/dist/cli.cjs \                     │
│    wf show test-workflow --json                           │
│                                                          │
│ spawnCg(['wf', 'run', 'test-workflow', '--json-events'], │
│   { target: 'container', ... })                          │
│    ↓                                                     │
│  docker exec chainglass-074-... \                        │
│    node /app/apps/cli/dist/cli.cjs \                     │
│    wf run test-workflow --json-events                     │
└──────────────────────────────────────────────────────────┘
```

**Key facts**:
- CLI is at `/app/apps/cli/dist/cli.cjs` inside the container (not globally installed)
- Container name: `chainglass-${worktreeName}` (e.g., `chainglass-074-actaul-real-agents`)
- Workspace path inside container: `/app/scratch/harness-test-workspace/`
- Workspace registry at `/root/.config/chainglass/workspaces.json`
- `DISABLE_AUTH=true` in container env — no auth needed
- Source code bind-mounted at `/app` from host repo

### What's Missing

| Gap | Impact |
|-----|--------|
| No `just harness cg` shortcut | Agents must know `docker exec` + container name + CLI path |
| No `--server` awareness inside container | `server.json` is at `/app/apps/web/.chainglass/server.json`, not `/app/.chainglass/` |
| No dedicated harness command for `cg wf` operations | Each harness agent reinvents the plumbing |
| No combined CLI + Playwright recipe | Agents don't know how to create → run → screenshot → verify |

---

## Design: `just harness cg` Command

### The Command

```bash
# Run any cg command inside the container
just harness cg wf create my-workflow
just harness cg wf show my-workflow --detailed --json
just harness cg wf run my-workflow --server --json-events
just harness cg wf stop my-workflow
just harness cg wf status my-workflow --server

# Arbitrary cg subcommands work too
just harness cg unit list --json
just harness cg template list --json
```

### Justfile Recipe

```bash
# Execute a cg CLI command inside the harness container
cg *args:
    #!/usr/bin/env bash
    set -euo pipefail
    eval "$(just _ports)"
    CONTAINER="chainglass-${HARNESS_WORKTREE}"
    docker exec "$CONTAINER" node /app/apps/cli/dist/cli.cjs \
      --workspace-path /app/scratch/harness-test-workspace \
      {{args}}
```

**Why `--workspace-path` is hardcoded**: Inside the container, the workspace is always at `/app/scratch/harness-test-workspace/`. The agent doesn't need to know or specify this — it's the seeded test workspace.

### Harness CLI Command

For programmatic use (harness agents, scripts), add a `cg` command to the harness CLI:

```typescript
// harness/src/cli/commands/cg-exec.ts

workflow
  .command('cg')
  .description('Execute a cg CLI command inside the harness container')
  .argument('<args...>', 'Arguments to pass to cg')
  .action(async (args: string[], opts) => {
    const execOptions = buildExecOptions({ target: 'container' });
    const result = await runCg(args, execOptions);
    // Pass through stdout/stderr, exit with same code
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    process.exit(result.exitCode);
  });
```

Or simpler — just expose `runCg` with container target as a reusable function:

```typescript
export async function runCgInContainer(args: string[]): Promise<CgExecResult> {
  const execOptions = buildExecOptions({ target: 'container' });
  return runCg(args, execOptions);
}
```

---

## How `--server` Works Inside the Container

### Server.json Location

The web server inside the container writes `server.json` to its `process.cwd()`, which is `/app/apps/web/`:

```
Container filesystem:
/app/
├── apps/web/
│   └── .chainglass/
│       └── server.json  ← { port: 3100, pid: 42, localToken: "...", startedAt: "..." }
├── scratch/
│   └── harness-test-workspace/
│       └── .chainglass/
│           └── data/workflows/...
└── ...
```

### Discovery Inside Container

When `cg wf run test-workflow --server` runs inside the container:

1. `resolveOrOverrideContext('workspace-path')` resolves workspace context (slug + worktreePath)
2. `discoverServerContext()` calls `readServerInfo(worktreePath)` → misses (no `server.json` in scratch dir)
3. Falls back to `readServerInfo(join(cwd, 'apps', 'web'))` → **finds it** at `/app/apps/web/.chainglass/server.json`
4. Reads port + localToken → constructs SDK client → calls REST API

**This already works** — the `discoverServerUrl()` pattern from event-popper-client.ts has the two-location fallback built in:

```typescript
const info = readServerInfo(cwd) ?? readServerInfo(join(cwd, 'apps', 'web'));
```

The `--workspace-path` flag sets `cwd` for workspace resolution, but server discovery looks at both paths. Inside the container, `cwd` is `/app` (the WORKDIR), so `join('/app', 'apps', 'web')` → `/app/apps/web/` → finds `server.json`.

### Port Inside Container

Inside the container, the server runs on `PORT=3100` (or whatever `HARNESS_APP_PORT` is set to). But `cg --server` doesn't need to know — `server.json` tells it. The SDK calls `http://localhost:3100` from within the container. No port mapping confusion.

---

## End-to-End Agent Flow

Here's the complete recipe an agent would follow:

```
┌─────────────────────────────────────────────────────────────┐
│ PHASE 1: Setup                                              │
│                                                             │
│  just harness dev              # Boot container (~2 min)    │
│  just harness seed             # Create test workspace      │
│  just harness health           # Verify all systems up      │
│                                                             │
│ PHASE 2: Build workflow via CLI                             │
│                                                             │
│  just harness cg wf create my-test                          │
│  just harness cg wf node add my-test line-xxx test-agent    │
│  just harness cg wf line add my-test --label "Processing"   │
│  just harness cg wf node add my-test line-yyy test-code     │
│                                                             │
│ PHASE 3: Run via --server (user sees it in browser!)        │
│                                                             │
│  just harness cg wf run my-test --server --json &           │
│  # fire-and-forget: workflow drives on server               │
│                                                             │
│ PHASE 4: Observe progress                                   │
│                                                             │
│  just harness cg wf show my-test --detailed --server --json │
│  just harness cg wf status my-test --server --json          │
│                                                             │
│ PHASE 5: Visual verification via Playwright                 │
│                                                             │
│  just harness screenshot workflow-my-test                    │
│  # → captures browser view of running workflow              │
│                                                             │
│ PHASE 6: Stop / restart                                     │
│                                                             │
│  just harness cg wf stop my-test                            │
│  just harness cg wf restart my-test                         │
│                                                             │
│ PHASE 7: Verify final state                                 │
│                                                             │
│  just harness cg wf show my-test --detailed --server --json │
│  just harness screenshot workflow-final                      │
└─────────────────────────────────────────────────────────────┘
```

---

## Implementation Scope

### Option A: Justfile Only (Minimal)

Add one recipe to `harness/justfile`:

```bash
# Execute cg CLI command inside container
cg *args:
    #!/usr/bin/env bash
    set -euo pipefail
    eval "$(just _ports)"
    CONTAINER="chainglass-${HARNESS_WORKTREE}"
    docker exec "$CONTAINER" node /app/apps/cli/dist/cli.cjs \
      --workspace-path /app/scratch/harness-test-workspace \
      {{args}}
```

**Effort**: 5 lines. Agents use `just harness cg <anything>`.

### Option B: Justfile + Harness CLI Helper (Recommended)

Add the justfile recipe PLUS a `runCgInContainer()` export from the harness:

```typescript
// harness/src/test-data/cg-runner.ts — already has runInContainer()
// Just need to export a convenience wrapper:

export async function runCgInContainer(args: string[]): Promise<CgExecResult> {
  return runCg(args, {
    target: 'container',
    containerName: `chainglass-${computePorts().worktree}`,
    workspacePath: '/app/scratch/harness-test-workspace',
  });
}
```

**Effort**: Justfile recipe + 5-line export. Agents and harness commands both benefit.

### Option C: Full Harness Command (Future)

Add `harness cg <args>` as a proper Commander.js command with envelope output, error handling, timeout, etc. Same pattern as `harness workflow run`.

**Effort**: ~30 lines. Overkill for now — Option B is enough.

---

## Workspace Registration Prerequisite

Before `--server` mode works inside the container, the workspace must be registered. `just harness seed` already handles this by:

1. Creating `scratch/harness-test-workspace/` with `git init`
2. Writing workspace entry to `/root/.config/chainglass/workspaces.json` inside the container via `docker exec`

**If seed hasn't run**: The REST endpoints return `400 Invalid workspace or worktree`. DYK #3 from Subtask 002 catches this with an actionable error message.

---

## Quick Reference

```bash
# Boot + seed (first time or after container rebuild)
just harness dev
just harness seed

# Run cg commands inside container
just harness cg wf create jordo-test
just harness cg wf node add jordo-test line-xxx test-user-input
just harness cg wf show jordo-test --detailed --json
just harness cg wf run jordo-test --server --json
just harness cg wf status jordo-test --server --json
just harness cg wf stop jordo-test
just harness cg wf restart jordo-test

# Visual verification
just harness screenshot workflow-jordo-test

# Existing harness workflow commands (harness-specific, not cg)
just harness workflow reset
just harness workflow run --server --verbose
just harness workflow status --server
just harness workflow logs --errors
```

---

## Open Questions

### Q1: Should `just harness cg` auto-seed if workspace is missing?

**OPEN**: Could check if `scratch/harness-test-workspace/` exists and auto-run `just harness seed` if not. Saves agents a step but adds ~30s on first run.

### Q2: Should `just harness cg` auto-build CLI if stale?

**OPEN**: `runCg()` already has `checkBuildFreshness()` that throws if CLI bundle is stale. The justfile recipe could catch this and suggest `just build`. Or auto-build.

### Q3: Should the container have `cg` as a global command?

**OPEN**: Could add `RUN ln -s /app/apps/cli/dist/cli.cjs /usr/local/bin/cg` to the Dockerfile. Simplifies `docker exec` from `node /app/apps/cli/dist/cli.cjs` to just `cg`. But the CLI bundle lives on the host bind mount and may not be built yet at container start time.
