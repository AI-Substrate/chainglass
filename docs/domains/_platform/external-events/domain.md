# Domain: External Events (`_platform/external-events`)

| Field | Value |
|-------|-------|
| **Slug** | `_platform/external-events` |
| **Type** | infrastructure |
| **Parent** | `_platform` |
| **Created By** | Plan 067 — Event Popper |
| **Status** | active |

## Purpose

Generic Event Popper infrastructure for external systems (CLI tools, agents, scripts) to communicate with the Chainglass web UI via localhost HTTP API. Provides shared plumbing: envelope schemas, GUID generation, server port discovery, localhost-only security guard, tmux detection. Concept domains (like `question-popper`) build on top.

## Boundary

### Owns

- Generic envelope schemas (`EventPopperRequest`, `EventPopperResponse`)
- Event ID generation (`generateEventId`)
- Port discovery (`readServerInfo`, `writeServerInfo`, `removeServerInfo`, `ServerInfo`)
- Localhost-only API guard (`localhostGuard`, `isLocalhostRequest`)
- Tmux detection utility (`detectTmuxContext`, `getTmuxMeta`, `TmuxContext`)
- SSE channel constant (`WorkspaceDomain.EventPopper`)
- Server boot hook in `instrumentation.ts` (writes `.chainglass/server.json`)
- Auth bypass for `/api/event-popper` in `proxy.ts`

### Does NOT Own

- Concept-specific payload schemas (owned by consumer domains like `question-popper`)
- SSE infrastructure (`ICentralEventNotifier`, `ISSEBroadcaster` — owned by `_platform/events`)
- Global state infrastructure (`IStateService` — owned by `_platform/state`)
- Any UI, CLI commands, or API route handlers (owned by consumer domains)

## Composition

| Component | Role | Depends On |
|-----------|------|------------|
| `EventPopperRequestSchema` | Validate inbound event envelopes | Zod |
| `EventPopperResponseSchema` | Validate response envelopes | Zod |
| `generateEventId` | Create unique, sortable event IDs | Node.js `crypto` |
| `readServerInfo` / `writeServerInfo` | Port discovery for CLI ↔ server | Node.js `fs` |
| `localhostGuard` | Reject non-localhost API calls | Next.js `NextRequest` |
| `detectTmuxContext` / `getTmuxMeta` | Auto-detect tmux environment | Node.js `child_process` |

## Concepts

| Concept | Entry Point | What It Does |
|---------|-------------|-------------|
| Event envelope | `EventPopperRequestSchema` / `EventPopperResponseSchema` | Generic Zod schemas for all event popper communications. `version: 1`, `type` discriminator, `payload` for concept-specific data, `meta` for unstructured context |
| Event ID generation | `generateEventId()` | Creates unique, chronologically sortable IDs in `{timestamp}_{hex}` format |
| Port discovery | `readServerInfo()` / `writeServerInfo()` | Server writes `.chainglass/server.json` on boot (port, PID, startedAt). CLI reads it to find the server. Detects stale PIDs and PID recycling |
| Localhost guard | `localhostGuard()` | Middleware that rejects non-localhost requests and proxied requests (X-Forwarded-For) to `/api/event-popper/*` routes |
| Tmux detection | `detectTmuxContext()` / `getTmuxMeta()` | Auto-detects tmux session/window/pane from environment. Returns undefined outside tmux |

## Contracts

| Contract | Type | Consumers | Description |
|----------|------|-----------|-------------|
| `EventPopperRequestSchema` | Zod schema | CLI, API routes | Generic envelope for inbound events |
| `EventPopperResponseSchema` | Zod schema | CLI, API routes | Generic envelope for responses |
| `EventPopperRequest` | TypeScript type | CLI, API routes | Inferred type from request schema |
| `EventPopperResponse` | TypeScript type | CLI, API routes | Inferred type from response schema |
| `generateEventId()` | Function | Services, CLI | Returns unique chronological event ID |
| `readServerInfo()` | Function | CLI | Read server port from `.chainglass/server.json` |
| `writeServerInfo()` | Function | Server (instrumentation.ts) | Write port file on boot |
| `removeServerInfo()` | Function | Server (shutdown) | Clean up port file |
| `ServerInfo` | TypeScript type | CLI, Server | `{ port, pid, startedAt }` |
| `localhostGuard()` | Function | API route handlers | Returns 403 or null (pass) |
| `isLocalhostRequest()` | Function | API route handlers | Boolean localhost check |
| `detectTmuxContext()` | Function | CLI commands | Returns `TmuxContext \| undefined` |
| `getTmuxMeta()` | Function | CLI commands | Returns `{ tmux: TmuxContext } \| undefined` |
| `TmuxContext` | TypeScript type | CLI commands | `{ session, window, pane? }` |
| `WorkspaceDomain.EventPopper` | Constant | SSE infrastructure | SSE channel name: `'event-popper'` |

## Dependencies

### This Domain Depends On

| Domain | Contract | Why |
|--------|----------|-----|
| `_platform/events` | `WorkspaceDomain` const | Register `EventPopper` SSE channel name |

### Domains That Depend On This

| Domain | Contract Consumed | Why |
|--------|------------------|-----|
| `question-popper` | All contracts | First concept domain built on Event Popper |

## Source Location

```
packages/shared/src/event-popper/
  ├── schemas.ts          # EventPopperRequest/Response Zod schemas
  ├── guid.ts             # generateEventId()
  ├── port-discovery.ts   # readServerInfo, writeServerInfo, removeServerInfo
  └── index.ts            # Barrel exports

packages/shared/src/utils/
  └── tmux-context.ts     # detectTmuxContext, getTmuxMeta

apps/web/src/lib/
  └── localhost-guard.ts  # localhostGuard, isLocalhostRequest

apps/web/
  ├── instrumentation.ts  # writeServerInfo on boot (modified)
  └── proxy.ts            # Auth bypass for /api/event-popper (modified)
```

## History

| Plan | Change | Date |
|------|--------|------|
| 067 Phase 1 | Domain created: envelope schemas, GUID, port discovery, localhost guard, tmux detection, SSE channel | 2026-03-07 |
| 067 Phase 2 | First consumer domain (`question-popper`) created, consuming envelope schemas + GUID | 2026-03-07 |
