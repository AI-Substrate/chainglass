# Harness Test Run #1 — Retrospective

**Date**: 2026-03-07
**Agent**: Copilot CLI (separate session, zero context)
**Prompt**: `scratch/harness-test-prompt.md`
**Task**: Screenshot audit — boot harness, take 3 viewport screenshots, report findings

## Outcome

**Success**: ✅ Agent completed the task. All 3 screenshots taken, descriptions accurate.

**Time to completion**: ~5 minutes (mostly waiting for cold boot)

## Issues Found

### Issue 1: Port Mismatch (CRITICAL)

The `harness ports` command reports dynamic ports (3159/4659/9281 for this worktree) but Docker was actually bound to the default fallback ports (3100/4600/9222). The agent noted this discrepancy in its final output.

**Root cause**: The `just harness dev` recipe computes ports via `just _ports` and exports them before running `docker compose up`. But if an agent runs `docker compose up -d` directly (or uses the old `just dev` shortcut), no port env vars are set and docker-compose falls back to its `${HARNESS_APP_PORT:-3100}` defaults.

**Fix options**:
1. Generate a `harness/.env` file from `computePorts()` so `docker compose` always has the right ports
2. Add a `harness dev` CLI command that handles this (currently `harness dev` does `dockerUp()` but doesn't set env vars for the compose process)
3. Both — `.env` as persistent state, CLI as the preferred invocation

**Recommended**: Option 3. The `.env` file ensures consistency even for direct `docker compose` usage.

### Issue 2: Boot Wait Flailing (8+ diagnostic steps)

The agent spent 8 tool calls trying to figure out why health was degraded:
1. `harness health` → degraded
2. Read shell output (10s wait)
3. `docker ps` → container exists
4. Poll loop (18 iterations, 10s sleep each!)
5. `docker inspect` → check health state
6. Thinking out loud about what might be wrong
7. Read shell output (20s wait)
8. Read container logs

All of this to answer: "the container is cold-booting, wait 2 minutes."

**Fix**: `harness doctor` command (Workshop 003) — single command with actionable output.

### Issue 3: Prompt Could Be Simpler

The prompt gave explicit `cd harness && pnpm exec tsx src/cli/index.ts` commands. Agents will try to optimize/shortcut these. The prompt should use the simplest invocation:
- `just harness health` instead of the raw tsx command
- `just harness screenshot <name> --viewport <vp>` instead of cd + pnpm exec

The `just harness` alias was built for exactly this purpose.

### Issue 4: No Wait Guidance

The prompt says "wait for health check to show status ok" but doesn't say how long cold boot takes or how to poll. The agent invented its own poll loop (18 iterations × 10s = 3 minutes of polling!).

**Fix**: `harness dev` should block until healthy (it already does this in the CLI command but not in the justfile recipe). Or the prompt should say: "Cold boot takes 2-5 minutes. Run `just harness doctor` to check progress."

## What Worked Well

1. **Harness installed and booted from zero** — first-time `just harness-install` + `just harness dev` worked
2. **Screenshot command worked perfectly** — all 3 viewports captured, correct paths returned
3. **JSON envelope was parseable** — agent correctly read status, data fields, file paths
4. **Agent correctly described the UI** — sidebar, workspaces, nav items all accurately reported
5. **Responsive differences detected** — agent noted mobile collapses to content-first with no sidebar

## Action Items

| Priority | Item | Effort |
|----------|------|--------|
| HIGH | Generate `.env` from `computePorts()` so docker-compose always has correct ports | Small |
| HIGH | Implement `harness doctor` (Workshop 003) | CS-2 |
| MEDIUM | Update prompt to use `just harness` aliases, not raw tsx commands | Trivial |
| MEDIUM | Add cold-boot wait guidance to `docs/project-rules/harness.md` | Trivial |
| LOW | Add `--wait` flag to `harness dev` justfile recipe that blocks until healthy | Small |
