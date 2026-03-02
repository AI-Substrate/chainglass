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
| [ ] | FX001-3 | Add optional `AgentWorkUnitBridge` to AgentNotifierService constructor; call `bridge.updateAgentStatus()` in `broadcastStatus()` and `broadcastIntent()` | agents | `apps/web/src/features/019-agent-manager-refactor/agent-notifier.service.ts` | Running agent status changes reflected in work-unit-state.json | Status map: working→working, stopped→idle, error→error |
| [ ] | FX001-4 | Update DI container to pass bridge into AgentNotifierService factory | agents | `apps/web/src/lib/di-container.ts` | Notifier resolves with bridge in both prod and test containers | Both production + test registrations |

## Workshops Consumed

- [Workshop 007: Agent → WorkUnitState Registration](../workshops/007-agent-workunit-registration.md)

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
