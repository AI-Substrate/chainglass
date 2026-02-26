# Workflow Templates & Instances Implementation Plan

**Plan Version**: 1.0.0
**Created**: 2026-02-25
**Spec**: [wf-web-spec.md](wf-web-spec.md)
**Workshop**: [001-template-instance-directory-layout.md](workshops/001-template-instance-directory-layout.md), [002-template-creation-flow-and-node-identity.md](workshops/002-template-creation-flow-and-node-identity.md), [003-instance-unified-storage.md](workshops/003-instance-unified-storage.md)
**Status**: DRAFT

## Summary

Build a template/instance system for workflows and work units in the positional graph engine. A workflow template is created by saving a working graph instance — the existing `graph.yaml` + `nodes/*/node.yaml` files ARE the template definition, bundled with self-contained work unit directories. No new declarative YAML format is needed. Instantiation copies the entire bundle to an independent instance directory with fresh runtime state. Work units within instances can be refreshed (overwritten) from templates. Everything lives in `.chainglass/` paths for Git management. The old workgraph system (current/checkpoint/run) is not extended — this is a clean replacement.

CLI commands are the primary interface and are introduced early (Phase 2) so the system can be validated through real usage before building integration tests.

## Target Domains

| Domain | Status | Relationship | Role |
|--------|--------|-------------|------|
| _platform/positional-graph | active (just extracted) | **modify** | Work unit loader must support instance-local resolution; instantiation copies graph definition + fresh runtime state |
| _platform/workgraph | deprecated | **none** | Not touched — removal is OOS for a future plan |
| _platform/file-ops | existing | **consume** | IFileSystem.copyDirectory() for template→instance copy |
| _platform/events | existing | **consume** | No changes — event contracts used as-is |

## Domain Manifest

| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| `packages/workflow/src/interfaces/template-service.interface.ts` | _platform/positional-graph | contract | ITemplateService — saveFrom, listWorkflows, showWorkflow, instantiate, listInstances, refresh |
| `packages/workflow/src/interfaces/instance-service.interface.ts` | _platform/positional-graph | contract | IInstanceService — getStatus (instance lifecycle query) |
| `packages/workflow/src/schemas/workflow-template.schema.ts` | _platform/positional-graph | internal | Zod schema for template directory validation (graph.yaml + nodes/ + units/ structure). Reuses existing PositionalGraphDefinitionSchema. Types via `z.infer<>` per ADR-0003. |
| `packages/workflow/src/schemas/instance-metadata.schema.ts` | _platform/positional-graph | internal | Zod schema for instance.yaml. Types via `z.infer<>` per ADR-0003. |
| `packages/workflow/src/services/template.service.ts` | _platform/positional-graph | internal | Template operations (list, show, instantiate, refresh) |
| `packages/workflow/src/services/instance.service.ts` | _platform/positional-graph | internal | Instance operations (getStatus — instance lifecycle query) |
| `packages/workflow/src/adapters/template.adapter.ts` | _platform/positional-graph | internal | Filesystem adapter for template paths |
| `packages/workflow/src/adapters/instance.adapter.ts` | _platform/positional-graph | internal | Filesystem adapter for instance paths |
| `packages/workflow/src/fakes/fake-template-service.ts` | _platform/positional-graph | internal | Test double |
| `packages/workflow/src/fakes/fake-instance-service.ts` | _platform/positional-graph | internal | Test double |
| `packages/positional-graph/src/adapters/instance-workunit.adapter.ts` | _platform/positional-graph | internal | IWorkUnitLoader that resolves from instance-local units/ |
| `apps/cli/src/commands/template.command.ts` | _platform/positional-graph | cross-domain | CLI commands consuming ITemplateService (Consumer domain per ADR-0012) |
| `test/unit/workflow/template-service.test.ts` | _platform/positional-graph | internal | TDD tests |
| `test/unit/workflow/instance-service.test.ts` | _platform/positional-graph | internal | TDD tests |
| `test/contracts/template-service.contract.ts` | _platform/positional-graph | internal | Fake/real parity |
| `test/integration/template-lifecycle.test.ts` | _platform/positional-graph | internal | E2E integration |
| `docs/how/workflow-templates.md` | _platform/positional-graph | internal | User guide |

> **Note on `packages/workflow/`**: This codebase already uses separate domain packages (`packages/workflow/`, `packages/workgraph/`, `packages/positional-graph/`) beyond `@chainglass/shared`. New template/instance code lives in `packages/workflow/` as it extends the existing workflow domain. This is consistent with the established multi-package architecture, though constitution P7 ("Shared by Default") was written before the multi-package pattern was adopted.

> **Note on Consumer domain**: CLI tasks are classified as `cross-domain` per ADR-0012's Consumer domain boundary. The Consumer domain is an architectural concept from ADR-0012, not a formal registry entry — CLI/web/terminal are thin wrappers that translate system events for humans.

## Key Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | Critical | Script relative paths may break when units are copied into instances — scripts use `$CG_WORKSPACE_PATH` + depth assumptions | Ensure scripts use absolute paths derived from env vars. Add integration test that runs a copied script from an instance. Phase 2 task. |
| 02 | High | `IFileSystem.copyDirectory()` already exists in `@chainglass/shared` — no need to build copy infrastructure | Reuse existing abstraction. Inject IFileSystem into template service. |
| 03 | High | `InitService.hydrateStarterTemplates()` already copies bundled templates from assets/ — similar pattern | Adopt same structure for template instantiation. Don't duplicate the pattern. |
| 04 | ~~High~~ | ~~No graph-from-YAML parser exists — workflow.yaml is a new declarative format with no reader/instantiator~~ | **ELIMINATED by Workshop 002**: Templates reuse existing graph.yaml + node.yaml format. No new parser needed. "Save as template" copies graph definition files; instantiation copies them back. |
| 05 | High | WorkUnitAdapter hardcodes `.chainglass/units/` path — instances need an adapter that resolves to instance-local `units/` | Create InstanceWorkUnitAdapter. Wire via DI context or factory method. Phase 2 task. |
| 06 | Medium | Test fixtures in dev/test-graphs/ hardcode `.chainglass/units/` in graph-test-runner.ts | Phase 4 migrates fixtures. Existing tests remain functional until then. |
| 07 | High | **Templates are created FROM working graph instances** — graph.yaml + nodes/*/node.yaml already contain real node IDs and validated wiring. No new declarative format needed. See [Workshop 002](workshops/002-template-creation-flow-and-node-identity.md). | Phase 3 (graph activation) is greatly simplified — becomes file copy + fresh state.json, not a YAML→imperative parser. |
| 08 | High | **Instance data is fully Git-tracked** — all runtime data (state.json, outputs, events) lives under `.chainglass/instances/`, NOT under gitignored `.chainglass/data/`. Eliminates dual-path complexity, no hydration after clone. See [Workshop 003](workshops/003-instance-unified-storage.md). | InstanceAdapter resolves to single path. No `getInstanceDataDir()`. Instantiate writes to one directory. |

## Phases

### Phase 1: Domain Finalization & Template Schema

**Objective**: Finalize domain docs and establish the Zod schemas + interfaces that everything else builds on.
**Domain**: `_platform/positional-graph`
**Delivers**:
- Verified domain extraction docs (already created, spot-check)
- Template directory validation schema (verifies graph.yaml + nodes/ + units/ structure)
- `instance.yaml` Zod schema (instance metadata + unit manifest)
- `ITemplateService` interface (including `saveFrom`)
- `FakeTemplateService` with test helpers
- Contract tests for template service
**Depends on**: None
**Complexity**: CS-2

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 1.1 | Verify domain extraction docs are accurate | _platform/positional-graph | `domain.md`, `registry.md`, `domain-map.md` are consistent and complete | Already created in prior step |
| 1.2 | Create `TemplateValidationSchema` (Zod) for template directory structure | _platform/positional-graph | Schema validates that a template dir contains: graph.yaml (valid per existing `PositionalGraphDefinitionSchema`), nodes/ with node.yaml files, units/ with unit dirs matching all unit_slugs referenced in node.yaml files. Types derived via `z.infer<>` per ADR-0003. | Reuses existing graph schema — no new graph format. Per Workshop 002. |
| 1.3 | Create `InstanceMetadataSchema` (Zod) for instance.yaml | _platform/positional-graph | Schema validates instance.yaml with slug, template_source, created_at, units[] (slug + source + refreshed_at). Type `InstanceMetadata` exported via `z.infer<>` per ADR-0003. | Per workshop §Instance Schema |
| 1.4 | Define `ITemplateService` and `IInstanceService` interfaces | _platform/positional-graph | ITemplateService has: `listWorkflows(ctx)`, `showWorkflow(ctx, slug)`, `saveFrom(ctx, graphSlug, templateSlug)`, `instantiate(ctx, slug, instanceId)`, `listInstances(ctx, slug)`, `refresh(ctx, slug, instanceId)`. IInstanceService has: `getStatus(ctx, slug, instanceId)`. All methods return Result pattern `{data, errors}`. Both defined BEFORE any implementation. | Interface-first per constitution P2. `saveFrom` is the primary template creation path (Workshop 002). |
| 1.5 | Create `FakeTemplateService` and `FakeInstanceService` | _platform/positional-graph | Fakes implement full interfaces with call tracking + return builders. All tests use Test Doc 5-field format. | Fakes over mocks per constitution P4 |
| 1.6 | Contract tests for ITemplateService and IInstanceService | _platform/positional-graph | Same test suite passes for Fake and Real (Real deferred to Phase 2/3). All tests use Test Doc format. | Per constitution P2 §contract tests |

### Phase 2: Template/Instance Service + CLI Commands

**Objective**: Build the core template and instance services AND the CLI commands together, so the system can be validated through real `cg template` usage. Templates are created from working graph instances via `save-from`. Instantiation copies the bundle and initializes fresh runtime state — no separate activation step needed.
**Domain**: `_platform/positional-graph` + cross-domain (CLI per ADR-0012)
**Delivers**:
- Template adapter (filesystem resolution for templates/ and instances/ paths)
- Template service (`save-from`, list, show, instantiate, refresh)
- Instance-local work unit adapter (resolves units from instance directories)
- CLI commands: `cg template save-from`, `cg template list`, `cg template show`, `cg template instantiate`, `cg template refresh`, `cg template instances`
- A template saved from an imperatively-built advanced-pipeline graph to test against
- Integration tests proving CLI → service → filesystem → validation round-trip
**Depends on**: Phase 1 (schemas + interface)
**Complexity**: CS-3
**Key risks**: Script path breakage when units copied to instances (finding 01). WorkUnitAdapter path routing (finding 05).

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 2.1 | Create `TemplateAdapter` (filesystem path resolution) | _platform/positional-graph | Resolves template paths: `templates/workflows/<slug>/`, `templates/units/<slug>/` | Uses IFileSystem, IPathResolver |
| 2.2 | Create `InstanceAdapter` (filesystem path resolution) | _platform/positional-graph | Resolves instance paths: `instances/<wf>/<id>/`, `instances/<wf>/<id>/units/<slug>/`. All instance data (including runtime state) lives here. | Overrides getDomainPath() per WorkUnitAdapter pattern. Per Workshop 003: no data/instances/ path. |
| 2.3 | TDD: save-from tests (red→green) | _platform/positional-graph | Write tests for saveFrom() — verify graph.yaml + nodes/ copied, state.json excluded, outputs excluded, units bundled. Test Doc format. | TDD per constitution P3. Core of Workshop 002. |
| 2.4 | Implement `TemplateService.saveFrom()` | _platform/positional-graph | Reads graph definition files from `.chainglass/data/workflows/<slug>/`, strips runtime state, copies graph.yaml + nodes/*/node.yaml + bundles all referenced units → `templates/workflows/<template-slug>/`. Passes tests from 2.3. | Uses IFileSystem.copyDirectory() per finding 02 |
| 2.5 | TDD: Template list/show tests (red→green) | _platform/positional-graph | Write tests for listWorkflows() and showWorkflow() against FakeTemplateService, then implement real service to pass. Test Doc format. | TDD per constitution P3 |
| 2.6 | Implement `TemplateService.listWorkflows()` + `showWorkflow()` | _platform/positional-graph | Lists all workflow templates via glob, shows template structure with unit count and node count. Passes tests from 2.5. | Glob discovery per PL-10 |
| 2.7 | TDD: Instantiate tests (red→green) | _platform/positional-graph | Write tests for instantiate() — verify full directory copy to instance, fresh state.json created in data path, units copied. Test Doc format. | TDD per constitution P3 |
| 2.8 | Implement `TemplateService.instantiate()` | _platform/positional-graph | Copies graph.yaml + nodes/ + units/ to instance dir, writes instance.yaml, creates fresh state.json in same dir, chmod +x scripts. Single destination per Workshop 003. Passes tests from 2.7. | No dual-write. All data in instances/ (tracked). |
| 2.9 | TDD: Refresh tests (red→green) | _platform/positional-graph | Write tests for refresh() — verify unit overwrite, timestamp update, active-run warning. Test Doc format. | TDD per constitution P3 |
| 2.10 | Implement `TemplateService.refresh()` | _platform/positional-graph | Overwrites all instance units from template, updates refreshed_at timestamps. Passes tests from 2.9. | Warn on active run per spec AC-16 |
| 2.11 | Create `InstanceWorkUnitAdapter` | _platform/positional-graph | IWorkUnitLoader that resolves units from `instances/<wf>/<id>/units/<slug>/` instead of global path. Registered via `useFactory` per ADR-0004. | Per finding 05 |
| 2.12 | Build advanced-pipeline graph imperatively and save as template | _platform/positional-graph | Run `buildAdvancedPipeline()` (from e2e test), then `saveFrom()` to create `.chainglass/templates/workflows/advanced-pipeline/`. Validates save-from works on real graph. | First real template — created from existing e2e graph, not hand-authored |
| 2.13 | Register CLI `cg template` command group | _platform/positional-graph | Commands registered: `save-from`, `list`, `show`, `instantiate`, `refresh`, `instances`. Wired through DI container via `useFactory`. | Per finding 03 |
| 2.14 | CLI `cg template save-from <graph> --as <template>` | _platform/positional-graph | Saves working graph as template, outputs summary | Primary template creation path |
| 2.15 | CLI `cg template list` + `cg template show <slug>` | _platform/positional-graph | Lists templates, shows structure with unit count and node count | Validates template discovery works |
| 2.16 | CLI `cg template instantiate <slug> --id <id>` | _platform/positional-graph | Creates instance with graph ready to run, outputs summary | End-to-end: CLI → service → filesystem + runtime |
| 2.17 | CLI `cg template refresh <slug>/<id>` | _platform/positional-graph | Refreshes all units, warns on active run | End-to-end refresh |
| 2.18 | CLI `cg template instances <slug>` | _platform/positional-graph | Lists all instances of a workflow template | Instance discovery |
| 2.19 | Integration test: script paths work after copy | _platform/positional-graph | Copy a code unit with scripts/ to instance, verify script can find its own prompts. Test Doc format. | Per finding 01 — critical risk |

### Phase 3: Integration Testing & Instance Validation

**Objective**: Prove the full pipeline works end-to-end: save-from → instantiate → drive graph to completion. Test edge cases (refresh during run, multiple instances, script path validation).
**Domain**: `_platform/positional-graph`
**Delivers**:
- Instance-aware PositionalGraphAdapter (resolves graph data to `.chainglass/instances/<wf>/<id>/` — tracked, per Workshop 003)
- Integration tests: full lifecycle from graph creation through template save through instance drive
- Edge case tests: refresh during active run, multiple instances from same template
**Depends on**: Phase 2 (template/instance service + CLI)
**Complexity**: CS-2 (simplified — no parser needed per Workshop 002)

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 3.1 | Instance-aware PositionalGraphAdapter | _platform/positional-graph | Routes graph data to `.chainglass/instances/<wf>/<id>/` (tracked). Same directory structure as standalone graphs, different root path. Registered via `useFactory` per ADR-0004. | Per findings 05 and 08 — unified tracked storage. |
| 3.2 | Integration test: save-from → instantiate → drive | _platform/positional-graph | Build advanced-pipeline imperatively, save as template, instantiate, complete user-input, drive with code units, verify graph completes. Test Doc format. | Full lifecycle proof |
| 3.3 | Integration test: multiple instances from same template | _platform/positional-graph | Instantiate same template twice with different IDs, verify independent state.json, drive both to completion. Test Doc format. | Proves instance isolation (spec AC-8) |
| 3.4 | Integration test: refresh during active run | _platform/positional-graph | Start a run, call refresh, verify warning issued and units updated after confirmation. Test Doc format. | Proves spec AC-16 |
| 3.5 | Integration test: template modification doesn't affect instance | _platform/positional-graph | Instantiate, modify template unit prompt, verify instance unit unchanged. Test Doc format. | Proves spec AC-7, AC-12 |

### Phase 4: E2E Test Migration & Documentation

**Objective**: Port existing e2e fixtures to the template system and write user documentation.
**Domain**: `_platform/positional-graph` + consumer
**Delivers**:
- Existing `dev/test-graphs/` fixtures converted to workflow templates
- Updated `withTestGraph()` (or new `withTemplateWorkflow()`) that uses template instantiation
- New e2e test validating full lifecycle: template → instantiate → verify → refresh → re-instantiate
- User documentation (README + docs/how/)
**Depends on**: Phase 3 (graph activation)
**Complexity**: CS-2
**Key risks**: Test fixture coupling (finding 06). Existing test breakage during migration.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 4.1 | Convert `smoke` fixture to workflow template | _platform/positional-graph | `dev/test-graphs/smoke/` → `.chainglass/templates/workflows/smoke/` with workflow.yaml | Simplest fixture — proves pattern |
| 4.2 | Convert `simple-serial` fixture to workflow template | _platform/positional-graph | workflow.yaml with 1 line, 2 nodes (setup → worker), input wiring | Second fixture |
| 4.3 | Convert remaining fixtures (goat, real-agent-serial, etc.) | _platform/positional-graph | All 8 fixtures from dev/test-graphs/ have corresponding workflow templates | Bulk conversion |
| 4.4 | Create `withTemplateWorkflow()` test helper | _platform/positional-graph | Creates temp dir, instantiates template (includes graph setup), returns test context | Replaces withTestGraph() for template-based tests |
| 4.5 | New e2e test: template lifecycle | _platform/positional-graph | Template → instantiate → verify graph ready → refresh units → new instance → verify. Test Doc format. | Spec AC-21 |
| 4.6 | Write `docs/how/workflow-templates.md` | _platform/positional-graph | Covers: concepts, directory layout, CLI commands, refresh workflow, Git integration | Spec documentation strategy |
| 4.7 | Update README with template CLI quick-start | _platform/positional-graph | Quick reference for `cg template` commands | Spec documentation strategy |

## Acceptance Criteria

- [x] AC-1: `_platform/positional-graph` domain entry exists in registry (Phase 1)
- [x] AC-2: `domain.md` exists for positional-graph (Phase 1)
- [x] AC-3: Domain map updated (Phase 1)
- [x] AC-4: Workflow templates at `.chainglass/templates/workflows/<slug>/` (Phase 2: T012)
- [x] AC-5: Workflow template contains graph.yaml + nodes/*/node.yaml + units/ (Phase 2: T004, T012)
- [x] AC-6: Instantiation creates independent copy (Phase 2: T008)
- [x] AC-7: Template modification doesn't affect instances (Phase 3: T007)
- [x] AC-8: Multiple instances from same template (Phase 3: T005)
- [ ] AC-9: Work unit templates at `.chainglass/templates/units/<slug>/` (standalone library — deferred)
- [x] AC-10: Work units contain unit.yaml + prompts/ + scripts/ (Phase 2: T012)
- [x] AC-11: Instance creation copies all referenced units (Phase 2: T008)
- [x] AC-12: Unit template modification doesn't affect instances (Phase 3: T007)
- [x] AC-13: Refresh overwrites all units at once (Phase 2: T010)
- [x] AC-14: Refresh records source template metadata (Phase 2: T010 — instance.yaml updated)
- [x] AC-15: Refresh metadata stored per-instance (Phase 2: instance.yaml with refreshed_at)
- [x] AC-16: Active run warning on refresh (Phase 2: T010 — ACTIVE_RUN_WARNING in errors[])
- [x] AC-17: All template/instance files Git-tracked (Phase 2: Workshop 003 unified storage)
- [x] AC-18: Templates merge via standard Git (Phase 2: files in .chainglass/ tracked by default)
- [x] AC-19: No special tooling for Git sharing (Phase 2: no hydration needed)
- [x] AC-20: Existing fixtures represented as templates (Phase 4: T001-T002 — smoke + simple-serial)
- [x] AC-21: E2E test validates full lifecycle (Phase 4: T004 — 5 tests)
- [ ] AC-22: Existing e2e tests reconfigured for template system (deferred — bulk fixture conversion OOS for Phase 4)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Script relative paths break in instances | High | Critical | Integration test in Phase 2 (task 2.19). Scripts must use `$CG_WORKSPACE_PATH` + absolute paths. |
| WorkUnitLoader resolves wrong path (global vs instance-local) | Medium | High | InstanceWorkUnitAdapter with explicit routing. DI context discrimination. |
| Existing tests break during fixture migration | Medium | Medium | Migration is Phase 4. Old fixtures remain until new system proven. Parallel paths. |
| DI container wiring conflicts (two adapters for same token) | Medium | High | Use child containers or factory-based adapter selection per ADR-0004 `useFactory` pattern. Test both paths. |

## ADR Alignment

| ADR | Status | How This Plan Aligns |
|-----|--------|---------------------|
| ADR-0003: Schema-First | Respected | Phase 1 creates Zod schemas before types. All types via `z.infer<>`. |
| ADR-0004: DI Pattern | Respected | All new services registered via `useFactory`. No decorators. Child containers for tests. |
| ADR-0006: CLI Orchestration | Not applicable | This plan is agent-agnostic. Future agent integration would reference ADR-0006. |
| ADR-0012: Domain Boundaries | Respected | All code stays within Graph Domain (_platform/positional-graph) and Consumer Domain. No code crosses into Event, Orchestration, Agent, or Pod domains. |

## Deviation Ledger

| Principle | Deviation | Rationale | Mitigation |
|-----------|-----------|-----------|------------|
| Constitution P7: Shared by Default | New code in `packages/workflow/` not `@chainglass/shared` | Codebase already has separate domain packages (workflow, workgraph, positional-graph). Multi-package architecture established in Plans 016-030 predates constitution P7. Template/instance code is domain-specific, not shared infrastructure. | Consistent with existing package boundaries. All exported contracts are importable by consumers. |

## Progress

| Phase | Status | Completed |
|-------|--------|-----------|
| Phase 1: Schema + Interfaces | Complete | 6/6 tasks |
| Phase 2: Service + CLI | Complete | 19/19 tasks |
| Phase 3: Integration Testing & Instance Validation | Complete | 7/7 tasks |
| Phase 4: E2E + Docs | Complete | 6/6 tasks |
