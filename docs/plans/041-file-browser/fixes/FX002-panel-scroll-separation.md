# Fix FX002: Panel scroll separation and sticky headers

**Created**: 2026-02-27
**Status**: Complete
**Plan**: [file-browser-plan.md](../file-browser-plan.md)
**Source**: User report — tree header and viewer toolbar scroll with content instead of staying pinned
**Domain(s)**: _platform (panel-layout), file-browser

---

## Problem

The browser page has three nested scroll contexts fighting each other. PanelShell's left wrapper has `overflow-y-auto`, LeftPanel's content div has `flex-1 overflow-y-auto`, and FileTree adds a third with `h-full overflow-y-auto`. This causes the "FILES" header (PanelHeader) to scroll away with the tree content instead of staying pinned. The FileViewerPanel toolbar (Edit/Preview/Diff) similarly scrolls with content when it should stay fixed. The tree and content area must scroll independently with their respective headers locked in place.

## Proposed Fix

1. Remove `overflow-y-auto` from PanelShell's left panel wrapper — replace with `overflow-hidden` so it doesn't create a competing scroll context.
2. Remove `h-full overflow-y-auto` from FileTree's root div — it's already wrapped in LeftPanel's `flex-1 overflow-y-auto` container.
3. Clean up PanelHeader's `sticky top-0` — no longer needed since it stays pinned via flex `shrink-0` layout (the sticky was only needed when the parent scrolled).
4. Verify scrollIntoView on file selection and scrollToLine on editor still work with the corrected scroll hierarchy.

## Domain Impact

| Domain | Relationship | What Changes |
|--------|-------------|-------------|
| _platform | Owner | `panel-shell.tsx` left wrapper overflow; `panel-header.tsx` remove stale sticky |
| file-browser | Consumer | `file-tree.tsx` remove redundant scroll container |

## Tasks

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [x] | FX002-1 | Fix PanelShell left wrapper overflow | _platform | `/Users/jordanknight/substrate/chainglass-048/apps/web/src/features/_platform/panel-layout/components/panel-shell.tsx` | Left wrapper uses `overflow-hidden` instead of `overflow-y-auto`; only LeftPanel's inner content div scrolls | Root cause — this creates the competing scroll context |
| [x] | FX002-2 | Remove FileTree redundant scroll container | file-browser | `/Users/jordanknight/substrate/chainglass-048/apps/web/src/features/041-file-browser/components/file-tree.tsx` | FileTree root div no longer has `overflow-y-auto`; scrolling delegated to LeftPanel content wrapper | Triple scroll nesting: PanelShell → LeftPanel → FileTree. Remove the innermost. |
| [x] | FX002-3 | Clean up PanelHeader stale sticky class | _platform | `/Users/jordanknight/substrate/chainglass-048/apps/web/src/features/_platform/panel-layout/components/panel-header.tsx` | `sticky top-0` removed; header stays pinned via flex `shrink-0` layout | Cosmetic — sticky is redundant when parent doesn't scroll |
| [x] | FX002-4 | Verify scroll behaviors | file-browser | (all above files) | File selection scrolls tree into view; line-offset navigation scrolls editor; tree and editor scroll independently; headers stay pinned | Manual verification with Playwright |

## Workshops Consumed

- `left-panel-view-modes.md` — describes sticky header design intent for FileTree

## Acceptance

- [x] "FILES" header + mode buttons stay pinned when scrolling the tree
- [x] Edit/Preview/Diff toolbar stays pinned when scrolling file content
- [x] Tree and content area scroll independently
- [x] Clicking a file scrolls the tree entry into view
- [x] Clicking a file with line offset scrolls editor to that line
- [x] ExplorerPanel (top bar) stays fixed in all scroll scenarios

## Discoveries & Learnings

_Populated during implementation._

| Date | Task | Type | Discovery | Resolution |
|------|------|------|-----------|------------|
