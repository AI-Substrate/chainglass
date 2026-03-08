# SSE Multiplexing Implementation Plan

**Plan Version**: 1.0.0
**Created**: 2026-03-08
**Spec**: [sse-multiplexing-spec.md](./sse-multiplexing-spec.md)
**Mode**: Full
**Status**: DRAFT

## Summary

Each SSE feature (file-changes, event-popper, work-unit-state, workflows, agents) opens its own HTTP connection per tab. Under HTTP/1.1's 6-connection-per-origin limit, 2-3 tabs exhaust the budget and lock up the application. This plan introduces a single `/api/events/mux` endpoint that carries all channels over one `EventSource` per tab, with a client-side `MultiplexedSSEProvider` that demultiplexes events by channel. Server-side event producers are unchanged. Consumers migrate gradually from direct EventSource to channel subscription hooks.

## Target Domains

| Domain | Status | Relationship | Role |
|--------|--------|-------------|------|
| `_platform/events` | existing | **modify** | Core: mux route, channel tagging, provider + hooks |
| `_platform/state` | existing | **modify** | Re-enable GlobalStateConnector with ServerEventRoute consuming from mux |
| `question-popper` | existing | **modify** | Migrate QuestionPopperProvider from direct EventSource |
| `file-browser` | existing | **modify** | Migrate FileChangeProvider from direct EventSource |
| `agents` | existing | **modify** | (Optional) Migrate useAgentManager from dedicated route |
| `workflow-ui` | existing | **modify** | Migrate useWorkflowSSE from direct useSSE |
| `_platform/external-events` | existing | consume | No changes (uses WorkspaceDomain.EventPopper channel name) |

## Domain Manifest

| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| `apps/web/src/lib/sse-manager.ts` | `_platform/events` | internal | Add `channel` field to broadcast payload |
| `apps/web/app/api/events/mux/route.ts` | `_platform/events` | contract | New multiplexed SSE endpoint |
| `apps/web/src/lib/sse/multiplexed-sse-provider.tsx` | `_platform/events` | contract | React provider — single EventSource + demux |
| `apps/web/src/lib/sse/use-channel-events.ts` | `_platform/events` | contract | Hook: message accumulation per channel |
| `apps/web/src/lib/sse/use-channel-callback.ts` | `_platform/events` | contract | Hook: callback per event per channel |
| `apps/web/src/lib/sse/types.ts` | `_platform/events` | contract | MultiplexedSSEMessage, ServerEvent (extended) |
| `apps/web/src/lib/state/server-event-router.ts` | `_platform/state` | internal | Extend ServerEvent with optional `channel` metadata for multiplexed delivery |
| `apps/web/src/lib/sse/index.ts` | `_platform/events` | contract | Barrel export |
| `test/fakes/fake-multiplexed-sse.ts` | `_platform/events` | internal | Test fake for channel-aware simulation |
| `test/unit/web/sse/multiplexed-sse-provider.test.tsx` | `_platform/events` | internal | Provider contract tests |
| `test/unit/web/sse/use-channel-events.test.tsx` | `_platform/events` | internal | Hook contract tests |
| `test/unit/web/api/events-mux-route.test.ts` | `_platform/events` | internal | Route contract tests |
| `test/unit/web/services/sse-manager.test.ts` | `_platform/events` | internal | Extend with channel tagging + removeControllerFromAllChannels tests |
| `apps/web/app/(dashboard)/workspaces/[slug]/layout.tsx` | cross-domain | cross-domain | Mount MultiplexedSSEProvider |
| `apps/web/src/features/067-question-popper/hooks/use-question-popper.tsx` | `question-popper` | internal | Replace direct EventSource with useChannelCallback |
| `apps/web/src/features/045-live-file-events/file-change-provider.tsx` | `file-browser` | internal | Replace direct EventSource with useChannelCallback |
| `apps/web/src/lib/state/server-event-route.tsx` | `_platform/state` | internal | Consume from useChannelEvents instead of useSSE |
| `apps/web/src/lib/state/state-connector.tsx` | `_platform/state` | internal | Re-enable; update connection limit comment |
| `apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx` | cross-domain | cross-domain | Re-enable GlobalStateConnector |
| `apps/web/src/features/050-workflow-page/hooks/use-workflow-sse.ts` | `workflow-ui` | internal | Replace useSSE with useChannelEvents |
| `apps/web/src/features/019-agent-manager-refactor/useAgentManager.ts` | `agents` | internal | (Optional) Replace direct EventSource with useChannelCallback |
| `CLAUDE.md` | cross-domain | cross-domain | Add SSE multiplexing to quick reference |
| `docs/how/sse-multiplexing.md` | cross-domain | cross-domain | Migration guide for feature developers |
| `docs/domains/_platform/events/domain.md` | `_platform/events` | internal | Add contracts, composition, history |
| `docs/domains/_platform/state/domain.md` | `_platform/state` | internal | Update Phase 4 state-domain history and multiplexed transport docs |
| `docs/domains/registry.md` | cross-domain | cross-domain | Update if needed |

## Key Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | Critical | SSEManager already supports multiplexing — same controller can exist in multiple channel Sets. `broadcast()` iterates snapshots, so multi-Set membership is safe. | Exploit existing architecture. ONE change: add `channel: channelId` to broadcast payload (line 76). |
| 02 | Critical | Multi-channel cleanup race condition — on disconnect, controller must be removed from ALL registered channels atomically. Current `removeConnection()` loop could have concurrent broadcast modifying Sets. | Add `removeControllerFromAllChannels(controller)` method. Pre-compute channel list before cleanup. Use in mux route abort handler. |
| 03 | Critical | Proxy/CDN idle timeout risk — proxies often kill connections after 30-60s idle. Current heartbeat is 30s, cutting it close. | Reduce heartbeat to 15s in mux route specifically. Document proxy constraint. |
| 04 | High | ServerEvent type exists in `server-event-router.ts` but lacks `channel` field. | Extend with optional `channel?: string` (backwards compat). New multiplexed messages always include it. |
| 05 | High | FileChangeProvider has 50-attempt reconnection (2s-30s backoff). MultiplexedSSEProvider defaults to 5 attempts. Migration would reduce resilience. | Raise provider default to 15 attempts with 2s-15s exponential backoff. Make configurable via prop. |
| 06 | High | Index-based message cursor in ServerEventRoute. When switching from useSSE to useChannelEvents, the array source changes. If useChannelEvents accumulates independently, indices stay valid (each hook has its own array). | Verify `useChannelEvents` returns its own independent array per subscriber. Index cursor pattern works IF array is subscriber-local, not shared. |
| 07 | High | Dual-route risk during migration — old `[channel]` route and new `mux` route could both be active, causing double-delivery if same tab connects both. | Migrate consumers atomically per-consumer (remove old EventSource when adding new hook). Never have both active for same channel in same component. |
| 08 | High | No `apps/web/src/lib/sse/` directory exists. SSE-manager sits loose in `lib/`. | Create `sse/` directory for multiplexed infrastructure. Keep `sse-manager.ts` in place (moving would break many imports). |

## Testing Strategy

**Approach**: Hybrid
- **TDD**: SSEManager channel tagging, mux route, MultiplexedSSEProvider, useChannelEvents, useChannelCallback, FakeMultiplexedSSE
- **Lightweight**: Consumer migrations (QuestionPopper, FileChange, Workflow, Agents, GlobalStateConnector)
- **Mock Usage**: Fakes only (zero `vi.mock()`). Extend existing FakeEventSource with FakeMultiplexedSSE.

## Harness Strategy

Harness: Not applicable (user override — transport layer change; unit tests + manual DevTools verification sufficient).

## Deviations

### DEV-01: New SSE infrastructure lives in `apps/web`, not `packages/shared`

**Principle**: Constitution Principle 7 — "Shared by Default"

**Deviation**: `MultiplexedSSEProvider`, `useChannelEvents`, `useChannelCallback`, and `FakeMultiplexedSSE` are placed in `apps/web/src/lib/sse/` and `test/fakes/`, not in `packages/shared/`.

**Rationale**: These are React hooks and context providers that depend on `react`, `useState`, `useEffect`, `useCallback`, `useRef`, and `useContext`. They are inherently browser-specific. The existing SSE infrastructure follows this pattern: `useSSE` lives in `apps/web/src/hooks/`, `FileChangeProvider` lives in `apps/web/src/features/`, `SSEManager` lives in `apps/web/src/lib/`. No CLI or MCP server consumer uses SSE hooks. Moving React hooks to `packages/shared` would add `react` as a dependency there without any consumer outside `apps/web`.

**Rollback plan**: If a future app needs SSE multiplexing (unlikely — SSE is browser-only), extract the core subscription logic (non-React) to `packages/shared` and keep React wrappers in `apps/web`.

### DEV-02: Type names use `type` keyword without `I` prefix

**Principle**: R-CODE-002 — "MUST prefix interfaces with I"

**Deviation**: `MultiplexedSSEMessage` and `MultiplexedSSEContextValue` are TypeScript `type` aliases (data shapes), not service `interface` contracts. The `I` prefix convention applies to service interfaces (`ILogger`, `IWorkflowRepository`) that have fake/real implementations.

**Rationale**: Consistent with existing patterns — `ServerEvent`, `StateChange`, `StateEntry`, `FileChange`, `SSEConnectionState` are all type aliases without `I` prefix. The codebase distinguishes service interfaces (I-prefixed, have Fake* implementations) from data types (no prefix, are plain shapes).

### DEV-03: AC-07 heartbeat reduced from spec 30s to plan 15s

**Principle**: Spec AC-07 originally stated "30 seconds"

**Deviation**: Plan AC-07 specifies 15 seconds based on Finding 03 (proxy/CDN idle timeout risk). Proxies commonly kill connections after 30-60s idle. A 15s heartbeat ensures the mux connection survives behind any proxy.

## Phases

### Phase Index

| Phase | Title | Primary Domain | Objective | Depends On | CS |
|-------|-------|---------------|-----------|------------|-----|
| 1 | Server Foundation | `_platform/events` | Add channel tagging to SSEManager + create mux route | None | CS-2 |
| 2 | Client Provider + Hooks | `_platform/events` | MultiplexedSSEProvider, useChannelEvents, useChannelCallback | Phase 1 | CS-2 |
| 3 | Priority Consumer Migration | `question-popper`, `file-browser` | Migrate QuestionPopper + FileChange to multiplexed channel | Phase 2 | CS-2 |
| 4 | GlobalState Re-enablement | `_platform/state` | Re-enable GlobalStateConnector, migrate ServerEventRoute | Phase 2 | CS-2 |
| 5 | Remaining Migrations + Docs | `workflow-ui`, `agents` | Migrate workflow SSE, (optional) agents; docs + domain updates | Phase 3, 4 | CS-2 |

---

### Phase 1: Server Foundation

**Objective**: Tag all SSE payloads with `channel` field and create the multiplexed endpoint
**Domain**: `_platform/events`
**Delivers**:
- SSEManager.broadcast() includes `channel` in every payload
- `removeControllerFromAllChannels()` method on SSEManager
- `/api/events/mux` route with multi-channel registration, validation, auth, heartbeat, cleanup
- Tests for all of the above
**Depends on**: None
**Key risks**: Finding 02 (cleanup race), Finding 03 (heartbeat interval)

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 1.1 | Add `channel: channelId` to SSEManager.broadcast() payload | `_platform/events` | Existing SSE messages include `channel` field. All existing tests still pass. | Finding 01. One-line change. Non-breaking. |
| 1.2 | Add `removeControllerFromAllChannels(controller)` method | `_platform/events` | Controller removed from ALL channel Sets atomically. Empty Sets cleaned up. TDD. | Finding 02. New method on SSEManager. |
| 1.3 | Extend ServerEvent type with optional `channel` field | `_platform/events` | `ServerEvent.channel?: string`. Existing consumers unaffected. | Finding 04. In server-event-router.ts. |
| 1.4 | Create `/api/events/mux` route | `_platform/events` | Accepts `?channels=a,b,c`. Registers controller on all channels. Auth required. Heartbeat 15s. Validates names. Max 20. Dedupes. | Findings 03, 05. AC-02 through AC-08. |
| 1.5 | Create mux route tests | `_platform/events` | Route rejects missing/invalid channels. Registers on correct channels. Cleans up on disconnect. Sends heartbeat. | TDD approach. |
| 1.6 | Extend SSEManager tests for channel tagging | `_platform/events` | Verify broadcast payload includes `channel`. Verify removeControllerFromAllChannels. | TDD approach. |

### Acceptance Criteria (Phase 1)
- AC-01: SSEManager.broadcast() includes `channel` field
- AC-02: Mux route accepts `?channels=a,b,c`
- AC-03: Mux route registers one controller in SSEManager for each requested channel
- AC-04: Mux route validates channel names
- AC-05: Mux route limits to max 20 channels, deduplicates
- AC-06: Mux route requires authentication
- AC-07: Mux route sends heartbeat every 15 seconds
- AC-08: On disconnect, controller removed from ALL registered channels
- AC-09: Existing `/api/events/[channel]` route continues working unchanged
- AC-10: Existing per-channel payloads now include `channel` field

---

### Phase 2: Client Provider + Hooks

**Objective**: Create MultiplexedSSEProvider and consumer hooks with test infrastructure
**Domain**: `_platform/events`
**Delivers**:
- `MultiplexedSSEProvider` React context at workspace layout level
- `useChannelEvents` hook (message accumulation)
- `useChannelCallback` hook (notification-fetch callback)
- `FakeMultiplexedSSE` test utility
- Contract tests for all components
**Depends on**: Phase 1
**Key risks**: Finding 05 (reconnection ceiling), Finding 06 (cursor compatibility)

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 2.1 | Define SSE multiplexing contracts in `apps/web/src/lib/sse/types.ts` | `_platform/events` | Exports `MultiplexedSSEMessage` type (channel, type, data shape), `MultiplexedSSEContextValue` type (subscribe, isConnected, error). These are the contracts that FakeMultiplexedSSE (2.2) and MultiplexedSSEProvider (2.3) both satisfy. Contracts defined BEFORE implementations. | Constitution P2: Interface-First. |
| 2.2 | Create FakeMultiplexedSSE test utility | `_platform/events` | simulateChannelMessage(channel, type, data), simulateOpen(), simulateError(). Factory pattern matching existing FakeEventSource. Satisfies MultiplexedSSEContextValue contract. | TDD infrastructure first. P2 sequence: fake before real. |
| 2.3 | Create MultiplexedSSEProvider | `_platform/events` | Single EventSource to `/api/events/mux?channels=...`. Subscribe/unsubscribe by channel. Demux by `msg.channel`. Error isolation per subscriber. Reconnect with exponential backoff (15 attempts, 2s-15s). | AC-11 through AC-16, AC-20. Finding 05. |
| 2.4 | Create useChannelEvents hook | `_platform/events` | Returns `{ messages, isConnected, clearMessages }` for subscribed channel. Own message array per subscriber (independent of other channels). Respects maxMessages. | AC-17, AC-19. Finding 06. |
| 2.5 | Create useChannelCallback hook | `_platform/events` | Fires callback per event. No message accumulation. Stable ref pattern for callback. | AC-18, AC-19. |
| 2.6 | Create barrel export `apps/web/src/lib/sse/index.ts` | `_platform/events` | Exports provider, hooks, types. | |
| 2.7 | Contract tests for provider + hooks | `_platform/events` | Channel isolation, reconnection, error isolation, cleanup on unmount, maxMessages pruning. | TDD approach. |
| 2.8 | Mount MultiplexedSSEProvider in workspace layout | cross-domain | Provider wraps QuestionPopperOverlayWrapper and all children. Static channels: `['event-popper', 'file-changes', 'work-unit-state']`. | Layout.tsx modification. |

### Acceptance Criteria (Phase 2)
- AC-11: MultiplexedSSEProvider creates exactly ONE EventSource
- AC-12: Provider demultiplexes by `msg.channel`
- AC-13: Provider isolates subscriber errors
- AC-14: Provider reconnects with exponential backoff (max 15 attempts)
- AC-15: Provider cleans up EventSource on unmount
- AC-16: Provider exposes `isConnected` and `error`
- AC-17: `useChannelEvents` accumulates messages for subscribed channel only
- AC-18: `useChannelCallback` fires callback per event
- AC-19: Both hooks ignore events from other channels
- AC-20: Provider testable via injected EventSourceFactory

---

### Phase 3: Priority Consumer Migration

**Objective**: Migrate question-popper and file-changes from direct EventSource to multiplexed channels
**Domain**: `question-popper`, `file-browser`
**Delivers**:
- QuestionPopperProvider using `useChannelCallback('event-popper')`
- FileChangeProvider using `useChannelCallback('file-changes')`
- Removed ~150 lines of direct EventSource lifecycle code
- All existing consumer APIs (useFileChanges, useQuestionPopper) unchanged
**Depends on**: Phase 2
**Key risks**: FileChangeProvider has complex reconnection + worktreePath filtering

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 3.1 | Migrate QuestionPopperProvider to useChannelCallback | `question-popper` | Replace direct EventSource (~70 lines) with `useChannelCallback('event-popper', ...)`. Notification-fetch pattern preserved. Outstanding count + refetch logic unchanged. | AC-21. Lightweight testing. |
| 3.2 | Migrate FileChangeProvider to useChannelCallback | `file-browser` | Replace direct EventSource (~80 lines) with `useChannelCallback('file-changes', ...)`. worktreePath filtering + hub dispatch preserved. Reconnection logic removed (centralized in provider). | AC-22, AC-23. Finding 05. |
| 3.3 | Verify end-to-end question popper | cross-domain | CLI ask → UI notification → answer → CLI receives. Manual verification. | AC-29. |
| 3.4 | Verify end-to-end file changes | cross-domain | Edit file externally → browser shows update. Manual verification. | AC-30. |
| 3.5 | Verify single SSE connection per tab | cross-domain | DevTools Network tab shows exactly 1 SSE connection (mux), not 2-3 individual channels. | AC-27. |

### Acceptance Criteria (Phase 3)
- AC-21: QuestionPopperProvider uses multiplexed channel
- AC-22: FileChangeProvider uses multiplexed channel
- AC-23: FileChangeHub + useFileChanges API unchanged
- AC-27: Workspace tab opens exactly 1 SSE connection
- AC-29: Question popper end-to-end works
- AC-30: File changes end-to-end works
- AC-31: All existing tests pass

---

### Phase 4: GlobalState Re-enablement

**Objective**: Re-enable GlobalStateConnector so work-unit-state events flow through SSE → GlobalStateSystem
**Domain**: `_platform/state`
**Delivers**:
- ServerEventRoute consuming from useChannelEvents instead of per-route useSSE
- GlobalStateConnector un-commented in browser-client.tsx
- Work-unit-state events visible in GlobalStateSystem
**Depends on**: Phase 2
**Key risks**: Finding 06 (cursor compatibility — verify independent array per subscriber)

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 4.1 | Migrate ServerEventRoute to useChannelEvents | `_platform/state` | Replace `useSSE('/api/events/${route.channel}')` with `useChannelEvents(route.channel)`. Index cursor logic unchanged. | AC-25. Finding 06. |
| 4.2 | Add 'work-unit-state' to mux channel list | cross-domain | Workspace layout MultiplexedSSEProvider channels includes 'work-unit-state'. | Modify layout.tsx channels array. |
| 4.3 | Re-enable GlobalStateConnector in browser-client.tsx | `_platform/state` | Uncomment GlobalStateConnector. Remove "disabled" comment. Update state-connector.tsx comment to note multiplexing is active. | AC-24, AC-26. |
| 4.4 | Verify work-unit-state events | cross-domain | Work unit status changes visible in GlobalStateSystem (via useGlobalState hook or DevTools). | AC-26. |

### Acceptance Criteria (Phase 4)
- AC-24: GlobalStateConnector re-enabled
- AC-25: ServerEventRoute consumes from multiplexed provider
- AC-26: Work-unit-state events flow through SSE → GlobalStateSystem
- AC-28: 3+ tabs open simultaneously without lockup

---

### Phase 5: Remaining Migrations + Documentation

**Objective**: Migrate remaining consumers, update docs, finalize domain artifacts
**Domain**: `workflow-ui`, `agents`, `_platform/events`
**Delivers**:
- useWorkflowSSE migrated to useChannelEvents
- (Optional) useAgentManager migrated to useChannelCallback
- CLAUDE.md updated with SSE multiplexing reference
- `docs/how/sse-multiplexing.md` migration guide
- `_platform/events` domain.md updated with new contracts + history
**Depends on**: Phase 3, Phase 4
**Key risks**: Agent migration optional per clarification Q7

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 5.1 | Migrate useWorkflowSSE to useChannelEvents | `workflow-ui` | Replace `useSSE('/api/events/workflows')` with `useChannelEvents('workflows')`. Add 'workflows' to mux channel list. | Lightweight. |
| 5.2 | (Optional) Migrate useAgentManager to useChannelCallback | `agents` | Replace direct EventSource to `/api/agents/events` with `useChannelCallback('agents')`. Add 'agents' to mux channel list. | Per clarification Q7: lowest priority. |
| 5.3 | Update CLAUDE.md with SSE multiplexing reference | cross-domain | Add useChannelEvents / useChannelCallback usage to Quick Reference section. | Documentation strategy. |
| 5.4 | Create `docs/how/sse-multiplexing.md` migration guide | cross-domain | How to add a new SSE channel consumer using the multiplexed provider. Three patterns documented with examples. | Documentation strategy. |
| 5.5 | Update `_platform/events` domain.md | `_platform/events` | New contracts (MultiplexedSSEProvider, useChannelEvents, useChannelCallback). Updated composition. Updated source location. History entry for Plan 072. | Domain sync. |
| 5.6 | Update `_platform/state` domain.md | `_platform/state` | Note GlobalStateConnector re-enabled. Update history. | Domain sync. |
| 5.7 | Update consumer domain.md files | `question-popper`, `file-browser` | Note migration from direct EventSource to multiplexed. Update dependencies. | Domain sync. |

### Acceptance Criteria (Phase 5)
- AC-28: 3+ tabs open simultaneously without lockup
- AC-31: All existing tests pass
- CLAUDE.md reflects new contracts
- Migration guide published

---

## Risks

| Risk | Likelihood | Impact | Mitigation | Phase |
|------|-----------|--------|------------|-------|
| Multi-channel cleanup race | Low | High | `removeControllerFromAllChannels()` method | 1 |
| Proxy idle timeout kills mux connection | Medium | High | 15s heartbeat (vs 30s) in mux route | 1 |
| FileChange reconnection resilience drops | Medium | Medium | 15 max attempts (vs 5 default), configurable | 2 |
| ServerEventRoute cursor breaks with new array source | Low | High | Verify independent array per useChannelEvents subscriber | 4 |
| Dual-route double delivery during migration | Low | Medium | Atomic per-consumer migration; never dual-connect same channel | 3 |
| Agent text deltas saturate mux stream | Low (not implemented) | Medium | Defer to future plan; server-side batching when needed | N/A |
