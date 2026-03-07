# Fix FX001: Harness Doctor Command + Port Persistence + Prompt Improvements

**Created**: 2026-03-07
**Status**: Proposed
**Plan**: [harness-plan.md](../harness-plan.md)
**Source**: Test Run #1 retro ([004-test-run-001-retro.md](../workshops/004-test-run-001-retro.md)), Workshop [003-harness-doctor-command.md](../workshops/003-harness-doctor-command.md)
**Domain(s)**: external (harness/)

---

## Problem

The first real-world test of the harness by a zero-context agent revealed four problems:

1. **Port mismatch**: `computePorts()` returns 3159/4659/9281 for this worktree but Docker binds to fallback defaults (3100/4600/9222) because no `.env` file persists the computed ports. Any direct `docker compose` invocation ignores the dynamic allocation.

2. **Boot wait flailing**: The agent spent 8+ tool calls (docker ps, docker inspect, log reading, poll loops) trying to figure out why health was degraded during cold boot. No single command tells agents "what's wrong and what to do."

3. **Prompt verbosity**: The test prompt used raw `pnpm exec tsx src/cli/index.ts` commands instead of the simpler `just harness` aliases.

4. **No cold-boot guidance**: The prompt didn't explain that first boot takes 2-5 minutes or how to check progress.

## Proposed Fix

1. Add `harness doctor` command — layered diagnostic cascade (Docker → Container → App → Services) with actionable fix commands per Workshop 003.
2. Generate `harness/.env` from `computePorts()` during `harness dev` so `docker compose` always uses correct ports.
3. Update the test prompt to use `just harness` aliases and add cold-boot timing guidance.
4. Update `docs/project-rules/harness.md` with doctor command and cold-boot notes.

## Domain Impact

| Domain | Relationship | What Changes |
|--------|-------------|-------------|
| external (harness) | owns | New `doctor` command, `.env` generation in `dev`, updated prompt |
| cross-domain (docs) | documents | Updated harness.md and test prompt |

## Tasks

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [ ] | FX001-1 | Implement diagnostic cascade helper | external | `harness/src/doctor/diagnose.ts` | Cascade runs 5 layers (Docker → .env/ports → Container → App → Services), returns `DoctorResult` with checks array. Within each layer, reports ALL failures (not just first). Every failure includes an exact fix command. Messages are verbose and actionable — not "app down" but "App not responding on :3159. The container may still be building after cold boot (~2-3 min). Check progress: just harness doctor --wait" | Reuses `isDockerAvailable()`, `isContainerRunning()`, `probeAll()`. Layer 1.5 reads `.env` and compares against `computePorts()` for port mismatch detection. |
| [ ] | FX001-2 | Add container age + log helpers | external | `harness/src/docker/lifecycle.ts` | `getContainerAge()` and `getContainerLogs(n)` return container start time and last N log lines. Age used to distinguish "cold booting (45s ago, wait ~2 min)" from "been up 10 min and still broken (check logs)". Logs included in error context so agents don't need a separate step. | Needed by doctor Layer 1 |
| [ ] | FX001-3 | Implement `harness doctor` CLI command with `--wait` | external | `harness/src/cli/commands/doctor.ts`, `harness/src/cli/index.ts` | `harness doctor` returns verbose JSON envelope with `DoctorResult`; human-readable summary to stderr with ✓/✗/⏳ indicators. `--wait [seconds]` mode (default 300s) polls every 3s with stderr progress ("⏳ Waiting for app... 45s"), emits final JSON only when healthy or timed out. Exit 0 if healthy, exit 1 if not. | The goal: one command replaces the 8-step diagnostic flail from test run #1 |
| [ ] | FX001-4 | Generate `.env` from `computePorts()` on every CLI entry | external | `harness/src/cli/index.ts` or shared prelude | Every CLI command writes `harness/.env` with computed ports before executing. `.env` is a regenerated cache, not persistent config. `docker compose` reads it automatically. Handles the "raw docker compose up uses wrong ports" problem. | Keep generation fast (<1ms). Write only if changed to avoid unnecessary disk writes. |
| [ ] | FX001-5 | Add `.env` to `.gitignore` and `.dockerignore` | external | `.gitignore`, `harness/.dockerignore` | `.env` excluded from git and Docker build context | Prevents port values leaking into commits or images |
| [ ] | FX001-6 | Write unit tests for doctor cascade | external | `harness/tests/unit/doctor/diagnose.test.ts` | Tests: Docker unavailable → Layer 0 with "Run: orbctl start", container missing → Layer 1, port mismatch → Layer 1.5 with specific ports in message, app down + CDP down → both reported in same layer, all healthy → ready with endpoint URLs. Every test asserts the fix command text is present and actionable. | ~8-10 tests |
| [ ] | FX001-7 | Create `harness/prompts/` and move test prompt | external | `harness/prompts/screenshot-audit.md` | Move prompt from `scratch/` to `harness/prompts/`. Update to use `just harness doctor --wait` as the starting command, `just harness` aliases throughout. Add cold-boot timing guidance. These are versioned agent API templates. | Per DYK #4 |
| [ ] | FX001-8 | Update docs | cross-domain | `docs/project-rules/harness.md` | Document `harness doctor`, `--wait` mode, `.env` cache behaviour, cold-boot timing, prompt templates location. Add to CLAUDE.md quick reference. | Per retro action items |

## Workshops Consumed

- [003-harness-doctor-command.md](../workshops/003-harness-doctor-command.md) — cascade design, JSON schema, layer definitions
- [004-test-run-001-retro.md](../workshops/004-test-run-001-retro.md) — action items from first test run

## Acceptance

- [ ] `harness doctor` returns actionable fix for "Docker not running" scenario
- [ ] `harness doctor` returns "container booting" with wait guidance during cold start
- [ ] `harness doctor` returns "healthy and ready" with endpoint URLs when all services up
- [ ] `harness dev` generates `harness/.env` so direct `docker compose up` uses correct ports
- [ ] Test prompt starts with `just harness doctor` not raw health checks
- [ ] Zero-context agent can follow updated prompt without flailing

## Discoveries & Learnings

### Critical Insights (2026-03-07)

| # | Insight | Decision |
|---|---------|----------|
| 1 | `.env` in shared source tree goes stale across worktree switches. Writing to `/tmp` is non-obvious. | Option C: Regenerate `.env` on every CLI entry point. It's a cache, not config. Deterministic per worktree, gitignored, free to compute. One container per worktree; parallel agents share it via independent CDP contexts. |
| 2 | "Stop at first blocker" hides parallel failures within a layer — agent loops doctor→fix→doctor unnecessarily. | Stop at first *layer* (skip services if container down), but report *all* failures within that layer. Both CDP and terminal down → both fix commands in one pass. |
| 3 | Agents will invent their own poll loops for cold boot wait (test agent did 18×10s). Doctor solves "what's wrong" but not "wait for it." | Add `harness doctor --wait [timeout]` — blocks until healthy or timeout (default 300s). Progress to stderr, final JSON to stdout. One command replaces the poll loop. |
| 4 | Test prompt lives in gitignored `scratch/` — not discoverable, not versioned, lost on clean. | Move prompts to `harness/prompts/` directory. Checked in, versioned, iterable. Prompts are part of the agent API surface. |
| 5 | Port mismatch (.env says 3100, worktree expects 3159) is the #1 failure mode, but doctor would misdiagnose it as "app down" if it only checks the computed port. | Add Layer 1.5 `.env` port mismatch detection. Compare `.env` ports against `computePorts()`. Report specific mismatch with exact fix command. |

### Architecture Decision: One Container Per Worktree

Parallel agents within a worktree **share one container**. Each agent gets its own CDP browser context (proven in Phase 2 multi-context tests). Spinning up N containers per worktree wastes N×1GB+ memory for identical code. Agents that need isolated code changes should be in separate worktrees (which get their own container + ports + volumes automatically).

| Date | Task | Type | Discovery | Resolution |
|------|------|------|-----------|------------|
