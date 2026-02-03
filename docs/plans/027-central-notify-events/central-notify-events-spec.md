# Central Domain Event Notification System

**Mode**: Full
**Testing**: Full TDD
**File Management**: PlanPak

## Research Context

This specification incorporates findings from `research-dossier.md`.

- **Components affected**: CentralWatcherService, WorkGraphWatcherAdapter, SSEManager, broadcastGraphUpdated(), useWorkGraphSSE, AgentNotifierService, ISSEBroadcaster, DI containers, bootstrap
- **Critical dependencies**: chokidar (filesystem), tsyringe (DI), existing SSE infrastructure (Plan 006/019/022/023)
- **Modification risks**: Two parallel notification systems (agents, workgraphs) coexist without a shared abstraction. Deprecating piecemeal code requires careful barrel export management (PL-11, PL-12).
- **Key finding**: All components exist but are not connected at runtime. The wiring gap is small and well-defined. The `AgentNotifierService` (Plan 019) is the fully-wired reference pattern.
- Link: See `research-dossier.md` for full analysis

## Summary

The application currently has two independent, ad-hoc notification systems: one for agents (fully wired) and one for workgraphs (partially wired, never connected to filesystem changes). Both bypass a coherent central event model. Additionally, domain concepts like "workgraphs" and "agents" lack a first-class identity as workspace data domains -- they're scattered string constants.

This feature introduces a **central domain event notification system** that unifies how all workspace domains emit events, deliver them via SSE to the browser, and allow client-side domains to subscribe. Existing ad-hoc notification code (`broadcastGraphUpdated()`, `AgentNotifierService`) will be deprecated in favour of domain event adapters that plug into this central system. The first concrete consumer is workgraph filesystem change detection: when an external process writes a workgraph `state.json`, the UI automatically refreshes and shows a toast.

**WHY**: Users editing workgraphs via CLI agents or external tools see stale UI. The manual refresh button is a poor experience. A unified event system also prevents future domains from reinventing notification plumbing, reducing maintenance burden and making the codebase more coherent.

## Goals

1. **Unified domain event model**: All workspace domains (workgraphs, agents, samples, future) emit events through a single central system rather than ad-hoc per-domain SSE wiring
2. **Named workspace data domains**: Domains become a first-class concept with an enumerated identity (e.g., `WorkspaceDomain.Workgraphs`, `WorkspaceDomain.Agents`), enabling factory-based retrieval of both filesystem watcher adapters and domain event adapters by domain name
3. **Domain event adapters**: Each domain provides an adapter that takes filesystem watcher events (from CentralWatcherService) as one input and can also receive programmatic events from any source -- the adapter transforms these into domain-specific events and forwards them to the central event notifier
4. **Central event notifier service**: A single service that accepts domain events from any adapter and delivers them via SSE to subscribed clients, replacing direct `sseManager.broadcast()` calls scattered across API routes
5. **Factory and DI-driven construction**: Domain adapters, watcher adapters, and the central notifier are created via factories and wired through DI -- consumers retrieve adapters by domain name
6. **Workgraph as first consumer**: When an external filesystem change is detected on a workgraph `state.json` that was NOT initiated by the UI (distinguished by debounce), the UI automatically refreshes and shows a toast notification saying the graph was updated from an external change
7. **Deprecation path for existing ad-hoc code**: `broadcastGraphUpdated()`, `AgentNotifierService`, and other direct SSE broadcast calls are marked as deprecated with clear migration paths to domain event adapters
8. **Extremely simple end-state for workgraphs**: A filesystem change sends a `graph-updated` event with `graphSlug` through the central notifier -> SSE -> client filters by graphSlug -> refresh + toast. No complex payloads, no event history, no replay.

## Non-Goals

- **Event persistence or replay**: Events are fire-and-forget notifications (per ADR-0007 notification-fetch pattern). No event log, no replay buffer.
- **Migrating agents off the old system in this plan**: Agents will continue using `AgentNotifierService` for now. The deprecation marker is placed but migration happens in a future plan.
- **New SSE route handlers**: The existing `/api/events/[channel]` dynamic route serves all domains. No new routes.
- **Complex event payloads**: SSE carries only domain identifiers (e.g., `{graphSlug}`). Clients fetch full state via REST (notification-fetch pattern).
- **Performance optimization or load testing**: The system is for a development tool with few concurrent users. No need for benchmarking.
- **Client-side event bus or pub/sub**: Domain event subscription in the browser remains via SSE hooks per domain. No in-browser event bus.
- **Removing existing code immediately**: Deprecated code stays functional with `@deprecated` markers. Removal is a separate cleanup plan.

## Complexity

- **Score**: CS-3 (medium)
- **Breakdown**: S=2, I=0, D=1, N=1, F=0, T=1 (Total P=5)
  - **Surface Area (S=2)**: Cross-cutting -- touches `packages/shared` (types, tokens, interfaces), `packages/workflow` (adapters, watcher), `apps/web` (DI, bootstrap, SSE bridge, UI toast)
  - **Integration (I=0)**: All internal; no new external dependencies
  - **Data/State (D=1)**: New enum for workspace domains, new DI token registrations, minor type changes
  - **Novelty (N=1)**: Pattern is established (AgentNotifierService reference), but the unification layer and domain enum are new design
  - **Non-Functional (F=0)**: Standard dev-tool requirements
  - **Testing (T=1)**: Unit + integration tests following existing patterns; contract tests for fake/real parity
- **Confidence**: 0.80
- **Assumptions**:
  - CentralWatcherService can be started during web server boot without issues
  - The existing `useWorkGraphSSE` hook's `onExternalChange` callback is sufficient for toast integration
  - Server-side debounce (suppress watcher events briefly after API mutation) is the chosen strategy (confirmed in clarifications)
- **Dependencies**: Plan 023 completed (CentralWatcherService exists), Plan 019 completed (AgentNotifierService reference pattern exists)
- **Risks**:
  - Dual notifications (API broadcast + watcher event) for the same file write if debounce is too short
  - Breaking changes to barrel exports if deprecation isn't handled carefully
  - HMR issues with CentralWatcherService lifecycle in dev mode (chokidar + Next.js hot reload)
- **Phases**:
  1. Domain enum + central event notifier interface + fakes (types and contracts)
  2. Central event notifier service implementation + DI wiring + watcher bridge
  3. Workgraph domain event adapter + debounce + toast integration
  4. Deprecation markers on old code + validation

## Acceptance Criteria

1. **AC-01**: A `WorkspaceDomain` enum (or string union) exists with at least `Workgraphs` and `Agents` members, and a factory function can retrieve the filesystem watcher adapter for a given domain by name
2. **AC-02**: A central event notifier interface (`ICentralEventNotifier` or similar) exists that accepts domain events and delivers them via SSE, with a matching fake for testing
3. **AC-03**: The central event notifier is registered in the web DI container and started at server boot
4. **AC-04**: `CentralWatcherService` is registered in the web DI container, started at boot, and dispatches filesystem events to registered watcher adapters
5. **AC-05**: A workgraph domain event adapter receives `WorkGraphChangedEvent` from the watcher adapter and emits a domain event through the central notifier
6. **AC-06**: When an external process writes a workgraph `state.json`, the browser receives a `graph-updated` SSE event within ~2 seconds (chokidar stabilization + SSE delivery)
7. **AC-07**: When the UI itself saves a workgraph change (via API route), the subsequent filesystem watcher event does NOT produce a duplicate SSE notification (debounce prevents echo)
8. **AC-08**: The workgraph detail page shows a toast notification (e.g., "Graph updated from external change") when an external change triggers a refresh
9. **AC-09**: `broadcastGraphUpdated()` is marked `@deprecated` with a JSDoc comment pointing to the domain event adapter replacement
10. **AC-10**: `AgentNotifierService` is marked `@deprecated` with a JSDoc comment noting future migration to domain event adapters
11. **AC-11**: All existing tests continue to pass (2711+ tests)
12. **AC-12**: New code has unit tests with fakes (no `vi.mock()`), following the fakes-over-mocks convention
13. **AC-13**: Domain event adapters can emit events for any reason, not limited to filesystem changes -- the filesystem watcher adapter is just one input

## Risks & Assumptions

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Dual SSE events (API broadcast + watcher) if debounce fails | Medium | Low (extra refresh is harmless, just wasteful) | Server-side debounce with conservative window (~500ms); client `isRefreshing` guard as fallback |
| CentralWatcherService lifecycle issues under Next.js HMR | Medium | Medium (watcher may accumulate during dev) | Use `globalThis` pattern like SSEManager; test HMR behavior manually |
| Breaking barrel exports during deprecation | Low | High (build failures) | PL-12: wire barrels immediately; PL-11: clear tsbuildinfo after changes |
| Domain enum becomes too rigid for future extensibility | Low | Low | Use string union with const object pattern rather than TS enum for extensibility |

**Assumptions**:
- The web server process is long-lived enough for CentralWatcherService to be useful (not serverless/edge)
- Only one web server instance runs per workspace (no multi-instance SSE fan-out needed)
- The `onExternalChange` callback in `useWorkGraphSSE` fires after refresh completes, making it the right place for toasts

## Open Questions

All resolved — see [Clarifications](#clarifications) below.

## ADR Seeds (Optional)

### ADR Seed: Central Domain Event Architecture

- **Decision Drivers**: Two parallel notification systems (agents, workgraphs) with no shared abstraction; need for factory-based domain adapter retrieval; desire to deprecate ad-hoc broadcast calls
- **Candidate Alternatives**:
  - A) Thin wrapper: Central notifier wraps `sseManager.broadcast()` with domain routing; adapters call notifier instead of sseManager directly
  - B) Full event bus: Central event bus with topic-based subscriptions, middleware pipeline, event store
  - C) Domain-specific notifier services: Each domain gets its own notifier (current pattern with AgentNotifierService), just better organized
- **Stakeholders**: Core development team

### ADR Seed: Workspace Domain Identity

- **Decision Drivers**: Need to retrieve adapters by domain name; current scattered string constants; factory pattern for adapter construction
- **Candidate Alternatives**:
  - A) `const WorkspaceDomain = { Workgraphs: 'workgraphs', Agents: 'agents' } as const` (extensible string union)
  - B) TypeScript enum `enum WorkspaceDomain { Workgraphs, Agents }` (strict but less extensible)
  - C) Just use strings with a type guard (minimal structure)
- **Stakeholders**: Core development team

## ADRs

- ADR-0010: Central Domain Event Notification Architecture (2026-02-03) -- status: Accepted

## Workshop Opportunities

| Topic | Type | Why Workshop | Key Questions |
|-------|------|--------------|---------------|
| Central Event Notifier API Design | API Contract | The notifier interface determines how all domains emit events; getting this right prevents churn | 1. What does the `emit()` signature look like? 2. How does it map domain events to SSE channels? 3. Does it accept domain-agnostic events or typed per-domain? 4. How does it relate to `ISSEBroadcaster`? |
| Debounce Strategy for UI vs External Changes | Integration Pattern | Dual notification (API + watcher) is the trickiest design problem; wrong choice causes either missed events or duplicates | 1. Server-side suppression window after API write? 2. Client-side ignore window after own save? 3. What about concurrent saves from two browser tabs? 4. How long should the window be? |
| Domain Adapter Factory Pattern | Integration Pattern | Factory must serve both watcher adapters and event adapters by domain name; this pattern will be used by all future domains | 1. One factory for both adapter types or separate factories? 2. How does DI interact with the factory? 3. Should adapters be singletons or per-request? 4. How does this compose with CentralWatcherService's `registerAdapter()`? |

## Testing Strategy

- **Approach**: Full TDD
- **Rationale**: CS-3 feature with cross-cutting concerns (DI, SSE, filesystem, UI); TDD ensures each layer works before integration
- **Focus Areas**:
  - Central event notifier: emit/subscribe contract, SSE delivery
  - Domain event adapters: event transformation, debounce logic
  - Factory functions: correct adapter retrieval by domain name
  - Watcher-to-adapter bridge: filesystem events flow through to SSE
  - Contract tests: Fake/real parity for ICentralEventNotifier, IDomainEventAdapter
- **Excluded**: E2E browser tests (manual verification for toast UI); chokidar internals (already tested in Plan 023)
- **Mock Usage**: Fakes only — no `vi.mock()`. Every interface gets a matching Fake class following codebase convention (AC-12).

## Documentation Strategy

- **Location**: docs/how/ only
- **Rationale**: Architecture guide for how to add new domain adapters; not a quick-start feature
- **Target Audience**: Developers adding new workspace data domains or extending existing ones
- **Content**: Central event system architecture, how to create a domain event adapter, domain registration, deprecation migration path
- **Maintenance**: Update when new domains are added or when deprecated code is removed

## Clarifications

### Session 2026-02-02

| # | Question | Answer | Spec Section Updated |
|---|----------|--------|---------------------|
| Q1 | Workflow mode? | **Full** (pre-stated by user) | Header |
| Q2 | Testing approach? | **Full TDD** (pre-stated by user) | Testing Strategy |
| Q3 | File management? | **PlanPak** (pre-stated by user) | Header |
| Q4 | Mock usage policy? | **Fakes only** — strict fakes-over-mocks, no vi.mock() | Testing Strategy |
| Q5 | Documentation location? | **docs/how/ only** — architecture guide for domain adapter authors | Documentation Strategy |
| Q6 | Debounce strategy? | **Server-side only** — central notifier tracks recent API writes per graphSlug, suppresses watcher events within ~500ms window | Complexity > Assumptions, Risks & Assumptions |
| Q7 | Domain enum location? | **packages/shared** — cross-cutting concept accessible to all packages | Goals #2 (implicit), AC-01 |
| Q8 | API route migration scope? | **Watcher events only** — existing API route broadcast() calls stay as-is (deprecated but functional), migration is a future plan | Non-Goals, Goals #7 |

**Coverage Summary**:
- **Resolved**: 8/8 (all open questions + workflow decisions)
- **Deferred**: 0
- **Outstanding**: 0
