# Fix FX001: Wire Agent Lifecycle into WorkUnitStateService

**Created**: 2026-03-02
**Status**: Proposed
**Plan**: [fix-agents-plan.md](../fix-agents-plan.md)
**Source**: User reported sidebar badges empty — agents not registered in WorkUnitStateService
**Domain(s)**: agents (modify), work-unit-state (consume)

---

## Problem

AgentWorkUnitBridge exists and is wired in DI, but nothing calls it. When agents are created via the UI, they never get registered in WorkUnitStateService, so `work-unit-state.json` stays empty. This means sidebar badges, top bar chips, and cross-worktree activity indicators have no data to display.

## Proposed Fix

Add bridge calls at three integration points following Workshop 007 Option A1:
1. **POST /api/agents** → `bridge.registerAgent()` after creation
2. **DELETE /api/agents/[id]** → `bridge.unregisterAgent()` before response
3. **AgentNotifierService** → accept optional bridge, call `updateAgentStatus()` on `broadcastStatus()` and `broadcastIntent()` to capture mid-run status changes

Status mapping: `working→working`, `stopped→idle`, `error→error`.

## Domain Impact

| Domain | Relationship | What Changes |
|--------|-------------|-------------|
| agents | modify | API routes gain bridge calls; notifier accepts optional bridge |
| work-unit-state | consume | Bridge calls register/update/unregister — no interface changes |

## Tasks

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [ ] | FX001-1 | Add `bridge.registerAgent()` in POST /api/agents after createAgent + broadcastCreated | agents | `apps/web/app/api/agents/route.ts` | Agent creation writes entry to work-unit-state.json | Workshop 007 Option A1 |
| [ ] | FX001-2 | Add `bridge.unregisterAgent()` in DELETE /api/agents/[id] after terminateAgent | agents | `apps/web/app/api/agents/[id]/route.ts` | Agent deletion removes entry from work-unit-state.json | Workshop 007 Option A1 |
| [ ] | FX001-3 | Add lazy bridge resolver to AgentNotifierService constructor; call `bridge.updateAgentStatus()` in `broadcastStatus()` only (NOT broadcastIntent — too high-frequency per DYK-FX001-02). Use `() => AgentWorkUnitBridge | undefined` factory to avoid DI order issues (DYK-FX001-01). Document that register/unregister stay in routes, not notifier (DYK-FX001-03). | agents | `apps/web/src/features/019-agent-manager-refactor/agent-notifier.service.ts` | Running agent status changes reflected in work-unit-state.json | Status map: working→working, stopped→idle, error→error |
| [ ] | FX001-4 | Update DI production container to pass lazy bridge resolver into AgentNotifierService factory. Do NOT modify test container (uses useValue fake per DYK-FX001-05). | agents | `apps/web/src/lib/di-container.ts` | Notifier resolves with lazy bridge in production container | DYK-FX001-01: lazy resolver avoids registration order issues |

## Workshops Consumed

- [Workshop 007: Agent → WorkUnitState Registration](../workshops/007-agent-workunit-registration.md)

## DYK Findings

| # | Finding | Impact | Action |
|---|---------|--------|--------|
| DYK-FX001-01 | DI registration order — bridge at L552, notifier at L384 | HIGH | Use lazy resolver `() => bridge` in notifier constructor |
| DYK-FX001-02 | `broadcastIntent` lacks status param, high-frequency streaming | MEDIUM | Skip intent wiring — only wire `broadcastStatus` |
| DYK-FX001-03 | Register/unregister must stay in routes, not notifier | MEDIUM | Document the split clearly in notifier comments |
| DYK-FX001-04 | Pre-existing agents won't show until recreated | LOW | Acceptable — user confirmed |
| DYK-FX001-05 | Test container uses `useValue` fake, no factory | LOW | Don't modify test notifier registration |

## Acceptance

- [ ] Creating an agent via UI writes an entry to `work-unit-state.json`
- [ ] Running an agent updates status to `working` in `work-unit-state.json`
- [ ] Agent completing run updates status to `idle`
- [ ] Deleting an agent removes entry from `work-unit-state.json`
- [ ] Sidebar badges show activity for agents in other worktrees
- [ ] Existing tests still pass (no regressions)

## Discoveries & Learnings

_Populated during implementation._

| Date | Task | Type | Discovery | Resolution |
|------|------|------|-----------|------------|
