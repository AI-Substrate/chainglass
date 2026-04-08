# Phase 2: CLI Telemetry Enhancement — Execution Log

**Plan**: 076-harness-workflow-runner
**Phase**: Phase 2: CLI Telemetry Enhancement
**Started**: 2026-03-17
**Baseline**: 5573 tests pass, 80 skipped

## GH Token Pre-flight (T2.3)

```
$ GH_TOKEN= GITHUB_TOKEN= node apps/cli/dist/cli.cjs wf run test-workflow --workspace-path ...

Error: GH_TOKEN environment variable required for agent execution.
Set it with: export GH_TOKEN=$(gh auth token)
(exit code 1)
```

## `wf run --json-events` (T2.2)

```
$ node apps/cli/dist/cli.cjs wf run test-workflow --json-events --timeout 15 --workspace-path ...

{"type":"status","message":"Graph: test-workflow (pending)\n─────────────────────────────\n  Line 0: \n  Line 1: ⬜ test-user-input-9c9\n  Line 2: ⚪ test-agent-c7b\n  Line 3: ⚪ test-code-e88 → ⚪ test-agent-2d0\n─────────────────────────────\n  Progress: 0/4 complete","timestamp":"2026-03-17T21:10:01.040Z"}
{"type":"idle","message":"No actions — polling","timestamp":"2026-03-17T21:10:01.041Z"}
{"type":"status","message":"Graph: test-workflow (pending)\n─────────────────────────────\n  ...","timestamp":"2026-03-17T21:10:11.061Z"}
{"type":"idle","message":"No actions — polling","timestamp":"2026-03-17T21:10:11.062Z"}
  [timeout] Drive aborted after 15s
{"type":"status","message":"Drive stopped — aborted during sleep","timestamp":"2026-03-17T21:10:16.022Z"}
(exit code 1)
```

Each line is valid JSON. Status events include graph rendering. Idle events show polling. Timeout emits final status event.

## `wf show --detailed --json` (T2.1, after FT-001 fix)

```
$ node apps/cli/dist/cli.cjs wf show test-workflow --detailed --json --workspace-path ...

{
  "success": true,
  "command": "wf.show",
  "data": {
    "slug": "test-workflow",
    "execution": {
      "status": "pending",
      "totalNodes": 4,
      "completedNodes": 0,
      "progress": "0%"
    },
    "lines": [
      { "id": "line-bdb", "label": "", "nodes": [] },
      {
        "id": "line-e15", "label": "Input",
        "nodes": [{
          "id": "test-user-input-9c9",
          "unitSlug": "test-user-input",
          "type": "user-input",
          "status": "ready",
          "startedAt": null, "completedAt": null,
          "error": null, "sessionId": null,
          "blockedBy": []
        }]
      },
      {
        "id": "line-537", "label": "Processing",
        "nodes": [{
          "id": "test-agent-c7b",
          "unitSlug": "test-agent",
          "type": "agent",
          "status": "pending",
          "blockedBy": ["preceding-lines", "inputs"]
        }]
      },
      {
        "id": "line-83c", "label": "Output",
        "nodes": [
          { "id": "test-code-e88", "type": "code", "status": "pending", "blockedBy": ["preceding-lines", "inputs"] },
          { "id": "test-agent-2d0", "type": "agent", "status": "pending", "blockedBy": ["preceding-lines", "inputs", "serial-neighbor"] }
        ]
      }
    ],
    "questions": [],
    "sessions": {}
  }
}
```

AC-14 satisfied: node IDs, unit types, statuses, timing fields, blockedBy with real reasons (preceding-lines, inputs, serial-neighbor).

## Code Review Fix Tasks

- FT-001: Fixed field names (lineId→id, nodeId→id, unitType→type), real blockedBy from readyDetail booleans
- FT-002: Created tasks.md and this execution.log.md
- FT-003: Replaced PodManager/NodeFileSystemAdapter construction with getReality()
- FT-004: Pending — domain history update
