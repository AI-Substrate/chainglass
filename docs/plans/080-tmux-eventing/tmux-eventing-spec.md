# tmux Eventing System

**Mode**: Simple

## Research Context

📚 This specification incorporates findings from `research-dossier.md` (63 findings, 8 subagents).

Key research findings informing this spec:
- All transport infrastructure exists (SSE mux, channel hooks, central event notifier) — no new SSE needed
- tmux `window_bell_flag` and `pane_current_command` reliably detect bell and busy/idle transitions (validated in prototype)
- No audio infrastructure exists in the codebase — sound is genuinely new
- TitleManager already supports named prefix slots (`setTitlePrefix('attention', '❗')` used by question popper) — flash is a small addition
- One monitor script watching all tmux sessions system-wide (29 panes, 14 sessions) is trivial at 1s polling

## Summary

When a terminal task finishes and rings the bell (`\a`), the user should hear a notification sound and see a visual indicator in the browser tab — even if they're on a different page or tab. This tells users "that thing you were waiting for is done" without them having to watch the terminal.

The system raises all tmux events (bell, busy/idle, title change, cwd change) to the central event service using existing infrastructure. For the MVP, only bell events trigger user-visible notifications (sound + title flash). Other events are captured for future use.

## Goals

- **Know when things finish**: Play a notification sound and flash the browser tab title when any tmux pane in the workspace rings the bell
- **Works across pages**: Bell notifications fire regardless of which page the user is on within the workspace (browser, workflows, terminal, etc.)
- **Zero new infrastructure**: Reuse existing SSE mux, channel hooks, TitleManager, and central event notifier — no new transport or connection mechanisms
- **Central monitor**: One process watches all tmux sessions, matching them to workspaces and routing events to the right browser tabs
- **Capture everything, surface selectively**: Detect and raise all meaningful tmux state changes (bell, busy/idle, cwd, title), but only surface bell notifications in the MVP — other events are available for future features

## Non-Goals

- **Per-pane UI indicators** — no busy/idle badges or per-window status displays (future feature)
- **Custom notification sounds** — user provides one wav file; no sound picker or per-event sound configuration
- **Notification preferences/muting** — no settings to disable or configure bell behavior (can be added later)
- **Cross-workspace notifications** — bell only notifies browser tabs viewing that workspace, not other workspaces
- **Desktop notifications** — browser tab title flash and audio only; no OS-level notification popups
- **Activity log integration** — bell events are not written to the activity log (the existing pane-title polling already captures activity)

## Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|-------------|---------------------|
| terminal | existing | **modify** | tmux monitor script lives here; raises events to the server |
| _platform/events | existing | **consume** | SSE broadcast via existing `sseManager.broadcast()` — no changes to domain code |
| _platform/sdk | existing | **modify** | TitleManager extended with flash/auto-clear behavior |
| activity-log | existing | **consume** | Precedent for tmux → server → browser event flow — no changes |

No new domains needed.

## Complexity

- **Score**: CS-2 (small)
- **Breakdown**: S=1, I=0, D=0, N=0, F=0, T=1
  - Surface Area (1): ~5 modified files, ~3 new files, touches terminal + SDK + workspace layout
  - Integration (0): All internal — tmux CLI (already used), existing SSE
  - Data/State (0): No schema changes, no persistence
  - Novelty (0): Well-specified from prototype and research; clear design
  - Non-Functional (0): Standard — 1s polling is negligible, audio playback is browser-native
  - Testing (1): Unit tests for event parsing + title flash; integration test for SSE channel
- **Confidence**: 0.90
- **Assumptions**: User will provide a wav file; tmux is always available on the server
- **Dependencies**: None external — all infrastructure exists
- **Risks**: Audio autoplay policies in browsers may require user interaction before first sound
- **Phases**: Single phase (Simple mode)

## Acceptance Criteria

1. **AC-01**: When a tmux pane in a workspace session rings the bell (`\a`), a notification sound plays in all browser tabs viewing that workspace
2. **AC-02**: When a bell fires, the browser tab title flashes with a `🔔` prefix that auto-clears after 5 seconds
3. **AC-03**: The monitor script detects bells across all tmux sessions system-wide, not just the current workspace
4. **AC-04**: Bell notifications work regardless of which page the user is on within the workspace (browser, terminal, workflows, settings, etc.)
5. **AC-05**: The monitor script starts as part of the dev server lifecycle and stops when the server stops
6. **AC-06**: If the monitor script crashes or tmux is unavailable, the application continues to function normally — no errors, no broken UI
7. **AC-07**: The SSE channel `tmux-events` is registered in the workspace layout's channel list and events flow through the existing multiplexed SSE provider
8. **AC-08**: All tmux state changes (bell, busy/idle transitions, cwd changes, title changes) are raised as events, even though only bell triggers user-visible notifications in this version
9. **AC-09**: A wav file placed at a known path is played via the browser's Audio API when a bell event is received
10. **AC-10**: The title flash does not interfere with existing title prefix slots (question popper's `❗`, attention prefix, etc.)

## Risks & Assumptions

| Risk | Impact | Mitigation |
|------|--------|------------|
| Browser audio autoplay restrictions | Sound may not play until user interacts with page | Use Audio API with user gesture unlock pattern; degrade gracefully to title-only flash |
| tmux session name ≠ workspace slug | Monitor can't match events to workspaces | Use existing session naming convention (sanitized worktree name) to map session → workspace |
| Monitor script polling overhead | CPU usage with many sessions | 29 panes at 1s polling is negligible; tested in prototype |
| Bell flag is per-window, not per-pane | May miss rapid bells in same window | Acceptable for MVP — polling catches the flag within 1s |

**Assumptions**:
- tmux is always available on the development machine
- The tmux session naming convention maps reliably to workspace identifiers
- The user will provide a wav file (not bundled)
- Browser tabs remain connected to SSE when backgrounded (existing behavior)

## Open Questions

None — all questions resolved by research, prototype validation, and clarification session.

## Workshop Opportunities

None needed. The design is straightforward: existing patterns, validated prototype, clear domain boundaries.

## Testing Strategy

- **Approach**: Lightweight
- **Rationale**: Core logic (event parsing, session→workspace mapping) is small and testable. Audio playback and title flash are browser-native and best verified manually.
- **Focus Areas**: tmux event parsing, session-to-workspace mapping, SSE channel registration
- **Excluded**: Audio API (browser-native), TitleManager flash (existing infra, manual verify)
- **Mock Usage**: Avoid mocks entirely — real data/fixtures only, consistent with codebase convention. Use existing `FakeTmuxExecutor` pattern if needed.

## Documentation Strategy

- **Location**: No new documentation files
- **Rationale**: Internal plumbing — domain.md history entries + inline code comments are sufficient
- **Updates**: terminal domain.md, _platform/sdk domain.md history entries

## Clarifications

### Session 2026-04-09

| # | Question | Answer |
|---|----------|--------|
| Q1 | Workflow Mode | **Simple** — CS-2, single phase, quick path |
| Q2 | Testing Strategy | **Lightweight** — minimal validation tests for core functionality |
| Q3 | Mock Usage | **Avoid mocks entirely** — real data/fixtures only |
| Q4 | Documentation Strategy | **No new documentation** — domain.md history entries + inline comments only |
| Q5 | Domain Review | **Approved as-is** — terminal (modify), _platform/events (consume), _platform/sdk (modify), activity-log (consume) |
| Q6 | Harness Readiness | **Continue without harness** — lightweight tests + manual verification |
| Q7 | Wav file location | **`apps/web/public/sounds/bell.wav`** — served as static asset via Next.js |
| Q8 | Monitor script lifecycle | **Part of terminal sidecar startup** — starts when terminal-ws.ts boots, stops with it |
