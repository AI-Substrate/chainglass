# Plan: an HTTPS mode for chainglass (fixes the 5-tab limit off localhost)

Author: pij-lonely-antelope (role web-perf-expert) · 2026-11-12 · Plan only; nothing built.
Status: waiting on Jordan for the address and port. Build freeze in force (demo); do not start
until the prime lifts it.

## Why

Tabs share one live-update connection only where the browser provides Web Locks, which is `https://`
or `localhost` (`apps/web/src/lib/sse/multiplexed-sse-provider.tsx:290-297` falls back to one
connection per tab otherwise). Measured on prod, 2026-11-12:

| Address | Secure context / Web Locks | Sign-in | 8 tabs |
|---|---|---|---|
| `http://localhost:3000` | yes | 200 | 1 connection |
| `http://192.168.1.32:3000`, `http://ops.osk.lan:3000` | no | 401 (cookie is Secure in prod) | not usable |
| `https://192.168.1.32:3444` via a throwaway TLS front | yes | 200 | 1 connection |

## Design: one TLS front, nothing else changes

A small Node process in the repo terminates TLS and forwards to the existing plain servers. Plain
`http://localhost:3000` keeps working exactly as today.

| Public (HTTPS) | Forwards to | Why this port |
|---|---|---|
| `https://<name>:<P>` | `http://127.0.0.1:3000` (Next) | P is Jordan's choice; 3443 is taken by the OSK front |
| `wss://<name>:<P+1500>` | `ws://127.0.0.1:4500` (terminal sidecar) | the browser dials page port + 1500 (`use-terminal-socket.ts:156-158`), so no client change |
| `wss://<name>:<P>/remote-view-ws` | `ws://127.0.0.1:<daemon port>` | remote view already expects this path over HTTPS (`088-remote-view/components/stream-url.ts:32-43`) |

Model: the OSK agent's 36-line front (`tls-front.mjs`, https 3443 to 3001). Rejected alternative:
give the sidecar the certificate directly (`TERMINAL_WS_CERT/KEY`); it then serves TLS only, which
breaks the terminal on plain `localhost:3000`.

## Work items

1. **Certificate recipe.** `mkcert` (installed at `/opt/homebrew/bin/mkcert`) cert for the new name,
   `localhost`, `127.0.0.1` and the LAN addresses, written to `apps/web/certificates/` (already
   gitignored, `.gitignore:189`; the folder does not exist yet). Recipe: `just certs`.
2. **TLS front script** with tests. Requirements:
   - stream responses without buffering (the live-update stream is long-lived);
   - pass WebSocket upgrades on all three routes;
   - set `X-Forwarded-For` to the socket's client address, never append or trust the client's;
   - set `X-Forwarded-Proto: https` and `X-Forwarded-Host`, and leave `Host` as the public host.
3. **Security check on the localhost guard.** `apps/web/src/lib/localhost-guard.ts:22-48` treats a
   request as local when `request.ip` is loopback or the `Host` header is `localhost`. Behind the
   front every request arrives from 127.0.0.1, so item 2's header rules are what keep remote
   clients from passing as local. Needs a test: a remote request through the front to a
   localhost-only route (for example `/api/workspaces/[slug]/files/open`) must get 403.
4. **Terminal origin allowlist.** The sidecar accepts `http(s)://<host>:<Next port>` for localhost
   and LAN IPs only (`terminal-auth.ts:131-169`); a hostname and a different public port are both
   rejected. The recipe sets `TERMINAL_WS_ALLOWED_ORIGINS` to include `https://<name>:<P>`.
5. **Server actions behind the front.** Next compares `Origin` with the forwarded host; item 2's
   `X-Forwarded-Host` should satisfy it. If not, add the public origin to
   `experimental.serverActions.allowedOrigins` in `apps/web/next.config.mjs:44-48`.
6. **Recipe.** `just prod-https` (and a dev equivalent) starting Next, the sidecar and the front
   together. It must not kill whatever holds a port (the current recipes do, `justfile:117-126`).
   Belongs with coder/dev-beside-prod, who owns the prod recipes.
7. **Outside the repo (Jordan / OSK).** The new name must resolve on the LAN, and each other device
   must trust the mkcert root CA once (`mkcert -CAROOT` shows the file to install).

## Already fine, no work

- Sign-in: next-auth has `trustHost: true` (`apps/web/src/auth.ts:8`); the bootstrap cookie is
  already `Secure` in prod.
- The live-update code: no change; it starts sharing as soon as the page is on HTTPS.

## Validation (after the freeze)

1. 8 tabs on `https://<name>:<P>`: exactly 1 `/api/events/mux` connection (probe exists:
   `tabs-probe.mjs` in the session scratchpad).
2. A live event (edit a file) shows up in a tab that is not the leader. Not yet tested anywhere.
3. Sign-in, a server action (save a setting), terminal connects over `wss`, remote view connects.
4. Item 3's 403 test.
5. Plain `http://localhost:3000` still works, terminal included.

## Optional later

Serve HTTP/2 on the front. It removes the 6-connection limit altogether, which would also end the
brief hangs seen while a prod tab loads (8-tab test: 3 of 8 tabs waited 5 to 8 s for a request).

## Open questions for Jordan

1. The new address (name) and port.
2. Whether plain `http://<LAN name>:3000` should keep answering once HTTPS exists.

## Jordan's ruling (2026-11-12)

- Plain HTTP keeps working (`http://localhost:3000` and `http://<LAN name>:3000`); HTTPS is an
  additional option, not a replacement.
- HTTPS port: **3030** (so the terminal wss front is 4530 under the plan's `P+1500` rule).
- Name: none new given; the certificate covers `localhost`, `127.0.0.1`, `ops.osk.lan` and the LAN
  address(es) until Jordan names one.
- Build starts only after the demo hold is lifted.
- (prime, 2026-11-12) With parakeet's socket-peer fix to the localhost guard, the TLS front must set the
  peer address it saw (its own socket) in a way the guard trusts, and a remote client through the front
  must still fail the guard. Jordan: xterm.js and its sidecar must keep working throughout, over both
  `ws://` (HTTP :3000) and `wss://` (HTTPS :3030 / 4530).
- (prime, 2026-11-12, from crane's terminal proof) Prod over plain http on the LAN cannot sign in: the
  bootstrap cookie is `Secure` whenever NODE_ENV=production (`apps/web/app/api/bootstrap/verify/route.ts:98`).
  Jordan ruled HTTP keeps working, so: `Secure` follows the request's real protocol (or the TLS front's
  `X-Forwarded-Proto`, trusted only from the front), never NODE_ENV. Check every other cookie set the same way.
