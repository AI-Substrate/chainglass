# Worktree Activity Log

**Mode**: Full

📚 This specification incorporates findings from research-dossier.md (71 findings, 8 subagents)

## Research Context

Research identified the terminal overlay (Plan 064) as the reference architecture for the UI pattern, and `.chainglass/data/` (ADR-0008 Layer 2) as the persistence model. Key findings: terminal sidecar already polls pane titles and can be extended to write activity entries; the overlay panel, sidebar button, and context provider patterns are directly replicable. Critical discovery: current implementation polls one pane — must poll all panes per session for multi-agent visibility. The current pane title badge (PR #37) is a stepping stone that will be **replaced** by this feature.

## Summary

**What**: A per-worktree activity timeline that records what agents and terminal sessions have been doing — persisted to disk so you can come back the next day and see what happened.

**Why**: When you return to a workspace after time away (next morning, after context switch), you can't remember what was being worked on. Multiple agents may have been running across multiple tmux panes. This feature captures a timestamped log from all sources and displays it in a unified overlay panel.

## Goals

- Record timestamped activity entries from multiple sources (tmux pane titles, agent intents, future sources) into a per-worktree append-only log
- Persist activity log to disk so it survives server restarts, page refreshes, and overnight gaps
- Display activity timeline via an overlay panel that pops over the editor area (same pattern as terminal overlay)
- Add a sidebar button for quick toggle access
- Show activity from ALL tmux panes in a session, not just the active one — multiple agents working simultaneously are all visible
- Filter noise: ignore default/hostname pane titles, deduplicate repeated statuses
- Design the persistence layer as a general utility — not narrowly scoped to tmux pane titles — so future sources (agent intents, workflow events, build results) can plug in with zero refactoring

## Non-Goals

- Real-time streaming of activity into the overlay (initial load from disk is sufficient; SSE integration is a future enhancement)
- Cross-worktree activity aggregation (each worktree has its own log; cross-worktree is a separate feature)
- Log rotation or archival (24h+ entries can accumulate; cleanup is a future concern)
- Replacing the terminal overlay — both overlays coexist (mutual exclusion when open)
- Full-text search of activity history (simple chronological list is enough for v1)

## Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|-------------|---------------------|
| activity-log | **NEW** | **create** | New domain owning activity entry types, writer, reader, and overlay UI |
| terminal | existing | **modify** | Extend sidecar to poll all panes + write activity entries to disk |
| _platform/panel-layout | existing | **consume** | Use PanelShell anchor for overlay positioning |
| _platform/state | existing | **consume** | Future: publish activity state paths for reactive UI |
| _platform/events | existing | **consume** | Future: SSE broadcasting of new entries |

### New Domain Sketches

#### activity-log [NEW]
- **Purpose**: Append-only per-worktree timeline capturing what agents and terminal sessions are doing, persisted to disk for next-day recall
- **Boundary Owns**: ActivityLogEntry type, ActivityLogWriter (filesystem append), ActivityLogReader (filesystem read), ignore list filtering, dedup logic, overlay panel UI, sidebar button
- **Boundary Excludes**: Source polling (owned by terminal sidecar, agent manager, etc.), SSE broadcasting (owned by _platform/events), state management (owned by _platform/state), overlay anchor element (owned by _platform/panel-layout)

## Complexity

- **Score**: CS-3 (medium)
- **Breakdown**: S=2, I=1, D=1, N=1, F=0, T=1 (Total: 6)
- **Confidence**: 0.85
- **Assumptions**:
  - Terminal sidecar is the only writer initially (no concurrent write contention)
  - JSONL append is safe for single-writer scenarios
  - Terminal overlay pattern is stable and replicable
- **Dependencies**:
  - Terminal sidecar must be running for tmux pane title capture
  - tmux must be installed for pane title source
- **Risks**:
  - Multi-pane polling may produce noisy logs if many panes have rapid title changes
  - Overlay anchor sharing with terminal overlay needs z-index/mutual-exclusion coordination
- **Phases**:
  1. Types + writer/reader + ignore list + dedup (general utility layer)
  2. Extend terminal sidecar to write entries (multi-pane polling)
  3. Overlay panel + sidebar button + provider
  4. Remove pane title badge (replaced by activity log overlay)

## Acceptance Criteria

1. **AC-01**: When a tmux pane's title changes (e.g., Copilot CLI `report_intent` fires), a timestamped entry is appended to `<worktree>/.chainglass/data/activity-log.jsonl`
2. **AC-02**: All panes in the tmux session are polled, not just the active pane — each pane produces its own entries with a unique `id` (e.g., `tmux:0.0`, `tmux:1.0`)
3. **AC-03**: Default/hostname pane titles (matching `*.localdomain`, `*.local`, empty strings) are filtered and never written to the log
4. **AC-04**: Consecutive identical labels for the same `id` are deduplicated — only the first occurrence is written
5. **AC-05**: Activity log survives server restarts — entries persist on disk and are readable after sidecar restart
6. **AC-06**: A new button appears in the workspace sidebar (visible only when a worktree is selected) that toggles the activity log overlay
7. **AC-07**: The activity log overlay panel pops over the editor area (same anchor and positioning as terminal overlay), showing entries in reverse chronological order
8. **AC-08**: The overlay closes on Escape key press
9. **AC-09**: Terminal overlay and activity log overlay are mutually exclusive — opening one closes the other
10. **AC-10**: The ActivityLogWriter is a general-purpose utility accepting any `{ source, label, id, pane?, timestamp }` entry — not hardcoded to tmux
11. **AC-11**: The ActivityLogReader returns entries for a worktree, most recent first, limited to the last 200 entries by default
12. **AC-12**: The ignore list is configurable as a constant (array of regex patterns) so future sources can add their own noise filters
13. **AC-13**: The overlay renders gap separators between entries separated by >30 minutes, visually grouping work sessions
14. **AC-14**: The `activity-log.jsonl` file is gitignored (added to `.chainglass/.gitignore` or project `.gitignore`)

## Risks & Assumptions

- **Risk**: If the sidecar crashes mid-write, a JSONL line could be partially written. Mitigation: JSONL reader skips malformed lines gracefully.
- **Risk**: Overlay anchor sharing — both terminal and activity log overlays measure the same anchor element. Mitigation: mutual exclusion (AC-09).
- **Assumption**: Single-writer (terminal sidecar only initially). If multiple writers emerge, file locking or a coordination service may be needed.
- **Assumption**: The sidecar can derive the worktree path from the CWD passed via the WebSocket connection URL.
- **Assumption**: 10s polling interval is sufficient granularity for activity capture.

## Open Questions

_(All resolved — see Clarifications below)_

## Testing Strategy

- **Approach**: Hybrid — TDD for writer/reader/dedup logic, lightweight for UI overlay components
- **Rationale**: Writer dedup and ignore-list filtering have nuanced edge cases that benefit from test-first. UI components are pattern replications from terminal overlay — verify they render, skip deep interaction tests.
- **Focus Areas**: `appendActivityLogEntry` dedup, `readActivityLog` filtering, `shouldIgnorePaneTitle` patterns, `getPaneTitles` multi-pane parsing
- **Excluded**: Deep overlay interaction tests, SSE integration (future phase)
- **Mock Usage**: None — fakes and real fixtures only (Constitution P4). Use temp directories for filesystem tests, FakeTmuxExecutor for tmux command injection.

## Documentation Strategy

- **Location**: domain.md only (created as part of domain registration)
- **Rationale**: Workshop document covers extension patterns. domain.md documents contracts and boundaries. No additional how-to guide needed for v1.

## Clarifications

### Session 2026-03-05

**Q1: Workflow Mode** → **Full** (CS-3, 4 phases, all gates required)

**Q2: Testing Strategy** → **Hybrid** (TDD for writer/reader/dedup, lightweight for UI)

**Q3: Mock Usage** → **None** — fakes and fixtures only (Constitution P4)

**Q4: Documentation** → **domain.md only** — workshop covers extension patterns

**Q5: Domain Review** → **Approved as-is** — activity-log owns persistence + UI, sources own their polling

**Q6: Overlay entry limit** → **Last 200 entries** — covers several hours of multi-pane activity without performance issues

**Q7: Gap grouping** → **Yes** — show gap separators when >30min between entries, helps visually separate work sessions for next-day recall

**Q8: Sidebar badge** → **No badge for v1** — add later, avoids tracking "last viewed" state complexity

**Q9: .gitignore** → **Yes, gitignore** — personal activity diary, avoids merge conflicts, can grow large

## Workshop Opportunities

| Topic | Type | Why Workshop | Key Questions |
|-------|------|--------------|---------------|
| ActivityLogWriter as general utility | Storage Design | Writer must be source-agnostic, extensible for agent intents / workflow events / build results — need to define the contract and extension patterns before architecture | What metadata fields are required vs optional? How do future sources register their ignore patterns? Should entries carry structured metadata beyond `label`? |
| Multi-overlay coordination | Integration Pattern | Terminal + activity log overlays share the same anchor — need to define the coordination protocol (mutual exclusion, stacking, or split) | Should overlays be mutually exclusive? Should they share a single "overlay manager" context? What about future overlays (e.g., agent panel)? |
