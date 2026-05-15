# How-To: FlowSpace MCP Process Lifecycle

Operational reference for the long-lived `fs2 mcp` integration that backs the
explorer-bar `$` semantic search. Covers the bits that aren't obvious from
reading the code: HMR survival, idle reaping, graph-rebuild handling, the
`> Restart FlowSpace` command, and how to debug a stuck spawn.

**Authoritative design**: [`docs/plans/084-random-enhancements-3/workshops/002-flowspace-mcp-search.md`](../plans/084-random-enhancements-3/workshops/002-flowspace-mcp-search.md)

**Plan**: [`docs/plans/084-random-enhancements-3/flowspace-mcp-search-plan.md`](../plans/084-random-enhancements-3/flowspace-mcp-search-plan.md)

---

## What it is

A per-worktree `fs2 mcp` child process pool, owned by the Next.js Node server
runtime. The pool lives in `apps/web/src/lib/server/flowspace-mcp-client.ts`.

- One child process per worktree path.
- Child loads `.fs2/graph.pickle` once on spawn (~3–15 s on a 397 MB graph).
- Subsequent searches reuse the warm process via JSON-RPC over stdio.
- Pool state pinned to `globalThis.__FLOWSPACE_MCP_POOL__` so dev-mode HMR
  doesn't orphan children.

Replaces the per-keystroke `execFile('fs2 search …')` path that used to time
out on routine queries.

## Lifecycle at a glance

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Pool entry states (per worktree path)                                   │
├─────────────────────────────────────────────────────────────────────────┤
│  idle   →  spawning  →  ready  →  (idle reap or > Restart) → idle       │
│              │                                                          │
│              └── error ── (next user keystroke) ──→ spawning            │
└─────────────────────────────────────────────────────────────────────────┘
```

- **idle**: no entry in the pool for this `cwd`. Next search triggers a spawn.
- **spawning**: child running, MCP `initialize` handshake in progress, graph
  loading. The hook polls every 1 s for status updates; the dropdown shows
  "Loading FlowSpace, please wait…".
- **ready**: serving searches in <300 ms warm.
- **error**: spawn failed (e.g., `fs2` not on PATH). Pool entry retained
  briefly; the next search clears it and respawns.

## HMR persistence — why `globalThis`?

Next.js dev mode reloads server modules on every save. A naive
`Map<string, FlowspaceProcess>` declared at module scope would be re-created
on each HMR cycle, orphaning the previously-spawned `fs2 mcp` children.

The fix is the standard Next.js pattern (used by Prisma, our
`WorkflowExecutionManager`, etc.):

```ts
declare global {
  var __FLOWSPACE_MCP_POOL__: Map<string, FlowspaceProcess> | undefined;
}
const pool = (globalThis.__FLOWSPACE_MCP_POOL__ ??= new Map());
```

Same pattern for the idle reaper interval and the test transport-factory
seam. Production builds run a single Node process anyway, so the global is
harmless there.

**Verify it's working**: After several `apps/web/**/*.ts` saves in dev mode,
run `ps -eo pid,command | grep "fs2 mcp"` — you should see at most **one**
process per active worktree, not one per save.

## Idle reaping

The pool runs a single `setInterval` (also pinned to `globalThis`) every
60 s. Any process that meets all of:

- `inflight === 0` (no search currently in flight), AND
- `Date.now() - lastUsedAt > FLOWSPACE_IDLE_MS` (default: 10 min),

gets `client.close()`d. The transport's `onclose` handler removes the entry
from the pool. The next search after a reap re-spawns the child — the user
sees one extra "Loading FlowSpace…" cycle.

**Override the threshold**: set `FLOWSPACE_IDLE_MS` in the env (in ms). For
example, `FLOWSPACE_IDLE_MS=1800000` for 30 minutes.

The reaper interval calls `.unref()` so it won't keep Node alive on its own
during shutdown.

## Graph rebuild detection (mtime recycle)

Before each search, the pool stat-checks the worktree's `.fs2/graph.pickle`.
If the on-disk mtime has advanced past the value captured at spawn time, the
process is closed (`client.close()`) and the next search respawns it against
the fresh graph.

Effect on the user: after running `fs2 scan` in a terminal, the next `$`
search shows "Loading FlowSpace, please wait…" for one cycle, then warm
again.

The displayed "indexed N min ago" comes from the on-disk mtime (NOT the
captured-at-spawn mtime — see Q-S3 in the spec for the rationale).

## `> Restart FlowSpace` SDK command

Registered in `apps/web/src/features/041-file-browser/sdk/register.ts` as
`file-browser.restartFlowspace` ("Restart FlowSpace"). Available from the
`>` command palette.

Reads the current worktree from `?worktree=` in the URL, calls
`restartFlowspaceAction(cwd)` which delegates to `shutdownFlowspace(cwd)`
in the MCP client. The next `$` search triggers a fresh "Loading FlowSpace…"
cycle.

Use it when:

- Suspecting the in-memory graph is stale (you ran `fs2 scan` and want to be
  sure the next search uses the new graph without waiting for the recycle to
  happen on the very next keystroke).
- You see persistent errors and want a clean handle.
- You're doing something memory-sensitive and want to free the ~400 MB
  immediately.

## Debugging a stuck spawn

Symptoms: dropdown shows "Loading FlowSpace, please wait…" indefinitely,
then errors with "FlowSpace did not start in time" after 30 s.

Checks:

1. **Is `fs2` actually on PATH inside the Next.js server process?** The
   `command -v fs2` check at availability time runs in the Node process — if
   the process was launched from a shell where `fs2` isn't on PATH (e.g.,
   inside a container without it), it never spawns. Logs:
   `[flowspace-mcp] fs2 not found:`.
2. **Is `.fs2/graph.pickle` present in the worktree root?** Check the
   per-worktree path, not the repo root. If missing, the dropdown shows the
   "Run `fs2 scan`" branch instead of attempting to spawn.
3. **Is the graph corrupted?** Try `fs2 search foo --mode auto` from the
   worktree's terminal. If it hangs or errors, fix that first; the MCP path
   wraps the same binary.
4. **Is the child running but hanging on graph load?** `ps -eo pid,command |
   grep "fs2 mcp"` to confirm the child exists. If it does and the spawn
   doesn't resolve in 30 s, the graph may be too big for the configured
   ceiling — raise `SEARCH_CEILING_MS` (currently 30 s) or split the graph.

Logs to look for in the Next.js server output:

| Prefix log line | Meaning |
|-----------------|---------|
| `[flowspace-mcp] spawn ready { ms: N }` | Cold start completed in N ms |
| `[flowspace-mcp] spawn error { error }` | Spawn failed; pool entry marked error |
| `[flowspace-mcp] search ok { ms, results }` | Warm search returned |
| `[flowspace-mcp] graph mtime advanced — recycling` | Graph rebuild detected |
| `[flowspace-mcp] idle reap { idleMs }` | Idle process being closed |
| `[flowspace-mcp] process exited { cwd }` | Child died (crash or close) |
| `[flowspace-mcp] shutdown requested` | Manual `> Restart FlowSpace` triggered |

## Test seams

`flowspace-mcp-client.ts` exports:

- `setFlowspaceTransportFactory(factory)` — replaces the default
  `StdioClientTransport` factory with a custom one. Tests pair it with
  `InMemoryTransport.createLinkedPair()` and a fake `Server` that responds to
  `tools/call` with canned envelopes. Pass `undefined` to restore the default.
- `__clearFlowspacePool()` — clears the in-memory pool. Use **after**
  `shutdownAllFlowspace()` in test teardown.
- `shutdownAllFlowspace()` — closes every pooled client and drains the pool.

Unit tests live at:
`test/unit/web/features/041-file-browser/flowspace-mcp-client.test.ts`

Env-gated integration test (real `fs2 mcp`) lives at:
`test/integration/web/flowspace-mcp.integration.test.ts` — skipped when `fs2`
is not on PATH.
