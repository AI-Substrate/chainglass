# Code Review: Phase 3 — UI Wiring

**Plan**: `/home/jak/substrate/041-file-browser/docs/plans/045-live-file-events/live-file-events-plan.md`
**Spec**: `/home/jak/substrate/041-file-browser/docs/plans/045-live-file-events/live-file-events-spec.md`
**Phase**: Phase 3: UI Wiring
**Date**: 2026-02-24
**Reviewer**: Automated (plan-7-v2)
**Testing Approach**: Full TDD

## A) Verdict

**REQUEST_CHANGES**

1 bug (diff-mode banner silently suppressed), 3 missing test tasks, and domain.md not updated for Plan 045.

**Key failure areas** (one sentence each):
- **Implementation**: Diff-mode "externally changed" banner is silently suppressed because `externallyChanged` is gated on `isDirty`, which is false in diff mode with clean edits.
- **Domain compliance**: file-browser `domain.md` not updated for Plan 045 — missing history entry, `_platform/events` dependency, and `useTreeDirectoryChanges` in composition.
- **Testing**: 3 Phase 3 test tasks (T001, T002, T003) produced zero new test cases, violating the Full TDD requirement.
- **Doctrine**: `expandedDirs` computed from ref during render creates a new array identity every render, defeating `useMemo` in `useTreeDirectoryChanges`.

## B) Summary

The Phase 3 implementation correctly wires the event hub into the file browser UI — FileChangeProvider wrapping, useFileChanges subscriptions, tree animation, blue banners, and double-event suppression are all structurally sound. However, there is one bug where the diff-mode banner never shows when the user has no dirty edits (the prop is gated on `isDirty` which is false in diff mode). The testing gap is significant: all three Phase 3-specific test tasks produced no test cases despite a Full TDD mandate. Domain compliance has documentation-only gaps — all imports use contract barrels correctly and dependency direction is valid.

## C) Checklist

**Testing Approach: Full TDD**

- [ ] useTreeDirectoryChanges unit test exists (T001)
- [ ] FileTree newlyAddedPaths test case exists (T002/T007)
- [ ] FileViewerPanel externallyChanged banner test exists (T003/T007)
- [ ] RED→GREEN evidence for new tests
- [x] Only in-scope files changed
- [x] Existing tests pass (per execution log)
- [x] Domain compliance imports correct (contract barrels)

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | HIGH | browser-client.tsx:349 | correctness | Diff-mode banner silently suppressed — `externallyChanged && isDirty` is false in diff mode with clean edits | Change to `externallyChanged && (isDirty \|\| mode === 'diff')` |
| F002 | HIGH | (missing file) | testing | T001 test missing: use-tree-directory-changes.test.tsx not created | Write unit test with FakeFileChangeHub |
| F003 | HIGH | file-tree.test.tsx | testing | T002 test missing: no newlyAddedPaths test case | Add test for tree-entry-new class |
| F004 | HIGH | file-viewer-panel.test.tsx | testing | T003 test missing: no externallyChanged banner test | Add blue banner + Refresh tests |
| F005 | HIGH | domain.md | domain-md | file-browser domain.md missing Plan 045 history | Append history row |
| F006 | MEDIUM | browser-client.tsx:113 | performance | expandedDirs array identity changes every render (stale ref during render) | Track via state callback instead of ref read |
| F007 | MEDIUM | browser-client.tsx:157-168 | correctness | Suppression timer overlap on rapid saves | Use Map per path, clear previous timer |
| F008 | MEDIUM | browser-client.tsx:129-154 | correctness | biome-ignore suppressions omit callback deps — fragile | Document which deps are stable and why |
| F009 | MEDIUM | domain.md | domain-md | Missing _platform/events dependency | Add to domain.md § Dependencies |
| F010 | MEDIUM | domain.md | domain-md | Missing useTreeDirectoryChanges in composition | Add to domain.md § Composition |
| F011 | MEDIUM | execution.log.md | testing | Full TDD approach violated — no test-first evidence | Write tests for T001/T002/T003 |
| F012 | LOW | file-viewer-panel.tsx:197 | correctness | Redundant `editContent != null` guard (already gated upstream) | Remove or document intentional defense-in-depth |
| F013 | LOW | domain.md | domain-md | Missing use-tree-directory-changes.ts in source location table | Add source location row |
| F014 | LOW | domain-map.md | map-nodes | Events node label omits FileChangeProvider | Update node label |
| F015 | LOW | globals.css:306 | pattern | Hardcoded rgba color in animation, project uses CSS custom properties | Use `--status-success` with alpha |
| F016 | LOW | file-tree.tsx:201-302 | pattern | Template literals for className instead of cn()/twMerge() | Matches existing file pattern — no action needed for Phase 3 |

## E) Detailed Findings

### E.1) Implementation Quality

**F001 — HIGH — Diff-mode banner silently broken**
File: `/home/jak/substrate/041-file-browser/apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx:349`

The `externallyChanged` prop is computed as `externallyChanged && isDirty` (line 349). In diff mode with no dirty edits, `isDirty` (`editContent != null`) is false, so the prop is false and the diff-mode banner in FileViewerPanel (line 209) never renders. The auto-refresh effect (line 130-136) also doesn't handle diff mode. Result: external file changes in diff mode with clean edits are silently swallowed.

**Fix**: `externallyChanged={externallyChanged && (isDirty || mode === 'diff')}`

**F006 — MEDIUM — expandedDirs stale ref during render**
File: `/home/jak/substrate/041-file-browser/apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx:113`

`treeRef.current?.getExpandedDirs() ?? []` is called during render, producing a new `[]` array every render (and `null` on first render before the ref is attached). This array is passed to `useTreeDirectoryChanges`, where it's a `useMemo` dependency (line 76 of the hook). Since identity always changes, the memo recomputes every render.

**Fix**: Track expanded dirs via a state callback (e.g., `onExpandedDirsChange`) from FileTree, or use `useMemo` with a serialized comparison key.

**F007 — MEDIUM — Timer overlap on rapid saves**
File: `/home/jak/substrate/041-file-browser/apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx:157-168`

Each save creates an independent `setTimeout`. If the user saves at t=0 then t=1s, the first timer fires at t=2s and removes the path — leaving a gap from t=2s to t=3s where the second save's window should still be active. Also: timers not cleaned up on unmount (benign but inconsistent).

**Fix**: Use `Map<string, ReturnType<typeof setTimeout>>` to clear previous timer on re-save.

**F008 — MEDIUM — Fragile biome-ignore suppressions**
File: `/home/jak/substrate/041-file-browser/apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx:129-154`

Three `useEffect` blocks suppress exhaustive-deps and omit `handleRefreshFile`, `clearChanges`, `handleExpand`, `handleRefreshChanges`, and `clearAll`. Currently safe if all are stable references, but fragile to upstream refactoring.

**Fix**: Add inline comments documenting which deps are omitted and why they're stable.

**F012 — LOW — Redundant editContent guard**
File: `/home/jak/substrate/041-file-browser/apps/web/src/features/041-file-browser/components/file-viewer-panel.tsx:197`

`externallyChanged && mode === 'edit' && editContent != null` — the `editContent != null` check is already guaranteed by the upstream prop computation (`externallyChanged && isDirty` where `isDirty = editContent != null`). Not a bug, but obscures the invariant.

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ✅ | `use-tree-directory-changes.ts` correctly in `features/041-file-browser/hooks/` |
| Contract-only imports | ✅ | All cross-domain imports use `@/features/045-live-file-events` barrel |
| Dependency direction | ✅ | file-browser → events (business → infrastructure) |
| Domain.md updated | ❌ | Missing history, dependency, composition, source location entries (F005, F009, F010, F013) |
| Registry current | ✅ | No new domains created |
| No orphan files | ✅ | All files map to domains in manifest |
| Map nodes current | ⚠️ | Events node label missing FileChangeProvider (F014) |
| Map edges current | ✅ | All edges labeled with contracts |
| No circular business deps | ✅ | file-browser is the only business domain |

**F005 — HIGH** — `docs/domains/file-browser/domain.md` § History has no Plan 045 entry.
**F009 — MEDIUM** — § Dependencies missing `_platform/events` (FileChangeProvider, useFileChanges).
**F010 — MEDIUM** — § Composition missing `useTreeDirectoryChanges` hook.
**F013 — LOW** — § Source Location missing `use-tree-directory-changes.ts`.
**F014 — LOW** — `domain-map.md` events node label omits `FileChangeProvider`.

### E.3) Anti-Reinvention

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| useTreeDirectoryChanges | Minor overlap with createMatcher directory pattern | events | ✅ Proceed — different shape (multi-dir batch filter vs single-pattern) |
| FileTree forwardRef + getExpandedDirs | ExplorerPanel uses useImperativeHandle (different purpose) | panel-layout | ✅ Proceed — standard React pattern, not duplication |
| FileViewerPanel externallyChanged banner | None | N/A | ✅ Proceed — novel UI component |

No genuine reinvention found.

### E.4) Testing & Evidence

**Coverage confidence**: 28%

| AC | Confidence | Evidence |
|----|------------|----------|
| AC-14 | 30% | Code: useTreeDirectoryChanges + BrowserClient wiring. No test. |
| AC-15 | 25% | Code: removedPaths returned from hook. No test. |
| AC-16 | 30% | Code: changedFiles prop pre-exists (amber text). No test for event-driven update. |
| AC-17 | 20% | Code: forwardRef + expandedDirs preserved. No test. |
| AC-17a | 70% | Code: Refresh button pre-exists. Pre-existing test passes. |
| AC-18 | 40% | Code: CSS animation + tree-entry-new class. No test for class application. |
| AC-19 | 35% | Code: Blue banner rendered in edit mode. No test. |
| AC-20 | 30% | Code: Banner shows Refresh (not auto-replace). Implicit. No test. |
| AC-21 | 25% | Code: Auto-refresh useEffect for preview mode. No test. |
| AC-22 | 35% | Code: Diff-mode banner rendered. No test. (Also blocked by F001 bug.) |
| AC-23 | 15% | Code: scrollRef exists. No scroll-preservation evidence. |
| AC-24 | 30% | Code: suppressedPathsRef + 2s window. No test. |
| AC-25 | 25% | Code: Path cleared after 2s. No test. |
| AC-26 | 15% | Indirect: FileChangeProvider cleanup in Phase 2. No Phase 3 test. |
| AC-27 | 10% | Server-side concern, Phase 1 responsibility. No Phase 3 evidence needed. |

**F002 — HIGH**: `use-tree-directory-changes.test.tsx` does not exist. Hook implemented with no unit test.
**F003 — HIGH**: `file-tree.test.tsx` has zero tests for `newlyAddedPaths` prop.
**F004 — HIGH**: `file-viewer-panel.test.tsx` has zero tests for `externallyChanged` prop.
**F011 — MEDIUM**: Full TDD approach violated — no RED→GREEN evidence for any Phase 3 feature.

### E.5) Doctrine Compliance

**F006** (covered in E.1): Ref-during-render anti-pattern violates React conventions.
**F015 — LOW**: `globals.css` animation uses hardcoded `rgba(34, 197, 94, 0.2)` instead of CSS custom property.
**F016 — LOW**: FileTree uses template literal concatenation instead of `cn()`/`twMerge()`. Matches existing file pattern — no action needed for Phase 3.

## F) Coverage Map

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| AC-14 | File created → entry appears sorted | Code only (hook + wiring) | 30% |
| AC-15 | File deleted → entry disappears | Code only (removedPaths) | 25% |
| AC-16 | File modified → amber indicator | Code only (pre-existing changedFiles prop) | 30% |
| AC-17 | Scroll + expand preserved | Code only (forwardRef) | 20% |
| AC-17a | Manual refresh fallback | Pre-existing test | 70% |
| AC-18 | Green fade-in animation | Code only (CSS + class) | 40% |
| AC-19 | Edit mode blue banner + Refresh | Code only (BLOCKED by F001 in diff mode) | 35% |
| AC-20 | Unsaved content not replaced | Implicit in conditional rendering | 30% |
| AC-21 | Preview auto-refresh (no banner) | Code only (useEffect) | 25% |
| AC-22 | Diff mode stale banner | Code only (BLOCKED by F001) | 35% |
| AC-23 | Preview scroll preservation | No evidence | 15% |
| AC-24 | Save → no false banner ~2s | Code only (suppressedPathsRef) | 30% |
| AC-25 | External change after window → banner | Code only (timer clears path) | 25% |
| AC-26 | Navigate away → SSE closes | Indirect (Phase 2 cleanup) | 15% |
| AC-27 | Close tab → server cleanup 30s | Phase 1 responsibility | 10% |

**Overall coverage confidence**: 28%

## G) Commands Executed

```bash
# Diff computation
git --no-pager diff 05667d1..5603fae -- \
  'apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx' \
  'apps/web/app/globals.css' \
  'apps/web/src/features/041-file-browser/components/file-tree.tsx' \
  'apps/web/src/features/041-file-browser/components/file-viewer-panel.tsx' \
  'apps/web/src/features/041-file-browser/hooks/use-tree-directory-changes.ts' \
  'docs/plans/045-live-file-events/tasks/phase-3-ui-wiring/execution.log.md'

# Git log for phase identification
git --no-pager log --oneline -20

# Test execution (via subagent)
pnpm vitest run test/unit/web/features/041-file-browser/file-tree.test.tsx --reporter=verbose
pnpm vitest run test/unit/web/features/041-file-browser/file-viewer-panel.test.tsx --reporter=verbose
```

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review —
> only context on the work that was done before the review.

**Review result**: REQUEST_CHANGES

**Plan**: `/home/jak/substrate/041-file-browser/docs/plans/045-live-file-events/live-file-events-plan.md`
**Spec**: `/home/jak/substrate/041-file-browser/docs/plans/045-live-file-events/live-file-events-spec.md`
**Phase**: Phase 3: UI Wiring
**Tasks dossier**: `/home/jak/substrate/041-file-browser/docs/plans/045-live-file-events/tasks/phase-3-ui-wiring/tasks.md`
**Execution log**: `/home/jak/substrate/041-file-browser/docs/plans/045-live-file-events/tasks/phase-3-ui-wiring/execution.log.md`
**Review file**: `/home/jak/substrate/041-file-browser/docs/plans/045-live-file-events/reviews/review.phase-3-ui-wiring.md`

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| `/home/jak/substrate/041-file-browser/apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx` | Modified | file-browser | Fix F001 (diff-mode banner), F006 (expandedDirs), F007 (timer overlap) |
| `/home/jak/substrate/041-file-browser/apps/web/app/globals.css` | Modified | global | Optional: F015 (CSS custom property) |
| `/home/jak/substrate/041-file-browser/apps/web/src/features/041-file-browser/components/file-tree.tsx` | Modified | file-browser | No code fix needed |
| `/home/jak/substrate/041-file-browser/apps/web/src/features/041-file-browser/components/file-viewer-panel.tsx` | Modified | file-browser | No code fix needed |
| `/home/jak/substrate/041-file-browser/apps/web/src/features/041-file-browser/hooks/use-tree-directory-changes.ts` | Created | file-browser | No code fix needed |
| `/home/jak/substrate/041-file-browser/test/unit/web/features/045-live-file-events/use-tree-directory-changes.test.tsx` | Missing | test | Create (F002) |
| `/home/jak/substrate/041-file-browser/test/unit/web/features/041-file-browser/file-tree.test.tsx` | Existing | test | Add newlyAddedPaths tests (F003) |
| `/home/jak/substrate/041-file-browser/test/unit/web/features/041-file-browser/file-viewer-panel.test.tsx` | Existing | test | Add externallyChanged tests (F004) |
| `/home/jak/substrate/041-file-browser/docs/domains/file-browser/domain.md` | Existing | docs | Update history, deps, composition, source (F005, F009, F010, F013) |

### Required Fixes (if REQUEST_CHANGES)

| # | File (absolute path) | What To Fix | Why |
|---|---------------------|-------------|-----|
| 1 | `/home/jak/substrate/041-file-browser/apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx:349` | Change `externallyChanged && isDirty` to `externallyChanged && (isDirty \|\| mode === 'diff')` | F001: Diff-mode banner never shows with clean edits |
| 2 | `/home/jak/substrate/041-file-browser/test/unit/web/features/045-live-file-events/use-tree-directory-changes.test.tsx` | Create unit test with FakeFileChangeHub | F002: T001 test missing |
| 3 | `/home/jak/substrate/041-file-browser/test/unit/web/features/041-file-browser/file-tree.test.tsx` | Add test: render with `newlyAddedPaths`, assert `tree-entry-new` class | F003: T002 test missing |
| 4 | `/home/jak/substrate/041-file-browser/test/unit/web/features/041-file-browser/file-viewer-panel.test.tsx` | Add tests: blue banner in edit mode (dirty), diff mode, no banner in preview, Refresh click | F004: T003 test missing |
| 5 | `/home/jak/substrate/041-file-browser/docs/domains/file-browser/domain.md` | Append Plan 045 history, add _platform/events dependency, add useTreeDirectoryChanges to composition + source location | F005, F009, F010, F013 |

### Domain Artifacts to Update (if any)

| File (absolute path) | What's Missing |
|---------------------|----------------|
| `/home/jak/substrate/041-file-browser/docs/domains/file-browser/domain.md` | § History: Plan 045 entry. § Dependencies: _platform/events. § Composition: useTreeDirectoryChanges. § Source Location: use-tree-directory-changes.ts |
| `/home/jak/substrate/041-file-browser/docs/domains/domain-map.md` | Events node label: add FileChangeProvider (LOW priority) |

### Next Step

Apply fixes from fix-tasks file, then re-run review:
```
/plan-6-v2-implement-phase --plan /home/jak/substrate/041-file-browser/docs/plans/045-live-file-events/live-file-events-plan.md --phase "Phase 3: UI Wiring"
```
Then:
```
/plan-7-v2-code-review --plan /home/jak/substrate/041-file-browser/docs/plans/045-live-file-events/live-file-events-plan.md --phase "Phase 3: UI Wiring"
```
