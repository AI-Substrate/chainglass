# Exploration: Windows Compatibility

**Date**: 2026-04-13
**Branch**: main @ c98a5eaf
**Scope**: Full codebase audit for Linux/Mac → Windows portability

---

## Executive Summary

The project was built exclusively for Unix (macOS/Linux). Windows compatibility issues fall into **5 severity tiers**, from blocking (can't even start the dev server) down to cosmetic. The core web app (Next.js + React) is inherently cross-platform, but the **dev tooling layer** and **terminal feature** are deeply Unix-bound.

---

## Tier 1 — BLOCKING: Can't Start Dev Server

These prevent `just dev` and basic development on Windows.

### 1.1 justfile `dev` recipe (lines 21-40)
- `#!/usr/bin/env bash` shebang — `just` on Windows needs bash available or recipes rewritten
- `lsof -ti TCP:$p` — no Windows equivalent without PowerShell rewrite
- `ps -p $PID -o command=` — Unix process inspection
- `kill $PID` / `kill -0` — Unix signal-based process management
- `node-pty` prebuild check: `/bin/echo`, `/tmp` — hardcoded Unix paths
- `chmod +x` on darwin-arm64 spawn-helper
- `set -euo pipefail` — bash-only

### 1.2 node-pty native module
- Runtime import at `apps/web/src/features/064-terminal/server/terminal-ws.ts:319-326`
- Listed as devDependency but used at runtime
- Prebuild check in justfile references `darwin-arm64` only — no `win32-x64` prebuild verification
- node-pty DOES support Windows (via winpty/conpty) but needs correct prebuilds installed

### 1.3 Terminal WebSocket server
- `apps/web/src/features/064-terminal/server/tmux-session-manager.ts` — entire module assumes `tmux` binary exists
- `tmux new-session`, `tmux send-keys`, `tmux kill-session` throughout
- Fallback shell is `/bin/bash` (line 66-70)
- `apps/web/src/features/064-terminal/server/tmux-monitor.ts` — tmux-only subprocess

---

## Tier 2 — BLOCKING: Core Package Build/Run

### 2.1 positional-graph script-runner.ts (lines 20-25, 69-75)
- `spawn('bash', ['-c', script])` — hardcoded bash for workflow script execution
- `process.kill(-pid, 'SIGTERM')` — negative PID (process group kill) is Unix-only, throws on Windows

### 2.2 positional-graph package.json build script
- `cp .../*.md .../` — Unix shell `cp` command in build script

### 2.3 workunit.service.ts (lines 257-260)
- Generates `#!/bin/bash` script templates for work units

### 2.4 copilot-cli.adapter.ts (lines 62-63)
- `process.env.HOME` only — should also check `USERPROFILE` / `HOMEPATH` on Windows

---

## Tier 3 — SIGNIFICANT: Dev Tooling Unusable

### 3.1 justfile — Nearly Every Recipe
Almost all multi-line recipes use bash shebangs and Unix commands:
- `dev`, `dev-https`, `dev-terminal` — bash + lsof + kill
- `wf-run/status/stop/restart/reset/logs/watch` — bash + grep
- `preflight` — bash + find + kill -0 + curl
- `harness-require` — bash + curl
- `install` — chmod
- `clean`, `clean-next`, `reset` — rm -rf
- `test-feature`, `test-watch` — find + tr
- `smoke-test-agent`, `code-review-agent`, `agent-resume` — POSIX env assignment syntax

### 3.2 Shell Scripts (all .sh files)
All are bash-only:
- `script.sh`, `scripts/chainglass-bell.sh`
- `scripts/explore/copilot-tmux-sessions.sh`
- `scripts/agents/copilot-session-demo.sh`
- `harness/entrypoint.sh`, `harness/start-chromium.sh`

### 3.3 Harness System
- `harness/justfile` — bash recipes
- `harness/bin/harness` — bash wrapper script
- `harness/Dockerfile` — Linux-only (this is expected for Docker, works via Docker Desktop)
- `harness/src/seed/seed-workspace.ts` — `sh -c` + `/root/.config/` paths (container-internal, acceptable)

---

## Tier 4 — MINOR: Edge Cases

### 4.1 File permission bits
- `user-config.ts:83,101` — `0o755`, `0o644` mode bits (no-op on Windows NTFS but won't error)
- `seed-hooks.ts:15-34` — `chmodSync(..., 0o755)` + generates `#!/bin/bash` hook scripts
- `execution-registry.ts:26-30` — POSIX mode bits

### 4.2 Line ending assumptions
- tmux output parsing uses `.split('\n')` — would need `\r\n` handling if tmux were available on Windows (it isn't, so moot)

### 4.3 Hardcoded paths in test/demo scripts
- `scripts/agents/test-model-tokens-copilot.ts:253,263` — `/Users/...`
- `scripts/agents/test-model-tokens-claude.ts:244-249` — `/Users/...`
- `scripts/test-copilot-cli-adapter.ts:38` — `process.env.HOME ?? '~'`
- `scripts/session-watcher.ts:208-209` — tmux commands

### 4.4 CI — no Windows matrix
- `.github/workflows/ci.yml` — only `ubuntu-latest`

---

## Tier 5 — NON-ISSUES (Already Cross-Platform)

- **Next.js web app** — React components, CSS, client-side code: all cross-platform
- **pnpm-workspace.yaml** — cross-platform
- **turbo.json** — cross-platform
- **tsconfig.json** files — cross-platform
- **vitest.config.ts** — cross-platform
- **biome.json** — cross-platform
- **Docker/harness** — runs in Docker container (Linux), accessible via Docker Desktop on Windows — this is by design
- **patches/** — no path issues
- **.npmrc** — cross-platform

---

## Recommended Strategy

### Option A: "Windows via WSL" (Low effort)
Document that Windows users should use WSL2. Everything works as-is inside WSL. This is what most Node.js projects with Unix tooling do.

**Pros**: Zero code changes, immediate, battle-tested
**Cons**: Not native Windows, requires WSL setup

### Option B: "Native Windows Support" (High effort)
Rewrite all tooling to be cross-platform:
1. Replace justfile bash recipes with PowerShell equivalents or cross-platform Node scripts
2. Make script-runner.ts use `cmd.exe` / `powershell.exe` on Windows
3. Replace tmux with conpty-based terminal multiplexing on Windows
4. Fix all `process.env.HOME` → use `os.homedir()`
5. Add Windows prebuilds for node-pty
6. Add Windows CI matrix

**Pros**: True native support
**Cons**: Massive effort, tmux replacement is a project unto itself

### Option C: "Hybrid" (Medium effort)
1. Ensure the core app (Next.js dev server) can start on Windows natively
2. Use cross-platform alternatives where easy (os.homedir(), cross-env, etc.)
3. Document WSL for advanced features (terminal/tmux, harness, workflow scripts)
4. Add a `just dev-windows` recipe using PowerShell

**Pros**: Unblocks basic development on Windows, pragmatic
**Cons**: Some features still require WSL

---

## Experimental Verification (Windows 11, this machine)

### Environment
- `just 1.48.1` — installed ✅
- `node v25.9.0` — installed ✅
- `pnpm` — NOT on PATH initially, installed via corepack ✅ (9.15.4)
- `docker` — NOT installed ❌
- Git Bash at `C:\Program Files\Git\usr\bin\` — has `sh`, `bash`, `kill`, `ps` but **NOT** `lsof`
- WSL2 — available (`C:\Windows\system32\bash.exe` → GNU bash 5.2.21 linux-gnu)

### What Works
1. `pnpm install --ignore-scripts` — ✅ completes in ~3.5 min
2. `pnpm turbo build` — ❌ fails at `@chainglass/positional-graph` due to `cp` command
3. `just default` — ❌ fails without `sh` on PATH ("program not found")
4. `just default` with Git Bash on PATH — ✅ works
5. Cross-platform `node -e` copy — ✅ verified as `cp` replacement

### Key Findings
- `just` on Windows needs `sh.exe` on PATH — Git Bash provides this
- Git Bash does NOT have `lsof` — the `dev` recipe's port detection won't work
- The `cp` in positional-graph build is the **first hard blocker** after install
- WSL bash is available as a fallback but adds complexity

---

## Key Decision Points

1. **What's the target?** Full native Windows? Or "dev server runs, use WSL for the rest"?
2. **Terminal feature**: tmux has NO Windows equivalent. Options: skip terminal on Windows, use conpty directly (loses multiplexing), or require WSL.
3. **Workflow execution**: script-runner.ts spawns bash. On Windows: use PowerShell? cmd? Require WSL?
4. **Harness**: Docker-based, so it works on Windows via Docker Desktop — no changes needed.
