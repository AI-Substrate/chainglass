# Domain: Auth (`_platform/auth`)

**Slug**: _platform/auth
**Type**: infrastructure
**Created**: 2026-03-02
**Created By**: Plan 063-login
**Parent**: `_platform`
**Status**: active

---

## Purpose

Cross-cutting authentication and session management for the Chainglass web app. Provides GitHub OAuth via Auth.js v5 (next-auth), JWT session management, route protection via Next.js middleware, an allowlist of permitted GitHub usernames, and client-side auth state for UI consumption.

**This is NOT a user management system** — it gates access using GitHub identity and a local allowlist file. No user database, profiles, roles, or permissions.

---

## Boundary

### Owns

- **Auth.js v5 configuration** (`src/auth.ts`) — GitHub provider, JWT session strategy, signIn callback for allowlist enforcement
- **Route handler** (`app/api/auth/[...nextauth]/route.ts`) — Auth.js catch-all handling signin, callback, signout
- **Route protection** (`proxy.ts`) — route protection via Auth.js `auth()` wrapper
- **Login page** (`app/login/`) — sign-in UI with error states, ASCII art login screen (Phase 2)
- **Allowlist loader** (`features/063-login/lib/allowed-users.ts`) — reads `.chainglass/auth.yaml`
- **Client-side auth hook** (`features/063-login/hooks/use-auth.ts`) — wraps Auth.js `useSession()`
- **SessionProvider/AuthProvider integration** — provided via `features/063-login/components/auth-provider.tsx` and wired at dashboard/login layouts

### Does NOT Own

- **User profiles or management** — no user database, no profile pages, no CRUD
- **Roles or permissions** — all allowed users have equal access
- **Configuration UI for allowed users** — `.chainglass/auth.yaml` is edited manually
- **SSE transport** — owned by `_platform/events`
- **SDK command registration** — owned by `_platform/sdk` (auth publishes commands to it)

---

## Contracts (Public Interface)

| Contract | Type | Consumers | Description |
|----------|------|-----------|-------------|
| `auth()` | function | Server components, server actions, API routes | Returns current session or null. Re-exported from Auth.js. |
| `signIn()` | function | Login page, client components | Initiates OAuth flow. Re-exported from Auth.js. |
| `signOut()` | function | Logout button, client components | Destroys session. Re-exported from Auth.js. |
| Middleware protection | proxy | All routes | Redirects unauthenticated requests to `/login`. Excludes `/api/health`, `/api/auth/*`, `/login`. |
| `isUserAllowed()` | function | Auth.js signIn callback | Checks GitHub username against `.chainglass/auth.yaml` allowlist. |
| `requireAuth()` | function | Server actions | Validates session, redirects to `/login` if unauthenticated. Used as first line in all server actions. |
| `useAuth()` | hook | Client components | Returns `{ user, isLoading, isAuthenticated }`. Wraps `useSession()`. |
| `SessionProvider` | React provider | Dashboard layout, login layout | Provides client-side session context via `useSession()`. |

---

## Composition (Internal)

| Component | Type | Description |
|-----------|------|-------------|
| `src/auth.ts` | Auth.js config | GitHub provider, JWT strategy, signIn callback, trustHost |
| `allowed-users.ts` | service | YAML parser + Zod validation for allowlist |
| `require-auth.ts` | guard | Server action auth guard — validates session, redirects if unauthenticated |
| `use-auth.ts` | hook | Client-side auth state — wraps useSession() |
| `auth-provider.tsx` | provider | SessionProvider wrapper for layouts |
| `proxy.ts` | Next.js proxy | Cookie-gate (Plan 084) → DISABLE_AUTH → Auth.js `auth` chain; explicit AUTH_BYPASS_ROUTES |
| Login page | route | `/login` with sign-in button and error states |
| Login screen | client component | ASCII art animated login UI (matrix rain, glitch logo, CRT overlay) |
| `lib/bootstrap-code.ts` | accessor | (Plan 084) `getBootstrapCodeAndKey()` async + module-cached; canonical web-side entry to Phase 1 primitives |
| `lib/cookie-gate.ts` | helper | (Plan 084) Pure `evaluateCookieGate()` returning `bypass`/`cookie-valid`/`cookie-missing-api`/`cookie-missing-page`; `AUTH_BYPASS_ROUTES` const |
| `app/api/bootstrap/verify/route.ts` | route | (Plan 084) `POST /api/bootstrap/verify` — 5 status codes, leaky-bucket rate limit |
| `app/api/bootstrap/forget/route.ts` | route | (Plan 084) `POST /api/bootstrap/forget` — always 200 + Max-Age=0 |
| `bootstrap-gate.tsx` | server component | (Plan 084) Reads `chainglass-bootstrap` cookie, renders `<BootstrapPopup>` with verified-state |
| `bootstrap-popup.tsx` | client component | (Plan 084 P6) Real popup UX — Radix DialogPrimitive, paste-safe Crockford autoformat, 6 error states (incl. live ticking countdown), success-path `router.refresh()`, focus-trapped non-dismissable, mobile-safe Tailwind, console-log-discipline. Named export `BootstrapPopupProps` is the locked contract; 4 stable `data-testid` selectors committed forward to Phase 7 |

---

## Dependencies

### This Domain Depends On

| Domain | Contract | Why |
|--------|----------|-----|
| Auth.js (npm) | `next-auth` v5 | OAuth flow, JWT sessions, middleware auth |
| `.chainglass/auth.yaml` | file | Allowed users configuration |

### Domains That Depend On This

| Domain | Contract | Why |
|--------|----------|-----|
| All dashboard pages | Middleware protection | Route access gating |
| All API routes | `auth()` session check | Request authentication (Phase 3) |
| All server actions | `auth()` session check | Mutation authorization (Phase 3) |
| `_platform/sdk` | `signOut()` | Logout command registration (Phase 3) |

---

## Source Location

```
apps/web/src/auth.ts                                    # Auth.js config
apps/web/src/features/063-login/lib/allowed-users.ts    # Allowlist loader
apps/web/src/features/063-login/lib/require-auth.ts     # Server action auth guard
apps/web/src/features/063-login/hooks/use-auth.ts       # Client auth hook
apps/web/src/features/063-login/components/             # Login screen components
apps/web/src/features/063-login/components/auth-provider.tsx  # SessionProvider wrapper
apps/web/src/features/063-login/components/bootstrap-gate.tsx    # (Plan 084) BootstrapGate server component
apps/web/src/features/063-login/components/bootstrap-popup.tsx   # (Plan 084) BootstrapPopup client stub
apps/web/src/lib/bootstrap-code.ts                      # (Plan 084) getBootstrapCodeAndKey accessor
apps/web/src/lib/cookie-gate.ts                         # (Plan 084) evaluateCookieGate + AUTH_BYPASS_ROUTES
apps/web/src/auth-bootstrap/boot.ts                     # (Plan 084 P2) instrumentation helpers
apps/web/instrumentation.ts                              # (Plan 084 P2) bootstrap-code boot write
apps/web/app/api/auth/[...nextauth]/route.ts            # Auth.js route handler
apps/web/app/api/bootstrap/verify/route.ts              # (Plan 084) POST verify
apps/web/app/api/bootstrap/forget/route.ts              # (Plan 084) POST forget
apps/web/app/login/page.tsx                             # Login page
apps/web/app/login/layout.tsx                           # Login layout
apps/web/app/layout.tsx                                  # RootLayout (Plan 084: wraps children in <BootstrapGate>)
apps/web/proxy.ts                                       # Route protection — bootstrap cookie gate → DISABLE_AUTH → Auth.js
.chainglass/auth.yaml                                    # Allowed users config
.chainglass/bootstrap-code.json                          # (Plan 084) Active bootstrap code (gitignored)
docs/how/auth/github-oauth-setup.md                     # Setup guide
test/helpers/auth-bootstrap-code.ts                     # (Plan 084) setupBootstrapTestEnv cross-phase helper
```

---

## Concepts

| Concept | Entry Point | Description |
|---------|-------------|-------------|
| Authenticate with GitHub | `signIn("github")` | Initiates GitHub OAuth flow via Auth.js. User is redirected to GitHub, authorizes, and returns with a JWT session cookie. |
| Check session | `await auth()` | Returns the current user session from server components, server actions, or API routes. Returns null if unauthenticated. |
| Protect routes | `proxy.ts` | Automatically redirects unauthenticated requests to `/login`. Uses negative lookahead matcher to exclude public routes. |
| Enforce allowlist | `isUserAllowed(login)` | Checks if a GitHub username is in `.chainglass/auth.yaml`. Called by Auth.js signIn callback — denied users never get a session. |
| Guard server actions | `await requireAuth()` | Validates session at the top of every server action. Redirects to `/login` if unauthenticated. |
| End session | `signOut()` | Destroys the JWT session cookie and redirects to `/login`. |
| Client auth state | `useAuth()` | Returns `{ user, isLoading, isAuthenticated }` for client components. Wraps `useSession()`. |
| Provide session context | `SessionProvider` | Wraps layouts so client components can access session via `useSession()`. Added to dashboard and login layouts (not root — breaks SSG). |
| Verify the bootstrap code | `POST /api/bootstrap/verify` | (Plan 084) Accepts `{ code }`, format-checks, constant-time HMAC-compares against active code, sets `chainglass-bootstrap` HttpOnly cookie. 5 status codes (200/400/401/429/503) with locked body shapes; per-IP leaky-bucket rate limit (5/60s). |
| Forget the verification | `POST /api/bootstrap/forget` | (Plan 084) Always 200; clears `chainglass-bootstrap` cookie with `Max-Age=0`. Idempotent. |
| Gate the application shell | `<BootstrapGate>` (server component in RootLayout) | (Plan 084) Reads cookie via `cookies()`, calls `getBootstrapCodeAndKey()`, computes `bootstrapVerified`, renders `<BootstrapPopup>`. Phase 6 ships the real popup UX: Crockford-base32 input with paste-safe autoformat (`XXXX-XXXX-XXXX`), 6 visually-distinct error states (incl. live ticking countdown for 429 rate-limited), `credentials='same-origin'` fetch to `/api/bootstrap/verify`, success-path `router.refresh()`, focus-trapped non-dismissable Radix dialog (no ESC/click-outside escape, no close button), mobile-safe (44×44 touch target, safe-area padding, 100dvh overlay), input retained on errors, zero `console.*` logging of typed code. Stable `data-testid` selectors (`bootstrap-popup`, `bootstrap-code-input`, `bootstrap-code-submit`, `bootstrap-code-error`). |
| Read the active code + key | `getBootstrapCodeAndKey()` | (Plan 084) Async; module-cached. Returns `{ code, key }` from `ensureBootstrapCode(process.cwd())` + `activeSigningSecret(process.cwd())`. JSDoc documents cwd contract for sidecars. **⚠️ Gotcha**: `pnpm dev` via turbo runs Next with `cwd=apps/web/`, so the active file is `apps/web/.chainglass/bootstrap-code.json` — NOT the workspace-root file the popup mentions. See `docs/how/auth/bootstrap-code-troubleshooting.md`. |
| Decide proxy routing | `evaluateCookieGate(req, codeAndKey)` | (Plan 084) Pure helper used by `proxy.ts`. Returns `bypass` for the 4 explicit `AUTH_BYPASS_ROUTES`, `cookie-valid` to fall through to Auth.js chain, `cookie-missing-api` for 401, `cookie-missing-page` for `next()` (popup paints inside layout). |

### Authenticate with GitHub

Users click "Sign in with GitHub" on the login page. Auth.js handles the full OAuth flow — redirect to GitHub, authorization, callback, token exchange, and JWT session creation. The `signIn` callback checks the user against the allowlist before creating the session.

```typescript
// Client-side (login page)
import { signIn } from "next-auth/react"
<button onClick={() => signIn("github")}>Sign in with GitHub</button>

// Server-side (auth.ts signIn callback)
callbacks: {
  signIn: async ({ profile }) => {
    return isUserAllowed(profile?.login ?? "")
  },
}
```

### Check session

Any server component, server action, or API route can check the current session:

```typescript
import { auth } from "@/auth"

const session = await auth()
if (!session) {
  // Not authenticated — redirect or return 401
}
// session.user.name, session.user.email, session.user.image available
```

### Guard server actions

Every server action calls `requireAuth()` as its first line. This validates the session and redirects to `/login` if unauthenticated — no error return needed.

```typescript
import { requireAuth } from '@/features/063-login/lib/require-auth'

export async function myAction(data: FormData) {
  'use server'
  await requireAuth()
  // ... action logic (only runs if authenticated)
}
```

### Client auth state

Client components use `useAuth()` instead of `useSession()` directly for a cleaner API:

```typescript
import { useAuth, signOut } from '@/features/063-login/hooks/use-auth'

function UserMenu() {
  const { user, isLoading, isAuthenticated } = useAuth()
  if (!isAuthenticated) return null
  return <button onClick={() => signOut({ callbackUrl: '/login' })}>{user?.name}</button>
}
```

---

## History

| Plan | Change | Date |
|------|--------|------|
| 063-login Phase 1 | Domain created with Auth.js v5, middleware, login page, allowlist | 2026-03-02 |
| 063-login Phase 2 | Added animated ASCII art login screen (matrix rain, glitch logo, CRT overlay, terminal button), moved SessionProvider to layout-level, build fixes | 2026-03-02 |
| 063-login Phase 3 | Added logout button + username display in sidebar, requireAuth() guard for 52 server actions, auth() guard for 12 API routes, useAuth() hook | 2026-03-03 |
| 063-login Phase 4 | Finalized setup guide, added README auth section, E2E verification, domain artifact updates | 2026-03-03 |
| 084-auth-bootstrap-code Phase 1 | Phase 1 ships shared primitives at @chainglass/shared/auth-bootstrap-code (generator, persistence, cookie HMAC, signing-key with cwd-keyed cache + HKDF fallback) — 46 tests | 2026-04-30 |
| 084-auth-bootstrap-code Phase 2 | Phase 2 wires bootstrap-code into apps/web boot: instrumentation.ts asserts AUTH_SECRET / GitHub-OAuth wiring (process.exit(1) on misconfig under nodejs runtime only); HMR-safe ensureBootstrapCode write under .chainglass/; container-mode warn-skip; .gitignore covers server.json + bootstrap-code.json at repo root | 2026-05-02 |
| 084-auth-bootstrap-code Phase 3 | Phase 3 wires the server-side gate end-to-end: web-side accessor (apps/web/src/lib/bootstrap-code.ts, async + module-cached); POST /api/bootstrap/verify (5 status codes, leaky-bucket rate limit 5/60s, locked 429 body shape `{error,retryAfterMs}`, cookie HttpOnly+SameSite=Lax+Path=/+Secure-prod, no Max-Age); POST /api/bootstrap/forget (always 200 + Max-Age=0); proxy.ts rewritten with explicit AUTH_BYPASS_ROUTES (4 routes) + cookie-gate-before-auth + page-fall-through (no redirect); BootstrapGate server component + BootstrapPopup client stub (named-export BootstrapPopupProps locked for Phase 6); RootLayout wires <BootstrapGate>; setupBootstrapTestEnv helper at test/helpers/auth-bootstrap-code.ts for cross-phase reuse — 60 tests across unit + integration | 2026-05-02 |
| 084-auth-bootstrap-code Phase 6 | Phase 6 replaces Phase 3's text-only stub with the real popup UX: `<BootstrapPopup>` body now ships paste-safe Crockford autoformat (XXXX-XXXX-XXXX), 6 visually-distinct error states (invalid-format, wrong-code, rate-limited with live ticking countdown derived from 429 body's `retryAfterMs`, unavailable, network, idle), credentials='same-origin' fetch, success-path `router.refresh()` with submit-disabled-across-refresh-window, focus trap + ARIA via Radix DialogPrimitive (Title/Description for screen readers), non-dismissable (ESC + click-outside + tab-outside preventDefault), mobile-safe Tailwind (min-h-[100dvh], safe-area padding, 44×44 touch target), input retained on errors, console-log discipline (zero matches of typed code in any console.* — closes Phase 7 AC-22 audit obligation for the popup side); 4 stable `data-testid` selectors committed forward (bootstrap-popup, bootstrap-code-input, bootstrap-code-submit, bootstrap-code-error) for Phase 7 task 7.8 harness e2e — 18 unit + 7 integration = 25 new tests, 154/154 across full auth-bootstrap-code regression sweep | 2026-05-02 |
| 084-auth-bootstrap-code FX003 | Bootstrap-code primitives now resolve workspace root via new `findWorkspaceRoot()` helper (walks up looking for `pnpm-workspace.yaml` → `package.json` workspaces → `.git/`, falling back to normalized `cwd`). Two `process.cwd()` callsites swapped: `apps/web/instrumentation.ts:51` boot block (wrapped in try/catch with `process.cwd()` fallback) and `apps/web/src/lib/bootstrap-code.ts:85` accessor. Implementation Requirements R1–R7 from validate-v2 pass enforced (path.resolve normalization, JSON.parse safety, workspaces truthiness, cross-platform termination, boot error envelope, Phase 4 adoption checklist, client-side boundary documented). 4 GOTCHA doc locations flipped to "Resolved by FX003" pointers. Closes the Phase 6 dev-smoke gotcha where `pnpm dev` at `cwd=apps/web/` wrote a different `.chainglass/` file than the popup mentioned. Phase 4 sidecar adopts the same helper when it lands. 8 new unit tests (3 added by validate-v2 for cache-key normalization, mkTempCwd backcompat, malformed package.json) → 162 across regression sweep | 2026-05-03 |
| 084-auth-bootstrap-code Phase 4 | Terminal sidecar hardened — `terminal-ws.ts` no longer silently degrades when `AUTH_SECRET` is unset; `authEnabled = true` always; signing key from `activeSigningSecret(findWorkspaceRoot(process.cwd()))` (FX003 R6 — sidecar adopts walk-up so HKDF keys match the main Next process). New pure module `apps/web/src/features/064-terminal/server/terminal-auth.ts` exports the JWT shape contract + Origin allowlist + claim validator without sidecar deps so route handlers can import safely. `/api/terminal/token` GET now keeps NextAuth `auth()` pre-check, ADDS bootstrap-cookie pre-check (defence-in-depth on top of proxy gate), signs with the shared key (Buffer-direct to `jose` — no `TextEncoder` re-wrap), embeds `iss=chainglass` / `aud=terminal-ws` / `cwd` claims (5-min expiry). WS upgrade enforces Origin allowlist; default uses `getLocalNetworkHosts()` to enumerate localhost + 127.0.0.1 + every non-internal IPv4 interface (so LAN-IP dev browsing — phone/tablet on the same network — works without env-var setup); IPv6 + custom domains require `TERMINAL_WS_ALLOWED_ORIGINS` opt-in; `Origin: null` and missing/cross-origin all rejected with 4403. Startup assertion: missing `bootstrap-code.json` → `console.error` + `process.exit(1)` with operator-actionable message (cwd path included; bootstrap CODE never logged — AC-22). Validate-v2 11 issues folded in (port discovery, IPv6/numeric variants, Buffer-direct keys, claim presence guards, container mode, AC-22 logging, JWT shape JSDoc, no escape hatch). 24 new WS unit tests + 6 new token-route unit tests + 3 integration tests (AC-13 silent-bypass-closed two-scenario + AC-14 AUTH_SECRET parity) → 46 Phase 4 tests | 2026-05-03 |
