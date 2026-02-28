# Domain: Events

**Slug**: _platform/events
**Type**: infrastructure
**Created**: 2026-02-24
**Created By**: extracted from Plans 019, 023, 027, 041; renamed from _platform/notifications (Plan 045)
**Status**: active

## Purpose

Central event platform for the entire application. Owns the full pipeline from filesystem event capture through SSE transport to browser-side event distribution and toast UI. Any feature that needs real-time events — file changes, graph updates, agent status — plugs into this domain's contracts rather than building its own plumbing. The domain provides both the infrastructure (watcher, SSE, hub) and concrete adapters for cross-cutting event types like file changes.

## Boundary

### Owns

**Server-side event pipeline:**
- Central event notifier interface and service (`ICentralEventNotifier`, `CentralEventNotifierService`)
- Domain event adapter base class (`DomainEventAdapter<TEvent>`) — template for all adapters
- SSE broadcaster interface and adapter (`ISSEBroadcaster`, `SSEManagerBroadcaster`)
- SSE connection manager (`SSEManager` — server-side singleton)
- SSE API route (`/api/events/[channel]`)
- Central watcher service (`CentralWatcherService`, `ICentralWatcherService`)
- Watcher adapter interface (`IWatcherAdapter`) — template for domain watchers
- Bootstrap orchestration (`startCentralNotificationSystem`, `instrumentation.ts`)
- Workspace domain identity (`WorkspaceDomain` const — channel name registry)
- DI tokens for event services
- SSE event schemas (`sse-events.schema.ts`)

**Concrete file-change adapters (cross-cutting):**
- File change watcher adapter (`FileChangeWatcherAdapter`) — watches worktree source files (Plan 045)
- File change domain event adapter (`FileChangeDomainEventAdapter`) — routes to SSE (Plan 045)
- Source watcher ignore constants (`SOURCE_WATCHER_IGNORED`) — ignore patterns for node_modules, .git, etc. (Plan 045)

**Client-side event distribution:**
- Generic SSE hooks (`useSSE`, `useWorkspaceSSE`)
- File change event hub (`FileChangeHub`) — client-side pattern-based event dispatcher (Plan 045)
- File change provider (`FileChangeProvider`) — React context for hub lifecycle (Plan 045)
- File change subscription hook (`useFileChanges`) — pattern-based subscription for any component (Plan 045)

**Toast UI:**
- Toast component (`<Toaster />` via sonner)
- `toast()` function (re-export from sonner)

**Fakes for testing:**
- `FakeCentralEventNotifier`, `FakeSSEBroadcaster`, `FakeCentralWatcherService`
- `FakeFileChangeWatcherAdapter` (Plan 045)

### Does NOT Own
- **Business-domain watcher adapters** (e.g., `WorkflowWatcherAdapter`) — owned by their respective business domains
- **Business-domain SSE consumer hooks** (e.g., `useWorkflowSSE`) — owned by workflow UI domain
- **Agent notifier service** (`AgentNotifierService`) — owned by agent domain, consumes `ISSEBroadcaster`
- **Business-domain event types** (e.g., `WorkflowStructureChangedEvent`) — owned by respective domains
- **UI components that consume events** (e.g., file tree animations, "externally changed" banner) — owned by consuming features
- **Feature-specific subscription hooks** (e.g., `useTreeDirectoryChanges`) — owned by consuming features, built on `useFileChanges`

## Contracts (Public Interface)

| Contract | Type | Consumers | Description |
|----------|------|-----------|-------------|
| `ICentralEventNotifier` | Interface | Domain event adapters | `emit(domain, eventType, data)` — routes events to SSE |
| `DomainEventAdapter<TEvent>` | Abstract class | Concrete adapters per domain | Template method: `extractData(event) → payload` |
| `ISSEBroadcaster` | Interface | Agent notifier, central event notifier | `broadcast(channel, eventType, data)` |
| `ICentralWatcherService` | Interface | Bootstrap, DI container | `start()`, `registerAdapter()` |
| `IWatcherAdapter` | Interface | Concrete watcher adapters | `handleEvent(WatcherEvent)` callback contract |
| `WorkspaceDomain` | Const object | Adapters, hooks, routes | Channel name registry (`Workflows`, `Agents`, `FileChanges`; `Workgraphs` deprecated) |
| `useSSE` | Hook | Feature-specific SSE hooks | Generic SSE connection with reconnection |
| `useWorkspaceSSE` | Hook | Workflow content, kanban | Workspace-scoped SSE subscription |
| `FileChangeHub` | Class | FileChangeProvider, testing | Client-side pattern-based event dispatcher |
| `useFileChanges` | Hook | Any component needing file change events | `useFileChanges('src/') → { changes, hasChanges, clearChanges }` |
| `FileChangeProvider` | Component | BrowserClient, any worktree-scoped page | React context providing FileChangeHub to tree |
| `<Toaster />` | Component | Root layout (mounted once) | Global toast rendering portal |
| `toast()` | Function (sonner) | Any component/hook | `toast.success()`, `toast.error()`, etc. |

## Composition (Internal)

| Component | Role | Depends On |
|-----------|------|------------|
| SSEManager | Server-side connection registry + broadcast | Node.js streams |
| SSEManagerBroadcaster | Adapts SSEManager to ISSEBroadcaster | SSEManager |
| CentralEventNotifierService | Routes domain events to SSE channels | ISSEBroadcaster |
| CentralWatcherService | Native fs.watch filesystem watcher, dispatches to adapters | IFileWatcherFactory, IWatcherAdapter[] |
| FileChangeWatcherAdapter | Filters source file events, batches with debounce | IWatcherAdapter (self-filter pattern) |
| FileChangeDomainEventAdapter | Transforms batched file events → SSE payload | DomainEventAdapter, ICentralEventNotifier |
| startCentralNotificationSystem | Bootstrap — resolves DI, wires adapters, starts watcher | DI container |
| SSE API route | HTTP endpoint for EventSource connections | SSEManager |
| useSSE hook | Client SSE connection management | EventSource API |
| useWorkspaceSSE hook | Workspace-scoped SSE subscription | useSSE |
| FileChangeHub | Client-side pattern matcher + subscriber dispatch | — (standalone) |
| FileChangeProvider | React context, manages SSE connection → hub lifecycle | FileChangeHub, EventSource |
| useFileChanges hook | Pattern subscription with debounce | FileChangeHub (via context) |
| Toaster wrapper | Theme-aware sonner `<Toaster />` | sonner, next-themes |
| SSE event schemas | Zod validation for SSE payloads | zod |

## Source Location

Primary: scattered across `packages/shared`, `packages/workflow`, `apps/web` (PlanPak feature folders)

| File | Role | Notes |
|------|------|-------|
| `packages/shared/src/features/027-central-notify-events/central-event-notifier.interface.ts` | ICentralEventNotifier interface | Shared contract |
| `packages/shared/src/features/027-central-notify-events/domain-event-adapter.ts` | DomainEventAdapter base class | Template method pattern |
| `packages/shared/src/features/027-central-notify-events/workspace-domain.ts` | WorkspaceDomain const | Channel name registry |
| `packages/shared/src/features/027-central-notify-events/fake-central-event-notifier.ts` | FakeCentralEventNotifier | Test fake |
| `packages/shared/src/features/019-agent-manager-refactor/sse-broadcaster.interface.ts` | ISSEBroadcaster interface | Shared contract |
| `packages/shared/src/features/019-agent-manager-refactor/fake-sse-broadcaster.ts` | FakeSSEBroadcaster | Test fake |
| `packages/workflow/src/features/023-central-watcher-notifications/central-watcher.interface.ts` | ICentralWatcherService | Watcher contract |
| `packages/workflow/src/features/023-central-watcher-notifications/watcher-adapter.interface.ts` | IWatcherAdapter | Adapter contract |
| `packages/workflow/src/features/023-central-watcher-notifications/central-watcher.service.ts` | CentralWatcherService | Filesystem watcher |
| `packages/workflow/src/features/023-central-watcher-notifications/fake-central-watcher.service.ts` | FakeCentralWatcherService | Test fake |
| `apps/web/src/features/027-central-notify-events/central-event-notifier.service.ts` | CentralEventNotifierService | Production implementation |
| `apps/web/src/features/027-central-notify-events/start-central-notifications.ts` | Bootstrap function | Wires DI → starts pipeline |
| `apps/web/src/features/019-agent-manager-refactor/sse-manager-broadcaster.ts` | SSEManagerBroadcaster | Adapter: SSEManager → ISSEBroadcaster |
| `apps/web/src/lib/sse-manager.ts` | SSEManager singleton | Core SSE connection manager |
| `apps/web/src/lib/schemas/sse-events.schema.ts` | SSE event Zod schemas | Validation |
| `apps/web/app/api/events/[channel]/route.ts` | SSE API route | EventSource endpoint |
| `apps/web/src/hooks/useSSE.ts` | useSSE hook | Client SSE connection |
| `apps/web/src/hooks/useWorkspaceSSE.ts` | useWorkspaceSSE hook | Workspace-scoped SSE |
| `apps/web/instrumentation.ts` | Next.js bootstrap hook | Starts notification system |
| `apps/web/src/components/ui/toaster.tsx` | Toaster wrapper | Plan 042 — theme-aware sonner wrapper |
| `apps/web/src/features/027-central-notify-events/sdk/contribution.ts` | SDK contribution manifest | 047-usdk Phase 6 |
| `apps/web/src/features/027-central-notify-events/sdk/register.ts` | SDK registration entry point | 047-usdk Phase 6 |

**Plan 045 additions (to be created):**

| File | Role | Notes |
|------|------|-------|
| `packages/workflow/src/features/023-central-watcher-notifications/file-change-watcher.adapter.ts` | FileChangeWatcherAdapter | Source file watcher with debounce |
| `packages/workflow/src/features/023-central-watcher-notifications/source-watcher.constants.ts` | SOURCE_WATCHER_IGNORED | Ignore patterns for chokidar |
| `packages/workflow/src/features/023-central-watcher-notifications/fake-file-change-watcher.ts` | FakeFileChangeWatcherAdapter | Test fake |
| `apps/web/src/features/027-central-notify-events/file-change-domain-event-adapter.ts` | FileChangeDomainEventAdapter | Domain adapter for file changes |
| `apps/web/src/features/045-live-file-events/file-change-hub.ts` | FileChangeHub class | Client-side pattern-based dispatcher |
| `apps/web/src/features/045-live-file-events/file-change-provider.tsx` | FileChangeProvider | React context + SSE connection |
| `apps/web/src/features/045-live-file-events/use-file-changes.ts` | useFileChanges hook | Pattern subscription hook |

## Gotchas

- **toast() is client-only**: Calling `import { toast } from 'sonner'` in a Server Component or server action is a silent no-op — no error, no feedback. The pattern is: server returns result → client reads result → client calls toast().
- **Domain value IS the SSE channel name**: `WorkspaceDomain.FileChanges === 'file-changes'` — a mismatch causes silent event loss.
- **Double-event suppression needed**: When the UI saves a file, the watcher also detects the change. Consumers must suppress self-triggered events (2s window after save).

## Dependencies

### This Domain Depends On
- `_platform/sdk` — IUSDK for publishing toast commands to SDK surface
- Node.js `fs.watch` — native filesystem watching (built-in, replaces chokidar per Plan 060)
- `sonner` — toast UI (npm)
- `next-themes` — theme detection for toast (npm)
- `zod` — SSE event schema validation (npm)
- Node.js streams — SSE response writing

### Domains That Depend On This
- `file-browser` — uses `toast()`, `useFileChanges`, `FileChangeProvider` for live file updates
- Workflow UI (050) — `useWorkflowSSE` consumes `useSSE`; `toast.info()` for external changes
- Agent UI (019) — `AgentNotifierService` consumes `ISSEBroadcaster`

## History

| Plan | What Changed | Date |
|------|-------------|------|
| Plan 019 | Agent notifier service, ISSEBroadcaster, SSEManager | 2026-01 |
| Plan 023 | CentralWatcherService, watcher adapter interface | 2026-02 |
| Plan 027 | Central event notifier, domain event adapter, bootstrap, WorkspaceDomain | 2026-02 |
| ADR-0010 | Architecture decision: three-layer notification pattern | 2026-02-03 |
| Plan 041 FX001 | Toast system workshop (sonner), domain extraction | 2026-02-24 |
| *(extracted)* | Domain formalized as _platform/notifications from Plans 019, 023, 027 | 2026-02-24 |
| Plan 042 | Global toast: installed sonner, Toaster wrapper, wired file browser | 2026-02-24 |
| Plan 045 | Renamed _platform/notifications → _platform/events. Added FileChangeWatcherAdapter, FileChangeDomainEventAdapter, FileChangeHub, FileChangeProvider, useFileChanges. Expanded from notification transport to full event platform | 2026-02-24 |
| Plan 045 (E2E fix) | Fixed SOURCE_WATCHER_IGNORED to use function-based path-segment matching (glob patterns unreliable with chokidar). Added handleRefreshDir for cache-bypass tree refresh. All 3 phases verified working end-to-end | 2026-02-24 |
| 047-usdk Phase 6 | SDK contribution (toast.show, toast.dismiss commands) | 2026-02-25 |
| 050 Phase 6-7 | Added WorkflowWatcherAdapter + WorkflowDomainEventAdapter; removed WorkGraphWatcherAdapter + WorkGraphDomainEventAdapter; added Workflows channel; deprecated Workgraphs channel | 2026-02-27 |
| Plan 060 | Replaced ChokidarFileWatcherAdapter with NativeFileWatcherAdapter (Node.js fs.watch recursive). Eliminated FD exhaustion (12,700 → ~20 FDs). Removed chokidar dependency. | 2026-02-28 |
