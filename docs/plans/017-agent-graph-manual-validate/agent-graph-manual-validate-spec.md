# Manual Validation of Agent Graph Execution

**Mode**: Simple

📚 This specification incorporates findings from [research/e2e-sample-flow-research.md](research/e2e-sample-flow-research.md) and [workshops/e2e-sample-flow.md](workshops/e2e-sample-flow.md).

---

## Summary

Build a complete end-to-end validation harness for the WorkGraph system that demonstrates a working 3-node graph with agent execution, question/answer handover, and cross-node data flow. The harness acts as an orchestrator script that programmatically executes the entire workflow, validates state transitions, and reports success/failure based on actual execution results.

**WHAT**: A TypeScript orchestrator script that creates a WorkGraph, executes nodes in sequence, handles agent questions automatically, and validates the complete pipeline succeeds.

**WHY**:
- Prove the WorkGraph system works end-to-end before broader adoption
- Surface edge cases in CLI commands, state transitions, and data flow
- Provide a reference implementation for future orchestrators (UI, CI/CD, LLM agents)
- Enable iterative development with fast feedback loops

---

## Goals

1. **Validate complete lifecycle**: Create graph → add nodes → execute in order → complete graph
2. **Demonstrate direct output pattern**: User-input nodes can complete via `save-output-data → end` without `start`
3. **Demonstrate agent question handover**: Agent asks question → orchestrator auto-answers → agent continues
4. **Validate cross-node data flow**: Data outputs (text) and file outputs correctly resolve as inputs to downstream nodes
5. **Provide actionable feedback**: Script reads final node outputs and reports pipeline success/failure
6. **Support iterative development**: Mock mode first for fast iteration, then real agent mode for full validation
7. **Real agent mode**: Invoke actual agents with 500ms polling, 5-minute timeout for completion detection

---

## Non-Goals

- Real-time UI integration (this is a CLI orchestrator only)
- Production-ready error recovery (fail-fast is acceptable for validation)
- Performance optimization (correctness over speed)
- Multi-graph orchestration (single graph focus)
- Parallel node execution (sequential execution only)

---

## Complexity

**Score**: CS-3 (medium)

**Breakdown**: S=1, I=1, D=0, N=1, F=0, T=2

| Dimension | Score | Rationale |
|-----------|-------|-----------|
| Surface Area (S) | 1 | Multiple files: WorkNodeService changes, new CLI command, orchestrator script |
| Integration (I) | 1 | Depends on existing WorkGraph system; no external APIs |
| Data/State (D) | 0 | No schema changes; uses existing state.json and data.json |
| Novelty (N) | 1 | Some ambiguity around `end` from PENDING behavior; mostly well-specified |
| Non-Functional (F) | 0 | Standard requirements; no special security/perf concerns |
| Testing/Rollout (T) | 2 | This IS the integration test; needs careful staged validation |

**Total**: 6 → CS-3

**Confidence**: 0.85

**Assumptions**:
- Existing CLI commands (`wg node start`, `wg node end`, etc.) work as documented
- WorkNodeService can be modified to accept `end` from PENDING state
- TypeScript orchestrator has access to CLI via child process

**Dependencies**:
- Plan 016 (Agent Units) Phase 6 CLI integration complete
- Existing WorkGraph/WorkNode/WorkUnit services functional

**Risks**:
- Hidden edge cases in state transitions may require iteration
- Mock mode may not catch issues that only appear with real agents
- CLI output format changes could break JSON parsing

**Phases**:
1. Code changes to WorkNodeService (`end` from PENDING, `getOutputData`)
2. CLI command additions (`get-output-data`)
3. Orchestrator script with mock mode
4. Sample unit fixtures
5. Integration testing and iteration

---

## Acceptance Criteria

### AC-1: Direct Output Pattern
**Given** a node in PENDING state with all required outputs saved
**When** `cg wg node end <graph> <node>` is called
**Then** the node transitions to COMPLETE status without requiring `start` first

### AC-2: Pre-Execution Validation
**Given** a node with upstream dependencies
**When** `cg wg node can-run <graph> <node>` is called
**Then** it returns `canRun: false` with blocking nodes listed until all upstream nodes are complete

### AC-3: Agent Question Handover
**Given** an agent node that calls `cg wg node ask` with a question
**When** the orchestrator polls status and sees `waiting-question`
**Then** the orchestrator can call `cg wg node answer` and the node resumes to `running`

### AC-4: Cross-Node Data Flow
**Given** Node A outputs `language` (data) and `script` (file)
**And** Node B has inputs mapped from Node A
**When** Node B calls `get-input-data` and `get-input-file`
**Then** it receives the values saved by Node A

### AC-5: Output Reading by Orchestrator
**Given** a completed node with saved outputs
**When** `cg wg node get-output-data <graph> <node> <output-name>` is called
**Then** the orchestrator receives the saved value

### AC-6: Pipeline Success Reporting
**Given** the final node (sample-tester) completes with `success: true` output
**When** the orchestrator reads this output
**Then** it reports "Pipeline SUCCESS" and exits with code 0

### AC-7: Pipeline Failure Reporting
**Given** the final node completes with `success: false` output
**When** the orchestrator reads this output
**Then** it reports "Pipeline FAILED" and exits with code 1

### AC-8: Mock Mode Execution
**Given** the orchestrator runs in mock mode (default)
**When** the script executes
**Then** it completes in < 30 seconds without external API calls

### AC-9: Complete Graph Validation
**Given** the orchestrator runs to completion
**When** `cg wg status <graph>` is called
**Then** all nodes show status `complete`

### AC-10: Plan 016 Bug Fixes
**Given** the harness reveals bugs in WorkGraph/WorkNode services
**When** bugs are discovered during harness execution
**Then** they are fixed in the Plan 016 codebase as part of this plan's implementation

---

## Risks & Assumptions

### Risks
1. **State machine edge cases**: The `end` from PENDING change may have unexpected interactions with other states
2. **Polling reliability**: Question handover depends on reliable status polling; race conditions possible
3. **Mock-Real divergence**: Mock mode may pass while real agent mode fails due to timing or format differences
4. **CLI output stability**: JSON output format must remain stable for orchestrator parsing
5. **Undiscovered bugs in Plan 016 code**: The WorkGraph system from Plan 016 has not had a proper end-to-end shakedown - expect this harness to surface issues requiring fixes

### Iteration Expectation

**This plan expects iteration.** The Plan 016 WorkGraph implementation has not been validated end-to-end. Running this harness will likely uncover:
- Bugs in WorkNodeService state transitions
- Missing or incorrect CLI command behaviors
- Data flow issues between nodes
- Edge cases in ask/answer handover

These discoveries are the **purpose** of this validation harness. Fixes to Plan 016 code are in-scope and expected during implementation. The plan is complete when the harness runs successfully, not when the harness code is written.

### Assumptions
1. WorkNodeService's `saveOutputData` already works on PENDING nodes (confirmed in workshop)
2. `canEnd` can be safely extended to check PENDING nodes
3. TypeScript can invoke CLI via `child_process.spawn` reliably
4. Node.js 20+ is available in the execution environment

---

## Open Questions

1. ~~**Q1**: Should `end` from PENDING be gated behind a flag, or is it safe as the new default behavior?~~
   - **RESOLVED**: Default behavior. Allow `end()` from PENDING when outputs present. No flag needed.

2. ~~**Q2**: Should the orchestrator script live in `scripts/workgraph/` or `test/e2e/workgraph/`?~~
   - **RESOLVED**: Located at `docs/how/dev/workgraph-run/`
   - Deprecates: `docs/how/dev/manual-wf-run/` (move to `docs/how/dev/_old/`)

3. ~~**Q3**: How should the orchestrator detect agent completion in real mode (polling interval, timeout)?~~
   - **RESOLVED**: Poll status every 500ms, timeout after 5 minutes. Real agent mode is in scope for this plan.

All open questions resolved.

---

## ADR Seeds (Optional)

### ADR Seed 1: `end` from PENDING State
**Decision Drivers**:
- Simplify orchestrator logic for direct input nodes
- Reduce ceremony for nodes where orchestrator already has data
- Maintain backwards compatibility with existing `start → end` flow

**Candidate Alternatives**:
- A) Allow `end` from any non-terminal state when outputs present (proposed)
- B) Add new `complete-directly` command for this pattern
- C) Keep `start` required, make it a no-op for input nodes

**Stakeholders**: Orchestrator implementers, CLI users

### ADR Seed 2: Output Reading Pattern
**Decision Drivers**:
- Orchestrator needs to read completed node outputs to determine pipeline success
- Existing `get-input-data` reads from upstream; need equivalent for own outputs

**Candidate Alternatives**:
- A) Add `get-output-data` command (proposed)
- B) Extend `get-input-data` to work on self-node
- C) Read directly from data.json file

**Stakeholders**: Orchestrator implementers

---

## Workshop Opportunities

The following workshop has been completed and informs this specification:

| Topic | Type | Status | Document |
|-------|------|--------|----------|
| E2E Sample Flow | Integration Pattern + CLI Flow | Complete | [workshops/e2e-sample-flow.md](workshops/e2e-sample-flow.md) |

The workshop covers:
- Complete CLI command sequences for each node type
- State transition diagrams with `can-run`/`can-end` checks
- TypeScript orchestrator script structure
- Sample unit definitions (sample-input, sample-coder, sample-tester)
- Mock vs Real execution modes
- Success criteria and expected output

No additional workshops are needed before architecture.

---

## External Research

**Incorporated**: [research/e2e-sample-flow-research.md](research/e2e-sample-flow-research.md)

**Key Findings**:
- TypeScript preferred over shell for structured JSON parsing and state management
- Existing `manual-wf-run/` harness provides reference patterns
- Ask/answer handover requires polling for `waiting-question` status
- 22 CLI commands available across graph, node, and unit operations

**Applied To**: Goals, Acceptance Criteria, Complexity scoring

---

## Testing Strategy

**Approach**: Manual Only

**Rationale**: This harness IS the validation mechanism. The orchestrator script itself serves as the test - running it validates the entire WorkGraph system. No separate unit tests needed for the harness code.

**Focus Areas**:
- Complete E2E flow execution (mock mode then real agent mode)
- State transitions work as expected
- Data and file flow between nodes
- Question/answer handover mechanism

**Excluded**:
- Unit tests for orchestrator helper functions
- Mocking of CLI commands

**Mock Usage**: Avoid mocks entirely. The harness has two execution modes:
1. **Mock mode**: Orchestrator simulates agent work directly (no mocks, just direct output)
2. **Real agent mode**: Actual `cg agent run` invocations

---

## Documentation Strategy

**Location**: docs/how/ only

**Rationale**: The harness lives at `docs/how/dev/workgraph-run/`. A README.md within that folder serves as the documentation. The workshop document already provides comprehensive design details.

**Content**:
- `docs/how/dev/workgraph-run/README.md` - Usage instructions, quick start
- Workshop document covers architecture and design decisions

**Target Audience**: Developers validating WorkGraph changes, future orchestrator implementers

**Maintenance**: Update README when adding new validation scenarios or changing CLI interface

---

## Clarifications

### Session 2026-01-28

| # | Question | Answer | Sections Updated |
|---|----------|--------|------------------|
| Q1 | Workflow mode? | **Simple** - Workshop is comprehensive, single-phase implementation | Header |
| Q2 | Testing approach? | **Manual Only** - The harness IS the test | Testing Strategy |
| Q3 | Mock usage? | **Avoid mocks entirely** - Use real fixtures, harness has mock mode built-in | Testing Strategy |
| Q4 | Documentation location? | **docs/how/ only** - README in workgraph-run folder | Documentation Strategy |
| Q5 | `end` from PENDING behavior? | **Yes, default** - No flag needed, simpler orchestrator logic | Open Questions |
| Q6 | Polling strategy for real agent mode? | **500ms interval, 5min timeout** - Real agent mode is in scope | Open Questions |
