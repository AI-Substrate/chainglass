# Research Report: Remove Copilot Status Bar (Plan 075)

**Generated**: 2026-04-08T09:25Z
**Research Query**: "Remove copilot status bar and its events, tidy the terminal overlay bar"
**Mode**: Plan-Associated (078-remove-copilot-status)
**FlowSpace**: Available
**Findings**: 33 across 5 subagents

## Executive Summary

### What It Does
Plan 075 added a Copilot CLI session status row to the terminal overlay panel header. It detects Copilot processes running in tmux panes (via PID/lockfile resolution), polls their metadata every 30s, writes activity log entries with `source: 'copilot'`, and renders model/effort/token-usage/percentage badges alongside the existing tmux window badges.

### Business Purpose
Show per-pane Copilot session metadata (model, reasoning effort, context budget %) in the terminal overlay so the user can monitor multiple Copilot sessions at a glance.

### Key Insights
1. **Self-contained removal** — the feature touches only 4 source files, 1 test file, and has zero external consumers
2. **FX001 merged copilot rendering INTO overlay panel** — the standalone `copilot-session-badges.tsx` was already deleted; its UI now lives inline in `terminal-overlay-panel.tsx`
3. **Domain docs never recorded Plan 075** — no history entries to clean up in domain.md files
4. **Activity log has a dead-code skip** — `use-activity-log-toasts.tsx` explicitly skips `source === 'copilot'` entries; this becomes dead code after removal

### Quick Stats
- **Files to delete**: 3
- **Files to modify**: 3
- **Test files affected**: 1 (delete)
- **Domain doc changes**: 0 (never recorded)
- **Complexity**: CS-1 (trivial removal)

## Files to DELETE

| # | File | Size | What It Does |
|---|------|------|-------------|
| 1 | `apps/web/src/features/064-terminal/server/copilot-session-detector.ts` | 10.6KB, 333 lines | Detects Copilot PIDs on tmux pane TTYs, resolves session IDs from lock files, reads model/effort from config.json, gets token counts from process logs, last activity from mtime |
| 2 | `apps/web/src/features/064-terminal/hooks/use-copilot-session-badges.ts` | 3.8KB, 115 lines | Frontend hook polling `/api/activity-log?source=copilot`, dedupes by windowIndex, computes lastActivityAgo |
| 3 | `test/unit/web/features/064-terminal/copilot-session-detector.test.ts` | ~192 lines | Unit tests for detectCopilotSessions with fake deps |

## Files to MODIFY

### 1. `terminal-ws.ts` — Remove copilot poll loop

**Location**: `apps/web/src/features/064-terminal/server/terminal-ws.ts`

Remove:
- **Lines 22-27**: Imports of `createRealDeps`, `detectCopilotSessions` from `./copilot-session-detector`
- **Line ~143**: `COPILOT_POLL_MS = 30000` constant
- **Lines ~143-193**: Entire copilot poll `setInterval` block that calls `detectCopilotSessions()` and writes `appendActivityLogEntry()` with `source: 'copilot'`

Keep: The existing 10s pane-title poll loop and all other sidecar functionality.

### 2. `terminal-overlay-panel.tsx` — Remove copilot badge merge + rendering

**Location**: `apps/web/src/features/064-terminal/components/terminal-overlay-panel.tsx`

Remove:
- **Line 6**: `import { useCopilotSessionBadges } from '../hooks/use-copilot-session-badges'`
- **Lines 14-31**: Helper functions `formatTokens()`, `getPctColorClass()`, `formatModel()`
- **Line 44**: `const copilotBadges = useCopilotSessionBadges({ cwd, enabled: isOpen })`
- **Lines 46-61**: `combinedBadges` useMemo left-join block
- **Lines 148-186**: Replace `combinedBadges.map(...)` with `windowBadges.map(...)` 
- **Lines 149**: `const hasCopilot = badge.model !== null` check
- **Lines 164-183**: Entire copilot detail line 2 JSX block (model, effort, tokens, pct, lastActivityAgo)

Simplify badge rendering to just:
- `badge.windowIndex`
- `badge.windowName` (optional)
- `badge.label`

### 3. `use-activity-log-toasts.tsx` — Remove dead copilot skip

**Location**: `apps/web/src/features/065-activity-log/hooks/use-activity-log-toasts.tsx`

Remove:
- **Lines 73-78**: The `source === 'copilot'` skip condition (dead code after copilot entries stop being written)

## Files NOT Changed (No Cleanup Needed)

| File | Why No Change |
|------|--------------|
| `docs/domains/terminal/domain.md` | Plan 075 was never recorded in history table |
| `apps/web/src/features/064-terminal/domain.md` | Plan 075 never added to composition/contracts/history |
| `docs/domains/activity-log/domain.md` | `copilot` source never documented |
| `docs/domains/domain-map.md` | No copilot edges were added |
| `docs/c4/` | No copilot references |
| Activity log writer/reader/API | Generic — no copilot-specific code |
| Other terminal tests | No copilot references |

## Plan 075 Artifacts (Keep as Historical Record)

The entire `docs/plans/075-tmux-copilot-status/` directory stays — it's historical documentation:
- `plan.md`, `tmux-copilot-status-spec.md`, `execution.log.md`
- `workshops/001-status-line-ui.md`, `workshops/002-combined-badge-ui.md`
- `fixes/FX001-combine-badges.*`

## Modification Considerations

### Safe to Remove
All Plan 075 code is self-contained:
- No other feature imports from `copilot-session-detector` or `use-copilot-session-badges`
- The overlay panel's copilot merge is purely additive — removing it restores the pre-075 behavior
- The copilot poll in `terminal-ws.ts` runs on its own interval independent of the pane-title poll
- The activity log `source: 'copilot'` skip in toast hook has no effect once entries stop being written

### Post-Removal Bar State
After removal, the terminal overlay header will show:
- Simple flat badges per tmux window: `{windowIndex}:{windowName} {label}`
- No copilot details (model, tokens, percentage)
- Same layout as pre-Plan 075

## Critical Discoveries

### CD-01: FX001 Merge Makes Removal Slightly More Complex
FX001 merged the standalone `copilot-session-badges.tsx` INTO `terminal-overlay-panel.tsx`, creating a left-join pattern where window badges are enriched with copilot data via `combinedBadges` useMemo. The removal must untangle this merge by replacing `combinedBadges` with plain `windowBadges` in the render.

### CD-02: Activity Log Toast Skip Is Dead Code
`use-activity-log-toasts.tsx` has `if (entry.source === 'copilot') continue` which was added to prevent copilot entries from triggering toasts. After removal, no copilot entries will ever be written, making this dead code. Clean it up.

### CD-03: No Domain Doc Entries Were Created
Plan 075 never updated domain.md history tables (terminal or activity-log), composition tables, or domain-map.md. This means removal requires zero documentation cleanup — a clean removal.

## Recommendations

### Removal Approach
1. Delete the 3 files (detector, hook, test)
2. Clean `terminal-ws.ts` (remove copilot poll loop + imports)
3. Clean `terminal-overlay-panel.tsx` (remove copilot merge + rendering, simplify to plain window badges)
4. Clean `use-activity-log-toasts.tsx` (remove dead copilot skip)
5. Run `just fft` to verify clean build

### Estimated Effort
- **Tasks**: 3-4 (delete files, modify terminal-ws, modify overlay panel, modify toast hook)
- **Risk**: Very low — purely subtractive changes with no external consumers
- **Testing**: Run existing test suite; confirm overlay still renders window badges

---

**Research Complete**: 2026-04-08T09:25Z
**Report Location**: `docs/plans/078-remove-copilot-status/research-dossier.md`
