# Code Review: Phase 3: Consumer Migration

**Plan**: /Users/jordanknight/substrate/059-fix-agents/docs/plans/061-workflow-events/workflow-events-plan.md  
**Spec**: /Users/jordanknight/substrate/059-fix-agents/docs/plans/061-workflow-events/workflow-events-spec.md  
**Phase**: Phase 3: Consumer Migration  
**Date**: 2026-03-01  
**Reviewer**: Automated (plan-7-v2)  
**Testing Approach**: Hybrid

## A) Verdict

**REQUEST_CHANGES**

Blocking issues remain in the answer handshake error path and domain artifact currency.

**Key failure areas**:
- **Implementation**: `answerQuestion()` does not handle `raiseNodeEvent(...node:restart...)` `errors[]`, so restart failures can be silently treated as success.
- **Domain compliance**: `_platform/positional-graph` and related map/docs artifacts are stale after removing PGService Q&A contract surface.
- **Testing**: New tests are strong for WorkflowEventsService behavior, but AC-11/AC-12 consumer wiring (web action + helper boundary) has no focused verification.
- **Doctrine**: New tests do not include required 5-field Test Doc comments.

## B) Summary

The phase delivers substantial migration progress: CLI handlers now delegate to WorkflowEvents, web answer flow is simplified, Q&A PGService methods are removed, and integration coverage was expanded. However, `WorkflowEventsService.answerQuestion()` has a correctness gap: restart failures reported via `errors[]` are not surfaced, which can mask partial failure states. Domain artifacts are also out of date for the removed PGService Q&A contract and WorkflowEvents contract/map representation. Testing confidence is moderate: core Q&A flow is tested, but consumer-level proof for web action and helper boundaries is still thin.

## C) Checklist

**Testing Approach: Hybrid**

Hybrid checks:
- [x] Core validation tests present for migrated Q&A behavior (`WorkflowEventsService` integration suite)
- [ ] Critical consumer paths covered (web action + helper boundary lack focused tests)
- [ ] Key verification points documented with reproducible evidence for all major claims

Universal:
- [x] Only in-scope files changed
- [ ] Linters/type checks clean (not fully evidenced in this review run)
- [ ] Domain compliance checks pass

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | HIGH | /Users/jordanknight/substrate/059-fix-agents/packages/positional-graph/src/workflow-events/workflow-events.service.ts:174-184 | correctness | `node:restart` result is ignored; `errors[]` can be dropped silently. | Capture restart result and throw `WorkflowEventError` when `errors.length > 0`. |
| F002 | HIGH | /Users/jordanknight/substrate/059-fix-agents/docs/domains/_platform/positional-graph/domain.md:47,139-154 | domain-md | Domain contract/history still describe PGService owning Q&A protocol after deletion. | Update contract description + history for Plan 061 Phase 3 deletions. |
| F003 | MEDIUM | /Users/jordanknight/substrate/059-fix-agents/packages/positional-graph/src/workflow-events/workflow-events.service.ts:123-125 | error-handling | Invalid `questionId` path throws plain `Error`, losing structured error payload for consumers. | Throw `WorkflowEventError` with structured `ResultError`. |
| F004 | MEDIUM | /Users/jordanknight/substrate/059-fix-agents/docs/domains/workflow-ui/domain.md:128,136-146 | domain-md | Gotcha/history still says server action performs direct 2-step handshake. | Update to reflect delegation to `IWorkflowEvents.answerQuestion()`. |
| F005 | MEDIUM | /Users/jordanknight/substrate/059-fix-agents/docs/domains/domain-map.md:34,88-90,120 | map-nodes/map-edges | Workflow-events node/edge details are stale (missing `WorkflowEventError`, no explicit CLI edge in graph). | Update node label/contracts and add explicit labeled CLI consumer edge. |
| F006 | MEDIUM | /Users/jordanknight/substrate/059-fix-agents/docs/plans/061-workflow-events/workflow-events-plan.md:23-54 | orphan | Domain Manifest does not reflect all touched files in this phase. | Add touched files with domain/classification to preserve traceability. |
| F007 | MEDIUM | /Users/jordanknight/substrate/059-fix-agents/test/integration/positional-graph/cli-event-commands.test.ts:426-516 | testing | Added tests validate service-level behavior, but AC-11/AC-12 consumer wiring is unproven. | Add focused tests for web `answerQuestion` action and helper migration boundary. |
| F008 | MEDIUM | /Users/jordanknight/substrate/059-fix-agents/test/integration/positional-graph/cli-event-commands.test.ts:442-515 | doctrine | New tests omit required 5-field Test Doc comments (`R-TEST-002`). | Add Test Doc comments (Why/Contract/Usage Notes/Quality Contribution/Worked Example). |
| F009 | LOW | /Users/jordanknight/substrate/059-fix-agents/docs/plans/061-workflow-events/tasks/phase-3-consumer-migration/execution.log.md:97 | testing | Full-suite claim is not backed by embedded command output/log reference in the artifact. | Attach exact command(s) and output snippet/hash for reproducibility. |

## E) Detailed Findings

### E.1) Implementation Quality

- **F001 (HIGH)**: `answerQuestion()` wraps `node:restart` in try/catch but does not inspect `RaiseNodeEventResult.errors`. Since `raiseNodeEvent()` reports many failures through `errors[]`, restart failure can be silently lost.
- **F003 (MEDIUM)**: `questionId` not found branch throws plain `Error`, which downgrades structured error reporting downstream.

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ✅ | New code file is under domain-owned tree (`packages/shared/src/workflow-events/errors.ts`). |
| Contract-only imports | ✅ | No cross-domain internal import violations observed in changed source files. |
| Dependency direction | ✅ | No clear infra→business runtime dependency inversion introduced in changed code paths. |
| Domain.md updated | ❌ | `_platform/positional-graph` and `workflow-ui` docs are stale for Phase 3 behavior/contracts (F002, F004). |
| Registry current | ✅ | `workflow-events` remains present in `/Users/jordanknight/substrate/059-fix-agents/docs/domains/registry.md`. |
| No orphan files | ❌ | Plan Domain Manifest is missing several touched files (F006). |
| Map nodes current | ❌ | Workflow-events contract set in map omits `WorkflowEventError` (F005). |
| Map edges current | ❌ | Mermaid graph lacks explicit labeled CLI→workflow-events edge while summary lists CLI as consumer (F005). |
| No circular business deps | ✅ | No business→business cycle evidence introduced in this phase. |
| Concepts documented | ⚠️ | Workflow-events has Concepts section, but contract/map docs are not fully synchronized with new error contract. |

### E.3) Anti-Reinvention

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| `WorkflowEventError` | None (no duplicate structured workflow-event error abstraction found) | workflow-events | ✅ proceed |

### E.4) Testing & Evidence

**Coverage confidence**: 71%

| AC | Confidence | Evidence |
|----|------------|----------|
| AC-10 | 82 | CLI handlers migrated in `/Users/jordanknight/substrate/059-fix-agents/apps/cli/src/commands/positional-graph.command.ts:902-1045`; Q&A integration suite added in `/Users/jordanknight/substrate/059-fix-agents/test/integration/positional-graph/cli-event-commands.test.ts:426-516`. |
| AC-11 | 64 | Web action now delegates via `/Users/jordanknight/substrate/059-fix-agents/apps/web/app/actions/workflow-actions.ts:429-455`; no focused web action test evidence in changed test set. |
| AC-12 | 68 | Helper delegates internally at `/Users/jordanknight/substrate/059-fix-agents/dev/test-graphs/shared/helpers.ts:97-108`; no dedicated helper-level regression test in changed suite. |
| AC-17 | 86 | 5 new QnA integration tests in `/Users/jordanknight/substrate/059-fix-agents/test/integration/positional-graph/cli-event-commands.test.ts:442-515`. |
| AC-16 | 55 | Execution log claims full pass; reviewer independently validated targeted run only (2 files / 19 tests passed). |

### E.5) Doctrine Compliance

- **F008 (MEDIUM)**: `R-TEST-002` requires 5-field Test Doc comments for each test; newly added tests do not include them.
- No architecture-layer boundary violation was found in changed source code.

## F) Coverage Map

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| AC-10 | CLI handlers delegate to WorkflowEvents | `/Users/jordanknight/substrate/059-fix-agents/apps/cli/src/commands/positional-graph.command.ts:902-1045`; `/Users/jordanknight/substrate/059-fix-agents/test/integration/positional-graph/cli-event-commands.test.ts:426-516` | 82 |
| AC-11 | Web `answerQuestion()` delegates to WorkflowEvents | `/Users/jordanknight/substrate/059-fix-agents/apps/web/app/actions/workflow-actions.ts:429-455` | 64 |
| AC-12 | Test helper delegation to WorkflowEvents | `/Users/jordanknight/substrate/059-fix-agents/dev/test-graphs/shared/helpers.ts:97-108` | 68 |
| AC-16 | No-regression test pass | `/Users/jordanknight/substrate/059-fix-agents/docs/plans/061-workflow-events/tasks/phase-3-consumer-migration/execution.log.md:97`; reviewer run below | 55 |
| AC-17 | CLI QnA integration gap filled | `/Users/jordanknight/substrate/059-fix-agents/test/integration/positional-graph/cli-event-commands.test.ts:442-515` | 86 |

**Overall coverage confidence**: **71%**

## G) Commands Executed

```bash
git --no-pager diff --stat
git --no-pager diff --staged --stat
git --no-pager status --short
git --no-pager log --oneline -15

PLAN_DIR='/Users/jordanknight/substrate/059-fix-agents/docs/plans/061-workflow-events'
REVIEW_DIR="$PLAN_DIR/reviews"
COMPUTED="$REVIEW_DIR/_computed.diff"
EX1=':(exclude)docs/plans/061-workflow-events/reviews/_computed.diff'
EX2=':(exclude)docs/plans/061-workflow-events/reviews/review.phase-3-consumer-migration.md'
EX3=':(exclude)docs/plans/061-workflow-events/reviews/fix-tasks.phase-3-consumer-migration.md'
{ git --no-pager diff --binary -- . "$EX1" "$EX2" "$EX3"; git --no-pager diff --staged --binary -- . "$EX1" "$EX2" "$EX3"; while IFS= read -r f; do [ -f "$f" ] || continue; case "$f" in docs/plans/061-workflow-events/reviews/*) continue;; esac; git --no-pager diff --no-index --binary /dev/null "$f" || true; done < <(git ls-files --others --exclude-standard); } > "$COMPUTED"

pnpm vitest run test/integration/positional-graph/cli-event-commands.test.ts test/unit/positional-graph/features/032-node-event-system/service-wrapper-contracts.test.ts

# Plus 5 parallel subagent reviews:
# - Implementation Quality
# - Domain Compliance
# - Anti-Reinvention
# - Testing & Evidence
# - Doctrine & Rules
```

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review —
> only context on the work that was done before the review.

**Review result**: REQUEST_CHANGES

**Plan**: /Users/jordanknight/substrate/059-fix-agents/docs/plans/061-workflow-events/workflow-events-plan.md  
**Spec**: /Users/jordanknight/substrate/059-fix-agents/docs/plans/061-workflow-events/workflow-events-spec.md  
**Phase**: Phase 3: Consumer Migration  
**Tasks dossier**: /Users/jordanknight/substrate/059-fix-agents/docs/plans/061-workflow-events/tasks/phase-3-consumer-migration/tasks.md  
**Execution log**: /Users/jordanknight/substrate/059-fix-agents/docs/plans/061-workflow-events/tasks/phase-3-consumer-migration/execution.log.md  
**Review file**: /Users/jordanknight/substrate/059-fix-agents/docs/plans/061-workflow-events/reviews/review.phase-3-consumer-migration.md

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| /Users/jordanknight/substrate/059-fix-agents/apps/cli/src/commands/positional-graph.command.ts | Reviewed | _platform/positional-graph (consumer) | No |
| /Users/jordanknight/substrate/059-fix-agents/apps/web/app/actions/workflow-actions.ts | Reviewed | workflow-ui | No code change; add focused test coverage |
| /Users/jordanknight/substrate/059-fix-agents/dev/test-graphs/shared/helpers.ts | Reviewed | workflow-events | No code change; add focused test coverage |
| /Users/jordanknight/substrate/059-fix-agents/packages/positional-graph/src/workflow-events/workflow-events.service.ts | Reviewed | workflow-events | **Yes (F001/F003)** |
| /Users/jordanknight/substrate/059-fix-agents/packages/shared/src/workflow-events/errors.ts | Reviewed | workflow-events | No |
| /Users/jordanknight/substrate/059-fix-agents/packages/shared/src/workflow-events/index.ts | Reviewed | workflow-events | No |
| /Users/jordanknight/substrate/059-fix-agents/packages/positional-graph/src/interfaces/positional-graph-service.interface.ts | Reviewed | _platform/positional-graph | No code change |
| /Users/jordanknight/substrate/059-fix-agents/packages/positional-graph/src/interfaces/index.ts | Reviewed | _platform/positional-graph | No |
| /Users/jordanknight/substrate/059-fix-agents/packages/positional-graph/src/services/positional-graph.service.ts | Reviewed | _platform/positional-graph | No |
| /Users/jordanknight/substrate/059-fix-agents/packages/positional-graph/src/fakes/fake-positional-graph-service.ts | Reviewed | _platform/positional-graph | No |
| /Users/jordanknight/substrate/059-fix-agents/test/integration/positional-graph/cli-event-commands.test.ts | Reviewed | workflow-events | **Yes (F008)** |
| /Users/jordanknight/substrate/059-fix-agents/test/unit/positional-graph/features/032-node-event-system/service-wrapper-contracts.test.ts | Reviewed | _platform/positional-graph | No |
| /Users/jordanknight/substrate/059-fix-agents/test/unit/positional-graph/question-answer.test.ts (deleted) | Reviewed | _platform/positional-graph | No |
| /Users/jordanknight/substrate/059-fix-agents/docs/domains/_platform/positional-graph/domain.md | Reviewed | domain-doc | **Yes (F002)** |
| /Users/jordanknight/substrate/059-fix-agents/docs/domains/workflow-ui/domain.md | Reviewed | domain-doc | **Yes (F004)** |
| /Users/jordanknight/substrate/059-fix-agents/docs/domains/domain-map.md | Reviewed | cross-domain-doc | **Yes (F005)** |
| /Users/jordanknight/substrate/059-fix-agents/docs/plans/061-workflow-events/workflow-events-plan.md | Reviewed | plan-doc | **Yes (F006)** |

### Required Fixes (if REQUEST_CHANGES)

| # | File (absolute path) | What To Fix | Why |
|---|---------------------|-------------|-----|
| 1 | /Users/jordanknight/substrate/059-fix-agents/packages/positional-graph/src/workflow-events/workflow-events.service.ts | Validate `node:restart` `errors[]` and surface structured failures | Prevent silent partial success in Q&A handshake |
| 2 | /Users/jordanknight/substrate/059-fix-agents/docs/domains/_platform/positional-graph/domain.md | Remove stale Q&A contract ownership text and add Plan 061 Phase 3 history entry | Keep domain contract docs aligned with removed API |
| 3 | /Users/jordanknight/substrate/059-fix-agents/packages/positional-graph/src/workflow-events/workflow-events.service.ts | Replace plain `Error` for invalid `questionId` with `WorkflowEventError` | Preserve structured errors for CLI/web JSON paths |
| 4 | /Users/jordanknight/substrate/059-fix-agents/docs/domains/workflow-ui/domain.md; /Users/jordanknight/substrate/059-fix-agents/docs/domains/domain-map.md; /Users/jordanknight/substrate/059-fix-agents/docs/plans/061-workflow-events/workflow-events-plan.md | Sync docs/map/manifest with Phase 3 reality | Restore domain traceability and map correctness |
| 5 | /Users/jordanknight/substrate/059-fix-agents/test/integration/positional-graph/cli-event-commands.test.ts (+ targeted new tests) | Add required Test Doc blocks and add focused AC-11/AC-12 verification | Meet rules compliance and improve migration confidence |

### Domain Artifacts to Update (if any)

| File (absolute path) | What's Missing |
|---------------------|----------------|
| /Users/jordanknight/substrate/059-fix-agents/docs/domains/_platform/positional-graph/domain.md | Contract description still includes removed PGService Q&A protocol; no Plan 061 Phase 3 history row |
| /Users/jordanknight/substrate/059-fix-agents/docs/domains/workflow-ui/domain.md | Q&A gotcha/history not updated for WorkflowEvents delegation |
| /Users/jordanknight/substrate/059-fix-agents/docs/domains/domain-map.md | Workflow-events contract/edge details stale (`WorkflowEventError`, explicit CLI edge) |
| /Users/jordanknight/substrate/059-fix-agents/docs/plans/061-workflow-events/workflow-events-plan.md | Domain Manifest missing touched files for this phase |

### Next Step

/plan-6-v2-implement-phase --plan /Users/jordanknight/substrate/059-fix-agents/docs/plans/061-workflow-events/workflow-events-plan.md --phase "Phase 3: Consumer Migration"
