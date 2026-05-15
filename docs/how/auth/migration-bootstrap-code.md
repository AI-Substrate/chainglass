# Migration Runbook — bootstrap-code (Plan 084)

> Operator runbook for upgrading from a pre-Plan-084 release to the bootstrap-code
> auth model. Read end-to-end before upgrading; the most-likely surprise is
> § (a) — terminal-WS auth is now always on.

**Plan**: [084-random-enhancements-3 / auth-bootstrap-code](../../plans/084-random-enhancements-3/auth-bootstrap-code-plan.md)
**Operator guide**: [bootstrap-code.md](./bootstrap-code.md) — read this first if you haven't
**Troubleshooting**: [bootstrap-code-troubleshooting.md](./bootstrap-code-troubleshooting.md)
**Date**: 2026-05-03

---

## (a) — Behaviour change

The single most important change: **terminal-WS auth is now always on**.

| Before Plan 084 | After Plan 084 |
|---|---|
| If `AUTH_SECRET` was unset, the terminal-WS sidecar silently disabled JWT validation and accepted unauthenticated upgrades. | The sidecar always validates a JWT. The signing key is `AUTH_SECRET` if set, otherwise an HKDF-derived key from the bootstrap code. There is no "no-auth" path anymore. |
| `/api/event-popper/*` and `/api/tmux/events` were guarded by a localhost check only. | Same routes are bypassed at the proxy layer and gated by the route handler's `requireLocalAuth` composite check: localhost + (bootstrap cookie OR `X-Local-Token` per `apps/cli/.../event-popper-client.ts`). Browser flows still authenticate via the bootstrap cookie; CLI flows authenticate via the local token. |
| Browsers loaded the UI immediately on first visit. | Browsers must enter the bootstrap code once before the UI renders (popup at `/`). |
| `DISABLE_AUTH=true` was the canonical disable flag. | `DISABLE_GITHUB_OAUTH=true` is canonical; `DISABLE_AUTH` works for one release with a deprecation warn. |

Plus: a `bootstrap-code.json` file now exists at `<workspace-root>/.chainglass/`.
Persisted across boots; gitignored.

---

## (b) — Rationale

The pre-Plan-084 model had three real exposure holes the research dossier
identified:

1. **Terminal-WS silent bypass** — when `AUTH_SECRET` was unset (typical dev
   setup), the WebSocket sidecar accepted any client. Any process that could
   reach the WS port could attach a tmux pane.
2. **Sidecar HTTP sinks unauthenticated** — anyone on the loopback interface
   could POST arbitrary `event-popper` or `tmux/events` payloads. This included
   any other user on a multi-user dev host.
3. **No web auth without GitHub OAuth** — operators who didn't want to set up
   GitHub OAuth got an open web app. The `DISABLE_AUTH=true` escape hatch
   removed every gate.

Plan 084 closes all three by introducing a single locally-generated bootstrap
code that's the always-on outer gate, then layering GitHub OAuth (when wanted)
behind it. Documented design: [workshop 004](../../plans/084-random-enhancements-3/workshops/004-bootstrap-code-lifecycle-and-verification.md).

---

## (c) — Required env-var actions per existing setup

Find your existing setup in the table; apply the action; restart.

| Existing config | Plan 084 status | Action required |
|---|---|---|
| `AUTH_SECRET=set, GitHub OAuth on` (production-like) | ✅ Supported as-is | Pull, restart. Operators see the bootstrap popup once per browser. CLI continues working unchanged. |
| `AUTH_SECRET=set, DISABLE_AUTH=true` (dev with no GitHub) | ⚠️ Works but deprecated | Pull, restart. You'll see a one-shot deprecation warn in stderr: `[auth] DISABLE_AUTH is deprecated; use DISABLE_GITHUB_OAUTH instead. Will be removed in next release.` Migrate by renaming the env var: `DISABLE_AUTH=true` → `DISABLE_GITHUB_OAUTH=true` in `apps/web/.env.local`. Behaviour is identical. |
| `AUTH_SECRET=unset, DISABLE_AUTH=true` (minimal dev) | ✅ Supported via HKDF | Rename `DISABLE_AUTH=true` → `DISABLE_GITHUB_OAUTH=true`. Cookie HMAC key is HKDF-derived from the bootstrap code; you don't need to generate `AUTH_SECRET`. |
| `AUTH_SECRET=unset, GitHub OAuth on` | ❌ Hard-fail | Boot will exit with code 1: *"GitHub OAuth is enabled but AUTH_SECRET is unset (or empty/whitespace-only). Set AUTH_SECRET in .env.local, or set DISABLE_GITHUB_OAUTH=true to disable GitHub OAuth."* Two valid fixes: (i) `echo "AUTH_SECRET=$(openssl rand -base64 32)" >> apps/web/.env.local`; or (ii) `echo "DISABLE_GITHUB_OAUTH=true" >> apps/web/.env.local`. |

**Case-sensitivity gotcha**: the literal string `'true'` (lowercase) is the only
value that disables OAuth. `'TRUE'`, `'1'`, `'yes'` all leave OAuth enabled and
will hard-fail per row 4 if `AUTH_SECRET` is unset.

**Container deployments**: see [bootstrap-code.md § 6](./bootstrap-code.md#6--container-deployments)
for the mandatory pre-deployment generation step (`pnpm --filter @chainglass/shared
exec node -e "..."`) — without it, the container will return 503 on every gated
route.

---

## (d) — How to confirm correctness

Three one-liners; all should succeed in order. Run from a fresh browser session
on a host with the new build deployed.

```bash
# 1. Health probe is public — should return 200 (no auth required)
curl -fsS http://localhost:3000/api/health
# Expected: 200 OK; body is the standard health JSON
```

```bash
# 2. Load the root in a browser. The popup MUST appear.
#    Verify presence in the DOM (Playwright / DevTools / harness):
#    The element with data-testid="bootstrap-popup" must be present.
#
# Quick CLI proxy: hit any gated API without the cookie — must return 401
curl -isS http://localhost:3000/api/events/mux 2>&1 | head -1
# Expected: HTTP/1.1 401 Unauthorized   (with body { "error": "bootstrap-required" })
```

```bash
# 3. Enter the bootstrap code in the popup. After submit, the page reloads and
#    the in-browser terminal should connect successfully — the WS upgrade
#    returns 101 Switching Protocols (visible in DevTools → Network → WS).
cat .chainglass/bootstrap-code.json | grep -o '"code":"[^"]*"'
# Use that code in the popup. Then open the terminal panel and verify it
# connects (see status badge top-right of the terminal pane).
```

If any of these fail, see § (e).

---

## (e) — Recovery procedures

### Rotation invalidates browsers — expected

> **If you rotate `AUTH_SECRET` or the bootstrap code, every browser must
> re-enter the new bootstrap code.** The popup will reappear on next page load.
> This is **expected behaviour**, not a fault — communicate it to your team
> before rotating.
>
> CLI tools (`apps/cli`, harness `just harness ...`) continue working
> **without re-keying** because they use `X-Local-Token` from
> `.chainglass/server.json`, which is independent of the bootstrap code and the
> `AUTH_SECRET`.

The bootstrap code is the inner key; rotating it invalidates every cookie because
the cookie carries `HMAC(key, code)` and the inputs change. Same applies to
`AUTH_SECRET` rotation when GitHub OAuth is enabled — the JWT signing key
changes, every session invalidates.

### Recovery if the WS terminal breaks

Symptoms: the in-browser terminal pane shows "Disconnected" and never reconnects;
DevTools shows the WS upgrade returning 4403 or 503.

1. **Try the easy fix first** — set `AUTH_SECRET` temporarily and redeploy.
   This bypasses the HKDF path so you can isolate whether the issue is on the
   code-derivation side:

   ```bash
   echo "AUTH_SECRET=$(openssl rand -base64 32)" >> apps/web/.env.local
   # restart server
   ```

2. **Inspect the boot log** for `[bootstrap-code]` lines. You should see
   exactly one of:

   ```
   [bootstrap-code] generated new code at <abs-path>
   [bootstrap-code] active code at <abs-path>
   ```

   If neither appears: the boot block didn't run. Check `apps/web/instrumentation.ts`
   wasn't accidentally edited; check `CHAINGLASS_CONTAINER` isn't set in a
   non-container env.

3. **Check Origin allowlist** if the WS upgrade returns 4403 with no other
   error. The default allowlist enumerates localhost + 127.0.0.1 + every
   non-internal IPv4 interface. If you're loading the UI from a remote host
   (LAN IP, public DNS, etc.), set
   `TERMINAL_WS_ALLOWED_ORIGINS=https://your-host.example.com` (comma-separated
   for multiple).

4. **Run the harness diagnostic** (if you have it set up):

   ```bash
   just harness doctor --wait 60
   ```

   Doctor walks the layered checks (Docker → Ports → Container → App →
   Services) and reports which layer is degraded.

5. **Last resort** — delete the bootstrap-code file, restart, share the new
   code with users, and have everyone re-enter it:

   ```bash
   rm .chainglass/bootstrap-code.json
   # restart server
   cat .chainglass/bootstrap-code.json | grep -o '"code":"[^"]*"'  # share this
   ```

---

## (f) — `DISABLE_AUTH` → `DISABLE_GITHUB_OAUTH` rename

**Canonical name**: `DISABLE_GITHUB_OAUTH=true` — turns off GitHub OAuth, keeps
the bootstrap gate on. This is the supported name going forward.

**Legacy alias**: `DISABLE_AUTH=true` — still recognised, but emits exactly one
warn per Node process the first time the server observes it:

```
[auth] DISABLE_AUTH is deprecated; use DISABLE_GITHUB_OAUTH instead. Will be removed in next release.
```

(The warn message is sourced verbatim from `apps/web/src/auth.ts:67`.)

**Deprecation horizon**: one release. The next major Plan-084-following release
removes `DISABLE_AUTH` recognition entirely. Migrate now.

**Migrating**:

```bash
# In apps/web/.env.local
- DISABLE_AUTH=true
+ DISABLE_GITHUB_OAUTH=true
```

Both names work today. There's no behaviour difference.

---

## File-permission deferred follow-up

The `bootstrap-code.json` file is currently written `0o644` (world-readable on
Unix). On single-user dev laptops and Kubernetes pods this is safe (operator =
attacker = defender; container-runtime user namespaces isolate). On multi-user
hosts (shared CI runners, multi-tenant VMs) it is **not** safe. Hardening to
`0o600` is tracked as a deferred follow-up. Until that lands, do not deploy on
multi-user hosts without container-runtime isolation.

See [bootstrap-code.md § 8.1](./bootstrap-code.md#81--file-permissions-warning).

---

## Quick reference

| Symptom | Most likely fix |
|---|---|
| Boot exits with "GitHub OAuth is enabled but AUTH_SECRET is unset" | Set `AUTH_SECRET` or set `DISABLE_GITHUB_OAUTH=true` |
| Popup doesn't appear; pages load directly | The cookie is already valid (you've authenticated this browser before). To reset: hit `POST /api/bootstrap/forget` with `credentials: 'same-origin'`, or clear cookies for the host |
| Popup appears but accepts no code | See [bootstrap-code-troubleshooting.md § FX003](./bootstrap-code-troubleshooting.md) |
| Container returns 503 on every page | Bootstrap-code file not mounted. See [bootstrap-code.md § 6.2](./bootstrap-code.md#62--container-initialization-mandatory-pre-deployment-step) |
| Terminal WS won't connect (4403) | Origin allowlist — set `TERMINAL_WS_ALLOWED_ORIGINS` |
| Deprecation warn in stderr | Rename `DISABLE_AUTH` → `DISABLE_GITHUB_OAUTH` in `.env.local` |
| Rotated `AUTH_SECRET` and now nobody can log in | Expected — every browser must re-enter the bootstrap code; CLI keeps working |
