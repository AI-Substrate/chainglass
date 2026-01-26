---
title: "ADR-0006: CLI-Based Workflow Agent Orchestration Pattern"
status: "Accepted"
date: "2026-01-26"
authors: "Development Team; AI Agents"
tags: ["architecture", "decision", "workflow", "agents", "orchestration", "cli", "session-management"]
supersedes: ""
superseded_by: ""
---

# ADR-0006: CLI-Based Workflow Agent Orchestration Pattern

## Status

**Accepted**

This ADR documents the validated orchestration pattern for multi-phase AI agent workflows, established through Phase 6 of the Entity Upgrade initiative. The pattern serves as the **canonical exemplar** for web system implementation.

## Context

Chainglass requires programmatic orchestration of AI coding agents (Claude Code, Copilot) through multi-phase workflows. Each workflow consists of sequential phases (e.g., gather → process → report) where agents execute domain-specific tasks while maintaining context continuity across phase boundaries.

### Core Challenges

1. **Session Continuity**: Agents must maintain conversational context across multiple phase invocations without re-establishing state
2. **Process Isolation**: Agent failures must not crash the orchestration layer
3. **CWD Binding**: Agent sessions are tied to the working directory where they were created
4. **Output Parsing**: Agent results must be extractable from mixed stdout (logs + result JSON)
5. **Timeout Management**: Long-running agent tasks require configurable timeouts with graceful termination
6. **Multi-Agent Support**: Architecture must support multiple agent types (Claude Code, Copilot, future agents)

### Decision Drivers

- **R-ARCH-002**: Interface-first development with fakes for testing
- **R-ARCH-003**: Dependency injection via `useFactory` pattern (ADR-0004)
- **R-MCP-005**: STDIO discipline - stdout reserved for structured output
- **Constitution §1**: Filesystem-based state, git-auditable workflows
- **Constitution §2.1**: Services implement orchestration logic via interfaces

### Constraints from Validation (Phase 6)

Critical discoveries during manual test harness execution:

| ID | Discovery | Constraint |
|----|-----------|------------|
| DYK-07 | Claude Code sessions are CWD-bound | All phase invocations MUST use consistent `--cwd` (RUN_DIR, not PHASE_DIR) |
| DYK-08 | Session resumption requires dual flags | MUST pass BOTH `--fork-session` AND `--resume <id>` together |
| DYK-09 | Error handling must distinguish timeout vs adapter errors | AgentService MUST check error message prefix for timeout detection |
| DYK-10 | CLI outputs NDJSON format | Result JSON MUST be single-line; parse with `grep '"output"' \| tail -1` |
| DYK-11 | Workflow registration required for discovery | Workflows MUST exist in `.chainglass/workflows/<slug>/` for `cg runs` commands |
| DYK-12 | jq `//` operator treats `false` as falsy | Use `jq ".$key \| type"` for boolean key existence checks |

## Decision

**We adopt CLI-based subprocess orchestration** for invoking AI agents through multi-phase workflows. The orchestration layer invokes agents via `cg agent run/compact` CLI commands, maintaining session continuity through `sessionId` parameters and CWD binding.

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                 ORCHESTRATION PATTERN                       │
└─────────────────────────────────────────────────────────────┘

ORCHESTRATOR (Web App / CLI / External Tool)
    │
    ├─ cg workflow compose <slug>
    │   └─ Returns: RUN_DIR (.chainglass/runs/<slug>/v00X-xxx/run-YYYY-MM-DD-NNN/)
    │
    └─ For Each Phase:
        ├─ cg phase prepare <phase> --run-dir $RUN_DIR
        ├─ cg phase handover <phase> --run-dir $RUN_DIR
        │
        ├─ cg agent run --type claude-code \
        │     --prompt "..." \
        │     --cwd $RUN_DIR \
        │     [--session $SESSION_ID]
        │   └─ Returns: AgentResult JSON (sessionId, output, status, tokens)
        │
        ├─ IF not first phase:
        │   └─ cg agent compact --session $SESSION_ID
        │
        ├─ cg phase validate <phase> --check outputs
        └─ cg phase finalize <phase>
```

### Command Reference

#### `cg agent run` - Invoke Agent

```bash
cg agent run \
  --type {claude-code|copilot} \
  --prompt "Prompt text..." \
  --cwd "$RUN_DIR" \
  [--session <session-id>]
```

**Output** (JSON, single-line for NDJSON compatibility):
```json
{"output":"Agent response...","sessionId":"uuid","status":"completed","exitCode":0,"tokens":{"used":30455,"total":30455,"limit":200000}}
```

#### `cg agent compact` - Reduce Session Context

```bash
cg agent compact --type claude-code --session <session-id>
```

### Session Management Pattern

```bash
# Phase 1: NEW SESSION
RESULT=$(cg agent run --type claude-code --prompt "..." --cwd "$RUN_DIR")
SESSION_ID=$(echo "$RESULT" | jq -r '.sessionId')
echo "$SESSION_ID" > .current-session

# Phase 2+: RESUME SESSION (with context reduction)
SESSION_ID=$(cat .current-session | tr -d '[:space:]')
cg agent compact --type claude-code --session "$SESSION_ID"
RESULT=$(cg agent run --type claude-code --session "$SESSION_ID" --prompt "..." --cwd "$RUN_DIR")
```

**Critical**: All phase invocations MUST use the same `--cwd` value (RUN_DIR) to maintain session continuity. Sessions are bound to the CWD where they were created.

### Exemplar Implementation

**Canonical exemplar**: `docs/how/dev/manual-wf-run/` (7 shell scripts demonstrating the complete pattern)

| Script | Purpose |
|--------|---------|
| `01-clean-slate.sh` | Reset environment, remove previous runs |
| `02-compose-run.sh` | Create fresh run from registry template |
| `03-run-gather.sh` | Execute gather phase (NEW SESSION) |
| `04-run-process.sh` | Execute process phase (COMPACT + RESUME) |
| `05-run-report.sh` | Execute report phase (COMPACT + RESUME) |
| `06-validate-entity.sh` | Validate entity JSON structure |
| `07-validate-runs.sh` | Validate `cg runs` command output |

**Multi-Agent Testing**: Scripts 03-05 support `AGENT_TYPE` environment variable:
```bash
# Default (Claude Code)
./03-run-gather.sh

# Test with Copilot
AGENT_TYPE=copilot ./03-run-gather.sh

# Full workflow with Copilot
export AGENT_TYPE=copilot
./01-clean-slate.sh && ./02-compose-run.sh && ./03-run-gather.sh && ./04-run-process.sh && ./05-run-report.sh
```

## Consequences

### Positive

- **POS-001**: **Process Isolation** - Agent crashes do not crash the orchestration layer; subprocess boundaries provide fault isolation
- **POS-002**: **Language Independence** - Orchestrators written in Python, Go, Rust, or JavaScript can invoke the same CLI commands
- **POS-003**: **Full Agent Capabilities** - CLI provides access to complete Claude Code feature set (code execution, file I/O, tool use)
- **POS-004**: **Token Transparency** - Real usage reported by Claude Code; accurate cost tracking per workflow
- **POS-005**: **Session Continuity** - `sessionId` mechanism proven across multiple CLI invocations in Phase 6 validation
- **POS-006**: **Multi-Agent Support** - Architecture supports `--type claude-code`, `--type copilot`, and future agent types
- **POS-007**: **Testability** - Mock subprocess execution in unit tests; real CLI in integration tests
- **POS-008**: **Error Recovery** - POSIX signals provide graceful termination; failed phases can retry

### Negative

- **NEG-001**: **Subprocess Overhead** - 200-500ms per invocation for process spawn + stdio setup; acceptable for local dev, may need optimization for high-frequency web use
- **NEG-002**: **Output Marshalling** - JSON parsing required for every result; NDJSON format requires careful extraction
- **NEG-003**: **CWD Context Fragility** - Working directory must be passed explicitly via `--cwd`; easy to forget and causes session lookup failures
- **NEG-004**: **Shell Escaping Complexity** - Prompt arguments must be properly escaped for shell execution
- **NEG-005**: **Session Timeout Risk** - Long pauses between phase invocations may cause agent-side session timeout
- **NEG-006**: **Path Handling** - Absolute/relative path handling requires careful attention; misconfiguration causes silent failures

## Alternatives Considered

### Alternative 1: Direct API Calls (No CLI Wrapper)

- **ALT-001**: **Description**: Embed `AgentService` directly in orchestration layer; call `agentService.run()` programmatically without subprocess marshalling
- **ALT-002**: **Rejection Reason**: Web app runs in browser context (Next.js) where Node.js subprocess invocation is impossible for client-side code. Server-side invocation loses session state across HTTP requests. No code execution capability (chat-only API).

### Alternative 2: Queue-Based Async Orchestration

- **ALT-003**: **Description**: Push orchestration tasks to Redis/Bull queue; async workers consume and invoke agents; results stored in persistent result store
- **ALT-004**: **Rejection Reason**: Over-engineered for single-user local dev tool. Adds Redis/Bull operational complexity without commensurate benefit. Async execution introduces ordering ambiguity incompatible with phase sequencing. User expectations require synchronous feedback.

### Alternative 3: Event-Driven Workflow Engine

- **ALT-005**: **Description**: Model workflow phases as state machine states; events drive transitions; EventBus broadcasts state changes for UI/observability
- **ALT-006**: **Rejection Reason**: Abstraction burden outweighs benefits for linear phase execution. Debugging event ordering issues is subtle. Replay risks causing duplicate agent invocations. Team lacks event-driven architecture expertise.

### Alternative 4: Embedded Agent Runtime (In-Process)

- **ALT-007**: **Description**: Embed mini agent runtime in orchestration process; agents run as async functions with in-memory session context; direct Claude API calls
- **ALT-008**: **Rejection Reason**: Cannot execute arbitrary code (Claude Code's core capability). API keys exposed in web process memory (security risk). In-memory sessions lost on process restart. Chat-only capability insufficient for workflow automation.

## Implementation Notes

- **IMP-001**: **ClaudeCodeAdapter Session Flags** - Always pass BOTH `--fork-session` AND `--resume <id>` together (DYK-08). See `packages/shared/src/adapters/claude-code.adapter.ts:120-123`
- **IMP-002**: **AgentService Error Handling** - Distinguish timeout errors from adapter errors using error message prefix check (`errorMessage.startsWith('Timeout after ')`). See `packages/shared/src/services/agent.service.ts:131-180`
- **IMP-003**: **NDJSON Output Parsing** - CLI outputs NDJSON (logs + result). Extract result with `grep '"output"' | tail -1`. Agent command must use single-line JSON (`JSON.stringify(result)` not pretty-printed).
- **IMP-004**: **Workflow Registration** - Workflows must exist in `.chainglass/workflows/<slug>/current/` for `cg runs` commands to discover runs. Use `cg workflow checkpoint <slug>` to register.
- **IMP-005**: **CWD Binding** - All phase invocations MUST use RUN_DIR (run root) as `--cwd`, not per-phase directories. Sessions are bound to creation CWD.
- **IMP-006**: **Boolean Validation** - When validating entity JSON with jq, use `jq ".$key | type"` to check key existence (type `"null"` = missing). The `//` operator treats `false` as falsy.
- **IMP-007**: **Web Integration Migration** - Web system should invoke same CLI commands via server actions or API routes. Consider WebSocket for long-running operations to avoid HTTP timeout issues.
- **IMP-008**: **Token Tracking** - Store `result.tokens` per phase for cost attribution. Tokens accumulate across session; compact reduces but doesn't reset.

## References

- **REF-001**: [Entity Upgrade Spec](../plans/010-entity-upgrade/entity-upgrade-spec.md) - Parent specification for entity graph architecture
- **REF-002**: [Entity Upgrade Plan](../plans/010-entity-upgrade/entity-upgrade-plan.md) - Implementation plan including Phase 6 validation gates
- **REF-003**: [Phase 6 Tasks Dossier](../plans/010-entity-upgrade/tasks/phase-6-service-unification-validation/tasks.md) - Detailed task breakdown and DYK discoveries
- **REF-004**: [Phase 6 Execution Log](../plans/010-entity-upgrade/tasks/phase-6-service-unification-validation/execution.log.md) - Complete validation evidence with test results
- **REF-005**: [Manual Test Harness](../../how/dev/manual-wf-run/) - Canonical exemplar implementation (7 shell scripts)
- **REF-006**: [ADR-0004: Dependency Injection](./adr-0004-dependency-injection-container-architecture.md) - DI patterns for service registration
- **REF-007**: [Constitution](../project-rules/constitution.md) - Foundational principles including filesystem-based state

---

## Validation Evidence

Phase 6 validation gates all passed (2026-01-26):

| Gate | Status | Evidence |
|------|--------|----------|
| T018: Manual Test Harness | PASSED | All 7 scripts executed successfully |
| T019: Entity JSON Validation | PASSED | Workflow entity (12 keys) + Phase entity (3 keys) validated |
| T022: CI Pipeline | PASSED | 1840 tests pass |

This ADR is **production-validated** via the Phase 6 manual test harness execution.
