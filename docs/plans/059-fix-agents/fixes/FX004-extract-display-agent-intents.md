# Fix FX004: Extract and Display Agent Intents from Event Stream

**Created**: 2026-03-04
**Status**: Proposed
**Plan**: [fix-agents-plan.md](../fix-agents-plan.md)
**Source**: User: agents show no intent — chips and list have stale/empty intent text
**Domain(s)**: agents (modify)

---

## Problem

Agent intents (what the agent is currently doing) never update during a run. The `setIntent()` method exists on `AgentInstance`, the SSE pipeline (`agent_intent` events) works, and all UI surfaces already render the `intent` field — but no adapter calls `setIntent()`. Chips show stale creation-time intent or nothing.

## Proposed Fix

Add an `extractIntent()` pure function that maps `AgentEvent` types to human-readable intent strings (e.g. `tool_call "Read" → "Reading auth.ts"`). Wire it into `AgentInstance`'s event accumulation so `setIntent()` is called automatically during runs. Add intent display to the overlay panel header.

## Domain Impact

| Domain | Relationship | What Changes |
|--------|-------------|-------------|
| agents | modify | New intent-extractor.ts, wire into AgentInstance, overlay header |

## Tasks

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [ ] | FX004-1 | Create `extractIntent()` pure function — maps tool_call → "Reading file.ts", thinking → "Thinking: ...". Only these 2 event types (DYK-FX004-03/05). Handle varied input shapes: `input.command`, `input.path`, `input.file_path`, raw string (DYK-FX004-02). Fast-path guard for other event types. | agents | `packages/shared/src/features/019-agent-manager-refactor/intent-extractor.ts` | Unit tests pass for all event types with correct truncation | Workshop 008 |
| [ ] | FX004-2 | Wire `extractIntent()` into AgentInstance._captureEvent() — call `setIntent()` when intent changes | agents | `packages/shared/src/features/019-agent-manager-refactor/agent-instance.ts` | Running an agent updates intent on each tool_call/thinking event | Only call setIntent when value actually changes |
| [ ] | FX004-3 | Add intent subtitle to overlay panel header — show current intent under agent name | agents | `apps/web/src/components/agents/agent-overlay-panel.tsx` | Overlay header shows live intent text | Existing useAgentInstance already has agent.intent |

## Workshops Consumed

- [Workshop 008: Agent Intents](../workshops/008-agent-intents.md)

## Acceptance

- [ ] Running an agent shows live intent updates in chip bar (e.g. "Reading auth.ts", "Using Bash")
- [ ] Agent list page shows current intent under agent name
- [ ] Overlay panel header shows intent subtitle
- [ ] Intent persists after agent stops (shows last action)
- [ ] Existing tests pass (no regressions)

## Discoveries & Learnings

_Populated during implementation._

| Date | Task | Type | Discovery | Resolution |
|------|------|------|-----------|------------|
