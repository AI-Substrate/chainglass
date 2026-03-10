# Fix Tasks: Phase 6: PR View Live Updates + Branch Mode

Apply in order. Re-run review after fixes.

## Critical / High Fixes

### FT-001: Always re-fetch on mode switch
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-pr-view/hooks/use-pr-view-data.ts
- **Issue**: The mode-change effect only refetches when `data` already exists, so switching to Branch during the initial load can leave the overlay showing stale Working-mode data.
- **Fix**: Remove the `data` guard from the mode-change effect, depend on the actual fetch callback / worktree path, and make sure a mode switch always launches a fresh fetch that can supersede the in-flight Working request.
- **Patch hint**:
  ```diff
  -  useEffect(() => {
  -    if (worktreePath && data) {
  -      fetchData(true);
  -    }
  -  }, [mode]);
  +  useEffect(() => {
  +    if (worktreePath) {
  +      fetchData(true);
  +    }
  +  }, [mode, worktreePath, fetchData]);
  ```

### FT-002: Replace synthetic Phase 6 tests with behavioral coverage
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/071-pr-view/test/unit/web/features/071-pr-view/pr-view-mode-switch.test.ts; /Users/jordanknight/substrate/071-pr-view/test/unit/web/features/071-pr-view/pr-view-live-updates.test.ts
- **Issue**: The new tests restate local boolean/state logic instead of executing `usePRViewData`, `PRViewHeader`, `PRViewPanelContent`, `FileChangeProvider`, or `useFileChanges`, so they do not verify AC-10 / AC-14b and miss the F001 regression.
- **Fix**: Add lightweight behavioral tests that mount the real hook/component path, verify the selected mode drives the fetch path, and verify file-change events trigger refresh + invalidation in the rendered panel. Keep the tests aligned with the project's no-mocks / Test Doc expectations as far as the implementation allows.
- **Patch hint**:
  ```diff
  -describe('PR View mode switching logic', () => {
  -  it('switchMode changes mode from working to branch', () => {
  -    let mode: ComparisonMode = 'working';
  -    ...
  -  });
  -});
  +describe('usePRViewData / PRViewPanelContent', () => {
  +  it('refetches branch data when the user switches to Branch mode', async () => {
  +    const harness = renderRealPRViewHarness(/* worktree + fake data source */);
  +    await harness.switchMode('branch');
  +    expect(harness.lastRequestedMode()).toBe('branch');
  +  });
  +
  +  it('refreshes when a file-change event is emitted', async () => {
  +    const harness = renderRealPRViewHarness(/* provider + panel */);
  +    harness.emitFileChange('src/example.ts');
  +    await harness.expectRefresh();
  +  });
  +});
  ```

## Medium / Low Fixes

### FT-003: Update the domain map for the new events dependency
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/071-pr-view/docs/domains/domain-map.md
- **Issue**: Phase 6 introduced `pr-view` consumption of `_platform/events` (`FileChangeProvider`, `useFileChanges`), but the map still omits that edge and the health summary rows are stale.
- **Fix**: Add a labeled `prView --> events` edge and update the `_platform/events` and `pr-view` rows in the health summary table.
- **Patch hint**:
  ```diff
   prView -->|"getWorkingChanges()"| fileBrowser
   prView -->|"requireAuth()<br/>auth()"| auth
   prView -->|"DiffViewer"| viewer
   prView -->|"overlay anchor"| panels
   prView -->|"registerPRViewSDK()"| sdk
  +prView -->|"FileChangeProvider<br/>useFileChanges"| events
  ```

### FT-004: Correct PR View and Events domain documentation
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/071-pr-view/docs/domains/pr-view/domain.md; /Users/jordanknight/substrate/071-pr-view/docs/domains/_platform/events/domain.md
- **Issue**: The PR View domain doc still says live updates are not owned, and the Events domain doc still omits `pr-view` as a consumer.
- **Fix**: Update the ownership/dependency prose so both domain docs reflect the implemented Phase 6 live-update relationship.
- **Patch hint**:
  ```diff
   ### Does NOT Own
  -- SSE/live update integration (Phase 6)
   - File tree indicators (Phase 7)

   ### Domains That Depend On This
  -- (Phase 6) pr-view live updates — consumes aggregator for SSE refresh
  +- file-browser (Phase 7) — reviewed-state indicators in file tree
  +
  +### Domains That Depend On This (_platform/events)
  +- file-browser — uses toast(), useFileChanges, FileChangeProvider for live file updates
  +- pr-view — uses FileChangeProvider and useFileChanges for overlay auto-refresh
  ```

### FT-005: Consolidate or explicitly accept duplicate FileChangeProvider placement
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/071-pr-view/apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx; /Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-pr-view/components/pr-view-overlay-panel.tsx; /Users/jordanknight/substrate/071-pr-view/apps/web/app/(dashboard)/workspaces/[slug]/pr-view-overlay-wrapper.tsx
- **Issue**: The browser and PR View overlay can each mount their own `FileChangeProvider`, which is a deviation from T003's planned single shared SSE connection per workspace.
- **Fix**: Prefer a single provider in an existing client wrapper that covers both browser content and the overlay panel, or explicitly document why the duplicate-provider trade-off is intentional and acceptable.
- **Patch hint**:
  ```diff
  -  return (
  -    <FileChangeProvider worktreePath={worktreePath}>
  -      <BrowserClientInner ... />
  -    </FileChangeProvider>
  -  );
  +  return <BrowserClientInner ... />;
  ```
  ```diff
  -    <PRViewOverlayProvider defaultWorktreePath={defaultWorktreePath}>
  +    <PRViewOverlayProvider defaultWorktreePath={defaultWorktreePath}>
  +      <FileChangeProvider worktreePath={defaultWorktreePath ?? ''}>
         {children}
         <PRViewOverlayErrorBoundary>
           <PRViewOverlayPanel />
         </PRViewOverlayErrorBoundary>
  +      </FileChangeProvider>
       </PRViewOverlayProvider>
  ```

## Re-Review Checklist

- [ ] All critical/high fixes applied
- [ ] Domain artifacts updated for the new `_platform/events` dependency
- [ ] Re-run `/plan-7-v2-code-review --plan /Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/pr-view-plan.md --phase "Phase 6: PR View Live Updates + Branch Mode"` and achieve zero HIGH/CRITICAL
