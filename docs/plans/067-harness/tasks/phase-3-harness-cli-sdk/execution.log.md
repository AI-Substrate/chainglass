# Phase 3: Harness CLI SDK — Execution Log

**Started**: 2026-03-07
**Plan**: [harness-plan.md](../../harness-plan.md)
**Phase Doc**: [tasks.md](tasks.md)

---

## Pre-Phase Harness Validation

| Check | Status | Duration | Notes |
|-------|--------|----------|-------|
| Boot | ✅ Already running | 0s | Container was already up |
| Interact | ✅ Healthy | <1s | `just health` returned structured JSON |
| Observe | ✅ CDP up | <1s | CDP browser field populated |

**Verdict**: ✅ HEALTHY — proceed to tasks.

---

## Task Log

### T001: RED Tests for CLI Schema
**Status**: ✅ Done
**Evidence**: `pnpm exec vitest run tests/unit/cli/output.test.ts` — 11 tests fail (import errors, expected RED)

### T002: Implement output.ts JSON Envelope
**Status**: ✅ Done
**Evidence**: `pnpm exec vitest run tests/unit/cli/output.test.ts` — 11/11 pass
**Files**: `harness/src/cli/output.ts`

### T003-T010: CLI Scaffold + All Commands
**Status**: ✅ Done
**Evidence**:
- `pnpm exec tsc --noEmit` — clean
- `pnpm exec vitest run tests/unit/cli/` — 14/14 pass (output: 11, index: 3)
- `pnpm exec tsx src/cli/index.ts --help` — shows all 7 commands
- `pnpm exec tsx src/cli/index.ts health` — `{"command":"health","status":"ok","data":{"status":"ok","app":{"status":"up","code":"200"},"mcp":{"status":"up","code":"406"},"terminal":{"status":"up"},"cdp":{"status":"up","browser":"Chrome/136.0.7103.25"}}}`
- `pnpm exec tsx src/cli/index.ts screenshot test-cli --viewport mobile` — saves `results/test-cli-mobile.png` (10KB)

**SDK Helpers Created (DYK #5)**:
- `harness/src/cdp/connect.ts` — CDP version/ws/availability helpers
- `harness/src/health/probe.ts` — per-service probes + `probeAll()`
- `harness/src/docker/lifecycle.ts` — docker compose wrappers

**Commands Created**:
- `harness/src/cli/commands/build.ts`
- `harness/src/cli/commands/dev.ts`
- `harness/src/cli/commands/stop.ts`
- `harness/src/cli/commands/health.ts`
- `harness/src/cli/commands/test.ts`
- `harness/src/cli/commands/screenshot.ts`
- `harness/src/cli/commands/results.ts`

**Discoveries**:
1. CDP `/json/version` response uses capital `Browser`, not lowercase — fixed in `CdpVersionInfo` type
2. `import.meta.dirname` resolves to the source file's directory, not project root — fixed HARNESS_ROOT to use `../../..` from commands dir
3. `curl` fails with connection reset on CDP port 9222 from host, but Node.js `fetch` works fine — curl issue only, no impact on CLI

