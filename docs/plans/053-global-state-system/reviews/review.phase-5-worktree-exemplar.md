# Code Review: Phase 5: Worktree Exemplar

**Plan**: /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/global-state-system-plan.md
**Spec**: /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/global-state-system-spec.md
**Phase**: Phase 5: Worktree Exemplar
**Date**: 2026-02-27
**Reviewer**: Automated (plan-7-v2)
**Testing Approach**: Full TDD

## A) Verdict

**REQUEST_CHANGES**

Phase evidence is not reviewable as-is: computed diff scope does not match Phase 5 deliverables, AC-39 evidence is currently timer-based (not file-change driven), and multiple domain artifacts are out of sync with the changed surface.

**Key failure areas**:
- **Implementation**: Computed diff/manifest is dominated by unrelated workgraph/workflow cleanup and omits core Phase 5 target files.
- **Domain compliance**: Domain manifest coverage is broken (0/89 overlap), and workgraph/domain-map/registry documentation is inconsistent.
- **Testing**: Spec says Full TDD, but RED→GREEN evidence is missing and AC-39 is contradicted by temporary timer behavior.

## B) Summary

The current review artifacts (`_computed.diff`, `_manifest.txt`) are not phase-scoped to Plan 053 Phase 5, so acceptance-criteria validation is low confidence. High-severity gaps include AC-39 implementation evidence (temporary timer in execution log), missing TDD audit trail, and domain-documentation drift around `_platform/workgraph`. Anti-reinvention checks did not find concrete duplication in the computed scope, but confidence is limited because intended new Phase 5 components are not represented in the diff. Doctrine/rules validation found no additional high-signal violations beyond the scope/evidence problems.

## C) Checklist

**Testing Approach: Full TDD**

- [ ] RED tests captured before implementation changes
- [ ] GREEN results captured after implementation
- [ ] AC-38..AC-41 mapped to concrete test/manual evidence

Universal (all approaches):
- [ ] Only in-scope files changed
- [ ] Linters/type checks clean (if applicable)
- [ ] Domain compliance checks pass

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | HIGH | /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/reviews/_manifest.txt:1-89 | scope | Computed review scope does not match Phase 5; expected files for T001-T006 are absent. | Recompute phase-scoped diff/manifest from actual Phase 5 commit range or explicit phase file list. |
| F002 | HIGH | /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/tasks/phase-5-worktree-exemplar/execution.log.md:27-30 | correctness | AC-39 evidence is temporary timer-based changed-file-count, not FileChangeHub/SSE wiring. | Replace timer path with real file-change event publishing and re-verify AC-39. |
| F003 | HIGH | /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/global-state-system-spec.md:239-253 | testing | Declared Full TDD approach lacks RED→GREEN artifacts for this phase. | Add phase-scoped failing-first and passing evidence mapped to AC-38..AC-41. |
| F004 | HIGH | /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/global-state-system-plan.md:49-83 | domain | Domain manifest does not map reviewed touched files (orphaned review scope). | Update manifest or regenerate phase-scoped review inputs so every changed file has domain ownership. |
| F005 | HIGH | /Users/jordanknight/substrate/chainglass-048/docs/domains/_platform/workgraph/domain.md:42-95 | domain-md | Workgraph domain doc still claims removed web/API consumers after Plan 050 Phase 7 cleanup. | Update boundary/contracts/dependencies/history to match current composition. |
| F006 | MEDIUM | /Users/jordanknight/substrate/chainglass-048/apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx:463-469 | correctness | LeftPanel subtitle remains `diffStatsSubtitle` only; phase tasks claim composed subtitle with WorktreeStateSubtitle. | Implement composition or update phase docs/evidence to reflect actual consumer location. |
| F007 | MEDIUM | /Users/jordanknight/substrate/chainglass-048/test/unit/web/state/worktree-publisher.test.tsx:27-29 | pattern | Test uses `vi.mock`, conflicting with spec testing policy (“Avoid mocks entirely”). | Refactor tests to fixture/fake-driven strategy or document explicit exception in spec. |
| F008 | MEDIUM | /Users/jordanknight/substrate/chainglass-048/test/unit/web/state/worktree-publisher.test.tsx:43-132 | testing | Claimed publisher coverage omits explicit rerender-update and unmount-cleanup assertions. | Add tests for update-on-change and teardown cleanup; remap evidence. |
| F009 | MEDIUM | /Users/jordanknight/substrate/chainglass-048/docs/domains/registry.md:14,23-27 | registry | Registry uses non-canonical status text for `_platform/workgraph` despite defined status taxonomy. | Use canonical status (`deprecated`/`archived`) and move notes to description field. |
| F010 | MEDIUM | /Users/jordanknight/substrate/chainglass-048/docs/domains/domain-map.md:25,68-83 | map-edges | Domain map topology and health summary are inconsistent for `_platform/workgraph` node/edges. | Align map node/edges and summary table so dependencies and status agree. |
| F011 | LOW | /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/tasks/phase-5-worktree-exemplar/tasks.md:6 | testing | Phase tasks doc status remains `Pending` while execution log says `Complete`. | Synchronize phase status metadata across tasks.md and execution.log.md. |

## E) Detailed Findings

### E.1) Implementation Quality

- **F001 (HIGH)**: Review scope mismatch prevents reliable implementation validation for this phase.
- **F002 (HIGH)**: Execution evidence for AC-39 is explicitly temporary and not compliant with required live event wiring.
- **F006 (MEDIUM)**: Browser subtitle composition expected by task dossier is not reflected in current browser client location.
- **F007/F008 (MEDIUM)**: Test strategy and coverage claims are inconsistent with spec policy and claimed behavior.

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ✅ | No new mis-placed files identified in computed scope. |
| Contract-only imports | ✅ | No concrete cross-domain internal-import violation found in computed scope. |
| Dependency direction | ✅ | No explicit infrastructure→business inversion found in inspected changes. |
| Domain.md updated | ❌ | `_platform/workgraph/domain.md` stale vs removed consumers (F005). |
| Registry current | ❌ | `registry.md` status taxonomy mismatch for workgraph (F009). |
| No orphan files | ❌ | Reviewed manifest files not mapped by Plan 053 domain manifest (F004). |
| Map nodes current | ❌ | `_platform/workgraph` representation inconsistent across map artifacts (F010). |
| Map edges current | ❌ | Health-summary dependency claims do not match mermaid topology (F010). |
| No circular business deps | ✅ | No new business-to-business cycles identified from map inspection. |

### E.3) Anti-Reinvention

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| registerWorktreeState | None found in computed review scope | file-browser | proceed |
| WorktreeStatePublisher | None found in computed review scope | file-browser | proceed |
| WorktreeStateSubtitle | None found in computed review scope | file-browser | proceed |
| GlobalStateConnector | None found in computed review scope | _platform/state | proceed |

### E.4) Testing & Evidence

**Coverage confidence**: **22%**

| AC | Confidence | Evidence |
|----|------------|----------|
| AC-38 | 36% | Execution log claims domain registration; phase-scoped code/test evidence is not present in computed diff. |
| AC-39 | 8% | Execution log states temporary timer for changed-file-count; this contradicts required file-change-event wiring. |
| AC-40 | 24% | Execution log claims live subtitle updates; computed diff does not provide direct phase-scoped verification artifacts. |
| AC-41 | 18% | Exemplar narrative exists, but computed artifacts are dominated by unrelated deletions/modifications. |

### E.5) Doctrine Compliance

No additional doctrine violations were surfaced by subagent review of `docs/project-rules/{rules,idioms,architecture,constitution}.md` beyond the scope/evidence and domain-documentation findings above.

## F) Coverage Map

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| AC-38 | Register worktree domain with required properties | `execution.log.md` T001/T004 claims; missing phase-scoped diff proof in `_computed.diff` | 36% |
| AC-39 | Publisher updates from file changes live | `execution.log.md` documents temporary timer path, not real file-change subscription | 8% |
| AC-40 | Left-panel consumer displays live state | Claimed by execution log/manual check; incomplete/indirect evidence in computed diff | 24% |
| AC-41 | Exemplar demonstrates producer + consumer pattern | Narrative present in tasks/execution docs; weak direct artifact linkage | 18% |

**Overall coverage confidence**: **22%**

## G) Commands Executed

```bash
rg -n "\*\*Mode\*\*:|^## Domain Manifest|^## Key Findings|^## Implementation|^# " /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/global-state-system-plan.md
git --no-pager diff --stat && git --no-pager diff --staged --stat && git --no-pager status --short
# artifact generation
mkdir -p /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/reviews
git --no-pager diff > /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/reviews/_computed.diff
git --no-pager diff --staged >> /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/reviews/_computed.diff
{ git --no-pager diff --name-status; git --no-pager diff --staged --name-status; } | awk 'NF' | sort -u > /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/reviews/_manifest.txt
# review context reads
view plan/spec/tasks/execution/domain docs and selected source/test files
# subagents (parallel)
implementation-quality validator
domain-compliance validator
anti-reinvention validator
testing-evidence validator
doctrine-rules validator
```

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review —
> only context on the work that was done before the review.

**Review result**: REQUEST_CHANGES

**Plan**: /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/global-state-system-plan.md
**Spec**: /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/global-state-system-spec.md
**Phase**: Phase 5: Worktree Exemplar
**Tasks dossier**: /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/tasks/phase-5-worktree-exemplar/tasks.md
**Execution log**: /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/tasks/phase-5-worktree-exemplar/execution.log.md
**Review file**: /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/reviews/review.phase-5-worktree-exemplar.md

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/reviews/_computed.diff | Modified | review artifact | Yes (recompute phase scope) |
| /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/reviews/_manifest.txt | Modified | review artifact | Yes (recompute phase scope) |
| /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/tasks/phase-5-worktree-exemplar/tasks.md | Reviewed | plan artifact | Yes (status/evidence sync) |
| /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/tasks/phase-5-worktree-exemplar/execution.log.md | Reviewed | plan artifact | Yes (replace temporary AC-39 path + add RED/GREEN evidence) |
| /Users/jordanknight/substrate/chainglass-048/apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx | Unchanged in computed diff | file-browser | Yes (subtitle composition alignment) |
| /Users/jordanknight/substrate/chainglass-048/test/unit/web/state/worktree-publisher.test.tsx | Unchanged in computed diff | file-browser | Yes (policy + coverage alignment) |
| /Users/jordanknight/substrate/chainglass-048/docs/domains/_platform/workgraph/domain.md | Reviewed | _platform/workgraph | Yes (composition/history updates) |
| /Users/jordanknight/substrate/chainglass-048/docs/domains/domain-map.md | Modified | domains meta | Yes (node/edge consistency) |
| /Users/jordanknight/substrate/chainglass-048/docs/domains/registry.md | Modified | domains meta | Yes (canonical status taxonomy) |

### Required Fixes (if REQUEST_CHANGES)

| # | File (absolute path) | What To Fix | Why |
|---|---------------------|-------------|-----|
| 1 | /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/reviews/_computed.diff; /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/reviews/_manifest.txt | Recompute phase-scoped diff/manifest for Phase 5 only | Current review scope is not phase-representative (F001/F004). |
| 2 | /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/041-file-browser/state/worktree-publisher.tsx; /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/tasks/phase-5-worktree-exemplar/execution.log.md | Replace temporary timer behavior with real FileChangeHub event publishing and record evidence | AC-39 requires live file-change wiring (F002). |
| 3 | /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/tasks/phase-5-worktree-exemplar/execution.log.md | Add RED→GREEN command outputs and AC mapping for Full TDD | Spec testing strategy compliance (F003). |
| 4 | /Users/jordanknight/substrate/chainglass-048/docs/domains/_platform/workgraph/domain.md; /Users/jordanknight/substrate/chainglass-048/docs/domains/domain-map.md; /Users/jordanknight/substrate/chainglass-048/docs/domains/registry.md | Align domain docs/map/registry with current workgraph lifecycle and dependencies | Domain consistency failures (F005/F009/F010). |

### Domain Artifacts to Update (if any)

| File (absolute path) | What's Missing |
|---------------------|----------------|
| /Users/jordanknight/substrate/chainglass-048/docs/domains/_platform/workgraph/domain.md | Updated web/API consumers list, dependency section, and history entry for Plan 050 Phase 7 cleanup |
| /Users/jordanknight/substrate/chainglass-048/docs/domains/domain-map.md | Consistent `_platform/workgraph` node/edge representation aligned with health summary |
| /Users/jordanknight/substrate/chainglass-048/docs/domains/registry.md | Canonical status value for `_platform/workgraph` matching registry taxonomy |

### Next Step

/plan-6-v2-implement-phase --plan /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/global-state-system-plan.md --phase "Phase 5: Worktree Exemplar"
