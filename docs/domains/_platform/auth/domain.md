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
| `proxy.ts` | Next.js proxy | Auth.js `auth` wrapper with negative lookahead matcher |
| Login page | route | `/login` with sign-in button and error states |
| Login screen | client component | ASCII art animated login UI (matrix rain, glitch logo, CRT overlay) |

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
apps/web/app/api/auth/[...nextauth]/route.ts            # Auth.js route handler
apps/web/app/login/page.tsx                             # Login page
apps/web/app/login/layout.tsx                           # Login layout
apps/web/proxy.ts                                       # Route protection (Next.js 16 proxy)
.chainglass/auth.yaml                                    # Allowed users config
docs/how/auth/github-oauth-setup.md                     # Setup guide
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
