# Code Review: Phase 1 — Domain Finalization & Template Schema

**Plan**: /home/jak/substrate/048-wf-web/docs/plans/048-wf-web/wf-web-plan.md
**Spec**: /home/jak/substrate/048-wf-web/docs/plans/048-wf-web/wf-web-spec.md
**Phase**: Phase 1: Domain Finalization & Template Schema
**Date**: 2026-02-25
**Reviewer**: Automated (plan-7-v2)
**Testing Approach**: Hybrid (lightweight for Phase 1 — schemas, interfaces, fakes, contract tests)

## A) Verdict

**REQUEST_CHANGES**

Barrel exports for new interfaces, schemas, and fakes are missing from the main package entry point (`packages/workflow/src/index.ts`). Domain documentation has internal contradictions that should be resolved before Phase 2 builds on this foundation.

**Key failure areas**:
- **Implementation**: New types not re-exported from main barrel — downstream consumers cannot import `ITemplateService`, `TemplateManifest`, `FakeTemplateService` from `@chainglass/workflow`
- **Domain compliance**: `domain.md` explicitly disclaims ownership of template lifecycle while the plan assigns these files to that domain; contracts table not updated

## B) Summary

Phase 1 delivers well-structured, idiomatic code. Zod schemas follow ADR-0003, interfaces follow Constitution P2 (interface-first), fakes follow P4 (fakes over mocks), and contract tests use the 5-field Test Doc format. All 8 tests pass. The anti-reinvention check found no genuine duplication — `ITemplateService` is correctly distinct from `InitService.hydrateStarterTemplates()`. However, the new types are wired at the sub-barrel level (`interfaces/index.ts`, `fakes/index.ts`) but never re-exported from the main barrel (`src/index.ts`), breaking the package's public API surface. Additionally, `positional-graph/domain.md` has an internal contradiction: it explicitly states template lifecycle "Does NOT Own" while all template files are assigned to this domain in the plan manifest.

## C) Checklist

**Testing Approach: Hybrid (lightweight for Phase 1)**

- [x] Core validation tests present (8 contract tests covering all interface methods)
- [x] Critical paths covered (empty state, missing entity, call tracking)
- [x] Key verification points documented (Test Doc format on all tests)
- [x] Only in-scope files changed (no scope creep — pure types/interfaces/fakes/tests)
- [ ] Linters/type checks clean — not explicitly verified against main barrel
- [ ] Domain compliance checks pass — see § E.2 for failures

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | HIGH | packages/workflow/src/index.ts | correctness | ITemplateService, IInstanceService not re-exported from main barrel | Add re-exports following existing pattern |
| F002 | HIGH | packages/workflow/src/index.ts | correctness | TemplateManifest, InstanceMetadata, Zod schemas not exported from any barrel | Export types and schemas from main barrel |
| F003 | HIGH | packages/workflow/src/index.ts | correctness | FakeTemplateService, FakeInstanceService not re-exported from main barrel | Add re-exports following existing pattern |
| F004 | HIGH | docs/domains/_platform/positional-graph/domain.md | domain-md | "Does NOT Own" disclaims template lifecycle but plan assigns it here | Update domain.md to own template lifecycle |
| F005 | HIGH | docs/domains/_platform/positional-graph/domain.md | domain-md | § Contracts table missing ITemplateService, IInstanceService | Add contract rows |
| F006 | MEDIUM | packages/workflow/src/fakes/fake-template-service.ts:115-124 | correctness | reset() doesn't clear preset results (saveFromResult, instantiateResult, refreshResult) | Reset all preset fields like FakeWorkflowService does |
| F007 | MEDIUM | docs/domains/_platform/positional-graph/domain.md | domain-md | § Source Location lists only packages/positional-graph/ but Phase 1 code is in packages/workflow/ | Add packages/workflow/src/ entries |
| F008 | MEDIUM | docs/domains/_platform/positional-graph/domain.md | domain-md | § Composition doesn't list TemplateManifestSchema, InstanceMetadataSchema, fakes | Add composition rows |
| F009 | MEDIUM | docs/domains/domain-map.md | map-nodes | posGraph node label missing ITemplateService, IInstanceService | Update node label and health table |
| F010 | MEDIUM | test/contracts/template-service.contract.ts:30 | pattern | Contract test factory signature diverges from existing pattern; creates throwaway instance at describe-registration | Align with (name, createService) pattern |
| F011 | LOW | packages/workflow/src/schemas/*.ts | pattern | slugPattern regex duplicated in workflow-template.schema.ts:17 and instance-metadata.schema.ts:16 | Extract to shared constant |
| F012 | LOW | docs/plans/048-wf-web/wf-web-plan.md | orphan | Domain Manifest missing barrel files and some contract test files | Add missing entries |
| F013 | LOW | docs/plans/048-wf-web/tasks/phase-1-schema-and-interfaces/execution.log.md | evidence | T001 evidence is narrative-only, no concrete command output | Add grep/ls evidence |
| F014 | LOW | packages/workflow/src/schemas/workflow-template.schema.ts | pattern | Mixed camelCase (nodeId, graphSlug) and snake_case (created_at) in same schema | Acceptable if intentional for YAML key compatibility; document rationale |

## E) Detailed Findings

### E.1) Implementation Quality

**F001 (HIGH)**: The main barrel `packages/workflow/src/index.ts` does NOT re-export `ITemplateService`, `IInstanceService`, or their associated result types. These are only exported from the sub-barrel `packages/workflow/src/interfaces/index.ts`. Contract tests import `import type { ITemplateService } from '@chainglass/workflow'` which resolves to the main barrel — this works in vitest due to workspace-level TypeScript resolution, but the compiled `dist/index.d.ts` would not expose these types. Every other interface in the codebase (IWorkflowService, IPhaseService, IInitService, etc.) IS re-exported from the main barrel.

**F002 (HIGH)**: `TemplateManifest`, `TemplateManifestSchema`, `InstanceMetadata`, `InstanceMetadataSchema` and related types are not exported from any public barrel. Consumers using `FakeTemplateService.withWorkflows(workflows: TemplateManifest[])` cannot construct correctly-typed test data without importing from internal paths.

**F003 (HIGH)**: `FakeTemplateService` and `FakeInstanceService` are exported from `fakes/index.ts` but not from the main barrel. Every other fake (FakeWorkflowService, FakePhaseService, FakeInitService, etc.) IS re-exported from the main barrel.

**F006 (MEDIUM)**: `FakeTemplateService.reset()` clears call-tracking arrays, workflows, and instances map, but does NOT reset `saveFromResult`, `instantiateResult`, or `refreshResult` to their default `{ data: null, errors: [] }`. If a test calls `withSaveFromResult()` then `reset()`, subsequent `saveFrom()` calls still return the preset. The existing `FakeWorkflowService.reset()` clears all state.

**F010 (MEDIUM)**: Contract test factory uses `(createContext: () => { service, name })` whereas existing contract tests use `(name: string, createAdapter: () => T)`. The current pattern also calls `createContext()` at describe-registration time (line 30) just to extract the name, creating and discarding a throwaway service instance.

**F011 (LOW)**: `slugPattern = /^[a-z][a-z0-9-]*$/` is duplicated identically in `workflow-template.schema.ts:17` and `instance-metadata.schema.ts:16`.

**F014 (LOW)**: `TemplateManifestSchema` mixes camelCase (`nodeId`, `graphSlug`, `lineCount`) with snake_case (`created_at`). This may be intentional — camelCase fields match graph.yaml/node.yaml key names, while snake_case timestamps match existing schema convention.

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ✅ | All new files under packages/workflow/src/ (domain source tree) and test/contracts/ |
| Contract-only imports | ✅ | No cross-domain internal imports detected |
| Dependency direction | ✅ | Infrastructure domain — no violations |
| Domain.md updated | ❌ | § "Does NOT Own" contradicts plan; § Contracts missing new interfaces; § Composition missing new schemas/fakes; § Source Location incomplete |
| Registry current | ✅ | Both positional-graph (active) and workgraph (deprecated) entries present |
| No orphan files | ⚠️ | Barrel files and some test files not in Domain Manifest (LOW severity) |
| Map nodes current | ⚠️ | posGraph node label missing ITemplateService/IInstanceService |
| Map edges current | ✅ | Dependency edges correctly labeled |
| No circular business deps | ✅ | No business→business cycles |

**F004 (HIGH)**: `domain.md` § "Does NOT Own" explicitly states: *"Workflow template registry and lifecycle — belongs to @chainglass/workflow package (not yet a formalized domain)"*. But the plan's Domain Manifest assigns all template/instance files (ITemplateService, IInstanceService, schemas, fakes) to `_platform/positional-graph`. This internal contradiction must be resolved before Phase 2.

**F005 (HIGH)**: `domain.md` § Contracts table lists IPositionalGraphService, IOrchestrationService, etc. but does not include the two new public interfaces: ITemplateService and IInstanceService.

**F007–F009 (MEDIUM)**: Source Location, Composition, and domain-map node labels need updating to reflect Phase 1 deliverables.

### E.3) Anti-Reinvention

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| TemplateManifestSchema | None | N/A | ✅ Proceed |
| InstanceMetadataSchema | None | N/A | ✅ Proceed |
| ITemplateService | InitService.hydrateStarterTemplates() (different lifecycle) | N/A | ✅ Proceed |
| IInstanceService | None | N/A | ✅ Proceed |
| FakeTemplateService | Follows FakeWorkflowService pattern | _platform/positional-graph | ✅ Proceed |
| FakeInstanceService | Follows FakeWorkflowService pattern | _platform/positional-graph | ✅ Proceed |
| Contract tests | Follows workflow-service.contract pattern | _platform/positional-graph | ✅ Proceed |

No genuine duplication found. ITemplateService is correctly distinct from InitService — different lifecycle phases with no method-level overlap.

### E.4) Testing & Evidence

**Coverage confidence**: 88%

| AC | Confidence | Evidence |
|----|------------|----------|
| AC-1: Registry entry exists | 90% | `docs/domains/registry.md` contains positional-graph entry (line 13). Execution log claims done, lacks inline proof. |
| AC-2: domain.md exists | 95% | `docs/domains/_platform/positional-graph/domain.md` exists (126 lines). Verified. |
| AC-3: Domain map updated | 90% | `docs/domains/domain-map.md` contains posGraph node, dependency edges, health table row. Verified. |
| T002: TemplateValidationSchema | 85% | Schema file exists, tsc passes, types exported. No runtime Zod parse tests (acceptable for Phase 1). |
| T003: InstanceMetadataSchema | 85% | Schema file exists, tsc passes, types exported. No runtime Zod parse tests (acceptable for Phase 1). |
| T004: Interfaces | 90% | Both interfaces defined, barrel exports added. Exercised by contract tests. |
| T005: Fakes | 90% | Both fakes implement interfaces, call tracking arrays present. Contract tests instantiate and exercise. |
| T006: Contract tests | 95% | 8 tests pass (6 template + 2 instance). All use Test Doc format. |

### E.5) Doctrine Compliance

All major doctrine checks pass. One LOW finding (F014): mixed camelCase/snake_case in TemplateManifestSchema — likely intentional for cross-format compatibility.

| Check | Status |
|-------|--------|
| R-CODE-001: No `any`, explicit return types | ✅ |
| R-CODE-002: I-prefix interfaces, Fake-prefix fakes | ✅ |
| R-CODE-003: kebab-case files, .interface.ts/.test.ts suffixes | ✅ |
| P2 (Interface-First) | ✅ |
| P4 (Fakes over Mocks) | ✅ |
| ADR-0003 (Schema-First, z.infer) | ✅ |
| R-TEST-002: Test Doc 5-field format | ✅ |
| R-TEST-006: Contract tests in test/contracts/ | ✅ |

## F) Coverage Map

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| AC-1 | Domain entry in registry | `docs/domains/registry.md` line 13: `_platform/positional-graph | infrastructure | active` | 90% |
| AC-2 | domain.md exists | File exists at `docs/domains/_platform/positional-graph/domain.md` (126 lines) | 95% |
| AC-3 | Domain map updated | posGraph node + edges + health table in `docs/domains/domain-map.md` | 90% |
| T002 | TemplateValidationSchema | `packages/workflow/src/schemas/workflow-template.schema.ts` — 68 lines, Zod schema, types exported | 85% |
| T003 | InstanceMetadataSchema | `packages/workflow/src/schemas/instance-metadata.schema.ts` — 48 lines, Zod schema, types exported | 85% |
| T004 | ITemplateService + IInstanceService | Interface files + barrel exports | 90% |
| T005 | Fakes | Fake files + barrel exports + call tracking | 90% |
| T006 | Contract tests | 8 tests pass, Test Doc format, shared suite pattern | 95% |

**Overall coverage confidence**: 88%

## G) Commands Executed

```bash
git --no-pager log --oneline -20
git --no-pager diff --stat
git --no-pager diff --staged --stat
git --no-pager status --short
git --no-pager diff HEAD -- docs/domains/domain-map.md docs/domains/registry.md
pnpm vitest run test/contracts/template-service.contract.test.ts test/contracts/instance-service.contract.test.ts --reporter=verbose
# Full diff saved to docs/plans/048-wf-web/reviews/_computed.diff
```

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review —
> only context on the work that was done before the review.

**Review result**: REQUEST_CHANGES

**Plan**: /home/jak/substrate/048-wf-web/docs/plans/048-wf-web/wf-web-plan.md
**Spec**: /home/jak/substrate/048-wf-web/docs/plans/048-wf-web/wf-web-spec.md
**Phase**: Phase 1: Domain Finalization & Template Schema
**Tasks dossier**: /home/jak/substrate/048-wf-web/docs/plans/048-wf-web/tasks/phase-1-schema-and-interfaces/tasks.md
**Execution log**: /home/jak/substrate/048-wf-web/docs/plans/048-wf-web/tasks/phase-1-schema-and-interfaces/execution.log.md
**Review file**: /home/jak/substrate/048-wf-web/docs/plans/048-wf-web/reviews/review.phase-1-schema-and-interfaces.md

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| /home/jak/substrate/048-wf-web/packages/workflow/src/schemas/workflow-template.schema.ts | New | _platform/positional-graph | None |
| /home/jak/substrate/048-wf-web/packages/workflow/src/schemas/instance-metadata.schema.ts | New | _platform/positional-graph | None |
| /home/jak/substrate/048-wf-web/packages/workflow/src/interfaces/template-service.interface.ts | New | _platform/positional-graph | None |
| /home/jak/substrate/048-wf-web/packages/workflow/src/interfaces/instance-service.interface.ts | New | _platform/positional-graph | None |
| /home/jak/substrate/048-wf-web/packages/workflow/src/fakes/fake-template-service.ts | New | _platform/positional-graph | Fix reset() (F006) |
| /home/jak/substrate/048-wf-web/packages/workflow/src/fakes/fake-instance-service.ts | New | _platform/positional-graph | None |
| /home/jak/substrate/048-wf-web/packages/workflow/src/interfaces/index.ts | Modified | _platform/positional-graph | None |
| /home/jak/substrate/048-wf-web/packages/workflow/src/fakes/index.ts | Modified | _platform/positional-graph | None |
| /home/jak/substrate/048-wf-web/packages/workflow/src/index.ts | NOT modified | _platform/positional-graph | **Must add re-exports (F001–F003)** |
| /home/jak/substrate/048-wf-web/test/contracts/template-service.contract.ts | New | _platform/positional-graph | Consider pattern alignment (F010) |
| /home/jak/substrate/048-wf-web/test/contracts/template-service.contract.test.ts | New | _platform/positional-graph | None |
| /home/jak/substrate/048-wf-web/test/contracts/instance-service.contract.ts | New | _platform/positional-graph | Consider pattern alignment (F010) |
| /home/jak/substrate/048-wf-web/test/contracts/instance-service.contract.test.ts | New | _platform/positional-graph | None |
| /home/jak/substrate/048-wf-web/docs/domains/_platform/positional-graph/domain.md | New | _platform/positional-graph | **Update "Does NOT Own", Contracts, Composition, Source Location (F004–F008)** |
| /home/jak/substrate/048-wf-web/docs/domains/domain-map.md | Modified | — | Update posGraph node label (F009) |
| /home/jak/substrate/048-wf-web/docs/domains/registry.md | Modified | — | None |

### Required Fixes (if REQUEST_CHANGES)

| # | File (absolute path) | What To Fix | Why |
|---|---------------------|-------------|-----|
| 1 | /home/jak/substrate/048-wf-web/packages/workflow/src/index.ts | Add re-exports for ITemplateService, IInstanceService, result types, TemplateManifest, InstanceMetadata, schemas, FakeTemplateService, FakeInstanceService | F001–F003: Public API surface is incomplete; downstream consumers cannot import these types |
| 2 | /home/jak/substrate/048-wf-web/docs/domains/_platform/positional-graph/domain.md | Remove template lifecycle from "Does NOT Own"; add ITemplateService/IInstanceService to Contracts; add new components to Composition; add packages/workflow/ to Source Location | F004–F008: Domain doc contradicts plan and is out of date |
| 3 | /home/jak/substrate/048-wf-web/docs/domains/domain-map.md | Add ITemplateService, IInstanceService to posGraph node label | F009: Map doesn't reflect new contracts |
| 4 | /home/jak/substrate/048-wf-web/packages/workflow/src/fakes/fake-template-service.ts | Add preset result resets to reset() method | F006: Incomplete state cleanup per existing pattern |

### Domain Artifacts to Update (if any)

| File (absolute path) | What's Missing |
|---------------------|----------------|
| /home/jak/substrate/048-wf-web/docs/domains/_platform/positional-graph/domain.md | § "Does NOT Own" contradicts plan; § Contracts missing 2 interfaces; § Composition missing 4 components; § Source Location missing packages/workflow/ |
| /home/jak/substrate/048-wf-web/docs/domains/domain-map.md | posGraph node label missing ITemplateService, IInstanceService |

### Next Step

Fix the 4 required items above (barrel exports, domain.md, domain-map.md, reset()), then re-run:
```
/plan-7-v2-code-review --phase "Phase 1: Domain Finalization & Template Schema" --plan /home/jak/substrate/048-wf-web/docs/plans/048-wf-web/wf-web-plan.md
```
