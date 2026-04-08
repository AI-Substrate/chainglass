# Fix FX001: Combine window + copilot badges into unified cards

**Created**: 2026-03-15
**Status**: Complete
**Plan**: [plan.md](../plan.md)
**Source**: User request — visual disconnect between window title row and copilot detail row
**Domain(s)**: terminal (extend)
**Workshop**: [workshops/002-combined-badge-ui.md](../workshops/002-combined-badge-ui.md)

---

## Problem

The terminal overlay header shows window badges (row 1) and copilot session badges (row 2) as two separate rows. Users must mentally match `0:copilot:` in row 2 back to `0:w1` in row 1. With multiple sessions this mapping gets harder. The two rows should be merged into unified per-window cards where title sits on line 1 and copilot details on line 2.

## Proposed Fix

Left-join `windowBadges` + `copilotBadges` by `windowIndex` in the overlay panel component. Render each window as a single stacked card: title on line 1, copilot details on line 2 (only when a copilot session exists in that window). Delete the separate `<CopilotSessionBadges>` component — move its helper functions (`formatModel`, `formatTokens`, `getPctColorClass`) inline. Keep both hooks unchanged.

## Domain Impact

| Domain | Relationship | What Changes |
|--------|-------------|-------------|
| terminal | extend | Merge badge rendering in `terminal-overlay-panel.tsx`, delete `copilot-session-badges.tsx` |

## Tasks

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [x] | FX001-1 | Merge badge rendering into combined cards | terminal | `/apps/web/src/features/064-terminal/components/terminal-overlay-panel.tsx` | Window badges and copilot details render as unified per-window cards. Title on line 1, copilot details on line 2 (when present). Single flex-wrap row replaces two separate rows. | Move `formatModel`, `formatTokens`, `getPctColorClass` from copilot-session-badges.tsx inline |
| [x] | FX001-2 | Delete CopilotSessionBadges component | terminal | `/apps/web/src/features/064-terminal/components/copilot-session-badges.tsx` | File deleted. No remaining imports reference it. | Rendering moved to overlay panel |
| [x] | FX001-3 | Verify and run quality gates | terminal | — | `just fft` passes. Visual check: combined cards render correctly with 0, 1, and 2+ copilot sessions. | Manual verification |

## Workshops Consumed

- [002-combined-badge-ui.md](../workshops/002-combined-badge-ui.md) — layout design, merge strategy, visual specs

## Acceptance

- [ ] Window badges and copilot details appear as unified per-window cards (title line 1, details line 2)
- [ ] Windows without copilot sessions show single-line cards (unchanged from current window badge)
- [ ] Color-coded percentage still works (green/yellow/orange/red thresholds)
- [ ] Separate `<CopilotSessionBadges>` component and its border-t row are removed
- [ ] `just fft` passes

## Discoveries & Learnings

_Populated during implementation._

| Date | Task | Type | Discovery | Resolution |
|------|------|------|-----------|------------|
