# Fix FX001: Deterministic PTY teardown in the terminal sidecar (PTY/`/dev/ttys*` leak)

**Created**: 2026-06-03
**Status**: Proposed
**Plan**: [tmux-plan.md](../tmux-plan.md) — Plan 064, lineage Phase 1 (sidecar WS server)
**Source**: Live incident — macOS PTY exhaustion (`kern.tty.ptmx_max = 511` hit; `openpty()` → "out of pty devices" system-wide). Diagnosed this session: 527 `/dev/ttys*` nodes allocated, dropped to 29 the instant the `terminal-ws` process tree was killed.
**Domain(s)**: terminal (**modify** — internal server lifecycle only; no wire-protocol or consumer-contract change)

---

## Problem

The terminal sidecar (`apps/web/src/features/064-terminal/server/terminal-ws.ts`) spawns **one PTY per WebSocket connection** — a `tmux new-session -A -s <name>` attach client (`tmux-session-manager.ts:103`). node-pty holds that PTY master fd open until `pty.kill()` runs or the process exits. Teardown is wired in exactly one place: `ws.on('close')` → `activePtys.delete(pty); pty.kill()` (`terminal-ws.ts:225-228`). Two gaps make PTYs leak against the kernel ceiling:

1. **In-session leak — no `ws.on('error')` teardown.** Only a clean `close` kills the PTY. A socket that drops via `error` without a matching `close` orphans a live PTY in `activePtys` for the lifetime of the process. The client (`use-terminal-socket.ts`) reconnects aggressively — up to 5 backoff attempts per mount (lines 179-191), a fresh `connect()` (new PTY) on every auth-refresh failure 4401/4403 (lines 160-177), and a new socket on every remount — so tab refreshes, network blips, and token churn steadily accrete orphaned PTYs.

2. **Restart leak (dominant) — tmux attach clients survive a hard kill.** `cleanup()` calls `pty.kill()` then immediately `process.exit(0)` in the same tick with no await (`terminal-ws.ts:235-244, 334-346`), and the handlers are registered only for `SIGTERM`/`SIGINT`. Under `pnpm tsx watch`, a hot-reload that hard-kills the sidecar (SIGKILL, or any other signal) skips `cleanup()` entirely. Because node-pty forks children via `forkpty()` → `setsid()`, the `tmux attach` clients are session leaders detached from the sidecar's controlling terminal — on a hard kill they reparent to launchd/init and **keep running with their slave PTY fds open**. macOS does not promptly reclaim those `/dev/ttys*` nodes, so every edit-save-reload cycle strands a batch until the 511 cap is hit, after which no shell, SSH login, or tmux pane can start anywhere on the machine.

This was confirmed live: `pkill -f terminal-ws.ts` reaped the orphaned attach-clients and the node count fell 527 → 29, restoring `openpty()` immediately — proving the sidecar tree was pinning the nodes.

## Proposed Fix

Make PTY teardown **deterministic across every exit path**, and recover orphans the one path we cannot intercept:

1. Funnel `close` / `error` / `exit` through a single **idempotent** `disposePty(pty)`; add the missing `ws.on('error')` handler. (Vector 1)
2. Harden process-level `cleanup()` to **force-kill** PTY children and run on more signals (`SIGHUP`, `beforeExit`). (graceful restart)
3. **Track spawned PTY child PIDs** in a sidecar-scoped state file and **reap survivors on startup** — covers the un-catchable SIGKILL-from-watcher case. (Vector 2)
4. Add a **defensive max-active-PTY ceiling** + idle reaper so a reconnect storm can never exhaust the host, regardless of leak source.

Critical invariant: the fix kills the **tmux attach client** (the PTY), never `tmux kill-session`. Persistent sessions across refresh/restart are the feature's whole point — only the per-connection client PTYs are leaking.

## Domain Impact

| Domain | Relationship | What Changes |
|--------|-------------|-------------|
| terminal | **modify** | `terminal-ws.ts` lifecycle hardening + new PID-tracking/reaper helper. **Force-kill uses `process.kill(pty.pid, 'SIGKILL')`** — `pid` is already on the public `PtyProcess` contract, so this needs **no contract change**. (If instead `PtyProcess.kill(signal?)` is added, note that `PtyProcess` is exported from `index.ts:16` and classified `contract` in the Domain Manifest — adding an optional param is backward-compatible, but it IS a contract extension and MUST be recorded in `apps/web/src/features/064-terminal/domain.md` History.) No change to the WS wire protocol (`TerminalMessage`), the `createTerminalServer()` public shape, or any consumer-facing React contract. |

## Tasks

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [x] | FX001-1 | Centralize teardown into one idempotent `disposePty(pty)` (delete from `activePtys`, kill once via a `killed`/`disposed` guard). Wire it into `ws.on('close')`, a NEW `ws.on('error')`, and `pty.onExit`. **Track each PTY's activity-log `setInterval` alongside the PTY** (e.g. a `Map<pty, interval>`) so `disposePty` clears the interval on EVERY exit path. | terminal | `apps/web/src/features/064-terminal/server/terminal-ws.ts` | A socket `error` event — with or without a following `close` — removes the PTY from `activePtys`, clears its activity-log interval, and kills it exactly once; a second dispose is a no-op. After `close`, `error`, OR `pty.onExit`, `activityLogIntervals.size` reflects no leaked interval. | Fixes Vector 1 (in-session leak). Today the `clearInterval` is nested under only one of the `ws.on('close')` handlers (terminal-ws.ts:166-169) and `pty.onExit` (178-184) doesn't clear it — funnel all of it through `disposePty`. |
| [x] | FX001-2 | Harden `cleanup()`: force-kill each PTY child via `process.kill(pty.pid, 'SIGKILL')` (not only SIGHUP via `pty.kill()`), clear all intervals, and register cleanup on `SIGHUP` + `beforeExit` in addition to `SIGTERM`/`SIGINT`. Confirm kills are dispatched before `process.exit`. | terminal | `apps/web/src/features/064-terminal/server/terminal-ws.ts` | On any catchable shutdown signal, every entry in `activePtys` is force-killed before exit; no `tmux attach` child survives a graceful restart. | Use `process.kill(pty.pid, 'SIGKILL')` — `pid` is on the public `PtyProcess` contract, so no `types.ts` contract change. Graceful-restart leak. **Safety (shared with FX001-3): before any force-kill, verify the pid is alive (`process.kill(pid, 0)`) AND is still a tmux client (`ps -o command= -p <pid>` matches `tmux`; macOS has no `/proc`) — never SIGKILL an unrelated/reused PID, never the tmux server.** |
| [ ] | FX001-3 | Track live PTY child PIDs in a **per-sidecar** state file (keyed by listen port, e.g. `.chainglass/terminal-sidecar-<port>.pids.json`; atomic write via temp-file + rename). On `start()`, read **only this sidecar's** file, force-kill survivors (with the FX001-2 safety check), then reset. Add/remove PIDs as PTYs are spawned/disposed. | terminal | `apps/web/src/features/064-terminal/server/terminal-ws.ts` (+ small helper module) | After a hard SIGKILL leaves orphaned `tmux attach` clients, the **next** sidecar-on-the-same-port start reaps them — `ls /dev/ttys* \| wc -l` returns to baseline with no manual `pkill` — AND `tmux list-sessions` is unchanged (sessions preserved). | Covers the un-catchable SIGKILL-from-watcher path (Vector 2). **Per-port keying prevents concurrent worktree sidecars (which share one `findWorkspaceRoot()` `.chainglass/`) from cross-killing each other's live PTYs.** MUST kill the attach client PID only — never `tmux kill-session`. PID-reuse guard = the FX001-2 `ps`-match safety check. |
| [ ] | FX001-4 | Add a defensive max-active-PTY ceiling: when `activePtys.size` is at cap, reject the WS upgrade with a typed error + bounded close code instead of spawning; add an idle reaper for PTYs whose socket is gone. | terminal | `apps/web/src/features/064-terminal/server/terminal-ws.ts` | With a low cap in a test, the Nth+1 connection is rejected (typed error, no PTY spawned); active PTY count never exceeds `cap`. | Defense-in-depth — caps host impact regardless of leak source. Rejection lives on the upgrade path (see workshop 002). |
| [ ] | FX001-5 | Unit tests for teardown + reaper using the existing `FakePty` / `createFakePtySpawner` + fake executor. | terminal | `test/unit/web/features/064-terminal/terminal-ws.test.ts` | Tests assert: every spawned `FakePty` is `killed` after `close` AND after `error`; `cleanup()` kills all; the startup reaper kills tracked survivors; an over-cap connection is rejected with no spawn. | Constitution P4 — fakes over mocks. `FakePty` already exposes `killed`; `createFakePtySpawner` records every instance. |

## Workshops Consumed

- [002-terminal-ws-authentication.md](../workshops/002-terminal-ws-authentication.md) — adjacent: the WS **upgrade/authorize path** (`authorizeUpgrade`) is where the FX001-4 over-cap rejection close code belongs. Not design-authoritative for teardown.
- No workshop designed PTY lifecycle/teardown — this fix is net-new lifecycle hardening within the existing domain.

## Acceptance

**Unit-testable** (via `FakePty` / `createFakePtySpawner` + fake executor — the FX001-5 suite):
- [ ] A WebSocket `error` without a clean `close` no longer leaks a PTY (asserts spawned `FakePty.killed === true`).
- [ ] `disposePty` is idempotent — a second dispose (e.g. `close` after `pty.onExit`) is a no-op, and the PTY's activity-log interval is cleared on every exit path.
- [ ] `cleanup()` force-kills every PTY in `activePtys` on `SIGTERM`/`SIGINT`/`SIGHUP`/`beforeExit`.
- [ ] The startup reaper, given a per-port state file of recorded PIDs, kills exactly those PIDs (with the liveness + `ps`-match guard mocked) and never others.
- [ ] A max-active-PTY ceiling (low cap in test) rejects the Nth+1 connection with a typed close code and spawns no PTY.

**Manual / integration** (host-level, not unit-testable — observed by the implementer/operator on macOS):
- [ ] After a hard kill of the sidecar, the next same-port `start()` reaps orphaned `tmux attach` clients; `ls /dev/ttys* | wc -l` returns to baseline without manual `pkill`.
- [ ] `tmux list-sessions` is **unchanged** before vs. after a reap — sessions persist; only attach-client PTYs are killed (never `kill-session`).
- [ ] Two concurrent worktree sidecars (different ports, same workspace root) do **not** reap each other's live PTYs.

**Gate**:
- [ ] Terminal feature lint + typecheck + unit tests pass (`just fft` or equivalent).

## Discoveries & Learnings

_Populated during implementation._

| Date | Task | Type | Discovery | Resolution |
|------|------|------|-----------|------------|

---

## Validation Record (2026-06-03)

### Validation Thesis

**Raison d'être**: A live macOS PTY-exhaustion incident (`kern.tty.ptmx_max=511` hit; `openpty()` failing system-wide) traced to the terminal sidecar; this dossier must specify a permanent, deterministic PTY teardown so the leak stops without manual `pkill`/reboot.

**Value claim**: Dev machines stay usable (terminals/SSH/tmux keep working) across normal edit-save-reload + terminal use.

**Artifact promise**: `plan-6` can implement from this with minimal clarification; `plan-7` can review against testable acceptance criteria.

**Intended beneficiaries**: implementation agent (plan-6), reviewer (plan-7), the developer/operator running chainglass locally.

**Proof target**: Implementation.

**Evidence standard**: source-line accuracy, accurate interface refs (`PtyProcess`/`FakePty`), buildable + testable tasks via existing fakes.

**Thesis source**: live incident diagnosis this session + source read (`terminal-ws.ts`, `tmux-session-manager.ts`, `use-terminal-socket.ts`, `types.ts`, `fake-pty.ts`).

**Thesis verdict**: Partially advanced → **Advanced after fixes** (reaper safety + multi-sidecar isolation + contract accuracy now concrete).

**Main thesis risk**: a naive reaper killing a reused PID or the tmux *session* instead of the attach client — mitigated by the added `kill(pid,0)` + `ps`-is-tmux guard and the "never `kill-session`" invariant with a `tmux list-sessions`-unchanged acceptance criterion.

---

| Agent | Lenses Covered | Issues | Verdict |
|-------|---------------|--------|---------|
| Source Truth | Concept Documentation, Integration & Ripple, Technical Constraints | 1 LOW (line ref) fixed; all interface/line claims verified | ⚠️ → ✅ |
| Completeness & Edge | Edge Cases, Hidden Assumptions, System Behavior, Perf/Scale, Deployment/Ops | 1 HIGH (multi-sidecar collision) fixed, 1 MED (PID-reuse guard) fixed, 1 MED (ceiling unspecified) noted | ⚠️ → ✅ |
| Thesis Alignment | Thesis Alignment, Evidence Sufficiency, Proof-Level Fit | 2 CRIT/HIGH (proof-level / reaper vagueness) addressed via concrete reaper + safety notes | ⚠️ → ✅ |
| Forward-Compatibility | Forward-Compatibility, Domain Boundaries, Security & Privacy | 1 HIGH (contract mislabel) fixed, 1 HIGH (FX001-3 underspec) fixed, 1 MED (test boundary) fixed | ⚠️ → ✅ |

### Forward-Compatibility Matrix

| Consumer | Requirement | Failure Mode | Verdict | Evidence |
|----------|-------------|--------------|---------|----------|
| `plan-6 --fix FX001` | Buildable tasks + concrete done-when | encapsulation lockout | ✅ (post-fix) | FX001-3 now specifies per-port state-file path, atomic write, and concrete safety guard |
| `plan-7 --fix FX001` | Acceptance verifiable at test boundary | test boundary | ✅ (post-fix) | Acceptance split into unit-testable (FakePty) vs. manual/integration |
| `docs/domains/terminal/domain.md` | Accurate contract-change statement | contract drift | ✅ (post-fix) | Domain Impact corrected: force-kill via public `pid` (no contract change); `kill(signal?)` path flagged as a recordable contract extension |

**Thesis alignment**: Value claim now advanced at Implementation proof level; the load-bearing reaper task is concrete and the main risk (destructive kill) is guarded — residual risk is normal implementation care.

**Outcome alignment**: VPO Outcome — *"Workspace-scoped terminal access via tmux … Sessions persist across page refreshes and browser restarts"* — is advanced: the fix removes the host PTY exhaustion that breaks all terminal access, while the per-port reaper + "never `kill-session`" invariant explicitly preserves session persistence.

**Standalone?**: No — downstream consumers are `plan-6` (implement) and `plan-7` (review).

Overall: **VALIDATED WITH FIXES**
