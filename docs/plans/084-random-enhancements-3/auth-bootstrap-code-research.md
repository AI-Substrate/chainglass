# Research Dossier: Bootstrap-Code Auth (Always-On Local Gate)

**Generated**: 2026-04-30
**Branch / Plan folder**: `084-random-enhancements-3`
**Research Query**: "Replace heavyweight GitHub OAuth as the *required* auth path with an always-on, locally-issued bootstrap code. On boot, write a code to a gitignored file at the repo root; show a popup blocking every page until the user enters it; persist the code so users can save it. Bootstrap-code must also protect the terminal sidecar at all times. GitHub OAuth becomes optional and layered on top."
**Mode**: Pre-Plan (research-only — STOP before specifying)
**FlowSpace**: Not detected; standard tools used.

---

## Executive Summary

### What we found
Chainglass already has every primitive we need to build this — they're just wired for a different threat model.

- **Plan 063 (`_platform/auth`)** brought GitHub OAuth via Auth.js v5 + a `proxy.ts` middleware gate + an allowlist file at `.chainglass/auth.yaml`. `DISABLE_AUTH=true` makes the entire stack pass-through (proxy returns `next()`, `auth()` returns a fake session).
- **Plan 064 Phase 6 (Terminal WS auth)** introduced the *exact* pattern this feature needs at the WebSocket boundary: HTTP token endpoint that requires session, signs a 5-minute JWT with `AUTH_SECRET`, browser passes it as `?token=` on WS connect, sidecar validates with the shared secret. The pattern is tested, shipped, and well-documented in `workshops/002-terminal-ws-authentication.md`.
- **Plan 067 (event-popper)** added the *file-based local trust* pattern at boot: `instrumentation.ts` generates `randomUUID()` and writes `{ port, pid, startedAt, localToken }` to `.chainglass/server.json` atomically, removed on `SIGTERM`/`SIGINT`. CLI tools read the file and send `X-Local-Token`. **This is the closest prior art for the bootstrap-code lifecycle.**
- **Plan 076 (CLI server-mode auth)** generalized that pattern: filesystem access = trust boundary; the `localToken` rotates every restart and is sent as a bearer.

### What's missing
1. There is no UI-level gate that blocks **all** pages — including `/login` itself. Today the login page is intentionally *outside* the proxy matcher, so any future global popup must live in `app/layout.tsx`.
2. Two sidecar sinks (`/api/event-popper/*`, `/api/tmux/events`) are protected only by `localhostGuard` — no token, no session. Anyone with `127.0.0.1` access can post arbitrary events.
3. The terminal WS server **silently degrades to no-auth** when `AUTH_SECRET` is unset (`terminal-ws.ts:235-240` — warns then accepts every connection). Under the new model this must become a hard fail or pivot to bootstrap-code validation.
4. The token issuance route (`/api/terminal/token`) issues JWTs with no `iss`/`aud` claims and no session/cwd binding — a token leaked from one tab is valid for any session/cwd.
5. `DISABLE_AUTH=true` short-circuits *everything*, including a future bootstrap-code check, unless we deliberately change the wrapper in `apps/web/src/auth.ts`.

### Key insights
1. **The choke point must move from `proxy.ts` to `app/layout.tsx`.** A server-side middleware redirect can't render an interactive popup; only a client component inside RootLayout can block UI uniformly across `/login` and dashboard alike.
2. **Two-token model.** The bootstrap code is the *human secret* (file + popup); a derived bearer is what the browser carries on every request and what sidecars validate. Don't make sidecars string-compare the user-typed code on every connect — issue a token after the user submits the code, mirror the Plan 064 token-exchange flow.
3. **Persistence is the hard design choice.** "Saveable" implies the code survives boots; "rotated each boot" mirrors `localToken` and is more secure but breaks UX. Recommend persist-by-default with an explicit operator regen path (delete the file, restart). See § Open Questions.
4. **`DISABLE_AUTH` semantics need to flip.** Today it disables everything. After this feature, it should disable *only* the GitHub OAuth layer — bootstrap-code stays on. Renaming to `DISABLE_GITHUB_OAUTH` is the cleanest move; an alias keeps existing dev setups working.

### Quick stats
- **Components in scope**: 1 layout, 1 proxy, 1 instrumentation hook, 1 token route, 1 sidecar WS server, ≥2 unprotected sidecar HTTP sinks, 1 client popup (new), 1 cookie/header story (new).
- **Domains touched**: `_platform/auth` (modify — the major one), `terminal` (modify — token endpoint + WS validator), `_platform/events` (touch — sidecar sinks), possibly new `_platform/local-auth` (or absorb into `_platform/auth`).
- **Domains depended on**: `_platform/sdk` (settings), `workspace` (none directly).
- **Prior learnings surfaced**: 9 (PL-01–PL-09 below).
- **External research opportunities**: 2 (popup UX, cookie-vs-token transport).

---

## Current State (How It Actually Works Today)

### The four protection layers in place

```mermaid
flowchart TD
    classDef ok fill:#E8F5E9,stroke:#4CAF50,color:#000
    classDef gap fill:#FFEBEE,stroke:#F44336,color:#000
    classDef partial fill:#FFF3E0,stroke:#FF9800,color:#000

    User[Browser] --> Proxy[apps/web/proxy.ts<br/>auth() wrapper + matcher]:::partial
    Proxy -->|matches| Page[Server Component / Page]:::ok
    Proxy -.->|excluded| Login["/login (intentional)"]:::ok
    Proxy -.->|excluded| Health["/api/health (intentional)"]:::ok
    Proxy -.->|excluded| EvPop["/api/event-popper/* (localhostGuard only)"]:::gap
    Proxy -.->|excluded| Events["/api/events/* (auth() inline ✓)"]:::ok

    Page --> Action[Server Action]:::ok
    Action -->|requireAuth()| Auth[auth() — proxy.ts:1]:::ok

    User --> WS[Terminal WS sidecar :3000+1500]:::partial
    WS -->|validates JWT signed with AUTH_SECRET| OK1[Connect]:::ok
    WS -.->|AUTH_SECRET unset → silent bypass| Bypass[No auth]:::gap

    User --> TmuxEv["/api/tmux/events (POST, localhostGuard only)"]:::gap
```

**Legend**: green = guarded today, orange = partially guarded, red = no real protection.

### Surface inventory and current guards

| Surface | Today's guard | Bypassable when | Source |
|---|---|---|---|
| All `/dashboard/*` and most pages | `proxy.ts` → `auth()` → JWT cookie | `DISABLE_AUTH=true` | `apps/web/proxy.ts:4-23` |
| `/login` page | None (intentionally public) | Always reachable | `apps/web/app/login/page.tsx` |
| `/api/health` | None | Always public | `apps/web/app/api/health/route.ts:9-11` |
| `/api/auth/*` (NextAuth) | NextAuth internals | n/a | catch-all `[...nextauth]/route.ts` |
| `/api/event-popper/*` | `localhostGuard()` only | Anyone on loopback | e.g. `app/api/event-popper/ask-question/route.ts:19-20` |
| `/api/events/[channel]`, `/api/events/mux` | inline `await auth()` | `DISABLE_AUTH=true` | `app/api/events/[channel]/route.ts:27-28` |
| `/api/terminal/token` (HTTP) | inline `await auth()` + `AUTH_SECRET` env | `DISABLE_AUTH=true` | `app/api/terminal/token/route.ts:21-40` |
| Terminal WS upgrade | JWT signed with `AUTH_SECRET` | `AUTH_SECRET` unset → silent bypass | `apps/web/src/features/064-terminal/server/terminal-ws.ts:50-58, 234-265` |
| WS per-message `auth` refresh | JWT validation when `authEnabled` | Same | `terminal-ws.ts:161-166` |
| WS `copy-buffer` (clipboard) | Inherits WS upgrade auth | Same | `terminal-ws.ts:176-185` |
| `/api/tmux/events` POST | `localhostGuard` only | Anyone on loopback | `app/api/tmux/events/route.ts:27` |
| Server actions | `await requireAuth()` at top | Action authors who forget | grep `'use server'` + `requireAuth` |

### `DISABLE_AUTH` and `AUTH_SECRET` interaction matrix

| `AUTH_SECRET` | `DISABLE_AUTH` | `/api/terminal/token` | WS upgrade | WS auth message |
|---|---|---|---|---|
| set | unset | GitHub session required → 200 with JWT | JWT validated | JWT validated |
| set | `true` | GitHub bypassed → fake session → 200 with JWT | JWT validated | JWT validated |
| unset | unset | 503 ("Auth not configured") | **No auth, allows all** ⚠ | No-op |
| unset | `true` | 503 | **No auth, allows all** ⚠ | No-op |

The bottom-right cell is the threat: a developer on a network-exposed machine with `DISABLE_AUTH=true` and no `AUTH_SECRET` has zero protection on the terminal WS port (`PORT + 1500`). The bootstrap-code design must close this hole.

### Boot lifecycle (the prior art we're following)

`apps/web/instrumentation.ts:22-118` already runs at server start and is the natural home for the new code-write step:

1. Skip on Edge runtime.
2. `startCentralNotificationSystem()` (Plan 027 — file watcher).
3. **HMR-gated** via `globalForEventPopper.__eventPopperServerInfoWritten`.
4. `localToken = randomUUID()` → `writeServerInfo(...)` → atomic temp+rename to `.chainglass/server.json`.
5. `seedGlobalHooks(port)` (Plan 080 — tmux hook scripts to `~/.chainglass/hooks`).
6. SIGTERM/SIGINT cleanup → `removeServerInfo()` deletes `server.json`.
7. `WorkflowExecutionManager` bootstrap (Plan 074 — separate HMR gate).

The atomic write helper lives at `packages/shared/src/event-popper/port-discovery.ts:139-160` and uses temp-file + `rename()` (POSIX-atomic). Schema validated with Zod. **Reuse it.**

---

## Architecture Proposal (Where We're Headed)

### Three-layer model

```mermaid
flowchart LR
    classDef new fill:#E3F2FD,stroke:#2196F3,color:#000
    classDef changed fill:#FFF3E0,stroke:#FF9800,color:#000
    classDef same fill:#E8F5E9,stroke:#4CAF50,color:#000

    subgraph L1["Layer 1: Boot — write the code"]
        Boot[instrumentation.ts]:::changed
        Boot --> File[".chainglass/bootstrap-code.txt<br/>(new, gitignored)"]:::new
    end

    subgraph L2["Layer 2: UI gate — popup in RootLayout"]
        Layout[app/layout.tsx]:::changed
        Layout --> Gate[BootstrapGate client component]:::new
        Gate -->|user submits code| API[/api/bootstrap/verify]:::new
        API -->|200 + Set-Cookie| Cookie[chainglass-bootstrap cookie]:::new
    end

    subgraph L3["Layer 3: Server gate — proxy + sidecars"]
        Proxy[proxy.ts]:::changed
        Proxy --> CookieCheck{cookie present?}
        CookieCheck -->|no| Block[block / 401]:::new
        CookieCheck -->|yes| AuthCheck[auth chain]:::same
        TermToken[/api/terminal/token]:::changed
        TermToken -->|requires bootstrap cookie| JWT[issue JWT]:::same
        WS[Terminal WS sidecar]:::same
        WS -->|validates JWT — unchanged| OK[Connect]:::same
        EvPop[event-popper / tmux events]:::changed
        EvPop -->|require bootstrap-code OR localToken| OK
    end

    L1 --> L2
    L2 --> L3
```

### Layer 1: bootstrap code generation

- **Where**: `apps/web/instrumentation.ts` after the existing `localToken` write block.
- **Format**: human-friendly. `randomUUID()` is too long to type. Recommend a 12-character base32 (Crockford) string in groups of 4 (e.g. `7K2P-9XQM-3T8R`) — short, unambiguous, easy to dictate.
- **Storage**: `.chainglass/bootstrap-code.txt` containing `{ "code": "...", "createdAt": "...", "version": 1 }`. Atomic temp+rename via the same helper as `server.json`. Gitignored (`.chainglass/` is partially ignored today; add an explicit line for clarity).
- **Persistence policy** (recommend: persist across boots; see Open Question Q-2): if the file exists and parses, reuse the code. Otherwise generate. Operator regen = delete the file.
- **HMR safety**: `globalThis.__bootstrapCodeWritten` flag, fail-open reset on error (mirror Plan 027 idiom).
- **Cleanup**: do **not** delete on SIGTERM (unlike `server.json`) — that's the whole point of "saveable".

### Layer 2: UI gate

- **Component placement**: `app/layout.tsx`. Wrap `{children}` in a new `<BootstrapGate>` client component.
- **Why RootLayout, not a route group**: `/login` itself must be gated. The popup must paint over GitHub login as well. RootLayout is the only place above all route groups.
- **Cookie**: `chainglass-bootstrap=<HMAC of the code, server-signed>`, `HttpOnly`, `Secure` (in prod), `SameSite=Lax`, no expiry (stays until cleared) — survives browser restart, dies when the user clears cookies.
- **localStorage**: optional UX nicety — store the *plain code* the user typed so the popup can autofill on a new browser/profile. Pure UX; not a bearer.
- **Verify endpoint**: new `POST /api/bootstrap/verify` that reads `.chainglass/bootstrap-code.txt`, constant-time-compares, sets the HMAC cookie. Excluded from the proxy (chicken-and-egg).
- **Reset endpoint**: `POST /api/bootstrap/forget` clears the cookie (logout for the popup).

### Layer 3: server-side enforcement

- **`proxy.ts`**: add a check for the `chainglass-bootstrap` cookie *before* `auth()`. If missing, redirect to `/?bootstrap=required` (RootLayout sees the missing cookie and shows the popup). Existing matcher exclusions (`/login`, `/api/auth/*`, `/api/health`, etc.) keep their existing semantics, but `/api/health` and `/api/auth/*` may also need the cookie depending on threat model — see Q-1.
- **`auth.ts` wrapper**: rename `DISABLE_AUTH` semantics. Keep the env var name for compatibility but it now means "GitHub OAuth optional". Bootstrap-code stays on. The `auth()` wrapper still returns a fake session under `DISABLE_AUTH=true`, but the *cookie gate runs first* in `proxy.ts`, so a user who never entered the bootstrap code never reaches `auth()`.
- **`/api/terminal/token`**: in addition to today's `await auth()`, require the bootstrap cookie. Token signing unchanged (still uses `AUTH_SECRET`). When `AUTH_SECRET` is unset *and* bootstrap-code is enabled, derive the JWT signing key from the bootstrap code (HKDF) so the WS layer has *something* to validate. This closes the silent-bypass hole.
- **Terminal WS**: change the silent-bypass branch (`terminal-ws.ts:235-240`) to refuse connections when no auth is configured. Then layer the bootstrap-derived key as a fallback: if `AUTH_SECRET` is set, use it (today's behaviour); else read the bootstrap code via the shared helper and use HKDF to derive the JWT key.
- **`/api/event-popper/*` and `/api/tmux/events`**: keep `localhostGuard` as defence-in-depth, but additionally accept either `X-Local-Token` (the existing `server.json` `localToken` for CLI/sidecar callers) or the bootstrap cookie (for browser callers). One header-or-cookie helper, applied across both routes.

### Domain placement
- **Modify**: `_platform/auth` — owns boot-code generation, cookie issuance, popup component, verify endpoint. The existing GitHub-OAuth pieces become a sub-feature *inside* this domain.
- **Modify**: `terminal` — token endpoint and WS validator gain bootstrap-code awareness.
- **Touch**: `_platform/events` — sidecar HTTP sinks gain the cookie/token check.
- **Possibly extract**: a new `_platform/local-auth` sub-domain if bootstrap-code grows beyond what `_platform/auth` should reasonably own. **Recommend deferring** — keep it inside `_platform/auth` until/unless workshops show otherwise.

---

## Modification Considerations

### ✅ Safe to modify
- **`instrumentation.ts`** — boot-time, idempotent, well-isolated. Adding a code-write step alongside `server.json` is low-risk.
- **`app/layout.tsx`** — wrapping `{children}` in a client gate is the standard React pattern; doesn't disturb the SSR tree.
- **New `/api/bootstrap/*` routes** — pure additions.

### ⚠ Modify with caution
- **`proxy.ts`** — every page goes through here. The matcher exclusions are load-bearing. A bad regex change locks operators out. *Mitigation*: keep current matcher untouched; layer a cookie check *inside* the existing handler.
- **`auth.ts` wrapper** — the `DISABLE_AUTH` short-circuit has subtle dual semantics (proxy vs server-component). Re-read the wrapper's two branches before touching.
- **`/api/terminal/token`** — cookie-or-session resolution must compose cleanly with the existing `auth()` call. Don't double-issue tokens.

### 🚫 Danger zones
- **`terminal-ws.ts:235-240` silent-bypass branch** — closing it is *correct* but is a behaviour change for users on `AUTH_SECRET=unset` configs. Operator-visible: any current dev box without `AUTH_SECRET` set will start failing to connect WSes. Workshop this and either ship behind a flag for one release or document loudly in release notes.
- **Allowlist semantics** (`.chainglass/auth.yaml`) — under the new model, do allowed-users still apply when GitHub OAuth is optional? They only ever fired in the GitHub `signIn` callback. Don't accidentally enforce them globally.

### Extension points
- **Settings domain** (`_platform/settings`) is the right home for the regen UI ("Rotate bootstrap code") if/when we add it.
- **CLI** (`@chainglass/cli`) — the cli already reads `.chainglass/server.json` for `localToken`; it can read `bootstrap-code.txt` the same way for any browser-equivalent flows.

---

## Prior Learnings

These are the discoveries from earlier plans that directly shape this design.

### 📚 PL-01: File-based local trust is the established pattern
**Source**: Plan 067 event-popper, Plan 076 CLI server-mode. `apps/web/instrumentation.ts:45-52`, `packages/shared/src/event-popper/port-discovery.ts:139-160`.
**Relevance**: We don't need to invent a token-distribution mechanism. `randomUUID()` → atomic temp+rename → `.chainglass/server.json` → CLI reads it = working trust boundary. Bootstrap-code follows the same pattern, with a different file and a human-readable code.
**Action**: Reuse the atomic-write helper. New file `bootstrap-code.txt` adjacent to `server.json` keeps lifecycles separate (`server.json` is ephemeral, code is persistent).

### 📚 PL-02: Plan 064 already solved the "browser → WS sidecar" auth problem
**Source**: `docs/plans/064-tmux/workshops/002-terminal-ws-authentication.md`, `apps/web/app/api/terminal/token/route.ts`, `apps/web/src/features/064-terminal/server/terminal-ws.ts`.
**Relevance**: The pattern is: short-lived JWT minted by an authenticated HTTP route, passed as `?token=` on WS upgrade, validated independently with a shared secret. We extend it — the *gate to mint the JWT* now also requires the bootstrap cookie; the WS validation is unchanged.
**Action**: Don't re-architect. Add bootstrap-cookie check to `/api/terminal/token`. Optionally derive the WS signing key from the bootstrap code when `AUTH_SECRET` is unset.

### 📚 PL-03: WS server silently degrades without `AUTH_SECRET`
**Source**: `apps/web/src/features/064-terminal/server/terminal-ws.ts:235-240`.
**Original**: "Set AUTH_SECRET in .env.local to enable terminal auth." — printed as a warning, then connections proceed unauthenticated.
**Relevance**: This is the worst hole the new design must close. A user who runs `DISABLE_AUTH=true` for local dev *and* doesn't set `AUTH_SECRET` is exposing a shell on `0.0.0.0:4500` if `TERMINAL_WS_HOST` is open.
**Action**: Replace the warning with either (a) a hard refuse, or (b) an HKDF derivation of the WS key from the bootstrap code. The bootstrap code is *always* available under the new model, so (b) is achievable without making AUTH_SECRET mandatory.

### 📚 PL-04: JWTs lack `iss`/`aud`/scope binding
**Source**: `app/api/terminal/token/route.ts:33-36`, `terminal-ws.ts:50-58`.
**Relevance**: Today a token issued for one workspace is valid for any workspace; valid in any tab. Low risk in practice (5-min expiry, single-user dev tool) but easy to harden while we're rewriting this neighbourhood.
**Action**: Add `iss: 'chainglass'`, `aud: 'terminal'`, and bind `cwd` and session name into the JWT payload. WS validates them at upgrade time.

### 📚 PL-05: Two sidecar HTTP sinks have no auth, only `localhostGuard`
**Source**: `app/api/event-popper/*`, `app/api/tmux/events/route.ts:27`.
**Relevance**: Loopback-only is good defence-in-depth but is *not* auth — anything with code-exec on the host (every CLI, every container, every other process) can post arbitrary events. Under the new model these become "anyone with the bootstrap code or the localToken can post" — a clear improvement.
**Action**: Add a small `requireLocalAuth(req)` helper that accepts either `X-Local-Token` (matching `server.json.localToken`) or the bootstrap cookie. Apply to both routes.

### 📚 PL-06: The `/login` page is intentionally outside the proxy matcher
**Source**: `apps/web/proxy.ts:21`, `apps/web/app/login/page.tsx`.
**Relevance**: This is structural — Auth.js needs an unauthenticated page to render the OAuth button. So the *only* place to gate `/login` itself with bootstrap-code is **above** the route, i.e. in RootLayout.
**Action**: BootstrapGate goes in `app/layout.tsx`, not in `proxy.ts`. The proxy gains a complementary cookie check for *server-rendered* leaks but is not the popup's host.

### 📚 PL-07: `.chainglass/auth.yaml` is the prior precedent for non-secret config
**Source**: Plan 063 spec `docs/plans/*-login/login-spec.md`, the file in this repo (`allowed_users: [jakkaj]`).
**Relevance**: Precedent for "small config file at `.chainglass/`, hand-edited, not a database". Bootstrap-code follows the same family — just generated rather than authored.
**Action**: Keep the file format minimal (JSON or plain text). Don't introduce YAML for this — it's a single field.

### 📚 PL-08: ADR-0003 secret detection lists `sk-`, `ghp_`, `xoxb-`, etc.
**Source**: `docs/adr/adr-0003-configuration-system-architecture.md` (lines 154-157).
**Relevance**: The bootstrap code's chosen alphabet should not collide with detection patterns. Crockford base32 (`0-9 A-Z` minus `I L O U`) collides with nothing.
**Action**: Use Crockford base32, group as `XXXX-XXXX-XXXX`. Avoid hex (looks like an MD5; harder to read aloud).

### 📚 PL-09: Constitution Principle 7 — shared by default
**Source**: `docs/project-rules/constitution.md` lines 112-117.
**Relevance**: Code generation, file IO, and validation should land in `packages/shared/` so the CLI can reuse the same primitives (e.g. for a future `cg auth print-code` operator command).
**Action**: New helper module `packages/shared/src/auth/bootstrap-code/` with `generateCode()`, `writeBootstrapCode()`, `readBootstrapCode()`, `verifyBootstrapCode()`. Web instrumentation and any CLI flow consume it.

---

## Open Questions for `/plan-2c-workshop` and `/plan-2-clarify`

These are the design decisions where research surfaced two viable answers. Each warrants explicit clarification before we write the spec.

### Q-1: Which `/api/*` routes still bypass the bootstrap cookie?
**Today**: `/api/health`, `/api/auth/*`, `/api/event-popper`, `/api/events`, static. Each excluded for a real reason (LB probes, OAuth callback URL, CLI sidecars, SSE).
**Options**:
- **a)** Keep all current exclusions. Bootstrap-cookie required for everything else.
- **b)** Tighten event-popper / tmux events to require cookie *or* `X-Local-Token`. Health stays public; `/api/auth/*` stays public (NextAuth needs it).
- **c)** Tighten further — even `/api/health` requires the cookie (then provide a separate unauthenticated `/api/ping` for LBs).
- **Recommendation**: **(b)**. Surgical, no LB regression, closes the real holes.

### Q-2: Bootstrap-code persistence policy
**Today**: n/a.
**Options**:
- **a)** Regenerate every boot (mirrors `localToken`). Safest. Breaks "saveable" UX — user re-enters every restart.
- **b)** Persist across boots; rotate on operator action (delete file). Simplest UX, code lasts forever.
- **c)** Persist with TTL (e.g. 30 days), auto-rotate. Middle ground.
- **Recommendation**: **(b)** for v1. The threat model is "stop drive-by curiosity", not "rotate a long-lived secret". Add (c) only if real ops feedback demands it.

### Q-3: Cookie vs Authorization-header transport
**Today**: NextAuth uses HttpOnly session cookie.
**Options**:
- **a)** HttpOnly server-signed cookie. Pure server-side validation, browsers handle automatically.
- **b)** Bearer token in `Authorization` header. More CLI-friendly, requires explicit JS to attach on every fetch.
- **c)** Both — cookie for browser, header for CLI/programmatic use.
- **Recommendation**: **(a)** for browser-side; **(c)** by treating the existing `localToken` (`X-Local-Token`) as the header path for CLI. We don't need a new header — Plan 067/076 already gives us one.

### Q-4: Layering with optional GitHub OAuth
**Today**: `DISABLE_AUTH=true` disables both proxy and `auth()`. There's no "OAuth optional, gate on" intermediate.
**Options**:
- **a)** Bootstrap-code is **always** the outer gate. GitHub OAuth (when enabled) is a second factor *inside* the gate. UX: enter code → see login page → sign in with GitHub.
- **b)** Bootstrap-code is the *only* gate when GitHub is disabled; either-or when both are enabled.
- **Recommendation**: **(a)**. Composable, predictable, easy to reason about. Renaming `DISABLE_AUTH` → `DISABLE_GITHUB_OAUTH` makes the new semantics self-documenting; keep an alias for one release.

### Q-5: What happens when the operator forgets the code?
**Options**:
- **a)** Operator deletes `.chainglass/bootstrap-code.txt`, restarts server. New code generated. (Discoverable via README.)
- **b)** A `cg auth show-code` CLI command prints the file contents. Same trust boundary as Plan 076's `localToken`.
- **c)** Print the code to the dev server log on every startup (visible to anyone tailing the log).
- **Recommendation**: **(a) + (b)**. Don't print to log by default; *but* on `pnpm dev` print a hint pointing to the file path so operators don't search.

### Q-6: Does the popup also gate `/login`?
- **a)** Yes — bootstrap-code is the universal first gate.
- **b)** No — `/login` is special because GitHub OAuth callback URL must remain public; bootstrap-code only kicks in for in-app pages.
- **Recommendation**: **(a)**. The popup is a client-side overlay that doesn't affect the OAuth callback (`/api/auth/callback/github`). Login *page* gets gated; OAuth *route* doesn't. Both safe.

### Q-7: Mobile and existing browser session considerations
- Cookies set on a desktop browser don't transfer to a phone. Plan 078 added significant mobile support.
- **Recommendation**: Pop the popup on every device, on every browser, on every fresh session — by design. Operators dictate the code via voice or copy-paste. The localStorage UX nicety (autofill on the last-used browser) is *only* a UX nicety, never the bearer.

---

## External Research Opportunities

Two questions the codebase itself can't answer — drop into `/deepresearch` if you want a current-best-practices read before locking the spec.

### Research Opportunity 1: HttpOnly cookie + client popup pattern in Next.js 16 App Router

**Why needed**: We're combining a server-set HttpOnly cookie with a client-component overlay that decides whether to show. The overlay can't *read* the HttpOnly cookie directly. There are several ways to bridge: server component reads the cookie and passes a boolean to the client component; route-level redirect chain; etc. Confirm the canonical Next.js 16 approach (RSC has changed since most authoritative blog posts).

**Impact**: Determines the exact wiring inside `RootLayout`.

**Source findings**: `apps/web/proxy.ts`, `apps/web/app/layout.tsx`.

**Ready-to-use prompt**:

```
/deepresearch "In a Next.js 16 App Router app using Auth.js v5 and React Server
Components, what's the canonical pattern for: (1) gating ALL routes (including
the public /login page) behind a popup that requires the user to enter a
locally-generated bootstrap code before any UI renders, (2) persisting the
acceptance via an HttpOnly server-signed cookie, (3) letting a client component
in RootLayout decide whether to show the popup without leaking the cookie's
value to the client. Constraints: must coexist with NextAuth's session cookie
without conflict; popup must paint over /login itself (not just dashboard);
should not require disabling SSR. Compare a server-component-passes-bool pattern
vs a route-level redirect pattern vs a client-only fetch-on-mount pattern, with
trade-offs around hydration flash, security, and SSR caching. Cite official
Next.js docs and Auth.js v5 docs."
```

**Save to**: `docs/plans/084-random-enhancements-3/external-research/popup-gate-pattern.md`

### Research Opportunity 2: Threat model for browser-typed local-network bootstrap codes

**Why needed**: Our model assumes `127.0.0.1` is trusted but acknowledges `TERMINAL_WS_HOST=0.0.0.0` exists for remote dev. The bootstrap code is short enough to type/dictate — is it long enough to resist online guessing across HTTP and WS? `/api/bootstrap/verify` and the WS upgrade need a sane rate limit, but research-grounded.

**Impact**: Determines code length, alphabet size, and rate-limit strategy.

**Source findings**: `apps/web/src/features/064-terminal/server/terminal-ws.ts:215-216` (host binding default), `proxy.ts` (no rate limit anywhere).

**Ready-to-use prompt**:

```
/deepresearch "Threat model and parameter sizing for a 'bootstrap code' style
local-auth scheme: a randomly-generated short code (Crockford base32, e.g.
12 chars / ~60 bits) is written to a file on a developer's machine at server
boot. Browser must POST the code to /api/bootstrap/verify; server compares
constant-time and sets an HttpOnly cookie on success. Reachability: usually
127.0.0.1 only, but operators sometimes bind 0.0.0.0 for remote dev. Compare:
8/10/12/16-char Crockford base32 lengths under online guessing with realistic
rate-limit defaults. What rate-limit policy (per-IP, per-cookie, exponential
backoff) is appropriate? How does this compare with 6-digit TOTP, magic-link
emails, and SSH agent-style local sockets? Cite NIST SP 800-63B if applicable.
Keep the analysis grounded in 'single-user developer tool, not enterprise SSO'."
```

**Save to**: `docs/plans/084-random-enhancements-3/external-research/bootstrap-code-threat-model.md`

---

## Domain Context

### Existing domains relevant to this research

| Domain | Relationship | Relevant contracts | Components touched |
|---|---|---|---|
| `_platform/auth` | **directly relevant — primary** | `auth()`, `signIn()`, `signOut()`, `requireAuth()`, `useAuth()`, `SessionProvider`, middleware protection | `apps/web/src/auth.ts`, `proxy.ts`, `apps/web/src/features/063-login/*`, `apps/web/app/login/*`, `app/api/auth/[...nextauth]/route.ts` |
| `terminal` | directly relevant | `TerminalView`, `useTerminalSocket`, `createTerminalServer()`, `/api/terminal/token` | `apps/web/src/features/064-terminal/server/terminal-ws.ts`, `app/api/terminal/token/route.ts`, `apps/web/src/features/064-terminal/hooks/use-terminal-socket.ts` |
| `_platform/events` | tangential — sidecar sinks | `localhostGuard()` (lib), event-popper HTTP routes | `app/api/event-popper/*`, `app/api/tmux/events/route.ts` |
| `_platform/sdk` | tangential — settings UI for "rotate code" | `SettingsStore`, `SDKSetting`, `registerCommand` | `_platform/settings` already exists; "rotate code" command if we add one |
| `workspace` | not directly relevant | n/a | n/a |

### Domain map position

```
[browser]                                 [filesystem]
   │                                            │
   ▼                                            ▼
 RootLayout (changed)        ←───  BootstrapGate (new, in _platform/auth)
   │                                            │
   ▼                                       reads/writes
 proxy.ts (changed)                        .chainglass/bootstrap-code.txt
   │
   ▼
 dashboard / login pages       /api/bootstrap/verify (new, _platform/auth)
                                /api/terminal/token (changed, terminal)
                                  │
                                  ▼
                                terminal WS sidecar (changed, terminal)
                                event-popper / tmux events (changed, _platform/events)
```

### Potential domain actions

- **Extend** `_platform/auth` to own bootstrap-code generation, popup component, verify/forget endpoints, cookie issuance. This is a natural extension of the existing auth-gate ownership.
- **Modify** `terminal` — token endpoint and WS validator gain bootstrap awareness, including HKDF fallback when `AUTH_SECRET` is unset.
- **Modify** `_platform/events` — sidecar sinks gain `requireLocalAuth(req)` — accept either bootstrap cookie or `X-Local-Token`.
- **Don't extract** a new sub-domain yet. Keep it cohesive inside `_platform/auth`. Revisit if it grows beyond one feature folder.

---

## Risk Watchlist (for the spec author)

| Risk | Trigger | Mitigation |
|---|---|---|
| Operator boots app with old `DISABLE_AUTH=true` and no `AUTH_SECRET`; terminal stops working silently | We close the silent-bypass branch | HKDF the WS key from bootstrap code; print a clear log line; release notes |
| Bootstrap cookie collides with NextAuth session cookie | Both write `Set-Cookie` on same response | Use distinct cookie name (`chainglass-bootstrap`), distinct path |
| Popup hydration flash (server renders unprotected, client hides) | RSC vs client gate timing | Server component reads cookie, passes `bootstrapVerified: boolean` to client component; gate is rendered server-side hidden vs visible |
| Mobile browsers losing cookie often (private mode, iOS Safari) | Mobile traffic from Plan 078 | Treat as expected; operator dictates code; rate-limit verify endpoint sensibly |
| "Rotate code" UX never gets built; operators delete the file by hand | Lazy v1 scope | Document "delete & restart" in `docs/how/`; add CLI in v2 |
| `/api/health` LB probes break when we tighten the matcher | Q-1 outcome | Keep `/api/health` permanently public; route LBs there |

---

## Recommendations

### If we move forward to spec
1. Workshop **Q-1, Q-2, Q-4, Q-6** before writing the spec — they're the high-leverage decisions.
2. Lean Plan 064's existing token-exchange pattern hard. We're adding a *gate before the gate*, not replacing the inner mechanics.
3. Keep v1 narrow: code generation + popup + cookie + cookie-check in proxy + token endpoint hardening + WS HKDF fallback + sidecar sink hardening. Defer rotate-code UI.
4. Put the new helpers in `packages/shared/src/auth/bootstrap-code/` per Constitution Principle 7.

### If we extend or refactor instead
- Consider unifying the existing `localToken` and the new `bootstrap-code` into a single `localCredentials.json` with `{ localToken, bootstrapCode }`. Keeps lifecycle ownership and cleanup centralized. Mild risk: changes Plan 067/076 file shape — handle migration gracefully.

### If we skip this
- Document the existing silent-bypass on terminal WS as a known limitation. Add an env-var assertion at boot (`AUTH_SECRET` required when `TERMINAL_WS_HOST=0.0.0.0`). Smaller patch; doesn't address the "popup as universal gate" UX goal.

---

## Appendix: file inventory referenced in this dossier

| File | Purpose |
|---|---|
| `apps/web/proxy.ts` | Today's middleware gate |
| `apps/web/src/auth.ts` | Auth.js v5 config + `DISABLE_AUTH` wrapper |
| `apps/web/instrumentation.ts` | Server boot hook (writes `.chainglass/server.json`) |
| `apps/web/app/layout.tsx` | RootLayout — proposed home for `<BootstrapGate>` |
| `apps/web/app/api/health/route.ts` | Health probe (today: public) |
| `apps/web/app/api/event-popper/ask-question/route.ts` | Sidecar HTTP sink (today: localhostGuard only) |
| `apps/web/app/api/events/[channel]/route.ts` | SSE channel route (today: `auth()` inline) |
| `apps/web/app/api/events/mux/route.ts` | SSE multiplexer (today: `authFn()` inline) |
| `apps/web/app/api/terminal/token/route.ts` | JWT issuance for WS |
| `apps/web/app/api/tmux/events/route.ts` | Sidecar HTTP sink (today: localhostGuard only) |
| `apps/web/src/features/064-terminal/server/terminal-ws.ts` | Terminal WS sidecar |
| `apps/web/src/features/064-terminal/hooks/use-terminal-socket.ts` | Browser-side WS client |
| `apps/web/src/lib/localhost-guard.ts` | Loopback-IP guard helper |
| `apps/web/src/features/063-login/lib/allowed-users.ts` | Allowlist loader |
| `packages/shared/src/event-popper/port-discovery.ts` | Atomic temp+rename helper |
| `.chainglass/auth.yaml` | Allowlist file |
| `.chainglass/server.json` | Generated at boot — `port`, `pid`, `localToken` |
| `docs/plans/064-tmux/workshops/002-terminal-ws-authentication.md` | Closest prior-art workshop |
| `docs/plans/063-login/login-spec.md` | Plan 063 spec |
| `docs/adr/adr-0003-configuration-system-architecture.md` | Secret detection / config rules |
| `docs/project-rules/constitution.md` | Principle 7 — shared by default |

---

## Next Steps

**Recommended immediate next step**: `/plan-2c-workshop` to design the popup UX, cookie/token transport, and rotate flow in concrete detail. Workshops to consider:
1. *Bootstrap code lifecycle* — generation, persistence, regeneration, file format. (Resolves Q-2, Q-5.)
2. *Popup UX & gate placement* — RootLayout vs route group, hydration handling, mobile behaviour. (Resolves Q-3, Q-6, Q-7.)
3. *Sidecar protection layering* — bootstrap cookie + `X-Local-Token` composition. (Resolves Q-1, refines Q-4.)

**If you want to skip workshops and head straight to spec**: `/plan-1b-specify "always-on bootstrap-code auth (with optional GitHub OAuth)"` — Q-1 through Q-6 will surface as `[NEEDS CLARIFICATION]` markers and `/plan-2-clarify` will resolve them. Workshop-first will produce a tighter spec.

**If you want external research first**: run the two `/deepresearch` prompts above; save outputs to `external-research/` then proceed.

---

**Research complete**. Stopping here. No code changes have been made.
