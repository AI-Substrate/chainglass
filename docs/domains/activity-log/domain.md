# Activity Log

> ## ⚠️ RETIRED — 2026-07-26
>
> **This domain no longer exists in the codebase.** The Activity Log was removed in the `sse-one-pipe`
> tmux tidy (commit `f89ae7ccf`): the `065-activity-log` feature, `/api/activity-log`, the overlay
> wrapper, the SDK toggle command, the sidebar entry, and the pane-title poll that fed it were all
> deleted. All eight source paths referenced below are gone; `/api/activity-log` returns **404**.
>
> **The document is preserved, not deleted, because its History is a record.** This does not contradict
> the "delete, don't deprecate" rule for dead SSE domains — that rule governs **code**, which still
> ships, still gets imported, and still misleads by running. A retired doc runs nothing; its changelog
> is history, and history is not rewritten (cf. the ADR-0007 → ADR-0015 supersession).
>
> **Do not read anything below as a description of current behaviour.**


| Field | Value |
|-------|-------|
| **Slug** | `activity-log` |
| **Type** | business |
| **Parent** | — |
| **Created By** | Plan 065 |
| **Status** | **retired** (2026-07-26) |

## Purpose

Append-only per-worktree timeline capturing what agents and terminal sessions are doing, persisted to disk for next-day recall. When you return to a workspace after time away, this domain answers "what was I working on?"

## Concepts

| Concept | Definition |
|---------|-----------|
| ActivityLogEntry | A single timestamped activity record with `id`, `source`, `label`, `timestamp`, and optional `meta` bag |
| source | Identifies what system produced an entry (e.g., "tmux", "agent", "build"). Convention: lowercase, no spaces |
| id | Dedup key in `{source}:{identifier}` format (e.g., "tmux:0.0", "agent:agent-1"). Same id + same label = duplicate |
| label | Human-readable description of current activity. Primary display text in the overlay |
| meta | Unstructured `Record<string, unknown>` for source-specific metadata. Writer persists as-is, reader returns as-is |
| dedup | Writer reads last 50 lines and skips write if last entry for same `id` has same `label` |
| ignore pattern | Per-source regex array for filtering noise (e.g., hostname pane titles). Sources own their own patterns |
| Overlay Toggle | `useActivityLogOverlay().toggleActivityLog()` | Opens overlay panel, dispatches overlay:close-all for mutual exclusion |
| Activity Feed | `GET /api/activity-log` | Returns last 200 entries for a worktree, newest-first |
| Toast Notifications | `useActivityLogToasts()` | Polls for new entries every 15s, shows toast for each new one |

## Contracts

| Contract | Type | Consumers | Description |
|----------|------|-----------|-------------|
| `ActivityLogEntry` | Type | terminal sidecar, API routes, overlay panel | Source-agnostic entry type with meta bag |
| `appendActivityLogEntry()` | Function | terminal sidecar, agent manager (future) | Append JSONL entry with dedup |
| `readActivityLog()` | Function | API routes, overlay panel | Read + filter entries (limit, since, source) |
| `shouldIgnorePaneTitle()` | Function | terminal sidecar | Tmux-specific noise filter |
| `ACTIVITY_LOG_FILE` | Constant | writer, reader | Filename: `activity-log.jsonl` |
| `useActivityLogOverlay()` | Hook | overlay panel, wrapper | Context provider + hook for overlay state |
| `ActivityLogOverlayProvider` | Component | workspace layout | Provider wrapping workspace for overlay state |

## Dependencies

| Domain | What We Consume | Required? |
|--------|----------------|-----------|
| _platform/panel-layout | PanelShell anchor for overlay positioning | Yes (Phase 3) |
| _platform/state | GlobalStateSystem for reactive state paths | No (future) |
| _platform/events | CentralEventNotifier for SSE broadcasting | No (future) |

## Composition

| Component | Kind | Location | Role |
|-----------|------|----------|------|
| ActivityLogEntry | type | apps/web/src/features/065-activity-log/types.ts | Source-agnostic entry contract |
| appendActivityLogEntry | function | apps/web/src/features/065-activity-log/lib/activity-log-writer.ts | JSONL append with dedup |
| readActivityLog | function | apps/web/src/features/065-activity-log/lib/activity-log-reader.ts | JSONL read with filtering |
| shouldIgnorePaneTitle | function | apps/web/src/features/065-activity-log/lib/ignore-patterns.ts | Tmux noise filter |
| ACTIVITY_LOG_FILE | constant | apps/web/src/features/065-activity-log/types.ts | Filename: activity-log.jsonl |
| GET /api/activity-log | route | apps/web/app/api/activity-log/route.ts | API route: read entries for worktree |
| useActivityLogOverlay | hook | apps/web/src/features/065-activity-log/hooks/use-activity-log-overlay.tsx | Context provider + hook for overlay state |
| ActivityLogOverlayPanel | component | apps/web/src/features/065-activity-log/components/activity-log-overlay-panel.tsx | Fixed-position overlay panel |
| ActivityLogEntryList | component | apps/web/src/features/065-activity-log/components/activity-log-entry-list.tsx | Entry list with gap separators |
| ActivityLogOverlayWrapper | component | apps/web/app/(dashboard)/workspaces/[slug]/activity-log-overlay-wrapper.tsx | Mounts provider + panel in layout |

## Consumers

| Domain | What They Consume | Phase |
|--------|------------------|-------|
| terminal | appendActivityLogEntry(), shouldIgnorePaneTitle() | Phase 2 |
| workspace layout | ActivityLogOverlayProvider, ActivityLogOverlayPanel | Phase 3 |
| sidebar | activity-log:toggle event dispatch | Phase 3 |
| SDK | activity-log.toggleOverlay command | Phase 3 |

## Source Tree

```
apps/web/src/features/065-activity-log/
  ├── types.ts                    # ActivityLogEntry type + constants
  ├── lib/
  │   ├── activity-log-writer.ts  # appendActivityLogEntry()
  │   ├── activity-log-reader.ts  # readActivityLog()
  │   └── ignore-patterns.ts     # shouldIgnorePaneTitle()
  ├── hooks/
  │   └── use-activity-log-overlay.tsx  # Context provider + hook
  └── components/
      ├── activity-log-overlay-panel.tsx  # Fixed-position overlay panel
      └── activity-log-entry-list.tsx     # Entry list with gap separators

apps/web/app/api/activity-log/
  └── route.ts                   # GET /api/activity-log

apps/web/app/(dashboard)/workspaces/[slug]/
  └── activity-log-overlay-wrapper.tsx  # Mounts provider + panel in layout
```

## History

| Plan | Changes | Date |
|------|---------|------|
| 065 Phase 1 | Domain created. Types, writer, reader, ignore patterns. | 2026-03-06 |
| 065 Phase 2 | getPaneTitles() multi-pane method, activity log writes in sidecar, pane title badge removed | 2026-03-06 |
| 065 Phase 3 | API route, overlay hook/provider, overlay panel, entry list with gap separators, sidebar button, SDK command, mutual exclusion with terminal/agent overlays | 2026-03-06 |
