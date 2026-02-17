# Spec B: Prompts, CLI Driver, and Execution Tracking

**Mode**: Full
**File Management**: PlanPak
**Parent Spec**: [real-agent-pods-spec.md](real-agent-pods-spec.md)
**Depends On**: [Spec A: Orchestration Wiring](spec-a-orchestration-wiring.md)

## Research Context

- **Workshop 03**: [CLI-First Real Agent Execution](workshops/03-cli-first-real-agents.md) — `cg wf run` driver loop, PodManager execution tracking, terminal event output, three E2E test layers
- **Workshop 04**: [Node Starter & Resume Prompt Design](workshops/04-node-starter-and-resume-prompts.md) — Full prompt templates, CLI command inventory, walk-throughs, prompt selection logic
- **Workshop 05**: [PodManager Execution Tracking](workshops/05-podmanager-execution-tracking.md) — State machine, API design, driver loop integration, timing sequences, edge cases
- **Plan 032 Workshop 13**: [E2E Validation Script Design](../../032-node-event-system/workshops/13-e2e-validation-script-design.md) — Hybrid CLI/in-process test pattern, command mapping

### CLI Commands Verified Live

All agent-facing commands confirmed available in built CLI (2026-02-16):

| Command | Verified |
|---------|----------|
| `cg wf node accept <graph> <nodeId>` | ✅ |
| `cg wf node end <graph> <nodeId> --message` | ✅ |
| `cg wf node error <graph> <nodeId> --code --message` | ✅ |
| `cg wf node ask <graph> <nodeId> --type --text` | ✅ |
| `cg wf node get-answer <graph> <nodeId> <questionId>` | ✅ |
| `cg wf node collate <graph> <nodeId>` | ✅ |
| `cg wf node get-input-data <graph> <nodeId> <inputName>` | ✅ |
| `cg wf node save-output-data <graph> <nodeId> <outputName> <valueJson>` | ✅ |
| `cg wf node raise-event <graph> <nodeId> <eventType> --payload --source` | ✅ |

## Summary

Add the agent-facing prompt templates, the CLI-driven orchestration command, and the PodManager execution tracking that together enable `cg wf run <slug>` to drive real agents through the orchestration loop. Agents receive a generic starter prompt that teaches the workflow protocol and points them to their task-specific instructions via CLI. The driver loop waits for agents between iterations and prints events to the terminal.

## Goals

- **Agent bootstrap prompt**: A generic `node-starter-prompt.md` template teaches any agentic node the workflow protocol — accept, read inputs, do work, save outputs, complete — using parameterized CLI commands. The prompt is agnostic to the node being run; the actual task is read via CLI.
- **Agent resume prompt**: A generic `node-resume-prompt.md` for agents resuming after a pause, telling them to check for answers and continue from history
- **Prompt selection in AgentPod**: Starter prompt on first execution of a pod, resume prompt on subsequent executions (per Workshop 04 revised logic)
- **CLI-driven graph execution**: `cg wf run <slug>` drives the orchestration loop from the terminal
- **Execution tracking**: PodManager tracks fire-and-forget promises so the driver loop knows when agents complete
- **Observable terminal output**: Agent events flow through IAgentInstance handlers to stdout, prefixed with node ID

## Non-Goals

- ODS/AgentPod/PodCreateParams rewiring — that's Spec A (must be complete first)
- Real agent E2E tests — that's Spec C
- Web UI integration
- TUI / interactive terminal
- Interactive question handling (loop idles, human answers from separate terminal)
- Production daemon / watchdog
- Stuck-node auto-detection

## Complexity

- **Score**: CS-3 (medium)
- **Breakdown**: S=2, I=1, D=1, N=1, F=1, T=1
  - **S=2**: Prompt templates, AgentPod template resolution, PodManager execution tracking, CLI command handler, terminal event handler wiring
  - **I=1**: Depends on Spec A (orchestration wiring), Plan 030 (stable), Plan 032 events (stable)
  - **D=1**: Two new .md prompt files, GraphOrchestratorSettings possible extension
  - **N=1**: Prompt design is workshopped; driver loop pattern is well-understood; execution tracking has edge cases explored in Workshop 05
  - **F=1**: Real agent tests are slow but that's Spec C's concern; this spec tests with fakes
  - **T=1**: Unit tests for prompt selection, execution tracking; integration test for driver loop with fakes
- **Confidence**: 0.85 — Workshops 03/04/05 cover design thoroughly; driver loop timing is the main uncertainty
- **Dependencies**: Spec A (orchestration wiring) — MUST be complete first
- **Risks**:
  - Fire-and-forget Promise tracking timing edge cases (mitigated by Workshop 05 analysis)
  - Agents may not follow prompt instructions (mitigated by clear fail-fast rules and testing in Spec C)
  - Driver loop idle polling when no agents running (mitigated by configurable sleep)

## Acceptance Criteria

### Prompts

1. **AC-13**: A `node-starter-prompt.md` template exists at `packages/positional-graph/src/features/030-orchestration/` with placeholders (`{{graphSlug}}`, `{{nodeId}}`, `{{unitSlug}}`).
2. **AC-14**: The starter prompt instructs agents to: (a) accept the assignment via CLI, (b) read inputs via CLI (`collate` + `get-input-data`), (c) do their work with regular tools, (d) save outputs via CLI, (e) complete via CLI.
3. **AC-15**: The starter prompt includes the question protocol — how to ask a question (`cg wf node ask`) and the instruction to STOP after asking.
4. **AC-16**: The starter prompt includes error handling — how to report WF errors (`cg wf node error`) and the distinction between WF errors (fail fast) and work errors (handle normally).
5. **AC-17**: AgentPod resolves template placeholders before passing the prompt to the agent instance. Prompts are reloaded from disk each call (no caching).
6. **AC-18**: A `node-resume-prompt.md` template exists for agents resuming after a pause.
7. **AC-19**: The resume prompt tells the agent to check conversation history, check for answers to questions (`cg wf node get-answer`), and continue work without repeating prior work.
8. **AC-20**: AgentPod selects the starter prompt on the pod's first `execute()` call and the resume prompt on subsequent calls (using `_hasExecuted` flag, not sessionId — per Workshop 04 revised logic). Inherited sessions get the starter prompt on first execution.

### CLI Driver

9. **AC-21**: `cg wf run <slug>` command exists and drives the orchestration loop.
10. **AC-22**: The driver loop calls `handle.run()` repeatedly, processing one settle-decide-act pass per iteration.
11. **AC-23**: The driver loop waits for running agents between iterations via `podManager.waitForAnyCompletion()` (does not busy-loop).
12. **AC-24**: The driver loop exits with code 0 when the graph completes and code 1 when it fails.
13. **AC-25**: The driver loop has a configurable maximum iteration count (`--max-iterations`) to prevent infinite loops.
14. **AC-26**: The driver loop prints orchestration status to stdout (nodes started, nodes completed, idle state).

### Execution Tracking

15. **AC-27**: PodManager tracks fire-and-forget execution promises via `trackExecution(nodeId, promise)`. Promises are auto-cleaned from the map on settle (resolve or reject) via `.finally()`.
16. **AC-28**: PodManager provides `waitForAnyCompletion()` that resolves when any tracked execution finishes, returning the nodeId that completed.
17. **AC-29**: PodManager provides `hasRunningExecutions()` that returns whether any agents are still running.
18. **AC-30**: Session sync happens after agent completion — the driver reads `pod.sessionId`, calls `podManager.setSessionId()`, and persists so subsequent nodes can inherit.

### Observable Lifecycle

19. **AC-41**: Agent events flow through `IAgentInstance` event handlers to terminal output when running via `cg wf run`.
20. **AC-42**: Terminal output prefixes events with the node ID (e.g., `[spec-writer] I'll create...`).
21. **AC-43**: The orchestration loop can detect when an agent has completed (via PodManager execution tracking) and process completion events in the next settle pass.

## Open Questions

### OQ-02: Event handler wiring for `cg wf run`

How should terminal event handlers be attached to agent instances created during orchestration? Workshop 03 proposes three options:
- A: Hook on AgentManagerService (`onInstanceCreated`)
- B: ODS wires handler after instance creation
- C: CLI driver attaches handler via metadata nodeId (recommended)

### OQ-03: User-input node behavior in CLI driver

When `cg wf run` encounters a user-input node, should it:
- A: Idle silently until completed externally
- B: Print a message with the command needed to complete the node (recommended)
- C: Prompt on stdin (violates "no interactivity" constraint)

### OQ-04: Idle timeout for CLI driver

Should `cg wf run` have a configurable idle timeout? Options: no timeout (run until Ctrl+C), optional `--timeout` flag.

### OQ-05: Session type persistence

Should PodManager persist `sessionId → agentType` in `pod-sessions.json`? Currently unnecessary (all nodes in a graph use same agent type). Needed if per-node overrides are added later.

## Prior Art

- **Workshop 04**: Full prompt templates with all CLI commands verified live
- **Workshop 05**: PodManager execution tracking with timing sequences, edge cases, test suite
- **Workshop 03**: Driver loop pseudo-implementation, terminal event output, session sync ordering
- **Plan 032 Workshop 13**: Hybrid CLI/in-process test pattern
- **Legacy wf.md**: `dev/examples/wf/template/hello-workflow/wf.md` (prior art for agent instructions)
