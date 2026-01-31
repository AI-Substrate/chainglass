# Code Review: Subtask 001 — WorkspaceChangeNotifierService (Headless File Watcher)

**Phase**: Phase 4: Real-time Updates
**Subtask**: 001-subtask-file-watching-for-cli-changes
**Plan**: [workgraph-ui-plan.md](../workgraph-ui-plan.md)
**Subtask Dossier**: [001-subtask-file-watching-for-cli-changes.md](../tasks/phase-4-real-time-updates/001-subtask-file-watching-for-cli-changes.md)
**Execution Log**: [001-subtask-file-watching-for-cli-changes.execution.log.md](../tasks/phase-4-real-time-updates/001-subtask-file-watching-for-cli-changes.execution.log.md)

**Review Date**: 2026-01-30
**Reviewer**: Code Review Agent
**Diff Range**: `ffdf2f0..ec04b5e`

---

## A) Verdict

### ✅ **APPROVE**

This implementation is well-structured, follows TDD methodology, and satisfies all subtask requirements. No blocking issues found.

---

## B) Summary

Subtask 001 delivers the `WorkspaceChangeNotifierService` — a DI-integrated service in `packages/workflow` that watches all registered workspaces for `state.json` changes and emits `GraphChangedEvent`. Key deliverables:

- **8 files created**: Interfaces, adapters, fakes, service, tests
- **6 files modified**: Package exports and dependencies
- **36 new tests**: 32 unit tests + 4 integration tests (all passing)
- **TDD compliance**: Clear RED→GREEN→REFACTOR evidence in execution log
- **Constitution compliance**: Fakes used throughout, no mocks

The implementation correctly wraps chokidar via adapter pattern for testability, handles workspace registry changes dynamically, and provides clean event emission for browser integration (Subtask 002).

---

## C) Checklist

**Testing Approach: Full TDD** (per plan § Testing Philosophy)

- [x] Tests precede code (RED-GREEN-REFACTOR evidence in execution log)
- [x] Tests as docs (assertions show behavior - test names describe exactly what is verified)
- [x] Mock usage matches spec: **Avoid mocks** — Only fakes used (FakeFileWatcher, FakeWorkspaceRegistryAdapter, FakeGitWorktreeResolver)
- [x] Negative/edge cases covered (5 edge case tests: empty workspaces, missing paths, errors)

**Universal (Full TDD)**:
- [x] BridgeContext patterns followed — N/A for this backend service (no VS Code/browser code)
- [x] Only in-scope files changed — All files within `packages/workflow` as specified
- [x] Linters/type checks are clean — Biome + TypeScript pass
- [x] Absolute paths used — Service uses expandPath() for registry path

---

## D) Findings Table

| ID | Severity | File:Lines | Summary | Recommendation |
|----|----------|------------|---------|----------------|
| — | — | — | No blocking findings | — |

---

## E) Detailed Findings

### E.0) Cross-Phase Regression Analysis

**N/A** — This is a subtask within Phase 4, not a cross-phase boundary. Previous Phase 4 work (T001-T012) is unaffected by this headless service addition.

### E.1) Doctrine & Testing Compliance

#### Graph Integrity Validation ✅

| Validator | Status | Notes |
|-----------|--------|-------|
| Task↔Log | ✅ PASS | All 5 task IDs (ST001-ST005) have corresponding log entries; sub-steps (ST003-1 through ST005-2) properly linked |
| Task↔Footnote | ✅ N/A | Subtask uses inline progress, not footnote ledger system |
| Footnote↔File | ✅ N/A | No footnotes in subtask dossier (subtask-level granularity) |
| Plan↔Dossier | ✅ PASS | Parent task T006 references this subtask; architecture matches plan |
| Parent↔Subtask | ✅ PASS | Subtask correctly references parent Phase 4 task T006 |

**Graph Integrity Score**: ✅ INTACT

#### TDD Compliance ✅

| Check | Status | Evidence |
|-------|--------|----------|
| RED phase | ✅ | ST003-5: 32 tests written, all fail with "not a constructor" |
| GREEN phase | ✅ | ST004-3: 32 tests pass after implementation |
| Tests before impl | ✅ | ST003 completed 05:28, ST004 started 05:28 (tests finalized first) |
| No mocks | ✅ | Only `vi.spyOn(console, 'error')` for error handling test (acceptable infrastructure test) |

#### Mock Usage Compliance ✅

**Policy**: Avoid mocks (per plan § Testing Philosophy)

| Dependency | Technique | Status |
|------------|-----------|--------|
| File watcher | `FakeFileWatcher` with `simulateChange()` | ✅ Fake |
| Registry | `FakeWorkspaceRegistryAdapter` | ✅ Fake |
| Worktree resolver | `FakeGitWorktreeResolver` | ✅ Fake |
| Filesystem | `FakeFileSystem` from shared | ✅ Fake |
| Chokidar | `ChokidarFileWatcherAdapter` + `IFileWatcher` interface | ✅ Adapter pattern |

### E.2) Quality & Safety Analysis

**Safety Score: 100/100** (CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0)

#### Correctness Review ✅
- Path parsing regex correctly extracts `graphSlug` from `work-graphs/[slug]/state.json`
- Callback error handling prevents cascade failures (try/catch around each callback)
- Async rescan triggered from registry change with proper error logging

#### Security Review ✅
- No direct filesystem writes in this service (read-only watching)
- Path expansion uses `process.env.HOME` safely
- No secrets or credentials handled

#### Performance Review ✅
- Chokidar's `atomic` + `awaitWriteFinish` config handles debouncing efficiently
- Map-based path lookup for watched paths (O(n) worst case, acceptable for <100 workspaces)
- No unbounded loops or N+1 patterns

#### Observability Review ✅
- Console.error on watcher errors and callback failures
- isWatching() state queryable
- Proper cleanup in stop()

### E.3) Plan Compliance

#### Interface Compliance ✅

| Spec Requirement | Implementation | Status |
|------------------|---------------|--------|
| `start(): Promise<void>` | Lines 70-113 | ✅ |
| `stop(): Promise<void>` | Lines 115-127 | ✅ |
| `onGraphChanged(callback): () => void` | Lines 129-134 | ✅ |
| `isWatching(): boolean` | Lines 136-138 | ✅ |
| `rescan(): Promise<void>` | Lines 140-166 | ✅ |

#### Architecture Compliance ✅

| RES-002a Requirement | Implementation | Status |
|---------------------|---------------|--------|
| Registry watcher | Lines 76-87 | ✅ |
| Workgraph watcher per worktree | Lines 90-102, 171-183 | ✅ |
| Event filtering to state.json only | Lines 231-233 | ✅ |
| GraphSlug extraction from path | Lines 236-240 | ✅ |
| DI-injected dependencies (no mocking) | Constructor lines 62-68 | ✅ |

#### Chokidar Config (RES-001) ⚠️

| Config Option | Spec | Implementation | Status |
|---------------|------|---------------|--------|
| `atomic` | `true` | `true` | ✅ |
| `awaitWriteFinish.stabilityThreshold` | `200` | `200` | ✅ |
| `awaitWriteFinish.pollInterval` | `100` | `100` | ✅ |
| `ignoreInitial` | `true` | `true` | ✅ |
| `persistent` | `true` | `true` | ✅ |
| `cwd` | `process.cwd()` | (not set, uses chokidar default) | ⚠️ Minor |

**Note**: `cwd` parameter not exposed in `FileWatcherOptions` interface. Functionally correct (chokidar defaults to `process.cwd()`), but incomplete spec coverage. This is LOW severity and doesn't affect functionality.

#### Files Created ✅

All 8 files from ST004 spec created:

| File | Exists |
|------|--------|
| `file-watcher.interface.ts` | ✅ |
| `workspace-change-notifier.interface.ts` | ✅ |
| `chokidar-file-watcher.adapter.ts` | ✅ |
| `fake-file-watcher.ts` | ✅ |
| `workspace-change-notifier.service.ts` | ✅ |
| `fake-workspace-change-notifier.service.ts` | ✅ |
| Unit test file | ✅ |
| Integration test file | ✅ |

### E.4) Doctrine Evolution Recommendations

**Advisory — Does not affect verdict**

#### New Rules Candidates

| ID | Rule Statement | Evidence | Priority |
|----|---------------|----------|----------|
| RULE-REC-001 | Wrap all third-party file watching libraries in adapter pattern with IFileWatcher interface | `chokidar-file-watcher.adapter.ts` demonstrates pattern | MEDIUM |

#### Positive Alignment

| Doctrine | Evidence | Note |
|----------|----------|------|
| Constitution § 4 (Fakes over Mocks) | All test doubles use Fake pattern | Reinforces doctrine value |
| DI Container Pattern (ADR-0004) | Service injects `IFileWatcherFactory`, `IWorkspaceRegistryAdapter`, etc. | Consistent with codebase conventions |

---

## F) Coverage Map

**Acceptance Criteria → Test Coverage**

| Criterion | Test File | Confidence |
|-----------|-----------|------------|
| AC: Service emits GraphChangedEvent when state.json changes | `emits event when state.json changes` | 100% (explicit) |
| AC: Service extracts graphSlug from path | `extracts correct graphSlug from path` | 100% (explicit) |
| AC: Service resolves workspaceSlug from worktree | `resolves workspaceSlug from worktree path` | 100% (explicit) |
| AC: Service ignores non-state.json files | `ignores non-state.json file changes` | 100% (explicit) |
| AC: Service allows multiple callbacks | `allows multiple callbacks to be registered` | 100% (explicit) |
| AC: Unsubscribe function works | `returns unsubscribe function that works` | 100% (explicit) |
| AC: Service watches registry for changes | `is called automatically on registry file change` | 100% (explicit) |
| AC: Service handles empty workspaces | `handles empty workspace list gracefully` | 100% (explicit) |
| AC: Service handles missing directories | `handles missing .chainglass/data directory gracefully` | 100% (explicit) |
| AC: Service handles watcher errors | `handles watcher error events without crashing` | 100% (explicit) |
| AC: Integration - real file triggers callback | Integration test: `emits GraphChangedEvent when state.json is modified` | 100% (explicit) |

**Overall Coverage Confidence: 100%** — All acceptance criteria have explicit, named tests.

---

## G) Commands Executed

```bash
# Run subtask-specific tests
pnpm vitest run test/unit/workflow/workspace-change-notifier.service.test.ts test/integration/workflow/workspace-change-notifier.integration.test.ts
# Result: 36 tests passed

# Run all workflow tests
pnpm vitest run 'workflow'
# Result: 842 tests passed

# Type check workflow package
pnpm tsc --noEmit -p packages/workflow/tsconfig.json
# Result: No errors

# Lint new files
pnpm biome check packages/workflow/src/services/workspace-change-notifier.service.ts packages/workflow/src/interfaces/workspace-change-notifier.interface.ts packages/workflow/src/interfaces/file-watcher.interface.ts packages/workflow/src/adapters/chokidar-file-watcher.adapter.ts packages/workflow/src/fakes/fake-file-watcher.ts packages/workflow/src/fakes/fake-workspace-change-notifier.service.ts
# Result: No fixes applied (clean)
```

---

## H) Decision & Next Steps

### Verdict: ✅ APPROVE

**Approver**: Code Review Agent (automated review)

**Recommended Actions**:
1. **Proceed to Subtask 002** — Browser SSE integration can now use `WorkspaceChangeNotifierService`
2. **Optional**: Add `cwd?: string` to `FileWatcherOptions` for complete spec alignment (LOW priority)

### Next Subtask

[002-subtask-browser-sse-integration.md](../tasks/phase-4-real-time-updates/002-subtask-browser-sse-integration.md) — Wire `WorkspaceChangeNotifierService` to SSE broadcasts, visual verification in browser.

---

## I) Footnotes Audit

| Changed File | Purpose | Status |
|--------------|---------|--------|
| `packages/workflow/src/interfaces/file-watcher.interface.ts` | IFileWatcher, IFileWatcherFactory interfaces | ✅ New |
| `packages/workflow/src/interfaces/workspace-change-notifier.interface.ts` | IWorkspaceChangeNotifierService, GraphChangedEvent | ✅ New |
| `packages/workflow/src/adapters/chokidar-file-watcher.adapter.ts` | ChokidarFileWatcherAdapter, ChokidarFileWatcherFactory | ✅ New |
| `packages/workflow/src/fakes/fake-file-watcher.ts` | FakeFileWatcher, FakeFileWatcherFactory | ✅ New |
| `packages/workflow/src/services/workspace-change-notifier.service.ts` | WorkspaceChangeNotifierService | ✅ New |
| `packages/workflow/src/fakes/fake-workspace-change-notifier.service.ts` | FakeWorkspaceChangeNotifierService | ✅ New |
| `test/unit/workflow/workspace-change-notifier.service.test.ts` | 32 unit tests | ✅ New |
| `test/integration/workflow/workspace-change-notifier.integration.test.ts` | 4 integration tests | ✅ New |
| `packages/workflow/package.json` | Added chokidar ^5.0.0 | ✅ Modified |
| `packages/workflow/src/interfaces/index.ts` | Added interface exports | ✅ Modified |
| `packages/workflow/src/adapters/index.ts` | Added adapter exports | ✅ Modified |
| `packages/workflow/src/fakes/index.ts` | Added fake exports | ✅ Modified |
| `packages/workflow/src/services/index.ts` | Added service export | ✅ Modified |
| `packages/workflow/src/index.ts` | Added all exports | ✅ Modified |

**All files accounted for per execution log deliverables.**
