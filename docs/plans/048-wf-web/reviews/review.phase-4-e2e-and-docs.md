# Code Review: Phase 4 — E2E Test Migration & Documentation

**Plan**: /home/jak/substrate/048-wf-web/docs/plans/048-wf-web/wf-web-plan.md
**Spec**: /home/jak/substrate/048-wf-web/docs/plans/048-wf-web/wf-web-spec.md
**Phase**: Phase 4: E2E Test Migration & Documentation
**Date**: 2026-02-26
**Reviewer**: Automated (plan-7-v2)
**Testing Approach**: Hybrid (lightweight for Phase 4 E2E migration)

## A) Verdict

**APPROVE WITH NOTES**

Three HIGH findings — all in test infrastructure with clear mitigations. No correctness, security, or production code issues.

**Key failure areas**:
- **Reinvention**: `buildLoader()` duplicated in 3 files; `makeExecutable()` duplicated when `makeScriptsExecutable()` already exists in helpers.ts
- **Doctrine**: Missing per-test Test Doc comments (R-TEST-002/003) in e2e test file
- **Scope**: Plan 049 artifacts (ux-enhancements spec+plan) included in Phase 4 commit

## B) Summary

Phase 4 delivers all 6 tasks: template generation script, smoke + simple-serial templates, `withTemplateWorkflow()` helper, 5 passing e2e lifecycle tests, workflow-templates.md guide, and README quick-start. Code quality is solid — real filesystem, real YAML parsing, zero mocks, proper cleanup. Domain compliance is clean (all imports via barrel exports, no cross-domain violations, domain.md history updated). The main issues are duplicated utility functions (`buildLoader` × 3, `makeExecutable` × 2 when existing helper available) and missing per-test Test Doc format. The 049 plan files in the commit are out-of-scope scope creep but don't affect Phase 4 correctness.

## C) Checklist

**Testing Approach: Lightweight (E2E migration)**

- [x] Core validation tests present (5 e2e tests covering lifecycle)
- [x] Critical paths covered (instantiate, wiring, isolation, refresh, multi-instance)
- [x] Key verification points documented (file-level Test Doc header present)
- [x] Only in-scope files changed (except 049 plan files — see F004)
- [x] Domain compliance checks pass (0 HIGH domain findings)
- [ ] Per-test Test Doc format (R-TEST-002) — missing individual test doc blocks

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | HIGH | Multiple files | reinvention | `buildLoader()` duplicated in 3 files + 1 variant | Extract to shared module |
| F002 | HIGH | Multiple files | reinvention | `makeExecutable()` duplicated; existing `makeScriptsExecutable()` in helpers.ts | Import existing helper |
| F003 | HIGH | template-lifecycle-e2e.test.ts | doctrine | Missing per-test Test Doc comments (R-TEST-002) | Add 5-field Test Doc to each `it()` |
| F004 | MEDIUM | docs/plans/049-ux-enhancements/ | scope | Plan 049 artifacts in Phase 4 commit | Move to separate commit |
| F005 | MEDIUM | generate-templates.ts:67-87 | error-handling | No error checks on intermediate create/addNode results | Add early-exit on failure |
| F006 | MEDIUM | template-lifecycle-e2e.test.ts:32-39 | correctness | Dead `cleanupFn`/`afterEach` code never assigned | Remove dead code |
| F007 | LOW | generate-templates.ts:184 | correctness | CLI arg parsing uses `args[1]` instead of `args[0]` | Use `args[0]` for positional |
| F008 | LOW | template-test-runner.ts:57-61 | correctness | Missing runtime guard on `testFn` type assertion | Add `typeof testFn !== 'function'` check |
| F009 | LOW | template-lifecycle-e2e.test.ts:99 | correctness | Wiring test only checks `from_output`, not `from_node` | Assert `from_node` is non-empty |
| F010 | LOW | scripts/generate-templates.ts | domain | Not in plan's domain manifest | Add manifest row for dev scripts |
| F011 | LOW | execution.log.md | evidence | Execution log is empty (header only) | Backfill with task evidence |
| F012 | LOW | template-lifecycle-e2e.test.ts:24 | doctrine | Import order: vitest after @chainglass/shared | Reorder: external → internal |
| F013 | LOW | tasks.md vs actual | documentation | Test file path diverges (tasks.md says `test/e2e/`, actual is `test/integration/`) | Update tasks.md path |

## E) Detailed Findings

### E.1) Implementation Quality

**F005 (MEDIUM)**: `buildSmoke()` and `buildSimpleSerial()` in `generate-templates.ts` use `?? ''` on return values without checking for errors. If `service.create()` or `service.addNode()` fails, execution continues with empty strings, producing confusing downstream errors.
```diff
- const { lineId } = await service.create(ctx, 'smoke');
- await service.addNode(ctx, 'smoke', lineId ?? '', 'ping');
+ const { lineId } = await service.create(ctx, 'smoke');
+ if (!lineId) throw new Error('create() returned no lineId');
+ await service.addNode(ctx, 'smoke', lineId, 'ping');
```

**F006 (MEDIUM)**: `cleanupFn` variable and `afterEach` block in `template-lifecycle-e2e.test.ts` are dead code — no test ever assigns `cleanupFn`. `withTemplateWorkflow()` handles cleanup in its own `finally` block.

**F007 (LOW)**: CLI arg parsing `args[1]` as positional fallback doesn't match usage. `npx tsx scripts/generate-templates.ts smoke` passes `smoke` as `args[0]`, not `args[1]`.

**F008 (LOW)**: `withTemplateWorkflow('slug', { preserveOnSuccess: true })` without a third argument compiles but crashes at runtime because `testFn` is cast via `as` without validation.

**F009 (LOW)**: Input wiring test asserts `from_output` is `'instructions'` but doesn't verify `from_node` references the correct setup node ID.

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ✅ | All files in appropriate locations. `scripts/` is consumer territory. |
| Contract-only imports | ✅ | All imports use barrel exports (`@chainglass/positional-graph`, `@chainglass/workflow`, `@chainglass/shared`) |
| Dependency direction | ✅ | No infrastructure→business imports |
| Domain.md updated | ✅ | `048-P4` history row added with accurate description |
| Registry current | ✅ | No new domains in Phase 4 |
| No orphan files | ✅ (1 LOW) | `scripts/generate-templates.ts` not in manifest (acceptable as consumer) |
| Map nodes current | ✅ | No new nodes needed |
| Map edges current | ✅ | No new cross-domain dependencies |
| No circular business deps | ✅ | No cycles |

### E.3) Anti-Reinvention

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| `withTemplateWorkflow()` | `withTestGraph()` (coexist by design) | _platform/positional-graph | ✅ Proceed |
| `buildLoader()` × 3 files | `buildDiskLoader()` in graph-test-runner.ts | _platform/positional-graph | ❌ **F001**: Extract to shared module |
| `makeExecutable()` × 2 files | `makeScriptsExecutable()` in helpers.ts | _platform/positional-graph | ❌ **F002**: Import existing |
| `generate-templates.ts` script | None | N/A | ✅ Proceed |

**F001 (HIGH)**: `buildLoader()` appears identically in:
- `scripts/generate-templates.ts:39`
- `dev/test-graphs/shared/template-test-runner.ts:159`
- `test/integration/template-instance-validation.test.ts:105` (from Phase 3)
- Near-identical `buildDiskLoader()` in `dev/test-graphs/shared/graph-test-runner.ts:75`

All should be consolidated into a single shared export.

**F002 (HIGH)**: `makeExecutable()` appears in both new files but `makeScriptsExecutable()` already exists in `dev/test-graphs/shared/helpers.ts:24` and does the same thing. Both new files should import the existing helper.

### E.4) Testing & Evidence

**Coverage confidence**: 88%

| AC | Confidence | Evidence |
|----|------------|----------|
| AC-20 | 95% | Both `smoke/` and `simple-serial/` templates exist at `.chainglass/templates/workflows/` with correct structure. Generation script at `scripts/generate-templates.ts`. |
| AC-21 | 90% | 5/5 e2e tests pass (37ms). Full lifecycle: instantiate → verify structure → wiring → isolation → refresh → multi-instance. Real FS, real YAML, zero mocks. Docked 10% for empty execution log. |

**Testing approach**: Lightweight — appropriate for Phase 4 E2E migration per spec.
**Violations**: Empty execution log (LOW), test file path divergence from tasks.md (INFO).

### E.5) Doctrine Compliance

**F003 (HIGH)**: Per R-TEST-002/R-TEST-003, each `it()` block requires a 5-field Test Doc comment (Why, Contract, Usage Notes, Quality Contribution, Worked Example). The e2e test file has a file-level header but individual tests lack per-test doc blocks.

**F012 (LOW)**: Import ordering in e2e test puts `vitest` after `@chainglass/shared`. Convention: external → internal → relative.

## F) Coverage Map

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| AC-20 | Existing fixtures represented as templates | smoke + simple-serial templates at `.chainglass/templates/workflows/`, generation script at `scripts/generate-templates.ts` | 95% |
| AC-21 | E2E test validates full lifecycle | 5 tests: instantiate, wiring, isolation, refresh, multi-instance — all pass | 90% |

**Overall coverage confidence**: 88%

## G) Commands Executed

```bash
git --no-pager log --oneline -20
git --no-pager diff --stat
git --no-pager diff --staged --stat
git --no-pager diff 6daac81..056a9b0 --stat
git --no-pager diff 6daac81..056a9b0 > docs/plans/048-wf-web/reviews/_computed.diff
npx vitest run test/integration/template-lifecycle-e2e.test.ts --reporter=verbose
grep -rn "function buildLoader" --include="*.ts" .
grep -rn "function makeExecutable" --include="*.ts" .
ls -la .chainglass/templates/workflows/smoke/ .chainglass/templates/workflows/simple-serial/
```

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review —
> only context on the work that was done before the review.

**Review result**: APPROVE WITH NOTES

**Plan**: /home/jak/substrate/048-wf-web/docs/plans/048-wf-web/wf-web-plan.md
**Spec**: /home/jak/substrate/048-wf-web/docs/plans/048-wf-web/wf-web-spec.md
**Phase**: Phase 4: E2E Test Migration & Documentation
**Tasks dossier**: /home/jak/substrate/048-wf-web/docs/plans/048-wf-web/tasks/phase-4-e2e-and-docs/tasks.md
**Execution log**: /home/jak/substrate/048-wf-web/docs/plans/048-wf-web/tasks/phase-4-e2e-and-docs/execution.log.md
**Review file**: /home/jak/substrate/048-wf-web/docs/plans/048-wf-web/reviews/review.phase-4-e2e-and-docs.md

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| /home/jak/substrate/048-wf-web/scripts/generate-templates.ts | Created | cross-domain | F001, F002, F005, F007 |
| /home/jak/substrate/048-wf-web/dev/test-graphs/shared/template-test-runner.ts | Created | _platform/positional-graph | F001, F002, F008 |
| /home/jak/substrate/048-wf-web/test/integration/template-lifecycle-e2e.test.ts | Created | _platform/positional-graph | F003, F006, F009, F012 |
| /home/jak/substrate/048-wf-web/docs/how/workflow-templates.md | Created | _platform/positional-graph | None |
| /home/jak/substrate/048-wf-web/.chainglass/templates/workflows/smoke/ | Created | _platform/positional-graph | None |
| /home/jak/substrate/048-wf-web/.chainglass/templates/workflows/simple-serial/ | Created | _platform/positional-graph | None |
| /home/jak/substrate/048-wf-web/README.md | Modified | consumer | None |
| /home/jak/substrate/048-wf-web/docs/how/workflows/2-template-authoring.md | Modified | _platform/positional-graph | None |
| /home/jak/substrate/048-wf-web/docs/domains/_platform/positional-graph/domain.md | Modified | _platform/positional-graph | None |
| /home/jak/substrate/048-wf-web/docs/plans/048-wf-web/wf-web-plan.md | Modified | N/A | None |
| /home/jak/substrate/048-wf-web/docs/plans/049-ux-enhancements/ux-enhancements-plan.md | Created | N/A | F004: Out of scope |
| /home/jak/substrate/048-wf-web/docs/plans/049-ux-enhancements/ux-enhancements-spec.md | Created | N/A | F004: Out of scope |

### Recommended Fixes (APPROVE WITH NOTES — optional but recommended)

| # | File (absolute path) | What To Fix | Why |
|---|---------------------|-------------|-----|
| 1 | Multiple files | Extract `buildLoader()` to shared module, import everywhere | F001: 3 identical copies |
| 2 | Multiple files | Replace `makeExecutable()` with import of `makeScriptsExecutable` from helpers.ts | F002: Existing helper available |
| 3 | /home/jak/substrate/048-wf-web/test/integration/template-lifecycle-e2e.test.ts | Add per-test Test Doc comments to all 5 `it()` blocks | F003: R-TEST-002 compliance |
| 4 | /home/jak/substrate/048-wf-web/test/integration/template-lifecycle-e2e.test.ts | Remove dead `cleanupFn` variable and `afterEach` block | F006: Dead code |
| 5 | /home/jak/substrate/048-wf-web/scripts/generate-templates.ts:67-87 | Add error checks on intermediate service call results | F005: Silent failures |

### Domain Artifacts to Update (if any)

| File (absolute path) | What's Missing |
|---------------------|----------------|
| /home/jak/substrate/048-wf-web/docs/plans/048-wf-web/wf-web-plan.md | Domain manifest row for `scripts/generate-templates.ts` (F010, LOW) |
| /home/jak/substrate/048-wf-web/docs/plans/048-wf-web/tasks/phase-4-e2e-and-docs/execution.log.md | Task completion evidence (F011, LOW) |

### Next Step

Plan 048 is complete (4/4 phases). The review is APPROVE WITH NOTES — the 3 HIGH findings are all maintainability/process issues in test infrastructure, not production bugs. Options:

1. **Fix the notes now** (recommended): Address F001-F003 (extract shared helpers, add Test Doc blocks), then re-run `just fft` and commit. No re-review needed since these are additive fixes.
2. **Ship as-is**: All tests pass, all ACs are met, domain compliance is clean. The duplicated helpers and missing test doc blocks are tech debt, not blockers.
3. **If fixing**: Run the fixes, then update progress with `/plan-6a-v2-update-progress --plan "/home/jak/substrate/048-wf-web/docs/plans/048-wf-web/wf-web-plan.md" --phase "Phase 4: E2E Test Migration & Documentation"`
