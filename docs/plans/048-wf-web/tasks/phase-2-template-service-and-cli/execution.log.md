# Execution Log: Phase 2 — Template/Instance Service + CLI Commands

**Phase**: Phase 2: Template/Instance Service + CLI Commands
**Plan**: [wf-web-plan.md](../../wf-web-plan.md)
**Started**: 2026-02-25
**Completed**: 2026-02-25
**Commit**: `c878d68`
**Branch**: `048-wf-web`

---

## Summary

19/19 tasks completed across 9 stages. All 4496 tests pass (`just fft` green).

**Domain**: `_platform/positional-graph` (all tasks) + cross-domain CLI (consumer per ADR-0012)

### Files Created (14)

| File | Domain | Purpose |
|------|--------|---------|
| `packages/workflow/src/adapters/template.adapter.ts` | positional-graph | Template path resolution (.chainglass/templates/workflows/) |
| `packages/workflow/src/adapters/instance.adapter.ts` | positional-graph | Instance path resolution (.chainglass/instances/) |
| `packages/workflow/src/services/template.service.ts` | positional-graph | Real ITemplateService impl (6 methods) |
| `packages/positional-graph/src/adapter/instance-workunit.adapter.ts` | positional-graph | IWorkUnitLoader for instance-local units |
| `apps/cli/src/commands/template.command.ts` | consumer/CLI | 6 CLI commands (save-from, list, show, instantiate, refresh, instances) |
| `test/unit/workflow/template-service.test.ts` | positional-graph | 24 TDD unit tests |
| `test/integration/template-lifecycle.test.ts` | positional-graph | 3 integration tests (script path validation) |
| `.chainglass/templates/workflows/advanced-pipeline/graph.yaml` | positional-graph | First template (4 lines, 6 nodes) |
| `.chainglass/templates/workflows/advanced-pipeline/nodes/*/node.yaml` | positional-graph | 6 node definitions with input wiring |
| `.chainglass/templates/workflows/advanced-pipeline/units/*` | positional-graph | 6 bundled work units (prompts + unit.yaml) |
| `docs/plans/048-wf-web/workshops/003-instance-unified-storage.md` | positional-graph | Workshop: all instance data Git-tracked |
| `docs/plans/048-wf-web/tasks/phase-2-template-service-and-cli/tasks.md` | — | Phase 2 dossier |
| `docs/plans/048-wf-web/tasks/phase-2-template-service-and-cli/tasks.fltplan.md` | — | Flight plan |
| `docs/plans/048-wf-web/tasks/phase-2-template-service-and-cli/execution.log.md` | — | This file |

### Files Modified (8)

| File | Domain | Change |
|------|--------|--------|
| `packages/shared/src/di-tokens.ts` | shared | Added TEMPLATE_SERVICE, TEMPLATE_ADAPTER, INSTANCE_ADAPTER tokens |
| `packages/workflow/src/adapters/index.ts` | positional-graph | Barrel exports for TemplateAdapter, InstanceAdapter |
| `packages/workflow/src/services/index.ts` | positional-graph | Barrel export for TemplateService |
| `packages/workflow/src/index.ts` | positional-graph | Main barrel re-exports for adapters + service |
| `packages/workflow/src/schemas/instance-metadata.schema.ts` | positional-graph | Added template_commit, refresh_commit fields |
| `packages/positional-graph/src/adapter/index.ts` | positional-graph | Barrel export for InstanceWorkUnitAdapter |
| `apps/cli/src/lib/container.ts` | consumer/CLI | DI wiring for TemplateService + adapters |
| `apps/cli/src/bin/cg.ts` | consumer/CLI | Register template commands |

### Domain Impact

| Domain | Relationship | Changes |
|--------|-------------|---------|
| _platform/positional-graph | **modify** | +3 adapters, +1 service, +1 schema update, +1 workshop |
| _platform/file-ops | consume | No changes — used IFileSystem.copyDirectory(), readFile, writeFile, mkdir |
| consumer (CLI) | cross-domain | +1 command file, +DI wiring, +entry point registration |
| shared | consume | +3 DI tokens added to POSITIONAL_GRAPH_DI_TOKENS |

### Contract Changes

- `InstanceMetadataSchema` gained 2 optional fields (`template_commit`, `refresh_commit`) — backward compatible
- `POSITIONAL_GRAPH_DI_TOKENS` gained 3 entries (TEMPLATE_SERVICE, TEMPLATE_ADAPTER, INSTANCE_ADAPTER)
- No existing contracts broken

### Domain Map Status

`docs/domains/domain-map.md` does not need updating — ITemplateService and IInstanceService were already added in Phase 1 review fixes.

---

## Task Log

### T001: Create TemplateAdapter — COMPLETE
- Created `packages/workflow/src/adapters/template.adapter.ts`
- Extends `WorkspaceDataAdapterBase`, overrides `getDomainPath()` → `.chainglass/templates/workflows/`
- Methods: `getTemplateDir()`, `getStandaloneUnitDir()`, `getGraphSourceDir()`, `getGlobalUnitsDir()`, `listTemplateSlugs()`, `templateExists()`, `ensureTemplateDir()`
- Barrel exports added to `adapters/index.ts` and main `index.ts`

### T002: Create InstanceAdapter — COMPLETE
- Created `packages/workflow/src/adapters/instance.adapter.ts`
- Extends `WorkspaceDataAdapterBase`, overrides `getDomainPath()` → `.chainglass/instances/`
- Methods: `getInstanceDir()`, `getInstanceUnitDir()`, `listInstanceIds()`, `instanceExists()`, `ensureInstanceDir()`
- Per Workshop 003: unified storage, no `data/instances/` path
- Barrel exports added

### T003-T004: saveFrom TDD — COMPLETE
- 8 tests: graph.yaml copied, nodes copied, state.json excluded, outputs excluded, events excluded, units bundled, deduplication, error on missing graph
- Implementation reads from `.chainglass/data/workflows/`, strips runtime, bundles units

### T005-T006: list/show TDD — COMPLETE
- 3 tests: empty list, list after save, show existing/missing
- Glob-discovers templates, parses graph.yaml + scans nodes/units

### T007-T008: instantiate TDD — COMPLETE
- 6 tests: graph copied, nodes copied, fresh state.json (pending), units copied, instance.yaml metadata, error on missing
- Single destination per Workshop 003 (no dual-write)

### T009-T010: refresh TDD — COMPLETE
- 4 tests: units refreshed, active-run warning, timestamps updated, error on missing
- Overwrites instance units from template, detects in_progress state

### T011: InstanceWorkUnitAdapter — COMPLETE
- Created `packages/positional-graph/src/adapter/instance-workunit.adapter.ts`
- Implements IWorkUnitLoader with `basePath` constructor (decoupled from instance naming)
- Phase 3 will wire the DI factory for adapter selection

### T012: Advanced-pipeline template — COMPLETE
- Created `.chainglass/templates/workflows/advanced-pipeline/` (committed artifact)
- 4 lines, 6 nodes (human-input → spec-writer → programmer-a + programmer-b → reviewer + summariser)
- 6 bundled units with prompts, no state.json

### T013-T018: CLI commands — COMPLETE
- Created `apps/cli/src/commands/template.command.ts` with 6 subcommands
- DI tokens added to `packages/shared/src/di-tokens.ts`
- DI wiring in `apps/cli/src/lib/container.ts` via useFactory
- Registered in `apps/cli/src/bin/cg.ts`

### T019: Integration test — COMPLETE
- Created `test/integration/template-lifecycle.test.ts`
- 3 tests: script preserved template→instance, unit.yaml preserved, script survives refresh
- Validates Finding 01 (critical risk: script path breakage)

---

## Discoveries & Learnings

| Date | Task | Type | Discovery | Resolution |
|------|------|------|-----------|------------|
| 2026-02-25 | T002 | decision | Instance data should be Git-tracked, not gitignored | Workshop 003 created — unified storage under instances/, eliminated data/instances/ |
| 2026-02-25 | T011 | decision | InstanceWorkUnitAdapter needs base-path constructor for DI elegance | Constructor takes `basePath: string`, not (wfSlug, instanceId) — decoupled |
| 2026-02-25 | T012 | insight | Template created from fixture data rather than running real graph engine | Graph topology + node wiring hand-authored to match buildAdvancedPipeline(); units copied from dev/test-graphs/ |
| 2026-02-25 | DYK | decision | instance-metadata.schema gains template_commit + refresh_commit | Optional fields for Git commit tracking at create/refresh time |

