# Flight Plan: Fix FX001 — Wire Agent Lifecycle into WorkUnitStateService

**Fix**: [FX001-wire-agent-workunit-registration.md](FX001-wire-agent-workunit-registration.md)
**Status**: Ready

## What → Why

**Problem**: AgentWorkUnitBridge exists but nothing calls it — agents never appear in work-unit-state.json, so sidebar badges are empty.
**Fix**: Add bridge calls in API routes (create/delete) and notifier (status changes) — ~30 lines across 4 files.

## Domain Context

| Domain | Relationship | What Changes |
|--------|-------------|-------------|
| agents | modify | POST/DELETE routes + notifier gain bridge calls |
| work-unit-state | consume | Bridge writes to WorkUnitStateService (no interface changes) |

## Stages

- [ ] **Stage 1**: POST route + DELETE route bridge calls (FX001-1, FX001-2)
- [ ] **Stage 2**: Notifier bridge integration + DI wiring (FX001-3, FX001-4)

## Acceptance

- [ ] Agent creation → entry in work-unit-state.json
- [ ] Agent run → status working in work-unit-state.json
- [ ] Agent deletion → entry removed from work-unit-state.json
