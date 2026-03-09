# Fix FX001: Migrate Agent Hooks to Multiplexed SSE

**Created**: 2026-03-09
**Status**: Complete
**Plan**: [072-sse-multiplexing-plan.md](../sse-multiplexing-plan.md)
**Source**: Post-merge regression — agents page locks up browser (harness reproduction confirmed: screenshot timeout at networkidle)
**Domain(s)**: `_platform/events` (transport), `agents` (consumer)

---

## Problem

After merging Plan 072 SSE Multiplexing, the agents page (`/workspaces/[slug]/agents`) causes browser lockups. `useAgentManager` and `useAgentInstance` still open direct `EventSource` connections to `/api/agents/events`, creating 2-3 independent SSE connections alongside the new multiplexed `/api/events/mux`. This exhausts HTTP/1.1's 6-connection-per-origin limit — REST requests queue, the UI freezes, and Playwright's `networkidle` never fires.

These hooks were the only SSE consumers **not migrated** during Plan 072 Phase 5.

## Proposed Fix

Add `'agents'` to `WORKSPACE_SSE_CHANNELS` so the mux endpoint subscribes to agent events. Replace direct `EventSource` logic in both hooks with `useChannelCallback('agents', ...)`, following the exact pattern used by `FileChangeProvider` and `QuestionPopperProvider`. Remove ~180 lines of duplicated connection/reconnect code. No backend changes needed — `/api/agents/events/route.ts` already uses `sseManager.broadcast('agents', ...)`.

## Workshop Consumed

- [002-agent-sse-migration.md](../workshops/002-agent-sse-migration.md) — full migration pattern, before/after code, event mapping

## Domain Impact

| Domain | Relationship | What Changes |
|--------|-------------|-------------|
| `_platform/events` | Modify | Add `'agents'` channel to workspace mux subscription |
| `agents` | Modify | Replace direct EventSource with `useChannelCallback` in 2 hooks |

## Tasks

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [x] | FX001-1 | Add `'agents'` to WORKSPACE_SSE_CHANNELS | `_platform/events` | `apps/web/app/(dashboard)/workspaces/[slug]/layout.tsx` (line 31-37) | Channel appears in mux query string | One-line addition to const array |
| [x] | FX001-2 | Replace EventSource in useAgentManager with useChannelCallback | `agents` | `apps/web/src/features/019-agent-manager-refactor/useAgentManager.ts` | Hook uses mux channel, no direct EventSource, 8 event types mapped via msg.type | Remove lines 86, 104-106, 153-232. Add ~15 lines useChannelCallback. Keep query + mutation unchanged. |
| [x] | FX001-3 | Replace EventSource in useAgentInstance with useChannelCallback | `agents` | `apps/web/src/features/019-agent-manager-refactor/useAgentInstance.ts` | Hook uses mux channel, agentId filtering preserved, agent_event unwrap preserved | Remove lines 93, 114-116, 170-256. Add ~20 lines useChannelCallback. Keep agent_event unwrap logic. |
| [x] | FX001-4 | Verify with harness — agents page loads, click into agent, do a turn | `agents` | N/A | Navigate to agents, click agent or create one, do 1-2 turns without lockup | Use `domcontentloaded` not `networkidle` (DYK-5). Console-logs show no new errors. |
| [x] | FX001-5 | Run just fft — all tests pass | N/A | N/A | Lint + format + typecheck + tests green | Existing agent contract tests should still pass (they test service layer, not hooks) |

## Acceptance

- [x] Agents page loads without browser lockup
- [x] Clicking an agent opens overlay without freezing
- [x] Can do 1-2 turns with an agent in the chat overlay
- [x] Agent list updates in real-time (create/terminate reflected)
- [x] Network tab shows 0 connections to `/api/agents/events` (all via `/api/events/mux`)
- [x] `just fft` passes (0 failures)
- [x] Harness: navigate to agents, click into agent or create one, do a turn — no lockup

## Critical Implementation Notes (DYK Pre-Flight)

### DYK-1: Mux uses `onmessage`, not named events
The old hooks use `es.addEventListener('agent_status', ...)` for named SSE events. The mux endpoint sends everything via `onmessage` with `{type: eventType, channel: 'agents'}`. Migration **must** check `msg.type` in the callback — not rely on named event listeners. Both hooks have 8+ event types to map.

### DYK-2: React Query deduplicates the polling
Three components (`AgentTopBar`, `AttentionFlash`, `AgentOverlayPanel`) each call `useAgentManager({ subscribeToSSE: false })` with 5s polling. React Query deduplicates queries with the same key, so this is 1 real fetch not 3. No change needed — just awareness for Network tab debugging.

### DYK-3: Each agent click creates a new EventSource today
`useAgentInstance` mounts/unmounts per agent click, creating a new `EventSource` each time. After migration to `useChannelCallback`, this becomes a subscribe/unsubscribe on the existing mux — zero new connections. This is the core lockup mechanism being fixed.

### DYK-4: `agent_event` unwrap pattern must be preserved exactly
`useAgentInstance` lines 226-237 unwrap `agent_event` → extracts `event.type` → prepends `agent_` to create `agent_text_delta`, `agent_text_replace`, etc. This is how the chat overlay renders streaming content. If this unwrap logic is dropped or changed, agent chat will silently break.

### DYK-5: Harness verification needs `domcontentloaded` not `networkidle`
The mux SSE connection is intentionally permanent — `networkidle` will never fire on any workspace page. Harness verification should use a manual wait or `domcontentloaded`, and the real acceptance test is: navigate to agents page, click an agent, do a turn.

## Discoveries & Learnings

_Populated during implementation._

| Date | Task | Type | Discovery | Resolution |
|------|------|------|-----------|------------|
