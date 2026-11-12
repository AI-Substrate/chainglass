# Domain: External Events (`_platform/external-events`)

| Field | Value |
|-------|-------|
| **Slug** | `_platform/external-events` |
| **Type** | infrastructure |
| **Parent** | `_platform` |
| **Created By** | Plan 067 — Event Popper |
| **Status** | active |

## Purpose

Localhost plumbing that lets external processes (CLI tools, agents, scripts, sidecars) find and talk to the running Chainglass web servers: per-port server entries in `.chainglass/servers/<port>.json` (including the per-boot `localToken` used for `X-Local-Token` auth) and the localhost-only request guard. The package path is still `@chainglass/shared/event-popper` for historical reasons.

## Boundary

### Owns

- Port discovery (`readServerInfo`, `discoverServerInfo`, `listServerInfo`, `writeServerInfo`, `removeServerInfo`, `currentServerPort`, `ServerInfo`)
- Localhost-only API guard (`localhostGuard`, `isLocalhostRequest`)
- Server boot hook in `instrumentation.ts` (writes `.chainglass/servers/<port>.json`)

### Does NOT Own

- Route auth composition (`requireLocalAuth` — owned by `_platform/auth`)
- SSE infrastructure (`ICentralEventNotifier`, `ISSEBroadcaster` — owned by `_platform/events`)
- Any UI, CLI commands, or API route handlers (owned by consumer domains)

## Composition

| Component | Role | Depends On |
|-----------|------|------------|
| `readServerInfo` / `discoverServerInfo` / `writeServerInfo` | Per-port server entries for CLI ↔ server | Node.js `fs` |
| `localhostGuard` | Reject non-localhost API calls | Next.js `NextRequest` |

## Concepts

| Concept | Entry Point | What It Does |
|---------|-------------|-------------|
| Port discovery | `writeServerInfo()` / `readServerInfo(root, port)` / `discoverServerInfo(root)` | Each server writes `.chainglass/servers/<port>.json` on boot (port, PID, startedAt, `mode: dev\|prod`, localToken) and removes only its own entry at shutdown, so prod and dev run side by side. The server validates tokens against its own entry; clients pick one (`CG_SERVER_PORT`, else prod, else lowest port). Detects stale PIDs and PID recycling |
| Localhost guard | `localhostGuard()` | Rejects non-localhost and proxied (X-Forwarded-For) requests; used by `proxy.ts` and `/api/workspaces/[slug]/files/open` |

## Contracts

| Contract | Type | Consumers | Description |
|----------|------|-----------|-------------|
| `readServerInfo(root, port)` | Function | Server (`proxy.ts`, `requireLocalAuth`, workflow execution routes) | This server's own entry |
| `discoverServerInfo(root)` / `listServerInfo(root)` | Function | CLI, MCP server | The server a client should call / every live server |
| `currentServerPort()` | Function | Server | Port this process serves on (`PORT`, set by Next) |
| `writeServerInfo()` | Function | Server (instrumentation.ts) | Write this server's entry on boot |
| `removeServerInfo(root, port, pid)` | Function | Server (shutdown) | Remove the entry if this pid still owns it |
| `ServerInfo` | TypeScript type | CLI, Server | `{ port, pid, startedAt, mode, localToken? }` |
| `localhostGuard()` | Function | `proxy.ts`, API route handlers | Returns 403 or null (pass) |
| `isLocalhostRequest()` | Function | API route handlers | Boolean localhost check |

## Dependencies

### This Domain Depends On

None.

### Domains That Depend On This

| Domain | Contract Consumed | Why |
|--------|------------------|-----|
| `_platform/auth` | `readServerInfo` | `X-Local-Token` check inside `requireLocalAuth` |

## Source Location

```
packages/shared/src/event-popper/
  ├── port-discovery.ts   # per-port server entries (read/discover/list/write/remove)
  └── index.ts            # Barrel exports (@chainglass/shared/event-popper)

apps/web/src/lib/
  └── localhost-guard.ts  # localhostGuard, isLocalhostRequest

apps/web/
  └── instrumentation.ts  # writeServerInfo on boot
```

## History

| Plan | Change | Date |
|------|--------|------|
| 067 Phase 1 | Domain created: envelope schemas, GUID, port discovery, localhost guard, tmux detection, SSE channel | 2026-03-07 |
| 067 Phase 2 | First consumer domain (question UI, since removed) created, consuming envelope schemas + GUID | 2026-03-07 |
| nav speed item 4 | Server entries keyed by port (`.chainglass/servers/<port>.json`, with `mode`) so a prod and a dev server run from one checkout; `discoverServerInfo` + `CG_SERVER_PORT` for clients | 2026-11-12 |
| Removal | Plan 067 question/alert UI removed: envelope schemas, `generateEventId`, tmux detection, the question SSE channel, the question/alert API routes and their proxy bypass deleted. Port discovery + localhost guard remain | 2026-11-12 |
