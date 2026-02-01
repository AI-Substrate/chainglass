# Positional Graph — Feature Specification

**Mode**: Full
**File Management**: PlanPak

## Research Context

This specification incorporates findings from `research-dossier.md`, the `workshops/positional-graph-prototype.md` design workshop, and the `workshops/workflow-execution-rules.md` execution semantics workshop.

- **Components affected**: New `packages/positional-graph/` package; new CLI commands under `cg wf`; new workspace data domain `workflows`; future UI surface replacing the WorkGraph canvas
- **Critical dependencies**: `@chainglass/workflow` (WorkspaceContext, WorkspaceDataAdapterBase, WorkUnit types — to be extracted from workgraph), `@chainglass/shared` (BaseResult, IFileSystem, DI tokens)
- **Modification risks**: No existing code is modified — this is a greenfield package. The only coupling is consuming shared interfaces and WorkUnit definitions from existing packages.
- **Key workshop decisions**: Lines (not buckets/stages), `transition` property on lines (not control nodes), three-state InputPack (available/waiting/error), multi-source input resolution, `collateInputs` as the single traversal method, per-node `execution` property (serial default, parallel opts out of chain), `getStatus` as the public API (canRun is internal algorithm)

Link: See `research-dossier.md` for full analysis, `workshops/positional-graph-prototype.md` for data model and service interface, `workshops/workflow-execution-rules.md` for execution semantics and status API.

---

## Summary

Replace the DAG-based WorkGraph execution model with a **positional graph** — an ordered sequence of **lines** containing **nodes**, where topology is implicit from line ordering rather than explicit edges. Data flows from preceding lines to subsequent lines through named input resolution, not through edge wiring. The result is a simpler mental model (drop nodes into lines, wire inputs by name), eliminates entire subsystems (cycle detection, edge validation, start node bootstrap), and makes parallel execution and diamond dependencies natural rather than exceptional.

**WHAT**: A new `packages/positional-graph/` package providing a service layer, CLI surface (`cg wf`), schemas, and filesystem persistence for positional graphs — coexisting independently alongside the existing WorkGraph system.

**WHY**: The DAG model has accumulated friction: manual edge wiring, the 5-layer connection bug, the start node bootstrap problem, and the "no merging" constraint that the codebase has already outgrown (diamond dependencies already work in tests). A positional model eliminates these pain points while preserving the core value — named inputs/outputs flowing between work units.

---

## Goals

1. **Simpler workflow authoring** — users place nodes into ordered lines instead of wiring directed edges; parallel execution is achieved by placing nodes on the same line
2. **Eliminate structural complexity** — no cycle detection, no edge arrays, no start sentinel node, no dual add-node API; topology is implicit from line ordering
3. **Preserve data flow semantics** — WorkUnit input/output declarations remain unchanged; only the resolution mechanism changes (from "follow edge" to "search preceding lines by name")
4. **Independent coexistence** — positional graphs are a separate concept with their own package, data domain, CLI prefix, and DI tokens; the existing WorkGraph system is untouched
5. **Workspace-aware persistence** — data stored under `<worktree>/.chainglass/data/workflows/<slug>/`, following established workspace data adapter patterns
6. **Status computation from position** — a node's executability is determined by positional rules (all preceding lines complete, transition gates, per-node serial/parallel execution ordering, input availability) rather than edge traversal
7. **Single input resolution traversal** — `collateInputs` resolves all inputs once, consumed by the `getStatus` API (readiness is a field on the status object, not a separate `canRun` method) and execution (feeding data), avoiding duplicate traversals
8. **Flow control without control nodes** — line `transition` property (auto/manual) governs inter-line flow, keeping the entity model simple

---

## Non-Goals

1. **Not a WorkGraph migration** — this does not convert existing DAG graphs to positional graphs; that is a future phase
2. **Not a UI feature** — no React Flow canvas, no visual editor; CLI-only for the prototype
3. **Not an execution engine** — no agent execution, no `start`/`end` lifecycle, no output saving; just structure, status computation, and input resolution
4. **Not a replacement yet** — the existing `cg wg` commands and WorkGraph system remain fully functional; positional graphs coexist alongside
5. **No SSE/real-time updates** — no event broadcasting for graph changes
6. **No conditional transitions** — only `auto` and `manual` transition modes; `conditional` (predicate-based) is a future extension
7. **No cross-graph references** — a node cannot reference outputs from a different positional graph

---

## Complexity

- **Score**: CS-4 (large)
- **Breakdown**: S=2, I=1, D=2, N=1, F=0, T=2 (Total P=8)
  - **Surface Area (S=2)**: New package with schemas, service, adapter, DI container, CLI commands, error codes — many files across packages and apps
  - **Integration (I=1)**: Depends on `@chainglass/workflow` (WorkspaceContext) and `@chainglass/shared` (BaseResult, DI); both are stable internal packages
  - **Data/State (D=2)**: New on-disk schema (`graph.yaml`, `state.json`, `node.yaml`), new data domain, new filesystem directory structure — non-trivial schema design
  - **Novelty (N=1)**: Well-workshopped design with clear data model, but positional input resolution is a new pattern not present in the codebase
  - **Non-Functional (F=0)**: Standard performance/security requirements; no compliance constraints
  - **Testing/Rollout (T=2)**: Needs contract tests, integration tests, E2E script; phased rollout across multiple implementation phases
- **Confidence**: 0.85
- **Assumptions**:
  - WorkspaceDataAdapterBase pattern is stable and suitable for the new domain
  - WorkUnit definitions in `@chainglass/workgraph` can be consumed without tight coupling to the workgraph service layer
  - The existing `resolveOrOverrideContext` CLI pattern works unchanged for `cg wf` commands
- **Dependencies**:
  - `@chainglass/workflow` must export `WorkspaceContext`, `WorkspaceDataAdapterBase`, and WorkUnit types (InputDeclaration, OutputDeclaration, WorkUnit — extracted from `@chainglass/workgraph`)
  - `@chainglass/shared` must export `BaseResult`, `IFileSystem`, `IPathResolver`
- **Risks**:
  - WorkUnit coupling: the new package needs WorkUnit type definitions but shouldn't depend on the full workgraph service layer — may need to extract a shared WorkUnit interface
  - Input resolution complexity: multi-source inputs with ordinal disambiguation could have edge cases (same-line serial resolution, moved nodes breaking `from_unit` references)
  - Scope creep: the prototype includes status computation and input resolution, which are substantial features beyond pure CRUD
- **Phases**:
  1. Extract WorkUnit types from `@chainglass/workgraph` to `@chainglass/workflow` (prerequisite)
  2. Schema, types, and filesystem adapter (data model foundation) — TDD
  3. Graph and line CRUD operations with service layer — TDD
  4. Node operations (add, remove, move) with positional invariants — TDD
  5. Input wiring and `collateInputs` / `canRun` (status computation) — TDD
  6. CLI integration under `cg wf`
  7. Integration tests and E2E prototype script

---

## Acceptance Criteria

1. **Graph lifecycle**: `cg wf create <slug>` creates a graph with one empty line; `cg wf show <slug>` displays structure; `cg wf delete <slug>` removes all files; `cg wf list` shows all graphs in the workspace
2. **Line operations**: lines can be added (append, insert at index, before/after a line ID), removed (empty or cascade), moved to a new index, and have their label, description, and transition set; execution mode is a per-node property (serial/parallel), not a line property
3. **Node operations**: nodes can be added to a line at a position, removed, moved within a line, and moved between lines; node instance descriptions can be set
4. **Positional invariants hold**: every node belongs to exactly one line; node IDs are unique; line IDs are unique; at least one line always exists; line and node ordering is deterministic
5. **Input wiring**: `set-input` wires a node's input to a named predecessor (`from_unit`) or explicit node ID (`from_node`); `remove-input` removes the wiring; wiring is persisted in `node.yaml`
6. **Input resolution**: `collateInputs` resolves each declared input to one of three states — `available` (data present), `waiting` (source found but incomplete), or `error` (can't resolve source); multi-source inputs collect from all matching nodes
7. **Readiness computation**: a node can run when all preceding lines are complete, the transition gate (if manual) has been triggered, serial left neighbor (if the node is serial) is complete, and `collateInputs` returns `ok: true`; readiness is exposed via `getNodeStatus`/`getLineStatus`/`getStatus` (canRun is the internal 4-gate algorithm, not a public method)
8. **Status display**: `cg wf status <slug>` shows full graph status (all lines and nodes with computed status, readiness detail, and convenience buckets); `--node` and `--line` flags narrow scope
9. **Workspace isolation**: all data stored under `ctx.worktreePath/.chainglass/data/workflows/`; `--workspace-path` override works; different worktrees have independent data
10. **Error codes**: errors use the E150-E179 range with structured error codes; invalid operations return descriptive error messages
11. **No regressions**: existing `cg wg` commands and WorkGraph system are completely unaffected
12. **Test coverage**: unit tests verify schema validation and resolution logic; integration tests exercise full filesystem persistence with real services; E2E script validates the complete operational flow

---

## Risks & Assumptions

### Risks

- **WorkUnit type extraction**: WorkUnit types (InputDeclaration, OutputDeclaration) must be moved from `@chainglass/workgraph` to `@chainglass/workflow` as a prerequisite phase. This is a cross-package refactor that must not break existing workgraph consumers.
- **`from_unit` resolution ambiguity**: When multiple nodes match a `from_unit` slug and no ordinal is specified, the system collects from all — this could be surprising if the user intended a single source. Clear CLI feedback and documentation are needed.
- **Line reordering breaks assumptions**: Moving a line could make a `from_unit` reference that was valid (predecessor) become invalid (now on a later line). The system handles this gracefully — the input resolves as `waiting` (not an error), and becomes valid again if the referenced node moves back to a preceding position. Per-node execution mode (serial/parallel) travels with the node, so moves don't change execution semantics.
- **Prototype scope is large**: Including status computation and input resolution in the prototype makes this closer to a full system than a "skeleton." Risk of the prototype phase taking longer than expected.

### Assumptions

- The existing `WorkspaceDataAdapterBase` pattern is the correct foundation for the new data domain
- WorkUnit definitions are consumed read-only — the positional graph never modifies unit templates
- The CLI framework (Commander.js via the existing `workgraph.command.ts` pattern) supports adding a new top-level command group without structural changes
- `from_unit` named resolution is sufficient for the vast majority of use cases; `from_node` explicit ID is an escape hatch, not the primary path
- The `transition` property on lines is sufficient for flow control; per-line-pair control or conditional transitions can be added later without schema breaks

---

## Open Questions

1. ~~**WorkUnit type extraction**~~ — **RESOLVED (Q6)**: Extract to `@chainglass/workflow`. Move InputDeclaration, OutputDeclaration, and WorkUnit types into the workflow package.
2. ~~**Auto-resolve single-line graphs**~~ — **RESOLVED (Q8)**: No. Always require line ID, even for single-line graphs.
3. **Empty line auto-cleanup** — **DEFERRED**: Should moving the last node out of a line auto-remove it? Workshop leans no (keep explicit). Low-impact — can decide during implementation.
4. ~~**Line reference by index vs ID**~~ — **RESOLVED (Q7)**: ID only. CLI commands accept only stable line IDs (`line-a4f`), no ordinal index shortcuts.

---

## ADR Seeds (Optional)

### ADR: Positional Graph Model (replacing DAG edges)

- **Decision Drivers**: DAG edge complexity (cycle detection, 5-layer connection flow, start node bootstrap), desire for simpler parallel execution, diamond dependency support, position-as-topology paradigm
- **Candidate Alternatives**:
  - A: Keep DAG model, improve tooling around edges
  - B: Positional graph — ordered lines with implicit topology (selected)
  - C: Hybrid — positional lines plus optional explicit edges for complex patterns
- **Stakeholders**: Core platform team

### ADR: Input Resolution Strategy (named vs positional vs explicit)

- **Decision Drivers**: Need for stable references across line reordering, multi-source inputs, backward compatibility with WorkUnit IO declarations
- **Candidate Alternatives**:
  - A: Implicit — all outputs from preceding line available by name (no wiring needed)
  - B: Named predecessor — `from_unit` slug resolution with ordinal disambiguation (selected)
  - C: Explicit only — `from_node` direct ID references (DAG-like, but without edges)
- **Stakeholders**: Core platform team

---

## Workshop Opportunities

| Topic | Type | Why Workshop | Key Questions |
|-------|------|--------------|---------------|
| Positional Graph Prototype — Lines, Nodes, and Operations | Data Model + CLI Flow | **COMPLETED** — detailed design of core entities, operations, schemas, and CLI surface | See `workshops/positional-graph-prototype.md` |
| Workflow Execution Rules | State Machine + Data Model | **COMPLETED** — canRun algorithm, collateInputs traversal, per-node execution, getStatus API, data storage | See `workshops/workflow-execution-rules.md` |

All identified workshop topics have been addressed in the completed workshop documents. No additional workshops are needed before proceeding to architecture.

---

## Unresolved Research

- **Topics**:
  1. Positional/Sequential Graph Models in Workflow Systems — how other workflow engines handle sequential/bucket-based execution (naming conventions, data flow patterns)
  2. React Flow Grid/Lane Layout Patterns — whether React Flow supports lane/swimlane layouts for the future UI phase
- **Impact**: Topic 1 could inform naming decisions (though "line" was already chosen with rationale). Topic 2 is relevant only to the future UI phase, not the prototype.
- **Recommendation**: Topic 1 is low-impact for the prototype (naming is decided). Topic 2 can be deferred until the UI phase. Neither blocks architecture or implementation.

---

---

## Testing Strategy

- **Approach**: Full TDD
- **Rationale**: Complex logic (positional resolution, multi-source input collation, canRun computation) and a new data model warrant comprehensive test-first development. Tests define the contract before implementation.
- **Focus Areas**:
  - `collateInputs` resolution logic (single source, multi-source, ordinal disambiguation, forward reference detection)
  - `canRun` computation (preceding lines, transition gates, serial ordering)
  - Line/node CRUD with invariant enforcement (unique IDs, at-least-one-line, no orphans)
  - Input wiring persistence and validation
  - Filesystem adapter (graph.yaml, state.json, node.yaml read/write)
- **Excluded**: UI rendering (out of scope), SSE broadcasting (out of scope), agent execution (out of scope)
- **Mock Usage**: Avoid mocks entirely — real data/fixtures only. Use the real filesystem adapter and real service implementations in all tests. No fake service implementations.
- **Test Layers**:
  - Unit: Schema validation, node ID generation, input resolution logic, canRun rules
  - Contract: Service interface behavior verified with real implementations (no fakes)
  - Integration: Full filesystem lifecycle (create → add lines/nodes → wire inputs → collate → canRun)
  - E2E: Prototype script exercising the complete operational flow

---

## Documentation Strategy

- **Location**: docs/how/ only
- **Rationale**: Internal prototype — detailed guide covering positional graph concepts, CLI usage, and data model lives in docs/how/. No README changes until the feature matures.
- **Target Audience**: Developers working on or extending the positional graph system
- **Maintenance**: Update docs alongside implementation; keep in sync with CLI surface changes

---

## Clarifications

### Session 2026-01-31

**Q1: Workflow Mode** — Pre-answered by user: **Full**
Rationale: CS-4 feature with multiple phases, new package, comprehensive service layer — requires full gates.

**Q2: Testing Strategy** — Pre-answered by user: **Full TDD**
Rationale: Complex positional resolution logic, new data model, and service contracts require test-first development.

**Q3: Mock Usage** — **Avoid mocks entirely**
Rationale: Real data/fixtures only. Use real filesystem adapter and real service implementations in all tests. No fake service implementations.

**Q4: Documentation Strategy** — **docs/how/ only**
Rationale: Internal prototype — detailed guide in docs/how/ covering concepts, CLI usage, and data model. No README changes until feature matures.

**Q5: File Management** — **PlanPak**
Rationale: Full traceability with feature-grouped folders under the plan and a file placement manifest.

**Q6: WorkUnit Type Extraction** — **Extract to @chainglass/workflow**
Rationale: Move WorkUnit types (InputDeclaration, OutputDeclaration, WorkUnit) into the workflow package alongside WorkspaceContext. The workflow package already serves as the shared foundation for workspace-aware systems.

**Q7: Line References in CLI** — **ID only**
Rationale: CLI commands accept only stable line IDs (e.g., `line-a4f`). No ordinal index shortcuts — simpler, unambiguous.

**Q8: Auto-select Single Line** — **No, always require line ID**
Rationale: Explicit is better than implicit. Always specify which line, even when only one exists.

### Coverage Summary

| Category | Status | Details |
|----------|--------|---------|
| Workflow Mode | Resolved (Q1) | Full |
| Testing Strategy | Resolved (Q2) | Full TDD, no mocks (Q3) |
| Documentation Strategy | Resolved (Q4) | docs/how/ only |
| File Management | Resolved (Q5) | PlanPak |
| WorkUnit type boundary | Resolved (Q6) | Extract to @chainglass/workflow |
| CLI line references | Resolved (Q7) | ID only |
| Auto-select single line | Resolved (Q8) | No, always explicit |
| Empty line auto-cleanup | Deferred | Low-impact, decide during implementation |

---

**Spec Location**: `docs/plans/026-positional-graph/positional-graph-spec.md`
**Branch**: `026-positional-graph`
**Plan Directory**: `docs/plans/026-positional-graph/`
