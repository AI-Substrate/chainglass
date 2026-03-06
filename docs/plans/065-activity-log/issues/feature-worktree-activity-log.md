# Worktree Activity Log

**Type**: Feature
**Complexity**: CS-3 (S=2, I=1, D=1, N=1, F=0, T=1)
**Domain**: activity-log (NEW) + terminal (modify)

## Objective

Per-worktree activity timeline that records what agents and terminal sessions have been doing — persisted to disk so you can come back the next day and see what happened. Multiple sources (tmux pane titles, agent intents, future sources) feed timestamped entries into a unified log, displayed via an overlay panel.

## Acceptance Criteria

1. Tmux pane title changes append timestamped entries to `<worktree>/.chainglass/data/activity-log.jsonl`
2. ALL panes in the tmux session are polled — each pane gets a unique `id` (e.g., `tmux:0.0`, `tmux:1.0`)
3. Hostname/default pane titles (`*.localdomain`, `*.local`, empty) are filtered out
4. Consecutive identical labels for the same `id` are deduplicated
5. Activity log survives server restarts (persisted to disk)
6. Sidebar button toggles the activity log overlay (visible only with worktree selected)
7. Overlay pops over the editor area (same anchor as terminal overlay), reverse chronological
8. Overlay closes on Escape
9. Terminal and activity log overlays are mutually exclusive
10. ActivityLogWriter is general-purpose — accepts `{ source, label, id, timestamp, meta? }`, not hardcoded to tmux
11. Reader returns last 200 entries by default, most recent first
12. Ignore list is configurable as regex array per source
13. Gap separators render between entries >30min apart
14. `activity-log.jsonl` is gitignored

## Goals

- Record timestamped activity from multiple sources into per-worktree append-only JSONL
- Persist to disk — survives restarts, page refreshes, overnight gaps
- Display via overlay panel with sidebar toggle (terminal overlay pattern)
- Capture ALL tmux panes simultaneously for multi-agent visibility
- Filter noise and deduplicate repeated statuses
- General-purpose persistence layer — future sources plug in with zero refactoring

## Non-Goals

- Real-time SSE streaming (initial load from disk is sufficient for v1)
- Cross-worktree aggregation
- Log rotation or archival
- Replacing the terminal overlay
- Full-text search

## Context

4 implementation phases planned:
1. Types + writer/reader + ignore list + dedup (general utility layer)
2. Extend terminal sidecar for multi-pane polling + activity writes
3. Overlay panel + sidebar button + provider
4. Remove pane title badge (replaced by activity log overlay)

Testing: Hybrid (TDD for writer/reader/dedup, lightweight for UI). No mocks — fakes only.

### Cross-Domain Dependencies

- `activity-log` → `terminal` (consumes: pane title polling, sidecar writes activity entries)
- `activity-log` → `_platform/panel-layout` (consumes: PanelShell anchor for overlay positioning)
- `activity-log` → `_platform/state` (future: reactive state paths)
- `activity-log` → `_platform/events` (future: SSE broadcasting)

## Domain Impact

| Domain | Status | Relationship | Changes |
|--------|--------|-------------|---------|
| activity-log | **NEW** | create | New domain: entry types, writer, reader, overlay UI, sidebar button |
| terminal | existing | modify | Extend sidecar: multi-pane polling, activity log writes |
| _platform/panel-layout | existing | consume | No changes — use existing PanelShell anchor |
| _platform/state | existing | consume | No changes v1 — future SSE integration |
| _platform/events | existing | consume | No changes v1 — future SSE integration |

## Key Risks

- Sidecar crash mid-write → partial JSONL line. Mitigation: reader skips malformed lines.
- Both overlays share same anchor. Mitigation: mutual exclusion (opening one closes the other).
- Multi-pane polling may produce noisy logs. Mitigation: ignore list + dedup.

## Labels

`type:feature`, `complexity:cs-3`, `domain:activity-log`, `domain:terminal`

## References

- Spec: `docs/plans/065-activity-log/activity-log-spec.md`
- Research: `docs/plans/065-activity-log/research-dossier.md`
- Workshop: `docs/plans/065-activity-log/workshops/001-activity-log-writer-general-utility.md`

---
*Generated from spec. See referenced documents for implementation details.*
