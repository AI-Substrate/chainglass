# Brief — HTTPS mode for chainglass (coder/https, pij-professional-crane)

Prime pij-outer-bobcat · 2026-11-12 · Plan: `../reports/https-mode-plan-2026-11-12.md` (web-perf-expert,
antelope) with Jordan's ruling at its end.

## Jordan's rulings

- Plain HTTP keeps working (`http://localhost:3000`, `http://<LAN>:3000`), sign-in included.
- HTTPS is an additional option on **3030** (terminal wss on **4530**, the plan's P+1500 rule).
- No new name: cert covers `localhost`, `127.0.0.1`, `ops.osk.lan`, the LAN IP(s).

## Work (plan items, one commit each, each its own full fft)

1. `just certs`: mkcert cert into `apps/web/certificates/` (already gitignored); docs on trusting the root CA
   on other devices (`mkcert -CAROOT`).
2. TLS front (in-repo script + tests): https :3030 -> Next :3000, wss :4530 -> sidecar :4500,
   `/remote-view-ws` -> remote-view daemon. Streams without buffering (SSE mux is long-lived); passes
   WebSocket upgrades on all routes; **overwrites** `X-Forwarded-For` with the socket's client address (never
   appends or trusts the client's); sets `X-Forwarded-Proto: https`, `X-Forwarded-Host`; keeps `Host`.
3. **Security behind the front (now that 9c8406b3e and d98cb715a landed):** every request reaches Next from
   127.0.0.1, so:
   - the localhost guard must still refuse a LAN client through the front (its non-loopback XFF hop is
     rejected: test it), and accept a browser on this machine via https://localhost:3030;
   - the bootstrap rate limit (d98cb715a, keyed on the socket peer) would put every HTTPS client in one
     shared budget. Key it on the front-provided client address **only** when the request provably came
     from the front (loopback peer + a per-process secret the front adds and Next verifies, like the
     socket-peer token); otherwise keep the socket peer. Test both, and that a direct client cannot fake the
     front's marker.
4. Terminal origin allowlist: `TERMINAL_WS_ALLOWED_ORIGINS` includes `https://<name>:3030` for each cert name.
5. Server actions behind the front: Next's Origin vs forwarded-host check; add allowedOrigins only if needed.
6. `just prod-https` (and a dev equivalent): starts Next, sidecar and the front together; same no-kill and
   precheck rules as `prod` (env file, node-pty, certs present).
7. **Backlog B4 (Jordan: HTTP keeps working):** the bootstrap cookie's `Secure` follows the request's real
   protocol (or the front's `X-Forwarded-Proto`, trusted only from the front), never NODE_ENV
   (`apps/web/app/api/bootstrap/verify/route.ts:98`); check every other cookie set the same way. Plain-http
   LAN sign-in must work natively (no cookie re-injection in proofs).

## Acceptance

- Native sign-in over `http://<LAN>:3000` and `https://ops.osk.lan:3030` (no cookie fixtures).
- Terminal gate over `ws://` (:3000/:4500) and `wss://` (:3030/:4530), localhost and LAN: connect, type,
  output, window strip, resize. Remote view over `wss`. `cg` X-Local-Token path.
- Security tests from item 3; LAN spoof through the front gets 403 on a localhost-only route.
- Antelope then runs its 8-tab check on `https://...:3030` (1 shared `/api/events/mux` connection).
- Rules: `briefs/nav-wave-1.md` (worktrees, full fft per commit, keep builds for the reviewer, the tmux
  rule: never kill-server; `-L`/`-S`; mkdir 700 + prove the socket). Never touch Jordan's :3000.
