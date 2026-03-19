# Phase 3: Harness Workflow Commands — Execution Log

**Plan**: 076-harness-workflow-runner
**Phase**: Phase 3: Harness Workflow Commands
**Started**: 2026-03-19
**Status**: Complete

---

## Pre-Phase Harness Validation

| Check | Status | Duration | Notes |
|-------|--------|----------|-------|
| Boot | ✅ | <1s | CLI bundle exists, harness CLI boots |
| Interact | ✅ | <1s | `harness --help` shows 14 commands |
| Observe | ✅ | <1s | Structured output verified |

**Verdict**: ✅ HEALTHY — proceed to tasks.

---

## T001: Command Skeleton + T002/T004/T005/T006

**Started**: 2026-03-19
**Status**: Complete

Created `harness/src/cli/commands/workflow.ts` with Commander.js group. Since reset, status, logs, and registration were simple, implemented them inline instead of as separate tasks. All 4 subcommands visible via `--help`:

```
$ just harness workflow --help
Commands:
  reset [options]   Clean all workflow state and recreate fresh test data
  run [options]     Execute workflow, capture telemetry, report pass/fail
  status [options]  Show current node-level workflow status
  logs [options]    Show event timeline from last workflow run
```

---

## T002b: spawnCg() + AutoCompletionRunner

**Started**: 2026-03-19
**Status**: Complete

Created:
- `harness/src/test-data/cg-spawner.ts` — streaming subprocess via `child_process.spawn()` with readline interfaces
- `harness/src/test-data/auto-completion.ts` — `AutoCompletionRunner` class with `onIdle()` method that completes user-input nodes and answers Q&A
- Updated `harness/package.json` with `@chainglass/positional-graph` and `@chainglass/workflow` workspace deps

**Discovery**: tsx `-e` flag runs in CJS mode where ESM-only packages fail to resolve. But the actual harness CLI entry point works fine since the harness is `"type": "module"`.

---

## T003: workflow run

**Started**: 2026-03-19
**Status**: Complete

**Discovery**: Commander.js `parseAsync()` without proper promise handling causes Node.js to exit before long-running async action handlers complete. `for await` on spawned process readline interfaces wasn't keeping the event loop alive. **Fix**: switched from `for await` to event listeners (`handle.stdoutLines.on('line', ...)`) which properly keep the event loop alive through the child process lifecycle. Also added `.catch()` to `parseAsync()` call.

### Evidence: workflow run --timeout 8 --no-auto-complete

```json
{
  "command": "workflow.run",
  "status": "degraded",
  "timestamp": "2026-03-19T01:13:33.400Z",
  "data": {
    "exitCode": 1,
    "exitReason": "timeout",
    "iterations": 0,
    "totalEvents": 3,
    "errorCount": 0,
    "assertions": [
      {"name": "workflow-started", "passed": true, "detail": "3 events emitted"},
      {"name": "drive-iterated", "passed": false, "detail": "0 drive iterations"},
      {"name": "no-crash-errors", "passed": true, "detail": "clean execution"},
      {"name": "clean-exit", "passed": false, "detail": "exit code 1"}
    ],
    "allPassed": false,
    "nodeStatus": {
      "slug": "test-workflow",
      "execution": {"status": "pending", "totalNodes": 4, "completedNodes": 0, "progress": "0%"},
      "lines": [
        {"id": "line-a8b", "label": "", "nodes": []},
        {"id": "line-e9b", "label": "Input", "nodes": [{"id": "test-user-input-e43", "unitSlug": "test-user-input", "type": "user-input", "status": "ready", "blockedBy": []}]},
        {"id": "line-14e", "label": "Processing", "nodes": [{"id": "test-agent-2dc", "unitSlug": "test-agent", "type": "agent", "status": "pending", "blockedBy": ["preceding-lines", "inputs"]}]},
        {"id": "line-3c2", "label": "Output", "nodes": [{"id": "test-code-9e2", ...}, {"id": "test-agent-825", ...}]}
      ]
    },
    "stderrLines": ["  [timeout] Drive aborted after 8s"]
  }
}
```

### Evidence: workflow reset

```json
{"command":"workflow.reset","status":"ok","timestamp":"2026-03-19T01:11:42.841Z","data":{"cleaned":true,"created":{"units":true,"template":true,"workflow":true}}}
```

### Evidence: workflow status

```json
{"command":"workflow.status","status":"ok","data":{"slug":"test-workflow","execution":{"status":"pending","totalNodes":4,"completedNodes":0,"progress":"0%"},...}}
```

### Evidence: workflow logs

```json
{"command":"workflow.logs","status":"ok","data":{"totalEvents":3,"filteredEvents":3,"filters":[],"events":[{"type":"status",...},{"type":"idle",...},{"type":"status","message":"Drive stopped — aborted during sleep",...}]}}
```

---

## T007: Justfile

**Status**: Complete

Verified `just harness workflow run` routes correctly via existing `harness *ARGS` passthrough recipe. Added comment documenting workflow subcommands.

---

## T008: Dogfooding Checkpoint

**Status**: Complete

All 4 commands produce valid HarnessEnvelope JSON:
- ✅ `workflow reset` — cleans + creates test data, returns `{cleaned, created}` 
- ✅ `workflow run` — spawns CLI, captures NDJSON events, runs assertions, returns structured result
- ✅ `workflow status` — returns per-node status with timing, sessions, blockers
- ✅ `workflow logs` — reads cached events with filter support

Full workflow to completion (with auto-answer + auto-complete) not tested in this checkpoint — requires GH_TOKEN for real agent execution. Structural integrity of the command pipeline is verified.

**Test suite**: 5581 passed, 80 skipped (no regressions)

---

## Discoveries & Learnings

| Date | Task | Type | Discovery | Resolution |
|------|------|------|-----------|------------|
| 2026-03-19 | T003 | Gotcha | Commander.js `parseAsync()` doesn't keep event loop alive for long-running async action handlers — Node.js exits before spawn child completes | Switched from `for await` on readline to event listeners (`on('line', ...)`) which properly keep event loop alive. Added `.catch()` to parseAsync(). |
| 2026-03-19 | T002b | Gotcha | tsx `-e` flag runs in CJS mode — ESM-only packages like `@chainglass/positional-graph` fail to resolve via inline eval | Not an issue for production code — only affects developer testing. Harness CLI entry point works fine. |
| 2026-03-19 | T001 | Decision | Implemented T002/T004/T005/T006 inline with T001 since they were simple enough to not warrant separate implementation passes | Reduced task overhead without sacrificing quality — all commands verified independently. |
