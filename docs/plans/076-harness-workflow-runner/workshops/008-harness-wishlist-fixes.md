# Workshop: Harness Wishlist Fixes

**Type**: Integration Pattern
**Plan**: 076-harness-workflow-runner
**Spec**: [harness-workflow-runner-spec.md](../harness-workflow-runner-spec.md)
**Created**: 2026-03-24
**Status**: Draft

**Related Documents**:
- [Harness Wishlist](../harness-wishlist.md) — raw friction points
- [Workshop 007: Container Commands](007-harness-container-commands.md) — `harness-cg` design

**Domain Context**:
- **Primary Domain**: _(harness)_ — external tooling, not a registered domain
- **Related Domains**: _platform/positional-graph (CLI), workflow-ui (REST API)

---

## Purpose

Design fixes for the 10 harness wishlist items discovered during Plan 076 dogfooding. Group related items into batches, triage what's already fixed, and provide implementation-ready designs for the remaining items.

## Triage: What's Fixed vs Open

| ID | Description | Severity | Status | Fixed In |
|----|-------------|----------|--------|----------|
| W001 | `just harness cg` not in root justfile | 🔴 | ✅ FIXED | `15dcf305` — added `just harness-cg` |
| W002 | No root-level workflow shortcuts | 🟠 | OPEN | — |
| W003 | `run --server` blocks instead of fire-and-forget | 🔴 | ✅ FIXED | `15dcf305` — POST+exit, nextSteps |
| W004 | JSON output is unreadable single-line blob | 🟡 | OPEN | — |
| W005 | server.json bind-mount PID conflict | 🔴 | ⚠️ WORKED AROUND | justfile `--server-url` injection |
| W006 | No SSE/live updates in container browser | 🟡 | OPEN | — |
| W007 | Docs scattered across 3+ locations | 🟡 | OPEN | — |
| W008 | `status --server` crashes on null | 🟡 | ✅ FIXED | `15dcf305` — `{ ...result, errors: [] }` |
| W009 | `harness-cg` not in `just --list` help | 🟡 | ✅ FIXED | `15dcf305` — recipe has comment |
| W010 | Background run can't be observed | 🟠 | ✅ FIXED | Moot — fire-and-forget (W003 fix) |

**5 fixed, 1 worked around, 4 open.**

---

## Open Items: Batched by Effort

### Batch A: Quick Wins (< 30 min each)

- **W002** — Root-level workflow shortcuts
- **W004** — Pretty JSON output

### Batch B: Container Infrastructure (~ 1 hour)

- **W005** — Proper container detection for server.json

### Batch C: Investigation Required (scope TBD)

- **W006** — SSE/live updates in container
- **W007** — Documentation consolidation

---

## Batch A: Quick Wins

### W002 — Root-Level Workflow Shortcuts

**Problem**: Agents need to remember `just harness-cg wf run test-workflow --server`. Too many tokens. Muscle memory never forms.

**Design**: Add 4 top-level recipes to root justfile that wrap `harness-cg`:

```just
# Workflow shortcuts (Plan 076) — fire-and-forget via harness container
# Usage: just wf-run test-workflow, just wf-status test-workflow

# Start a workflow (returns immediately with next steps)
wf-run slug:
    just harness-cg wf run {{slug}} --server

# Show per-node workflow status
wf-status slug:
    just harness-cg wf show {{slug}} --detailed --server

# Stop a running workflow
wf-stop slug:
    just harness-cg wf stop {{slug}}

# Restart a workflow (reset + start fresh)
wf-restart slug:
    just harness-cg wf restart {{slug}}
```

**Usage after fix**:
```bash
just wf-run test-workflow       # Start
just wf-status test-workflow    # Poll
just wf-stop test-workflow      # Stop
just wf-restart test-workflow   # Reset + start
```

**Why these 4?** These are the lifecycle commands an agent uses every session. Create/show/node-add are setup commands that happen less often — `harness-cg` is fine for those.

**Decision D1**: Should we also add `wf-reset` (wraps `just harness workflow reset`)?

**OPEN**: Leaning yes — `just wf-reset` is the "start from scratch" command. But it's a different path (`harness workflow` not `harness-cg`), which might confuse.

**Proposed**: Yes, add it. One more line:
```just
# Reset workflow (clean + recreate test data)
wf-reset:
    just harness workflow reset
```

---

### W004 — Pretty JSON Output

**Problem**: `just harness-cg` auto-adds `--json`. Output is a compact single-line blob like:

```
{"success":true,"command":"wf.show","timestamp":"2026-03-23T22:15:45.561Z","data":{"slug":"test-workflow","execution":{"status":"pending","totalNodes":4,"completedNodes":0,"progress":"0%"},"lines":[...]}}
```

Agents pipe through `| python3 -m json.tool` or `| jq .` every time.

**Options**:

| Option | Approach | Pros | Cons |
|--------|----------|------|------|
| A | `--pretty` flag on CLI | Clean, opt-in | Must thread through Commander.js parent opts |
| B | Pipe `| jq .` in justfile recipe | Zero CLI changes | Requires `jq` installed in container |
| C | `JSON.stringify(data, null, 2)` always | Simplest change | Breaks NDJSON consumers, larger output |
| D | Justfile pipes through `node -e` | No deps, no CLI change | Ugly recipe, fragile |

**Recommended: Option A** — `--pretty` flag on `cg wf` parent command.

**Implementation**:

1. Add `--pretty` option to the `wf` parent command in `positional-graph.command.ts`:
```typescript
wf.option('--pretty', 'Pretty-print JSON output (when --json is active)');
```

2. Thread it through to `createOutputAdapter()`:
```typescript
// In command-helpers.ts
export function createOutputAdapter(json: boolean, pretty?: boolean): IOutputAdapter {
  return json ? new JsonOutputAdapter(pretty) : new ConsoleOutputAdapter();
}
```

3. In `JsonOutputAdapter.format()`, use indentation:
```typescript
format<T extends BaseResult>(command: string, result: T): string {
  // ...existing envelope logic...
  return this.pretty
    ? JSON.stringify(response, null, 2)
    : JSON.stringify(response);
}
```

4. Update harness justfile `cg` recipe to add `--pretty`:
```bash
docker exec "$CONTAINER" node /app/apps/cli/dist/cli.cjs \
  {{ARGS}} \
  --workspace-path /app/scratch/harness-test-workspace \
  --json --pretty \
  $EXTRA_FLAGS
```

**Result**: `just harness-cg` output becomes readable by default. Direct `cg --json` stays compact for programmatic consumers. Best of both worlds.

**Decision D2**: Should `--pretty` also affect NDJSON (`--json-events`)? **No** — NDJSON must be one JSON object per line for stream parsing.

---

## Batch B: Container Infrastructure

### W005 — server.json Bind-Mount PID Conflict (Proper Fix)

**Problem**: Host writes `server.json` with its own PID. Container bind-mounts the same file. `readServerInfo()` does `kill(pid, 0)` — the host PID doesn't exist inside the container, so it returns null. The `--server` flag fails.

**Current workaround**: Justfile regex-matches `--server|wf stop|wf restart` and auto-injects `--server-url http://localhost:${HARNESS_APP_PORT}`.

**Why the workaround is fragile**: Any new server-mode command must be added to the regex. Agents writing custom scripts won't get the injection. The pattern is "routing around a bug" rather than fixing the bug.

**Design: Container-Aware Discovery**

Three-layer fix:

#### Layer 1: Container Detection Env Var

Add `CHAINGLASS_CONTAINER=true` to `docker-compose.yml`:

```yaml
environment:
  - NODE_ENV=development
  - DISABLE_AUTH=true
  - CHAINGLASS_CONTAINER=true       # ← NEW: container detection
  - PORT=${HARNESS_APP_PORT:-3100}
```

#### Layer 2: Skip PID Validation in Container

In `readServerInfo()` (port-discovery.ts):

```typescript
export function readServerInfo(worktreePath: string): ServerInfo | null {
  // ...file check, schema validation...
  
  // In container: skip PID checks (host PID meaningless here)
  const inContainer = process.env.CHAINGLASS_CONTAINER === 'true';
  if (!inContainer) {
    if (!isPidAlive(info.pid)) return null;
    // ...PID recycling guard...
  }
  
  return info;
}
```

#### Layer 3: Container Writes Own server.json

The container's Next.js already writes `server.json` via `instrumentation.ts`. But the bind mount means the host's file overwrites it. Fix: container writes to a different path.

**Option A**: Container writes to `/tmp/chainglass-server.json`, discovery checks both paths.
**Option B**: `discoverServerContext()` in CLI checks `CHAINGLASS_CONTAINER` and uses `PORT` env var directly, bypassing server.json entirely.

**Recommended: Layer 1 + 2** (env var + skip PID). Simple, low risk, fixes the root cause. Layer 3 is over-engineering — the justfile workaround handles the remaining edge case.

**Decision D3**: Do we also remove the justfile `--server-url` injection after this fix?

**RESOLVED: No.** Keep both. Belt and suspenders. The justfile injection is a safety net. The env var fix makes `readServerInfo()` work correctly inside the container. If both agree, great. If one fails, the other catches it.

---

## Batch C: Investigation Required

### W006 — SSE/Live Updates in Container Browser

**Problem**: Playwright browser inside the container shows WebSocket connection errors. The workflow page doesn't update in real-time during execution.

**Root Cause Analysis**:

The SSE mux endpoint (`/api/events/mux`) uses **Server-Sent Events** (not WebSocket). The terminal sidecar uses **WebSocket** but that's a separate concern. The SSE connection itself should work — it's plain HTTP streaming.

**Investigation Steps** (for the implementing agent):

1. **Check SSE connection**: Open browser devtools in container → Network → filter EventSource. Is `/api/events/mux?channels=workflow-execution` connected?

2. **Check terminal WebSocket**: The WebSocket errors may be from the terminal sidecar, not SSE. Terminal WS runs on `TERMINAL_WS_PORT` — verify the container is binding it correctly.

3. **Check Next.js HMR**: Turbopack HMR also uses WebSocket. Inside the container, HMR WebSocket may fail if the port isn't exposed. This may be the "WebSocket error" agents see — it's harmless noise but confusing.

4. **Proposed quick test**:
```bash
# From inside the container
curl -N -H "Accept: text/event-stream" \
  "http://localhost:${PORT}/api/events/mux?channels=workflow-execution"
```
If this streams events → SSE works, the issue is browser-specific (CORS, WebSocket noise, or React hydration timing).

**Decision D4**: Is this worth fixing now?

**OPEN**: Probably not for Plan 076. SSE works on the host browser. Container browser verification is a nice-to-have for fully containerized CI — but agents can verify via `just harness-cg wf show --detailed --server` (poll) instead of live browser updates.

**Recommendation**: Document as a known limitation. Fix when we add Playwright-based workflow E2E tests to CI.

---

### W007 — Documentation Consolidation

**Problem**: Harness documentation lives in 4 places:

| Location | Content | Audience |
|----------|---------|----------|
| `AGENTS.md` | Rules, commands, wishlist process | Every agent (auto-loaded) |
| `harness/README.md` | Architecture, commands, agents, troubleshooting | Developers |
| `docs/project-rules/harness.md` | Boot, CLI table, error codes, conventions | Developers |
| `docs/how/harness-workflow.md` | Workflow execution guide | Developers |

**The scatter isn't accidental** — each doc serves a different purpose:
- AGENTS.md = **what you MUST do** (auto-loaded by all agents)
- README.md = **how the harness works** (reference)
- project-rules = **contracts and conventions** (reference)
- how-to guide = **step-by-step instructions** (tutorial)

**Design: Don't consolidate. Cross-reference.**

The docs are already well-structured by purpose. Consolidating would create a 500-line monster that's hard to maintain. Instead:

1. **AGENTS.md** already has the harness section with rules and commands. Keep it as the "start here".

2. **Add a navigation block** to each doc pointing to the others:

```markdown
> **Harness Docs**: [Rules & Commands](../../AGENTS.md#the-harness-is-non-negotiable) |
> [Architecture](../../harness/README.md) |
> [Project Rules](../project-rules/harness.md) |
> [Workflow Guide](harness-workflow.md)
```

3. **AGENTS.md is the canonical entry point**. It's auto-loaded. Every other doc is "zoom in for details".

**Decision D5**: Should we add a `docs/how/harness-quick-reference.md` one-pager?

**RESOLVED: No.** AGENTS.md already serves this purpose. Adding another doc makes W007 worse, not better. The fix is better cross-references, not more documents.

---

## Implementation Priority

| Priority | Item | Effort | Impact |
|----------|------|--------|--------|
| 1 | **W002**: Root-level shortcuts | 15 min | 🟠 Every agent saves 10+ keystrokes per command |
| 2 | **W004**: Pretty JSON (`--pretty`) | 30 min | 🟡 Readable output without jq dependency |
| 3 | **W005**: Container detection env var | 20 min | 🔴 Eliminates fragile regex workaround |
| 4 | **W007**: Cross-reference nav blocks | 15 min | 🟡 New agents find docs faster |
| 5 | **W006**: SSE investigation | TBD | 🟡 Defer — poll-based verification works |

**Total estimated: ~80 min for P1-P4.** Could be a single phase or done incrementally.

---

## Decisions Summary

| ID | Question | Status | Decision |
|----|----------|--------|----------|
| D1 | Add `wf-reset` shortcut? | OPEN | Leaning yes |
| D2 | `--pretty` affect NDJSON? | RESOLVED | No — NDJSON must be one object per line |
| D3 | Remove justfile `--server-url` injection after W005 fix? | RESOLVED | No — keep as safety net |
| D4 | Fix W006 (SSE in container) now? | OPEN | Leaning defer |
| D5 | Add harness-quick-reference.md? | RESOLVED | No — AGENTS.md is the entry point |

---

## Quick Reference: What's Fixed, What's Not

```
FIXED:
  ✅ W001  just harness-cg recipe at root
  ✅ W003  run --server fire-and-forget
  ✅ W008  status null crash
  ✅ W009  harness-cg in just --list
  ✅ W010  background observability (moot)

OPEN:
  🔧 W002  Root shortcuts (just wf-run)         → Batch A
  🔧 W004  Pretty JSON (--pretty flag)          → Batch A
  🔧 W005  Container PID detection              → Batch B
  📋 W006  SSE in container                     → Defer
  🔧 W007  Doc cross-references                 → Batch A
```
