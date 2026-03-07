# Workshop: Copilot SDK Adapter Reuse & Agent Runner Design

**Type**: Integration Pattern + CLI Flow + Storage Design
**Plan**: 070-harness-agent-runner
**Spec**: (not yet created)
**Created**: 2026-03-07
**Status**: Draft

**Related Documents**:
- [Exploration](../exploration.md) — Research findings (61 discoveries)
- [Agents Domain](../../domains/agents/domain.md) — IAgentAdapter, SdkCopilotAdapter
- [Harness Governance](../../project-rules/harness.md) — L3 harness rules
- [ADR-0014](../../adr/adr-0014-first-class-agentic-development-harness.md) — Harness mandate
- [Test Run #1 Retro](../067-harness/workshops/004-test-run-001-retro.md) — Agent interaction learnings
- [Doctor Workshop](../067-harness/workshops/003-harness-doctor-command.md) — Diagnostic cascade design

**Domain Context**:
- **Primary Domain**: External tooling (harness/) — NOT a registered domain
- **Related Domains**: `agents` (consumer via CLI subprocess), `_platform/sdk` (implicit via CLI)

---

## Purpose

Design the complete integration pattern for running declarative, schema-validated sub-agents from the harness CLI. This workshop clarifies: how we reuse the Copilot SDK without violating the external tooling boundary, what the human and agent experience looks like, how every turn is logged for auditability, and how agent definitions are structured as versioned, discoverable folders.

## Key Questions Addressed

- How do we reuse the Copilot SDK adapter without importing `@chainglass/shared`?
- What does the human experience look like when running an agent?
- What does the agent experience look like when parsing results?
- How are agent turns, events, and outputs logged for full auditability?
- What is the agent definition format (prompt, schema, instructions)?
- What patterns from the justfile/scripts E2E agent runs should we adopt?
- How is this distinct from the positional graph / workflow system?

---

## 1. Integration Strategy: Copilot SDK Direct (Revised)

> **CORRECTION (2026-03-07)**: The original workshop concluded "CLI subprocess". This was wrong. We use the **Copilot SDK** (`@github/copilot-sdk`) directly via `SdkCopilotAdapter` from `@chainglass/shared`. A proof-of-concept at `scratch/copilot-sdk-poc/run.ts` validated this approach.

### Why SDK Direct (Not CLI Subprocess)

The Copilot SDK gives us everything the CLI binary gives us — plus typed events, proper session objects, and no log-file parsing hacks. The concerns about importing `@chainglass/shared` were overweighted:

1. ~~Add `@github/copilot-sdk` (~2.5MB) to harness deps~~ — **Acceptable**: harness already has playwright (~100MB), this is noise
2. ~~Require wiring `CopilotClient` + DI container~~ — **Wrong**: `CopilotClient()` is zero-arg, no DI needed
3. ~~Turbopack `import.meta.resolve` issue (PL-09)~~ — **Not applicable**: harness uses `tsx`, not Turbopack
4. ~~Break external tooling constraint~~ — **Reconsidered**: importing interfaces is fine; we're consuming, not coupling

**Decision**: Import `SdkCopilotAdapter` and `IAgentAdapter` from `@chainglass/shared`. Instantiate `CopilotClient` from `@github/copilot-sdk` directly.

### The Integration Pattern

From the validated proof-of-concept (`scratch/copilot-sdk-poc/run.ts`):

```typescript
import { CopilotClient } from '@github/copilot-sdk';
import { SdkCopilotAdapter } from '@chainglass/shared';
import type { AgentEvent } from '@chainglass/shared';

// Zero-arg constructor — connects via GH_TOKEN env var
const client = new CopilotClient();

// Reuse the battle-tested adapter from @chainglass/shared
const adapter = new SdkCopilotAdapter(client as any);

// Run with typed events
const result = await adapter.run({
  prompt: 'What is 247 + 753? Reply with ONLY the number.',
  onEvent: (event: AgentEvent) => {
    // Typed discriminated union: text_delta | message | tool_call | tool_result | thinking | usage | session_start | session_idle | session_error
    console.log(event.type, event.data);
  },
});

// Typed AgentResult
// { output: "1000", status: "completed", sessionId: "6c5cc0ad-...", exitCode: 0, tokens: null }
```

### POC Validation Results (2026-03-07)

| Check | Result |
|-------|--------|
| `CopilotClient()` instantiation | ✅ Zero-arg, no DI, no web framework |
| `SdkCopilotAdapter` from `@chainglass/shared` | ✅ Works directly, no build issues |
| Typed `AgentResult` returned | ✅ `{output, sessionId, status, exitCode}` |
| Event streaming via `onEvent` | ✅ 6 events captured (text_delta, usage, session_idle, etc.) |
| Session ID for resumption | ✅ `6c5cc0ad-980f-4b86-b863-f36e29351c85` |
| Execution time (simple prompt) | 6.9 seconds |

### What This Means for the Runner

| Aspect | CLI Subprocess (old) | SDK Direct (new) |
|--------|---------------------|-------------------|
| Event streaming | Tail `events.jsonl` file, poll every 500ms | Typed `onEvent` callback, real-time |
| Session ID | Regex extraction from log files (fragile) | `result.sessionId` (typed, reliable) |
| Error handling | Parse exit codes + stderr | Typed `AgentResult.status` + catch |
| Timeout | SIGTERM → SIGKILL process | `adapter.terminate(sessionId)` |
| Auth check | Check if binary exists | `new CopilotClient()` throws with clear error |
| Dependencies | `@github/copilot` binary on PATH | `@github/copilot-sdk` + `@chainglass/shared` in package.json |
| Cleanup | Process kill | `session.destroy()` in finally (automatic) |

### Auth Requirement

The Copilot SDK requires a GitHub token:
```bash
GH_TOKEN=$(gh auth token) just harness agent run smoke-test
```

The harness doctor should check for `GH_TOKEN` before attempting agent runs.

---

## 2. Agent Definition Format

### Folder Structure

```
harness/agents/
├── smoke-test/                    # Agent definition
│   ├── prompt.md                  # Main prompt (the "task spec")
│   ├── output-schema.json         # Expected structured output (JSON Schema)
│   ├── instructions.md            # Agent-specific rules (optional)
│   └── runs/                      # All run history
│       ├── 2026-03-07T08-15-00Z/  # ISO-dated run folder
│       │   ├── prompt.md          # Copy of prompt at run time (frozen)
│       │   ├── instructions.md    # Copy of instructions at run time (frozen)
│       │   ├── logs/              # Copilot CLI log files
│       │   ├── output/            # Agent-produced artifacts
│       │   │   ├── report.json    # Structured output (validated)
│       │   │   └── screenshots/   # Arbitrary files
│       │   ├── events.ndjson      # Parsed agent events (turns, tools, thinking)
│       │   ├── completed.json     # Run metadata (session ID, timing, validation)
│       │   └── stderr.log         # Raw CLI stderr capture
│       └── 2026-03-07T09-30-00Z/
│           └── ...
├── visual-regression/             # Another agent definition
│   ├── prompt.md
│   ├── output-schema.json
│   └── runs/
└── ...
```

### prompt.md — The Task Spec

The prompt is the agent's mission brief. It's Markdown, checked into git, and versioned.

```markdown
# Smoke Test Agent

## Objective
Verify the Chainglass harness is operational by running diagnostics, capturing
screenshots, checking browser console logs, and producing a structured report.

## Pre-flight
Run `just harness doctor --wait` to ensure the harness is healthy before
proceeding. If doctor reports errors, follow the fix commands exactly.

## Tasks

### 1. Health Check
Run `just harness health` and capture the JSON response.
Verify all services (app, mcp, terminal, cdp) show status "up".

### 2. Screenshots
Capture at 3 viewports:
```bash
just harness screenshot homepage-desktop --viewport desktop-lg
just harness screenshot homepage-tablet --viewport tablet  
just harness screenshot homepage-mobile --viewport mobile
```
Copy the PNG files to the output/ folder in your run directory.

### 3. Browser Console Logs
Navigate to the homepage and capture any console errors or warnings.
Use Playwright via CDP to check for client-side issues.

### 4. Server Logs
Run `docker logs` on the harness container and capture the last 50 lines.
Note any errors or warnings.

### 5. Report
Write `output/report.json` matching the output schema. Include:
- Health check results
- Screenshot paths and viewport descriptions
- Console errors (if any)
- Server log summary
- Overall pass/fail verdict

### 6. Retrospective
At the end, provide a brief retrospective:
- What worked well with the harness?
- What was confusing or difficult?
- If you had a magic wand, what would you improve?
This feedback is used to improve the harness. Be honest and specific.

## Output
Write your structured report to `output/report.json` in the run folder.
After completing the report, validate it: read the output-schema.json from
the agent folder and verify your report conforms. Report any validation
issues and fix them before finishing.
```

### output-schema.json — The Contract

JSON Schema that defines the expected structured output. The harness CLI validates this after the agent completes.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Smoke Test Report",
  "type": "object",
  "required": ["health", "screenshots", "verdict", "retrospective"],
  "properties": {
    "health": {
      "type": "object",
      "required": ["status", "services"],
      "properties": {
        "status": { "enum": ["ok", "degraded", "error"] },
        "services": {
          "type": "object",
          "properties": {
            "app": { "type": "string" },
            "mcp": { "type": "string" },
            "terminal": { "type": "string" },
            "cdp": { "type": "string" }
          }
        }
      }
    },
    "screenshots": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["name", "viewport", "path"],
        "properties": {
          "name": { "type": "string" },
          "viewport": { "type": "string" },
          "path": { "type": "string" },
          "description": { "type": "string" }
        }
      }
    },
    "consoleErrors": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "level": { "enum": ["error", "warning"] },
          "message": { "type": "string" },
          "source": { "type": "string" }
        }
      }
    },
    "serverLogSummary": { "type": "string" },
    "verdict": { "enum": ["pass", "fail", "partial"] },
    "retrospective": {
      "type": "object",
      "required": ["workedWell", "confusing", "magicWand"],
      "properties": {
        "workedWell": { "type": "string" },
        "confusing": { "type": "string" },
        "magicWand": { "type": "string" }
      }
    }
  }
}
```

### instructions.md — Agent-Specific Rules (Optional)

Extra instructions injected alongside the prompt. Useful for common patterns:

```markdown
# Agent Instructions

## Working Directory
Your working directory is the run folder. All relative paths resolve there.
The harness source is at the repository root.

## Output Rules
- Write structured output to `output/report.json`
- Write screenshots to `output/screenshots/`
- Do NOT modify files outside your run folder
- Do NOT commit changes to git

## Error Handling
- If a command fails, include the error in your report
- Do NOT retry more than 2 times
- If the harness is unhealthy after doctor --wait, set verdict: "fail"

## Retrospective
Always provide honest feedback. This is dogfooding — your experience
improves the harness for everyone. Be specific: "the screenshot command
timed out after 30s" is better than "screenshots were slow."
```

---

## 3. Human Experience: Rich Terminal Output

### Running an Agent (Human View)

When a human runs `just harness agent run smoke-test`, they see rich, colored output:

```
$ just harness agent run smoke-test

╭─────────────────────────────────────────────────────────────────╮
│  HARNESS AGENT: smoke-test                                      │
│  Run ID: 2026-03-07T08-15-00Z                                  │
│  Run Dir: harness/agents/smoke-test/runs/2026-03-07T08-15-00Z  │
╰─────────────────────────────────────────────────────────────────╯

⏳ Pre-flight: checking harness health...
✓ Harness healthy (app=3159, cdp=9281, terminal=4659)

⏳ Launching Copilot agent...
  Session: cee9a7ba-1234-5678-abcd-ef0123456789

─── Agent Output ─────────────────────────────────────────────────

🔧 [tool] Bash: just harness health
   → {"command":"health","status":"ok",...}

🔧 [tool] Bash: just harness screenshot homepage-desktop --viewport desktop-lg
   → {"command":"screenshot","status":"ok","data":{"path":"..."}}

💭 [thinking] Checking console logs via CDP...

🔧 [tool] Bash: just harness screenshot homepage-tablet --viewport tablet
   → {"command":"screenshot","status":"ok","data":{"path":"..."}}

🔧 [tool] Bash: just harness screenshot homepage-mobile --viewport mobile
   → {"command":"screenshot","status":"ok","data":{"path":"..."}}

📝 [message] All 3 screenshots captured. Writing report...

🔧 [tool] Write: output/report.json
   → 1,247 bytes written

📝 [message] Retrospective: The harness doctor command was excellent...

─── Agent Complete ───────────────────────────────────────────────

✓ Status: completed (45.2s)
✓ Session: cee9a7ba-1234-5678-abcd-ef0123456789
✓ Output validated against schema ✓
  • 3 screenshots captured
  • 0 console errors
  • Verdict: pass

📁 Run artifacts:
  harness/agents/smoke-test/runs/2026-03-07T08-15-00Z/
  ├── output/report.json        (validated ✓)
  ├── output/screenshots/       (3 files)
  ├── events.ndjson             (47 events)
  ├── completed.json            (session + timing)
  └── logs/                     (Copilot debug logs)
```

### Design Principles for Human Output

1. **Header box** — Always show agent name, run ID, run directory upfront
2. **Pre-flight** — Show health check result before launching
3. **Streaming events** — Tool calls, thinking, messages shown in real-time
4. **Tool output previews** — Truncated to 80 chars, full output in logs
5. **Completion summary** — Status, timing, validation result, key metrics
6. **Artifact listing** — Show what files were produced and where

### Event Display Formatting

Inspired by `VerboseCopilotAdapter` from `test-copilot-serial.ts`:

| Event Type | Icon | Color | Display |
|-----------|------|-------|---------|
| `tool_call` | 🔧 | Magenta | `[tool] {toolName}: {input preview}` |
| `tool_result` | → | Green/Red | `→ {output preview}` (green if ok, red if error) |
| `thinking` | 💭 | Dim gray | `[thinking] {content preview}` |
| `text_delta` | (stream) | Yellow | Streamed inline, accumulated |
| `message` | 📝 | Cyan | `[message] {content}` |
| `usage` | 📊 | Dim | `tokens: in={n}, out={n}` |
| `session_start` | 🚀 | Blue | `Session: {sessionId}` |
| `session_idle` | — | Dim | (not shown, used internally) |
| `session_error` | ❌ | Red | `Error: {message}` |

All of this goes to **stderr**. JSON goes to **stdout**. This follows the harness convention established in doctor.ts.

---

## 4. Agent Experience: Structured JSON Output

### Running an Agent (Agent/CI View)

When an agent or CI pipeline runs the command, they get clean JSON:

```bash
$ just harness agent run smoke-test --json 2>/dev/null

{
  "command": "agent run",
  "status": "ok",
  "timestamp": "2026-03-07T08:15:45.123Z",
  "data": {
    "agentSlug": "smoke-test",
    "runId": "2026-03-07T08-15-00Z",
    "runDir": "harness/agents/smoke-test/runs/2026-03-07T08-15-00Z",
    "sessionId": "cee9a7ba-1234-5678-abcd-ef0123456789",
    "result": "completed",
    "exitCode": 0,
    "validated": true,
    "validationErrors": [],
    "duration": 45.2,
    "eventCount": 47,
    "artifacts": {
      "report": "output/report.json",
      "events": "events.ndjson",
      "completed": "completed.json",
      "logs": "logs/"
    }
  }
}
```

### Error Cases

**Agent failed:**
```json
{
  "command": "agent run",
  "status": "error",
  "timestamp": "...",
  "error": {
    "code": "E120",
    "message": "Agent execution failed: Copilot returned exit code 1",
    "details": {
      "agentSlug": "smoke-test",
      "runId": "2026-03-07T08-15-00Z",
      "exitCode": 1,
      "stderr": "Error: GH_TOKEN not set",
      "sessionId": null,
      "duration": 2.1
    }
  }
}
```

**Validation failed:**
```json
{
  "command": "agent run",
  "status": "degraded",
  "timestamp": "...",
  "data": {
    "agentSlug": "smoke-test",
    "runId": "2026-03-07T08-15-00Z",
    "sessionId": "cee9a7ba-...",
    "result": "completed",
    "validated": false,
    "validationErrors": [
      "Missing required field: retrospective.magicWand",
      "screenshots[2].viewport must be string, got number"
    ],
    "duration": 38.7
  }
}
```

**Why `degraded` not `error`**: The agent completed its work — it just didn't produce valid structured output. This is a quality issue, not a system failure. Exit 0 (degraded) lets callers decide what to do.

### New Error Codes

| Code | Meaning |
|------|---------|
| E120 | Agent execution failed (Copilot CLI returned non-zero) |
| E121 | Agent not found (slug doesn't exist in agents/) |
| E122 | Agent auth missing (no GH_TOKEN) |
| E123 | Agent timeout (exceeded --timeout) |
| E124 | Agent output validation failed (schema mismatch) |
| E125 | Agent run folder creation failed |

---

## 5. Turn Logging & Auditability

### events.ndjson — Full Event Stream

Every agent event is logged as a line in `events.ndjson`. This is the complete audit trail.

```jsonl
{"type":"session_start","timestamp":"2026-03-07T08:15:01.000Z","data":{"sessionId":"cee9a7ba-..."}}
{"type":"thinking","timestamp":"2026-03-07T08:15:02.100Z","data":{"content":"I need to check the harness health first..."}}
{"type":"tool_call","timestamp":"2026-03-07T08:15:03.200Z","data":{"toolName":"Bash","input":"just harness health","toolCallId":"tc-001"}}
{"type":"tool_result","timestamp":"2026-03-07T08:15:04.500Z","data":{"toolCallId":"tc-001","output":"{\"command\":\"health\",...}","isError":false}}
{"type":"text_delta","timestamp":"2026-03-07T08:15:05.000Z","data":{"content":"Health check passed. "}}
{"type":"text_delta","timestamp":"2026-03-07T08:15:05.100Z","data":{"content":"Now taking screenshots..."}}
{"type":"tool_call","timestamp":"2026-03-07T08:15:06.000Z","data":{"toolName":"Bash","input":"just harness screenshot homepage-desktop --viewport desktop-lg","toolCallId":"tc-002"}}
{"type":"tool_result","timestamp":"2026-03-07T08:15:08.200Z","data":{"toolCallId":"tc-002","output":"{\"command\":\"screenshot\",...}","isError":false}}
{"type":"message","timestamp":"2026-03-07T08:15:45.000Z","data":{"content":"Report written. All tasks complete."}}
{"type":"session_idle","timestamp":"2026-03-07T08:15:45.100Z","data":{}}
```

### How Events Are Captured

The runner parses events from the Copilot CLI's `events.jsonl` file (located in the log directory) using the same incremental polling pattern from `CopilotCLIAdapter`:

```
Copilot CLI → writes events.jsonl → Runner tails → parses → events.ndjson
                                                           → stderr display
                                                           → real-time streaming
```

The runner uses `parseEventsJsonlLine()` from `events-jsonl-parser.ts` (or reimplements the same mapping) to translate raw Copilot events to unified `AgentEvent` types.

### completed.json — Run Metadata

Written after the agent finishes (or fails). This is the primary record for later investigation.

```json
{
  "agentSlug": "smoke-test",
  "runId": "2026-03-07T08-15-00Z",
  "startedAt": "2026-03-07T08:15:00.000Z",
  "completedAt": "2026-03-07T08:15:45.123Z",
  "duration": 45.123,
  "sessionId": "cee9a7ba-1234-5678-abcd-ef0123456789",
  "result": "completed",
  "exitCode": 0,
  "validated": true,
  "validationErrors": [],
  "eventCount": 47,
  "toolCallCount": 6,
  "thinkingTokens": 1250,
  "artifacts": [
    "output/report.json",
    "output/screenshots/homepage-desktop-desktop-lg.png",
    "output/screenshots/homepage-tablet-tablet.png",
    "output/screenshots/homepage-mobile-mobile.png"
  ],
  "promptVersion": "abc123f",
  "copilotVersion": "0.0.420"
}
```

### Auditability Guarantees

| What | Where | When Written | Persists? |
|------|-------|-------------|-----------|
| Agent prompt (frozen) | `runs/{id}/prompt.md` | Run start | ✅ Git-eligible |
| Agent instructions (frozen) | `runs/{id}/instructions.md` | Run start | ✅ Git-eligible |
| Raw Copilot logs | `runs/{id}/logs/` | During run | ✅ Ephemeral |
| Parsed event stream | `runs/{id}/events.ndjson` | During run (incremental) | ✅ Git-eligible |
| CLI stderr capture | `runs/{id}/stderr.log` | During run | ✅ Ephemeral |
| Agent output files | `runs/{id}/output/` | During run | ✅ Git-eligible |
| Run metadata | `runs/{id}/completed.json` | Run end | ✅ Git-eligible |

**Git-eligible** files can be committed for historical record if desired. **Ephemeral** files (raw logs, stderr) are useful for debugging but not worth versioning.

### Reviewing Past Runs

```bash
# List all runs for an agent
just harness agent history smoke-test

# Output:
# smoke-test runs (3 total):
#   2026-03-07T08-15-00Z  ✓ pass   45.2s  session=cee9a7ba
#   2026-03-06T14-30-00Z  ✗ fail   12.1s  session=deadbeef (timeout)
#   2026-03-06T10-00-00Z  ~ partial 38.7s  session=cafebabe (validation failed)

# Read a specific run's completed.json
cat harness/agents/smoke-test/runs/2026-03-07T08-15-00Z/completed.json | jq .

# Replay event stream
cat harness/agents/smoke-test/runs/2026-03-07T08-15-00Z/events.ndjson | jq .

# View the agent's output
cat harness/agents/smoke-test/runs/2026-03-07T08-15-00Z/output/report.json | jq .
```

---

## 6. CLI Command Design

### Command Surface

```bash
# Run an agent
just harness agent run <slug> [options]

# List available agents
just harness agent list

# Show run history for an agent
just harness agent history <slug> [--limit N]

# Validate last run's output against schema
just harness agent validate <slug> [--run <runId>]

# Clean old runs (keep last N)
just harness agent clean <slug> [--keep N]
```

### `agent run` Options

| Option | Default | Description |
|--------|---------|-------------|
| `--timeout <seconds>` | 300 | Max agent execution time |
| `--validate` | true | Validate output against schema after completion |
| `--no-validate` | — | Skip schema validation |
| `--cwd <path>` | repo root | Working directory for the agent |
| `--env <KEY=VAL>` | — | Extra env vars passed to Copilot CLI |
| `--resume <runId>` | — | Resume a previous run's session |

### Commander.js Registration Pattern

Following the established harness CLI pattern:

```typescript
export function registerAgentCommand(program: Command): void {
  const agent = program
    .command('agent')
    .description('Run and manage declarative sub-agents');

  agent
    .command('run <slug>')
    .description('Run an agent from its definition folder')
    .option('--timeout <seconds>', 'Max execution time', '300')
    .option('--no-validate', 'Skip output schema validation')
    .option('--cwd <path>', 'Working directory for agent')
    .option('--resume <runId>', 'Resume a previous run session')
    .action(async (slug: string, opts) => {
      // 1. Validate slug (path traversal prevention)
      // 2. Check agent folder exists
      // 3. Check GH_TOKEN
      // 4. Create run folder with ISO timestamp
      // 5. Copy prompt.md + instructions.md
      // 6. Spawn Copilot CLI subprocess
      // 7. Tail events, display progress
      // 8. Validate output schema
      // 9. Write completed.json
      // 10. Return HarnessEnvelope
    });

  agent
    .command('list')
    .description('List available agent definitions')
    .action(async () => {
      // Scan harness/agents/ for folders with prompt.md
    });

  agent
    .command('history <slug>')
    .description('Show run history for an agent')
    .option('--limit <n>', 'Max runs to show', '10')
    .action(async (slug: string, opts) => {
      // Scan runs/ folder, read completed.json, display table
    });

  agent
    .command('validate <slug>')
    .description('Validate last run output against schema')
    .option('--run <runId>', 'Specific run to validate')
    .action(async (slug: string, opts) => {
      // Read output-schema.json, validate output/report.json
    });
}
```

---

## 7. Inspiration from Existing E2E Scripts

### Patterns Worth Adopting

From the justfile and scripts directory, several patterns are directly applicable:

#### 7a. VerboseCopilotAdapter Pattern (from `test-copilot-serial.ts`)

The transparent wrapper that adds colored event logging around the real adapter:

```
[12:34:56] 🔧 spec-writer ⟩ Bash: just harness health
[12:34:57] spec-writer ⟩ → ok (0.8s)
[12:34:58] 💭 spec-writer ⟩ Checking console logs via CDP...
[12:35:01] 🔧 spec-writer ⟩ Write: output/report.json
```

**Adopt**: Per-event timestamped display with tool name and input/output previews.

#### 7b. Session Watcher Pattern (from `scripts/session-watcher.ts`)

The real-time events.jsonl tailer with colored output:

```
[user.message] GREEN "Run the smoke test"
[assistant.reasoning_delta] MAGENTA dim streaming...
[tool.execution_start] YELLOW "Bash"
[tool.execution_complete] YELLOW "→ ok"
```

**Adopt**: File-tailing with incremental byte reading, color-coded event types, fallback polling.

#### 7c. Advanced Pipeline Patterns (from `test-advanced-pipeline.ts`)

| Pattern | What It Does | Applicable? |
|---------|-------------|-------------|
| Q&A Watcher | Scripted answers to agent questions | Future: `qa.json` for non-interactive runs |
| Session Inheritance | Pass sessionId between nodes | Future: multi-turn agent runs |
| Parallel Fan-out | Multiple agents run concurrently | Future: parallel agent runs |
| Assertion Framework | Verify outputs, session chains | Yes: schema validation + completed.json assertions |

**Adopt (now)**: Assertion/validation pattern.
**Adopt (future)**: Q&A scripting, session inheritance.

#### 7d. Session Demo Pattern (from `copilot-session-demo.ts`)

The subprocess spawn + log polling pattern:

```typescript
const child = spawn('npx', ['-y', '@github/copilot', '--yolo', '-p', prompt], {
  stdio: ['ignore', 'pipe', 'pipe'],
  cwd: workingDir,
  env: { ...process.env, ...extraEnv },
});
```

**Adopt**: This is the core subprocess invocation pattern.

### What NOT to Adopt

| Pattern | Why Not |
|---------|---------|
| `cg agent run` (CLI app) | Requires monorepo build, DI container, shared deps |
| DI-based adapter factory | Harness is external tooling, no DI container needed |
| SSE broadcasting | No web UI — terminal + files only |
| Session persistence via `~/.config/chainglass/agents/` | Agents use run folders, not global registry |

---

## 8. Distinction from Positional Graph / Workflow System

### What This Is

The harness agent runner is a **simple, imperative, single-agent execution tool**:

- One agent, one prompt, one run folder
- Human or CI triggers it via CLI
- Agent runs to completion, produces output
- Schema validates the output
- Everything logged in the run folder

### What This Is NOT

| Feature | Harness Agent Runner | Positional Graph / Workflows |
|---------|---------------------|------------------------------|
| **Orchestration** | None — single agent, linear | Multi-node DAGs with fan-out/join |
| **State machine** | Started → Running → Complete/Failed | Complex: pending → ready → working → complete with transitions |
| **Session management** | Optional resume via `--resume` | Automatic context inheritance, session chaining |
| **Q&A handling** | Agent handles its own questions | WorkflowEvents observer pattern, scripted Q&A |
| **Parallelism** | One agent at a time | Parallel lines, concurrent execution |
| **Persistence** | File-based run folders | GlobalStateSystem, WorkUnitStateService |
| **UI integration** | Terminal only | Full web UI (AgentChipBar, AgentOverlayPanel) |
| **Scope** | Harness-specific tasks | General-purpose workflow orchestration |

**The relationship**: Harness agents could eventually _be executed by_ workflow nodes, but they are not themselves a workflow system. A workflow might include a "run harness smoke test" node that shells out to `just harness agent run smoke-test` — but that's composition, not coupling.

---

## 9. The First Agent: `smoke-test`

### What It Does

1. Boot check — `just harness doctor --wait`
2. Health verification — `just harness health`
3. Screenshot capture — 3 viewports (desktop, tablet, mobile)
4. Console error check — Navigate pages, collect browser console logs
5. Server log check — Container log tail for errors
6. Structured report — `output/report.json` validated against schema
7. Retrospective — Honest feedback on harness experience

### Why This Agent First

- Exercises all harness capabilities (boot, interact, observe)
- Produces concrete, verifiable output (screenshots, JSON)
- Schema validation proves the concept
- Retrospective feeds back into harness improvement
- We've already tested this flow manually (Test Runs #1 and #2)
- The existing `harness/prompts/screenshot-audit.md` is a simpler precursor

### Expected Run Time

- Cold boot (first time): ~3-5 min (mostly waiting for container)
- Warm run (container already up): ~30-60s
- Agent thinking + tool calls: ~30-45s
- Total warm: ~60-90s

---

## 10. Schema Validation Design

### Validation Flow

```
Agent completes
    │
    ▼
Read output-schema.json from agent folder
    │
    ▼
Read output/report.json from run folder
    │
    ▼
Validate with Zod (compile JSON Schema → Zod schema)
    │
    ├─ Pass → completed.json: validated=true
    │
    └─ Fail → completed.json: validated=false, validationErrors=[...]
              Envelope status: "degraded" (not "error")
```

### Implementation

Zod already in harness deps. Two approaches:

**Option A: Native Zod schemas** — Agent definitions include a `.ts` file with Zod schemas
- Pro: Type-safe, rich validation
- Con: Requires TypeScript compilation, less portable

**Option B: JSON Schema + runtime validation** — Agent definitions include `.json` schema
- Pro: Language-agnostic, standard format, easy to generate
- Con: Less expressive than Zod

**Decision**: **Option B (JSON Schema)**. Agent definitions should be portable and easy to author. Use `ajv` or a lightweight JSON Schema validator. The harness already uses Zod internally, but agent authors shouldn't need to write TypeScript.

### Validation Library

Add `ajv` (Another JSON Validator) to `harness/package.json`:
- Standard JSON Schema Draft 2020-12 support
- Lightweight (~45KB)
- Battle-tested (900M+ weekly npm downloads)

---

## Open Questions

### Q1: Should run folders be gitignored?

**RESOLVED**: Run folders (`harness/agents/*/runs/`) should be **gitignored by default**. They contain ephemeral artifacts (logs, screenshots, raw CLI output). If a run produces valuable output (e.g., a regression baseline), the user can explicitly commit specific files. The `completed.json` metadata is small enough to commit for historical record if desired, but this should be opt-in.

### Q2: Should agents be able to modify the codebase?

**RESOLVED**: Yes, with `--yolo` flag. The smoke-test agent only reads, but future agents (e.g., "fix-lint-errors") would write. The Copilot CLI's `--yolo` flag auto-approves all tool executions. The run folder captures what happened (events.ndjson shows all tool calls), providing full auditability.

### Q3: How do we handle agent timeouts?

**RESOLVED**: Configurable via `--timeout` (default 300s). The runner kills the Copilot CLI process on timeout, writes `completed.json` with `result: "timeout"`, and returns `E123` error code. Partial events.ndjson is preserved for debugging.

### Q4: Can agents be resumed after failure?

**RESOLVED**: Yes, via `--resume <runId>`. The runner reads `completed.json` from the specified run, extracts the `sessionId`, and passes `--resume <sessionId>` to the Copilot CLI. This allows multi-turn recovery: "The screenshot failed, please retry the screenshot step."

### Q5: How do we handle the `--yolo` security concern?

**RESOLVED**: Harness agents run in a development context against a Docker container. `--yolo` is appropriate because:
- The container is isolated (not production)
- The agent's scope is defined by its prompt
- All tool calls are logged in events.ndjson
- The harness itself runs with `DISABLE_AUTH=true`
- This is explicitly development infrastructure

### Q6: Should we support multiple agent types (Claude, Copilot)?

**OPEN**: For now, **Copilot CLI only** via `npx @github/copilot`. The subprocess pattern makes it easy to add Claude Code (`npx claude`) later — different binary, same runner structure. Not needed for v1.

---

## Quick Reference

```bash
# === Agent Management ===
just harness agent list                        # Available agents
just harness agent run smoke-test              # Run an agent
just harness agent run smoke-test --timeout 60 # With timeout
just harness agent run smoke-test --no-validate # Skip schema check
just harness agent history smoke-test          # Past runs
just harness agent validate smoke-test         # Re-validate last run
just harness agent clean smoke-test --keep 5   # Prune old runs

# === Inspect a Run ===
cat harness/agents/smoke-test/runs/LATEST/completed.json | jq .
cat harness/agents/smoke-test/runs/LATEST/events.ndjson | jq .
cat harness/agents/smoke-test/runs/LATEST/output/report.json | jq .
ls harness/agents/smoke-test/runs/LATEST/output/screenshots/

# === Agent Development ===
mkdir -p harness/agents/my-agent
# Create prompt.md, output-schema.json, (optional) instructions.md
just harness agent run my-agent                # Test it
```
