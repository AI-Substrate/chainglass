# Fix Tasks: Phase 4: Terminal Overlay Panel (Surface 2)

Apply in order. Re-run review after fixes.

## Critical / High Fixes

### FT-001: Fix stale session/CWD reopen behavior
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/064-tmux/apps/web/src/features/064-terminal/hooks/use-terminal-overlay.tsx
- **Issue**: `toggleTerminal()` can reopen the overlay using stale prior-worktree `sessionName/cwd` values.
- **Fix**: On open, prefer current URL worktree-derived session/CWD (unless explicit arguments are passed), and avoid stale fallback from previous state.
- **Patch hint**:
  ```diff
  - let resolvedSession = sessionName ?? prev.sessionName;
  - let resolvedCwd = cwd ?? prev.cwd;
  + let resolvedSession = sessionName;
  + let resolvedCwd = cwd;
  + // derive from current URL worktree first
  + if (!resolvedSession || !resolvedCwd) {
  +   // parse worktree from URL and derive session/cwd
  + }
  + // only then fall back if explicitly desired
  ```

### FT-002: Restore domain contract import boundary
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/064-tmux/apps/web/app/(dashboard)/workspaces/[slug]/terminal-overlay-wrapper.tsx
- **Issue**: Wrapper deep-imports terminal internals instead of consuming terminal domain barrel exports.
- **Fix**: Import `TerminalOverlayProvider` and `TerminalOverlayPanel` from `@/features/064-terminal` and remove deep relative import paths.
- **Patch hint**:
  ```diff
  - import { TerminalOverlayProvider } from '../../../../src/features/064-terminal/hooks/use-terminal-overlay';
  - const TerminalOverlayPanel = dynamic(
  -   () => import('../../../../src/features/064-terminal/components/terminal-overlay-panel').then(...)
  - );
  + import { TerminalOverlayProvider, TerminalOverlayPanel } from '@/features/064-terminal';
  + const TerminalOverlayPanelDynamic = dynamic(
  +   async () => TerminalOverlayPanel,
  +   { ssr: false },
  + );
  ```

### FT-003: Add acceptance evidence for AC-05/AC-06/AC-13
- **Severity**: HIGH
- **File(s)**:
  - /Users/jordanknight/substrate/064-tmux/docs/plans/064-tmux/tasks/phase-4-terminal-overlay-panel/execution.log.md
  - /Users/jordanknight/substrate/064-tmux/docs/plans/064-tmux/tasks/phase-4-terminal-overlay-panel/tasks.md
- **Issue**: Execution log lacks concrete runtime verification evidence for persistence and close behavior.
- **Fix**: Run manual verification steps and capture observed outcomes (commands, page transitions, reconnect/tmux continuity).
- **Patch hint**:
  ```diff
  + ## 2026-03-03 Verification Run
  + - AC-05: Ctrl+` and sidebar button both opened overlay on browser page (observed)
  + - AC-06: Navigated browser -> agents -> workflows; overlay remained open and connected
  + - AC-13: Closed with Escape/X; WS disconnected; reopened and reattached to same tmux session
  + - Commands: [list exact commands]
  ```

## Medium / Low Fixes

### FT-004: Align overlay size and lazy-load behavior with phase contract
- **Severity**: MEDIUM
- **File(s)**:
  - /Users/jordanknight/substrate/064-tmux/apps/web/src/features/064-terminal/components/terminal-overlay-panel.tsx
  - /Users/jordanknight/substrate/064-tmux/apps/web/src/features/064-terminal/components/terminal-view.tsx
- **Issue**: Overlay width diverges from 480px target and panel bypasses `TerminalView` dynamic wrapper.
- **Fix**: Set width to planned value (or explicitly update plan/spec) and render `TerminalView` instead of `TerminalInner`.

### FT-005: Remove interval route polling from overlay provider
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/064-tmux/apps/web/src/features/064-terminal/hooks/use-terminal-overlay.tsx
- **Issue**: 500ms polling interval runs continuously for route detection.
- **Fix**: Use route-aware hooks/events to close overlay when on `/terminal` route.

### FT-006: Route sidebar toggle through SDK command
- **Severity**: MEDIUM
- **File(s)**:
  - /Users/jordanknight/substrate/064-tmux/apps/web/src/components/dashboard-sidebar.tsx
  - /Users/jordanknight/substrate/064-tmux/apps/web/src/lib/sdk/sdk-bootstrap.ts
- **Issue**: Sidebar directly emits terminal event instead of invoking registered command pathway.
- **Fix**: Execute `terminal.toggleOverlay` through SDK command registry for consistency with keybinding/palette.

### FT-007: Update domain artifacts for Phase 4 currency
- **Severity**: LOW
- **File(s)**:
  - /Users/jordanknight/substrate/064-tmux/docs/domains/terminal/domain.md
  - /Users/jordanknight/substrate/064-tmux/docs/plans/064-tmux/tmux-plan.md
- **Issue**: Domain docs/manifest do not fully reflect phase artifacts and concepts.
- **Fix**: Add Phase 4 history/composition/concepts updates and include wrapper file mapping (or remove wrapper).

## Re-Review Checklist

- [ ] All critical/high fixes applied
- [ ] AC-05/AC-06/AC-13 evidence logged with observed outcomes
- [ ] Domain contract imports and boundaries corrected
- [ ] Re-run `/plan-7-v2-code-review` and achieve zero HIGH/CRITICAL
