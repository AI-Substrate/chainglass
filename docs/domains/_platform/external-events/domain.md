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
- Localhost-only API guard (`localhostGuard`, `isLocalhostRequest`) and the socket-peer stamp it trusts (`installPeerAddressStamp`, `socketPeerAddress`, `requestClient`)
- The TLS front for HTTPS mode (`startTlsFront`, `apps/web/src/lib/tls-front.ts`): forwards to the plain servers and owns the forwarded-header contract the guard relies on
- Server boot hook in `instrumentation.ts` (installs the peer stamp; writes `.chainglass/servers/<port>.json`)

### Does NOT Own

- Route auth composition (`requireLocalAuth` — owned by `_platform/auth`)
- SSE infrastructure (`ICentralEventNotifier`, `ISSEBroadcaster` — owned by `_platform/events`)
- Any UI, CLI commands, or API route handlers (owned by consumer domains)

## Composition

| Component | Role | Depends On |
|-----------|------|------------|
| `readServerInfo` / `discoverServerInfo` / `writeServerInfo` | Per-port server entries for CLI ↔ server | Node.js `fs` |
| `installPeerAddressStamp` / `socketPeerAddress` / `requestClient` | Record each request's TCP peer, and its client (the TLS front's client only when the request carries the launch's front secret from a loopback peer), tagged with a per-process token, before Next sees it | Node.js `http`/`https` servers |
| `localhostGuard` / `isLocalhostRequest` | Reject non-localhost API calls (stamped loopback peer only) | `socketPeerAddress`, Next.js `NextRequest` |
| `startTlsFront` | HTTPS mode: TLS on the public port, forwarding to Next, the terminal sidecar (port + 1500) and streamd (`/remote-view-ws` upgrades); overwrites `X-Forwarded-For` with the client's socket address | Node.js `https`/`tls`/`net` |

## Concepts

| Concept | Entry Point | What It Does |
|---------|-------------|-------------|
| Port discovery | `writeServerInfo()` / `readServerInfo(root, port)` / `discoverServerInfo(root)` | Each server writes `.chainglass/servers/<port>.json` on boot (port, PID, startedAt, `mode: dev\|prod`, localToken) and removes only its own entry at shutdown, so prod and dev run side by side. The server validates tokens against its own entry; clients pick one (`CG_SERVER_PORT`, else prod, else lowest port). Detects stale PIDs and PID recycling |
| Localhost guard | `localhostGuard()` | Local means the stamped socket peer is loopback. Host, X-Forwarded-For and client copies of the stamp header are never trusted; a non-loopback X-Forwarded-For hop (a reverse proxy) is rejected; no stamp means not local. Used by `proxy.ts`, `requireLocalAuth` and `/api/workspaces/[slug]/files/open` |

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
| `installPeerAddressStamp()` | Function | `instrumentation.ts` `register()` | Patches `http`/`https` `Server.prototype.emit` (`request` + `upgrade`) to overwrite `x-chainglass-peer` with `<token> <peer> <client> <http\|https>` and drop `x-chainglass-front`; takes `CHAINGLASS_FRONT_SECRET` out of `process.env` |
| `socketPeerAddress(headers)` | Function | `isLocalhostRequest` | The stamped peer, or null unless the header carries this process's token |
| `requestClient(headers)` | Function | `/api/bootstrap/verify` (rate limit) | `{ address, secure }`: behind the verified TLS front its client and https, else the socket peer and the socket's protocol; null when unstamped |

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
  ├── localhost-guard.ts  # localhostGuard, isLocalhostRequest
  ├── socket-peer.ts      # installPeerAddressStamp, socketPeerAddress
  └── tls-front.ts        # startTlsFront (run by tsx from the HTTPS recipes)

apps/web/
  └── instrumentation.ts  # installs the peer stamp; writeServerInfo on boot
```

## History

| Plan | Change | Date |
|------|--------|------|
| 067 Phase 1 | Domain created: envelope schemas, GUID, port discovery, localhost guard, tmux detection, SSE channel | 2026-03-07 |
| 067 Phase 2 | First consumer domain (question UI, since removed) created, consuming envelope schemas + GUID | 2026-03-07 |
| nav speed item 4 | Server entries keyed by port (`.chainglass/servers/<port>.json`, with `mode`) so a prod and a dev server run from one checkout; `discoverServerInfo` + `CG_SERVER_PORT` for clients | 2026-11-12 |
| Removal | Plan 067 question/alert UI removed: envelope schemas, `generateEventId`, tmux detection, the question SSE channel, the question/alert API routes and their proxy bypass deleted. Port discovery + localhost guard remain | 2026-11-12 |
| Localhost guard hardening | `isLocalhostRequest` trusted the Host header and a loopback X-Forwarded-For, because Next 15+ never sets `NextRequest.ip`; a LAN client sending `Host: localhost` + `X-Forwarded-For: 127.0.0.1` passed as local. It now trusts only the socket peer recorded by `installPeerAddressStamp()` (run first in `register()`), tagged with a per-process token so client-sent or pre-stamp values fail closed | 2026-11-12 |
| HTTPS mode | TLS front (`tls-front.ts`): https → Next, wss port + 1500 → terminal sidecar, `/remote-view-ws` upgrades → streamd; X-Forwarded-For overwritten with the client's socket address so the guard still refuses LAN clients behind it | 2026-11-12 |
