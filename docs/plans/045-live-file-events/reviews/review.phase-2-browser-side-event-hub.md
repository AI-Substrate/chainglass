# Code Review: Phase 2 — Browser-Side Event Hub

**Plan**: `/home/jak/substrate/041-file-browser/docs/plans/045-live-file-events/live-file-events-plan.md`
**Spec**: `/home/jak/substrate/041-file-browser/docs/plans/045-live-file-events/live-file-events-spec.md`
**Phase**: Phase 2: Browser-Side Event Hub
**Date**: 2026-02-24
**Reviewer**: Automated (plan-7-v2)
**Testing Approach**: Full TDD

## A) Verdict

**REQUEST_CHANGES**

Accumulate + debounce interaction has a data-loss bug (F001), and all 32 test cases are missing mandatory Test Doc comments (F002–F004).

**Key failure areas**:
- **Implementation**: Debounce + accumulate mode silently drops intermediate batches — data loss when multiple batches arrive within the debounce window
- **Doctrine**: All test files missing R-TEST-002 mandatory Test Doc 5-field comments

## B) Summary

The Phase 2 implementation is architecturally sound — FileChangeHub, FileChangeProvider, and useFileChanges form a clean three-layer stack that matches the Workshop 01 design. Pattern matching (exact, directory, recursive, wildcard) works correctly across 44 passing tests. Domain compliance is clean: all files are correctly placed under `_platform/events`, imports respect domain boundaries, and domain documentation has been updated. The one correctness bug (F001) affects accumulate mode with debounce > 0 — a specific combination that current tests don't exercise because they use `debounce: 0`. The createMatcher duplication (F005) between real and fake hub is a maintainability concern mitigated by contract tests but should be addressed.

## C) Checklist

**Testing Approach: Full TDD**

- [x] Core validation tests present (44 tests across 3 files)
- [x] Critical paths covered (4 pattern types, subscribe/unsubscribe, error isolation)
- [x] Contract tests verify real/fake parity (8 shared assertions)
- [ ] RED-GREEN TDD evidence documented (execution log lacks proof)
- [x] Only in-scope files changed
- [x] Linters/type checks clean
- [x] Domain compliance checks pass (9/9)

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | HIGH | `use-file-changes.ts:55-65` | correctness | Debounce + accumulate drops intermediate batches | Buffer incoming changes across debounce windows |
| F002 | HIGH | `file-change-hub.test.ts` | doctrine | All 18 tests missing R-TEST-002 Test Doc | Add 5-field Test Doc to each `it()` |
| F003 | HIGH | `use-file-changes.test.tsx` | doctrine | All 10 tests missing R-TEST-002 Test Doc | Add 5-field Test Doc to each `it()` |
| F004 | HIGH | `file-change-hub.contract.ts` | doctrine | All 8 contract tests missing R-TEST-002 Test Doc | Add 5-field Test Doc to each `it()` |
| F005 | MEDIUM | `fake-file-change-hub.ts:70-83` | pattern | createMatcher duplicated from file-change-hub.ts | Extract to shared path-matcher.ts |
| F006 | MEDIUM | `file-change-hub.ts + fake-*` | pattern | No formal IFileChangeHub interface | Extract interface to file-change.types.ts |
| F007 | MEDIUM | execution.log.md | evidence | No RED-GREEN TDD evidence in execution log | Retroactively unrecoverable; improve in Phase 3 |
| F008 | LOW | `file-change-provider.tsx:62` | correctness | Unsafe `as FileChange['eventType']` cast without runtime validation | Add VALID_EVENTS guard before mapping |
| F009 | LOW | `index.ts:13` | pattern | FakeFileChangeHub in production barrel export | Consider separate test entrypoint |
| F010 | LOW | Plan Domain Manifest | scope | file-change.types.ts and fake-file-change-hub.ts missing from manifest | Add rows to Domain Manifest |
| F011 | LOW | `use-file-changes.test.tsx` | coverage | AC-12 (single SSE connection) lacks explicit multi-hook test | Add test rendering 2 hooks under 1 provider |
| F012 | LOW | execution.log.md | evidence | No vitest output or diff snippets in evidence | Paste terminal output in Phase 3 |
| F013 | LOW | `file-change-hub.test.ts:8` | pattern | Unused `vi` import | Remove from import |
| F014 | LOW | `use-file-changes.test.tsx:11` | pattern | Unused `FakeFileChangeHub` import | Remove import and stale comments |

## E) Detailed Findings

### E.1) Implementation Quality

**F001 (HIGH) — Debounce + accumulate data loss**

In `use-file-changes.ts` lines 55-65, when two batches arrive within the debounce window in accumulate mode:
1. Batch 1 arrives → timer set with closure capturing `incoming = batch1`
2. Batch 2 arrives within debounce → timer cleared, new timer set with `incoming = batch2`
3. Timer fires → `setChanges(prev => [...prev, ...batch2])` — **batch1 is permanently lost**

The test suite doesn't catch this because `accumulate` tests use `debounce: 0` (immediate mode).

**Fix**: Add a `bufferRef` to accumulate incoming changes across debounce resets:
```diff
+ const bufferRef = useRef<FileChange[]>([]);

  const unsubscribe = hub.subscribe(pattern, (incoming) => {
    if (timerRef.current) clearTimeout(timerRef.current);

+   if (mode === 'accumulate') {
+     bufferRef.current.push(...incoming);
+   } else {
+     bufferRef.current = [...incoming];
+   }

    if (debounce === 0) {
-     setChanges((prev) => (mode === 'accumulate' ? [...prev, ...incoming] : incoming));
+     setChanges((prev) => (mode === 'accumulate' ? [...prev, ...bufferRef.current] : bufferRef.current));
+     bufferRef.current = [];
    } else {
      timerRef.current = setTimeout(() => {
-       setChanges((prev) => (mode === 'accumulate' ? [...prev, ...incoming] : incoming));
+       setChanges((prev) => (mode === 'accumulate' ? [...prev, ...bufferRef.current] : bufferRef.current));
+       bufferRef.current = [];
      }, debounce);
    }
  });
```

Also add a test for accumulate + debounce > 0 to catch this regression.

**F008 (LOW) — Unsafe eventType cast**

`file-change-provider.tsx` line 62 casts `c.eventType as FileChange['eventType']` without runtime validation. If the server adds a new event type, it passes through unchecked.

```diff
+ const VALID_EVENT_TYPES = new Set(['add', 'change', 'unlink', 'addDir', 'unlinkDir']);
  const relevantChanges: FileChange[] = data.changes
-   .filter((c) => c.worktreePath === worktreePath)
+   .filter((c) => c.worktreePath === worktreePath && VALID_EVENT_TYPES.has(c.eventType))
```

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ✅ | All 6 source files under `045-live-file-events/` (events domain) |
| Contract-only imports | ✅ | All imports within same domain or from shared contracts |
| Dependency direction | ✅ | No business domain imports from infrastructure |
| Domain.md updated | ✅ | § History, § Composition, § Contracts, § Source Location all updated |
| Registry current | ✅ | No new domains created |
| No orphan files | ⚠️ | `file-change.types.ts` and `fake-file-change-hub.ts` not in Domain Manifest (LOW) |
| Map nodes current | ✅ | `FileChangeHub · useFileChanges` in events node |
| Map edges current | ✅ | `fileBrowser → events` edge labeled with contracts |
| No circular business deps | ✅ | Single business domain, no cycles |

### E.3) Anti-Reinvention

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| FileChangeHub | None | N/A | ✅ Proceed — novel browser-side dispatch |
| FileChangeProvider | useSSE (existing hook) | events | ✅ Proceed — intentional divergence per Workshop 01 |
| useFileChanges | None | N/A | ✅ Proceed — no existing pattern-subscription hook |
| createMatcher (duplicated) | file-change-hub.ts copy | events (internal) | ⚠️ Extract to shared module (F005) |
| file-change.types.ts | None (client subset of server type) | N/A | ✅ Proceed |

### E.4) Testing & Evidence

**Coverage confidence**: 82%

| AC | Confidence | Evidence |
|----|------------|----------|
| AC-07 | 95% | Hub exact match test + hook test with 'src/app.tsx' pattern |
| AC-08 | 90% | Hub directory match tests (direct children only, nested excluded) + contract C02 |
| AC-09 | 95% | Hub recursive match test (3 nested paths all match) + contract C03 |
| AC-10 | 95% | Hub wildcard test + multiple hook tests use '*' pattern |
| AC-11 | 85% | Hook unmount test asserts EventSource CLOSED + hub unsubscribe test + timer cleanup in code |
| AC-12 | 60% | Architecturally enforced but no explicit multi-hook test |
| AC-13 | 100% | Explicit test: renderHook without provider throws with exact message |

**Violations**:
- (MEDIUM) No RED-GREEN TDD evidence in execution log — terse status entries only
- (LOW) AC-12 lacks explicit test for single-connection guarantee

### E.5) Doctrine Compliance

**F002–F004 (HIGH) — Missing R-TEST-002 Test Doc**

All 36 test cases across 3 files lack the mandatory 5-field Test Doc comment block (Why, Contract, Usage Notes, Quality Contribution, Worked Example) required by R-TEST-002.

Files affected:
- `test/unit/web/features/045-live-file-events/file-change-hub.test.ts` (18 tests)
- `test/unit/web/features/045-live-file-events/use-file-changes.test.tsx` (10 tests)
- `test/contracts/file-change-hub.contract.ts` (8 tests)

**F005–F006 (MEDIUM) — Missing interface, duplicated matcher**

- No `IFileChangeHub` interface per R-ARCH-002 (Interface-First Design). Real and fake share shape via duck typing.
- `createMatcher` duplicated verbatim between hub and fake. Contract tests catch behavioral drift but maintenance burden is unnecessary.

**F013–F014 (LOW) — Unused imports**

- `vi` imported but unused in `file-change-hub.test.ts`
- `FakeFileChangeHub` imported but unused in `use-file-changes.test.tsx`

Biome lint passes clean on all source files.

## F) Coverage Map

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| AC-07 | Exact path match → hasChanges true | Hub exact test + hook receive test | 95% |
| AC-08 | Directory pattern → direct children only | Hub dir tests (match + no-nest) + contract C02 | 90% |
| AC-09 | Recursive pattern → all descendants | Hub recursive test + contract C03 | 95% |
| AC-10 | Wildcard → matches everything | Hub wildcard test + contract C04 | 95% |
| AC-11 | Unmount cleanup, no leaks | Hook unmount test (ES CLOSED) + timer cleanup | 85% |
| AC-12 | Single SSE connection per worktree | Architectural (1 EventSource per Provider) | 60% |
| AC-13 | Outside provider → throws | Hook test: renderHook without wrapper throws | 100% |

**Overall coverage confidence**: 89%

## G) Commands Executed

```bash
# Git status for phase 2 files
git --no-pager status --porcelain -- apps/web/src/features/045-live-file-events/ test/unit/web/features/045-live-file-events/ test/contracts/file-change-hub*

# Generate computed diff
for f in <10 files>; do git diff --no-index /dev/null "$f"; done > reviews/_computed.phase2.diff

# Run phase 2 tests
pnpm vitest run test/unit/web/features/045-live-file-events/ test/contracts/file-change-hub.contract.test.ts
# Result: 3 files, 44 tests, all passed (820ms)

# Biome lint
npx biome check apps/web/src/features/045-live-file-events/
# Result: clean
```

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review —
> only context on the work that was done before the review.

**Review result**: REQUEST_CHANGES

**Plan**: `/home/jak/substrate/041-file-browser/docs/plans/045-live-file-events/live-file-events-plan.md`
**Spec**: `/home/jak/substrate/041-file-browser/docs/plans/045-live-file-events/live-file-events-spec.md`
**Phase**: Phase 2: Browser-Side Event Hub
**Tasks dossier**: `/home/jak/substrate/041-file-browser/docs/plans/045-live-file-events/tasks/phase-2-browser-side-event-hub/tasks.md`
**Execution log**: `/home/jak/substrate/041-file-browser/docs/plans/045-live-file-events/tasks/phase-2-browser-side-event-hub/execution.log.md`
**Review file**: `/home/jak/substrate/041-file-browser/docs/plans/045-live-file-events/reviews/review.phase-2-browser-side-event-hub.md`

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| `/home/jak/substrate/041-file-browser/apps/web/src/features/045-live-file-events/file-change.types.ts` | Created | events | None |
| `/home/jak/substrate/041-file-browser/apps/web/src/features/045-live-file-events/file-change-hub.ts` | Created | events | F005: Extract createMatcher; F006: Add IFileChangeHub interface |
| `/home/jak/substrate/041-file-browser/apps/web/src/features/045-live-file-events/fake-file-change-hub.ts` | Created | events | F005: Import shared createMatcher; F006: Implement IFileChangeHub |
| `/home/jak/substrate/041-file-browser/apps/web/src/features/045-live-file-events/file-change-provider.tsx` | Created | events | F008: Add eventType validation guard |
| `/home/jak/substrate/041-file-browser/apps/web/src/features/045-live-file-events/use-file-changes.ts` | Created | events | **F001: Fix debounce + accumulate data loss** |
| `/home/jak/substrate/041-file-browser/apps/web/src/features/045-live-file-events/index.ts` | Created | events | None |
| `/home/jak/substrate/041-file-browser/test/contracts/file-change-hub.contract.ts` | Created | test | F004: Add Test Doc; F013: Fix naming |
| `/home/jak/substrate/041-file-browser/test/contracts/file-change-hub.contract.test.ts` | Created | test | None |
| `/home/jak/substrate/041-file-browser/test/unit/web/features/045-live-file-events/file-change-hub.test.ts` | Created | test | F002: Add Test Doc; F013: Remove unused `vi` |
| `/home/jak/substrate/041-file-browser/test/unit/web/features/045-live-file-events/use-file-changes.test.tsx` | Created | test | F003: Add Test Doc; F011: Add AC-12 test; F014: Remove unused import |

### Required Fixes (REQUEST_CHANGES)

| # | File (absolute path) | What To Fix | Why |
|---|---------------------|-------------|-----|
| 1 | `/home/jak/substrate/041-file-browser/apps/web/src/features/045-live-file-events/use-file-changes.ts` | Add bufferRef to accumulate changes across debounce resets in accumulate mode | F001: Data loss — intermediate batches silently dropped |
| 2 | `/home/jak/substrate/041-file-browser/test/unit/web/features/045-live-file-events/use-file-changes.test.tsx` | Add test for accumulate + debounce > 0 (two batches within window) | F001: Regression test for the bug fix |
| 3 | `/home/jak/substrate/041-file-browser/test/unit/web/features/045-live-file-events/file-change-hub.test.ts` | Add R-TEST-002 Test Doc to all 18 `it()` blocks | F002: Doctrine MUST requirement |
| 4 | `/home/jak/substrate/041-file-browser/test/unit/web/features/045-live-file-events/use-file-changes.test.tsx` | Add R-TEST-002 Test Doc to all 10 `it()` blocks | F003: Doctrine MUST requirement |
| 5 | `/home/jak/substrate/041-file-browser/test/contracts/file-change-hub.contract.ts` | Add R-TEST-002 Test Doc to all 8 `it()` blocks | F004: Doctrine MUST requirement |

### Domain Artifacts to Update (if any)

| File (absolute path) | What's Missing |
|---------------------|----------------|
| `/home/jak/substrate/041-file-browser/docs/plans/045-live-file-events/live-file-events-plan.md` | Domain Manifest: add rows for `file-change.types.ts` and `fake-file-change-hub.ts` |

### Next Step

Fix findings F001–F004 (required), then re-run review:
```
/plan-7-v2-code-review --phase "Phase 2: Browser-Side Event Hub" --plan /home/jak/substrate/041-file-browser/docs/plans/045-live-file-events/live-file-events-plan.md
```
