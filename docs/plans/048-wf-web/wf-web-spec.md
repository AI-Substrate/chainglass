# Workflow Templates & Instances

**Mode**: Full

📚 This specification incorporates findings from research-dossier.md

## Research Context

The positional graph system spans three packages (`@chainglass/positional-graph`, `@chainglass/workgraph`, `@chainglass/workflow`) with no formalized domain in the domain registry. Workflows already have a partial template/instance pattern: `current/` → `checkpoints/` → `runs/`. However, work units exist only as single definitions in `.chainglass/units/` with no template/instance separation. E2E test fixtures (`dev/test-graphs/`) already copy workflows and work units to temp directories via `withTestGraph()` — an embryonic template system. ADR-0012 defines six domain boundaries (Graph, Event, Orchestration, Agent, Pod, Consumer) that must be respected.

## Summary

Introduce a formal **template/instance** system for both workflows and work units. Templates are reusable definitions stored in dedicated locations within `.chainglass/` paths. Instances are full copies of templates that live independently — modifying a template does not affect existing instances. Work unit instances live inside their parent workflow instance directory, establishing a clear containment hierarchy. Work units can be selectively refreshed (overwritten) from their source template. The entire system is Git-managed, enabling templates to be shared across branches, users, and PRs through normal Git operations.

Alongside this, the positional graph system will be formalized as a domain in the domain registry, establishing clear contracts and boundaries for the first time.

## Goals

- **Template/instance separation for workflows**: Users can define workflow templates once and create independent instances from them. Editing a template does not alter existing instances.
- **Template/instance separation for work units**: Users can define work unit templates once and have instances copied into workflow instance directories when a workflow is instantiated.
- **Refresh from template for work units**: Users can update a work unit template and then selectively refresh individual work unit instances within a workflow instance, effectively overwriting the instance with the latest template content.
- **Git-managed lifecycle**: All templates and instances live in `.chainglass/` paths so they are version-controlled, mergeable across branches, and carried forward through PRs.
- **Domain extraction**: The positional graph system gets a formal domain entry in the domain registry with defined contracts, boundaries, and relationships.
- **E2E test migration**: Existing e2e test fixtures (from `dev/test-graphs/` and Plans 038/039) are ported to use the new template system, proving the template/instance lifecycle works end-to-end.

## Non-Goals

- **Template inheritance or composition**: Templates are flat definitions, not layered or composable from fragments. No template-of-templates.
- **Automatic instance synchronization**: Modifying a template never propagates automatically to instances. Refresh is always an explicit user action.
- **Template versioning with semantic history**: Templates do not track version history beyond what Git provides. No built-in changelog or migration system.
- **Agent execution changes**: The orchestration loop (ONBAS, ODS, drive) is not modified. This feature changes where workflow/unit definitions are stored and copied, not how they execute.
- **Web UI changes**: No new web pages or components for template management in this plan. CLI-only.
- **Workflow template composition from work unit templates**: Workflows reference work unit slugs; there is no mechanism to auto-assemble a workflow from a set of unit templates.

## Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|-------------|---------------------|
| _platform/positional-graph | **NEW** | **create** | Extract as formal domain; owns graph DB, orchestration, events, work unit execution |
| _platform/file-ops | existing | **consume** | Use IFileSystem, IPathResolver for template/instance I/O (no changes) |
| _platform/events | existing | **consume** | Use event contracts for state change notifications (no changes) |

### New Domain Sketches

#### _platform/positional-graph [NEW]
- **Purpose**: Core graph engine that owns the positional graph database, node execution state machine, orchestration loop, node event system, and work unit loading. Provides the runtime for all workflow execution.
- **Boundary Owns**: Graph structure (lines, nodes, edges), graph state persistence (state.json), node execution lifecycle, input resolution algorithm, orchestration (Reality, ONBAS, ODS, drive), node events (raise, handle, stamp), work unit loading and validation, pod management
- **Boundary Excludes**: Workflow template registry and lifecycle (belongs to `@chainglass/workflow` package), workspace context resolution (belongs to `@chainglass/workflow`), CLI/web consumer presentation (belongs to Consumer domain per ADR-0012), agent instance management (belongs to Agent domain per ADR-0012)
- **Contracts Out**: `IPositionalGraphService`, `IOrchestrationService`, `IEventHandlerService`, `IWorkUnitService` (loader), graph state schemas
- **Contracts In**: `IFileSystem` (from file-ops), `IPathResolver` (from file-ops), `WorkspaceContext` (from workflow package)
- **Known Consumers**: `@chainglass/workgraph`, web UI (feature 022), CLI commands, MCP tools

## Complexity

- **Score**: CS-4 (large)
- **Breakdown**: S=2, I=1, D=2, N=1, F=0, T=2 → P=8
- **Confidence**: 0.75
- **Assumptions**:
  - The old workgraph system (current→checkpoint→run, global unit resolution) is being fully removed and replaced
  - Work unit template→instance copy is a full directory copy (all files: unit.yaml, prompts/, scripts/)
  - Domain extraction is primarily documentation and registry updates, not code restructuring
  - E2E tests can be migrated incrementally (old fixtures remain until new system validated)
  - Workflow instances are self-contained — no fallback resolution to global templates
- **Dependencies**:
  - ADR-0012 domain boundaries must be respected (no new boundary violations)
  - Existing `withTestGraph()` fixture infrastructure informs the template copy mechanism
  - `@chainglass/workflow` package's `WorkflowService` must be extended for template operations
- **Risks**:
  - Work unit path resolution changes affect CLI, MCP, and Web consumers simultaneously (3 integration surfaces)
  - Schema changes to unit.yaml or graph definition files may invalidate existing test fixtures if not backward-compatible
  - Template refresh semantics could conflict with in-progress workflow runs if a unit is refreshed mid-execution
- **Phases**:
  - Phase 1: Domain extraction (positional-graph domain formalization)
  - Phase 2: Workflow template/instance core (storage, copy, schema)
  - Phase 3: Work unit template/instance core (storage, copy into workflow instances, refresh)
  - Phase 4: E2E test migration (port existing fixtures to template system, validate lifecycle)

## Acceptance Criteria

### Domain Extraction

1. A domain entry for `_platform/positional-graph` exists in `docs/domains/registry.md` with status `active`.
2. A `docs/domains/_platform/positional-graph/domain.md` file exists documenting purpose, boundary, contracts out, contracts in, and known consumers.
3. The domain map (`docs/domains/domain-map.md`) is updated to include the new domain and its relationships.

### Workflow Templates

4. Workflow templates are stored under a dedicated path within `.chainglass/` that is distinct from workflow instances.
5. A workflow template contains all files needed to define the workflow: graph.yaml (topology + wiring), nodes/*/node.yaml (input wiring), and bundled work unit directories (unit.yaml + prompts/ + scripts/).
6. Creating a workflow instance from a template produces a complete, independent copy — the instance directory contains all template files and can operate without the template present.
7. Modifying a workflow template after instance creation does not alter any existing instances.
8. Multiple instances can be created from the same workflow template independently.

### Work Unit Templates

9. Work unit templates are stored under a dedicated path within `.chainglass/` that is distinct from work unit instances.
10. A work unit template contains all files needed to define the unit (unit.yaml, prompts/, scripts/).
11. When a workflow instance is created, the work units it references are copied from their templates into the workflow instance directory.
12. Modifying a work unit template after instance creation does not alter any existing work unit instances.

### Work Unit Refresh

13. A user can refresh all work unit instances within a workflow instance from their source templates in a single operation.
14. Refreshing work unit instances overwrites each instance's unit directory with the current template content (full directory replacement).
15. The refresh operation records which template was used as the source (traceability metadata stored per-instance).
16. If the workflow instance has an active (in-progress) run, the refresh operation warns the user and requires explicit confirmation before proceeding.

### Git Integration

17. All template and instance files live within `.chainglass/` paths and are tracked by Git.
18. Templates created on one branch are available to other branches after merge via normal Git operations.
19. No special tooling is required beyond standard Git for template sharing across users and branches.

### E2E Test Migration

20. Existing e2e test fixtures from `dev/test-graphs/` are represented as workflow templates and work unit templates in the new system.
21. A new e2e test validates the full template lifecycle: create template → instantiate workflow → verify work unit instances present → refresh work units → verify refresh applied.
22. Existing e2e tests from Plans 038/039 patterns are reconfigured to use the template system instead of direct fixture copying.

## Testing Strategy

- **Approach**: Hybrid — TDD for template/instance copy logic and refresh mechanics; lightweight for domain extraction docs and E2E fixture migration
- **Rationale**: Template copy and refresh are the core new logic requiring careful validation. Domain extraction is documentation-only. E2E migration is integration-level.
- **Focus Areas**:
  - TDD: Template copy service (full directory copy semantics), work unit refresh service (overwrite mechanics), template registry (YAML discovery, validation)
  - Lightweight: Domain extraction (verify registry/map files exist), E2E fixture migration (run existing tests against new template paths)
- **Mock Policy**: Avoid mocks entirely — real data/fixtures only. Use existing FakeFileSystem and contract test patterns.
- **Excluded**: No performance tests. No UI tests (CLI-only feature).

## Documentation Strategy

- **Location**: Hybrid (README + docs/how/)
- **README**: Quick-start for new template CLI commands (`cg template create`, `cg template instantiate`, `cg template refresh`, etc.)
- **docs/how/**: Detailed guide covering template/instance concepts, directory layout, refresh semantics, and Git workflow for template sharing

## Risks & Assumptions

- **Risk**: The old workgraph system (current→checkpoint→run, `.chainglass/units/` global resolution) is being fully replaced. All code depending on the old patterns must be migrated or removed. Mitigation: inventory all consumers during architecture phase.
- **Risk**: Template refresh during an active workflow run could cause mid-execution inconsistency. Mitigation: warn user if run is active, proceed only with confirmation.
- **Assumption**: The old workgraph system (`@chainglass/workgraph` package, current/checkpoint/run flow) is being removed from the codebase. The new template/instance system is a clean replacement, not an extension.
- **Assumption**: Work unit templates use the same schema as current work unit definitions (unit.yaml) — no new YAML format required.
- **Assumption**: Domain extraction is a documentation exercise for this plan; no code is moved between packages.
- **Assumption**: Workflow instances are self-contained — all work units are copied locally, no fallback to global template paths.

## Open Questions

1. **Template storage path**: [DEFERRED TO WORKSHOP → RESOLVED] — See [Workshop 001: Template/Instance Directory Layout](workshops/001-template-instance-directory-layout.md). Proposed: `.chainglass/templates/workflows/<slug>/` and `.chainglass/templates/units/<slug>/`.
2. **Instance storage path**: [DEFERRED TO WORKSHOP → RESOLVED] — See Workshop 001 + [Workshop 003: Instance Unified Storage](workshops/003-instance-unified-storage.md). All instance data (including runtime state, outputs, events) lives under `.chainglass/instances/<workflow-slug>/<instance-id>/` — fully Git-tracked. No `.chainglass/data/instances/` path.
3. ~~**Work unit resolution order**~~: RESOLVED — Self-contained. Instances have all units locally, no fallback to global templates.
4. ~~**Checkpoint relationship**~~: RESOLVED — Replace. The old workgraph system (current→checkpoint→run) is being fully removed. The new template→instance system is a clean replacement.
5. ~~**Refresh scope**~~: RESOLVED — All at once only. Refresh overwrites all work units in a workflow instance for consistency.
6. ~~**Active run safety**~~: RESOLVED — Warn but allow. Show warning if run is active, proceed if user confirms.
7. **Template metadata**: Should templates carry metadata (description, author, version) beyond what's already in graph.yaml/unit.yaml? [LOW PRIORITY — can defer to architecture]
8. **Existing fixtures migration**: Should `dev/test-graphs/` fixtures be moved into `.chainglass/templates/` as the canonical source, or should they remain in `dev/` as dev-only fixtures that happen to also be represented as templates? [LOW PRIORITY — can defer to architecture]

## Workshop Opportunities

| Topic | Type | Why Workshop | Key Questions |
|-------|------|--------------|---------------|
| Template/Instance Directory Layout | Storage Design | **COMPLETED (v2)** — see [Workshop 001](workshops/001-template-instance-directory-layout.md). Corrected to use positional graph model (lines+nodes+units), not old wf.yaml/phases. | Resolved: graph.yaml + nodes/ from working graph instances, units bundled in template, instances self-contained. |
| Template Creation Flow & Node Identity | Data Model | **COMPLETED** — see [Workshop 002](workshops/002-template-creation-flow-and-node-identity.md). Templates are saved FROM working graph instances. No new declarative YAML format. | Resolved: `cg template save-from` copies graph definition + bundles units. Node IDs preserved. Eliminates workflow.yaml parser. |
| Instance Unified Storage | Storage Design | **COMPLETED** — see [Workshop 003](workshops/003-instance-unified-storage.md). All instance data (state.json, outputs, events) is Git-tracked under `.chainglass/instances/`. No dual-path. | Resolved: single destination, no hydration after clone, InstanceAdapter overrides getDomainPath(). |
| Work Unit Resolution & Refresh Mechanics | Data Model | The resolution algorithm (instance-local vs global fallback) and refresh semantics (full overwrite vs selective merge) have cascading effects on the orchestration pipeline. | What happens to in-flight state during refresh? Does resolution need a manifest or is directory presence sufficient? How does refresh interact with checkpoints? |
| E2E Test Fixture Migration Strategy | Integration Pattern | Existing fixtures in `dev/test-graphs/` serve both as test data and as the conceptual prototype for templates. The migration path affects test reliability and developer workflow. | Do fixtures become templates or reference templates? How does `withTestGraph()` change? Can we run old and new patterns in parallel during migration? |

## Clarifications

### Session 2026-02-25

**Q1: Workflow Mode** → **Full mode**. CS-4 feature with 4 phases requires all gates.

**Q2: Testing Strategy** → **Hybrid**. TDD for template/instance copy logic and refresh mechanics; lightweight for domain extraction docs and E2E fixture migration.

**Q3: Mock Policy** → **Avoid mocks entirely**. Use existing FakeFileSystem and real data/fixtures.

**Q4: Documentation Strategy** → **Hybrid (README + docs/how/)**. README quick-start for CLI commands, docs/how/ guide for concepts and directory layout.

**Q5: Domain Review** → **Boundary confirmed**. `_platform/positional-graph` encompasses Graph + Event + Orchestration + Pod as a single formal domain, with Agent and Consumer remaining separate per ADR-0012. No changes to existing domains.

**Q6: Template/Instance Storage Layout** → **DEFERRED TO WORKSHOP**. User wants to workshop the directory layout before architecture. This is the highest-impact remaining design decision.

**Q7: Work Unit Resolution** → **Self-contained**. Instances have all units locally, no fallback to global templates. Simpler model, fully portable.

**Q7b: Refresh Scope** → **All at once only**. Always refresh all work units in a workflow instance for consistency.

**Q7c: Active Run Safety** → **Warn but allow**. Show warning if run is active, proceed if user confirms.

**Q8: Checkpoint Relationship** → **Replace**. The old workgraph system (current→checkpoint→run, `@chainglass/workgraph` package) is being fully removed from the codebase. The new template→instance system is a clean replacement, not an extension. Do not depend on the old system at all.
