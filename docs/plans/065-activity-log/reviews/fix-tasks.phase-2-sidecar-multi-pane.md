# Fix Tasks: Phase 2: Terminal Sidecar — Multi-Pane Polling + Activity Writes

Apply in order. Re-run review after fixes.

## Critical / High Fixes

### FT-001: Resolve worktree root relative to the connection CWD
- **Severity**: HIGH
- **File(s)**: /Users/jak/substrate/059-fix-agents-tmp/apps/web/src/features/064-terminal/server/terminal-ws.ts
- **Issue**: `git rev-parse --show-toplevel` runs from the sidecar process directory instead of the client-provided `cwd`, so activity entries can be written to the wrong worktree.
- **Fix**: Resolve the git root relative to the connection path before polling/writing. The simplest fix is to run `git -C <cwd> rev-parse --show-toplevel`; keep the existing fallback to `cwd` on failure.
- **Patch hint**:
  ```diff
  -      worktreeRoot = deps.execCommand('git', ['rev-parse', '--show-toplevel']).trim();
  +      worktreeRoot = deps
  +        .execCommand('git', ['-C', cwd, 'rev-parse', '--show-toplevel'])
  +        .trim();
  ```

### FT-002: Make activity-log polling best-effort instead of crashable
- **Severity**: HIGH
- **File(s)**: /Users/jak/substrate/059-fix-agents-tmp/apps/web/src/features/064-terminal/server/terminal-ws.ts
- **Issue**: `appendActivityLogEntry()` performs synchronous filesystem writes and currently runs inside `setInterval()` with no error boundary; write failures can terminate the terminal sidecar.
- **Fix**: Catch/log write failures inside the polling loop and continue serving the terminal session. Keep the scope narrow so only activity-log append failures are handled.
- **Patch hint**:
  ```diff
          for (const { pane, title } of paneTitles) {
            if (shouldIgnorePaneTitle(title)) continue;
  -         appendActivityLogEntry(worktreeRoot, {
  -           id: `tmux:${pane}`,
  -           source: 'tmux',
  -           label: title,
  -           timestamp: new Date().toISOString(),
  -           meta: { pane, session: sessionName },
  -         });
  +         try {
  +           appendActivityLogEntry(worktreeRoot, {
  +             id: `tmux:${pane}`,
  +             source: 'tmux',
  +             label: title,
  +             timestamp: new Date().toISOString(),
  +             meta: { pane, session: sessionName },
  +           });
  +         } catch (error) {
  +           console.error('[terminal] Failed to append activity log entry', {
  +             sessionName,
  +             pane,
  +             error,
  +           });
  +         }
          }
  ```

### FT-003: Add automated Phase 2 coverage to `terminal-ws.test.ts`
- **Severity**: HIGH
- **File(s)**: /Users/jak/substrate/059-fix-agents-tmp/test/unit/web/features/064-terminal/terminal-ws.test.ts
- **Issue**: The current suite does not exercise the new Phase 2 behavior in `terminal-ws.ts`, so the incorrect worktree-root resolution slipped through review evidence.
- **Fix**: Add focused tests using fake exec responses, fake timers, and a temp worktree to verify: (1) `git -C <cwd> rev-parse --show-toplevel` success, (2) fallback to `cwd` when git fails, (3) multi-pane polling uses `getPaneTitles()` output, (4) ignored titles are skipped, (5) activity-log.jsonl receives entries, and (6) no `pane_title` websocket message is emitted.
- **Patch hint**:
  ```diff
  + it('writes non-ignored pane titles to the resolved worktree root', () => {
  +   // Arrange: temp worktree, fake exec responses for `tmux -V`,
  +   // `git -C <cwd> rev-parse --show-toplevel`, and `tmux list-panes ... -s -F ...`
  +   // Act: connect, advance fake timers, inspect activity-log.jsonl
  +   // Assert: only non-ignored pane titles are written and no pane_title WS message is sent
  + })
  ```

## Medium / Low Fixes

### FT-004: Sync the Domain Manifest with the actual Phase 2 file set
- **Severity**: MEDIUM
- **File(s)**: /Users/jak/substrate/059-fix-agents-tmp/docs/plans/065-activity-log/activity-log-plan.md
- **Issue**: Eight changed Phase 2 files are not declared in the Domain Manifest, including the terminal UI removals and `docs/domains/terminal/domain.md`.
- **Fix**: Add each changed file with explicit domain/classification/rationale entries so the manifest fully describes the work under review.
- **Patch hint**:
  ```diff
   | `apps/web/src/features/064-terminal/server/tmux-session-manager.ts` | terminal | internal | Add getPaneTitles() multi-pane method |
   | `apps/web/src/features/064-terminal/server/terminal-ws.ts` | terminal | internal | Replace pane title badge with activity log writes |
  +| `apps/web/src/features/064-terminal/components/terminal-inner.tsx` | terminal | internal | Remove paneTitle prop plumbing |
  +| `apps/web/src/features/064-terminal/components/terminal-overlay-panel.tsx` | terminal | internal | Remove overlay badge state/rendering |
  +| `apps/web/src/features/064-terminal/components/terminal-page-client.tsx` | terminal | internal | Remove page-level paneTitle state |
  +| `apps/web/src/features/064-terminal/components/terminal-page-header.tsx` | terminal | internal | Remove header badge rendering |
  +| `apps/web/src/features/064-terminal/components/terminal-view.tsx` | terminal | internal | Remove onPaneTitle prop pass-through |
  +| `apps/web/src/features/064-terminal/hooks/use-terminal-socket.ts` | terminal | internal | Remove pane_title client handling |
  +| `apps/web/src/features/064-terminal/types.ts` | terminal | contract | Remove pane_title message variant |
  +| `docs/domains/terminal/domain.md` | terminal | contract | Record Phase 2 dependency/history updates |
  ```

### FT-005: Update terminal dependency docs and domain-map summary
- **Severity**: MEDIUM
- **File(s)**:
  - /Users/jak/substrate/059-fix-agents-tmp/docs/domains/terminal/domain.md
  - /Users/jak/substrate/059-fix-agents-tmp/docs/domains/domain-map.md
  - /Users/jak/substrate/059-fix-agents-tmp/apps/web/src/features/064-terminal/domain.md
- **Issue**: The terminal docs record the history row but not the realized `activity-log` dependency, and the domain-map health summary still omits that provider/consumer relationship.
- **Fix**: Add `activity-log` + consumed contracts to the terminal dependency docs, and update the health summary rows so `terminal` and `activity-log` both reflect the Phase 2 relationship.
- **Patch hint**:
  ```diff
   | Depends On | Contract Used |
   |-----------|-------------|
   | _platform/panel-layout | PanelShell, PanelMode |
   | _platform/events | sonner toast |
   | _platform/sdk | registerCommand, registerKeybinding |
   | _platform/workspace-url | workspaceHref() |
  +| activity-log | appendActivityLogEntry(), shouldIgnorePaneTitle() |
  ```
  ```diff
  +| activity-log | ActivityLogEntry, appendActivityLogEntry, readActivityLog, shouldIgnorePaneTitle | terminal | PanelShell anchor | panel-layout | ✅ |
  -| terminal | _(none — leaf consumer)_ | — | PanelShell, LeftPanel, MainPanel, toast(), IUSDK, ICommandRegistry, workspaceHref | panel-layout, events, sdk, workspace-url | ✅ |
  +| terminal | _(none — leaf consumer)_ | — | PanelShell, LeftPanel, MainPanel, toast(), IUSDK, ICommandRegistry, workspaceHref, appendActivityLogEntry(), shouldIgnorePaneTitle() | panel-layout, events, sdk, workspace-url, activity-log | ✅ |
  ```

### FT-006: Add required Test Doc blocks to the new `getPaneTitles()` tests
- **Severity**: MEDIUM
- **File(s)**: /Users/jak/substrate/059-fix-agents-tmp/test/unit/web/features/064-terminal/tmux-session-manager.test.ts
- **Issue**: The new tests in the `describe('getPaneTitles')` block omit the mandatory 5-field Test Doc comments required by project rules and the constitution.
- **Fix**: Add `Why`, `Contract`, `Usage Notes`, `Quality Contribution`, and `Worked Example` comments to each new test (or consolidate the cases into fewer documented tests).
- **Patch hint**:
  ```diff
    it('should parse multi-window output', () => {
  +   /*
  +   Test Doc:
  +   - Why: Multi-pane visibility is the core Phase 2 behavior.
  +   - Contract: getPaneTitles() returns one `{ pane, title }` entry per pane across all windows.
  +   - Usage Notes: tmux output is tab-delimited and must preserve tabs inside titles.
  +   - Quality Contribution: Catches regressions in parsing or accidental removal of the `-s` flag.
  +   - Worked Example: "0.0\tImplementing Phase 1\n1.0\tRunning tests" → two parsed entries.
  +   */
      const { manager, exec } = createManager();
  ```

## Re-Review Checklist

- [ ] All critical/high fixes applied
- [ ] Re-run `/plan-7-v2-code-review` and achieve zero HIGH/CRITICAL
