# tmux Copilot Status Bar — Implementation Plan

**Mode**: Simple
**Plan Version**: 1.0.0
**Created**: 2026-03-13
**Spec**: [tmux-copilot-status-spec.md](tmux-copilot-status-spec.md)
**Workshop**: [workshops/001-status-line-ui.md](workshops/001-status-line-ui.md)
**Status**: READY

## Summary

Extend the terminal overlay panel to show Copilot CLI session metadata (model, reasoning effort, context budget, last activity) for all copilot sessions running across tmux panes. Reuses the existing backend poll → activity log → API → frontend hook → component pattern from Plans 064/065. Backend detection runs on a separate 30s interval. No `events.jsonl` content parsing — data comes from `config.json` (model, effort), process logs via `tail` (prompt token counts), and `events.jsonl` mtime (last activity time).

## Target Domains

| Domain | Status | Relationship | Role |
|--------|--------|-------------|------|
| terminal | existing | extend | Add `getCopilotSessions()` to sidecar, write `source: 'copilot'` activity log entries, add UI row |
| activity-log | existing | consume | Write/read copilot entries using existing writer/reader/API with no changes |

## Domain Manifest

| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| `apps/web/src/features/064-terminal/server/copilot-session-detector.ts` | terminal | internal | New module: detects copilot processes, reads session metadata from `~/.copilot/` |
| `apps/web/src/features/064-terminal/server/terminal-ws.ts` | terminal | internal | Add copilot detection poll loop (separate 30s interval) |
| `apps/web/src/features/064-terminal/hooks/use-copilot-session-badges.ts` | terminal | internal | New hook: polls `?source=copilot` activity log entries |
| `apps/web/src/features/064-terminal/components/terminal-overlay-panel.tsx` | terminal | internal | Add copilot status row below window badges |
| `apps/web/src/features/064-terminal/components/copilot-session-badges.tsx` | terminal | internal | New presentational component for copilot session badges |
| `test/unit/web/features/terminal/copilot-session-detector.test.ts` | terminal | internal | Unit tests for detector with injected fakes |

## Key Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| F01 | Critical | `~/.copilot/` path reading precedent exists in `CopilotCLIAdapter` — use `path.join()` + `process.env.HOME`, validate session IDs with regex | Follow same pattern in copilot-session-detector.ts |
| F02 | Critical | Sync file I/O in poll loop blocks Node.js event loop — process logs are 60-90MB | Use separate 30s interval, async I/O, mtime-based cache, `tail` for log files |
| F03 | High | Dedup key is `id + label` — token counts change every poll → unbounded log growth | Use stable label (model + effort only), put volatile data (tokens) in `meta` |
| F04 | High | `execFileSync` throws on command failure, crashes poll interval | Wrap all exec calls in try-catch, return empty on failure |
| F05 | High | Docker sidecar can't access `~/.copilot/` (no volume mount) | Graceful no-op: detect missing dir at startup, skip copilot polling |
| F06 | High | API `?source=copilot` filter already works — no backend API changes needed | Frontend hook can fetch immediately; zero API work |
| F07 | High | Process detection greps `copilot-darwin-arm64/copilot` — only matches macOS ARM64. Fails silently on Linux, Windows, WSL, macOS Intel. | Match on `@github/copilot` in process command (the npm package path) rather than platform-specific binary. Handle `ps` output differences across platforms. |

## Implementation

**Objective**: Show all copilot session metadata in the terminal overlay header, below window badges, using the existing activity log pipeline.
**Testing Approach**: Lightweight — unit test `detectCopilotSessions()` with injected deps (fake exec, fake fs). Manual verification for UI integration.
**Complexity**: CS-2 (small)

### Tasks

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [x] | T001 | Create copilot-session-detector module | terminal | `/apps/web/src/features/064-terminal/server/copilot-session-detector.ts` | Exports `detectCopilotSessions(sessionName, exec)` returning `CopilotSessionInfo[]`. Function takes injected `exec` and `readFile`/`stat` deps for testability. Reads pane TTYs via `tmux list-panes`, finds copilot PIDs by matching `@github/copilot` in process command (cross-platform). Resolves session IDs from lock files. Reads model/effort from `config.json`. Gets prompt tokens from process log via `tail -n 2000 | grep prompt_tokens_count` (last occurrence). Gets last activity from `events.jsonl` mtime via `fs.stat()` (no content parsing). Context window derived from model name lookup table. All file I/O via `fs.promises`. All exec calls wrapped in try-catch. | Per F01, F02, F04, F07. No JSONL parsing — mtime only. Deps injected for testing. |
| [x] | T002 | Add copilot poll loop to terminal-ws.ts | terminal | `/apps/web/src/features/064-terminal/server/terminal-ws.ts` | Separate `setInterval` at 30s. Calls `detectCopilotSessions()`, writes `source: 'copilot'` entries via `appendActivityLogEntry()`. Label is `{model} ({effort})` (stable for dedup). Token + timing data goes in `meta: { promptTokens, contextWindow, pct, lastActivityTime }`. Gracefully no-ops if `~/.copilot/` missing. | Per F02, F03, F05. Does not block existing 10s pane-title poll. |
| [x] | T003 | Create useCopilotSessionBadges hook | terminal | `/apps/web/src/features/064-terminal/hooks/use-copilot-session-badges.ts` | Mirrors `useTerminalWindowBadges`. Polls `GET /api/activity-log?source=copilot&limit=50` every 15s. Parses entries into `CopilotSessionBadge[]` with windowIndex, model, effort, promptTokens, contextWindow, pct, lastActivityAgo. Computes `lastActivityAgo` as relative time string from `meta.lastActivityTime`. | Per F06. No API changes needed. |
| [x] | T004 | Create CopilotSessionBadges component | terminal | `/apps/web/src/features/064-terminal/components/copilot-session-badges.tsx` | Renders copilot session badges as a flex-wrap row. Each badge: `{win}:copilot: {model} ({effort}) │ {used}k/{total}k ({pct}%) │ {time_ago}`. Color-coded percentage via Tailwind: green (<50%), yellow (50-75%), orange (75-90%), red (90%+). Badges separated by `║`. | Per workshop. |
| [x] | T005 | Integrate into TerminalOverlayPanel | terminal | `/apps/web/src/features/064-terminal/components/terminal-overlay-panel.tsx` | Call `useCopilotSessionBadges({ cwd, enabled: isOpen })`. Render `<CopilotSessionBadges>` below window badges div. Hidden when empty array. | Minimal change to existing component. |
| [x] | T006 | Unit tests for detector | terminal | `test/unit/web/features/terminal/copilot-session-detector.test.ts` | Test `detectCopilotSessions()` with fake exec (returns canned `ps` and `tmux` output) and fake fs (returns mock lock files, config.json, stat results). Test: finds copilot PID on TTY, resolves session from lock file, extracts model/tokens, handles missing files gracefully, handles exec failures gracefully. | Detector is pure logic with injected deps — ideal for unit testing. |
| [x] | T007 | Manual verification + quality gates | — | — | Open terminal overlay, verify: sessions appear, color coding works, multiple sessions wrap, updates on interval, hidden when no sessions, existing behavior unchanged. Run `just fft` to confirm lint/typecheck/test pass. | — |

### Data Flow

```
terminal-ws.ts (separate 30s interval)
  → detectCopilotSessions(sessionName, exec)
    → tmux list-panes -s → pane TTYs
    → ps -eo pid,tty,command → copilot PIDs per TTY (match @github/copilot)
    → ~/.copilot/session-state/*/inuse.<PID>.lock → session ID (newest by mtime)
    → ~/.copilot/config.json → model, reasoning effort
    → tail -n 2000 process log | grep prompt_tokens_count → latest prompt tokens
    → fs.stat(events.jsonl) → mtime → last activity time (no content parsing)
    → model name → context window size (lookup table)
  → appendActivityLogEntry(source: 'copilot', id: 'copilot:<pane>',
      label: 'opus4.6 (high)', meta: { promptTokens, contextWindow, pct, lastActivityTime })

GET /api/activity-log?source=copilot (existing route, zero changes)

useCopilotSessionBadges hook (15s poll)
  → fetch ?source=copilot → parse → CopilotSessionBadge[]

TerminalOverlayPanel → CopilotSessionBadges component
```

### Acceptance Criteria

- [ ] Copilot session metadata appears in terminal overlay header, below window badges
- [ ] Shows model, reasoning effort, tokens used/total, percentage (color-coded), last activity time ago
- [ ] Percentage color: green (<50%), yellow (50-75%), orange (75-90%), red (90%+)
- [ ] Multiple sessions shown inline separated by `║`, wrapping as needed
- [ ] Hidden when no copilot sessions running
- [ ] Session data refreshes regularly (backend 30s, frontend 15s)
- [ ] Does not block existing pane title polling (separate interval)
- [ ] Graceful when `~/.copilot/` is missing (no errors, just no badges)
- [ ] Existing terminal overlay behavior unchanged
- [ ] Unit tests pass for detector module with injected fakes
- [ ] `just fft` passes (lint, typecheck, test)

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Copilot CLI file format changes | Low | Medium | Graceful fallback — show "—" for missing fields |
| Process log grows beyond 100MB | Medium | High | Only read last 200 lines via `tail`, cache by mtime |
| Docker env can't access `~/.copilot/` | Medium | Medium | Detect at startup, skip polling, no errors |
| Dedup allows too many writes if label unstable | Low | Medium | Label is `model (effort)` only — stable across polls |
