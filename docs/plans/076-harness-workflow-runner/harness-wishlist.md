# Harness Improvement Wishlist

**Plan**: 076 — Harness Workflow Runner
**Purpose**: Friction points discovered during dogfooding. Each item is a real problem an agent (or human) hit while trying to use the harness. Fix these and every future session gets faster.

---

## Severity Legend

| Level | Meaning |
|-------|---------|
| 🔴 Blocker | Agent cannot complete task without workaround |
| 🟠 Painful | Agent wastes significant time or makes mistakes |
| 🟡 Friction | Annoying but survivable |
| 🟢 Polish | Would be nice |

---

## Wishlist

### W001 — `just harness cg` not accessible from root justfile
**Severity**: 🔴 Blocker
**Status**: ✅ FIXED (`15dcf305`) — added `just harness-cg` root recipe
**Problem**: The `cg` recipe lives in `harness/justfile` but the root justfile's `harness` recipe delegates to the harness CLI (`pnpm exec tsx src/cli/index.ts`), not to the harness justfile. An agent running `just harness cg wf show ...` gets `error: unknown command 'cg'`. The only way to use it is `cd harness && just cg ...` which breaks backgrounding and scripting.
**Impact**: Every agent dogfooding workflows will hit this wall. Multiple session hours lost to this already.
**Fix**: Added `just harness-cg` recipe to root justfile that delegates to `cd harness && just cg`.

### W002 — No root-level shortcut for common workflow operations
**Severity**: 🟠 Painful
**Problem**: Running a workflow requires remembering `cd harness && just cg wf run <slug> --server` — too many moving parts. Agents default to curl because it's simpler.
**Impact**: Agents bypass harness → defeats dogfooding purpose → harness never improves.
**Fix**: Root-level `just wf-run <slug>`, `just wf-status <slug>`, `just wf-stop <slug>` that wrap the harness.

### W003 — `cg wf run --server` should return immediately (fire-and-forget)
**Severity**: 🔴 Blocker
**Status**: ✅ FIXED (`15dcf305`) — POST start → print nextSteps → exit 0
**Problem**: `cg wf run --server` blocks the CLI waiting for the workflow to finish. This is wrong — `--server` means the server owns the lifecycle. The CLI should POST to start, print a success message with actionable next steps ("Workflow started. Check progress: `just harness cg wf show <slug> --detailed --server`"), and exit immediately. Only local (non-`--server`) runs should block and stream events.
**Impact**: Agents background the process, can't tell if it's working, can't observe transitions. Natural pattern is "start, then poll" but the CLI fights this.
**Fix**: `--server` mode: POST start → print actionable message with nextSteps → exit 0. Non-`--server` mode: block and stream NDJSON as today.

### W004 — `just cg wf show --detailed --server` output is raw JSON blob
**Severity**: 🟡 Friction
**Problem**: The `--json` flag is auto-added by the recipe. Output is a single-line JSON blob. Hard to read, hard to pipe, hard to grep for a specific node's status.
**Impact**: Agent has to pipe through `python3 -m json.tool` or `jq` every time.
**Fix**: Pretty-print JSON by default (or add a `--pretty` flag). Or: add a human-readable summary line at the top.

### W005 — server.json bind-mount conflict (host PID inside container)
**Severity**: 🔴 Blocker (worked around)
**Problem**: Host's `server.json` gets bind-mounted into container. Contains host PID that's invalid inside container. `readServerInfo()` returns null → `--server` flag fails.
**Workaround**: Justfile auto-injects `--server-url` when `--server` detected. But fragile.
**Fix**: Container should write its own server.json on boot, or discovery should skip PID validation when running inside container (detect via env var).

### W006 — No way to see SSE/live updates from container browser
**Severity**: 🟡 Friction
**Status**: ✅ NOT A BUG — SSE works correctly inside container
**Problem**: WebSocket connection errors in container browser for SSE mux endpoint. Terminal sidecar not connecting. Workflow page doesn't update in real-time inside harness.
**Investigation Result**: SSE mux (`/api/events/mux?channels=workflow-execution`) works perfectly inside the container — verified with `curl -sN`. Events stream correctly with `execution-update` payloads including per-node status. The WebSocket errors seen earlier are from the **terminal sidecar** (port `TERMINAL_WS_PORT`) or **Turbopack HMR**, not the SSE channel. These are cosmetic noise.
**Resolution**: No fix needed. SSE works. Terminal WebSocket errors are separate and harmless.

### W007 — Harness documentation scattered across 3+ locations
**Severity**: 🟡 Friction
**Problem**: Agent needs to check CLAUDE.md, harness/README.md, docs/project-rules/harness.md, and sometimes docs/how/ to understand harness capabilities. No single source of truth.
**Impact**: New agents miss capabilities, experienced agents forget which doc has what.
**Fix**: Single "Harness Quick Reference" card that links to everything, or consolidate into one authoritative guide.

### W008 — `cg wf status --server` crashes on null response
**Severity**: 🟡 Friction
**Status**: ✅ FIXED (`15dcf305`) — spread `{ ...result, errors: [] }`
**Problem**: When no execution is running, `cg wf status --server --json` crashes because the adapter tries to format null.
**Fix**: Spread `errors: []` into all server-mode adapter calls (stop, restart, status).

### W009 — No `just harness cg` recipe in root justfile's help text
**Severity**: 🟡 Friction
**Status**: ✅ FIXED (`15dcf305`) — `just harness-cg` has descriptive comment visible in `just --list`
**Problem**: `just --list` at root doesn't show any `cg` command. Agent has no way to discover it exists without reading docs.
**Fix**: Root `harness-cg` recipe with comment is now visible in `just --list`.

### W010 — Background `just cg wf run` can't be observed alongside status checks
**Severity**: 🟠 Painful
**Status**: ✅ FIXED (moot) — W003 fix makes `run --server` exit immediately, no backgrounding needed
**Problem**: Shell backgrounding (`&`) of `just cg wf run` doesn't work well because the recipe uses `#!/usr/bin/env bash` which changes directory. Status checks in the same shell fail.
**Impact**: Can't do the natural "start in background, poll status in foreground" pattern.
**Fix**: Moot — `run --server` returns immediately. Natural flow is now: `just wf-run slug` then `just wf-status slug`.

---

## Meta-Observations

### The Core Problem
Agents keep bypassing the harness because direct REST/curl is simpler and more reliable. Every friction point above makes the bypass more tempting. The harness must be **easier** than the alternative, not harder.

### The Goal
A new agent arriving cold should be able to:
1. Read one document
2. Run one command to boot
3. Run one command to execute a workflow
4. See clear, streaming output
5. Know exactly what happened and what to do next

We're not there yet. But every item fixed above gets us closer.
