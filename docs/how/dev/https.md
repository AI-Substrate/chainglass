# HTTPS for chainglass

Plain HTTP keeps working (`http://localhost:3000`, `http://<LAN IP>:3000`). HTTPS is an extra way
in, for what browsers only allow in a secure context: one shared live-update connection across
tabs (Web Locks), the clipboard API, and remote view off localhost.

## Quick start

```bash
just certs          # once per worktree (and after the LAN address changes)
just prod-https     # prod on http://<host>:3000 AND https://<host>:3030
```

| Recipe | Starts |
|---|---|
| `just prod-https` | `just prod` (build, Next on `PORT`, terminal on `PORT + 1500`) plus the TLS front on `HTTPS_PORT` (default `PORT + 30`) and `HTTPS_PORT + 1500` |
| `just prod-https-serve` | the same without rebuilding (`just prod-serve` plus the front) |
| `just dev-https` | `just dev` plus the TLS front, e.g. `PORT=3010 just dev-https` → https on 3040 |

`HTTPS_PORT=<port> just prod` / `just dev` is the same thing with an explicit port. The recipes
follow the `just prod` rules: nothing is killed unless every check passes (env file, node-pty,
certificate, all four ports), a port held by another server is refused unless
`KILL_EXISTING=1`, and the front's ports are never taken over even by `dev`. The front stops with
the server (Ctrl-C).

## Certificate: `just certs`

```bash
just certs
```

`mkcert` signs `apps/web/certificates/chainglass.pem` and `chainglass-key.pem` (gitignored) for
`localhost`, `127.0.0.1`, `::1`, `ops.osk.lan` and every LAN IPv4 address of this machine. Add
names with `CERT_NAMES="name 10.0.0.5" just certs`. Rerun it when the machine's LAN address
changes; the certificate only covers the addresses it was made for.

Each worktree has its own `apps/web/certificates/`; run `just certs` once per worktree. The CA
that signs them is shared (`mkcert -CAROOT`).

### Trusting the CA

Browsers trust the certificate only on devices that trust the mkcert root CA.

- **This Mac:** `mkcert -install` once (asks for an admin password). Without it, mkcert prints
  "the local CA is not installed in the system trust store" and browsers warn.
- **Other devices:** install `"$(mkcert -CAROOT)/rootCA.pem"` once per device.
  - iPhone / iPad: AirDrop the file, install the profile in Settings → General → VPN & Device
    Management, then turn on full trust in Settings → General → About → Certificate Trust
    Settings.
  - Another Mac: open the file in Keychain Access, add it to the System keychain, and set it to
    Always Trust.
  - Windows: `certutil -addstore -f ROOT rootCA.pem` (admin), or import it under Trusted Root
    Certification Authorities.
  - Android: Settings → Security → Encryption & credentials → Install a certificate → CA
    certificate.

Never share `rootCA-key.pem`: anyone with it can sign certificates your devices trust.

### Names

The certificate covers `ops.osk.lan`, but the name must also resolve to this machine on the LAN
(router DNS or each device's hosts file); that is outside the repo.

Until `ops.osk.lan` points at this machine, use `https://<LAN IP>:3030`; the certificate covers
every LAN address. To test the name from this machine without DNS:
`curl --cacert "$(mkcert -CAROOT)/rootCA.pem" --resolve ops.osk.lan:3030:127.0.0.1 https://ops.osk.lan:3030/api/health`.

## The TLS front

`apps/web/src/lib/tls-front.ts` terminates TLS and forwards to the plain servers, which keep
serving plain HTTP unchanged:

| Public (HTTPS) | Forwards to |
|---|---|
| `https://<name>:<HTTPS_PORT>` | Next, `http://127.0.0.1:<PORT>` (requests and WebSocket upgrades) |
| `wss://<name>:<HTTPS_PORT + 1500>` | terminal sidecar, `ws://127.0.0.1:<PORT + 1500>` (bytes tunnelled; the sidecar checks Origin + JWT) |
| `wss://<name>:<HTTPS_PORT>/remote-view-ws/…` | streamd, `ws://127.0.0.1:<daemon port>/…` (prefix stripped; upgrades only) |

The browser dials the terminal at page port + 1500, so no client change is needed. streamd's port
comes from `.chainglass/streamd-<PORT>.json`, else `CG_REMOTE_VIEW__DAEMON_PORT`, else `PORT + 1501`.
Plain HTTP under `/remote-view-ws` gets 404: streamd's HTTP endpoints (health, shutdown) stay
loopback-only.

Every request reaches Next from 127.0.0.1, so the front sets the forwarded headers itself:
`X-Forwarded-For` is overwritten with the client's socket address (never appended to, never the
client's value), plus `X-Forwarded-Proto: https`, `X-Forwarded-Host` and `X-Forwarded-Port`.
`Host` is kept. The localhost guard treats any non-loopback `X-Forwarded-For` hop as remote, so a
LAN client behind the front is still refused on localhost-only routes. Responses are piped, never
buffered (the live-update stream is long-lived).

Run by hand (the HTTPS recipes start it for you):

```bash
PORT=3000 HTTPS_PORT=3030 pnpm tsx apps/web/src/lib/tls-front.ts
```

Env: `PORT` (Next, default 3000), `HTTPS_PORT` (default `PORT + 30`), `TLS_FRONT_HOST` (listen
address, default all interfaces), `CHAINGLASS_TLS_CERT` / `CHAINGLASS_TLS_KEY` (default the
`just certs` files).
