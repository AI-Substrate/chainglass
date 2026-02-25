# Execution Log: Phase 2 — Template/Instance Service + CLI Commands

**Phase**: Phase 2: Template/Instance Service + CLI Commands
**Plan**: [wf-web-plan.md](../../wf-web-plan.md)
**Started**: 2026-02-25

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
- All 677 contract tests pass

