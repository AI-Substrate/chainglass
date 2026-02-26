# Fix Tasks: Simple Implementation

Apply in order. Re-run review after fixes.

## Critical / High Fixes

### FT-001: Restore FlowSpace keyboard delegation in ExplorerPanel
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/_platform/panel-layout/components/explorer-panel.tsx
- **Issue**: `symbols`/`semantic` modes are not included in dropdown key delegation, so Enter can hit fallback submit behavior.
- **Fix**: Add FlowSpace result-mode delegation (`ArrowUp`, `ArrowDown`, `Enter`) and prevent fallback handler-chain submit for prefixed FlowSpace queries.
- **Patch hint**:
  ```diff
  + const flowspaceHasResults =
  +   (dropdownMode === 'symbols' || dropdownMode === 'semantic') &&
  +   Array.isArray(symbolSearchResults) &&
  +   symbolSearchResults.length > 0;
  ...
  - if (searchHasResults) {
  + if (searchHasResults || flowspaceHasResults) {
      if (['ArrowDown', 'ArrowUp', 'Enter'].includes(e.key)) {
        dropdownRef.current?.handleKeyDown(e);
        return;
      }
    }
  ...
  + if ((symbolMode || semanticMode) && e.key === 'Enter') {
  +   e.preventDefault();
  +   return;
  + }
  ```

### FT-002: Unskip and complete FlowSpace action tests
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/chainglass-048/test/unit/web/features/041-file-browser/flowspace-search-action.test.ts
- **Issue**: Core test suites are `describe.skip`, leaving parsing/availability/error contracts unverified.
- **Fix**: Convert skipped suites to active suites and add assertions for required scenarios (valid parse, ENOENT, missing graph, timeout/error, malformed JSON).
- **Patch hint**:
  ```diff
  - describe.skip('FlowSpace search action — JSON parsing (requires fs2)', () => {
  + describe('FlowSpace search action — JSON parsing', () => {
  ...
  - describe.skip('FlowSpace search action — availability detection (requires fs2)', () => {
  + describe('FlowSpace search action — availability detection', () => {
  ```

### FT-003: Replace non-behavioral stub-removal test
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/chainglass-048/test/unit/web/features/panel-layout/stub-handlers.test.ts
- **Issue**: Current test is tautological (`expect(true).toBe(true)`), so it does not protect regressions.
- **Fix**: Either remove this file or replace with meaningful assertions proving current behavior (for example, no `createSymbolSearchStub` export and FlowSpace path handling).
- **Patch hint**:
  ```diff
  - it('createSymbolSearchStub was removed in Plan 051', () => {
  -   expect(true).toBe(true);
  - });
  + it('does not export createSymbolSearchStub from panel-layout barrel', async () => {
  +   const panelLayout = await import(
  +     '@/features/_platform/panel-layout'
  +   );
  +   expect('createSymbolSearchStub' in panelLayout).toBe(false);
  + });
  ```

### FT-004: Add concrete execution evidence for AC verification
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/chainglass-048/docs/plans/051-flowspace-search/tasks/simple-implementation/execution.log.md
- **Issue**: Execution log contains no validation evidence.
- **Fix**: Add timestamped entries with exact commands, exit status, and key output snippets proving AC-critical behavior and test runs.
- **Patch hint**:
  ```diff
   # Execution Log — Simple Implementation
  ...
  + ## 2026-02-26 Validation
  + - Command: pnpm vitest test/unit/web/features/041-file-browser/flowspace-search-action.test.ts
  + - Result: PASS (N tests)
  + - Evidence: [paste key output lines]
  + - ACs covered: AC-12, AC-13, AC-14, AC-18
  +
  + - Command: just fft
  + - Result: PASS
  + - Evidence: [paste summary output]
  ```

### FT-005: Repair domain traceability artifacts for Plan 051
- **Severity**: HIGH
- **File(s)**:
  - /Users/jordanknight/substrate/chainglass-048/docs/plans/051-flowspace-search/flowspace-search-plan.md
  - /Users/jordanknight/substrate/chainglass-048/docs/domains/_platform/panel-layout/domain.md
- **Issue**: Changed artifacts are not fully mapped in plan/domain records; panel-layout contract docs remain stale.
- **Fix**: Update Plan 051 Domain Manifest for changed files and update panel-layout domain contracts/history to reflect current post-stub, FlowSpace-enabled surface.
- **Patch hint**:
  ```diff
   ## Domain Manifest
  + | `test/unit/web/features/panel-layout/stub-handlers.test.ts` | _platform/panel-layout | internal | Regression coverage for post-stub behavior |
  ...
   ## Contracts (Public Interface)
  - | `createSymbolSearchStub` | Factory | ... |
  + | `FlowSpaceSearchMode` | Type | file-browser | FlowSpace query mode (`text`/`semantic`) |
  + | `FlowSpaceAvailability` | Type | file-browser | FlowSpace availability states |
  ```

## Medium / Low Fixes

### FT-006: Update remaining domain docs to current Plan 051 state
- **Severity**: MEDIUM
- **File(s)**:
  - /Users/jordanknight/substrate/chainglass-048/docs/domains/file-browser/domain.md
  - /Users/jordanknight/substrate/chainglass-048/docs/domains/domain-map.md
- **Issue**: File-browser history/composition and panel-layout domain-map contract labels are stale.
- **Fix**: Add Plan 051 history/composition notes and refresh domain-map contract labels/health table entries.
- **Patch hint**:
  ```diff
   | Plan | What Changed | Date |
  +| Plan 051 | BrowserClient FlowSpace wiring (#/$ query integration) | 2026-02-26 |
  ...
  - _platform/panel-layout | PanelShell, ExplorerPanel, ... AsciiSpinner |
  + _platform/panel-layout | PanelShell, ExplorerPanel, ... AsciiSpinner, FlowSpaceSearchMode, FlowSpaceAvailability, FlowSpaceSearchResult |
  ```

### FT-007: Raise AC evidence confidence for interactive paths
- **Severity**: MEDIUM
- **File(s)**:
  - /Users/jordanknight/substrate/chainglass-048/test/unit/web/features/041-file-browser/flowspace-search-action.test.ts
  - /Users/jordanknight/substrate/chainglass-048/docs/plans/051-flowspace-search/tasks/simple-implementation/execution.log.md
- **Issue**: AC-01/04/05/06/15/16/17/20 evidence remains weak.
- **Fix**: Add focused automated/manual verification artifacts for keyboard behavior, debounce behavior, and result-header details.
- **Patch hint**:
  ```diff
  + it('delegates Enter selection in symbols/semantic dropdown mode', () => {
  +   // behavior assertion
  + });
  +
  + ## Manual Verification
  + - Typed '# useFileFilter' and '$ error handling'
  + - Verified key nav, mode badge, graph age, folder distribution
  + - Captured observed outcomes
  ```

## Re-Review Checklist

- [ ] All critical/high fixes applied
- [ ] Domain manifest and domain docs updated for Plan 051
- [ ] Execution log includes concrete evidence and quality-gate output
- [ ] Re-run `/plan-7-v2-code-review` and achieve zero HIGH/CRITICAL
