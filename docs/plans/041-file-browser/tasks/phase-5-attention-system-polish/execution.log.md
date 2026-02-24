# Execution Log: Phase 5 — Attention System & Polish

**Plan**: [file-browser-plan.md](../../file-browser-plan.md)
**Phase**: 5 of 6
**Started**: 2026-02-24

---

## DYK Decisions Applied

| ID | Decision | Impact |
|----|----------|--------|
| DYK-01 | Defer landing page change indicators to SSE eventing layer | T003 deferred, no git calls on landing page |
| DYK-02 | WorkspaceContext from [slug]/layout.tsx shared with sidebar | T004 reads context instead of fetching |
| DYK-03 | Layout fetches preferences only; browser page sets hasChanges | No git calls in layout |
| DYK-04 | Fold T001-T002 into T005 — attention derivation is trivial | 2 tasks eliminated |
| DYK-05 | Split T009 into shell (T009a) + pickers (T009b) | Incremental delivery |

---

## Task Log

### T005: Workspace Layout + WorkspaceContext + useAttentionTitle
- Created `use-workspace-context.tsx` — context with slug, name, emoji, color, hasChanges, setHasChanges
- Created `[slug]/layout.tsx` — Server Component fetches workspace preferences via DI
- Created `workspace-attention-wrapper.tsx` — client wrapper calling useAttentionTitle
- Wired browser-client to sync `panelState.workingChanges.length > 0` into context
- Exported from feature barrel
- 4/4 tests pass

### T004: Wire Emoji into Sidebar Header
- Added `useWorkspaceContext` to dashboard-sidebar.tsx
- Sidebar header shows `{emoji} {name}` when in workspace, falls back to decoded slug
- Had to wrap ternary else branch in Fragment after adding Settings link (JSX sibling issue)
- 8/8 tests pass

### T006-T008: EmojiPicker + ColorPicker (TDD)
- 4 tests for EmojiPicker: renders 30 emojis, click selects, current highlighted, clear button
- 4 tests for ColorPicker: renders 10 swatches, click selects, current highlighted, clear button
- Grid layout with ring indicator for current selection
- **Discovery**: Client components cannot import from `@chainglass/workflow` barrel — it pulls in server-side code (node-filesystem → fast-glob → fs). Fixed by adding subpath export `@chainglass/workflow/constants/workspace-palettes` to package.json.

### T009a + T009b: Settings Page
- Created `/settings/workspaces` route with Server Component wrapper + client table
- WorkspaceSettingsTable: inline emoji/color pickers, star toggle, remove with confirmation
- Added Settings link to sidebar nav (non-workspace mode)
- All mutations use existing server actions (updateWorkspacePreferences, toggleWorkspaceStar, removeWorkspace)
- Toast feedback on success/error

### T010: Pop-out Button
- Added `popOutUrl` prop to FileViewerPanelProps
- ExternalLink icon button in toolbar next to refresh
- browser-client computes URL from slug + worktree + file + mode
- 17/17 existing tests pass

### T011: Visual Verification
- Playwright browser automation had persistent connection issues (MCP server bug)
- Verified via Next.js MCP: `get_errors` → "No errors detected"
- Verified via curl: all 4 key pages return 200 (landing, settings, workspace detail, browser)
- Verified settings page renders: emoji/color pickers, star toggles, remove buttons per workspace
- Verified browser page renders pop-out "Open in new tab" button
- Verified workspace layout provides WorkspaceProvider context

### T012: Full Test Suite
- `just lint` — clean (1108 files, 0 errors)
- `just format` — clean (1108 files, 0 fixes)
- `pnpm test` — 4365 tests pass, 72 skipped (pre-existing), 314 test files
- Build failure is pre-existing (Plan 045 parallel work — fast-glob/fs in client bundle via di-container)

## Commits

| Commit | Description |
|--------|-------------|
| TBD | Plan 041 Phase 5: Attention system, workspace context, settings page, pickers, pop-out button |

