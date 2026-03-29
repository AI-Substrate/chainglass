# Fix FX003: Pod Timeout, Stuck Detection, UI Diagnostics & Container Fix

**Created**: 2026-03-29
**Status**: Proposed
**Plan**: [harness-workflow-runner-plan.md](../harness-workflow-runner-plan.md)
**Source**: Workshops 009 (P2/P3), 011 (P1/P2), 013 (P1-P4) — all designed but unimplemented
**Domain(s)**: _platform/positional-graph, workflow-ui, shared, _(harness)_

---

## Problem

Four categories of designed-but-not-shipped work from live dogfooding:

1. **Agent pods hang forever** — no timeout on AgentPod → AgentInstance → SdkCopilotAdapter chain. `jordo-test` coder node stuck at "starting" for 73 hours.
2. **ONBAS doesn't detect stuck nodes** — treats `starting` as "running" with no age check. Drive loop idles 200 iterations then exits.
3. **UI shows no execution diagnostics** — no timeline, no status badge, no agent connection button. Only the error box we added.
4. **server.json bind-mount conflict** — container write clobbers host file, preflight fails after container runs.

## Proposed Fix

Thread 5min timeout through pod execution chain. Add 60s stuck-starting detection in ONBAS. Drain pendingErrors on drive exit. Skip server.json in container. Add diagnostics panel + status badge to workflow UI. Add "View Agent" button for agent nodes.

## Domain Impact

| Domain | Relationship | What Changes |
|--------|-------------|-------------|
| _platform/positional-graph | Owner | AgentPod timeout, ONBAS stuck detection, drain errors on exit |
| shared | Owner | AgentInstance.run() threads timeout, AgentRunOptions gets timeout field |
| workflow-ui | Owner | Diagnostics panel, status badge, agent node link |
| _(harness)_ | Touched | Skip server.json in container (instrumentation.ts + docker-compose) |

## Workshops Consumed

- [Workshop 009: Error Visibility](../workshops/009-workflow-error-visibility.md) — P2 (diagnostics panel), P3 (status badge)
- [Workshop 011: Observability](../workshops/011-workflow-observability-agent-integration.md) — P1 (elapsed time on starting nodes), P2 (View Agent button)
- [Workshop 013: Pod Timeout](../workshops/013-agent-pod-timeout-stuck-recovery.md) — P1-P4 (timeout, stuck detection, error drain, server.json)

## Tasks

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [ ] | FX003-1 | Thread 5min timeout through pod execution chain | _platform/positional-graph, shared | `packages/positional-graph/src/features/030-orchestration/pod.agent.ts`, `packages/shared/src/features/034-agentic-cli/agent-instance.ts` | `AgentPod.execute()` passes `timeout: 300_000` to `agentInstance.run()`. `AgentInstance.run()` passes `timeout` to adapter. `sendAndWait` receives timeout. Pod can't hang forever. | Workshop 013 § Fix 1. Default 5min, configurable via `orchestratorSettings.agentTimeout`. |
| [ ] | FX003-2 | ONBAS stuck-starting detection at 60s | _platform/positional-graph | `packages/positional-graph/src/features/030-orchestration/onbas.ts` | Node at `starting` for >60s with no `accepted` event → ONBAS returns `error-node` action → ODS writes `node:error` event → node transitions to `blocked-error`. | Workshop 013 § Fix 2. 60s threshold per user direction. |
| [ ] | FX003-3 | Drain pendingErrors on drive loop exit | _platform/positional-graph | `packages/positional-graph/src/features/030-orchestration/graph-orchestration.ts` | Before `drive()` returns, drain ODS `pendingErrors` and write `node:error` events to state. Errors always persisted even on maxIterations exit. | Workshop 013 § Fix 3. |
| [ ] | FX003-4 | Skip server.json write when CHAINGLASS_CONTAINER=true | workflow-ui | `apps/web/instrumentation.ts` | `writeServerInfo()` skipped when `process.env.CHAINGLASS_CONTAINER === 'true'`. Container never clobbers host server.json. `just preflight` stops failing after container runs. | Workshop 013 § Fix 4. |
| [ ] | FX003-5 | Elapsed time display on starting/running nodes in properties panel | workflow-ui | `apps/web/src/features/050-workflow-page/components/node-properties-panel.tsx` | When status is `starting` or `agent-accepted` and `startedAt` exists, show "Starting — Xs elapsed" with warning at >30s. | Workshop 011 § P1. |
| [ ] | FX003-6 | Color-coded execution status badge in toolbar | workflow-ui | `apps/web/src/features/050-workflow-page/components/workflow-temp-bar.tsx` | Status badge: green pulse (running), red (failed), amber (stopped), green solid (completed), no badge (idle). Replaces faded lastMessage text. | Workshop 009 § P3. |
| [ ] | FX003-7 | "View Agent" button in properties panel for agent nodes | workflow-ui | `apps/web/src/features/050-workflow-page/components/node-properties-panel.tsx` | Agent nodes with sessionId show "View Agent Chat" link to `/workspaces/{slug}/agents/{agentId}`. Nodes without session show "Agent not started" or "Spawning...". | Workshop 011 § P2. Needs agentId from pod-sessions or AgentManagerService. |
| [ ] | FX003-8 | Verify all fixes via harness Playwright against running dev server | _(harness)_ | N/A | Navigate to workflow page in browser, screenshot, verify: status badge visible, error panel shows, elapsed time on starting nodes. Use `just wf-logs` to confirm diagnostics match UI. | Must use harness/Playwright, not curl. |

## Acceptance

- [ ] `jordo-test` coder node fails with `STUCK_STARTING` after 60s instead of hanging forever
- [ ] Pod execution has 5min timeout — `sendAndWait` can't block indefinitely
- [ ] Drive loop exit drains pendingErrors to state.json
- [ ] `just preflight` passes after container has run (no stale server.json)
- [ ] Starting nodes show elapsed time + warning in properties panel
- [ ] Toolbar shows color-coded status badge (not just faded text)
- [ ] Agent nodes show "View Agent Chat" button when session exists
- [ ] All verified via Playwright screenshot against running dev server

## Discoveries & Learnings

_Populated during implementation._

| Date | Task | Type | Discovery | Resolution |
|------|------|------|-----------|------------|
