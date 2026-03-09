# Research Report: Harness Agent Runner for System Verification

**Generated**: 2026-03-07T07:55:00Z
**Research Query**: "Agent harness for system verification — adding sub-agent runner capabilities to the harness CLI"
**Mode**: Pre-Plan
**Location**: docs/plans/070-harness-agent-runner/exploration.md
**FlowSpace**: Available
**Findings**: 61 across 8 subagents

## Executive Summary

### What It Does
The proposed harness agent runner adds the ability to run declarative, schema-validated sub-agents from the existing harness CLI. Agents live in `harness/agents/<agent-slug>/` with a main prompt and output schema. The CLI orchestrates Copilot CLI runs, captures structured results into ISO-dated run folders, and validates outputs against the declared schema.

### Business Purpose
Close the "agentic verification" loop: the harness can boot, interact with, and observe the app — but cannot yet dispatch autonomous sub-agents to perform complex verification tasks (smoke tests, audits, regressions). This makes the harness a first-class agent orchestration surface for dogfooding and quality assurance.

### Key Insights
1. **CLI subprocess is the right integration path** — The harness should invoke `copilot` (or `cg agent run`) via subprocess, NOT import agent adapter code directly. This preserves the external tooling boundary.
2. **Rich agent infrastructure already exists** — 2,800+ lines of battle-tested agent orchestration code (SdkCopilotAdapter, CopilotCLIAdapter, AgentManagerService, NDJSON storage). The harness reuses patterns, not code.
3. **The CopilotCLIAdapter's file-tailing pattern is the template** — Spawn process, tail events.jsonl, parse NDJSON lines, broadcast events, collect final result. This is exactly what the harness agent runner needs.

### Quick Stats
- **Agent infrastructure**: 2,800+ LOC across 30+ files in 3 packages
- **Adapters**: 3 (SdkCopilot, ClaudeCode, CopilotCLI) + fakes
- **Contracts**: 11 public interfaces in agents domain
- **Test coverage**: 8 contract test files, 9 integration tests, 16 fake implementations
- **Prior learnings**: 15 relevant discoveries from Plans 034, 059, 067
- **Domains**: 2 directly relevant (agents, _platform/sdk), harness stays external

## How It Currently Works

### Agent Adapter Architecture

The agents domain (`docs/domains/agents/domain.md`) provides multi-adapter AI agent lifecycle management:

| Adapter | How It Works | Relevance to Harness |
|---------|-------------|---------------------|
| **SdkCopilotAdapter** | Wraps `@github/copilot-sdk`, creates sessions, translates events | Reference for event types |
| **ClaudeCodeAdapter** | Spawns `claude` CLI process via ProcessManager | Subprocess pattern model |
| **CopilotCLIAdapter** | Attaches to tmux session, tails `events.jsonl` via polling | **Primary template** for harness |

### Core Execution Flow

```
1. AgentManagerService.createAgent({type, name, workspace})
   → Creates AgentInstance wrapping adapter via factory
   
2. agent.run({prompt, cwd, onEvent})
   → Status: stopped → working
   → Delegates to adapter.run()
   → Adapter streams AgentEvent objects
   
3. AgentInstance._captureEvent(event)
   → Store in memory array
   → Persist to NDJSON file (async)
   → Broadcast via SSE notifier
   
4. Adapter completes → AgentResult returned
   → {output, sessionId, status, exitCode, tokens}
   → Status: working → stopped|error
```

### Key Data Contracts

**AgentRunOptions** (input):
```typescript
{ prompt: string; sessionId?: string; cwd?: string; onEvent?: AgentEventHandler }
```

**AgentResult** (output):
```typescript
{ output: string; sessionId: string; status: 'completed'|'failed'|'killed'; exitCode: number; tokens: TokenMetrics|null }
```

**AgentEvent** (streaming — 9 discriminated types):
`text_delta | message | usage | session_idle | session_start | session_error | tool_call | tool_result | thinking`

### CopilotCLIAdapter — The Harness Template

This adapter is the closest match to what the harness needs:

1. Does NOT spawn the process — attaches to a running session
2. Injects input via `tmux send-keys`
3. Tails `events.jsonl` file incrementally (poll every 500ms)
4. Parses NDJSON lines into AgentEvent objects
5. Resolves when `session_idle` event received or timeout

```typescript
// Key polling pattern from CopilotCLIAdapter
private tailUntilIdle(eventsPath, onEvent?) {
  const poll = () => {
    const stat = fs.statSync(eventsPath);
    if (stat.size > bytesRead) {
      // Read new bytes, parse NDJSON lines
      for (const line of lines) {
        const event = parseEventsJsonlLine(line);
        onEvent?.(event);
        if (event.type === 'session_idle') return resolve('idle');
      }
    }
    setTimeout(poll, 500);
  };
  poll();
}
```

## Architecture & Design

### Proposed Agent Runner Architecture

```
harness/
├── agents/                        # Agent definitions
│   └── <agent-slug>/
│       ├── prompt.md              # Main prompt (Markdown)
│       ├── output-schema.json     # Expected output schema (JSON Schema or Zod)
│       ├── instructions.md        # Agent-specific instructions (optional)
│       └── runs/                  # Run history
│           └── 2026-03-07T08-15-00Z/
│               ├── prompt.md      # Copy of prompt at run time
│               ├── output/        # Agent-produced files
│               │   ├── report.json
│               │   └── screenshots/
│               ├── completed.json # Run metadata + session ID
│               └── events.ndjson  # Agent event stream (optional)
├── src/cli/commands/agent.ts      # `harness agent run <slug>` command
├── src/agent/                     # Agent runner infrastructure
│   ├── runner.ts                  # Orchestrates CLI subprocess
│   ├── validator.ts               # Schema validation of outputs
│   └── types.ts                   # AgentRunConfig, AgentRunResult
```

### Three Integration Paths Evaluated

| Path | Pattern | Verdict |
|------|---------|---------|
| **A: CLI Subprocess** ✅ | Harness shells out to Copilot CLI binary | **Recommended** — clean boundary, all adapters available |
| B: Docker exec + CLI | `docker exec` into container + `cg agent run` | Complex shell escaping, less testable |
| C: Direct adapter import | Import `SdkCopilotAdapter` from `@chainglass/shared` | Violates external tooling boundary |

**Path A** is recommended because:
- Preserves harness as external tooling (no `@chainglass/shared` dependency)
- Reuses battle-tested CLI agent infrastructure (2,800+ LOC)
- Supports all 3 adapters transparently
- JSON output parsing is straightforward
- Session ID returned for resumption

### Proposed CLI Command

```bash
# Run an agent from its definition folder
just harness agent run smoke-test

# With options
just harness agent run smoke-test --timeout 300 --validate

# List available agents
just harness agent list

# Show run history
just harness agent history smoke-test

# Validate last run output against schema
just harness agent validate smoke-test
```

### JSON Envelope for Agent Runs

```json
{
  "command": "agent run",
  "status": "ok",
  "data": {
    "agentSlug": "smoke-test",
    "runId": "2026-03-07T08-15-00Z",
    "runDir": "harness/agents/smoke-test/runs/2026-03-07T08-15-00Z",
    "sessionId": "abc-123",
    "result": "completed",
    "validated": true,
    "duration": 45.2,
    "summary": "Smoke test passed: 3 screenshots, 0 errors, 2 suggestions"
  }
}
```

## Dependencies & Integration

### What Harness Agent Runner Depends On

| Dependency | Type | How Consumed | Risk |
|-----------|------|-------------|------|
| Copilot CLI binary | External | Subprocess spawn | Must be installed on host |
| `GH_TOKEN` env var | Auth | Passed to subprocess | Required for Copilot SDK |
| Harness CLI infrastructure | Internal | Commander.js, output.ts, ports | Zero risk (we own it) |
| Zod | Internal | Schema validation | Already in harness/package.json |
| Agent prompt templates | Internal | Markdown files in agents/ | We create them |

### What Depends On This

Nothing — the agent runner is a leaf consumer. It adds zero new contracts to the domain graph.

### Integration with Existing Harness

The agent runner composes with existing harness capabilities:
- `harness doctor --wait` → Ensure harness healthy before agent run
- `harness screenshot` → Agent can use this during its run
- `harness health` → Agent can verify system state
- `harness results` → Agent can read test results

## Quality & Testing

### Testing Strategy

| Layer | Tool | What It Tests |
|-------|------|--------------|
| Unit | Vitest | Schema validation, run folder creation, config parsing |
| Unit | Vitest | Agent slug validation (path traversal prevention) |
| Integration | Vitest | CLI subprocess invocation, JSON output parsing |
| Smoke | Manual | Full agent run against live harness container |

### Key Patterns to Follow
- **5-field Test Doc blocks** (Why/Contract/Notes/Quality/Worked Example) per QT-01
- **Contract test factories** per QT-02 — test real and fake runners identically
- **describe.skip for slow tests** per PL-13 — real agent runs excluded from `just fft`
- **Fake adapter** for unit tests per QT-03 — runner tests use a fake that returns canned results

## Prior Learnings (From Previous Implementations)

### 📚 PL-01: Agent Diagnostic Cascade (FX001)
**Action**: Agent runner must call `harness doctor --wait` before starting. Don't let agents debug infrastructure.

### 📚 PL-03: Port Persistence (FX001)
**Action**: .env auto-generated on every CLI call. Agent runner inherits this — no port issues.

### 📚 PL-04: One Container Per Worktree (FX001)
**Action**: Multiple agent runs share one container. Each gets own CDP browser context if needed.

### 📚 PL-05: Cold Boot Wait Guidance (Test Run #1)
**Action**: Agent prompt must include timing expectations. `doctor --wait` handles blocking.

### 📚 PL-06: Versioned Prompts (FX001)
**Action**: Agent definitions in `harness/agents/` are the versioned API surface. Commit them.

### 📚 PL-09: Turbopack External Packages (Plan 059)
**Action**: If agent runner ever needs to import SDK directly (it shouldn't), `serverExternalPackages` config is required.

### 📚 PL-10: Adapter Factory Eager Instantiation (Plan 059)
**Action**: Agent adapter creation can fail at construction time. CLI subprocess approach avoids this — the CLI handles it.

### 📚 PL-11: E2E Event Output Parsing (Plan 034)
**Action**: NDJSON stream mixes event lines and result lines. Parse each line independently.

### 📚 PL-14: Actionable Error Messages (Workshop 003)
**Action**: Every agent run failure must include the fix command.

## Domain Context

### Existing Domains Relevant

| Domain | Relationship | What Harness Consumes |
|--------|-------------|---------------------|
| `agents` | Consumer (via CLI) | `cg agent run` command, AgentResult JSON, AgentEvent NDJSON |
| `_platform/sdk` | Implicit (via CLI) | CopilotClient is wired inside CLI, not imported by harness |

### Domain Map Position

The harness agent runner is a **pure consumer at the leaf of the dependency tree**. It adds:
- Zero new contracts to the domain graph
- Zero new domains
- Zero cross-domain imports

```
agents domain ──exports──> cg agent run CLI
                                   │
                           subprocess call
                                   │
harness (external) ──consumes──> JSON output
```

### Domain Action Required

**None.** Harness stays external tooling per ADR-0014. No domain extraction needed.

## Critical Discoveries

### 🚨 Critical Finding 01: CLI Subprocess is Only Viable Path
**Impact**: Critical
**Sources**: DB-01, DB-02, DB-04, DC-03
**Why**: Importing `@chainglass/shared` would break the external tooling boundary, require adding the copilot SDK (2.5MB), and couple harness to monorepo build. CLI subprocess keeps harness independent.

### 🚨 Critical Finding 02: NDJSON Event Parsing Needs Care
**Impact**: High
**Sources**: IA-03, PL-11, PS-05
**Why**: Agent output mixes event lines (`{"type":"..."}`) and result lines (`{"status":"..."}`) on the same stream. Parse each line independently, handle malformed lines gracefully.

### 🚨 Critical Finding 03: Agent Authentication Required
**Impact**: High
**Sources**: DC-08, DC-03
**Why**: Copilot SDK requires `GH_TOKEN` env var. The harness must either inherit it from the host environment or provide explicit guidance when it's missing. Doctor should check for this.

### 🚨 Critical Finding 04: Run Folder Isolation is Essential
**Impact**: High
**Sources**: IA-07, PS-07, IC-06
**Why**: Each agent run needs its own folder with copies of prompts and isolated output space. Agent ID validation must prevent path traversal (per existing `validateAgentId` pattern). ISO-dated run IDs provide natural ordering.

### 🚨 Critical Finding 05: Schema Validation is the Differentiator
**Impact**: High
**Sources**: PS-06, IC-04
**Why**: The unique value proposition of harness agents over plain prompt templates is that the output is schema-validated. Zod is already in harness deps. JSON Schema or Zod schema in `output-schema.json` validates the structured report.

## Modification Considerations

### ✅ Safe to Build

1. **Agent folder structure** (`harness/agents/`) — Greenfield, no existing code
2. **CLI command registration** — Follows established Commander.js pattern in harness
3. **Schema validation** — Zod already in deps, well-understood pattern
4. **Run folder management** — Standard filesystem operations

### ⚠️ Build with Care

1. **CLI subprocess orchestration** — Must handle: timeouts, interrupted runs, partial output, authentication failures
2. **NDJSON parsing** — Mixed event/result shapes, malformed lines, encoding issues
3. **Prompt template design** — These are the agent API; poor prompts = poor results

### 🚫 Avoid

1. **Importing `@chainglass/shared`** — Breaks external tooling boundary
2. **Running agents inside the Docker container** — Agents run on the host and interact with the container via HTTP/CDP
3. **Building a DI container in harness** — Unnecessary complexity; subprocess handles adapter wiring

## Recommendations

### If Building This (Recommended Approach)

1. **`harness agent run <slug>`** — Creates run folder, copies prompt, spawns Copilot CLI subprocess, tails output, validates schema, writes completed.json
2. **Agent definitions** are versioned folders in `harness/agents/`
3. **First agent: `smoke-test`** — Boots harness, grabs screenshots, checks logs, validates report schema, provides retrospective
4. **Schema validation** via Zod at run completion — required outputs validated, optional outputs accepted
5. **completed.json** stores session ID, timing, validation result — enables later investigation

### Testing Approach

- **Lightweight** — Unit tests for validator/folder creation, integration test for CLI command
- **Real agent runs** as `describe.skip` tests (not in `just fft`)
- **Fake runner** for unit tests that returns canned AgentResult

## External Research Opportunities

### Research Opportunity 1: Copilot CLI Binary Invocation

**Why Needed**: We need to know the exact CLI invocation pattern for the Copilot CLI binary from a subprocess — flags, environment, output format.
**Impact on Plan**: Determines the subprocess command template.
**Source Findings**: DC-06, DB-03

**Ready-to-use prompt:**
```
/deepresearch "What is the exact CLI invocation for @github/copilot CLI binary?
- How to pass a prompt via stdin or argument
- How to specify working directory
- What output format (JSON, NDJSON) is produced
- How to pass authentication (GH_TOKEN)
- How to enable streaming mode
- Session resumption flags
Context: Building a subprocess wrapper that spawns copilot CLI and captures structured output."
```

---

**Research Complete**: 2026-03-07T07:55:00Z
**Report Location**: docs/plans/070-harness-agent-runner/exploration.md

**Next steps:**
1. Run `/plan-1b-specify` to create the feature specification
2. Optionally run `/deepresearch` for Copilot CLI invocation details
