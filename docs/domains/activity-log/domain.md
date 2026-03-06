# Activity Log

| Field | Value |
|-------|-------|
| **Slug** | `activity-log` |
| **Type** | business |
| **Parent** | — |
| **Created By** | Plan 065 |
| **Status** | active |

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

## Contracts

| Contract | Type | Consumers | Description |
|----------|------|-----------|-------------|
| `ActivityLogEntry` | Type | terminal sidecar, API routes, overlay panel | Source-agnostic entry type with meta bag |
| `appendActivityLogEntry()` | Function | terminal sidecar, agent manager (future) | Append JSONL entry with dedup |
| `readActivityLog()` | Function | API routes, overlay panel | Read + filter entries (limit, since, source) |
| `shouldIgnorePaneTitle()` | Function | terminal sidecar | Tmux-specific noise filter |
| `ACTIVITY_LOG_FILE` | Constant | writer, reader | Filename: `activity-log.jsonl` |

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

## Consumers

| Domain | What They Consume | Phase |
|--------|------------------|-------|
| terminal | appendActivityLogEntry(), shouldIgnorePaneTitle() | Phase 2 |

## Source Tree

```
apps/web/src/features/065-activity-log/
  ├── types.ts                    # ActivityLogEntry type + constants
  ├── lib/
  │   ├── activity-log-writer.ts  # appendActivityLogEntry()
  │   ├── activity-log-reader.ts  # readActivityLog()
  │   └── ignore-patterns.ts     # shouldIgnorePaneTitle()
  ├── hooks/                      # (Phase 3)
  └── components/                 # (Phase 3)
```

## History

| Plan | Changes | Date |
|------|---------|------|
| 065 Phase 1 | Domain created. Types, writer, reader, ignore patterns. | 2026-03-06 |
