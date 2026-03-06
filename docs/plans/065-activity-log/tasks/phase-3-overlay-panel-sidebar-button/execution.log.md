# Execution Log — Phase 3: Overlay Panel + Sidebar Button

**Plan**: 065 — Worktree Activity Log
**Phase**: Phase 3: Overlay Panel + Sidebar Button
**Started**: 2026-03-06

---

## T001: Create API route `GET /api/activity-log`
- Created `apps/web/app/api/activity-log/route.ts`
- Auth check via `auth()`, path validation (starts with `/`, no `..`), calls `readActivityLog()`
- Supports `limit`, `since`, `source` query params
- Returns 400/401/403/500 for error cases
- **Evidence**: Follows `/api/workspaces/[slug]/files/route.ts` pattern

## T002: Create `useActivityLogOverlay()` hook + provider
- Created `apps/web/src/features/065-activity-log/hooks/use-activity-log-overlay.tsx`
- DYK-01: `isOpeningRef` guard prevents self-close when dispatching `overlay:close-all`
- Listens for `activity-log:toggle` custom event from sidebar/SDK
- Resolves `worktreePath` from URL `worktree` query param when toggling without explicit path
- **Evidence**: Mirrors `use-terminal-overlay.tsx` pattern

## T003: Create `ActivityLogOverlayPanel` component
- Created `apps/web/src/features/065-activity-log/components/activity-log-overlay-panel.tsx`
- DYK-04: 10s cache staleness window via `useRef` + timestamp
- DYK-05: z-index 44 with comment documenting z-index map (44/45/50)
- Anchor measurement via ResizeObserver, Escape key close, lazy load
- **Evidence**: Mirrors `terminal-overlay-panel.tsx` pattern

## T004: Create `ActivityLogEntryList` with gap separators
- Created `apps/web/src/features/065-activity-log/components/activity-log-entry-list.tsx`
- Source icons: 🖥 tmux, 🤖 agent, 📋 default
- 30min gap separator with dashed border and "gap" label
- Relative time formatting (just now, Xm ago, Xh ago, Xd ago)
- Empty state when no entries
- **Evidence**: AC-13 gap separators

## T005: Create `ActivityLogOverlayWrapper` + mount in layout
- Created `apps/web/app/(dashboard)/workspaces/[slug]/activity-log-overlay-wrapper.tsx`
- Modified `layout.tsx` — mounted `ActivityLogOverlayWrapper` inside `TerminalOverlayWrapper`
- Dynamic import for panel (SSR: false), error boundary wraps panel only
- Passes `defaultWorktreePath` from workspace context
- **Evidence**: Mirrors `terminal-overlay-wrapper.tsx` pattern

## T006: Add sidebar button + SDK command
- Modified `apps/web/src/lib/sdk/sdk-bootstrap.ts` — registered `activity-log.toggleOverlay` command
- Modified `apps/web/src/components/dashboard-sidebar.tsx` — added Activity toggle button with ScrollText icon
- DYK-02: Skipped `WORKSPACE_NAV_ITEMS` (would create dead link), added toggle button only
- **Evidence**: Follows terminal toggle pattern (sidebar lines 271-279)

## T007: Add mutual exclusion to terminal + agent overlays
- Modified `apps/web/src/features/064-terminal/hooks/use-terminal-overlay.tsx`:
  - Added `isOpeningRef` guard, dispatch `overlay:close-all` in `openTerminal`/`toggleTerminal`
  - Added `overlay:close-all` listener that calls `closeTerminal()` (skips if `isOpeningRef`)
- Modified `apps/web/src/hooks/use-agent-overlay.tsx`:
  - Added `overlay:close-all` listener that calls `closeAgent()`
  - DYK-03: Agent overlay now participates in mutual exclusion
- **Evidence**: AC-09 mutual exclusion, all three overlays close siblings before opening

## T008: Lightweight UI tests
- Created `test/unit/web/features/065-activity-log/activity-log-overlay.test.ts`
- 16 tests: type contracts (2), fixture ordering (2), gap detection (5), source icons (3), relative time (4)
- All 43 activity log tests pass, all 43 terminal tests pass
- **Evidence**: Fixtures only, no mocks

## Bonus fix
- Fixed `.js` import extensions in `activity-log-reader.ts` and `activity-log-writer.ts` — Next.js Turbopack doesn't resolve `.js` extensions for TypeScript imports

