# Spec C: Real Agent E2E Tests

**Mode**: Full
**File Management**: PlanPak
**Parent Spec**: [real-agent-pods-spec.md](real-agent-pods-spec.md)
**Depends On**: [Spec A: Orchestration Wiring](spec-a-orchestration-wiring.md), [Spec B: Prompts and CLI Driver](spec-b-prompts-and-cli-driver.md)

## Research Context

- **Workshop 03**: [CLI-First Real Agent Execution](workshops/03-cli-first-real-agents.md) — Three E2E test layers, real agent test graph design, non-determinism handling, Layer 2 and Layer 3 test specifications
- **034 Workshop 01**: [CLI Agent Run and E2E Testing](../034-agentic-cli/workshops/01-cli-agent-run-and-e2e-testing.md) — Tier 2/3 test patterns, skip logic, structural assertions
- **Research Dossier**: [Real Agent Pods Research](research-dossier.md) — PL-06 (contract test parity), PL-08 (Claude/Copilot event differences), PL-13 (hybrid test model), PL-14 (describe.skip for real tests)
- **Plan 030 Workshop 13**: [E2E Design](../../030-positional-orchestrator/workshops/13-phase-8-e2e-design.md) — Hybrid CLI/in-process test pattern

### What Specs A and B Deliver

| Component | Spec | Status |
|-----------|------|--------|
| ODS → AgentManagerService wiring | A | Prerequisite |
| AgentPod wraps IAgentInstance | A | Prerequisite |
| Plan 030 E2E updated with FakeAgentManagerService | A | Prerequisite |
| node-starter-prompt.md (WF protocol manual) | B | Prerequisite |
| node-resume-prompt.md (continuation instructions) | B | Prerequisite |
| `cg wf run` CLI driver loop | B | Prerequisite |
| PodManager execution tracking | B | Prerequisite |

## Summary

Prove the orchestration system works with real Claude Code agents by creating integration and E2E tests that exercise the full agent lifecycle: accept → read inputs → do work → save outputs → complete. Tests verify session inheritance across nodes, parallel execution with independent sessions, the question/answer protocol, and error handling. All real agent tests use `describe.skip` and structural assertions — they are documentation and validation tests, not CI tests.

## Goals

- **Full pipeline with real agents**: A simplified graph (2-3 nodes) runs through the complete orchestration loop with real Claude Code agents reading inputs, following instructions, and completing via CLI commands
- **Session inheritance proven**: A second node inherits the first node's session and the real agent resumes from conversation history on disk
- **Parallel execution proven**: Two agents run concurrently with independent sessions
- **Agent protocol compliance**: Real agents follow the starter prompt protocol (accept → collate → get-input-data → work → save-output-data → end)
- **Skip-guarded for CI**: All tests use `describe.skip` — documentation/validation tests that can be manually unskipped, not run in CI
- **Structural assertions only**: Assert on status, sessionId presence, event counts, output existence — never on LLM-generated content
- **No regression**: All existing 3858+ tests continue to pass

## Non-Goals

- Running real agent tests in CI (they're `describe.skip`)
- Content-based assertions on LLM output
- Copilot agent pods (Claude Code is primary; Copilot support proven at adapter level in Plan 034)
- Question/answer lifecycle with real agents (complex, non-deterministic; deferred)
- Performance benchmarking
- Web UI integration testing

## Complexity

- **Score**: CS-3 (medium)
- **Breakdown**: S=1, I=2, D=0, N=2, F=1, T=1
  - **S=1**: Test files only — no production code changes
  - **I=2**: Depends on Specs A + B being complete, real Claude Code CLI availability, network access for LLM calls
  - **N=2**: Real agent behavior is non-deterministic. Agents may not follow instructions perfectly. Test design must be resilient.
  - **F=1**: Tests are slow (30-120s each), require auth, cost money
  - **T=1**: Tests are `describe.skip` — manual execution only
- **Confidence**: 0.75 — Lower confidence than Specs A/B due to real agent non-determinism. Structural assertions mitigate but don't eliminate uncertainty.
- **Dependencies**: Spec A (MUST be complete), Spec B (MUST be complete), Claude Code CLI (must be installed and authenticated)
- **Risks**:
  - Real agents may not follow starter prompt instructions → test with simple deterministic tasks
  - Real agent tests are slow (total suite: 5-10 minutes) → `describe.skip`, run manually
  - Claude Code CLI auth may expire between test runs → skip guards handle gracefully
  - Non-deterministic output → structural assertions only, soft content checks logged but not asserted

## Acceptance Criteria

### Real Agent E2E

1. **AC-34**: A real agent E2E test exists that runs a simplified graph (2-3 nodes) with real Claude Code agents through the full orchestration loop (`cg wf run` or equivalent in-process driver).
2. **AC-35**: The real agent E2E verifies: agent accepts assignment, reads inputs, saves outputs, and completes — all via CLI commands observed through node status transitions and event presence.

### Session Inheritance

3. **AC-36**: A real agent integration test verifies session inheritance — a second node inherits the first node's session and the agent resumes from conversation history. Verified by: second agent completes without error, sessionId differs from first (fork happened).

### Parallel Execution

4. **AC-37**: A real agent integration test verifies parallel execution — two agents run concurrently with independent sessions. Verified by: both nodes complete, different sessionIds, total time less than 2x single agent time (logged, not strictly asserted).

### Test Infrastructure

5. **AC-38**: Real agent tests use `describe.skip` (not `describe.skipIf`) and are documentation/validation tests that can be manually unskipped.
6. **AC-39**: Real agent tests use structural assertions (status, sessionId presence, event counts, output existence) not content assertions. Soft content checks may be logged but not asserted.
7. **AC-40**: All existing tests continue to pass (3858+ tests) after the changes.

## Test Graph Design

Per Workshop 03, the real agent E2E uses a simplified pipeline:

```
Line 0: get-spec (user-input, pre-completed before test)
Line 1: spec-writer (agent, serial) → reviewer (agent, serial, inherits session)
```

- **get-spec**: Pre-completed with a simple spec input (e.g., "Write a fibonacci function")
- **spec-writer**: Reads `main-prompt` (task: "Read the spec input and write a brief summary as output 'summary'"), saves output, completes
- **reviewer**: Inherits spec-writer's session, reads its own `main-prompt` (task: "Review the summary and output 'approved' or 'needs-changes' as 'decision'"), saves output, completes

**Why simple tasks?** Real agents need to complete quickly (30-60s each). Simple prompts with clear instructions minimize non-determinism while proving the full protocol.

### GOAT Graph (Comprehensive E2E)

Plan 037 (CodePod Completion and GOAT Integration Testing) builds a comprehensive test graph fixture — the GOAT — that exercises every orchestration scenario in a single graph: serial progression, parallel fan-out, manual transitions, error recovery, question/answer cycles, and multi-input aggregation.

**The GOAT graph is designed for reuse with real agents.** Plan 037 builds it with `type: code` work units (simulation scripts). When Spec C is implemented, the same graph structure and assertions can be reused with `type: agent` work units — swapping scripts for real LLM prompts. Same graph, same validation, different executors.

See:
- [Plan 037 Spec](../037-codepod-and-goat-integration/codepod-and-goat-integration-spec.md) — AC-24 through AC-27
- [Workshop 07: Test Graph Fixtures and GOAT](../036-cli-orchestration-driver/workshops/07-test-graph-fixtures-and-goat.md) — full GOAT design, reuse strategy (Part 7)

## Non-Determinism Handling

| What We Assert | Why Reliable |
|----------------|-------------|
| `nodeStatus === 'complete'` | Adapter always reports completion status |
| `sessionId` is truthy | Claude Code always returns session IDs |
| Events include `node:accepted` | Agent called `accept` per protocol |
| Output exists and is non-empty | Agent saved something |
| Second sessionId differs from first | Fork happened during inheritance |

| What We Do NOT Assert | Why Unreliable |
|----------------------|----------------|
| Exact output text | LLM output varies between runs |
| Specific event count | Depends on model's internal processing |
| Output content quality | Subjective, non-deterministic |
| Timing | Network latency, model load time vary |

## Open Questions

None — test design is well-specified in Workshop 03 and validated by Plan 034's real agent test patterns.

## Prior Art

- **Plan 034 Phase 4**: `test/integration/agent-instance-real.test.ts` (13 tests, `describe.skip`) — real agent tests at AgentInstance level
- **Plan 034 Phase 4**: `test/e2e/agent-cli-e2e.test.ts` (4 tests, `describe.skip`) — CLI E2E tests
- **Existing real agent tests**: `test/integration/real-agent-multi-turn.test.ts` (365 lines) — adapter-level real agent tests with soft content checks
- **Workshop 03**: Layer 2 (real agent E2E) and Layer 3 (focused integration) test specifications with code examples
