# Fast Feedback Loops

## Test Tiers

| Tier | Command | Speed | When to Use |
|------|---------|-------|-------------|
| Feature tests | `just test-feature 040` | ~1-2s | After every code change |
| Feature watch | `just test-watch 040` | continuous | During active TDD |
| Full gate | `just fft` | ~120s | Before every commit |
| E2E pipeline | `just test-advanced-pipeline` | ~3-5 min | After major changes |

## Feature-Scoped Testing

Test only the files related to a specific plan number:

```bash
# Run once
just test-feature 040

# Watch mode (re-runs on file change)
just test-watch 040

# Multiple plans
just test-feature 039
```

This finds all `*.test.ts` files matching the plan number across `test/unit/` and `test/integration/`.

## Why Full Suite Is Slow

`just fft` takes ~105s. The test step alone is ~99s (95% of total):

| fft step | time | notes |
|----------|------|-------|
| lint | 0.5s | fast |
| format | 0.5s | fast |
| build | 1.8s | turbo cached |
| typecheck | 2.0s | fast |
| **test** | **99s** | 95% of total |

Within the test step:

| phase | time | notes |
|-------|------|-------|
| collect (scan 286 files) | 26s | vitest parsing overhead |
| setup + prepare | 15s | vitest internal |
| environment (jsdom) | 10s | web component test setup |
| **actual test execution** | 27s | the real work |
| transform (TS compile) | 2s | - |

**51s is pure overhead** before tests even start running. The actual test execution is only 27s.

**Slowest test files** (top 10 = 63% of 27s execution time):

| ms | file | why |
|----|------|-----|
| 5024 | ods-agent-wiring.test.ts | 10s retry timeout test |
| 3166 | stdio-transport.test.ts | real process spawning |
| 3052 | central-watcher.integration.test.ts | filesystem watcher timing |
| 1136 | script-runner.test.ts | real script execution |
| 1056 | mcp-workflow.test.ts | MCP integration |
| 842 | unix-process-manager.test.ts | real processes |
| 748 | phase-tools.test.ts | MCP tooling |
| 614 | start-central-notifications.test.ts | watcher setup |
| 539 | mcp-stdio.test.ts | stdio transport |
| 510 | workflow-tools.test.ts | MCP tooling |

For day-to-day feature work, use `just test-feature` for the fast loop and `just fft` only before committing.

## Timeouts on a Loaded Machine

Full runs happen at `nice -n 19` on a shared machine whose load sits between 75 and 270. At that priority, how long a process takes to spawn depends on the scheduler, so vitest's 5 s / 10 s defaults timed out a different real-git file in every run. The bounds now live in one place, `test/load-bounds.ts`, and `vitest.config.ts` splits the suite into two projects:

| Project | Files | Test / hook bound |
|---------|-------|-------------------|
| `process` | `PROCESS_TEST_FILES` in `vitest.config.ts`: `test/integration/**` plus the unit files that spawn git, CLIs or shells | `PROCESS_TEST_TIMEOUT_MS` (120 s) |
| `unit` | everything else | `UNIT_TEST_TIMEOUT_MS` (30 s) |

Rules for test code:

- A new test file that spawns real processes goes in `PROCESS_TEST_FILES`.
- Do not add per-file or per-test timeout raises for load; the bounds above cover it.
- A wait inside a test for a spawned process (`vi.waitFor`, an exec `timeout`) uses `SPAWN_WAIT_MS`.
- Build git fixtures with the async `git` / `initRepo` helpers in `test/helpers/git.ts`, never `execSync`. A synchronous spawn holds the vitest worker's event loop, and a file of them under load held it past 60 s. Vitest's worker RPC (`Timeout calling "onTaskUpdate"`) then failed the run even though every test passed.

Run one project with `pnpm vitest run --project process` (or `unit`).

## Direct Path Testing

If you know the exact test path:

```bash
# Single test file
pnpm vitest run test/unit/positional-graph/features/040-graph-inspect/inspect.test.ts

# Directory
pnpm vitest run test/unit/positional-graph/features/040-graph-inspect/

# With verbose output
pnpm vitest run --reporter=verbose test/unit/positional-graph/features/040-graph-inspect/
```

## Pre-Commit Gate

Always run before committing:

```bash
just fft
```

This runs: lint, format, build, typecheck, full test suite. If it fails on an unrelated flaky test, verify your feature tests pass and proceed.

## E2E Pipeline

Run the full 6-node agent pipeline:

```bash
just test-advanced-pipeline
```

After completion, the workspace is preserved. Inspect with the commands printed at the end:

```bash
cg wf inspect advanced-pipeline --workspace-path /tmp/tg-advanced-pipeline-XXXX
cg wf inspect advanced-pipeline --compact --workspace-path /tmp/tg-advanced-pipeline-XXXX
```

Live-watch a running pipeline:

```bash
watch -n 2 'cg wf inspect advanced-pipeline --compact --workspace-path /tmp/tg-advanced-pipeline-XXXX 2>&1 | grep -v "^{\"level"'
```
