# Code Review: Phase 1: NodeStatusResult + Display Status

**Plan**: /Users/jordanknight/substrate/chainglass-048/docs/plans/054-unified-human-input/unified-human-input-plan.md
**Spec**: /Users/jordanknight/substrate/chainglass-048/docs/plans/054-unified-human-input/unified-human-input-spec.md
**Phase**: Phase 1: NodeStatusResult + Display Status
**Date**: 2026-02-27
**Reviewer**: Automated (plan-7-v2)
**Testing Approach**: Hybrid

## A) Verdict

**REQUEST_CHANGES**

Two unmitigated HIGH findings block acceptance: `awaiting-input` display status is not wired into card props (AC-01 gap), and malformed `user-input` unit configs are silently coerced to `agent` instead of surfaced as errors.

**Key failure areas**:
- **Implementation**: `nodeStatusToCardProps()` forwards raw status and never calls `getDisplayStatus()`, so `Awaiting Input` is never rendered for ready user-input nodes.
- **Domain compliance**: Domain artifacts are stale for this phase (`domain.md` updates missing; domain manifest does not cover all changed files).
- **Testing**: No proof that T004 discriminated `getNodeStatus()` behavior was validated; AC-01 remains only helper-tested, not integration-wired.
- **Doctrine**: New/changed tests do not include required 5-field Test Doc comments from `R-TEST-002`.

## B) Summary

The phase introduces the intended type-level and helper-level building blocks, but one core UI behavior is not connected in production code. Domain governance artifacts are incomplete for the final file set, reducing traceability and ownership clarity. Reinvention risk is low: the only major new helper (`getDisplayStatus`) is a focused UI concern with no direct duplicate that should be reused. Testing evidence is mixed: helper tests and format compatibility are present, but end-to-end proof for AC-01 is missing and execution evidence is mostly narrative.

## C) Checklist

**Testing Approach: Hybrid**

Hybrid-specific:
- [x] Lightweight helper tests present (`display-status.test.ts`)
- [ ] Service-level TDD evidence complete for all planned tasks (T004 proof missing)
- [ ] Critical UI behavior validated end-to-end (`awaiting-input` wiring missing)

Universal (all approaches):
- [ ] Only in-scope files changed
- [ ] Linters/type checks clean (verifiable command output attached)
- [ ] Domain compliance checks pass

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | HIGH | /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/050-workflow-page/components/workflow-node-card.tsx:258-267 | correctness | Card props use raw `node.status`; `awaiting-input` display status is never computed. | Apply `getDisplayStatus(node.unitType, node.status, node.ready)` in card-prop mapping and add integration assertion. |
| F002 | HIGH | /Users/jordanknight/substrate/chainglass-048/packages/positional-graph/src/adapter/instance-workunit.adapter.ts:80-97 | error-handling | `type: user-input` without `user_input` silently degrades to `agent`, hiding malformed config. | Fail fast for malformed user-input config with explicit `UNIT_LOAD_ERROR`. |
| F003 | MEDIUM | /Users/jordanknight/substrate/chainglass-048/docs/domains/_platform/positional-graph/domain.md | domain-md | Domain history/contracts/composition not updated for discriminated union changes and type-guard exports. | Add Plan 054 Phase 1 updates to History, Contracts, Composition. |
| F004 | MEDIUM | /Users/jordanknight/substrate/chainglass-048/docs/domains/workflow-ui/domain.md | domain-md | Domain doc missing Plan 054 Phase 1 update for `display-status.ts` and node-card behavior changes. | Add History + Composition updates for `awaiting-input` display flow. |
| F005 | MEDIUM | /Users/jordanknight/substrate/chainglass-048/docs/plans/054-unified-human-input/unified-human-input-plan.md | orphan | Domain Manifest omits several changed files (adapter index export, dev test-graph helpers, test files). | Add explicit manifest entries or documented exemptions for every changed file. |
| F006 | MEDIUM | /Users/jordanknight/substrate/chainglass-048/docs/domains/_platform/positional-graph/domain.md | concepts-docs | Domain has contracts but no `## Concepts` table including new contract concepts. | Add Concepts section with `Concept | Entry Point | What It Does`. |
| F007 | MEDIUM | /Users/jordanknight/substrate/chainglass-048/test/unit/positional-graph/ | testing | T004 evidence missing: no changed test showing discriminated `UserInputNodeStatus` assertions from `getNodeStatus()`. | Add dedicated discriminated status test and log concrete pass evidence. |
| F008 | MEDIUM | /Users/jordanknight/substrate/chainglass-048/dev/test-graphs/shared/helpers.ts:140-159 | pattern | Dev graph helpers mirror silent `user-input`→`agent` coercion, masking malformed fixtures. | Align dev/test loader behavior to fail fast on malformed user-input config. |
| F009 | MEDIUM | /Users/jordanknight/substrate/chainglass-048/test/unit/web/features/050-workflow-page/display-status.test.ts | doctrine | Required 5-field Test Doc comments are missing (R-TEST-002). | Add Test Doc block to each new test case. |
| F010 | MEDIUM | /Users/jordanknight/substrate/chainglass-048/test/unit/positional-graph/collate-inputs.test.ts | doctrine | Newly added Format A test lacks required 5-field Test Doc comment (R-TEST-002). | Add complete Test Doc block for the new test. |
| F011 | LOW | /Users/jordanknight/substrate/chainglass-048/docs/domains/domain-map.md | map-nodes | Domain map contract labels/health summary not refreshed for new exported discriminated contract surface. | Update map node contract labels and health summary (or explicitly scope exclusions). |
| F012 | LOW | /Users/jordanknight/substrate/chainglass-048/packages/positional-graph/src/interfaces/positional-graph-service.interface.ts | doctrine | New interface names do not follow `I`-prefix rule in `R-CODE-002`. | Rename to `I*` or convert to type aliases with documented rationale. |
| F013 | LOW | /Users/jordanknight/substrate/chainglass-048/docs/plans/054-unified-human-input/tasks/phase-1-nodestatus-display/execution.log.md | testing | Evidence claims are mostly narrative (missing command transcript snippets/CI links). | Attach concrete command outputs for claimed build/test runs. |

## E) Detailed Findings

### E.1) Implementation Quality

- **F001 (HIGH)**: `nodeStatusToCardProps()` currently sets `status: node.status as NodeStatus` and does not call the new `getDisplayStatus()` helper, so AC-01 behavior is not reachable in runtime rendering.
- **F002 (HIGH)**: `InstanceWorkUnitAdapter.load()` treats malformed user-input config as non-user-input and returns an `agent` variant, suppressing configuration errors.
- **F008 (MEDIUM)**: Dev test-graph helpers follow the same coercion pattern, allowing bad fixtures to appear valid.

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ✅ | New runtime code files are under expected domain trees (`workflow-ui`, `_platform/positional-graph`). |
| Contract-only imports | ✅ | No cross-domain internal import violation found in changed runtime code. |
| Dependency direction | ✅ | No infrastructure→business reversal detected in changed runtime files. |
| Domain.md updated | ❌ | `docs/domains/_platform/positional-graph/domain.md` and `docs/domains/workflow-ui/domain.md` were not updated for Plan 054 Phase 1 changes. |
| Registry current | ✅ | No new domains introduced; registry remains valid for current topology. |
| No orphan files | ❌ | Domain Manifest does not account for all changed files (notably adapter index export, dev test-graph files, and changed tests). |
| Map nodes current | ❌ | `docs/domains/domain-map.md` not refreshed for changed contract surface. |
| Map edges current | ✅ | No new dependency edges requiring label updates were observed. |
| No circular business deps | ✅ | No new business-domain cycles identified in changed files. |
| Concepts documented | ⚠️ | Contracts changed, but touched domain docs do not include a `## Concepts` section with required concept mapping. |

Domain findings:
- **F003/F006**: /Users/jordanknight/substrate/chainglass-048/docs/domains/_platform/positional-graph/domain.md
- **F004**: /Users/jordanknight/substrate/chainglass-048/docs/domains/workflow-ui/domain.md
- **F005**: /Users/jordanknight/substrate/chainglass-048/docs/plans/054-unified-human-input/unified-human-input-plan.md
- **F011**: /Users/jordanknight/substrate/chainglass-048/docs/domains/domain-map.md

### E.3) Anti-Reinvention

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| `getDisplayStatus` (`/Users/jordanknight/substrate/chainglass-048/apps/web/src/features/050-workflow-page/lib/display-status.ts`) | Partial conceptual overlap with `getGlyph` in `/Users/jordanknight/substrate/chainglass-048/packages/positional-graph/src/features/030-orchestration/reality.format.ts` | `_platform/positional-graph` | Proceed (no genuine duplication requiring reuse) |

### E.4) Testing & Evidence

**Coverage confidence**: 63%

| AC | Confidence | Evidence |
|----|------------|----------|
| AC-01 | 28% | Helper and badge map exist, but production wiring does not compute `awaiting-input` in card props. |
| AC-02 | 74% | `display-status.test.ts` covers pending/not-ready case and current card mapping preserves pending. |
| AC-09 | 82% | `input-resolution.ts` supports Format A + fallback and corresponding unit test was added. |
| AC-15 | 90% | Dedicated `display-status.test.ts` validates expected display-status outcomes. |

Additional testing findings:
- **F007 (MEDIUM)**: Missing explicit discriminated `getNodeStatus()` test evidence for T004.
- **F013 (LOW)**: Execution log does not include concrete command output artifacts for full claims.

### E.5) Doctrine Compliance

- **F009 (MEDIUM)**: /Users/jordanknight/substrate/chainglass-048/test/unit/web/features/050-workflow-page/display-status.test.ts lacks required Test Doc comments.
- **F010 (MEDIUM)**: /Users/jordanknight/substrate/chainglass-048/test/unit/positional-graph/collate-inputs.test.ts new test lacks required Test Doc comments.
- **F012 (LOW)**: /Users/jordanknight/substrate/chainglass-048/packages/positional-graph/src/interfaces/positional-graph-service.interface.ts interface naming diverges from `R-CODE-002`.

## F) Coverage Map

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| AC-01 | User-input + pending + ready shows `Awaiting Input` badge | `display-status.ts` + `display-status.test.ts` added, but no runtime wiring in `workflow-node-card.tsx` | 28% |
| AC-02 | User-input + pending + not-ready remains normal pending | Helper tests cover this branch; current mapping preserves pending | 74% |
| AC-09 | Downstream input resolution sees available inputs after output save format | Format A fallback in `input-resolution.ts` plus new unit coverage in `collate-inputs.test.ts` | 82% |
| AC-15 | Unit tests verify display status computation | New `display-status.test.ts` with 6 cases | 90% |

**Overall coverage confidence**: 63%

## G) Commands Executed

```bash
git --no-pager diff --stat
git --no-pager diff --staged --stat
git --no-pager status --short
git --no-pager log --oneline -20
git --no-pager diff ab4283a..HEAD > /Users/jordanknight/substrate/chainglass-048/docs/plans/054-unified-human-input/reviews/_computed.diff
git --no-pager diff --name-status ab4283a..HEAD
rg "getDisplayStatus\(" /Users/jordanknight/substrate/chainglass-048 -n

# Parallel subagent reviews launched:
# - Implementation Quality Reviewer
# - Domain Compliance Validator
# - Anti-Reinvention Check
# - Testing & Evidence Validator
# - Doctrine & Rules Validator
```

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review —
> only context on the work that was done before the review.

**Review result**: REQUEST_CHANGES

**Plan**: /Users/jordanknight/substrate/chainglass-048/docs/plans/054-unified-human-input/unified-human-input-plan.md
**Spec**: /Users/jordanknight/substrate/chainglass-048/docs/plans/054-unified-human-input/unified-human-input-spec.md
**Phase**: Phase 1: NodeStatusResult + Display Status
**Tasks dossier**: /Users/jordanknight/substrate/chainglass-048/docs/plans/054-unified-human-input/tasks/phase-1-nodestatus-display/tasks.md
**Execution log**: /Users/jordanknight/substrate/chainglass-048/docs/plans/054-unified-human-input/tasks/phase-1-nodestatus-display/execution.log.md
**Review file**: /Users/jordanknight/substrate/chainglass-048/docs/plans/054-unified-human-input/reviews/review.phase-1-nodestatus-display.md

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/050-workflow-page/components/workflow-node-card.tsx | Modified | workflow-ui | Yes (F001) |
| /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/050-workflow-page/lib/display-status.ts | Added | workflow-ui | No |
| /Users/jordanknight/substrate/chainglass-048/dev/test-graphs/shared/graph-test-runner.ts | Modified | dev-support (unmapped) | Yes (F008/F005) |
| /Users/jordanknight/substrate/chainglass-048/dev/test-graphs/shared/helpers.ts | Modified | dev-support (unmapped) | Yes (F008/F005) |
| /Users/jordanknight/substrate/chainglass-048/docs/plans/054-unified-human-input/tasks/phase-1-nodestatus-display/execution.log.md | Added | plan-docs | Yes (F013) |
| /Users/jordanknight/substrate/chainglass-048/docs/plans/054-unified-human-input/tasks/phase-1-nodestatus-display/tasks.fltplan.md | Modified | plan-docs | No |
| /Users/jordanknight/substrate/chainglass-048/docs/plans/054-unified-human-input/tasks/phase-1-nodestatus-display/tasks.md | Modified | plan-docs | No |
| /Users/jordanknight/substrate/chainglass-048/docs/plans/054-unified-human-input/unified-human-input-plan.md | Modified | plan-docs | Yes (F005) |
| /Users/jordanknight/substrate/chainglass-048/docs/plans/054-unified-human-input/unified-human-input-spec.md | Modified | plan-docs | No |
| /Users/jordanknight/substrate/chainglass-048/docs/plans/054-unified-human-input/workshops/011-discriminated-type-architecture.md | Added | plan-docs | No |
| /Users/jordanknight/substrate/chainglass-048/packages/positional-graph/src/adapter/instance-workunit.adapter.ts | Modified | _platform/positional-graph | Yes (F002) |
| /Users/jordanknight/substrate/chainglass-048/packages/positional-graph/src/interfaces/index.ts | Modified | _platform/positional-graph | No |
| /Users/jordanknight/substrate/chainglass-048/packages/positional-graph/src/interfaces/positional-graph-service.interface.ts | Modified | _platform/positional-graph | Yes (F012) |
| /Users/jordanknight/substrate/chainglass-048/packages/positional-graph/src/services/input-resolution.ts | Modified | _platform/positional-graph | No |
| /Users/jordanknight/substrate/chainglass-048/packages/positional-graph/src/services/positional-graph.service.ts | Modified | _platform/positional-graph | No |
| /Users/jordanknight/substrate/chainglass-048/test/unit/positional-graph/collate-inputs.test.ts | Modified | test | Yes (F010/F007) |
| /Users/jordanknight/substrate/chainglass-048/test/unit/web/features/050-workflow-page/display-status.test.ts | Added | test | Yes (F009) |

### Required Fixes (if REQUEST_CHANGES)

| # | File (absolute path) | What To Fix | Why |
|---|---------------------|-------------|-----|
| 1 | /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/050-workflow-page/components/workflow-node-card.tsx | Compute display status with `getDisplayStatus(...)` in card mapping and add integration assertion | AC-01 currently not satisfied (F001 HIGH) |
| 2 | /Users/jordanknight/substrate/chainglass-048/packages/positional-graph/src/adapter/instance-workunit.adapter.ts | Surface explicit error when `type: user-input` is missing `user_input` config | Prevent silent type coercion and malformed config masking (F002 HIGH) |
| 3 | /Users/jordanknight/substrate/chainglass-048/dev/test-graphs/shared/helpers.ts; /Users/jordanknight/substrate/chainglass-048/dev/test-graphs/shared/graph-test-runner.ts | Align fixture loaders to fail fast for malformed user-input config | Keep dev/test behavior consistent with runtime contract (F008 MEDIUM) |
| 4 | /Users/jordanknight/substrate/chainglass-048/docs/domains/_platform/positional-graph/domain.md; /Users/jordanknight/substrate/chainglass-048/docs/domains/workflow-ui/domain.md; /Users/jordanknight/substrate/chainglass-048/docs/domains/domain-map.md | Update domain history/contracts/composition/concepts/map metadata for Plan 054 Phase 1 | Domain compliance gaps (F003/F004/F006/F011) |
| 5 | /Users/jordanknight/substrate/chainglass-048/docs/plans/054-unified-human-input/unified-human-input-plan.md | Expand Domain Manifest to include all changed files or explicit exemptions | Remove orphan file gap (F005) |
| 6 | /Users/jordanknight/substrate/chainglass-048/test/unit/positional-graph/ (add/adjust test) | Add explicit discriminated `getNodeStatus()` test for user-input config (T004) and log evidence | Missing coverage/evidence for planned task (F007) |
| 7 | /Users/jordanknight/substrate/chainglass-048/test/unit/web/features/050-workflow-page/display-status.test.ts; /Users/jordanknight/substrate/chainglass-048/test/unit/positional-graph/collate-inputs.test.ts | Add required 5-field Test Doc blocks | Required by `R-TEST-002` (F009/F010) |

### Domain Artifacts to Update (if any)

| File (absolute path) | What's Missing |
|---------------------|----------------|
| /Users/jordanknight/substrate/chainglass-048/docs/domains/_platform/positional-graph/domain.md | Plan 054 Phase 1 history entry; contracts/composition refresh; `## Concepts` table |
| /Users/jordanknight/substrate/chainglass-048/docs/domains/workflow-ui/domain.md | Plan 054 Phase 1 history/composition updates for awaiting-input display path |
| /Users/jordanknight/substrate/chainglass-048/docs/domains/domain-map.md | Contract label/health summary refresh for changed _platform contract surface |
| /Users/jordanknight/substrate/chainglass-048/docs/plans/054-unified-human-input/unified-human-input-plan.md | Domain Manifest rows for all changed files |

### Next Step

/plan-6-v2-implement-phase --plan /Users/jordanknight/substrate/chainglass-048/docs/plans/054-unified-human-input/unified-human-input-plan.md --phase 'Phase 1: NodeStatusResult + Display Status'
