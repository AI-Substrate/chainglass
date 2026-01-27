# WorkGraph: Graph-Based Workflow System with Reusable Units

📚 *This specification incorporates findings from research-dossier.md*

## Research Context

**Source**: `research-dossier.md` (2026-01-27)

### Key Findings
- **Legacy system**: `packages/workflow/` uses template→checkpoint→run model with linear phases
- **Gap identified**: No support for DAG structures, parallel paths, or reusable units
- **Traps documented**: 8 critical pitfalls identified (cycle detection, orphaned nodes, type mismatches, etc.)
- **Prior learnings**: 15 discoveries from 12 prior plans inform design (PL-01 through PL-15)

### Components Affected
- **New package**: `packages/workgraph/` (entirely new)
- **CLI extension**: `apps/cli/` (new `cg graph` and `cg unit` commands)
- **Storage**: `.chainglass/graphs/` and `.chainglass/units/` directories

### Modification Risks
- **Low risk**: This is a clean restart, not modifying legacy workflow code
- **Legacy coexistence**: `packages/workflow/` remains functional but deprecated

---

## Summary

**WorkGraph** is a new graph-based workflow system that replaces the legacy phase-based workflow architecture. It introduces **WorkUnits** (AgentUnit, CodeUnit, AskUnit) as reusable building blocks that can be composed into directed acyclic graphs (DAGs).

**WHY**: The legacy workflow system uses a rigid template→checkpoint→run model with linear phase sequences. Users need the ability to create flexible, reusable workflows with branching paths, explicit data dependencies, and iterative refinement through re-execution.

**WHAT**: A CLI-driven, filesystem-based system where:
- Graphs are "live" documents (no template/run distinction)
- Units are reusable components with declared inputs/outputs, stored separately in `.chainglass/units/`
- Graphs reference units by slug; the same unit can be used in many graphs
- Input/output compatibility is validated at node insertion time
- Execution is explicit, node-by-node, and re-entrant

---

## Goals

1. **Reusable Units**: Users can define AgentUnits, CodeUnits, and AskUnits once and reuse them across multiple graphs
2. **Graph Composition**: Users can build DAGs by adding nodes after existing nodes with automatic input/output wiring
3. **Fail-Fast Validation**: Invalid connections (missing required inputs) are rejected at insertion time, not execution time
4. **Explicit Execution**: Users execute specific nodes by full slug; no automatic "run all" or "next" behavior
5. **Re-entrant Execution**: Running a node clears its outputs and re-runs; users can iterate until satisfied
6. **Filesystem-Based**: All state stored in YAML/JSON files; inspectable, git-friendly, no database required
7. **CLI-First**: All operations available via `cg graph` and `cg unit` commands

---

## Non-Goals

1. **Batch Execution**: We will NOT support "run entire graph" functionality; execution is always explicit and node-by-node
2. **Auto-Next Selection**: We will NOT automatically select the next node to run; DAGs can have parallel paths
3. **Cyclic Graphs**: We will NOT support cycles; graphs are always DAGs
4. **Real-Time Collaboration**: We will NOT support multiple users editing the same graph simultaneously
5. **Cloud/Remote Execution**: Execution is local only; no remote agent orchestration
6. **Legacy Migration Tooling**: We will NOT provide automatic migration from legacy workflows; they coexist
7. **Subgraph Nesting**: We will NOT support graphs-within-graphs in v1 (future consideration)
8. **Unit Versioning/Registry**: We will NOT implement a shared unit registry in v1 (future consideration)

---

## Complexity

**Score**: CS-4 (large)

**Breakdown**:
| Dimension | Score | Rationale |
|-----------|-------|-----------|
| Surface Area (S) | 2 | New package, CLI commands, storage format, multiple node types |
| Integration (I) | 1 | Integrates with existing agent adapters (IAgentAdapter) |
| Data/State (D) | 2 | New graph.yaml, graph-state.json, unit.yaml schemas |
| Novelty (N) | 1 | DAG concepts well-understood; specific design decisions need validation |
| Non-Functional (F) | 1 | File atomicity, re-entrancy guarantees |
| Testing/Rollout (T) | 2 | Contract tests, integration tests, new CLI commands |

**Total**: S(2) + I(1) + D(2) + N(1) + F(1) + T(2) = **9** → CS-4

**Confidence**: 0.75

**Assumptions**:
- Existing IAgentAdapter can be reused for AgentUnit execution
- Filesystem operations are sufficient (no database needed)
- YAML/JSON parsing infrastructure exists (from legacy workflow)

**Dependencies**:
- `packages/shared` interfaces (IFileSystem, IAgentAdapter)
- `apps/cli` Commander.js infrastructure
- Existing agent execution capability (Claude Code, Copilot SDK)

**Risks**:
- Graph state corruption from concurrent access (mitigated by atomic writes)
- Complex input/output type matching edge cases
- User confusion between legacy workflow and WorkGraph systems

**Phases** (suggested):
1. **Core Infrastructure**: Graph data model, storage, basic CLI (create, show, status)
2. **Node Operations**: add-after, remove, input/output validation
3. **Unit Library**: AskUnit, AgentUnit definitions and loading
4. **Execution**: exec, answer commands with re-entrancy
5. **Polish**: Error messages, validation, edge cases
6. **Documentation**: User guide, migration notes

---

## Acceptance Criteria

### Graph Management

**AC-01**: User can create a new empty graph
- Given: No graph exists with slug "my-workflow"
- When: User runs `cg graph create my-workflow`
- Then: Directory `.chainglass/graphs/my-workflow/` is created with `graph.yaml` containing a single start node

**AC-02**: User can view graph structure
- Given: Graph "my-workflow" exists with nodes
- When: User runs `cg graph show my-workflow`
- Then: Tree-style output shows all nodes with their types, inputs, and outputs

**AC-03**: User can check graph execution status
- Given: Graph "my-workflow" exists with some nodes executed
- When: User runs `cg graph status my-workflow`
- Then: Table shows each node's status (pending, ready, waiting, running, complete, blocked)

### Node Operations

**AC-04**: User can add a node after another node (success case)
- Given: Graph has node "graph-001-start" and unit "ask-text" exists
- When: User runs `cg graph node add-after graph-001-start ask-text --config prompt="Question?" --config output_name="answer"`
- Then: New node "graph-002-ask-text" is added with edge from start node

**AC-05**: User cannot add a node with unsatisfied required inputs
- Given: Graph has only start node (no outputs) and unit "write-poem" requires input "topic:text"
- When: User runs `cg graph node add-after graph-001-start write-poem`
- Then: Error E103 returned with message explaining missing input and suggesting AskUnit

**AC-06**: User can add a node when predecessor provides required outputs
- Given: Graph has node "graph-002-ask-text" that outputs "topic:text", unit "write-poem" requires "topic:text"
- When: User runs `cg graph node add-after graph-002-ask-text write-poem`
- Then: New node added with automatic input mapping (topic ← ask-text.topic)

**AC-07**: User cannot remove a node that has dependents
- Given: Graph has nodes A → B → C
- When: User runs `cg graph node remove B`
- Then: Error E102 returned listing dependents, suggesting --cascade option

**AC-08**: User can remove a leaf node
- Given: Graph has nodes A → B → C (C is leaf)
- When: User runs `cg graph node remove C`
- Then: Node C removed, edge B→C removed, node folder deleted

### Execution

**AC-09**: User can execute a ready node by full slug
- Given: Graph has node "graph-003-write-poem" with all inputs available
- When: User runs `cg graph exec graph-003-write-poem`
- Then: Agent executes, outputs are produced, node status becomes "complete"

**AC-10**: User cannot execute a blocked node
- Given: Graph has node "graph-003-write-poem" but predecessor not complete
- When: User runs `cg graph exec graph-003-write-poem`
- Then: Error E110 returned explaining missing inputs and blocking nodes

**AC-11**: User can answer an AskUnit
- Given: Graph has AskUnit "graph-002-ask-text" in "waiting" status
- When: User runs `cg graph answer graph-002-ask-text "The ocean at sunset"`
- Then: Answer saved to node data, node status becomes "complete", outputs available

**AC-12**: User can re-execute a completed node
- Given: Graph has node "graph-003-write-poem" already complete with outputs
- When: User runs `cg graph exec graph-003-write-poem`
- Then: Previous outputs cleared, agent re-executes, new outputs saved

**AC-13**: Re-executing a node with dependents shows warning
- Given: Graph has A → B → C, B is complete, C used B's outputs
- When: User runs `cg graph exec B`
- Then: Warning shown listing affected dependents, requiring --cascade or --force flag

### Unit Library

**AC-14**: User can list available units
- Given: Units exist in `.chainglass/units/`
- When: User runs `cg unit list`
- Then: Table shows all units with slug, description, and type

**AC-15**: User can view unit details
- Given: Unit "write-poem" exists
- When: User runs `cg unit info write-poem`
- Then: Output shows inputs, outputs, type, and configuration schema

### Validation

**AC-16**: Cycle detection prevents invalid edges
- Given: Graph has A → B → C
- When: User attempts to add edge C → A (would create cycle)
- Then: Error returned before any state is persisted

**AC-17**: Graph validates on load
- Given: User manually edited graph.yaml and introduced invalid reference
- When: System loads the graph
- Then: Validation error with specific location and suggested fix

---

## Risks & Assumptions

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| File corruption from concurrent access | Medium | High | Atomic write pattern (temp file + rename) |
| Complex type matching edge cases | Medium | Medium | Start with 4 simple types; expand carefully |
| User confusion with legacy system | Medium | Low | Clear documentation; different command prefix (`cg graph` vs `cg wf`) |
| Graph state and node data out of sync | Low | High | Single source of truth in graph-state.json; validate on load |
| Performance with large graphs | Low | Medium | Lazy loading; only load nodes when needed |

### Assumptions

1. **Single user**: Graphs are edited by one user at a time; no concurrent access
2. **Local filesystem**: All data stored locally; no remote/cloud storage
3. **Existing agent infra**: Can reuse IAgentAdapter for executing AgentUnits
4. **Simple types sufficient**: 4 types (text, number, file, json) cover initial use cases
5. **No realtime needs**: Execution is synchronous, no streaming/events required initially

---

## Open Questions

1. **Q1**: Should node IDs include the unit slug or just a sequence number?
   - Current: `<graph>-<seq>-<unit>` (e.g., `poem-workflow-002-ask-text`)
   - Alternative: `<graph>-<seq>` only (e.g., `poem-workflow-002`)
   - [NEEDS CLARIFICATION: User preference on ID readability vs brevity]

2. **Q2**: Should we support multiple edges from one node (branching)?
   - Use case: Node A outputs two things, B uses one, C uses another
   - [NEEDS CLARIFICATION: Is branching a v1 requirement or future?]

3. **Q3**: Should we support multiple edges into one node (merging/diamond)?
   - Use case: Node C needs inputs from both A and B
   - [NEEDS CLARIFICATION: Is merging a v1 requirement or future?]

4. **Q4**: How should CodeUnits specify their runtime?
   - Options: Inline script, script path, Docker container
   - [NEEDS CLARIFICATION: CodeUnit implementation details can wait for v2?]

5. **Q5**: Should graphs support "checkpointing" like legacy workflows?
   - Alternative: Just use git for versioning graphs
   - [NEEDS CLARIFICATION: Is explicit checkpoint command needed?]

---

## ADR Seeds (Optional)

### ADR-001: Live Graphs vs Template/Run Model

**Decision Drivers**:
- Legacy system complexity (template → checkpoint → run → phases)
- User mental model simplicity
- Git-friendly state management

**Candidate Alternatives**:
- A: Keep template/run separation (like legacy)
- B: Live graphs only, use git for versioning (proposed)
- C: Hybrid with optional snapshots

**Stakeholders**: Development team, users building workflows

---

### ADR-002: Validate on Insert vs Validate on Execute

**Decision Drivers**:
- Fail-fast principle (catch errors early)
- User experience (clear error messages at insertion time)
- Graph integrity (always-valid state)

**Candidate Alternatives**:
- A: Validate only at execution time (late binding)
- B: Validate at insertion time (proposed)
- C: Optional validation with --skip-validation flag

**Stakeholders**: Development team, users composing graphs

---

### ADR-003: Explicit Execution vs Auto-Run

**Decision Drivers**:
- DAG parallel paths (no single "next" node)
- Agent oversight requirements
- Output review between steps

**Candidate Alternatives**:
- A: Automatic "run all" with pause at AskUnits
- B: Automatic "next" selection
- C: Explicit execution by slug only (proposed)

**Stakeholders**: Development team, agent operators

---

## References

- **Research Dossier**: `docs/plans/016-agent-units/research-dossier.md`
- **Legacy Workflow**: `packages/workflow/` (for comparison)
- **Prior Learnings**: PL-01 through PL-15 in research dossier

---

**Specification Status**: Draft
**Next Step**: Run `/plan-2-clarify` for high-impact questions
