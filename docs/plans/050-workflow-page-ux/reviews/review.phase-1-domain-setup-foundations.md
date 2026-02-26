# Code Review: Phase 1 — Domain Setup + Foundations

**Plan**: /home/jak/substrate/048-wf-web/docs/plans/050-workflow-page-ux/workflow-page-ux-plan.md
**Spec**: /home/jak/substrate/048-wf-web/docs/plans/050-workflow-page-ux/workflow-page-ux-spec.md
**Phase**: Phase 1: Domain Setup + Foundations
**Date**: 2026-02-26
**Reviewer**: Automated (plan-7-v2)
**Testing Approach**: Full TDD

## A) Verdict

**APPROVE WITH NOTES**

Four MEDIUM findings identified. None are blocking but all are worth addressing before Phase 2 begins.

**Key failure areas**:
- **Implementation**: Misleading Proxy documentation on FakePositionalGraphService; silent error swallowing in doping script
- **Testing**: AC-30 claims "all 8 node status states" but only 5 of 8 are exercised (missing `starting`, `restart-pending`); test cases lack Test Doc comments (R-TEST-002)

## B) Summary

Phase 1 delivers solid infrastructure: the workflow-ui domain is properly formalized, positional-graph services are correctly wired into the web DI container, FakePositionalGraphService is a well-built 548-line test double with call tracking and return builders (Constitution P4 compliant), and the doping system generates 8 demo scenarios with a comprehensive integration test. Domain compliance is clean — all 9 checks pass with only minor map/docs discrepancies. No concept reinvention was found. The primary gaps are documentation accuracy (Proxy claims in the fake's JSDoc), defensive coding in the doping script (empty-string fallbacks instead of assertions), and incomplete node status coverage in demo scenarios.

## C) Checklist

**Testing Approach: Full TDD**

- [x] Core validation tests present (8 integration tests covering all 8 scenarios)
- [x] Critical paths covered (graph creation, state injection, Zod schema round-trip, template instantiation)
- [ ] Red-Green-Refactor evidence (single commit — TDD ordering relaxed for Phase 1 infrastructure, acceptable)
- [x] Uses fakes, not mocks (real filesystem, real services, zero vi.fn() — Constitution P4)
- [x] Only in-scope files changed (15 files, all mapped to T001-T007)
- [x] Linters/type checks clean (per execution log)
- [x] Domain compliance checks pass (9/9 checks pass, 1 minor map note)

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | MEDIUM | fake-positional-graph-service.ts:1-11 | correctness | JSDoc claims "Proxy-based" but no Proxy is used | Update JSDoc to remove all Proxy references |
| F002 | MEDIUM | dope-workflows.ts:209-429 | error-handling | Silent empty-string fallbacks on lineId/nodeId; demo-from-template silently returns on error | Add assertions after service calls; throw on error instead of returning |
| F003 | MEDIUM | dope-workflows.ts (scenarios) | scope | AC-30 requires "all 8 node status states" but only 5 covered (missing starting, restart-pending) | Add scenarios or extend demo-complex with starting + restart-pending nodes |
| F004 | MEDIUM | dope-workflows.test.ts:196-419 | doctrine | All 8 test cases missing mandatory Test Doc comments (R-TEST-002/R-TEST-003) | Add 5-field Test Doc block to each it() |
| F005 | LOW | fake-positional-graph-service.ts:33 | correctness | Module-level emptyBaseResult shares errors array reference across callers | Return fresh `{ errors: [] }` from each method |
| F006 | LOW | fake-positional-graph-service.ts:305-317 | correctness | `as InspectResult` type assertion bypasses compile-time checking | Add withInspectResult builder or type the return properly |
| F007 | LOW | dope-workflows.ts:28 | correctness | Unused WORKFLOWS_DIR constant | Remove or use it consistently |
| F008 | LOW | dope-workflows.test.ts:80-108 | pattern | DEMO_UNITS duplicated between script and test with minor drift | Extract to shared module or accept as intentional cross-check |
| F009 | LOW | dope-workflows.test.ts:130 | correctness | injectState types state as `object` instead of `State` | Change to `State` type for compile-time validation |
| F010 | LOW | di-container.ts:536-724 | pattern | createTestContainer() has no registrations for Plan 050 services | Add fake registrations or document as known gap |
| F011 | LOW | domain-map.md / workflow-ui/domain.md | domain-md | domain.md lists file-ops dependency but domain-map has no edge | Remove file-ops from domain.md for Phase 1; add edge if Phase 2+ needs it |
| F012 | LOW | di-container.ts:455 | correctness | Comment says "Plan 048" but work is Plan 050 | Fix comment to reference Plan 050 |
| F013 | LOW | dope-workflows.test.ts:385-419 | correctness | demo-from-template test doesn't verify instantiated graph structure | Add svc.load() assertion for line/node counts |

## E) Detailed Findings

### E.1) Implementation Quality

**2 MEDIUM, 5 LOW findings.**

**F001 (MEDIUM)** — `/home/jak/substrate/048-wf-web/packages/positional-graph/src/fakes/fake-positional-graph-service.ts:1-11`
The class docstring says "Proxy-based test double", "Uses a JavaScript Proxy to auto-stub all 50+ methods", and references "DYK-I2: Proxy cuts from ~600 lines to ~200". The actual implementation is 548 lines of explicit method definitions with no Proxy. The docstring is vestigial from a design iteration.
**Fix**: Remove Proxy references from JSDoc. Describe as "Manual test double with call tracking and return builders."

**F002 (MEDIUM)** — `/home/jak/substrate/048-wf-web/scripts/dope-workflows.ts:209-212,399-429`
Two issues: (a) `line1.lineId ?? ""` passes empty string to `addNode` if `addLine` fails silently, and (b) `demo-from-template` scenario does `console.error` + `return` on failure, meaning `main()` reports success on partial failure.
**Fix**: Assert `lineId`/`nodeId` after service calls (e.g., `if (!line1.lineId) throw new Error('addLine failed')`). In demo-from-template, throw instead of returning.

**F005 (LOW)** — `/home/jak/substrate/048-wf-web/packages/positional-graph/src/fakes/fake-positional-graph-service.ts:33`
`emptyBaseResult` is a shared module-level object. If a test consumer pushes into `.errors`, it corrupts all subsequent returns.
**Fix**: Return `{ errors: [] }` fresh from each method.

**F006 (LOW)** — `/home/jak/substrate/048-wf-web/packages/positional-graph/src/fakes/fake-positional-graph-service.ts:305-317`
`as InspectResult` type assertion silently masks missing fields if InspectResult changes.
**Fix**: Add `withInspectResult()` builder or fully type the default return.

**F007 (LOW)** — `/home/jak/substrate/048-wf-web/scripts/dope-workflows.ts:28`
`WORKFLOWS_DIR` constant defined but never used. Path construction happens inline elsewhere.
**Fix**: Remove or refactor inline paths to use it.

**F012 (LOW)** — `/home/jak/substrate/048-wf-web/apps/web/src/lib/di-container.ts:455`
Comment says "Template/Instance services (Plan 048)" but this registration is Plan 050 Phase 1 work.
**Fix**: Change to "Plan 050".

**F013 (LOW)** — `/home/jak/substrate/048-wf-web/test/integration/dope-workflows.test.ts:385-419`
`demo-from-template` test verifies `instance.yaml` has `template_source` but doesn't verify the instantiated graph has the expected line/node structure.
**Fix**: Add `svc.load(ctx, 'demo-from-template')` with line/node count assertions.

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | Pass | All files under declared domain source trees |
| Contract-only imports | Pass | Concrete class imports in script/test DI bootstrap follow established pattern (same as CLI container) |
| Dependency direction | Pass | business (workflow-ui) --> infrastructure (positional-graph): correct. No reverse dependencies found |
| Domain.md updated | Pass | workflow-ui/domain.md + positional-graph/domain.md both updated with History, Composition entries |
| Registry current | Pass | registry.md has workflow-ui row (business, Plan 050, active) |
| No orphan files | Pass | All 15 changed files map to domains in manifest |
| Map nodes current | Pass | workflowUI node present with correct class and label |
| Map edges current | Pass (with note) | 5 edges present and labeled. Minor: domain.md lists file-ops dep but no map edge (F011) |
| No circular business deps | Pass | workflow-ui is the only business domain with edges; all point to infrastructure |

### E.3) Anti-Reinvention

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| FakePositionalGraphService | None (only inline `as unknown` stubs in 5 orchestration tests) | _platform/positional-graph | Proceed — genuinely new |
| createScriptServices() | Similar inline wiring in generate-templates.ts | scripts/ | Proceed — different purpose |
| DEMO_UNITS | Duplicated between script and test (F008) | Internal | Proceed — minor internal duplication |
| demo-agent/demo-code/demo-user-input units | None (existing units are sample-*, not demo-*) | N/A | Proceed — distinct namespace |
| buildDiskWorkUnitLoader usage | Correctly reused from dev/test-graphs/shared/helpers.ts | test infra | Reuse confirmed |

No genuine reinvention detected. All new components fill gaps that were identified during planning (Finding 01, Finding 02).

### E.4) Testing & Evidence

**Coverage confidence**: 72%

| AC | Confidence | Evidence |
|----|------------|----------|
| AC-28 | 90% | 8 scenarios created (exceeds "7+" requirement). Script runs in <0.1s. All 8 test cases pass (48ms). |
| AC-29 | 85% | `just dope`, `just dope clean`, `just dope <name>`, `just redope` all work. Clean removes demo-* from workflows/templates/instances directories. |
| AC-30 | 55% | Only 5 of 8 statuses exercised: pending, agent-accepted, waiting-question, blocked-error, complete. Missing: starting, restart-pending. (`ready` is computed at runtime, not persistable — inherent limitation.) |
| AC-37 | 88% | 8 integration tests with real filesystem, Zod schema round-trip validation, proper temp dir isolation, Constitution P4 compliant. Minor: not all scenarios assert line/node counts. |

### E.5) Doctrine Compliance

**F004 (MEDIUM)** — `/home/jak/substrate/048-wf-web/test/integration/dope-workflows.test.ts:196-419`
R-TEST-002/R-TEST-003 requires mandatory 5-field Test Doc comment (Why, Contract, Usage Notes, Quality Contribution, Worked Example) on every test case. All 8 `it()` blocks lack these.
**Fix**: Add Test Doc blocks.

**F008 (LOW)** — DEMO_UNITS duplicated between script and test with minor field differences (test version omits some descriptions). If canonical definitions change, copies may drift.

**F009 (LOW)** — Test `injectState` types state as `object`, losing type safety that the script version has with `State`.

**F010 (LOW)** — `createTestContainer()` in di-container.ts has no fake registrations for the Plan 050 tokens (POSITIONAL_GRAPH_SERVICE, WORK_UNIT_LOADER, TEMPLATE_SERVICE, etc.). Tests that resolve these from a test container will fail. Track as known gap for Phase 2.

**Constitution compliance**:
- P2 (Interface-first): Pass — fake implements IPositionalGraphService
- P4 (Fakes over mocks): Pass — call tracking via Map, return builders, zero vi.fn()
- DI pattern: Pass — all registrations use useFactory, no decorators

**Fake placement note** (informational): FakePositionalGraphService lives in `packages/positional-graph/src/fakes/` rather than `packages/shared/src/fakes/` per strict R-ARCH-002. However, this follows the established precedent of FakeWorkGraphService in `packages/workgraph/src/fakes/`. No action needed.

## F) Coverage Map

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| AC-28 | `just dope` creates 7+ demo workflows | 8 scenarios in dope-workflows.ts, 8 tests pass, execution log confirms <0.1s runtime | 90% |
| AC-29 | `just dope clean`, `just dope <name>`, `just redope` | Justfile recipes delegate to script. clean/all/single-name modes work per execution log | 85% |
| AC-30 | Demo workflows cover all 8 node status states | 5 of 8 covered (pending, agent-accepted, waiting-question, blocked-error, complete). Missing: starting, restart-pending. ready is computed/not persistable | 55% |
| AC-37 | Doping script validation test | 8 integration tests with real FS, Zod schema round-trip, temp dir isolation. All pass in 48ms | 88% |

**Overall coverage confidence**: 72%

## G) Commands Executed

```bash
# Diff computation
git log --oneline -15
git diff 96329c8^..96329c8 --stat
git diff 96329c8^..96329c8 > docs/plans/050-workflow-page-ux/reviews/_computed.diff
git diff 96329c8^..96329c8 -- justfile
git diff 96329c8^..96329c8 -- apps/web/tsconfig.json packages/positional-graph/src/index.ts packages/positional-graph/src/fakes/index.ts
git diff 96329c8^..96329c8 -- docs/domains/

# File reads (all changed files + domain docs + project rules)
# 15 changed files read in full
# 4 project rules files read (rules.md, idioms.md, architecture.md, constitution.md)
# Domain docs: registry.md, domain-map.md, workflow-ui/domain.md, positional-graph/domain.md
```

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review —
> only context on the work that was done before the review.

**Review result**: APPROVE WITH NOTES

**Plan**: /home/jak/substrate/048-wf-web/docs/plans/050-workflow-page-ux/workflow-page-ux-plan.md
**Spec**: /home/jak/substrate/048-wf-web/docs/plans/050-workflow-page-ux/workflow-page-ux-spec.md
**Phase**: Phase 1: Domain Setup + Foundations
**Tasks dossier**: /home/jak/substrate/048-wf-web/docs/plans/050-workflow-page-ux/tasks/phase-1-domain-setup-foundations/tasks.md
**Execution log**: /home/jak/substrate/048-wf-web/docs/plans/050-workflow-page-ux/tasks/phase-1-domain-setup-foundations/execution.log.md
**Review file**: /home/jak/substrate/048-wf-web/docs/plans/050-workflow-page-ux/reviews/review.phase-1-domain-setup-foundations.md

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| /home/jak/substrate/048-wf-web/docs/domains/workflow-ui/domain.md | created | workflow-ui | F011: Remove file-ops from Dependencies (minor) |
| /home/jak/substrate/048-wf-web/docs/domains/registry.md | modified | cross-domain | None |
| /home/jak/substrate/048-wf-web/docs/domains/domain-map.md | modified | cross-domain | None |
| /home/jak/substrate/048-wf-web/docs/domains/_platform/positional-graph/domain.md | modified | _platform/positional-graph | None |
| /home/jak/substrate/048-wf-web/apps/web/src/lib/di-container.ts | modified | cross-domain | F010: Track test-container gap; F012: Fix comment |
| /home/jak/substrate/048-wf-web/apps/web/tsconfig.json | modified | cross-domain | None |
| /home/jak/substrate/048-wf-web/packages/positional-graph/src/fakes/fake-positional-graph-service.ts | created | _platform/positional-graph | F001: Fix JSDoc; F005: Fresh errors; F006: Fix type assertion |
| /home/jak/substrate/048-wf-web/packages/positional-graph/src/fakes/index.ts | created | _platform/positional-graph | None |
| /home/jak/substrate/048-wf-web/packages/positional-graph/src/index.ts | modified | _platform/positional-graph | None |
| /home/jak/substrate/048-wf-web/scripts/dope-workflows.ts | created | workflow-ui | F002: Add assertions; F003: Add missing statuses; F007: Remove unused const |
| /home/jak/substrate/048-wf-web/test/integration/dope-workflows.test.ts | created | workflow-ui | F004: Add Test Doc; F008-F009: Minor type/dup fixes; F013: Strengthen assertions |
| /home/jak/substrate/048-wf-web/justfile | modified | cross-domain | None |

### Recommended Fixes (APPROVE WITH NOTES — optional but recommended)

| # | File (absolute path) | What To Fix | Why |
|---|---------------------|-------------|-----|
| 1 | /home/jak/substrate/048-wf-web/packages/positional-graph/src/fakes/fake-positional-graph-service.ts | Remove "Proxy-based" from JSDoc (4 lines) | F001: Misleading documentation |
| 2 | /home/jak/substrate/048-wf-web/scripts/dope-workflows.ts | Add assertions on lineId/nodeId after service calls; throw on error in demo-from-template | F002: Silent failures |
| 3 | /home/jak/substrate/048-wf-web/scripts/dope-workflows.ts | Add `starting` and `restart-pending` nodes to demo-complex scenario | F003: AC-30 coverage gap |
| 4 | /home/jak/substrate/048-wf-web/test/integration/dope-workflows.test.ts | Add Test Doc comments to all 8 test cases | F004: R-TEST-002 compliance |

### Domain Artifacts to Update (if any)

| File (absolute path) | What's Missing |
|---------------------|----------------|
| /home/jak/substrate/048-wf-web/docs/domains/workflow-ui/domain.md | Remove `_platform/file-ops` from Dependencies table (not a direct domain dependency in Phase 1) |

### Next Step

Phase 1 is approved. To proceed:
- Optional: Fix the 4 MEDIUM findings listed above (recommended before Phase 2)
- Then: `/plan-5-v2-phase-tasks-and-brief --phase 'Phase 2: Canvas Core + Layout' --plan /home/jak/substrate/048-wf-web/docs/plans/050-workflow-page-ux/workflow-page-ux-plan.md`
