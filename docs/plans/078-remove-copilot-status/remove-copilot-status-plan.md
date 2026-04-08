# Remove Copilot Status Bar — Implementation Plan

**Mode**: Simple
**Plan Version**: 1.0.0
**Created**: 2026-04-08
**Spec**: [remove-copilot-status-spec.md](remove-copilot-status-spec.md)
**Research**: [research-dossier.md](research-dossier.md)
**Status**: COMPLETE

## Summary

Remove the Plan 075 Copilot Status Bar feature from the terminal overlay panel. Delete the 3 dedicated files (detector, hook, test), clean the copilot poll loop from the terminal sidecar, strip the copilot badge merge/rendering from the overlay panel, and remove the dead copilot skip from the activity log toast hook. Purely subtractive — restores the pre-075 terminal overlay to show only tmux window badges.

## Target Domains

| Domain | Status | Relationship | Role |
|--------|--------|-------------|------|
| terminal | existing | modify | Remove copilot detector, hook, poll loop, and badge rendering |
| activity-log | existing | modify | Remove dead `source === 'copilot'` skip from toast hook |

## Domain Manifest

| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| `apps/web/src/features/064-terminal/server/copilot-session-detector.ts` | terminal | internal | DELETE — entire Plan 075 detector module |
| `apps/web/src/features/064-terminal/hooks/use-copilot-session-badges.ts` | terminal | internal | DELETE — entire Plan 075 frontend hook |
| `test/unit/web/features/064-terminal/copilot-session-detector.test.ts` | terminal | internal | DELETE — Plan 075 detector unit tests |
| `apps/web/src/features/064-terminal/server/terminal-ws.ts` | terminal | internal | MODIFY — remove copilot imports, constant, poll interval |
| `apps/web/src/features/064-terminal/components/terminal-overlay-panel.tsx` | terminal | internal | MODIFY — remove copilot import, helpers, hook, merge, rendering |
| `apps/web/src/features/065-activity-log/hooks/use-activity-log-toasts.tsx` | activity-log | internal | MODIFY — remove dead copilot skip from source filter |

## Key Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| F01 | High | FX001 merged copilot rendering INTO overlay panel via `combinedBadges` left-join useMemo. Must untangle: replace `combinedBadges.map()` with `windowBadges.map()` and remove copilot line-2 JSX block. | T002: carefully revert to plain window badge rendering |
| F02 | Medium | `terminal-ws.ts` copilot poll is cleanly separated (own interval, own `ws.on('close')` cleanup, lines 143-193). Entire block removable without touching adjacent code. | T001: delete lines 22, 26, 143-193 |
| F03 | Low | Toast hook line 77 skips both `tmux` and `copilot` in one condition: `entry.source === 'tmux' \|\| entry.source === 'copilot'`. Remove only the copilot part, keep tmux skip. | T003: edit condition and comment |
| F04 | Low | Overlay panel has 3 copilot-only helper functions (lines 14-31: `formatTokens`, `getPctColorClass`, `formatModel`) that become dead code. Delete them. | T002: remove as part of overlay cleanup |

## Implementation

**Objective**: Completely remove Plan 075 Copilot Status Bar code and restore pre-075 terminal overlay behavior.
**Testing Approach**: Lightweight — run `just fft` to confirm lint/typecheck/test pass. Existing terminal tests have no copilot references.
**Complexity**: CS-1 (trivial)

### Tasks

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [x] | T001 | Remove copilot poll loop from terminal sidecar | terminal | `/apps/web/src/features/064-terminal/server/terminal-ws.ts` | No imports from `copilot-session-detector`, no `COPILOT_POLL_MS` constant, no copilot `setInterval` block. File compiles clean. | Remove: line 22 (import), line 26 (constant), lines 143-193 (poll block + close handler). Per F02. |
| [x] | T002 | Strip copilot badge merge and rendering from overlay panel | terminal | `/apps/web/src/features/064-terminal/components/terminal-overlay-panel.tsx` | No imports from `use-copilot-session-badges`. No `formatTokens`/`getPctColorClass`/`formatModel` helpers. No `copilotBadges` hook call. No `combinedBadges` useMemo. Render maps over `windowBadges` directly. No copilot line-2 JSX. Badge is simple: `windowIndex:windowName label`. | Remove: line 6 (import), lines 14-31 (helpers), line 44 (hook call), lines 46-61 (combinedBadges memo), line 149 (hasCopilot const). Replace `combinedBadges` with `windowBadges` in render. Remove lines 164-183 (copilot JSX). Per F01, F04. |
| [x] | T003 | Remove dead copilot skip from activity log toast hook | activity-log | `/apps/web/src/features/065-activity-log/hooks/use-activity-log-toasts.tsx` | Line 77 condition is `entry.source === 'tmux'` only (no copilot reference). Comment on line 73 says "Skip tmux entries". | Remove ` \|\| entry.source === 'copilot'` from condition. Update comment. Per F03. |
| [x] | T004 | Delete Plan 075 source files and tests | terminal | See paths | `copilot-session-detector.ts`, `use-copilot-session-badges.ts`, and `copilot-session-detector.test.ts` no longer exist on disk. | `rm` the 3 files. |
| [x] | T005 | Quality gate | — | — | `just fft` passes (lint + typecheck + test). No references to `copilot-session-detector` or `use-copilot-session-badges` remain in source. | Run `just fft`. Grep for orphan references. |

### Dependency Graph

```
T001 ──┐
T002 ──┤
T003 ──┼── T004 ── T005
       │
```

T001-T003 are independent modifications. T004 (delete files) should run after T001-T002 remove the imports. T005 (quality gate) runs last.

### Acceptance Criteria

- [x] AC-01: `copilot-session-detector.ts` no longer exists
- [x] AC-02: `use-copilot-session-badges.ts` no longer exists
- [x] AC-03: `copilot-session-detector.test.ts` no longer exists
- [x] AC-04: `terminal-ws.ts` has no copilot imports or poll loop
- [x] AC-05: `terminal-overlay-panel.tsx` renders plain window badges only
- [x] AC-06: `terminal-overlay-panel.tsx` has no copilot helpers or imports
- [x] AC-07: `use-activity-log-toasts.tsx` has no copilot skip
- [x] AC-08: All existing tests pass (`just fft`)
- [x] AC-09: No orphan references to Plan 075 symbols in source code

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| None | — | — | Purely subtractive, zero external consumers |
