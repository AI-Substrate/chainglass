# Code Review: Phase 2 — Template/Instance Service + CLI Commands

**Plan**: /home/jak/substrate/048-wf-web/docs/plans/048-wf-web/wf-web-plan.md
**Spec**: /home/jak/substrate/048-wf-web/docs/plans/048-wf-web/wf-web-spec.md
**Phase**: Phase 2: Template/Instance Service + CLI Commands
**Date**: 2026-02-25
**Reviewer**: Automated (plan-7-v2)
**Testing Approach**: Hybrid (TDD for template/instance copy logic + refresh; lightweight for docs and fixtures)

## A) Verdict

**APPROVE WITH NOTES**

All HIGH findings are documentation currency gaps or architectural style concerns — no runtime bugs, security issues, or correctness defects. Code is well-structured, tests pass (27/27 unit + 3/3 integration), and the template lifecycle works correctly end-to-end.

**Key failure areas**:
- **Domain compliance**: domain.md not updated with Phase 2 components (History, Composition, Source Location)
- **Doctrine**: TemplateService depends on concrete adapter types — no ITemplateAdapter/IInstanceAdapter interfaces
- **Testing**: execution.log.md only documents 2 of 19 completed tasks

## B) Summary

The Phase 2 implementation is solid — TemplateService correctly saves graphs as templates (stripping runtime state), creates independent instances, refreshes units, and bundles the full lifecycle behind 6 CLI commands. The code follows the Result pattern consistently, uses DI via `useFactory` per ADR-0004, and properly extends the existing adapter base classes. Domain compliance is clean (correct file placement, no cross-domain violations, no dependency direction issues), but domain.md needs updating with the 4 new components. The anti-reinvention check found no genuine duplication — the shared `.chainglass/templates/` namespace with the legacy compose system is separated by subdirectory (`workflows/`). Test coverage is good at 82% confidence across 8 relevant acceptance criteria, though the execution log is incomplete.

## C) Checklist

**Testing Approach: Hybrid**

- [x] TDD tests present for all 4 service method groups (saveFrom, list/show, instantiate, refresh)
- [x] TDD test→implementation ordering respected (T003→T004, T005→T006, T007→T008, T009→T010)
- [x] Integration test validates critical risk (Finding 01: script paths after copy)
- [x] All 30 tests pass (27 unit + 3 integration)
- [ ] Execution log documents all task evidence (only 2/19 tasks documented)
- [x] Only in-scope files changed (no unrelated modifications)
- [x] Linters/type checks clean
- [x] Domain compliance checks pass (file placement, dependency direction, imports)
- [ ] domain.md updated for Phase 2 components
- [ ] Test Doc 5-field format on all test blocks

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | HIGH | domain.md | domain-md | § History missing Phase 2 entry | Add History row for Phase 2 |
| F002 | HIGH | domain.md | domain-md | § Composition missing 4 components | Add TemplateService, TemplateAdapter, InstanceAdapter, InstanceWorkUnitAdapter |
| F003 | HIGH | template.service.ts:14-15 | doctrine | Service depends on concrete adapter types | Extract ITemplateAdapter + IInstanceAdapter interfaces |
| F004 | HIGH | execution.log.md | evidence | Only 2/19 tasks documented | Backfill T003-T019 entries |
| F005 | MEDIUM | template.service.ts:76-77 | error-handling | saveFrom() readDir without exists check on nodesDir | Add `exists()` guard like showWorkflow() |
| F006 | MEDIUM | template.command.ts:158-289 | correctness | --force flag accepted but never used | Wire to service or remove flag |
| F007 | MEDIUM | template.command.ts:171-176 | security | Path split without sanitization | Use `.filter(Boolean)` after split |
| F008 | MEDIUM | domain.md | domain-md | § Source Location missing 4 new files | Add service + adapter entries |
| F009 | MEDIUM | template-service.test.ts | doctrine | saveFrom tests missing Test Doc 5-field format | Add describe-level Test Doc |
| F010 | MEDIUM | template-service.test.ts:24-27 | doctrine | Test imports use relative paths not @chainglass/* | Use package aliases |
| F011 | MEDIUM | .chainglass/templates/ | anti-reinvention | Shared namespace with legacy compose system | Document layout convention |
| F012 | LOW | template.service.ts:132-144 | correctness | TemplateManifest created_at not persisted | Persist manifest or document |
| F013 | LOW | template.service.ts:441-461 | correctness | chmodScripts() is a no-op in production | Add IFileSystem.chmod or track |
| F014 | LOW | template.service.ts:387 | error-handling | Corrupt state.json aborts entire refresh | Wrap state parse in try/catch |
| F015 | LOW | template.service.ts:408-419 | correctness | refresh() skips units added to template after instantiation | Document behavior in interface JSDoc |
| F016 | LOW | template.service.ts:59-63 | doctrine | Inline anonymous type instead of Zod schema | Use PositionalGraphDefinitionSchema |
| F017 | LOW | di-tokens.ts | orphan | DI tokens not in domain manifest | Note in manifest as contract surface |

## E) Detailed Findings

### E.1) Implementation Quality

**F005 (MEDIUM)**: `saveFrom()` calls `this.fs.readDir(nodesDir)` at line 77 without checking if the `nodes/` directory exists. If a graph has no nodes, this throws ENOENT inside the try/catch, producing a generic error instead of a descriptive one. The same pattern is correctly handled in `showWorkflow()` at line 189 with `(await this.fs.exists(nodesDir)) ? await this.fs.readDir(nodesDir) : []`.

**F006 (MEDIUM)**: The CLI `refresh` command accepts a `--force` flag (line 289) and types it (line 160), but the flag value is never read in `handleRefresh()`. Per AC-16, the active run warning should be suppressible with `--force`. Currently the warning is shown but refresh proceeds regardless — `--force` has no effect.

**F007 (MEDIUM)**: `handleRefresh()` splits the path on `/` without sanitizing. Inputs like `/template`, `template/`, or `a/b/c` can produce empty strings or wrong part counts. Fix: `const parts = path.split('/').filter(Boolean); if (parts.length !== 2) { ... }`

**F012-F016 (LOW)**: Minor correctness and documentation items — created_at not persisted to disk, chmodScripts no-op, corrupt state.json handling, refresh scope documentation, inline types.

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ✅ | All new files in declared domain source trees |
| Contract-only imports | ✅ | No internal cross-domain imports (test relative paths are LOW concern) |
| Dependency direction | ✅ | No infrastructure→business or invalid cross-domain deps |
| Domain.md updated | ❌ | F001: § History missing Phase 2. F002: § Composition missing 4 components. F008: § Source Location missing 4 files. |
| Registry current | ✅ | `_platform/positional-graph` already registered as active |
| No orphan files | ✅ | All files map to declared domains (DI tokens implicitly covered) |
| Map nodes current | ✅ | Domain map includes positional-graph node |
| Map edges current | ✅ | Existing edges correct for current relationships |
| No circular business deps | ✅ | No business→business cycles |

### E.3) Anti-Reinvention

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| TemplateService | InitService.hydrateStarterTemplates() | workflow | ✅ Proceed — different formats and lifecycle |
| TemplateAdapter | WorkflowService.resolveTemplatePath() | workflow | ⚠️ Shared namespace but different subdirs — no functional overlap |
| InstanceAdapter | None | workflow | ✅ Proceed — new capability |
| InstanceWorkUnitAdapter | WorkUnitAdapter | positional-graph | ✅ Proceed — intentional adapter variant per Finding 05 |
| template.command.ts | None | cli | ✅ Proceed — new command group |

### E.4) Testing & Evidence

**Coverage confidence**: 82%

| AC | Confidence | Evidence |
|----|------------|----------|
| AC-4 | 95% | saveFrom test asserts `.chainglass/templates/workflows/my-template/graph.yaml`. TemplateAdapter.getDomainPath() returns correct path. |
| AC-5 | 95% | Tests verify graph.yaml, nodes/*/node.yaml, bundled units with unit.yaml + prompts/. Dedup test confirms correct handling. |
| AC-6 | 90% | Instantiate tests verify full directory copy, fresh state.json, independent instance path. |
| AC-11 | 90% | Test verifies both units copied. Integration test verifies scripts preserved through copy. |
| AC-13 | 85% | Refresh test verifies refreshedUnits contains both slugs. No explicit assertion old content overwritten. |
| AC-14 | 80% | refreshed_at timestamps verified. template_source in instance.yaml. No explicit template version test. |
| AC-15 | 85% | instance.yaml written with slug, template_source, units metadata. refreshed_at per-unit. |
| AC-16 | 95% | Test sets in_progress state, verifies ACTIVE_RUN_WARNING code returned. Refresh proceeds (non-blocking). |

### E.5) Doctrine Compliance

**F003 (HIGH)**: TemplateService constructor takes `TemplateAdapter` and `InstanceAdapter` as concrete types (lines 38-39) instead of interfaces. Per R-ARCH-001 (services depend on interfaces) and Constitution P2 (interfaces first), `ITemplateAdapter` and `IInstanceAdapter` should be defined in `packages/workflow/src/interfaces/`. The DI container does use token-based resolution, which provides practical decoupling, but the service source code directly references concrete types.

**F009 (MEDIUM)**: The `saveFrom` describe block (8 tests) lacks the Test Doc 5-field format header. Other blocks have describe-level Test Docs but no per-`it()` docs. Per R-TEST-003, Test Doc should appear at least at describe level.

**F010 (MEDIUM)**: Both test files use deep relative paths (`../../../packages/workflow/src/...`) instead of package aliases (`@chainglass/workflow`). Per R-CODE-004, package aliases should be used for cross-package imports.

## F) Coverage Map

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| AC-4 | Templates at `.chainglass/templates/workflows/<slug>/` | Unit test line 128 + TemplateAdapter.getDomainPath() | 95% |
| AC-5 | Template contains graph.yaml + nodes + units | Unit tests lines 128-166 (6 assertions) | 95% |
| AC-6 | Instantiation creates independent copy | Unit tests lines 278-336 (6 tests) | 90% |
| AC-11 | Instance creation copies all units | Unit test lines 311-319 + integration test | 90% |
| AC-13 | Refresh overwrites all units | Unit test lines 375-388 | 85% |
| AC-14 | Refresh records source template | Unit test lines 411-423 (refreshed_at) | 80% |
| AC-15 | Refresh metadata per-instance | Unit test lines 321-330 (instance.yaml) | 85% |
| AC-16 | Active run warning on refresh | Unit test lines 391-409 (ACTIVE_RUN_WARNING) | 95% |

**Overall coverage confidence**: 89%

## G) Commands Executed

```bash
# Diff computation
git diff 752b90a..c878d68 --stat
git diff 752b90a..c878d68 > docs/plans/048-wf-web/reviews/_computed.diff

# File inspection
git diff 752b90a..c878d68 -- packages/shared/src/di-tokens.ts
git diff 752b90a..c878d68 -- packages/workflow/src/index.ts packages/workflow/src/services/index.ts packages/workflow/src/adapters/index.ts

# Domain checks
cat docs/domains/registry.md
ls docs/domains/ docs/project-rules/

# Git history
git log --oneline -20
git diff --stat && git diff --staged --stat
```

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review —
> only context on the work that was done before the review.

**Review result**: APPROVE WITH NOTES

**Plan**: /home/jak/substrate/048-wf-web/docs/plans/048-wf-web/wf-web-plan.md
**Spec**: /home/jak/substrate/048-wf-web/docs/plans/048-wf-web/wf-web-spec.md
**Phase**: Phase 2: Template/Instance Service + CLI Commands
**Tasks dossier**: /home/jak/substrate/048-wf-web/docs/plans/048-wf-web/tasks/phase-2-template-service-and-cli/tasks.md
**Execution log**: /home/jak/substrate/048-wf-web/docs/plans/048-wf-web/tasks/phase-2-template-service-and-cli/execution.log.md
**Review file**: /home/jak/substrate/048-wf-web/docs/plans/048-wf-web/reviews/review.phase-2-template-service-and-cli.md

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| /home/jak/substrate/048-wf-web/packages/workflow/src/services/template.service.ts | Created | _platform/positional-graph | F005: Add nodesDir exists check. F006: Wire --force. |
| /home/jak/substrate/048-wf-web/packages/workflow/src/adapters/template.adapter.ts | Created | _platform/positional-graph | None |
| /home/jak/substrate/048-wf-web/packages/workflow/src/adapters/instance.adapter.ts | Created | _platform/positional-graph | None |
| /home/jak/substrate/048-wf-web/packages/positional-graph/src/adapter/instance-workunit.adapter.ts | Created | _platform/positional-graph | None |
| /home/jak/substrate/048-wf-web/apps/cli/src/commands/template.command.ts | Created | Consumer | F006: --force unused. F007: Sanitize path split. |
| /home/jak/substrate/048-wf-web/apps/cli/src/lib/container.ts | Modified | Consumer | None |
| /home/jak/substrate/048-wf-web/packages/shared/src/di-tokens.ts | Modified | _platform/positional-graph | None |
| /home/jak/substrate/048-wf-web/packages/workflow/src/schemas/instance-metadata.schema.ts | Modified | _platform/positional-graph | None |
| /home/jak/substrate/048-wf-web/packages/workflow/src/index.ts | Modified | _platform/positional-graph | None |
| /home/jak/substrate/048-wf-web/packages/workflow/src/services/index.ts | Modified | _platform/positional-graph | None |
| /home/jak/substrate/048-wf-web/packages/workflow/src/adapters/index.ts | Modified | _platform/positional-graph | None |
| /home/jak/substrate/048-wf-web/packages/positional-graph/src/adapter/index.ts | Modified | _platform/positional-graph | None |
| /home/jak/substrate/048-wf-web/test/unit/workflow/template-service.test.ts | Created | _platform/positional-graph | F009: Add Test Doc. F010: Fix imports. |
| /home/jak/substrate/048-wf-web/test/integration/template-lifecycle.test.ts | Created | _platform/positional-graph | F010: Fix imports. |
| /home/jak/substrate/048-wf-web/.chainglass/templates/workflows/advanced-pipeline/ | Created | _platform/positional-graph | None |

### Recommended Fixes (APPROVE WITH NOTES — not blocking)

| # | File (absolute path) | What To Fix | Why |
|---|---------------------|-------------|-----|
| 1 | /home/jak/substrate/048-wf-web/docs/domains/_platform/positional-graph/domain.md | Add Phase 2 History, Composition (4 components), Source Location entries | Domain doc currency (F001, F002, F008) |
| 2 | /home/jak/substrate/048-wf-web/docs/plans/048-wf-web/tasks/phase-2-template-service-and-cli/execution.log.md | Backfill evidence for T003-T019 | Audit trail completeness (F004) |
| 3 | /home/jak/substrate/048-wf-web/packages/workflow/src/services/template.service.ts | Add exists check for nodesDir in saveFrom() | Error handling robustness (F005) |
| 4 | /home/jak/substrate/048-wf-web/apps/cli/src/commands/template.command.ts | Wire --force flag + sanitize path split | UX contract + input validation (F006, F007) |
| 5 | /home/jak/substrate/048-wf-web/packages/workflow/src/interfaces/ | Extract ITemplateAdapter + IInstanceAdapter | Architecture compliance (F003) |

### Domain Artifacts to Update

| File (absolute path) | What's Missing |
|---------------------|----------------|
| /home/jak/substrate/048-wf-web/docs/domains/_platform/positional-graph/domain.md | Phase 2 History row, 4 Composition entries, 4 Source Location entries |

### Next Step

Phase 2 is approved with notes. Address the recommended fixes above, then proceed to Phase 3:

```
/plan-5-v2-phase-tasks-and-brief --phase "Phase 3: Integration Testing & Instance Orchestration" --plan /home/jak/substrate/048-wf-web/docs/plans/048-wf-web/wf-web-plan.md
```
