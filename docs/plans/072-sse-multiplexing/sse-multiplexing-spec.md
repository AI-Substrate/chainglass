# SSE Multiplexing

**Mode**: Full
📚 This specification incorporates findings from `research-dossier.md` and `workshops/001-multiplexer-design.md`.

## Summary

Consolidate all Server-Sent Event channels into a single multiplexed `EventSource` connection per browser tab. Today, each SSE feature (file-changes, event-popper, work-unit-state, agents, workflows) opens its own HTTP connection. Under HTTP/1.1's 6-connection-per-origin limit, 2-3 tabs exhaust the budget and lock up the entire application — REST calls queue, pages stall, navigation breaks.

The multiplexer introduces one shared SSE endpoint that carries events from all channels in a single stream. A lightweight client-side provider demultiplexes events by channel and dispatches them to existing consumers. Server-side event producers are unchanged — they continue emitting through `CentralEventNotifier` as they do today.

**Why**: The post-merge question-popper regression (PR #39) doubled steady-state SSE connections per tab, reproducing the exact connection-pressure lockup that already forced GlobalStateConnector to be disabled (Plan 053 DYK #4). HTTP/2 was investigated and ruled out due to Next.js App Router incompatibility (Workshop 002). A multiplexed SSE endpoint is the architecturally correct fix — already documented as the intended solution in `state-connector.tsx`.

## Goals

- **One SSE connection per tab** regardless of how many event channels are active
- **Re-enable GlobalStateConnector** (disabled since Plan 053) for work-unit-state and future SSE→State bridges
- **Fix the question-popper regression** without removing question-popper functionality
- **Scale to unlimited future channels** without consuming additional HTTP connections
- **Gradual migration** — existing consumers migrate one at a time, no big-bang cutover
- **Preserve all existing event semantics** — notification-fetch pattern, hub fan-out, message accumulation all continue working unchanged
- **Testable via fakes** following project convention (zero `vi.mock()`)

## Non-Goals

- **HTTP/2 local dev** — investigated and deferred (Workshop 002: Next.js App Router incompatible, requires TLS, cert generation broken)
- **Cross-tab SSE sharing** (BroadcastChannel / SharedWorker) — valuable but separate concern; multiplexing within a tab must land first
- **WebSocket migration** — terminal uses WebSocket by design; it's bidirectional and stays separate
- **Server-side event pipeline changes** — `CentralEventNotifier` → `SSEManagerBroadcaster` → `SSEManager` pipeline is correct and stays unchanged
- **Changing how consumers process events** — business logic in every consumer stays identical; only the transport layer changes
- **Agent text streaming optimization** — high-frequency agent text deltas (not yet implemented) may need server-side batching eventually, but that's a separate concern

## Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|-------------|---------------------|
| `_platform/events` | existing | **modify** | Core target: new mux route, channel tagging in SSEManager, new client provider + hooks |
| `_platform/state` | existing | **modify** | Re-enable GlobalStateConnector, ServerEventRoute consumes from multiplexed provider |
| `question-popper` | existing | **modify** | Migrate QuestionPopperProvider from direct EventSource to multiplexed channel subscription |
| `file-browser` | existing | **modify** | Migrate FileChangeProvider from direct EventSource to multiplexed channel subscription |
| `agents` | existing | **modify (optional)** | (Optional, Phase 5) Migrate useAgentManager from dedicated route to multiplexed channel subscription |
| `workflow-ui` | existing | **modify** | Migrate useWorkflowSSE from direct useSSE to multiplexed channel subscription |
| `_platform/external-events` | existing | consume | Uses WorkspaceDomain.EventPopper channel name (no changes needed) |

## Research Context

### From Research Dossier

- **10 SSE consumers** inventoried across the codebase (4 easy, 2 medium, 2 hard, 2 infrastructure)
- **SSEManager already supports the key trick**: one `ReadableStreamDefaultController` can be added to multiple channel Sets simultaneously — broadcasts from ANY registered channel reach the controller
- **Adding `channel: channelId` to SSEManager.broadcast() payload** is the critical server change (one line, non-breaking)
- **8 prior learnings** from Plans 005, 015, 019, 027, 053, 059, 067 inform hazards to avoid
- **GlobalStateConnector** has been waiting for this fix since Plan 053 — code is ready, just needs multiplexed transport

### From Workshop 001 (Multiplexer Design)

- **Route**: `/api/events/mux?channels=file-changes,event-popper,work-unit-state`
- **Wire format**: `{"channel":"event-popper","type":"question-asked","questionId":"q_abc","outstandingCount":1}`
- **Client**: `MultiplexedSSEProvider` at workspace layout level, `useChannelEvents` (accumulation) and `useChannelCallback` (notification-fetch) hooks
- **Three consumer patterns** identified: callback (refetch), accumulation (message cursor), hub (fan-out dispatcher)
- **Mount point**: Workspace layout, between ActivityLogOverlayWrapper and QuestionPopperOverlayWrapper

### From Workshop 002 (HTTP/2 Feasibility)

- HTTP/2 ruled out: Next.js custom `http2.createSecureServer()` breaks App Router middleware with pseudo-header errors
- Browsers require TLS for HTTP/2 (no h2c support), and `--experimental-https` only gives HTTP/1.1 over TLS
- Multiplexed SSE is the correct solution that works on HTTP/1.1 today

## Complexity

**Score**: CS-3 (medium)

**Breakdown**: S=2, I=0, D=0, N=0, F=1, T=1

| Dimension | Score | Rationale |
|-----------|-------|-----------|
| Surface Area (S) | 2 | Cross-cutting: touches 7 domains, new route, new provider, migration across 10 consumers |
| Integration (I) | 0 | Internal only — all changes within the monorepo, no external dependencies |
| Data/State (D) | 0 | No schema/migration changes — SSE is ephemeral transport, no persistence |
| Novelty (N) | 0 | Well-specified via workshops + research; clear before/after for every consumer |
| Non-Functional (F) | 1 | Connection limit is the motivating constraint; must verify per-tab connection count |
| Testing/Rollout (T) | 1 | Integration testing needed (server broadcast → client channel delivery); gradual migration |

**Total**: P=4 → **CS-3 (medium)**

**Confidence**: 0.90 — workshops produced implementation-ready designs; only unknowns are agent event volume and edge cases in FileChangeProvider migration.

**Assumptions**:
- Existing `SSEManager.addConnection()` works correctly when same controller added to multiple channel Sets (verified in research — Sets are independent)
- Consumer business logic truly doesn't need changes (verified per-consumer in workshop)
- Static channel list is sufficient (no need for dynamic subscription after connection)

**Dependencies**:
- Plan 067 (question-popper) must be merged first (it's the regression trigger)
- No external dependencies

**Risks**:
- FileChangeProvider has complex reconnection logic (50 attempts, worktreePath filtering) — migration must preserve hub semantics
- Agent events may have high-frequency text deltas in future — monitor but don't block on this

**Phases** (suggested):
1. Server foundation (channel tagging + mux route)
2. Client provider + hooks
3. Migrate priority consumers (question-popper, file-changes)
4. Re-enable GlobalStateConnector + migrate ServerEventRoute
5. (Optional) Migrate remaining consumers (agents, workflows, catalog)

## Acceptance Criteria

### Server

- **AC-01**: SSEManager.broadcast() includes `channel` field in every SSE payload
- **AC-02**: New `/api/events/mux` route accepts `?channels=a,b,c` query parameter
- **AC-03**: Mux route registers one controller in SSEManager for each requested channel
- **AC-04**: Mux route validates channel names against `^[a-zA-Z0-9_-]+$`, rejects invalid
- **AC-05**: Mux route limits to max 20 channels per connection, deduplicates
- **AC-06**: Mux route requires authentication (session check)
- **AC-07**: Mux route sends heartbeat every 15 seconds (reduced from 30s per proxy timeout research — see plan DEV-03)
- **AC-08**: On disconnect, controller is removed from ALL registered channels (no leak)
- **AC-09**: Existing `/api/events/[channel]` route continues working unchanged (backwards compat)
- **AC-10**: Existing per-channel payloads now include `channel` field (non-breaking addition)

### Client Provider

- **AC-11**: MultiplexedSSEProvider creates exactly ONE EventSource connection
- **AC-12**: Provider demultiplexes events by `msg.channel` to channel-specific subscribers
- **AC-13**: Provider isolates subscriber errors (one subscriber throwing doesn't affect others)
- **AC-14**: Provider reconnects with exponential backoff on error (max 5 attempts)
- **AC-15**: Provider cleans up EventSource on unmount
- **AC-16**: Provider exposes `isConnected` and `error` state to consumers
- **AC-17**: `useChannelEvents(channel)` accumulates messages for subscribed channel only
- **AC-18**: `useChannelCallback(channel, callback)` fires callback per event without accumulation
- **AC-19**: Both hooks ignore events from other channels
- **AC-20**: Provider is testable via injected EventSourceFactory (zero vi.mock)

### Consumer Migration

- **AC-21**: QuestionPopperProvider uses multiplexed channel instead of direct EventSource
- **AC-22**: FileChangeProvider uses multiplexed channel instead of direct EventSource
- **AC-23**: FileChangeHub + useFileChanges API unchanged (consumers of FileChangeProvider are unaffected)
- **AC-24**: GlobalStateConnector re-enabled in browser-client.tsx
- **AC-25**: ServerEventRoute consumes from multiplexed provider instead of per-route useSSE
- **AC-26**: Work-unit-state events flow through SSE → GlobalStateSystem after re-enablement

### Verification

- **AC-27**: With multiplexed endpoint active, a workspace tab opens exactly 1 SSE connection (down from 2-4)
- **AC-28**: 3+ tabs open simultaneously without REST request stalling or page lockup
- **AC-29**: Question popper continues working end-to-end (CLI ask → UI notification → answer → CLI receives)
- **AC-30**: File change events continue working end-to-end (edit file → browser updates)
- **AC-31**: All existing tests continue passing (non-breaking migration)

## Risks & Assumptions

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| FileChangeProvider migration breaks reconnection | Low | High | Preserve hub dispatch semantics; test with real file edits |
| Same controller in multiple Sets causes unexpected behavior | Very Low | High | Verified in research — Sets are independent; SSEManager already snapshots before iteration |
| High-frequency agent text deltas saturate multiplexed stream | Low (not yet implemented) | Medium | Server-side batching when text deltas ship; out of scope for this plan |
| Visibility-based disconnect causes missed events | N/A | N/A | Deferred to future plan; notification-fetch pattern already handles reconnection gaps |
| Channel name mismatch causes silent event loss | Low | High | Use WorkspaceDomain const for all channel references; type-safe |

**Assumptions**:
- HTTP/1.1 remains the local dev protocol (no HTTP/2 in foreseeable future)
- Static channel subscription at connection time is sufficient (no dynamic add/remove)
- All consumers can tolerate brief reconnection gaps (notification-fetch pattern handles this)
- The `[channel]` route stays for backwards compatibility and debugging (`curl` single-channel)

## Open Questions

### OQ-01: Should agent events migrate to the mux endpoint?

**RESOLVED**: Include as final phase (lowest priority). Migrate agent lifecycle events (status, created, terminated) to mux if time permits. The dedicated `/api/agents/events` route stays until migration. Text delta streaming decision deferred until that feature is actually built.

### OQ-02: Should the mux endpoint support dynamic channel subscription?

**RESOLVED**: Start static. Channels set at connection time via query parameter. Reconnecting with a new channel list is acceptable (EventSource auto-reconnects with the same URL). Dynamic subscription adds server-side state management complexity with no current use case.

## Workshop Opportunities

| Topic | Type | Why Workshop | Key Questions |
|-------|------|--------------|---------------|
| ~~Multiplexer Design~~ | Integration Pattern | ~~Core design needed before architecture~~ | **COMPLETED**: `workshops/001-multiplexer-design.md` |
| ~~HTTP/2 Feasibility~~ | Integration Pattern | ~~Evaluate alternative solution path~~ | **COMPLETED**: `067-question-popper/workshops/002-http2-sse-feasibility.md` |

## Testing Strategy

**Approach**: Hybrid — Full TDD for server components, Lightweight for consumer migrations

| Component | Approach | Rationale |
|-----------|----------|-----------|
| SSEManager channel tagging | TDD | Core contract change, must be non-breaking |
| `/api/events/mux` route | TDD | New endpoint with validation, auth, multi-channel registration |
| MultiplexedSSEProvider | TDD | Core client component, reconnection, error isolation |
| useChannelEvents / useChannelCallback | TDD | Public contract hooks consumed by all features |
| FakeMultiplexedSSE | TDD | Test infrastructure — must be reliable |
| Consumer migrations (QuestionPopper, FileChange, etc.) | Lightweight | Mechanical transport swap; business logic unchanged and already tested |
| GlobalStateConnector re-enablement | Lightweight | Existing component, just uncommented and wired |

**Mock Usage**: Fakes only — zero `vi.mock()`. Extend existing `FakeEventSource` with `FakeMultiplexedSSE` for channel-aware simulation. `FakeController` for server-side SSEManager tests.

**Focus Areas**: Channel isolation (events route to correct subscriber), multi-channel cleanup on disconnect, reconnection preserving subscriptions, backwards compatibility of `channel` field addition.

**Excluded**: End-to-end browser automation (manual verification via DevTools connection count).

## Documentation Strategy

**Location**: Hybrid — CLAUDE.md quick reference + `docs/how/` migration guide

| Document | Content | Audience |
|----------|---------|----------|
| CLAUDE.md | Update SSE section under Quick Reference with `useChannelEvents` / `useChannelCallback` usage | AI agents, developers |
| `docs/how/sse-multiplexing.md` | Migration guide: how to add a new SSE channel consumer using the multiplexed provider | Feature developers |

## Clarifications

### Session 2026-03-08

**Q1: Workflow Mode** → **Full Mode**. CS-3 with 5 phases, 7 domains, 10 consumer migrations — requires phase dossiers and all gates.

**Q2: Testing Strategy** → **Hybrid**. TDD for server mux route + SSEManager + client provider/hooks. Lightweight for mechanical consumer migrations.

**Q3: Mock Usage** → **Fakes only**. Project convention (zero `vi.mock()`). Extend FakeEventSource with FakeMultiplexedSSE.

**Q4: Documentation Strategy** → **Hybrid**. CLAUDE.md quick reference + `docs/how/sse-multiplexing.md` migration guide.

**Q5: Domain Review** → **Confirmed as specified**. 7 domains, no new domains, extends `_platform/events`. All changes respect existing contracts.

**Q6: Harness** → **Continue without harness**. Transport layer change; unit tests + manual DevTools verification sufficient.

**Q7 (OQ-01): Agent events** → **Include as final phase, lowest priority**. Migrate agent lifecycle events if time permits; defer text delta decision. Dedicated `/api/agents/events` route stays until migrated.
