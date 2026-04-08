# tmux Copilot Status Bar

**Mode**: Simple

## Workshop Context

This specification incorporates findings from [workshops/001-status-line-ui.md](workshops/001-status-line-ui.md).

## Summary

Add a **copilot session status row** to the terminal overlay panel header in the Chainglass web app — directly underneath the existing tmux window badges bar. For each tmux pane running Copilot CLI, display: window index, model, reasoning effort, token usage (prompt tokens vs context window), percentage, turn count, and time since last turn. Multiple sessions flow inline separated by `║`, wrapping as needed.

This extends the existing terminal overlay infrastructure (Plan 064/065) which already polls tmux pane titles every 10s on the backend and renders window badges every 15s on the frontend. We add a **new activity log source** (`copilot`) alongside the existing `tmux` source, using the same polling + activity log + API + hook pattern.

## Goals

- Show **all** copilot sessions running across tmux panes in the terminal overlay header
- Per session: **window index**, **model**, **reasoning effort**, **tokens used/total**, **percentage**, **turn count**, **last turn time ago**
- Color-code the percentage: green (<50%), yellow (50-75%), orange (75-90%), red (90%+)
- Reuse existing architecture: backend poll → activity log → API → frontend hook → component
- Backend detection on a separate 30s interval (copilot metadata changes slowly; avoids blocking pane-title 10s poll)
- Frontend refreshes on 15s interval matching window badges
- Render as a new row below the existing window badges in `TerminalOverlayPanel`
- No emoji in the output

## Non-Goals

- Not modifying the tmux status bar itself (this is purely web UI)
- Not adding interactive controls to the copilot status badges
- Not persisting historical token usage or graphing trends
- Not supporting non-tmux environments

## Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|-------------|---------------------|
| terminal | existing | **extend** | Add copilot session detection to the terminal sidecar's poll loop and a new UI row to the overlay panel header |
| activity-log | existing | **consume** | Write copilot session entries as a new `source: 'copilot'` alongside existing `source: 'tmux'` entries |

## Complexity

- **Score**: CS-2 (small)
- **Confidence**: 0.95
- **Phases**: Single phase

## Architecture — Extends Existing Pattern

```
Backend (terminal-ws.ts sidecar)
  existing: poll tmux pane titles every 10s → write activity log (source: "tmux")
  NEW:      poll copilot sessions every 10s → write activity log (source: "copilot")
            Detection: tmux pane TTY → ps copilot PID → lock file → session ID
            Data: model, effort, prompt tokens, context window, turns, last turn time

API (activity-log/route.ts)
  existing: GET /api/activity-log?source=tmux   → window badges
  NEW:      GET /api/activity-log?source=copilot → copilot session badges
  (no API changes needed — source filter already works)

Frontend
  existing: useTerminalWindowBadges hook → polls source=tmux
  NEW:      useCopilotSessionBadges hook → polls source=copilot (same pattern)
  
  existing: TerminalOverlayPanel header row with window badges
  NEW:      Second row below window badges with copilot session status
```

## Acceptance Criteria

1. A new row appears below the window badges in the terminal overlay header showing copilot session status
2. Each session displays: window index, model, reasoning effort, tokens used/total, percentage, turn count, last turn time ago
3. Percentage is color-coded: green/yellow/orange/red based on context budget usage
4. Multiple sessions appear inline separated by `║`, wrapping as needed
5. When no copilot sessions are running, the row is hidden (not blank)
6. Data refreshes regularly (backend 30s, frontend 15s)
7. The backend detection reuses the proven lock file + events.jsonl + process log approach from `scripts/explore/copilot-tmux-sessions.sh`
8. Existing terminal overlay behavior is unchanged

## Key Files to Modify

| File | Change |
|------|--------|
| `apps/web/src/features/064-terminal/server/terminal-ws.ts` | Add copilot session detection to the existing poll interval, write `source: 'copilot'` activity log entries |
| `apps/web/src/features/064-terminal/server/tmux-session-manager.ts` | Add `getCopilotSessions()` method — detect copilot PIDs on pane TTYs, resolve session metadata |
| `apps/web/src/features/064-terminal/hooks/use-copilot-session-badges.ts` | New hook (mirrors `use-terminal-window-badges.ts`) — polls `source=copilot` activity log |
| `apps/web/src/features/064-terminal/components/terminal-overlay-panel.tsx` | Add copilot status row below window badges |

## Risks & Assumptions

- **Risk**: Copilot CLI file format changes break parsing → **Mitigation**: Graceful degradation, show "—" for missing data
- **Assumption**: Python 3 not needed — detection logic reimplemented in Node.js (TypeScript) in the sidecar
- **Assumption**: `~/.copilot/` path is accessible from the sidecar process

## Open Questions

*None — all resolved in workshop and exploration.*
