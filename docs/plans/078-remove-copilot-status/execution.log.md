# Execution Log — Plan 078: Remove Copilot Status Bar

**Mode**: Simple | **Started**: 2026-04-08T09:45Z

---

## T001 — Remove copilot poll loop from terminal sidecar

**Status**: DONE
**File**: `apps/web/src/features/064-terminal/server/terminal-ws.ts`
**Changes**: Removed `createRealDeps`/`detectCopilotSessions` import, `COPILOT_POLL_MS` constant, and entire copilot poll setInterval block (lines 143-193 including close handler).

## T002 — Strip copilot badge merge and rendering from overlay panel

**Status**: DONE
**File**: `apps/web/src/features/064-terminal/components/terminal-overlay-panel.tsx`
**Changes**: Removed `useCopilotSessionBadges` import, 3 copilot helper functions (`formatTokens`, `getPctColorClass`, `formatModel`), `copilotBadges` hook call, `combinedBadges` useMemo left-join, and copilot line-2 JSX block. Also removed `useTerminalWindowBadges` import/call and entire badge rendering area per user request — header now shows only session name + buttons.

## T003 — Remove dead copilot skip from activity log toast hook

**Status**: DONE
**File**: `apps/web/src/features/065-activity-log/hooks/use-activity-log-toasts.tsx`
**Changes**: Removed `|| entry.source === 'copilot'` from skip condition. Updated comment.

## T004 — Delete Plan 075 source files and tests

**Status**: DONE
**Deleted**:
- `apps/web/src/features/064-terminal/server/copilot-session-detector.ts` (333 lines)
- `apps/web/src/features/064-terminal/hooks/use-copilot-session-badges.ts` (115 lines)
- `apps/web/src/features/064-terminal/hooks/use-terminal-window-badges.ts` (82 lines)
- `test/unit/web/features/064-terminal/copilot-session-detector.test.ts` (192 lines)

## T005 — Quality gate

**Status**: DONE
- Typecheck: clean (0 errors)
- Tests: 391 passed, 10 skipped (5576 tests)
- Orphan references: 0 (grep for all removed symbols returns empty)
- Lint: only pre-existing `manifest.json` symlink error (not ours)

## Discoveries

| # | Finding |
|---|---------|
| D01 | User wanted ALL badges removed (not just copilot) — window badges too. Extended scope to also delete `use-terminal-window-badges.ts` and strip all badge rendering from overlay panel header. |
| D02 | tmux pane title polling in `terminal-ws.ts` kept — it feeds the activity log overlay (separate feature), not the removed badges. |
