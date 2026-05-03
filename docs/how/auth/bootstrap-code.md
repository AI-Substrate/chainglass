# Bootstrap Code — Operator Guide

> The bootstrap code is the always-on first layer of Chainglass auth. Every fresh
> browser must enter it once before the UI renders or any data leaves the server.
> GitHub OAuth (when enabled) is layered *behind* the bootstrap gate as an
> optional second factor.

**Plan**: [084-random-enhancements-3 / auth-bootstrap-code](../../plans/084-random-enhancements-3/auth-bootstrap-code-plan.md)
**Workshop**: [004 — bootstrap-code lifecycle](../../plans/084-random-enhancements-3/workshops/004-bootstrap-code-lifecycle-and-verification.md)
**Migration runbook**: [migration-bootstrap-code.md](./migration-bootstrap-code.md)
**Troubleshooting**: [bootstrap-code-troubleshooting.md](./bootstrap-code-troubleshooting.md)
**Related**: [github-oauth-setup.md](./github-oauth-setup.md)

---

## 1 — What it is

A 12-character Crockford base32 secret (60 bits of entropy) generated locally at
server boot, displayed grouped as `XXXX-XXXX-XXXX` for human dictation. It lives
in a known on-disk file at the repo (workspace) root; the operator reads it and
types it into a popup the first time they open the web UI in any browser. Once
correct, the browser stores an HttpOnly cookie and is never prompted again until
the operator rotates the code.

**What it gates**: every page (including `/login`) and every `/api/*` route
*except* the four bypass prefixes listed below. The same gate also protects the
terminal-WS sidecar and every event-popper / tmux-events sink.

**Bypass route prefixes** (locked contract — see `AUTH_BYPASS_ROUTES` in
`apps/web/src/lib/cookie-gate.ts`):

Always-public (no auth at all):
```
/api/health             — load-balancer probes
/api/auth               — NextAuth callbacks (signin, callback, signout — matched as prefix)
/api/bootstrap/verify   — the route that accepts the typed code
/api/bootstrap/forget   — the route that clears the cookie
```

Localhost-gated by the route handler's own composite check (`requireLocalAuth`
enforces localhost + cookie OR localhost + X-Local-Token):
```
/api/event-popper       — 8 event-popper sinks (ask/answer/list/etc.)
/api/tmux/events        — tmux events sink
```

The two sink prefixes are bypassed at the proxy layer because their
`requireLocalAuth` gate is the canonical defense — keeping the cookie gate
in front would block CLI X-Local-Token flows (the AC-17 contract). The
proxy bypass + handler gate together implement "localhost + (cookie OR
X-Local-Token)".

> **Documentation rule**: when listing these routes, use the literal constant
> values (no glob `/*` suffix). Prefix matching is implemented inside `isBypassPath`
> via `pathname.startsWith(prefix + '/')`.

**What it is NOT**: a per-user identity model. Per-user identity remains anchored
to GitHub OAuth when enabled; without GitHub, all gated traffic is treated as a
single anonymous "operator". No users database, no roles.

---

## 2 — Where it lives

```
<workspace-root>/.chainglass/bootstrap-code.json
```

The workspace root is resolved by the FX003 walk-up helper
(`findWorkspaceRoot(process.cwd())`): from the current working directory we walk
upward looking for any of `pnpm-workspace.yaml`, a `package.json` whose
`workspaces` is a non-empty array, or `.git/`. The first match wins; if none are
found we fall back to the normalized `cwd`. This means whether you launch via
`pnpm dev` from the repo root or via Turbo with `cwd=apps/web/`, the file lives
in the same canonical place.

If you previously ended up with both
`<repo-root>/.chainglass/bootstrap-code.json` *and*
`apps/web/.chainglass/bootstrap-code.json` and the popup rejected codes from one
of them, see [bootstrap-code-troubleshooting.md § Resolved by FX003](./bootstrap-code-troubleshooting.md).

---

## 3 — How to view it

```bash
cat <workspace-root>/.chainglass/bootstrap-code.json
```

Example output (illustrative — your code will differ):

```json
{
  "version": 1,
  "code": "XXXX-XXXX-XXXX",
  "createdAt": "2026-05-03T08:14:22.018Z",
  "rotatedAt": "2026-05-03T08:14:22.018Z"
}
```

The `code` field is the value to type into the popup. It always matches the
regex contract `BOOTSTRAP_CODE_PATTERN` (exported from
`@chainglass/shared/auth-bootstrap-code`):

```
/^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/
```

(Crockford base32 alphabet — no `I L O U` to avoid `1`/`0` confusion.)

The popup itself paste-formats hyphens automatically; you can copy any of
`XXXXXXXXXXXX`, `XXXX-XXXX-XXXX`, `xxxx-xxxx-xxxx` (lowercase ⇒ auto-uppercased).

---

## 4 — How to rotate it

```bash
rm <workspace-root>/.chainglass/bootstrap-code.json
# then restart the server (Ctrl-C → `pnpm dev` again, or your container equivalent)
```

That's it — boot will detect the missing file and generate a fresh code. The
log line `[bootstrap-code] generated new code at <abs-path>` confirms the
rotation; the value is **never** logged (AC-22).

### What rotation invalidates

Rotating the bootstrap code (or `AUTH_SECRET` — see
[migration-bootstrap-code.md § Recovery](./migration-bootstrap-code.md))
invalidates **every existing browser cookie** because the cookie carries
`HMAC(key, code)` and both inputs change. **Every browser must re-enter the new
code**; the popup will reappear on the next page load. This is expected
behaviour, not a fault — communicate it before you rotate.

What is **not** invalidated: the CLI `X-Local-Token` from `.chainglass/server.json`.
That token is keyed off process lifetime, not the bootstrap code, and CLI tools
(`apps/cli`, harness) keep working without re-keying.

---

## 5 — Composition with GitHub OAuth

The bootstrap gate is **always on**. GitHub OAuth (Auth.js v5) is **optional**
and layered behind it.

| Configuration | Bootstrap gate | GitHub OAuth | Signing key for cookie HMAC |
|---|---|---|---|
| `AUTH_SECRET=set, DISABLE_GITHUB_OAUTH=unset` | ON | ON (must complete bootstrap, then GitHub sign-in) | `AUTH_SECRET` |
| `AUTH_SECRET=set, DISABLE_GITHUB_OAUTH=true` | ON | OFF | `AUTH_SECRET` |
| `AUTH_SECRET=unset, DISABLE_GITHUB_OAUTH=true` | ON | OFF | HKDF-derived from the bootstrap code |
| `AUTH_SECRET=unset, DISABLE_GITHUB_OAUTH=unset` | — | — | **Boot fails** (`process.exit(1)`) — see § 5.2 |
| Legacy: `AUTH_SECRET=set, DISABLE_AUTH=true` | ON | OFF, plus a one-shot deprecation `console.warn` | `AUTH_SECRET` |

### 5.1 — Why HKDF when `AUTH_SECRET` is unset

When you run with no `AUTH_SECRET` (e.g. dev laptop, no GitHub set up) the cookie
HMAC needs a key. Phase 1 derives one via HKDF from the bootstrap code itself.
Side-effect: rotating the code rotates the key. Side-side-effect: the same key
is used by the terminal-WS sidecar, so terminal connections keep working with no
extra setup.

### 5.2 — Hard fail on misconfiguration (AC-20)

If GitHub OAuth is enabled (neither disable flag set to literal `'true'`) but
`AUTH_SECRET` is unset/empty/whitespace, boot exits with code 1 and the message:

> `GitHub OAuth is enabled but AUTH_SECRET is unset (or empty/whitespace-only).
> Set AUTH_SECRET in .env.local, or set DISABLE_GITHUB_OAUTH=true to disable
> GitHub OAuth.`

Two valid fixes:

```bash
# Fix A: set AUTH_SECRET
echo "AUTH_SECRET=$(openssl rand -base64 32)" >> apps/web/.env.local

# Fix B: turn off GitHub OAuth
echo "DISABLE_GITHUB_OAUTH=true" >> apps/web/.env.local
```

### 5.3 — `DISABLE_AUTH` deprecation

Before Plan 084 the env var was called `DISABLE_AUTH`. Phase 5 introduced
`DISABLE_GITHUB_OAUTH` as the canonical name and kept `DISABLE_AUTH` as a
one-release-horizon alias. When `DISABLE_AUTH=true` is observed, exactly one
warn is emitted per Node process (HMR-safe via a `globalThis` flag):

```
[auth] DISABLE_AUTH is deprecated; use DISABLE_GITHUB_OAUTH instead. Will be removed in next release.
```

Migrate at your convenience; both names work today.

### 5.4 — Case-sensitivity gotcha

The disable check is the literal string `'true'` (case-sensitive). Values like
`'TRUE'`, `'1'`, `'yes'` are **not** recognised — they leave OAuth on. If your
`.env.local` says `DISABLE_GITHUB_OAUTH=TRUE`, the boot will hard-fail per § 5.2
because OAuth is still considered enabled and `AUTH_SECRET` is presumably unset.

---

## 6 — Container deployments

When `CHAINGLASS_CONTAINER=true` the boot-time write step is skipped — the
container is expected to mount a pre-existing `.chainglass/` directory.

### 6.1 — Why the boot-time write is skipped in containers

Containers usually run with read-only or ephemeral filesystems. Writing
`bootstrap-code.json` from inside the container would either fail (RO mount) or
be lost on restart (ephemeral mount). Either is worse than the explicit
"operator generates it once, container reads it" model.

### 6.2 — Container Initialization (mandatory pre-deployment step)

Generate `bootstrap-code.json` **outside** the container, then mount it in:

```bash
# 1. Generate the file from the workspace root using the shared package
pnpm --filter @chainglass/shared exec node -e \
  "import('./dist/auth-bootstrap-code/index.js').then(m => m.ensureBootstrapCode(process.cwd()))"

# 2. Verify
cat .chainglass/bootstrap-code.json
# {"version":1,"code":"XXXX-XXXX-XXXX",...}

# 3. Mount the file (or the entire .chainglass/ directory) into the container
#    docker-compose.yaml example:
#       volumes:
#         - ./.chainglass:/app/.chainglass:ro
#    Kubernetes example: mount as a Secret or ConfigMap at /app/.chainglass/
```

Without this, the container will return `503 bootstrap-unavailable` on every
gated route and the popup will display a "Service unavailable" error. Recovery:
generate the file, mount it, and restart the container.

### 6.3 — Rotation in containers

Same as § 4, but the `rm` happens on the host side; remount + container restart
takes the new code.

---

## 7 — Troubleshooting

For specific symptoms (the most common being "I typed the code from the file
but it says wrong code"), see the dedicated troubleshooting doc:

→ [`bootstrap-code-troubleshooting.md`](./bootstrap-code-troubleshooting.md)

That doc covers FX003 (workspace-root walk-up resolution) and the
`apps/web/.chainglass/` vs `<repo-root>/.chainglass/` divergence symptom.

For migration-specific symptoms (upgrading from a pre-Plan-084 release),
see [`migration-bootstrap-code.md`](./migration-bootstrap-code.md).

---

## 8 — Security model

### 8.1 — File permissions warning

> **⚠️ The bootstrap-code file is written `0o644` world-readable.** Do **not**
> deploy on multi-user hosts (shared CI runners, multi-tenant VMs) without
> container-runtime isolation. Single-user dev laptops and Kubernetes pods
> (where the container's user namespace gives effective isolation) are safe.
> Hardening to `0o600` is tracked as a deferred follow-up and is **not** in
> Plan 084.

### 8.2 — No code in logs (AC-22)

The bootstrap code value is **never** emitted to logs, error responses, or
stack traces. The boot log line is the file *path*, not the value:

```
[bootstrap-code] active code at /Users/.../bootstrap-code.json
[bootstrap-code] generated new code at /Users/.../bootstrap-code.json
```

A CI test (`test/integration/web/auth-bootstrap-code.log-audit.integration.test.ts`)
spies on `console.log/error/warn`, runs the full boot + verify + token + WS
flow, and asserts that the actual generated code value never appears in any
captured output. Operators should similarly avoid pasting code values into log
files, issue reports, or screenshots.

### 8.3 — Threat model

- **Online guessing**: 60 bits of entropy + per-IP leaky-bucket rate limit
  (5 attempts / 60s on `/api/bootstrap/verify`) makes online guessing
  infeasible at any reasonable rate.
- **Cookie theft**: HttpOnly + `SameSite=Lax` + `Secure` (in prod) blocks JS
  read and mitigates CSRF.
- **CSWSH on terminal WS**: defended by the `Origin` allowlist in
  `terminal-ws.ts` (defaults: localhost, 127.0.0.1, every non-internal IPv4
  interface; opt-in for IPv6 / custom origins via `TERMINAL_WS_ALLOWED_ORIGINS`).
- **Filesystem readability**: see § 8.1 — operator's responsibility on
  multi-user hosts.

---

## Quick reference

| Question | Answer |
|---|---|
| Where's the code? | `<workspace-root>/.chainglass/bootstrap-code.json`, `code` field |
| How do I rotate? | `rm` the file, restart the server |
| Does rotation log out everyone? | Yes — every browser must re-enter the new code; CLI keeps working |
| What if I don't want GitHub OAuth? | Set `DISABLE_GITHUB_OAUTH=true` in `.env.local` |
| What if I forget my GitHub setup? | Boot exits with the actionable error — set `AUTH_SECRET` or set `DISABLE_GITHUB_OAUTH=true` |
| Container deploy? | Generate file outside, mount `.chainglass/` as a volume |
| Bypass routes? | Always-public: `/api/health`, `/api/auth`, `/api/bootstrap/verify`, `/api/bootstrap/forget`. Sink routes (composite `requireLocalAuth` gate in handler): `/api/event-popper`, `/api/tmux/events`. |
| Multi-user host? | Currently unsafe; file is world-readable. Use container isolation. |
