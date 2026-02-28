# Code Review: Simple Mode

**Plan**: /Users/jordanknight/substrate/chainglass-048/docs/plans/056-state-devtools-panel/state-devtools-panel-plan.md
**Spec**: /Users/jordanknight/substrate/chainglass-048/docs/plans/056-state-devtools-panel/state-devtools-panel-spec.md
**Phase**: Simple Mode
**Date**: 2026-02-28
**Reviewer**: Automated (plan-7-v2)
**Testing Approach**: Full TDD

## A) Verdict

**REQUEST_CHANGES**

High-severity correctness, testing-evidence, domain-documentation, and doctrine violations remain unresolved.

**Key failure areas**:
- **Implementation**: Stream clear/pause logic is incorrect and high-frequency updates are not throttled in `use-state-inspector.ts`.
- **Domain compliance**: `_platform/dev-tools` is implemented in code but missing required domain artifacts (domain doc, registry, map updates).
- **Testing**: Full-TDD evidence and execution log are missing; AC verification is incomplete for most inspector behaviors.
- **Doctrine**: `vi.fn()` and missing per-test Test Doc blocks violate project testing rules.

## B) Summary

The phase delivers substantial functionality, but key behavior in stream state management is incorrect under real ring-buffer conditions and pause/resume semantics. Domain architecture docs are not in sync with introduced `_platform/dev-tools` scope, which blocks domain-compliance signoff. Test evidence does not satisfy the specified Full TDD process because `execution.log.md` is missing and AC verification is sparse beyond the log hook path. Anti-reinvention checks found no genuine duplication across domains.

## C) Checklist

**Testing Approach: Full TDD**

- [ ] RED-GREEN evidence documented per task
- [ ] Core validation tests present for all critical paths
- [ ] Acceptance criteria mapped to concrete verification evidence

Universal (all approaches):
- [x] Only in-scope files changed
- [ ] Linters/type checks clean (if applicable)
- [ ] Domain compliance checks pass

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | HIGH | /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/_platform/dev-tools/hooks/use-state-inspector.ts:82-85,103-105 | correctness | Clear boundary uses array index from capped FIFO, causing post-clear events to be dropped at/after cap rollover. | Track clear boundary with monotonic marker/version, not mutable array index. |
| F002 | HIGH | /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/_platform/dev-tools/hooks/use-state-inspector.ts:114-121 | correctness | Pause/resume clears visible stream and buffered count reports total filtered history, not paused delta. | Capture pause snapshot/version and compute buffered delta only while paused. |
| F003 | HIGH | /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/_platform/dev-tools/hooks/use-state-inspector.ts:59-70 | performance | `'*'` subscription refreshes multiple states per event with no batching/throttle, violating AC-21 intent. | Batch with RAF or fixed interval and apply one snapshot update per tick. |
| F004 | HIGH | /Users/jordanknight/substrate/chainglass-048/docs/plans/056-state-devtools-panel/execution.log.md | testing | Full TDD required by spec, but `execution.log.md` is missing and no RED→GREEN transcript exists. | Create execution log with chronological commands and failing/passing evidence. |
| F005 | HIGH | /Users/jordanknight/substrate/chainglass-048/test/unit/web/dev-tools/state-inspector.test.tsx:1-145 | testing | AC-01..AC-22 are marked complete, but tests only cover a narrow subset (mostly `useStateChangeLog`). | Add hook/component tests for domains/state/stream/detail/filter/pause/clear/perf-critical flows. |
| F006 | HIGH | /Users/jordanknight/substrate/chainglass-048/docs/domains/_platform/dev-tools/domain.md | domain-md | New `_platform/dev-tools` domain has no domain.md artifact. | Create domain doc with purpose, boundary, contracts, composition, concepts, history. |
| F007 | HIGH | /Users/jordanknight/substrate/chainglass-048/docs/domains/registry.md:1-17 | registry | Registry does not include `_platform/dev-tools`. | Add `_platform/dev-tools` row with parent/type/source metadata. |
| F008 | HIGH | /Users/jordanknight/substrate/chainglass-048/test/unit/web/dev-tools/state-change-log.test.ts:115-145 | doctrine | `vi.fn()` usage violates R-TEST-007 mock policy (fakes-only). | Replace `vi.fn()` listeners with deterministic fake listener implementations. |
| F009 | MEDIUM | /Users/jordanknight/substrate/chainglass-048/docs/domains/domain-map.md:68-84 | map-nodes | Domain map health summary omits `_platform/dev-tools` node/row. | Add node + summary row for `_platform/dev-tools`. |
| F010 | MEDIUM | /Users/jordanknight/substrate/chainglass-048/docs/domains/domain-map.md:27-58 | map-edges | Domain map does not show labeled `_platform/dev-tools -> _platform/state` contract edge(s). | Add labeled contract dependency edges and sync health table consumers/providers. |
| F011 | MEDIUM | /Users/jordanknight/substrate/chainglass-048/docs/domains/_platform/state/domain.md:45-153 | domain-md | State domain doc missing Plan 056 additions (`state-change-log.ts`, `StateChangeLogContext`, updated consumers/history). | Update contracts/composition/source/dependencies/history sections. |
| F012 | MEDIUM | /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/_platform/dev-tools/hooks/use-state-change-log.ts:16 | contract-imports | Cross-domain import reaches internal module (`@/lib/state/state-provider`) instead of public contract/barrel. | Import from `@/lib/state` public export surface. |
| F013 | MEDIUM | /Users/jordanknight/substrate/chainglass-048/test/unit/web/dev-tools/state-change-log.test.ts:33-157 | doctrine | Tests lack required per-test Test Doc block fields (R-TEST-002/003). | Add complete 5-field Test Doc comment to each test case. |
| F014 | MEDIUM | /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/_platform/dev-tools/components/entry-detail.tsx:23-27; /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/_platform/dev-tools/components/state-entries-table.tsx:25; /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/_platform/dev-tools/components/event-stream.tsx:40 | error-handling | Direct `JSON.stringify` on unknown values can throw (e.g., circular refs/BigInt) and crash inspector UI. | Use shared safe serialization helper with fallback for unserializable values. |
| F015 | MEDIUM | /Users/jordanknight/substrate/chainglass-048/docs/plans/056-state-devtools-panel/state-devtools-panel-plan.md:94-95 | testing | AC-21/AC-22 have only claim-level evidence, no measurable perf verification. | Add high-frequency publish tests + measured results in execution evidence. |
| F016 | LOW | /Users/jordanknight/substrate/chainglass-048/docs/domains/_platform/dev-tools/domain.md | concepts-docs | Concepts section/table is absent for new domain contracts. | Add `## Concepts` table (Concept | Entry Point | What It Does). |
| F017 | LOW | /Users/jordanknight/substrate/chainglass-048/apps/web/app/(dashboard)/dev/state-inspector/page.tsx; /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/_platform/dev-tools/components/domain-overview.tsx; /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/_platform/dev-tools/components/entry-detail.tsx; /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/_platform/dev-tools/components/event-stream.tsx; /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/_platform/dev-tools/components/state-entries-table.tsx; /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/_platform/dev-tools/components/state-inspector.tsx | doctrine | Public exported functions omit explicit return types (R-CODE-001). | Add explicit return types for exported component/page functions. |

## E) Detailed Findings

### E.1) Implementation Quality

- **F001 (HIGH)**: Clear boundary relies on array index from current snapshot (`allLogEntries.length`), which fails once ring-buffer eviction shifts indices.
- **F002 (HIGH)**: `paused ? [] : logEntries` hides prior events and `bufferedCount` reports history length instead of pause-window delta.
- **F003 (HIGH)**: Refresh path updates four states per publish with no throttle/batch despite AC-21 requirement.
- **F014 (MEDIUM)**: Unsafe serialization in detail/table/stream can throw on non-JSON-safe values.

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ✅ | New files are under declared source trees from plan Domain Manifest. |
| Contract-only imports | ❌ | `use-state-change-log.ts` imports `@/lib/state/state-provider` internal module (F012). |
| Dependency direction | ✅ | No infrastructure→business violations detected. |
| Domain.md updated | ❌ | `_platform/dev-tools/domain.md` missing; `_platform/state/domain.md` stale for Plan 056 (F006, F011). |
| Registry current | ❌ | `_platform/dev-tools` missing from registry (F007). |
| No orphan files | ✅ | Changed files map to declared domains/plan scope. |
| Map nodes current | ❌ | Domain map node/health summary omits `_platform/dev-tools` (F009). |
| Map edges current | ❌ | No labeled dependency edges for dev-tools→state contracts (F010). |
| No circular business deps | ✅ | No new business-domain cycle evidence found. |
| Concepts documented | ⚠️ | New domain concepts table absent because domain doc is missing (F016). |

### E.3) Anti-Reinvention

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| StateChangeLog service | None | _platform/state | proceed |
| useStateChangeLog hook | None | _platform/dev-tools | proceed |
| useStateInspector hook | None | _platform/dev-tools | proceed |
| StateInspector main component | None | _platform/dev-tools | proceed |
| EventStream component | None | _platform/dev-tools | proceed |
| StateEntriesTable component | None | _platform/dev-tools | proceed |
| DomainOverview component | None | _platform/dev-tools | proceed |
| EntryDetail component | None | _platform/dev-tools | proceed |
| StateInspector page | None | _platform/dev-tools | proceed |

### E.4) Testing & Evidence

**Coverage confidence**: **47%**

Violations:
- **HIGH**: Missing `execution.log.md`; no RED→GREEN evidence chain for Full TDD (F004).
- **HIGH**: AC completion claims exceed test evidence breadth (F005).
- **MEDIUM**: Performance AC evidence for AC-21/AC-22 is not measurable (F015).

| AC | Confidence | Evidence |
|----|------------|----------|
| AC-08 | 65 | Subscribe pipeline implemented; publish→log behavior present in tests. |
| AC-11 | 45 | Pause/resume/clear UI exists, but semantics currently incorrect (F002). |
| AC-19 | 75 | previousValue rendering path implemented and asserted in tests. |
| AC-21 | 10 | No throttle test or measurable perf evidence. |
| AC-22 | 10 | No non-degradation measurement evidence. |
| AC-23 | 90 | Ring buffer class and cap behavior implemented and heavily unit-tested. |
| AC-25 | 88 | `useStateChangeLog(pattern?, limit?)` implemented and tested. |
| AC-26 | 65 | Log mounted in provider, but no dedicated provider integration evidence. |

### E.5) Doctrine Compliance

- **F008 (HIGH)**: `vi.fn()` used in `state-change-log.test.ts` (R-TEST-007 violation).
- **F013 (MEDIUM)**: Missing Test Doc blocks per test in `state-change-log.test.ts` (R-TEST-002/003).
- **F017 (LOW)**: Explicit return type omissions on exported components/page (R-CODE-001).

## F) Coverage Map

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| AC-01 | Domain list with metadata | DomainOverview renders metadata fields; no direct test assertion. | 45 |
| AC-02 | Expand to property descriptors | Expand/collapse and descriptor rows implemented; no direct test. | 40 |
| AC-03 | Multi-instance count shown | `listInstances()` usage present; no direct test. | 40 |
| AC-04 | Current entries sorted by recency | `list('*')` + sort path present; no direct test. | 45 |
| AC-05 | Path/value/time columns | Table columns implemented; no direct test. | 45 |
| AC-06 | Domain filtering for entries | Filter state/logic and UI present; no direct test. | 40 |
| AC-07 | Click entry shows detail | Selection/detail panel path present; no direct test. | 40 |
| AC-08 | Real-time subscribe stream | Provider/hook subscribe flow with publish evidence. | 65 |
| AC-09 | Event row includes key fields | Row format implemented; no direct test. | 40 |
| AC-10 | Stream filterable by domain | Stream filter logic/UI present; no direct test. | 40 |
| AC-11 | Pause/resume + buffered + clear | Controls present but semantics flawed (F002). | 45 |
| AC-12 | Auto-scroll newest | Auto-scroll logic present; no direct test. | 35 |
| AC-13 | Accessible from Dev nav | Nav item added in `navigation-utils.ts`. | 55 |
| AC-14 | Route `/dev/state-inspector` | Route file present and nav points to it. | 60 |
| AC-15 | Works with collapsed sidebar | No explicit verification evidence. | 20 |
| AC-16 | Footer diagnostics counts | Footer fields render from hook data; no direct test. | 45 |
| AC-17 | Footer updates live | Subscribe refresh path exists; no direct test. | 40 |
| AC-18 | Detail panel full JSON | Detail rendering implemented; no direct test. | 40 |
| AC-19 | previousValue shown for events | previousValue display path tested. | 75 |
| AC-20 | Domain descriptor context in detail | Descriptor context rendering exists; no direct test. | 40 |
| AC-21 | High-frequency updates throttled | No confirmed throttling behavior/evidence (F003/F015). | 10 |
| AC-22 | No perf degradation for others | No measurable evidence artifact. | 10 |
| AC-23 | Ring buffer from boot, cap 500 | StateChangeLog + cap tests robust. | 90 |
| AC-24 | Historical log shown | Boot-time log ingestion implemented; partial evidence. | 65 |
| AC-25 | `useStateChangeLog(pattern?,limit?)` | Hook implementation + filtering/limit tests present. | 88 |
| AC-26 | Log mounted in provider | Provider mount/subscription implemented; limited direct test evidence. | 65 |

**Overall coverage confidence**: **47%**

## G) Commands Executed

```bash
git --no-pager diff --stat
git --no-pager diff --staged --stat
git --no-pager diff --name-status
git --no-pager log --oneline -20
git --no-pager log --oneline -- apps/web/src/features/_platform/dev-tools/components/state-inspector.tsx | head -20
BASE=$(git rev-parse 5c8555e^)
git --no-pager diff --name-status "$BASE"..HEAD -- <phase file list>
git --no-pager diff "$BASE"..HEAD -- <phase file list> > /Users/jordanknight/substrate/chainglass-048/docs/plans/056-state-devtools-panel/reviews/_computed.diff
git --no-pager diff >> /Users/jordanknight/substrate/chainglass-048/docs/plans/056-state-devtools-panel/reviews/_computed.diff
git --no-pager diff --staged >> /Users/jordanknight/substrate/chainglass-048/docs/plans/056-state-devtools-panel/reviews/_computed.diff
# Plus 5 parallel subagents: implementation quality, domain compliance, anti-reinvention, testing evidence, doctrine rules
```

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review —
> only context on the work that was done before the review.

**Review result**: REQUEST_CHANGES

**Plan**: /Users/jordanknight/substrate/chainglass-048/docs/plans/056-state-devtools-panel/state-devtools-panel-plan.md
**Spec**: /Users/jordanknight/substrate/chainglass-048/docs/plans/056-state-devtools-panel/state-devtools-panel-spec.md
**Phase**: Simple Mode
**Tasks dossier**: inline in plan
**Execution log**: /Users/jordanknight/substrate/chainglass-048/docs/plans/056-state-devtools-panel/execution.log.md (missing)
**Review file**: /Users/jordanknight/substrate/chainglass-048/docs/plans/056-state-devtools-panel/reviews/review.md

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| /Users/jordanknight/substrate/chainglass-048/apps/web/app/(dashboard)/dev/state-inspector/page.tsx | Added | _platform/dev-tools | Optional (LOW, F017) |
| /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/_platform/dev-tools/components/domain-overview.tsx | Added | _platform/dev-tools | Optional (LOW, F017) |
| /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/_platform/dev-tools/components/entry-detail.tsx | Added | _platform/dev-tools | Yes (F014) |
| /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/_platform/dev-tools/components/event-stream.tsx | Added | _platform/dev-tools | Yes (F014) |
| /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/_platform/dev-tools/components/state-entries-table.tsx | Added | _platform/dev-tools | Yes (F014) |
| /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/_platform/dev-tools/components/state-inspector.tsx | Added | _platform/dev-tools | Optional (LOW, F017) |
| /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/_platform/dev-tools/hooks/use-state-change-log.ts | Added | _platform/dev-tools | Yes (F012) |
| /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/_platform/dev-tools/hooks/use-state-inspector.ts | Added | _platform/dev-tools | Yes (F001-F003) |
| /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/_platform/dev-tools/index.ts | Added | _platform/dev-tools | No |
| /Users/jordanknight/substrate/chainglass-048/apps/web/src/lib/navigation-utils.ts | Modified | file-browser | No |
| /Users/jordanknight/substrate/chainglass-048/apps/web/src/lib/state/state-change-log.ts | Added | _platform/state | No |
| /Users/jordanknight/substrate/chainglass-048/apps/web/src/lib/state/state-provider.tsx | Modified | _platform/state | No |
| /Users/jordanknight/substrate/chainglass-048/test/unit/web/dev-tools/state-change-log.test.ts | Added | _platform/state | Yes (F008, F013) |
| /Users/jordanknight/substrate/chainglass-048/test/unit/web/dev-tools/state-inspector.test.tsx | Added | _platform/dev-tools | Yes (F005) |
| /Users/jordanknight/substrate/chainglass-048/docs/plans/056-state-devtools-panel/state-devtools-panel-plan.md | Modified | planning | Evidence updates needed (F004, F015) |

### Required Fixes (if REQUEST_CHANGES)

| # | File (absolute path) | What To Fix | Why |
|---|---------------------|-------------|-----|
| 1 | /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/_platform/dev-tools/hooks/use-state-inspector.ts | Fix clear boundary and pause/buffer semantics; add throttled refresh path. | Correctness and performance defects (F001-F003). |
| 2 | /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/_platform/dev-tools/hooks/use-state-change-log.ts | Replace internal import with public state contract/barrel import. | Domain contract-only import rule (F012). |
| 3 | /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/_platform/dev-tools/components/entry-detail.tsx | Add safe value serialization helper (also apply to table/stream). | Prevent runtime crash on unserializable values (F014). |
| 4 | /Users/jordanknight/substrate/chainglass-048/test/unit/web/dev-tools/state-change-log.test.ts | Remove `vi.fn()` and add required Test Doc blocks per test. | Doctrine violations R-TEST-007 and R-TEST-002/003 (F008, F013). |
| 5 | /Users/jordanknight/substrate/chainglass-048/test/unit/web/dev-tools/state-inspector.test.tsx | Expand tests to cover AC-01..AC-22 critical paths, pause/clear semantics, perf-sensitive behavior. | AC verification gap (F005). |
| 6 | /Users/jordanknight/substrate/chainglass-048/docs/plans/056-state-devtools-panel/execution.log.md | Create Full-TDD execution evidence with RED→GREEN command transcript. | Required testing evidence artifact missing (F004). |
| 7 | /Users/jordanknight/substrate/chainglass-048/docs/domains/_platform/dev-tools/domain.md | Create domain doc incl. concepts/history/contracts/composition. | New domain artifact missing (F006, F016). |
| 8 | /Users/jordanknight/substrate/chainglass-048/docs/domains/registry.md and /Users/jordanknight/substrate/chainglass-048/docs/domains/domain-map.md | Register domain and add labeled map node/edges/health rows. | Registry/map currency failures (F007, F009, F010). |
| 9 | /Users/jordanknight/substrate/chainglass-048/docs/domains/_platform/state/domain.md | Add Plan 056 updates (StateChangeLogContext, new file, consumer/history updates). | State domain documentation stale (F011). |

### Domain Artifacts to Update (if any)

| File (absolute path) | What's Missing |
|---------------------|----------------|
| /Users/jordanknight/substrate/chainglass-048/docs/domains/_platform/dev-tools/domain.md | Entire domain file missing (purpose/boundary/contracts/composition/concepts/history). |
| /Users/jordanknight/substrate/chainglass-048/docs/domains/registry.md | `_platform/dev-tools` entry missing. |
| /Users/jordanknight/substrate/chainglass-048/docs/domains/domain-map.md | `_platform/dev-tools` node, labeled dependency edges, health summary row. |
| /Users/jordanknight/substrate/chainglass-048/docs/domains/_platform/state/domain.md | Plan 056 contract/composition/dependency/history updates missing. |

### Next Step

/plan-6-v2-implement-phase --plan /Users/jordanknight/substrate/chainglass-048/docs/plans/056-state-devtools-panel/state-devtools-panel-plan.md

Then re-run:
/plan-7-v2-code-review --plan /Users/jordanknight/substrate/chainglass-048/docs/plans/056-state-devtools-panel/state-devtools-panel-plan.md
