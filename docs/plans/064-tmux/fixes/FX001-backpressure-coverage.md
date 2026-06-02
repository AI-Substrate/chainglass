# Backpressure Coverage — FX001 Deterministic PTY teardown

**Fix**: [FX001-pty-teardown-leak.md](./FX001-pty-teardown-leak.md)
**Plan**: [tmux-plan.md](../tmux-plan.md) (Plan 064)
**Generated**: 2026-06-03
**Certainty**: Partial

> Advisory only — informs implementation (`plan-6 --fix FX001`). Never blocks, never gates, no scores. (See plan-2d-backpressure-survey.)
>
> **Scope note**: This surveys the **FX001 fix** (the work in flight), not the whole `064-tmux` feature spec. The fix dossier supplies the acceptance criteria / target domain / risks the survey needs.

## Existing Sensors (inventory)

| Sensor | Command | Dimension |
|--------|---------|-----------|
| Composite gate | `just fft` (lint + format + build + typecheck + test + security-audit) | behaviour + maintainability |
| Unit tests (vitest) | `just test` / `pnpm vitest run` | behaviour |
| Typecheck | `just typecheck` (`tsc --noEmit`) | architecture-fitness (contract integrity) |
| Lint / format | `just lint` (`biome check .`) / `just format` | maintainability |
| Build | `just build` (`turbo build`) | behaviour (compile) |
| Security audit | `just security-audit` | maintainability/security |
| L3 agent harness | `just harness health` (Boot + Playwright/CDP browser + structured JSON) | behaviour (browser UI only) |
| CI gate | `.github/workflows/ci.yml` | behaviour + maintainability |

**Gap in the inventory relative to this fix**: the L3 harness proves the *browser* terminal connects/renders — it has **no probe for host-level PTY state** (`/dev/ttys*` count, orphaned `tmux attach` clients, tmux session survival). No architecture sensor (dependency-cruiser / ArchUnit / CodeQL) exists, but the fix is single-domain so the only contract risk (`PtyProcess` signature) is already guarded by `tsc`.

## Coverage Matrix

| Criterion / failure mode | Deterministic sensor | Status | Tier |
|--------------------------|----------------------|--------|------|
| Socket `error` (no clean close) leaks a PTY — Vector 1 | vitest: simulate `ws` error, assert `FakePty.killed` | BUILDABLE | computational |
| `disposePty` not idempotent → double-kill | vitest: dispose twice, assert second is a no-op | BUILDABLE | computational |
| Activity-log `setInterval` leaks on error/onExit paths | vitest: assert `activityLogIntervals.size` after each exit path | BUILDABLE | computational |
| `cleanup()` misses force-kill on `SIGHUP`/`beforeExit` | vitest: invoke handler, assert every `FakePty` force-killed | BUILDABLE | computational |
| Reaper kills a **reused/unrelated PID** | vitest + fake executor: only PIDs passing liveness + `ps`-is-tmux guard get killed | BUILDABLE | computational |
| Reaper kills the **tmux session** (destroys persistence) — safety-critical | **integration smoke (real tmux)**: create session + attach, run reaper, assert `tmux list-sessions` unchanged | BUILDABLE | computational |
| **Multi-sidecar cross-kill** (per-port isolation) — Vector 2 edge | vitest: two servers/ports, reaper touches only own-port PIDs | BUILDABLE | computational |
| Max-PTY ceiling fails to reject Nth+1 / spawns anyway | vitest: low cap, assert Nth+1 rejected + no spawn | BUILDABLE | computational |
| `PtyProcess` contract drift (breaking a consumer) | `just typecheck` (`tsc --noEmit`) — `FakePty implements PtyProcess` | **EXISTS** | computational |
| New code compiles / lints / unit tests green | `just fft` composite gate | **EXISTS** | computational |
| End-to-end: after real hard-kill, next start reaps orphans; `/dev/ttys*` → baseline | host-level observation (macOS, real PTY exhaustion) — flaky, non-portable, no reliable CI sensor | ABSENT | inferential (operator-observed) |
| Max-PTY **cap value** is right for real multi-pane usage | none — a tuning/UX judgement, not a machine check | ABSENT | human-judgement |

## Certainty: Partial

Every behaviour/architecture criterion is either `EXISTS` (typecheck guards the `PtyProcess` contract; `just fft` gates compile+lint+tests) or `BUILDABLE` on the existing **vitest + `FakePty` + `createFakePtySpawner`** harness — sensors are specifiable within fix scope, the runner already exists. The only `ABSENT` rows are inherently inferential (host `/dev/ttys*` observation) or human-judgement (cap value), which by rubric do not drag the rating down. Not `Strong` only because the safety-critical "never `kill-session`" invariant has no `EXISTS` sensor yet (it's `BUILDABLE` as an integration smoke, currently routed to the operator's eyeball).

## Recommended Phase 0: Establish Backpressure

These are the deterministic sensors worth building **first** (RED-first), so FX001's safety-critical behaviour is proven by the harness rather than inferred. FX001-5 already plans the unit sensors — this survey confirms they're the right ones and flags the **one sensor the dossier does not yet plan**: the session-preservation smoke.

| Sensor to build | Proves | Suggested form |
|-----------------|--------|----------------|
| **Session-preservation smoke** (the gap) | Reaper kills the attach client but `tmux list-sessions` is unchanged — the "never `kill-session`" invariant that protects the feature's whole value | integration smoke script (real tmux) — add as a `just` recipe or `test-harness` case |
| Reaper safety unit test | Reaper kills only PIDs passing the liveness (`kill(pid,0)`) + `ps -o command=`-is-tmux guard; never reused/unrelated PIDs | vitest + fake `execCommand` |
| Per-port isolation unit test | Two concurrent sidecars don't reap each other's live PTYs | vitest (two servers, distinct ports) |
| Teardown unit tests (= FX001-5) | error-path kill, `disposePty` idempotency, activity-log interval cleared on all paths, `cleanup()` force-kill on every signal | vitest + `FakePty` (RED-first) |
| Ceiling unit test | Nth+1 connection rejected with a typed close code, no PTY spawned | vitest (low cap) |

**Honest residual (no sensor — and that's fine)**: the end-to-end "`/dev/ttys*` returns to baseline after a real hard kill" is host-specific (macOS, real exhaustion) and stays a **manual/operator** verification — already listed under the dossier's *Manual / integration* acceptance criteria. The cap value is a tuning judgement for the implementer.

### How this differs from plan-7 / the composite gate
- `just fft` proves the code **compiles, lints, and unit tests pass** — it does not prove the reaper preserves tmux sessions or that orphans are reclaimed at the OS level.
- `plan-7-v2-code-review` (inferential/eyeball tier) would *read* the reaper and judge it — legitimate, but a session-preservation **smoke** makes the safety invariant deterministic instead of eyeballed.
- This survey (computational tier, pulled to design time) says: build the session-preservation smoke + reaper-safety unit before/with implementation, so "green" actually means "safe."
