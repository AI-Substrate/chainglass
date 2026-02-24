# Domain: Notifications

**Slug**: _platform/notifications
**Type**: infrastructure
**Created**: 2026-02-24
**Created By**: extracted from Plans 019, 023, 027, 041
**Status**: active

## Purpose

Central notification infrastructure for delivering events from server to browser. Owns the full pipeline: filesystem/domain event capture, SSE transport, and toast UI presentation. Any feature that needs to notify the user — file changes, graph updates, agent status — plugs into this domain's contracts rather than building its own notification plumbing.

## Boundary

### Owns
- Central event notifier interface and service (`ICentralEventNotifier`, `CentralEventNotifierService`)
- Domain event adapter base class (`DomainEventAdapter<TEvent>`) — the template, not concrete adapters
- SSE broadcaster interface and adapter (`ISSEBroadcaster`, `SSEManagerBroadcaster`)
- SSE connection manager (`SSEManager` — server-side singleton)
- SSE API route (`/api/events/[channel]`)
- Central watcher service (`CentralWatcherService`, `ICentralWatcherService`)
- Watcher adapter interface (`IWatcherAdapter`) — the template, not concrete watchers
- Client-side SSE hooks (`useSSE`, `useWorkspaceSSE`)
- Bootstrap orchestration (`startCentralNotificationSystem`, `instrumentation.ts`)
- Toast UI component (`<Toaster />` via sonner) — planned
- Workspace domain identity (`WorkspaceDomain` const)
- DI tokens for notification services
- Fakes for testing (`FakeCentralEventNotifier`, `FakeSSEBroadcaster`, `FakeCentralWatcherService`)
- SSE event schemas (`sse-events.schema.ts`)

### Does NOT Own
- **Concrete domain adapters** (e.g., `WorkgraphDomainEventAdapter`, `WorkGraphWatcherAdapter`) — owned by their respective business domains
- **Concrete SSE consumer hooks** (e.g., `useWorkGraphSSE`) — owned by workgraph UI domain
- **Agent notifier service** (`AgentNotifierService`) — owned by agent domain, consumes `ISSEBroadcaster`
- **Business-domain event types** (e.g., `WorkGraphChangedEvent`) — owned by respective domains
- **UI components that display notifications** (e.g., workgraph toast state) — owned by consuming features

## Contracts (Public Interface)

| Contract | Type | Consumers | Description |
|----------|------|-----------|-------------|
| `ICentralEventNotifier` | Interface | Domain event adapters (workgraph, future) | `emit(domain, eventType, data)` — routes events to SSE |
| `DomainEventAdapter<TEvent>` | Abstract class | Concrete adapters per domain | Template method: `extractData(event) → payload` |
| `ISSEBroadcaster` | Interface | Agent notifier, central event notifier | `broadcast(channel, eventType, data)` |
| `ICentralWatcherService` | Interface | Bootstrap, DI container | `start()`, `registerAdapter()` |
| `IWatcherAdapter` | Interface | Concrete watcher adapters | `onFileChange(path)` callback contract |
| `WorkspaceDomain` | Const object | Adapters, hooks, routes | Channel name registry (`Workgraphs`, `Agents`) |
| `useSSE` | Hook | Feature-specific SSE hooks | Generic SSE connection with reconnection |
| `useWorkspaceSSE` | Hook | Workflow content, kanban | Workspace-scoped SSE subscription |
| `<Toaster />` | Component | Root layout (mounted once) | Global toast rendering portal |
| `toast()` | Function (sonner) | Any component/hook | `toast.success()`, `toast.error()`, etc. |

## Composition (Internal)

| Component | Role | Depends On |
|-----------|------|------------|
| SSEManager | Server-side connection registry + broadcast | Node.js streams |
| SSEManagerBroadcaster | Adapts SSEManager to ISSEBroadcaster | SSEManager |
| CentralEventNotifierService | Routes domain events to SSE channels | ISSEBroadcaster |
| CentralWatcherService | Chokidar filesystem watcher, dispatches to adapters | IFileWatcherFactory, IWatcherAdapter[] |
| startCentralNotificationSystem | Bootstrap — resolves DI, wires adapters, starts watcher | DI container |
| SSE API route | HTTP endpoint for EventSource connections | SSEManager |
| useSSE hook | Client SSE connection management | EventSource API |
| useWorkspaceSSE hook | Workspace-scoped SSE subscription | useSSE |
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

## Gotchas

- **toast() is client-only**: Calling `import { toast } from 'sonner'` in a Server Component or server action is a silent no-op — no error, no feedback. The pattern is: server returns result → client reads result → client calls toast().

## Dependencies

### This Domain Depends On
- `chokidar` — filesystem watching (npm)
- `sonner` — toast UI (npm)
- `next-themes` — theme detection for toast (npm)
- `zod` — SSE event schema validation (npm)
- Node.js streams — SSE response writing

### Domains That Depend On This
- `file-browser` — uses `toast()` for save/refresh feedback
- Workgraph UI (022) — `useWorkGraphSSE` consumes `useSSE`; `toast.info()` for external changes
- Agent UI (019) — `AgentNotifierService` consumes `ISSEBroadcaster`
- Workflow content — consumes `useWorkspaceSSE`

## History

| Plan | What Changed | Date |
|------|-------------|------|
| Plan 019 | Agent notifier service, ISSEBroadcaster, SSEManager | 2026-01 |
| Plan 023 | CentralWatcherService, watcher adapter interface | 2026-02 |
| Plan 027 | Central event notifier, domain event adapter, bootstrap, WorkspaceDomain | 2026-02 |
| ADR-0010 | Architecture decision: three-layer notification pattern | 2026-02-03 |
| Plan 041 FX001 | Toast system workshop (sonner), domain extraction | 2026-02-24 |
| *(extracted)* | Domain formalized from Plans 019, 023, 027 deliverables | 2026-02-24 |
| Plan 042 | Global toast: installed sonner, Toaster wrapper, wired file browser + workgraph | 2026-02-24 |
