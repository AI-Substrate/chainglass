# Agentic Work Units for Positional Graph

**Mode**: Full
**Testing Strategy**: Full TDD
**File Management**: PlanPak

📚 This specification incorporates findings from `research-dossier.md` and two detailed workshops.

---

## Research Context

**Source**: `research-dossier.md` (55+ findings from 7 parallel subagents)

**Components Affected**:
- `packages/positional-graph/` — New types, schemas, services (greenfield)
- `apps/cli/` — Reserved parameter routing, DI container updates
- `test/unit/positional-graph/test-helpers.ts` — Enriched fixtures
- `test/e2e/positional-graph-execution-e2e.test.ts` — New test sections

**Critical Dependencies**:
- Positional-graph's existing `NarrowWorkUnit` and `IWorkUnitLoader` interfaces
- Shared utilities: `IFileSystem`, `IPathResolver`, `IYamlParser`, `WorkspaceContext`
- Zod for schema validation

**Modification Risks**:
- Breaking `NarrowWorkUnit` → `WorkUnit` structural compatibility breaks DI consumers
- Schema changes to `unit.yaml` format require backward-compatible additions only
- Error codes must use E180-E189 range (E150-E179 already allocated)

**Key Insight**: This is a **GREENFIELD** implementation — no imports from legacy `@chainglass/workgraph` package.

See `research-dossier.md` for full analysis.

---

## Summary

**WHAT**: Expand the positional-graph system's work unit types from the minimal `NarrowWorkUnit` (slug, inputs, outputs) to full discriminated types (`AgenticWorkUnit`, `CodeUnit`, `UserInputUnit`) with type-specific configurations and template content access.

**WHY**: Enable agentic workflows where:
1. Running agents can programmatically access their prompt templates (not just file paths)
2. Code units expose their scripts through a consistent API
3. User input units provide structured workflow entry points
4. The system can distinguish unit types at runtime for appropriate execution handling

---

## Goals

1. **Type Discrimination**: Introduce `type: 'agent' | 'code' | 'user-input'` field to WorkUnits, enabling runtime type-safe execution paths

2. **Reserved Parameter Routing**: Allow agents to retrieve template content via special input names (`main-prompt`, `main-script`) through the existing CLI input resolution commands

3. **Self-Contained Architecture**: Implement all new types, schemas, and services within `packages/positional-graph/` — no dependencies on legacy `@chainglass/workgraph`

4. **Backward Compatibility**: Ensure `WorkUnit` types remain structurally compatible with existing `NarrowWorkUnit` consumers (collateInputs, IWorkUnitLoader)

5. **Test Coverage**: Upgrade E2E test fixtures to exercise all three unit types, reserved parameter routing, and Row 0 UserInputUnit entry point semantics

---

## Non-Goals

1. **Agent Orchestration**: This plan stops before actual agent execution — we're building the data infrastructure, not the agent runtime

2. **Template Substitution**: No variable interpolation (`{{input_name}}`) — agents receive raw template content and handle their own substitution

3. **Caching**: No caching of unit definitions or template content — always read from disk for freshness

4. **Migration Tooling**: No automated migration of existing units — new fields are optional, existing `unit.yaml` files continue to work

5. **Workgraph Integration**: No bridging to or importing from `@chainglass/workgraph` — that package is legacy and will be removed

6. **New CLI Commands**: Reserved parameter routing uses existing `cg wf node get-input-data` command with special input names — no new top-level commands

---

## Complexity

**Score**: CS-3 (medium)

**Breakdown**:
| Dimension | Score | Rationale |
|-----------|-------|-----------|
| Surface Area (S) | 2 | Multiple packages: positional-graph (types, schemas, services), CLI (routing, DI), tests |
| Integration (I) | 1 | Internal dependencies only (IFileSystem, IYamlParser) — no external APIs |
| Data/State (D) | 1 | New optional fields in unit.yaml — backward compatible, no migrations |
| Novelty (N) | 1 | Pattern replication from legacy workgraph — concepts known, implementation new |
| Non-Functional (F) | 0 | Standard security (path escape validation), no special perf requirements |
| Testing (T) | 1 | Integration tests + E2E enrichment — unit tests for new services |

**Total**: S(2) + I(1) + D(1) + N(1) + F(0) + T(1) = **6** → **CS-3**

**Confidence**: 0.85 — Research dossier provides clear patterns and prior learnings; workshops define detailed design

**Assumptions**:
- Existing `IWorkUnitLoader` consumers (collateInputs) only access `slug`, `inputs`, `outputs` fields
- CLI command structure supports reserved parameter detection in `get-input-data`
- On-disk `unit.yaml` format from legacy workgraph is the target schema (with optional fields)

**Dependencies**:
- Plan 028 (Execution Lifecycle) must be complete — provides E2E test foundation
- Plan 026/027 (Positional Graph) infrastructure in place

**Risks**:
- Structural compatibility: If `WorkUnit` doesn't satisfy `NarrowWorkUnit`, DI breaks
- Error code collision: Must verify E180-E189 range is available

**Phases** (suggested):
1. Types and Schemas (interfaces, Zod validation)
2. Service Implementation (WorkUnitService, WorkUnitAdapter)
3. CLI Integration (reserved parameter routing)
4. Test Enrichment (fixtures, E2E sections 13-15)
5. Cleanup (remove workgraph bridge from DI)

---

## Acceptance Criteria

### AC-1: Discriminated Union Types
**Given** a `unit.yaml` file with `type: 'agent'`
**When** loaded via `IWorkUnitService.load()`
**Then** the returned object is typed as `AgenticWorkUnit` with `agent.prompt_template` accessible

### AC-2: Reserved Parameter Routing (Agent)
**Given** a running node backed by an AgenticWorkUnit
**When** `cg wf node get-input-data <graph> <node> main-prompt` is executed
**Then** the CLI returns the prompt template file content (not just the path)

### AC-3: Reserved Parameter Routing (Code)
**Given** a node backed by a CodeUnit
**When** `cg wf node get-input-data <graph> <node> main-script` is executed
**Then** the CLI returns the script file content

### AC-4: Reserved Parameter Type Mismatch
**Given** a node backed by a CodeUnit
**When** `cg wf node get-input-data <graph> <node> main-prompt` is executed
**Then** the CLI returns error E186 (UnitTypeMismatch)

### AC-5: UserInputUnit No Template
**Given** a UserInputUnit definition
**When** `cg wf unit get-template <slug>` is executed
**Then** the CLI returns error E183 (NoTemplate)

### AC-6: Backward Compatibility
**Given** an existing `NarrowWorkUnit` consumer (collateInputs)
**When** passed a full `WorkUnit` object
**Then** it continues to function correctly (structural subtyping)

### AC-7: Zod Schema Validation
**Given** a malformed `unit.yaml` (e.g., `type: 'agent'` without `agent:` config)
**When** loaded via `IWorkUnitService.load()`
**Then** error E182 (SchemaValidation) is returned with descriptive message

### AC-8: E2E Unit Type Verification
**Given** the E2E test with enriched fixtures
**When** Section 13 (Unit Type Verification) runs
**Then** unit types are correctly identified as agent/code/user-input

### AC-9: E2E Reserved Parameter Tests
**Given** the E2E test
**When** Section 14 (Reserved Parameter Routing) runs
**Then** `main-prompt` works on completed agent nodes, `main-script` on pending code nodes

### AC-10: E2E Row 0 UserInputUnit
**Given** a separate test graph with UserInputUnit on Line 0
**When** Section 15 (Row 0 UserInputUnit) runs
**Then** the node is immediately ready and can provide workflow entry data

---

## Risks & Assumptions

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Structural compatibility break | Low | High | Verify WorkUnit extends NarrowWorkUnit fields exactly |
| Error code collision | Low | Medium | Audit E180-E189 range before implementation |
| CLI routing complexity | Medium | Medium | Workshops define exact routing logic |
| Test fixture maintenance | Low | Low | Keep `e2eExecutionFixtures` alongside enriched fixtures |

### Assumptions

1. **Consumers only use narrow fields**: `collateInputs()` and other consumers only access `slug`, `inputs`, `outputs` — not type-specific fields

2. **Reserved params are static**: Template content is definition-time configuration, accessible regardless of node execution state

3. **No template substitution**: Agents handle their own template variable replacement — service returns raw content

4. **Required type field**: The `type` field is required — existing units must be updated to include it. Other new fields (`version`, `agent`, `code`, `user_input`) follow discriminated union rules (config section required for declared type)

5. **Line 0 semantics exist**: The 4-gate algorithm already makes Line 0 nodes "ready" — no special UserInputUnit handling needed

---

## Open Questions

### Q1: Should `NarrowWorkUnit` be deprecated?
**Context**: With full `WorkUnit` types available, `NarrowWorkUnit` becomes redundant.
**Resolution**: Keep as-is — existing name is fine, no churn. `NarrowWorkUnit` remains the interface for consumers that only need `slug`, `inputs`, `outputs`.

### Q2: Should reserved parameters require running node state?
**Context**: Workshop resolved that reserved params access static template content, independent of node state.
**Status**: RESOLVED in workshop — reserved params work regardless of node state (pending, running, completed)

### Q3: What happens if `type` field is missing from `unit.yaml`?
**Context**: Existing units may not have the `type` field.
**Resolution**: Error (require type field) — strict validation, all units must declare type explicitly. Existing units need the `type` field added before loading.

---

## ADR Seeds (Optional)

### ADR-SEED-1: Greenfield vs Bridge Architecture

**Decision Drivers**:
- Legacy `@chainglass/workgraph` is being removed
- Positional-graph should be self-contained
- No cross-package dependencies for core types

**Candidate Alternatives**:
- A) Bridge pattern — IWorkUnitLoader wraps workgraph's IWorkUnitService
- B) Import types — Use workgraph types directly
- C) Greenfield — Replicate types/services in positional-graph (CHOSEN)

**Stakeholders**: Platform team, CLI consumers

### ADR-SEED-2: Reserved Parameter Namespace

**Decision Drivers**:
- Reserved names must not conflict with user-defined input names
- Names should be intuitive for agent developers

**Candidate Alternatives**:
- A) Prefix: `_prompt`, `_script` (underscore convention)
- B) Compound: `main-prompt`, `main-script` (hyphenated, descriptive) (CHOSEN per workshop)
- C) Namespace: `$template.prompt`, `$template.script` (explicit namespace)

**Stakeholders**: Agent developers, CLI users

---

## Workshop Opportunities

Two workshops have been completed for this specification:

| Topic | Type | Status | Document |
|-------|------|--------|----------|
| WorkUnit Loading | Data Model + Integration | ✅ Complete | `workshops/workunit-loading.md` |
| E2E Test Enrichment | Data Model + Test Strategy | ✅ Complete | `workshops/e2e-test-enrichment.md` |

### Workshop Summaries

**WorkUnit Loading** (`workunit-loading.md`):
- Defines storage layout (`.chainglass/units/<slug>/`)
- TypeScript types and Zod schemas for discriminated union
- `IWorkUnitService` interface with `list()`, `load()`, `validate()`, `getTemplateContent()`
- Reserved parameter routing flow
- Error codes E180-E187

**E2E Test Enrichment** (`e2e-test-enrichment.md`):
- Enriched fixtures (`e2eEnrichedFixtures`) with full types
- `stubWorkUnitService()` for template content mocking
- New E2E sections 13 (Unit Type Verification), 14 (Reserved Parameters), 15 (Row 0 UserInputUnit)
- Naming convention standardization (`samplePrCreator`)
- Design note: reserved params work regardless of node state

---

## Implementation Checklist Preview

Based on workshops, implementation includes:

### Phase 1: Types & Schemas
- [ ] Create `packages/positional-graph/src/interfaces/workunit.types.ts`
- [ ] Create `packages/positional-graph/src/schemas/workunit.schema.ts`
- [ ] Create `packages/positional-graph/src/errors/workunit-errors.ts` (E180-E187)

### Phase 2: Service & Adapter
- [ ] Create `packages/positional-graph/src/adapter/workunit.adapter.ts`
- [ ] Create `packages/positional-graph/src/services/workunit.service.ts`
- [ ] Register in DI container

### Phase 3: CLI Integration
- [ ] Add reserved parameter detection to `get-input-data` command
- [ ] Add `cg wf unit` subcommands (list, info, get-template)

### Phase 4: Test Enrichment
- [ ] Add enriched fixtures to `test-helpers.ts`
- [ ] Add `stubWorkUnitService()` helper
- [ ] Add E2E Sections 13-15
- [ ] Create on-disk unit files for E2E

### Phase 5: Cleanup
- [ ] Remove workgraph bridge from DI container
- [ ] Update documentation

---

---

## Testing Strategy

**Approach**: Full TDD
**Rationale**: User specified full TDD for this CS-3 feature with new types, services, and CLI integration

**Focus Areas**:
- Zod schema validation (discriminated union edge cases)
- WorkUnitService load/validate/getTemplateContent operations
- Reserved parameter routing in CLI
- Structural compatibility (WorkUnit satisfies NarrowWorkUnit)
- Error code paths (E180-E187)

**Excluded**:
- Performance benchmarks (standard file I/O)
- UI components (CLI only)

**Mock Usage**: Fakes only (no mocks/stubs)
**Mock Rationale**: Use fake implementations (e.g., FakeFileSystem, FakeYamlParser) that mirror real behavior — no mocks or stubs. Fakes provide realistic testing while maintaining test isolation.

---

## Documentation Strategy

**Location**: docs/how/ only
**Rationale**: Detailed WorkUnit API guide in `docs/how/positional-graph/` — architecture, usage tutorials, troubleshooting
**Target Audience**: Agent developers, CLI users building workflows
**Maintenance**: Update when WorkUnit types or CLI commands change
**Content**:
- WorkUnit type definitions and examples
- Reserved parameter routing usage
- Error code reference (E180-E187)
- Row 0 UserInputUnit patterns

---

## Clarifications

### Session 2026-02-04

**Q1: What workflow mode fits this task?**
- **Answer**: B (Full)
- **Rationale**: User specified "full mode" — CS-3 feature with multiple phases, comprehensive gates required

**Q2: What testing approach best fits this feature?**
- **Answer**: A (Full TDD)
- **Rationale**: User specified "full TDD" — comprehensive unit/integration/e2e tests for new types, services, and CLI integration

**Q3: How should mocks/stubs/fakes be used during TDD implementation?**
- **Answer**: Fakes only (user clarification)
- **Rationale**: Use fake implementations (FakeFileSystem, etc.) that mirror real behavior — no mocks or stubs

**Q4: Where should this feature's documentation live?**
- **Answer**: B (docs/how/ only)
- **Rationale**: Detailed WorkUnit API guide in docs/how/positional-graph/ — architecture, usage, troubleshooting

**Q5: How should code files be organized during implementation?**
- **Answer**: A (PlanPak)
- **Rationale**: New files in features/029-agentic-work-units/ folders — full traceability, feature-grouped code

**Q6: Should NarrowWorkUnit be deprecated?**
- **Answer**: B (Keep as-is)
- **Rationale**: Existing name is fine, no churn — remains interface for narrow consumers

**Q7: What happens if 'type' field is missing from unit.yaml?**
- **Answer**: A (Error - require type field)
- **Rationale**: Strict validation — all units must declare type explicitly; existing units need updating

**Q8: Should this plan include updating existing unit.yaml files?**
- **Answer**: A (Yes, include in plan)
- **Rationale**: Update existing .chainglass/data/units/*/unit.yaml files as part of implementation

**Q9: Do existing unit.yaml files need to continue working without modification? (DYK #5)**
- **Answer**: No
- **Rationale**: Existing `unit.yaml` files will be updated in Phase 5 to include required `type` and `version` fields. The Non-Goals §4 statement "existing unit.yaml files continue to work" is superseded by Q7 (require type field) and Q8 (update existing files). No backward compatibility shim is needed.

### Coverage Summary

| Category | Status | Notes |
|----------|--------|-------|
| Workflow Mode | ✅ Resolved | Full mode — multi-phase, all gates |
| Testing Strategy | ✅ Resolved | Full TDD with fakes only (no mocks/stubs) |
| Documentation Strategy | ✅ Resolved | docs/how/ only |
| File Management | ✅ Resolved | PlanPak |
| NarrowWorkUnit naming | ✅ Resolved | Keep as-is |
| Missing type field handling | ✅ Resolved | Error (require type) |
| Existing unit migration | ✅ Resolved | Include in plan |
| Reserved param node state | ✅ Resolved (workshop) | Works regardless of state |
| unit.yaml backward compat | ✅ Resolved (DYK #5) | Not required — files updated in Phase 5 |

**Outstanding**: None
**Deferred**: None

---

*Specification created: 2026-02-04*
*Plan folder: `docs/plans/029-agentic-work-units/`*
