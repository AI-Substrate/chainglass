# Positional Graph Execution Lifecycle Commands

**Mode**: Full
**File Management**: PlanPak

## Research Context

This specification incorporates findings from `research-dossier.md`:

- **Components affected**: `packages/positional-graph/` (service, schemas, errors), `apps/cli/` (commands)
- **Critical dependencies**: Existing `collateInputs` algorithm for input resolution, `state.json` for runtime state
- **Modification risks**: Low — adding new methods/commands, not changing existing behavior
- **Link**: See [research-dossier.md](./research-dossier.md) for full analysis

---

## Summary

Plan 026 delivered graph structure and status computation for positional graphs, but agents cannot participate in workflows because there are no commands to signal state transitions, report outputs, retrieve inputs, or request orchestrator input via question/answer protocol.

This plan adds 12 CLI commands (`cg wf node <cmd>`) that enable agents to signal their intentions and report results to the orchestrator. Agents will signal when they start/complete work, save their outputs for downstream consumers, and request orchestrator input when human decisions are needed.

---

## Goals

1. **Enable agent-orchestrator signaling**: Agents signal their intentions (starting work, saving results, requesting input) via CLI commands; the orchestrator manages workflow state based on these signals
2. **Support orchestrator handoff**: Agents can ask questions, pause for answers, then resume when the orchestrator responds
3. **Enable data flow**: Downstream nodes can retrieve inputs from completed upstream nodes
4. **Maintain clean separation**: Positional graph (`cg wf`) operates independently from legacy WorkGraph (`cg wg`)

---

## Non-Goals

- **No auto-execution**: The service computes readiness; an external orchestrator drives execution
- **No WorkGraph migration**: This does not convert or import existing WorkGraph data
- **No agent invocation**: This plan provides CLI commands; agent orchestration is out of scope
- **No UI changes**: Web UI is not part of this plan
- **No WorkGraph deprecation**: WorkGraph (`cg wg`) will be deprecated in a future plan, not this one

## Migration Context

This plan is part of a transition from WorkGraph to Positional Graph:

1. **This plan**: Add execution lifecycle commands to positional graph (`cg wf`)
2. **After this plan**: Deprecate legacy E2E script (`e2e-sample-flow.ts`), replaced by new `e2e-positional-graph-flow.ts`
3. **Future plan**: Deprecate WorkGraph system entirely (`cg wg`, `packages/workgraph/`)

---

## Complexity

**Score**: CS-2 (small)

**Breakdown**: S=1, I=0, D=1, N=0, F=0, T=1

| Dimension | Score | Rationale |
|-----------|-------|-----------|
| Surface Area (S) | 1 | Multiple files but contained to 2 packages |
| Integration (I) | 0 | Internal only, no external dependencies |
| Data/State (D) | 1 | Minor schema extension (state.json, data.json) |
| Novelty (N) | 0 | Well-specified, patterns exist in WorkGraph |
| Non-Functional (F) | 0 | Standard requirements |
| Testing/Rollout (T) | 1 | Integration tests needed, E2E test script |

**Total**: P = 4 → CS-2

**Confidence**: 0.85

**Assumptions**:
- Existing `collateInputs` algorithm works correctly for input resolution
- `state.json` schema extension is backward compatible
- WorkUnit loader provides I/O declarations for can-end validation

**Dependencies**:
- `@chainglass/shared` for filesystem abstractions
- WorkUnit definitions for sample-input, sample-coder, sample-tester units

**Risks**:
- State machine edge cases (concurrent access, partial failures)
- File storage path traversal validation

**Phases**:
1. Service methods (interface + implementation)
2. CLI commands
3. E2E test script

---

## Acceptance Criteria

### Node Lifecycle

1. **AC-1**: Running `cg wf node start <slug> <nodeId>` on a ready node transitions its status to `running` and records `started_at` timestamp
2. **AC-2**: Running `cg wf node end <slug> <nodeId>` on a running node with all required outputs transitions its status to `complete` and records `completed_at` timestamp
3. **AC-3**: Running `cg wf node can-end <slug> <nodeId>` returns `canEnd: true` only when all required outputs are saved
4. **AC-4**: Direct output pattern works: nodes can call `save-output-data` then `end` without calling `start`

### Question/Answer Protocol

5. **AC-5**: Running `cg wf node ask <slug> <nodeId> --type single --text "?" --options a b` transitions node to `waiting-question` and returns a question ID
6. **AC-6**: Running `cg wf node answer <slug> <nodeId> <qId> <answer>` stores the answer and transitions node back to `running`
7. **AC-7**: Running `cg wf node get-answer <slug> <nodeId> <qId>` returns the stored answer

### Output Storage

8. **AC-8**: Running `cg wf node save-output-data <slug> <nodeId> <name> <value>` persists the value to `nodes/<nodeId>/data.json`
9. **AC-9**: Running `cg wf node save-output-file <slug> <nodeId> <name> <path>` copies the file to `nodes/<nodeId>/files/` and records the path in `data.json`
10. **AC-10**: Running `cg wf node get-output-data <slug> <nodeId> <name>` returns the stored value
11. **AC-11**: Running `cg wf node get-output-file <slug> <nodeId> <name>` returns the absolute file path

### Input Retrieval

12. **AC-12**: Running `cg wf node get-input-data <slug> <nodeId> <name>` resolves the input wiring and returns the value from the source node
13. **AC-13**: Running `cg wf node get-input-file <slug> <nodeId> <name>` resolves the input wiring and returns the file path from the source node

### E2E Flow

14. **AC-14**: The E2E test script successfully executes a 3-node pipeline (input → coder → tester) using only `cg wf` commands
15. **AC-15**: All commands return valid JSON when `--json` flag is used

### Error Handling

16. **AC-16**: Invalid state transitions return appropriate error codes (E172)
17. **AC-17**: Missing outputs on `end` returns E175 with list of missing output names
18. **AC-18**: Invalid question ID returns E173

---

## Risks & Assumptions

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| State machine race conditions | Low | Medium | Atomic file writes, validate state before mutation |
| Path traversal in file outputs | Low | High | Validate paths, use `path.resolve` + containment check |
| Large file handling | Low | Low | Stream copy, don't load into memory |

### Assumptions

1. WorkUnit I/O declarations are available via `IWorkUnitLoader` for validating required outputs
2. The existing `collateInputs` algorithm correctly resolves inputs from upstream nodes
3. Agents call commands sequentially per node (no concurrent mutations on same node)

---

## Open Questions

None remaining — all clarified in session 2026-02-03.

---

## ADR Seeds (Optional)

**Decision Drivers**:
- Clean separation from legacy WorkGraph
- Reuse existing positional graph patterns (result types, error codes, atomic writes)
- Support direct output pattern (skip `start` for data-only nodes)

**Candidate Alternatives**:
- A) Extend state.json with questions array (chosen — keeps runtime state together)
- B) Separate questions.json file (rejected — adds complexity)

---

## Workshop Opportunities

| Topic | Type | Why Workshop | Key Questions |
|-------|------|--------------|---------------|
| CLI Flow | CLI Flow | 12 new commands with JSON output schemas | Command syntax? Error codes? State transitions? |

**Status**: Workshop completed — see [workshops/cli-and-e2e-flow.md](./workshops/cli-and-e2e-flow.md)

---

## Deliverables

### Service Methods (12 new)

| Method | Purpose |
|--------|---------|
| `startNode` | Transition to `running` |
| `endNode` | Transition to `complete` |
| `canEnd` | Check required outputs |
| `askQuestion` | Transition to `waiting-question` |
| `answerQuestion` | Store answer, resume to `running` |
| `getAnswer` | Retrieve stored answer |
| `saveOutputData` | Persist value |
| `saveOutputFile` | Copy file, persist path |
| `getOutputData` | Read value |
| `getOutputFile` | Read file path |
| `getInputData` | Resolve and read input value |
| `getInputFile` | Resolve and read input file path |

### CLI Commands (12 new)

```
cg wf node start <slug> <nodeId>
cg wf node end <slug> <nodeId>
cg wf node can-end <slug> <nodeId>
cg wf node ask <slug> <nodeId> --type <type> --text <text> [--options ...]
cg wf node answer <slug> <nodeId> <questionId> <answer>
cg wf node get-answer <slug> <nodeId> <questionId>
cg wf node save-output-data <slug> <nodeId> <name> <value>
cg wf node save-output-file <slug> <nodeId> <name> <path>
cg wf node get-output-data <slug> <nodeId> <name>
cg wf node get-output-file <slug> <nodeId> <name>
cg wf node get-input-data <slug> <nodeId> <name>
cg wf node get-input-file <slug> <nodeId> <name>
```

### Error Codes (7 new)

| Code | Name |
|------|------|
| E172 | InvalidStateTransition |
| E173 | QuestionNotFound |
| E175 | OutputNotFound |
| E176 | NodeNotRunning |
| E177 | NodeNotWaiting |
| E178 | InputNotAvailable |
| E179 | FileNotFound |

*Note: E174 (OutputAlreadySaved) removed — overwrites are allowed.*

### Test Artifacts

- `e2e-positional-graph-flow.ts` — E2E test using `cg wf` commands for 3-node pipeline

---

## Implementation Boundaries

| Package/File | Action |
|--------------|--------|
| `packages/positional-graph/` | MODIFY — add service methods, schemas, error codes |
| `apps/cli/src/commands/positional-graph.command.ts` | MODIFY — add CLI handlers |
| `test/` | ADD — new test files |
| `packages/workgraph/` | DO NOT TOUCH |

---

## Testing Strategy

**Approach**: Full TDD
**Rationale**: User specified comprehensive testing despite CS-2 complexity; execution lifecycle is critical infrastructure.

**Focus Areas**:
- State machine transitions (all valid/invalid paths)
- Input resolution via `collateInputs`
- Output storage and retrieval
- Question/answer protocol
- Error code coverage (E172-E179)

**Excluded**:
- CLI parsing (Commander.js handles this)
- Filesystem operations (covered by existing tests)

**Mock Usage**: Avoid mocks — use FakeFileSystem/FakePathResolver as per existing test patterns.

---

## Documentation Strategy

**Location**: docs/how/ only
**Rationale**: Detailed guide needed for agent developers; CLI --help insufficient for workflow patterns.

**Target Audience**: Agent developers, orchestrator implementers
**Content**: CLI command reference, E2E flow examples, state machine documentation
**Maintenance**: Update when new commands added or behavior changes

---

## Clarifications

### Session 2026-02-03

| Q# | Question | Answer | Spec Update |
|----|----------|--------|-------------|
| Q1 | Workflow mode? | Full | Mode header updated |
| Q2 | Testing approach? | Full TDD | Testing Strategy section added |
| Q3 | Mock usage? | Avoid mocks, use fakes per existing tests | Testing Strategy updated |
| Q4 | Documentation location? | docs/how/ only | Documentation Strategy section added |
| Q5 | Output overwrite behavior? | Yes, allow overwrite | Open Questions resolved, E174 removed |
| Q6 | File organization? | PlanPak | File Management header added |

---

## Related Documents

- [Research Dossier](./research-dossier.md) — codebase exploration findings
- [CLI Workshop](./workshops/cli-and-e2e-flow.md) — detailed CLI design and E2E flow
