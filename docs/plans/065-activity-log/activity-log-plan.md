# Worktree Activity Log Implementation Plan

**Plan Version**: 1.0.0
**Created**: 2026-03-06
**Spec**: [activity-log-spec.md](./activity-log-spec.md)
**Research**: [research-dossier.md](./research-dossier.md)
**Workshop**: [001-activity-log-writer-general-utility.md](./workshops/001-activity-log-writer-general-utility.md)
**Status**: DRAFT

## Summary

When returning to a workspace after time away, there's no way to recall what agents and terminal sessions were doing. This plan adds a per-worktree activity timeline that captures timestamped entries from multiple sources (initially tmux pane titles), persists them as JSONL to `.chainglass/data/activity-log.jsonl`, and displays them in an overlay panel toggled from the workspace sidebar. The persistence layer is designed as a general-purpose utility so future sources (agent intents, workflows, builds) plug in with zero refactoring. The current pane title badge (PR #37) is replaced by this feature.

## Target Domains

| Domain | Status | Relationship | Role |
|--------|--------|-------------|------|
| activity-log | **NEW** | create | Entry types, writer, reader, overlay UI, sidebar button |
| terminal | existing | modify | Extend sidecar: multi-pane polling + activity writes |
| _platform/panel-layout | existing | consume | PanelShell anchor for overlay positioning |

## Domain Manifest

| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| `apps/web/src/features/065-activity-log/types.ts` | activity-log | contract | ActivityLogEntry type |
| `apps/web/src/features/065-activity-log/lib/activity-log-writer.ts` | activity-log | contract | appendActivityLogEntry pure function |
| `apps/web/src/features/065-activity-log/lib/activity-log-reader.ts` | activity-log | contract | readActivityLog pure function |
| `apps/web/src/features/065-activity-log/lib/ignore-patterns.ts` | activity-log | internal | tmux pane title ignore list |
| `apps/web/src/features/065-activity-log/hooks/use-activity-log-overlay.tsx` | activity-log | contract | Context provider + hook for overlay state |
| `apps/web/src/features/065-activity-log/components/activity-log-overlay-panel.tsx` | activity-log | internal | Fixed-position overlay panel |
| `apps/web/src/features/065-activity-log/components/activity-log-entry-list.tsx` | activity-log | internal | Entry list with gap separators |
| `apps/web/app/(dashboard)/workspaces/[slug]/activity-log-overlay-wrapper.tsx` | activity-log | cross-domain | Mount provider in workspace layout |
| `apps/web/app/(dashboard)/workspaces/[slug]/layout.tsx` | activity-log | cross-domain | Add ActivityLogOverlayWrapper |
| `apps/web/app/api/activity-log/route.ts` | activity-log | contract | API route: read entries for worktree |
| `apps/web/src/features/064-terminal/server/tmux-session-manager.ts` | terminal | internal | Add getPaneTitles() multi-pane method |
| `apps/web/src/features/064-terminal/server/terminal-ws.ts` | terminal | internal | Replace pane title badge with activity log writes |
| `apps/web/src/features/064-terminal/components/terminal-inner.tsx` | terminal | internal | Remove paneTitle prop plumbing |
| `apps/web/src/features/064-terminal/components/terminal-overlay-panel.tsx` | terminal | internal | Remove overlay badge state/rendering |
| `apps/web/src/features/064-terminal/components/terminal-page-client.tsx` | terminal | internal | Remove page-level paneTitle state |
| `apps/web/src/features/064-terminal/components/terminal-page-header.tsx` | terminal | internal | Remove header badge rendering |
| `apps/web/src/features/064-terminal/components/terminal-view.tsx` | terminal | internal | Remove onPaneTitle prop pass-through |
| `apps/web/src/features/064-terminal/hooks/use-terminal-socket.ts` | terminal | internal | Remove pane_title client handling |
| `apps/web/src/features/064-terminal/types.ts` | terminal | contract | Remove pane_title message variant |
| `docs/domains/terminal/domain.md` | terminal | contract | Record Phase 2 dependency/history updates |
| `apps/web/src/lib/navigation-utils.ts` | _platform | cross-domain | Add activity-log nav item |
| `apps/web/src/components/dashboard-sidebar.tsx` | _platform | cross-domain | Add activity-log toggle button |
| `apps/web/src/lib/sdk/sdk-bootstrap.ts` | _platform | cross-domain | Register activity-log.toggleOverlay command |
| `docs/domains/activity-log/domain.md` | activity-log | contract | Domain definition |
| `docs/domains/registry.md` | _platform | cross-domain | Register new domain |
| `test/unit/web/features/065-activity-log/activity-log-writer.test.ts` | activity-log | internal | Writer TDD tests |
| `test/unit/web/features/065-activity-log/activity-log-reader.test.ts` | activity-log | internal | Reader TDD tests |
| `test/unit/web/features/065-activity-log/ignore-patterns.test.ts` | activity-log | internal | Ignore list tests |
| `test/contracts/activity-log.contract.test.ts` | activity-log | internal | Roundtrip integration tests for writer/reader |
| `test/unit/web/features/064-terminal/tmux-session-manager.test.ts` | terminal | internal | Add getPaneTitles tests |

## Key Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | Critical | CWD ≠ worktree path. User may open terminal from subdirectory (e.g., `apps/web/`). Sidecar must resolve worktree root via `git rev-parse --show-toplevel`. | Phase 2: resolve worktree root in handleConnection before activity writes. |
| 02 | Critical | `tmux list-panes -t <session>` only lists panes in the **active window**. Must add `-s` flag to list panes across ALL windows in session. | Phase 2: use `-s` flag in getPaneTitles. |
| 03 | Critical | No existing "activity log" or "event timeline" concept in any domain. Confirmed safe to create new domain. | Phase 1: create activity-log domain. |
| 04 | High | Sidebar buttons are declarative — add to `WORKSPACE_NAV_ITEMS` array in `navigation-utils.ts`. No JSX modifications. | Phase 3: add nav item to array. |
| 05 | High | Terminal overlay provider mounts in `apps/web/app/(dashboard)/workspaces/[slug]/layout.tsx` via wrapper. Activity log follows same pattern. | Phase 3: add ActivityLogOverlayWrapper. |
| 06 | High | Anchor attribute `data-terminal-overlay-anchor` is shared. DO NOT RENAME. Mutual exclusion via custom event: dispatch `overlay:close-all` before opening. | Phase 3: implement mutual exclusion via custom events. |
| 07 | High | Hostname ignore list incomplete for non-macOS. Add shell names (`bash`, `zsh`, `fish`), login shells (`-bash`), bare hostnames. | Phase 1: comprehensive ignore list with cross-OS coverage. |
| 08 | High | Constitution requires interface-first development. Writer/reader are pure functions (no class/DI) per workshop decision. This is a documented deviation: sidecar has no DI container. | Document exception: sidecar pure functions are testable via parameter injection (worktreePath). No DI container needed. |

## Phases

### Phase 1: Activity Log Domain — Types, Writer, Reader

**Objective**: Create the activity-log domain with general-purpose persistence utilities and TDD test coverage.
**Domain**: activity-log (NEW)
**Delivers**:
- `ActivityLogEntry` type with `meta` bag (per workshop)
- `appendActivityLogEntry()` pure function with dedup
- `readActivityLog()` pure function with limit/since/source filtering
- `shouldIgnorePaneTitle()` filter with comprehensive ignore patterns
- TDD tests for all of the above
- Domain definition (`docs/domains/activity-log/domain.md`)
- Registry entry
- `.gitignore` entry for `activity-log.jsonl`

**Depends on**: None
**Key risks**: None — greenfield domain, no integration yet.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 1.1 | Create `ActivityLogEntry` type in `types.ts` | activity-log | Type exports with `id`, `source`, `label`, `timestamp`, `meta?` fields | Per workshop schema |
| 1.2 | Implement `appendActivityLogEntry()` with dedup | activity-log | TDD: appends entry, skips duplicates (same id+label), creates directory, handles missing file | Per workshop: last 50 lines lookback |
| 1.3 | Implement `readActivityLog()` with filtering | activity-log | TDD: reads JSONL, skips malformed, respects limit (default 200), since, source filters | Returns newest last (caller reverses for display) |
| 1.4 | Implement `shouldIgnorePaneTitle()` | activity-log | TDD: filters `*.localdomain`, `*.local`, empty, shell names (`bash`, `zsh`, `fish`, `-bash`), bare paths | Per finding 07 |
| 1.5 | Create domain.md + update registry + domain-map | activity-log | Domain registered in registry.md. domain.md created with Purpose, Contracts, Concepts, Dependencies, History. domain-map.md updated with activity-log node + edges to terminal, _platform/panel-layout. | Per finding 03 |
| 1.6 | Add `activity-log.jsonl` to `.gitignore` | activity-log | File is not tracked by git | Per clarification Q9 |
| 1.7 | Create contract test factory | activity-log | `test/contracts/activity-log.contract.ts` with conformance tests for writer dedup and reader filtering. Runs against real implementation with temp directories. | Per codebase contract test pattern |

### Phase 2: Terminal Sidecar — Multi-Pane Polling + Activity Writes

**Objective**: Extend the terminal sidecar to poll all panes across all windows and write activity entries to disk, replacing the single-pane badge approach.
**Domain**: terminal (modify)
**Delivers**:
- `getPaneTitles()` method on TmuxSessionManager (replaces `getPaneTitle()`)
- Sidecar resolves worktree root from CWD via `git rev-parse --show-toplevel`
- Sidecar writes activity entries via `appendActivityLogEntry()`
- Removes `pane_title` WS message type and badge (replaced by activity log)
- Tests for multi-pane polling and worktree resolution

**Depends on**: Phase 1
**Key risks**: Per finding 01, CWD ≠ worktree path. Per finding 02, must use `-s` flag for multi-window pane listing.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 2.1 | Add `getPaneTitles()` to TmuxSessionManager | terminal | TDD: returns `Array<{pane, title}>` for all panes across all windows. Uses `list-panes -t <session> -s`. | Per finding 02: `-s` flag |
| 2.2 | Add worktree root resolution in sidecar | terminal | Resolves CWD → worktree root via `git rev-parse --show-toplevel`. Falls back to CWD if git unavailable. | Per finding 01 |
| 2.3 | Replace pane title polling with activity log writes | terminal | Sidecar polls all panes, filters with `shouldIgnorePaneTitle()`, calls `appendActivityLogEntry()`. Removes old `pane_title` WS message path. | Replaces PR #37 badge code |
| 2.4 | Remove pane title badge from terminal header | terminal | Remove `paneTitle` prop, `onPaneTitle` callback, and badge rendering from TerminalPageHeader, TerminalOverlayPanel, TerminalInner, TerminalView, TerminalPageClient, useTerminalSocket | Clean removal of stepping-stone code |
| 2.5 | Update terminal tests | terminal | getPaneTitles tests pass. Existing pane title badge tests removed. | |

### Phase 3: Overlay Panel + Sidebar Button

**Objective**: Build the activity log overlay panel, sidebar toggle button, and mutual exclusion with terminal overlay.
**Domain**: activity-log (UI layer)
**Delivers**:
- API route to read activity log entries
- `useActivityLogOverlay()` context provider + hook
- `ActivityLogOverlayPanel` component with entry list and gap separators
- `ActivityLogOverlayWrapper` mounted in workspace layout
- Sidebar button dispatching `activity-log:toggle`
- SDK command registration
- Mutual exclusion: opening activity log closes terminal overlay (and vice versa)

**Depends on**: Phase 1, Phase 2
**Key risks**: Per finding 06, mutual exclusion requires custom event coordination. Per finding 05, must mount provider in exact same location as terminal overlay wrapper.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 3.1 | Create API route `GET /api/activity-log` | activity-log | Accepts `worktree` query param, validates path, returns last 200 entries via `readActivityLog()` | Per finding: validate worktree path |
| 3.2 | Create `useActivityLogOverlay()` hook + provider | activity-log | Context manages `isOpen` state. Listens for `activity-log:toggle` custom event. Dispatches `overlay:close-all` before opening. | Per finding 06: mutual exclusion |
| 3.3 | Create `ActivityLogOverlayPanel` component | activity-log | Fixed-position panel anchored to `data-terminal-overlay-anchor`. Fetches entries from API on open. Renders reverse-chronological list. Closes on Escape. | Mirror terminal-overlay-panel.tsx |
| 3.4 | Create `ActivityLogEntryList` with gap separators | activity-log | Renders entries with source icons. Inserts gap separator when >30min between entries. | Per AC-13 |
| 3.5 | Create `ActivityLogOverlayWrapper` + mount in layout | activity-log | Wrapper component with provider. Mounted in workspace `layout.tsx` alongside terminal wrapper. | Per finding 05 |
| 3.6 | Add sidebar button + SDK command | _platform | Button in WORKSPACE_NAV_ITEMS dispatches `activity-log:toggle`. SDK registers `activity-log.toggleOverlay` command. | Per finding 04: declarative array |
| 3.7 | Add mutual exclusion to terminal overlay | terminal | Terminal overlay listens for `overlay:close-all` and closes itself. Activity log does the same. | Per AC-09 |
| 3.8 | Lightweight UI tests | activity-log | Overlay panel renders, entry list renders with fixture entries, gap separators appear | Export/type verification, no mocks |

## Acceptance Criteria

- [ ] AC-01: Pane title changes append entries to `<worktree>/.chainglass/data/activity-log.jsonl`
- [ ] AC-02: All panes across all windows in the tmux session are polled
- [ ] AC-03: Hostname/default/shell pane titles are filtered out
- [ ] AC-04: Consecutive identical labels for the same id are deduplicated
- [ ] AC-05: Activity log survives server restarts (persisted to disk)
- [ ] AC-06: Sidebar button toggles overlay (visible only with worktree selected)
- [ ] AC-07: Overlay pops over editor area, reverse chronological order
- [ ] AC-08: Overlay closes on Escape
- [ ] AC-09: Terminal and activity log overlays are mutually exclusive
- [ ] AC-10: Writer is general-purpose (`{ source, label, id, timestamp, meta? }`)
- [ ] AC-11: Reader returns last 200 entries by default
- [ ] AC-12: Ignore list is configurable regex array per source
- [ ] AC-13: Gap separators render between entries >30min apart
- [ ] AC-14: `activity-log.jsonl` is gitignored

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| CWD ≠ worktree path | High | High | Phase 2.2: git rev-parse resolution |
| Multi-window pane listing | Medium | High | Phase 2.1: use `-s` flag |
| Overlay mutual exclusion race | Low | Medium | Phase 3.7: custom event coordination |
| Sidecar crash mid-write | Low | Low | Reader skips malformed JSONL lines |
| Incomplete hostname ignore list | Medium | Low | Phase 1.4: comprehensive cross-OS patterns |

## Constitution Deviations

| Principle | Why Needed | Alternative Rejected | Mitigation |
|-----------|------------|---------------------|------------|
| P2: Interface-First (DI) | Writer/reader are pure functions in sidecar (no DI container available). Workshop decided this. | Service class with DI — can't use in sidecar process. | Functions are testable via parameter injection (worktreePath + temp dirs). Contract test factory (`test/contracts/activity-log.contract.ts`) verifies behavioral parity. FakeTmuxExecutor pattern used for tmux commands. |
| ADR-0008: Layer 2 git-committed | Activity log is gitignored — it is personal observability data (diary), not shared project state. ADR-0008 Layer 2 stipulates "git-committed, merges across branches". | Committing to git — bloats history with append-only data, creates merge conflicts between worktrees, noisy diffs. | Documented exception. File is local-only, analogous to editor temp files. Does not affect team collaboration. |
