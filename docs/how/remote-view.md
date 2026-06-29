# Remote View — stream a host-Mac app window into Chainglass

Remote View streams a single desktop app window from the **host Mac** (a Godot game, the iOS
Simulator, any capturable window) into the Chainglass content area, with live mouse/keyboard input.
It is agent-controllable from the CLI, MCP, and the command palette, and it runs beside or over the
terminal.

The pixels are captured by a small signed native daemon (`streamd`) that binds **loopback only**
(`ws://127.0.0.1:<port>`); the browser decodes the H.264 stream with **WebCodecs**. Because the
daemon never touches the network, reaching it from an HTTPS/LAN origin goes through a same-origin
reverse proxy (see [HTTPS / LAN access](#https--lan-access)).

> **Platform:** the streamer is macOS-only (ScreenCaptureKit + CGEvent). The browser side needs a
> recent **Chromium-based** browser (WebCodecs); Safari is not supported.

---

## One-time setup (host Mac)

Run these **on the Mac that owns the windows** — they create a signing cert and install the signed
daemon bundle, and the first run prompts for macOS permissions.

```bash
just streamd-setup     # create the local signing cert in your keychain (GUI auth prompt)
just streamd-install   # build streamd (release) + install the signed bundle
```

`just streamd-install` builds `native/streamd` and installs the signed app bundle to
`~/Library/Application Support/chainglass/streamd/`. The **stable cert + bundle id are load-bearing**:
they are why macOS keeps your TCC grants across rebuilds — a rebuild without the stable identity would
re-prompt for every permission. Re-run `just streamd-install` after pulling daemon changes; you keep
your grants.

### Grant the two macOS permissions

The streamer needs two TCC grants. The app surfaces each precisely (see
[Permissions](#permissions-ac-14) below), but you can grant them up front:

| Permission | Why | System Settings pane |
|---|---|---|
| **Screen Recording** | Capture the window's pixels. Without it the stream stays black and the daemon closes with `E_PERMISSION`. | Privacy & Security → Screen Recording |
| **Accessibility** | Synthesize mouse/keyboard `CGEvent`s into the streamed app. Without it your clicks and keys are dropped. | Privacy & Security → Accessibility |

After granting (or revoking) a permission you may need to re-attach; the in-app preflight card has a
**Re-check** button that re-reads the daemon's permission state without a reload.

To stop any running daemons (e.g. before a clean test): `just streamd-kill` (precise — it kills only
the daemons in the discovery registry, never a broad `pkill`).

---

## Using Remote View

Open it three ways:

- **Launch button** — the monitor icon in the file-browser toolbar (beside the recent-feed history
  button) opens the window picker.
- **Command palette** — `remote-view.attach`.
- **URL** — `?view=remote` on a workspace browser page.

Pick a window from the picker to attach; the canvas shows the live stream with a small HUD (fps,
round-trip latency, bitrate, dropped frames). Input is captured when the canvas is focused; press
`⌘⇧Esc` to release keyboard capture. A browser refresh re-attaches the same session.

### Agents — CLI / MCP

The same NextAuth-gated routes back the CLI and MCP surfaces, so an agent can drive Remote View
headlessly. Start the dev server first (`just dev`).

```bash
cg remote-view list                 # list active sessions (JSON)
cg remote-view attach <windowId>    # attach/stream a host window by its CGWindowID (idempotent per window)
cg remote-view detach <sessionId>   # detach a session
```

`<windowId>` is a CGWindowID — the picker shows windows, and the MCP `remote_view_*` tools mirror the
CLI verbs. If the shipped CLI looks out of date, `just cli-build-check` flags a stale
`apps/cli/dist/cli.cjs` and `just cli-build` rebuilds it.

---

## Secure-context story (localhost vs HTTPS)

WebCodecs video decoding is only available in a **secure context**. There are exactly two origins that
qualify, and Remote View picks the transport per origin automatically:

| Origin | Secure context? | Transport |
|---|---|---|
| `http://localhost:3000` | ✅ (localhost is special-cased secure) | Browser connects **directly** to the loopback daemon `ws://127.0.0.1:<daemonPort>`. |
| `https://<host>` (LAN / tailnet) | ✅ (TLS) | Browser connects **same-origin** to `wss://<host>/remote-view-ws`; a reverse proxy bridges it to the loopback daemon. |
| `http://<lan-ip>` (plain http, not localhost) | ❌ | **Not supported** — WebCodecs is disabled. The viewport overlay names the secure-context cause and the fix (open over `http://localhost` or set up HTTPS). |

The third row is the common gotcha: a plain-http LAN address is *not* a secure context, so the browser
disables WebCodecs. The overlay says so explicitly (it does **not** blame your browser).

---

## HTTPS / LAN access

To reach Remote View from another device over HTTPS (LAN or tailnet), put a TLS-terminating reverse
proxy in front of Chainglass and bridge a same-origin WebSocket path to the loopback daemon. The daemon
stays loopback-only — **never expose the daemon port on the network**; the proxy is the only thing on
the edge.

### Caddy + Porkbun (DNS-01) recipe

This uses [Caddy](https://caddyserver.com) with the Porkbun DNS plugin so Let's Encrypt can issue a cert
via **DNS-01** (no inbound port 80 needed — works for a private/LAN host). Build Caddy with the plugin:

```bash
xcaddy build --with github.com/caddy-dns/porkbun
```

`Caddyfile`:

```caddyfile
remote.example.com {
    # DNS-01 via Porkbun (API keys from https://porkbun.com/account/api).
    tls {
        dns porkbun {
            api_key {env.PORKBUN_API_KEY}
            api_secret_key {env.PORKBUN_API_SECRET_KEY}
        }
    }

    # The remote-view WebSocket. handle_path STRIPS the /remote-view-ws prefix, so the daemon — which
    # upgrades ONLY the exact path /stream — sees `GET /stream?session=…&token=…`. A bare
    # `reverse_proxy /remote-view-ws/*` would forward the URI unstripped and the daemon would 404.
    handle_path /remote-view-ws/* {
        reverse_proxy 127.0.0.1:4501          # <daemonPort> — pin it with CG_REMOTE_VIEW__DAEMON_PORT
    }

    # Everything else → the Next.js app (the /api/remote-view/* token/sessions/health routes ride here).
    reverse_proxy 127.0.0.1:3000
}
```

> The `/remote-view-ws` path is deliberately distinct from the Next `/api/remote-view/*` routes so the
> proxy never shadows token/sessions/health. The prefix-strip is the single easiest thing to get wrong —
> if the stream connects but the daemon immediately 404s, check you used `handle_path`, not
> `reverse_proxy /remote-view-ws/*`.

### Required env (the daemon origin allowlist + auth-behind-proxy)

The daemon gates the WS upgrade on the request `Origin`, and NextAuth must trust the proxy's forwarded
host. Set these in `.env.local` (see `apps/web/.env.example`):

```bash
# Comma-separated Origin allowlist. The web server spawns streamd inheriting its process.env, so
# setting it here propagates to the daemon. Include BOTH the localhost dev origin and the HTTPS host.
CG_REMOTE_VIEW__ALLOWED_ORIGINS=http://localhost:3000,https://remote.example.com

# NextAuth/Auth.js behind the proxy — trust the forwarded host and pin the public URL, or the
# session/callback URLs resolve to the internal origin and auth breaks over HTTPS.
AUTH_TRUST_HOST=true
AUTH_URL=https://remote.example.com

# Optional: pin the daemon's loopback port (otherwise webPort + offset). Match the Caddyfile.
CG_REMOTE_VIEW__DAEMON_PORT=4501
```

The client token (`?session&token`) rides through the proxy verbatim; the proxy only terminates TLS and
presents the same-origin `Origin` the daemon allow-lists. The auth model is otherwise unchanged from
localhost.

---

## Permissions (AC-14)

A missing grant is never a silent black frame. Remote View surfaces it in three places, each naming the
exact grant and a one-click deep-link to its System Settings pane:

- **Picker preflight card** — when the daemon reports a missing grant, a card appears above the window
  picker (before you attach) listing each missing grant with an "Open System Settings" link and a
  **Re-check** button.
- **Viewport** — if the stream closes with `E_PERMISSION`, the error card offers an "Open Screen
  Recording settings" deep-link.
- **CLI** — `cg remote-view` prints the named grant + the fix path (and points back to this doc) instead
  of a bare HTTP status.

---

## Troubleshooting (by error code)

The daemon emits stable error-code strings (and the web routes add a couple); agents and the UI switch
on them. Codes are shown in the viewport error card as a badge.

| Code | Meaning | Fix |
|---|---|---|
| **secure-context overlay** | The page isn't a secure context (plain-http LAN), so WebCodecs is off. Not a daemon error — a UI gate. | Open over `http://localhost:3000`, or set up HTTPS ([above](#https--lan-access)). |
| **`E_BUNDLE_MISSING`** | The signed `streamd` bundle isn't installed (a web-route 503). | Run `just streamd-install` on the host Mac. |
| **`E_PERMISSION`** | Screen Recording (capture) — or Accessibility (input) — is not granted. | Grant it: Privacy & Security → Screen Recording / Accessibility, then Re-check / re-attach. |
| **`E_ORIGIN`** (close 4402) | The browser's `Origin` isn't in the daemon allowlist. | Add the origin to `CG_REMOTE_VIEW__ALLOWED_ORIGINS` (include the HTTPS host for LAN). |
| **`E_AUTH`** (close 4401) | The stream JWT was missing/invalid/expired. | Re-attach (tokens are short-lived, 300s, minted per connect). Check the system clock if it persists. |
| **`E_VERSION`** | The daemon and web build disagree on protocol version. | Update + reinstall the daemon (`just streamd-install`) so it matches the web build; the web side respawns a stale daemon gracefully. |
| **`E_WINDOW_GONE`** | The streamed window was closed. | Pick another window; the viewport shows "Window closed", never a silent black frame. |
| **`E_SESSION_UNKNOWN`** | The session id no longer exists (e.g. after a daemon restart). | Re-attach from the picker. |
| **`E_INTERNAL`** | An unclassified daemon/route failure. | Check the web-server logs; `just streamd-kill` then re-attach to recover a wedged daemon. |

If the stream **connects but stays black** over HTTPS, the most likely cause is the Caddy prefix-strip
(use `handle_path`, not `reverse_proxy /remote-view-ws/*`) — the daemon is receiving the wrong path.

---

## See also

- `docs/domains/remote-view/domain.md` — the domain's boundary, concepts, and dependencies.
- `apps/web/.env.example` — the Remote View env block (origins / trust host / daemon port).
- ADR-0011 — the remote-view architecture decision.
