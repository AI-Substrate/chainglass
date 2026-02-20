# Real Agent E2E Tests — Implementation Plan

**Plan Version**: 1.0.0
**Created**: 2026-02-20
**Spec**: [spec-c-real-agent-e2e-tests.md](../033-real-agent-pods/spec-c-real-agent-e2e-tests.md)
**Status**: DRAFT

**Workshops**:
- [07-spec-c-concept-drift-remediation.md](../033-real-agent-pods/workshops/07-spec-c-concept-drift-remediation.md) — what changed since Spec C
- [08-spec-c-implementation-wiring.md](../033-real-agent-pods/workshops/08-spec-c-implementation-wiring.md) — exact construction patterns
- [01-agent-prompt-flow-and-adapters.md](./workshops/01-agent-prompt-flow-and-adapters.md) — what agents see, Copilot vs Claude Code

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Technical Context](#technical-context)
3. [Critical Research Findings](#critical-research-findings)
4. [Testing Philosophy](#testing-philosophy)
5. [Project Structure](#project-structure)
6. [Implementation Phases](#implementation-phases)
   - [Phase 1: Agent Fixtures and Real Agent E2E Tests](#phase-1-agent-fixtures-and-real-agent-e2e-tests)
7. [Cross-Cutting Concerns](#cross-cutting-concerns)
8. [File Placement Manifest](#file-placement-manifest)
9. [Complexity Tracking](#complexity-tracking)
10. [Progress Checklist](#progress-checklist)
11. [ADR Ledger](#adr-ledger)
12. [Deviation Ledger](#deviation-ledger)
13. [Change Footnotes Ledger](#change-footnotes-ledger)

---

## Executive Summary

The orchestration system has been proven end-to-end with simulation scripts (Plan 037). Now we prove it works with **real Claude Code agents**. A real LLM reads prompt instructions, calls CLI commands (`cg wf node accept/save-output-data/end`), and drives graph state to completion — the same flow as the GOAT test, but with a real intelligence doing the work.

**Solution approach**:
- Create agent-type fixtures with prompt templates instructing the agent to follow the WF protocol
- Write `describe.skip` integration tests that use real `ClaudeCodeAdapter` via the proven `withTestGraph` infrastructure
- Validate session inheritance (serial nodes share context) and parallel execution (independent sessions)
- All assertions are structural only (status, sessionId, output existence — never LLM content)

**Expected outcomes**: Running the tests (manually, with `describe.skip` removed and claude CLI authenticated) proves that a real agent can orchestrate graph state via CLI commands, inherit sessions across serial nodes, and execute in parallel with independent sessions.

---

## Technical Context

### Current System State

- **Plan 037**: Complete — GOAT graph proves orchestration with code-unit scripts (serial, parallel, error, question, aggregation)
- **Plan 036**: Complete — `drive()` loop, `cg wf run` CLI command
- **Plan 035**: Complete — ODS → AgentManagerService wiring, AgentPod
- **Plan 034**: Complete — AgentManagerService, IAgentInstance, real adapters

### The Agent Pipeline (Proven Layers)

The full execution path from `drive()` to real agent:

```
drive() → run() → ONBAS(start-node) → ODS.execute()
  → AgentContextService (inherit/new decision)
  → AgentManagerService.getNew() or .getWithSessionId()
    → ClaudeCodeAdapter (spawns `claude` CLI process)
      → Agent reads prompt template (node-starter-prompt.md)
      → Agent calls: cg wf node accept/save-output-data/end
      → Events written to disk
  → AgentPod.execute() (fire-and-forget)
→ next iteration: settle picks up events → node progresses
```

Every layer is individually tested. What's missing: **running through all layers together with a real LLM agent making the decisions.**

### Existing Real Agent Tests (Prior Art)

| Test File | Tests | What's Proven |
|-----------|-------|---------------|
| `test/integration/agent-instance-real.test.ts` | 12 | AgentInstance + real adapter (session, events, compact) |
| `test/e2e/agent-cli-e2e.test.ts` | 4 | CLI agent commands (run, resume, compact, stream) |
| `test/integration/real-agent-multi-turn.test.ts` | 2 | Multi-turn conversations with tool use |
| `test/integration/orchestration-wiring-real.test.ts` | 7 | ODS → real agent → pod lifecycle, session inheritance |

**What's NOT tested**: The full vertical through `withTestGraph` — creating a graph from disk fixtures with real unit.yaml + prompt templates, driving it with `drive()`, and having the real agent complete the graph via CLI commands it discovers from the prompt.

### Key Constraints

- **describe.skip**: All real agent tests must use `describe.skip` — they cost money, need auth, are slow
- **Structural assertions only**: Assert on status, sessionId, event counts, output existence — never on LLM content
- **Claude Code only**: Per Spec C, Claude Code is primary. Copilot adapter parity proven at adapter level in Plan 034.
- **Simple graphs**: Real agents take 30-120s per node. Use 2-3 node graphs, not GOAT.

### Dependencies

- Plan 037 complete (withTestGraph, orchestration stack, proven patterns) ✅
- Plan 036 complete (drive loop, prompt templates) ✅
- Plan 035 complete (ODS wiring, AgentPod) ✅
- Plan 034 complete (AgentManagerService, ClaudeCodeAdapter) ✅
- `claude` CLI installed and authenticated (runtime requirement)

---

## Critical Research Findings

### 01: withTestGraph Works for Agent Units — No Changes Needed

**Impact**: Critical (enables the entire plan)
**Sources**: [Workshop 08 Q2]
**Finding**: `withTestGraph` copies ALL files from `units/` including `prompts/` subdirectories. `buildDiskWorkUnitService` reads unit.yaml regardless of type. `addNode()` validates agent units the same as code units.
**Action**: Just create agent fixtures — the infrastructure handles them.

### 02: Real AgentManagerService Construction — Dynamic Import Pattern

**Impact**: Critical
**Sources**: [Workshop 08 Part 1, agent-instance-real.test.ts]
**Finding**: All existing real agent tests use:
```typescript
const { AgentManagerService } = await import('@chainglass/shared/features/034-agentic-cli');
const { ClaudeCodeAdapter, UnixProcessManager, FakeLogger } = await import('@chainglass/shared');
const manager = new AgentManagerService(() => new ClaudeCodeAdapter(processManager, { logger }));
```
Dynamic imports avoid loading real adapters during regular test collection.
**Action**: Use same pattern in `describe.skip` tests.

### 03: Orchestration Stack Needs Real AgentManager — Inline Wiring

**Impact**: High
**Sources**: [Workshop 08 Part 3]
**Finding**: `createTestOrchestrationStack()` hardcodes `FakeAgentManagerService`. Real agent tests need the real one. Per Workshop 08 decision: inline the ~25 lines of stack wiring in the test with real agent manager substituted.
**Action**: Inline orchestration stack wiring in real agent test file. Don't modify shared helper.

### 04: Prompt Templates Must Include CLI Instructions

**Impact**: High
**Sources**: [AgentPod analysis, node-starter-prompt.md]
**Finding**: AgentPod loads `node-starter-prompt.md` (first run) or `node-resume-prompt.md` (subsequent). These are system-level prompts that tell the agent the WF protocol. The unit-specific `prompts/main.md` is loaded by the agent's `prompt_template` config and provides the **task**. The agent receives both: system protocol + task prompt.
**Action**: Unit `prompts/main.md` should give a simple, deterministic task. The system prompt already teaches accept/save/end protocol.

### 05: AgentPod Template Substitution Is Simple String Replace

**Impact**: Medium
**Sources**: [pod.agent.ts:55-60]
**Finding**: `{{graphSlug}}`, `{{nodeId}}`, `{{unitSlug}}` — three placeholders, `replaceAll()` on the template string. No template engine, no conditionals, no loops. The `--workspace-path` flag is NOT automatically added — it relies on the agent reading the system prompt which includes workspace instructions.
**Action**: Agent prompts must explicitly reference `--workspace-path` if the agent needs it. But since `cwd` is set to the workspace, the agent's `cg` calls should resolve via CWD. Verify empirically.

### 06: Session Inheritance Requires Serial Nodes on Same or Adjacent Lines

**Impact**: High
**Sources**: [AgentContextService analysis, ods.ts:146-174]
**Finding**: `getContextSource()` returns `inherit` for serial non-first nodes on the same line, or first-on-line when previous lines have agent nodes. The inherited sessionId comes from `podManager.getSessionId(fromNodeId)`. For this to work, the first agent must have completed and its sessionId must be in `pod-sessions.json`.
**Action**: Graph topology: Line 0 (user-input), Line 1 (spec-writer serial, reviewer serial). Both agent nodes on Line 1. Reviewer inherits spec-writer's session.

### 07: Drive Parameters for Real Agents Need High Delays

**Impact**: Medium
**Sources**: [Workshop 08 Part 3 Q4]
**Finding**: Real agents take 30-120s per node. Drive needs:
```typescript
{ maxIterations: 50, actionDelayMs: 1000, idleDelayMs: 5000 }
```
This gives ~250s total budget (50 × 5s) — sufficient for a 2-3 node graph.
**Action**: Define `REAL_AGENT_DRIVE_OPTIONS` constant in test file.

### 08: Graph agentType Must Be Set to 'claude-code'

**Impact**: Medium
**Sources**: [ODS buildPodParams, graph-orchestration.ts]
**Finding**: `reality.settings?.agentType ?? 'copilot'` — defaults to `copilot` if not set. The graph's orchestrator settings must specify `agentType: 'claude-code'`. Set via `service.updateGraphOrchestratorSettings()`.
**Action**: Call `service.updateGraphOrchestratorSettings(ctx, slug, { agentType: 'claude-code' })` after graph creation.

---

## Testing Philosophy

### Testing Approach

**Selected Approach**: Manual validation with structural assertions (per Spec C)
**Rationale**: Real agent tests are non-deterministic, expensive ($), and slow. They serve as documentation and validation tests — proof that the system works — not CI regression tests.
**Focus Areas**: Full pipeline (drive → agent → CLI commands → graph completion), session inheritance, parallel execution.

### Mock Usage

**Policy**: No mocks. Real everything — real AgentManagerService, real ClaudeCodeAdapter, real `claude` CLI, real graph state. The only "fake" is `FakeNodeEventRegistry` in the orchestration stack (same as all tests).

### Test Documentation

Every test file includes the 5-field Test Doc comment block.

---

## Project Structure

```
./  (project root)
├── dev/
│   └── test-graphs/
│       ├── real-agent-serial/          # NEW: agent fixture for serial + inheritance
│       │   └── units/
│       │       ├── get-spec/           # user-input
│       │       │   └── unit.yaml
│       │       ├── spec-writer/        # agent
│       │       │   ├── unit.yaml
│       │       │   └── prompts/
│       │       │       └── main.md
│       │       └── reviewer/           # agent (inherits session)
│       │           ├── unit.yaml
│       │           └── prompts/
│       │               └── main.md
│       ├── real-agent-parallel/        # NEW: agent fixture for parallel
│       │   └── units/
│       │       ├── get-spec/           # user-input
│       │       │   └── unit.yaml
│       │       ├── worker-a/           # agent (parallel)
│       │       │   ├── unit.yaml
│       │       │   └── prompts/main.md
│       │       └── worker-b/           # agent (parallel)
│       │           ├── unit.yaml
│       │           └── prompts/main.md
│       ├── shared/                     # EXISTING (unchanged)
│       └── README.md                   # MODIFY: add entries
├── test/
│   └── integration/
│       └── real-agent-orchestration.test.ts  # NEW: describe.skip tests
└── docs/plans/038-real-agent-e2e/
    └── real-agent-e2e-plan.md          # This file
```

---

## Implementation Phases

### Phase 1: Agent Fixtures and Real Agent E2E Tests

**Objective**: Create agent-type test graph fixtures and write `describe.skip` integration tests proving real Claude Code agents can drive graphs to completion via the full orchestration pipeline.

**Deliverables**:
- `dev/test-graphs/real-agent-serial/` — 3-node graph (user-input → spec-writer → reviewer with session inheritance)
- `dev/test-graphs/real-agent-parallel/` — 3-node graph (user-input → worker-a + worker-b parallel)
- `test/integration/real-agent-e2e.test.ts` — 2 `describe.skip` tests (serial with inheritance + parallel)
- Updated `dev/test-graphs/README.md`

**Dependencies**: None (all infrastructure from Plans 034-037 is complete)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Agent doesn't follow prompt protocol | Medium | High | Simple deterministic tasks, clear CLI instructions in prompt |
| Session inheritance fails with real agent | Low | High | Session ID tracking proven in orchestration-wiring-real.test.ts |
| Agent takes too long (>120s per node) | Medium | Medium | Simple tasks, generous timeout (180s per test) |
| `--workspace-path` not resolved from CWD | Medium | Medium | Verify empirically; add explicit flag to prompts if needed |

### Tasks (Single Phase)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 1.1 | [ ] | Create `dev/test-graphs/real-agent-serial/units/` fixture: `get-spec/unit.yaml` (user-input, output: spec), `spec-writer/unit.yaml` (agent, input: spec, output: summary, prompt_template: prompts/main.md), `reviewer/unit.yaml` (agent, input: summary, output: decision, prompt_template: prompts/main.md). Write `prompts/main.md` for each agent: simple tasks — "Read the spec and write a 1-sentence summary" and "Review the summary and output 'approved' or 'needs-changes'". | 2 | Files on disk, unit.yaml valid per schema | - | AC-34 |
| 1.2 | [ ] | Create `dev/test-graphs/real-agent-parallel/units/` fixture: `get-spec/unit.yaml` (user-input), `worker-a/unit.yaml` (agent, parallel, input: spec, output: result), `worker-b/unit.yaml` (agent, parallel, input: spec, output: result). Write prompts: "Read the spec and output a 1-word summary". | 1 | Files on disk, unit.yaml valid | - | AC-37 |
| 1.3 | [ ] | Write `test/integration/real-agent-orchestration.test.ts` with `describe.skip` containing 3 tests: (a) **Copilot serial**: `withTestGraph('real-agent-serial')` → create graph (Line 0: get-spec, Line 1: spec-writer → reviewer serial) → default agentType is 'copilot' (no settings change needed) → complete get-spec → drive with real Copilot agent → assert both nodes complete, reviewer sessionId differs from spec-writer's (fork proves inheritance, AC-36), outputs saved. (b) **Copilot parallel**: `withTestGraph('real-agent-parallel')` → create graph (Line 0: get-spec, Line 1: worker-a + worker-b parallel) → drive → assert both complete, different sessionIds. (c) **Claude Code serial**: Same as (a) but with `updateGraphOrchestratorSettings(ctx, slug, { agentType: 'claude-code' })` and ClaudeCodeAdapter. Inline orchestration stack with real AgentManagerService via dynamic import. Per Workshop 01: Copilot is first-class (default), Claude Code is opt-in. | 3 | Tests written, `describe.skip` applied, file compiles | - | AC-34, AC-35, AC-36, AC-37, AC-38, AC-39 |
| 1.4 | [ ] | Update `dev/test-graphs/README.md` with real-agent-serial and real-agent-parallel entries | 1 | Catalogue updated | - | |
| 1.5 | [ ] | Verify `service.updateGraphOrchestratorSettings()` takes `{ agentType: 'claude-code' }` — confirmed as the correct API. | 1 | agentType setting confirmed | - | Finding 08 |
| 1.6 | [ ] | `just fft` clean (skip tests don't affect gate) | 1 | All existing tests pass, lint clean | - | AC-40 |

### Acceptance Criteria
- [ ] Real agent serial test exists with `describe.skip` (AC-34, AC-38)
- [ ] Serial test verifies accept/read/save/complete via structural assertions (AC-35)
- [ ] Serial test proves session inheritance — reviewer's sessionId differs from spec-writer's (fork happened) (AC-36)
- [ ] Parallel test proves independent sessions — different sessionIds for worker-a and worker-b (AC-37)
- [ ] All assertions are structural (status, sessionId, output existence) — no content assertions (AC-39)
- [ ] All existing tests continue to pass (AC-40)

---

## Cross-Cutting Concerns

### Security Considerations
- Real agent tests call `claude` CLI with `--dangerously-skip-permissions` (standard adapter behavior)
- Tests run in temp workspace (cleaned up by `withTestGraph`)
- No secrets stored in fixtures

### Observability
- Drive `onEvent` callback logs each step for debugging
- `console.log` in tests shows agent progress (visible when `describe.skip` removed)

### Documentation
- No new docs — fixtures serve as documentation of agent unit structure
- Agent fixtures (`real-agent-serial/`, `real-agent-parallel/`) are the project's first agent-type exemplars — canonical reference for `type: agent` unit.yaml + `prompts/main.md` structure (per ADR-0002)
- `dev/test-graphs/README.md` updated with new entries
- Test Doc for each test references the fixture it validates

---

## File Placement Manifest

| File | Classification | Location | Rationale |
|------|---------------|----------|-----------|
| `real-agent-serial/units/*` | plan-scoped | `dev/test-graphs/` | Agent test fixture |
| `real-agent-parallel/units/*` | plan-scoped | `dev/test-graphs/` | Agent test fixture |
| `real-agent-orchestration.test.ts` | plan-scoped | `test/integration/` | describe.skip test (integration, not e2e — uses programmatic APIs) |
| `README.md` | cross-plan-edit | `dev/test-graphs/` | Fixture catalogue update |

---

## Complexity Tracking

| Component | CS | Label | Breakdown (S,I,D,N,F,T) | Justification | Mitigation |
|-----------|-----|-------|------------------------|---------------|------------|
| Overall Plan | 2 | Small | S=1,I=1,D=0,N=1,F=0,T=0 | All infrastructure exists. Just fixtures + describe.skip tests. Spec C estimated CS-3; refined to CS-2 after Plans 034-037 proved all infrastructure (see Workshop 07). | Proven patterns from Plans 034+037 |
| Real agent wiring | 2 | Small | S=0,I=1,D=0,N=1,F=0,T=0 | Dynamic import pattern proven in 4 existing test files | Copy from orchestration-wiring-real.test.ts |

---

## Progress Checklist

### Phase Completion Status
- [ ] Phase 1: Agent Fixtures and Real Agent E2E Tests - PENDING

Overall Progress: 0/1 phases (0%)

### STOP Rule

**IMPORTANT**: This plan must be validated before creating tasks. After writing this plan:
1. Run `/plan-4-complete-the-plan` to validate readiness
2. Only proceed to `/plan-5-phase-tasks-and-brief` after validation passes

---

## ADR Ledger

| ADR | Status | Affects Phases | Notes |
|-----|--------|----------------|-------|
| ADR-0002 | Accepted | Phase 1 | Exemplar-driven development — agent fixtures are canonical exemplars for agent-type work units |
| ADR-0004 | Accepted | Phase 1 | DI container architecture — test inlines wiring (deviation documented below) |
| ADR-0006 | Accepted | Phase 1 | CLI-based workflow agent orchestration — validates the exact pattern this ADR documents |
| ADR-0012 | Accepted | Phase 1 | Domain boundaries — agent tests route through ODS (pod domain), not directly |

---

## Deviation Ledger

| Principle Violated | Why Needed | Simpler Alternative Rejected | Risk Mitigation |
|-------------------|------------|------------------------------|-----------------|
| Tests not in CI | Real agents cost money, need auth, non-deterministic | Run in CI with mocked adapter — rejected because that's already proven | describe.skip + structural assertions |
| ADR-0004 container resolution (R-ARCH-003) | describe.skip test with real adapters needs custom wiring; shared helper hardcodes FakeAgentManagerService | Modify shared createTestOrchestrationStack() to accept real agent manager — rejected to avoid polluting shared helper with real-adapter concerns | Inline wiring is 25 lines, identical pattern to 4 existing real-agent test files |

---

## Change Footnotes Ledger

[^1]: [To be added during implementation via plan-6a]
[^2]: [To be added during implementation via plan-6a]
