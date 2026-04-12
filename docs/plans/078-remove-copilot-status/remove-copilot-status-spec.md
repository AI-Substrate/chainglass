# Remove Copilot Status Bar from Terminal Overlay

**Mode**: Simple

## Research Context

📚 This specification incorporates findings from [research-dossier.md](research-dossier.md).

Key findings:
- Plan 075 added a copilot session status row to the terminal overlay panel header, showing model/effort/token-usage per tmux pane running Copilot CLI
- The feature is entirely self-contained: 3 dedicated files, 3 modified files, 1 test file, zero external consumers
- FX001 merged the standalone copilot badge component INTO the overlay panel, creating a left-join merge pattern that needs untangling
- Domain docs were never updated for Plan 075 — no documentation cleanup required
- Activity log toast hook has a dead `source === 'copilot'` skip that should be removed

## Summary

Remove the Copilot CLI session status bar (Plan 075) from the terminal overlay panel. The feature polls tmux pane TTYs every 30s to detect Copilot processes, writes `source: 'copilot'` activity log entries, and renders model/effort/token-budget badges merged with window badges in the overlay header. It adds complexity and maintenance burden to the terminal sidecar for limited value. Remove all Plan 075 code and restore the terminal overlay to its clean, pre-075 state showing only tmux window badges.

## Goals

- Remove copilot session detection from the terminal sidecar backend (30s poll loop)
- Remove the copilot badge hook and its activity log polling
- Restore the terminal overlay panel to render plain tmux window badges without copilot enrichment
- Remove the dead `source === 'copilot'` skip from the activity log toast hook
- Delete all Plan 075 dedicated files and tests
- Ensure the terminal overlay continues to function correctly with only window badges

## Non-Goals

- Not modifying the activity log infrastructure (writer, reader, API) — it's generic and unaffected
- Not changing the terminal sidecar's existing 10s pane-title poll loop
- Not removing the Plan 075 documentation folder (`docs/plans/075-tmux-copilot-status/`) — it stays as historical record
- Not adding any new features to the terminal overlay — this is purely subtractive

## Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|-------------|---------------------|
| terminal | existing | **modify** | Remove copilot detector, copilot hook, copilot poll loop, copilot badge rendering from overlay panel |
| activity-log | existing | **modify** | Remove dead `source === 'copilot'` skip from toast hook |

No new domains. No domain documentation cleanup needed (Plan 075 was never recorded in domain docs).

## Complexity

- **Score**: CS-1 (trivial)
- **Breakdown**: S=1, I=0, D=0, N=0, F=0, T=0
- **Confidence**: 0.98
- **Assumptions**: All Plan 075 code is self-contained with zero external consumers
- **Dependencies**: None
- **Risks**: None — purely subtractive changes
- **Phases**: Single phase (delete files, clean modifications, verify)

## Acceptance Criteria

1. `copilot-session-detector.ts` no longer exists in the codebase
2. `use-copilot-session-badges.ts` no longer exists in the codebase
3. `copilot-session-detector.test.ts` no longer exists in the codebase
4. `terminal-ws.ts` has no imports from `copilot-session-detector` and no copilot poll interval
5. `terminal-overlay-panel.tsx` renders only window badges (windowIndex, windowName, label) — no copilot model/effort/token/pct fields
6. `terminal-overlay-panel.tsx` has no imports from `use-copilot-session-badges`
7. `terminal-overlay-panel.tsx` has no copilot helper functions (formatTokens, getPctColorClass, formatModel)
8. `use-activity-log-toasts.tsx` has no `source === 'copilot'` skip condition
9. All existing tests pass (`just fft`)
10. Terminal overlay panel still renders tmux window badges correctly when the overlay is open

## Risks & Assumptions

- **Assumption**: No user-facing workflow depends on the copilot status badges (confirmed — it's purely informational display)
- **Assumption**: Existing activity log entries with `source: 'copilot'` in worktree JSONL files can remain — they're harmless historical data and will age out naturally
- **Risk**: None identified — the feature has zero external consumers

## Open Questions

*None — removal scope is clear and self-contained.*

## Workshop Opportunities

*None needed — this is a straightforward deletion task.*
