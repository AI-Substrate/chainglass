# Code Review: Phase 3 — Integration Testing & Instance Validation

**Plan**: `/home/jak/substrate/048-wf-web/docs/plans/048-wf-web/wf-web-plan.md`
**Spec**: `/home/jak/substrate/048-wf-web/docs/plans/048-wf-web/wf-web-spec.md`
**Phase**: Phase 3: Integration Testing & Instance Validation
**Date**: 2026-02-26
**Reviewer**: Automated (plan-7-v2)
**Testing Approach**: Hybrid (TDD for adapter, integration tests for lifecycle)

## A) Verdict

**APPROVE WITH NOTES**

Three MEDIUM findings — none blocking. Inherited `listGraphSlugs()` resolves to wrong directory (unused in current code paths), and Test Doc placement is at describe/file level rather than per-`it()`.

**Key failure areas**:
- **Implementation**: `listGraphSlugs()` inherited from parent resolves to `data/workflows/` instead of instance path — low risk since method is unused in instance execution context
- **Doctrine**: Test Doc 5-field format placed at describe/file level instead of per-`it()` as specified in R-TEST-002/003

## B) Summary

Phase 3 delivers exactly what was planned: an InstanceGraphAdapter extending PositionalGraphAdapter with a pre-resolved instance path, plus 4 integration tests proving lifecycle correctness (AC-6, 7, 8, 12, 16). The implementation cleanly follows the InstanceWorkUnitAdapter precedent from Phase 2, with no concept reinvention. All 11 tests pass (6 unit + 5 integration). Domain compliance is clean — all files are correctly placed under `_platform/positional-graph`. The only substantive code concern is an inherited method (`listGraphSlugs()`) that would silently return wrong results if ever called on an InstanceGraphAdapter — acceptable as a deferred concern since the method isn't used in the instance execution path.

## C) Checklist

**Testing Approach: Hybrid**

- [x] TDD for InstanceGraphAdapter (T001 tests → T002 implementation)
- [x] Integration tests for lifecycle scenarios (T004-T007)
- [x] Core validation tests present (6 unit + 5 integration)
- [x] Critical paths covered (save-from → instantiate → verify)
- [x] Key verification points documented (execution.log.md)
- [x] Only in-scope files changed
- [x] Domain compliance checks pass

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | MEDIUM | `packages/positional-graph/src/adapter/instance-graph.adapter.ts:21-53` | correctness | Inherited `listGraphSlugs()` resolves to `data/workflows/`, not instance dir | Override with throw or single-element return |
| F002 | MEDIUM | `test/unit/positional-graph/instance-graph-adapter.test.ts` | doctrine | Test Doc 5-field format at file level, not per-`it()` | Move into each `it()` per R-TEST-003 |
| F003 | MEDIUM | `test/integration/template-instance-validation.test.ts` | doctrine | Test Doc 5-field format at `describe` level, not per-`it()` | Move into each `it()` per R-TEST-003 |
| F004 | LOW | `test/unit/positional-graph/instance-graph-adapter.test.ts:68-71` | correctness | `ensureGraphDir` test doesn't verify `nodes/` subdir created | Add assertion for `${INSTANCE_PATH}/nodes` |
| F005 | LOW | `docs/domains/_platform/positional-graph/domain.md` | domain-md | Domain.md updates not committed in Phase 3 range | Stage and commit with Phase 3 work |
| F006 | LOW | `docs/plans/048-wf-web/tasks/phase-3-integration-and-validation/execution.log.md` | testing | AC-6 omitted from execution log AC table despite T004 coverage | Add AC-6 row to ACs Covered table |

## E) Detailed Findings

### E.1) Implementation Quality

**F001** (MEDIUM): `InstanceGraphAdapter` does not override `listGraphSlugs()`. The inherited implementation from `PositionalGraphAdapter` calls `getDomainPath(ctx)` which resolves to `.chainglass/data/workflows/`, not the instance directory. If `PositionalGraphService.list()` is ever called with an `InstanceGraphAdapter`, it would silently return graph slugs from the wrong location.

**Mitigating factor**: `listGraphSlugs()` is not called in any Phase 3 code path. The adapter is scoped to a single instance and `list` operations are not semantically meaningful. However, the method is public and could surprise future callers.

**Suggestion**: Override `listGraphSlugs()` to throw `Error('listGraphSlugs not supported for instance adapter')` or return `[]`.

Similarly, the inherited `removeGraph()` delegates to `getGraphDir()` which IS correctly overridden, so it would remove the instance dir — but the slug-based semantics may surprise callers.

**F004** (LOW): The `ensureGraphDir` unit test (line 68-71) only asserts the base `INSTANCE_PATH` exists after calling `ensureGraphDir()`, but doesn't verify that the `nodes/` subdirectory was also created. The adapter explicitly creates both directories.

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ✅ | All files under `packages/positional-graph/src/adapter/` or `test/` |
| Contract-only imports | ✅ | All cross-package imports use public APIs (`@chainglass/shared`, `@chainglass/workflow`, `@chainglass/positional-graph`) |
| Dependency direction | ✅ | Infrastructure → foundation only |
| Domain.md updated | ⚠️ | Updates exist but not committed in Phase 3 range (F005) |
| Registry current | ✅ | `_platform/positional-graph` already registered |
| No orphan files | ✅ | All 4 code files map to `_platform/positional-graph` |
| Map nodes current | ✅ | Domain map includes positional-graph |
| Map edges current | ✅ | All edges have contract labels |
| No circular business deps | ✅ | No cycles |

### E.3) Anti-Reinvention

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| InstanceGraphAdapter | InstanceWorkUnitAdapter (same pattern, different concern) | _platform/positional-graph | ✅ Proceed — intentional pattern reuse, not duplication |

InstanceGraphAdapter and InstanceWorkUnitAdapter share the same _design pattern_ (constructor takes fixed base path) but serve different concerns. InstanceWorkUnitAdapter implements `IWorkUnitLoader` for unit YAML loading. InstanceGraphAdapter extends `PositionalGraphAdapter` for graph directory operations. The adapter's comment (line 12) explicitly cites InstanceWorkUnitAdapter as precedent.

### E.4) Testing & Evidence

**Coverage confidence**: 92%

| AC | Confidence | Evidence |
|----|------------|----------|
| AC-6 | 90% | T004 verifies instance has graph.yaml + state.json (pending) + units after saveFrom→instantiate. Primary coverage in Phase 2 T008; Phase 3 confirms with real filesystem. |
| AC-7 | 95% | T007 modifies template unit.yaml after instantiation, verifies instance unchanged, then refresh propagates change. |
| AC-8 | 95% | T005 instantiates twice (run-1, run-2), modifies state in run-1 to 'complete', confirms run-2 still 'pending'. |
| AC-12 | 95% | T007 covers this — modifies a unit-level template file, verifies instance copy unaffected. |
| AC-16 | 95% | T006 sets state.json to in_progress, calls refresh, asserts ACTIVE_RUN_WARNING (length 1), confirms units still refreshed, state unchanged. |

All 11 tests pass (6 unit + 5 integration, total runtime ~33ms).

### E.5) Doctrine Compliance

**F002** (MEDIUM): `test/unit/positional-graph/instance-graph-adapter.test.ts` has its 5-field Test Doc (Why, Contract, Usage Notes, Quality Contribution, Worked Example) at the file-level JSDoc rather than inside each `it()` callback. Rules R-TEST-002/003 specify per-`it()` placement.

**F003** (MEDIUM): `test/integration/template-instance-validation.test.ts` places 5-field Test Doc comments on `describe` blocks (lines 183, 248, 287, 333) rather than inside each `it()` callback. Same rule as F002.

All other doctrine checks pass:
- ✅ `FakeFileSystem` + `FakePathResolver` used (P4: fakes over mocks)
- ✅ TDD for adapter (T001 tests → T002 implementation, P3: TDD)
- ✅ PascalCase class, kebab-case file, `.test.ts` suffix
- ✅ No `any`, explicit return types
- ✅ Correct directory placement (source in `packages/*/src/adapter/`, tests in `test/`)

## F) Coverage Map

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| AC-6 | Independent instance copy | T004: graph.yaml + state.json + units verified after instantiate with real fs | 90% |
| AC-7 | Template mod doesn't affect instance | T007: template edit → instance unchanged → refresh → instance updated | 95% |
| AC-8 | Multiple instances from same template | T005: two instances, state modified in one, other unaffected | 95% |
| AC-12 | Unit template mod doesn't affect instance | T007: unit.yaml modified in template, instance copy unchanged | 95% |
| AC-16 | Active run warning on refresh | T006: ACTIVE_RUN_WARNING returned, units refreshed, state preserved | 95% |

**Overall coverage confidence**: 92%

## G) Commands Executed

```bash
# Diff computation
git --no-pager diff 055f9ea..af4aa80 --stat
git --no-pager diff 055f9ea..af4aa80 > docs/plans/048-wf-web/reviews/_computed.diff

# Git history
git --no-pager log --oneline -20

# Domain doc checks
ls docs/domains/ docs/domains/_platform/positional-graph/ docs/project-rules/

# Test execution (via subagent)
pnpm vitest run test/unit/positional-graph/instance-graph-adapter.test.ts test/integration/template-instance-validation.test.ts --reporter=verbose
```

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review —
> only context on the work that was done before the review.

**Review result**: APPROVE WITH NOTES

**Plan**: `/home/jak/substrate/048-wf-web/docs/plans/048-wf-web/wf-web-plan.md`
**Spec**: `/home/jak/substrate/048-wf-web/docs/plans/048-wf-web/wf-web-spec.md`
**Phase**: Phase 3: Integration Testing & Instance Validation
**Tasks dossier**: `/home/jak/substrate/048-wf-web/docs/plans/048-wf-web/tasks/phase-3-integration-and-validation/tasks.md`
**Execution log**: `/home/jak/substrate/048-wf-web/docs/plans/048-wf-web/tasks/phase-3-integration-and-validation/execution.log.md`
**Review file**: `/home/jak/substrate/048-wf-web/docs/plans/048-wf-web/reviews/review.phase-3-integration-and-validation.md`

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| `/home/jak/substrate/048-wf-web/packages/positional-graph/src/adapter/instance-graph.adapter.ts` | Created | _platform/positional-graph | Optional: override listGraphSlugs() (F001) |
| `/home/jak/substrate/048-wf-web/packages/positional-graph/src/adapter/index.ts` | Modified | _platform/positional-graph | None |
| `/home/jak/substrate/048-wf-web/test/unit/positional-graph/instance-graph-adapter.test.ts` | Created | _platform/positional-graph | Optional: add nodes/ assertion (F004), move Test Doc per-it (F002) |
| `/home/jak/substrate/048-wf-web/test/integration/template-instance-validation.test.ts` | Created | _platform/positional-graph | Optional: move Test Doc per-it (F003) |
| `/home/jak/substrate/048-wf-web/docs/domains/_platform/positional-graph/domain.md` | Unstaged | _platform/positional-graph | Commit with Phase 3 (F005) |
| `/home/jak/substrate/048-wf-web/docs/plans/048-wf-web/tasks/phase-3-integration-and-validation/execution.log.md` | Created | N/A | Optional: add AC-6 row (F006) |

### Suggested Fixes (not blocking — APPROVE WITH NOTES)

| # | File (absolute path) | What To Fix | Why |
|---|---------------------|-------------|-----|
| F001 | `/home/jak/substrate/048-wf-web/packages/positional-graph/src/adapter/instance-graph.adapter.ts` | Override `listGraphSlugs()` to throw or return `[]` | Inherited method resolves to wrong directory |
| F002 | `/home/jak/substrate/048-wf-web/test/unit/positional-graph/instance-graph-adapter.test.ts` | Move Test Doc 5-field from file-level JSDoc into each `it()` | R-TEST-002/003 compliance |
| F003 | `/home/jak/substrate/048-wf-web/test/integration/template-instance-validation.test.ts` | Move Test Doc 5-field from `describe` into each `it()` | R-TEST-002/003 compliance |
| F004 | `/home/jak/substrate/048-wf-web/test/unit/positional-graph/instance-graph-adapter.test.ts` | Add `expect(await fs.exists(\`${INSTANCE_PATH}/nodes\`)).toBe(true)` to ensureGraphDir test | Missing assertion for nodes/ subdir |
| F005 | `/home/jak/substrate/048-wf-web/docs/domains/_platform/positional-graph/domain.md` | Stage and commit with Phase 3 | Domain doc updates not in commit range |
| F006 | `/home/jak/substrate/048-wf-web/docs/plans/048-wf-web/tasks/phase-3-integration-and-validation/execution.log.md` | Add AC-6 row to ACs Covered table | AC-6 verified by T004 but not recorded |

### Domain Artifacts to Update (if any)

| File (absolute path) | What's Missing |
|---------------------|----------------|
| `/home/jak/substrate/048-wf-web/docs/domains/_platform/positional-graph/domain.md` | Already updated, just needs to be committed |

### Next Step

Phase 3 is approved. To address the optional findings before proceeding:
```
/plan-6-v2-implement-phase --plan /home/jak/substrate/048-wf-web/docs/plans/048-wf-web/wf-web-plan.md --phase "Phase 3: Integration Testing & Instance Validation"
```

To proceed to the next phase:
```
/plan-5-v2-phase-tasks-and-brief --phase "Phase 4: E2E Test Migration & Documentation" --plan /home/jak/substrate/048-wf-web/docs/plans/048-wf-web/wf-web-plan.md
```
