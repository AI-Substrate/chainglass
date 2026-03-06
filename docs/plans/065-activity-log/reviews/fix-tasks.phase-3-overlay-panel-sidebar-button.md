# Fix Tasks: Phase 3: Overlay Panel + Sidebar Button

Apply in order. Re-run review after fixes.

## Critical / High Fixes

### FT-001: Restore full overlay mutual exclusion
- **Severity**: HIGH
- **File(s)**: `/Users/jak/substrate/059-fix-agents-tmp/apps/web/src/hooks/use-agent-overlay.tsx`
- **Issue**: `openAgent()` and `toggleAgent()` never dispatch `overlay:close-all`, so the agent overlay can open on top of terminal/activity-log overlays.
- **Fix**: Mirror the terminal/activity-log provider pattern: add an `isOpeningRef`, dispatch `overlay:close-all` before opening/toggling to a different agent, and skip self-close in the `overlay:close-all` listener.
- **Patch hint**:
  ```diff
  - import { type ReactNode, createContext, useCallback, useContext, useEffect, useState } from 'react';
  + import { type ReactNode, createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
  + const isOpeningRef = useRef(false);
  + const openAgent = useCallback((agentId: string) => {
  +   isOpeningRef.current = true;
  +   window.dispatchEvent(new CustomEvent('overlay:close-all'));
  +   isOpeningRef.current = false;
  +   setActiveAgentId(agentId);
  + }, []);
  - const handler = () => closeAgent();
  + const handler = () => {
  +   if (isOpeningRef.current) return;
  +   closeAgent();
  + };
  ```

### FT-002: Replace pseudo-tests with real UI verification
- **Severity**: HIGH
- **File(s)**: `/Users/jak/substrate/059-fix-agents-tmp/test/unit/web/features/065-activity-log/activity-log-overlay.test.ts`
- **Issue**: The test file only re-implements helper logic and fixture math; it never renders `ActivityLogEntryList` / overlay components, so the shipped UI is not directly verified.
- **Fix**: Write lightweight DOM tests against the real components (entries render, gap separator appears/does not appear, empty state renders, Escape/mutual exclusion behavior is verified at the provider level where feasible) and add a full `Test Doc:` block to every test.
- **Patch hint**:
  ```diff
  - function hasGap(a: string, b: string): boolean { ... }
  - expect(hasGap(...)).toBe(true)
  + render(<ActivityLogEntryList entries={FIXTURE_WITH_GAP} />)
  + expect(screen.getByTestId('activity-log-gap')).toBeInTheDocument()
  + expect(screen.getByText('Morning session')).toBeInTheDocument()
  + /*
  + Test Doc:
  + - Why: ...
  + - Contract: ...
  + - Usage Notes: ...
  + - Quality Contribution: ...
  + - Worked Example: ...
  + */
  ```

## Medium / Low Fixes

### FT-003: Gate the sidebar Activity toggle by worktree context
- **Severity**: MEDIUM
- **File(s)**: `/Users/jak/substrate/059-fix-agents-tmp/apps/web/src/components/dashboard-sidebar.tsx`
- **Issue**: The Activity button is shown even when no worktree is selected, which misses AC-06.
- **Fix**: Render the footer button only when `currentWorktree` is present, or move the action into the existing worktree-scoped Tools group.
- **Patch hint**:
  ```diff
  - <SidebarMenuItem>
  -   <SidebarMenuButton onClick={() => window.dispatchEvent(new CustomEvent('activity-log:toggle'))}>
  + {currentWorktree && (
  +   <SidebarMenuItem>
  +     <SidebarMenuButton onClick={() => window.dispatchEvent(new CustomEvent('activity-log:toggle'))}>
        <ScrollText className="h-5 w-5" />
        {!isCollapsed && <span>Activity</span>}
  -   </SidebarMenuButton>
  - </SidebarMenuItem>
  +     </SidebarMenuButton>
  +   </SidebarMenuItem>
  + )}
  ```

### FT-004: Remove or formally justify the extra ExplorerPanel toggle
- **Severity**: MEDIUM
- **File(s)**: `/Users/jak/substrate/059-fix-agents-tmp/apps/web/src/features/_platform/panel-layout/components/explorer-panel.tsx`
- **Issue**: The phase dossier called for a sidebar button + SDK command, but `ExplorerPanel` now also toggles activity-log, extending `_platform/panel-layout` scope without matching domain updates.
- **Fix**: Prefer removing the button. If you intentionally keep it, update the plan scope, Domain Manifest, domain map, and `_platform/panel-layout` docs in the same patch.
- **Patch hint**:
  ```diff
  - <button
  -   type="button"
  -   onClick={() => window.dispatchEvent(new CustomEvent('activity-log:toggle'))}
  -   aria-label="Toggle activity log"
  - >
  -   <ScrollText className="h-4 w-4" />
  - </button>
  + // Keep activity-log toggle on the planned sidebar / SDK surfaces only.
  ```

### FT-005: Refresh Phase 3 domain artifacts
- **Severity**: MEDIUM
- **File(s)**:
  - `/Users/jak/substrate/059-fix-agents-tmp/docs/plans/065-activity-log/activity-log-plan.md`
  - `/Users/jak/substrate/059-fix-agents-tmp/docs/domains/domain-map.md`
  - `/Users/jak/substrate/059-fix-agents-tmp/docs/domains/activity-log/domain.md`
  - `/Users/jak/substrate/059-fix-agents-tmp/docs/domains/terminal/domain.md`
  - `/Users/jak/substrate/059-fix-agents-tmp/docs/domains/agents/domain.md`
  - `/Users/jak/substrate/059-fix-agents-tmp/docs/domains/_platform/panel-layout/domain.md`
  - `/Users/jak/substrate/059-fix-agents-tmp/docs/domains/_platform/sdk/domain.md`
- **Issue**: The Domain Manifest, domain map, touched domain histories, and activity-log Concepts section no longer match the Phase 3 diff.
- **Fix**: Add manifest rows for every changed file, add the missing `activity-log` Domain Health Summary row and overlay-coordination edges, refresh touched domain history/composition entries, and convert the Concepts table to `Concept | Entry Point | What It Does` with the Phase 3 overlay/API concepts.
- **Patch hint**:
  ```diff
  - activityLog["📋 activity-log<br/>ActivityLogEntry<br/>appendActivityLogEntry<br/>readActivityLog<br/>shouldIgnorePaneTitle"]:::new
  + activityLog["📋 activity-log<br/>ActivityLogEntry<br/>appendActivityLogEntry<br/>readActivityLog<br/>useActivityLogOverlay<br/>GET /api/activity-log"]:::new
  + | activity-log | ActivityLogEntry, appendActivityLogEntry, readActivityLog, useActivityLogOverlay, ActivityLogOverlayProvider | terminal, api routes, workspace layout | PanelShell anchor, overlay coordination | panel-layout, terminal/agents | ✅ |
  ```

### FT-006: Add direct API-route verification evidence
- **Severity**: MEDIUM
- **File(s)**: `/Users/jak/substrate/059-fix-agents-tmp/apps/web/app/api/activity-log/route.ts`, `/Users/jak/substrate/059-fix-agents-tmp/docs/plans/065-activity-log/tasks/phase-3-overlay-panel-sidebar-button/execution.log.md`
- **Issue**: The route’s expected success/error cases are only described narratively; there is no direct request/response proof for the behavior the phase claims.
- **Fix**: Add route-focused tests or recorded manual request/response evidence for missing worktree, invalid path, unauthorized access, and successful read cases, then tie that evidence back to the execution log.
- **Patch hint**:
  ```diff
  + it('returns 400 when worktree is missing', async () => {
  +   /* Test Doc: ... */
  +   const response = await GET(new NextRequest('http://test/api/activity-log'));
  +   expect(response.status).toBe(400);
  + })
  ```

## Re-Review Checklist

- [ ] All critical/high fixes applied
- [ ] Re-run `/plan-7-v2-code-review` and achieve zero HIGH/CRITICAL
