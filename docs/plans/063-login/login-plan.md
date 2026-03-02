# GitHub Authentication & Login Screen — Implementation Plan

**Plan Version**: 1.0.0
**Created**: 2026-03-01
**Spec**: [login-spec.md](./login-spec.md)
**Status**: DRAFT

## Summary

Chainglass currently has zero authentication — all 25+ dashboard pages, 11 API routes, and 5 server action files are unprotected. This plan adds GitHub OAuth as the sole authentication method, gated by an allowlist of GitHub usernames in `.chainglass/auth.yaml`. Unauthenticated users see an animated ASCII art "hacker console" login screen. The implementation creates a new `_platform/auth` infrastructure domain using Auth.js v5 (next-auth) — the idiomatic Next.js auth library. Four phases move from core OAuth plumbing through to the polished login experience.

## Target Domains

| Domain | Status | Relationship | Role |
|--------|--------|-------------|------|
| _platform/auth | **NEW** | **create** | Session management, OAuth flow, middleware, useAuth() hook, login page |
| _platform/settings | existing | consume | Config loading patterns for `.chainglass/auth.yaml` |
| _platform/state | existing | consume | Publish auth session state for reactive UI |
| _platform/sdk | existing | consume | Register logout command in command palette |
| _platform/events | existing | consume | SSE patterns (future cross-tab sync) |

## Domain Manifest

| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| `docs/domains/_platform/auth/domain.md` | _platform/auth | contract | Domain definition |
| `docs/domains/registry.md` | cross-domain | cross-domain | Register new domain |
| `docs/domains/domain-map.md` | cross-domain | cross-domain | Add auth to architecture diagram |
| `apps/web/proxy.ts` | _platform/auth | contract | Route protection — lightweight cookie check |
| `apps/web/app/login/page.tsx` | _platform/auth | internal | Login page (server component shell) |
| `apps/web/app/login/layout.tsx` | _platform/auth | internal | Login layout (no dashboard nav) |
| `apps/web/src/features/063-login/components/login-screen.tsx` | _platform/auth | internal | ASCII art animated login client component |
| `apps/web/src/features/063-login/components/matrix-rain.tsx` | _platform/auth | internal | Matrix rain background animation |
| `apps/web/src/features/063-login/components/ascii-logo.tsx` | _platform/auth | internal | Chainglass ASCII art logo with glitch effect |
| `apps/web/src/auth.ts` | _platform/auth | contract | Auth.js v5 config — GitHub provider, signIn callback, session strategy |
| `apps/web/app/api/auth/[...nextauth]/route.ts` | _platform/auth | contract | Auth.js catch-all route handler (handles signin, callback, signout) |
| `apps/web/src/features/063-login/lib/allowed-users.ts` | _platform/auth | internal | Load and check `.chainglass/auth.yaml` allowlist |
| `apps/web/src/features/063-login/hooks/use-auth.ts` | _platform/auth | contract | Client-side auth hook |
| `apps/web/src/features/063-login/types.ts` | _platform/auth | contract | AuthUser, AuthSession, AuthState types |
| `apps/web/src/components/providers.tsx` | _platform/auth | cross-domain | Add auth context to provider hierarchy |
| `apps/web/src/components/dashboard-sidebar.tsx` | _platform/auth | cross-domain | Add logout button to sidebar footer |
| `apps/web/app/actions/workspace-actions.ts` | cross-domain | cross-domain | Add session validation |
| `apps/web/app/actions/file-actions.ts` | cross-domain | cross-domain | Add session validation |
| `apps/web/app/actions/workunit-actions.ts` | cross-domain | cross-domain | Add session validation |
| `apps/web/app/actions/workflow-actions.ts` | cross-domain | cross-domain | Add session validation |
| `apps/web/app/actions/sdk-settings-actions.ts` | cross-domain | cross-domain | Add session validation |
| `.chainglass/auth.yaml` | _platform/auth | internal | Allowed users config (default with `jakkaj`) |
| `apps/web/.env.example` | _platform/auth | internal | Document required env vars |
| `docs/how/auth/github-oauth-setup.md` | _platform/auth | internal | Detailed setup guide |

## Key Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | Critical | Middleware runs at edge runtime. Auth.js `auth()` is edge-compatible, enabling full JWT session validation in middleware (not just cookie existence check). | Export `auth as middleware` from `@/auth`. Auth.js handles JWT verification at the edge automatically. |
| 02 | Critical | `output: 'standalone'` may not bundle Auth.js. `serverExternalPackages` only lists Shiki. | Add `next-auth` and `@auth/core` to `serverExternalPackages` in next.config.mjs. Test standalone build in Phase 1. |
| 03 | High | Server actions call `getContainer()` without session check. Auth must be added before container init for fail-fast. | Call `await auth()` from `@/auth` as first line in each action. Returns session or null. |
| 04 | High | No .env.example exists. Developers won't know which env vars to set for OAuth. | Create `apps/web/.env.example` with required vars. Add startup validation via Zod. |
| 05 | High | SidebarFooter exists but is empty. Ideal location for logout button + user display. | Add user avatar + logout button in DashboardSidebar's SidebarFooter. |
| 06 | High | AsciiSpinner already exists in codebase (panel-layout domain). Can reuse animation patterns for login screen. | Reference AsciiSpinner's frame-based interval pattern for matrix rain effect. |

## Phases

### Phase 1: Core Auth Infrastructure

**Objective**: Establish GitHub OAuth using Auth.js v5 (next-auth), session management, and route protection middleware.
**Domain**: _platform/auth (create)
**Delivers**:
- Domain registration (docs, registry, domain-map) — **BLOCKER**: domain artifacts must exist before any code
- Auth.js v5 configuration with GitHub provider
- Allowlist enforcement via signIn callback (reads `.chainglass/auth.yaml`)
- Next.js middleware for route protection using `auth()` wrapper
- Minimal `/login` page (plain "Sign in with GitHub" button, no styling yet)
- `.env.example` with required environment variables
- Default `.chainglass/auth.yaml` with `jakkaj`

**Depends on**: None
**Key risks**: Standalone build bundling (Finding 02). Mitigate by testing `next build` at end of phase.
**Pre-requisite**: Create GitHub OAuth App per `docs/how/auth/github-oauth-setup.md` BEFORE starting.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 1.1 | Create `_platform/auth` domain docs: `domain.md` (with boundary, contracts, § Concepts), update `registry.md`, update `domain-map.md` with auth node and consume arrows | _platform/auth | Domain appears in registry, domain-map shows auth node with arrows to settings/state/sdk/events, domain.md has boundary + contracts sections | **BLOCKER** for all subsequent tasks |
| 1.2 | Install `next-auth@5` (Auth.js v5) and configure GitHub provider in `src/auth.ts`. Export `auth`, `handlers`, `signIn`, `signOut`. Use JWT strategy (no database), `trustHost: true` (for HTTP localhost), `session.maxAge: 30 * 24 * 60 * 60` (30 days per spec). Set `AUTH_SECRET`, `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET` env vars. Add `SessionProvider` to `providers.tsx`. Update `next.config.mjs` serverExternalPackages. | _platform/auth | Auth.js config compiles. GitHub provider registered. JWT session with 30-day maxAge configured. `import { auth } from "@/auth"` resolves. | `@/*` maps to `./src/*` so auth.ts must be at `src/auth.ts`. `trustHost: true` for HTTP localhost. |
| 1.3 | Create catch-all route handler `app/api/auth/[...nextauth]/route.ts` exporting `GET` and `POST` from `handlers`. | _platform/auth | OAuth flow routes auto-handled by Auth.js at `/api/auth/signin`, `/api/auth/callback/github`, `/api/auth/signout`. | Single file replaces 4 manual API routes. |
| 1.4 | Create `allowed-users.ts` — load `.chainglass/auth.yaml`, parse with Zod, return username set. Add `signIn` callback in `auth.ts` that checks GitHub username against allowlist. Deny users not on list. | _platform/auth | TDD: parses valid YAML, rejects invalid, returns Set of lowercase usernames. Denied user gets redirected to `/login?error=AccessDenied`. | Combines Phase 2 allowlist into Phase 1 since Auth.js callbacks make this trivial. |
| 1.5 | Create default `.chainglass/auth.yaml` with `allowed_users: [jakkaj]` | _platform/auth | File exists with correct format | |
| 1.6 | Create `proxy.ts` using Auth.js `auth` wrapper with negative lookahead matcher: `/((?!login|api/auth|_next/static|_next/image|favicon\\.ico).*)`. Redirect unauthenticated to `/login`. | _platform/auth | Unauthenticated page requests redirect to `/login`. `/api/auth/*`, `/login`, and static assets pass through. | Route group `(dashboard)` is NOT part of URLs — use negative matcher. |
| 1.7 | Create minimal `/login` page with "Sign in with GitHub" button that calls `signIn("github")`. Show error message if `?error=AccessDenied` (denied user) or `?error=OAuthSignin` (auth failed). Show denied username from session if available. Layout at `app/login/layout.tsx` — minimal shell with ThemeProvider and SessionProvider (required for signIn), but NO dashboard nav or SDKProvider/GlobalStateProvider. | _platform/auth | Page renders without errors. Button initiates OAuth flow. Error states displayed. | Placeholder — styled in Phase 3. Login layout needs SessionProvider for signIn() to work client-side. |
| 1.8 | Create `apps/web/.env.example` with required env vars: `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`, `AUTH_SECRET` | _platform/auth | File exists with all 3 vars documented with descriptions. | Auth.js auto-infers `AUTH_` prefixed vars. |
| 1.9 | Test standalone build (`next build`) to verify Auth.js bundles correctly. Add `next-auth` to `serverExternalPackages` if needed. Run `just fft`. | _platform/auth | `pnpm build` succeeds. `just fft` passes. No missing module errors. | Per Finding 02. |

### Phase 2: ASCII Art Animated Login Screen

**Objective**: Replace the plain login page with a visually striking hacker-console-styled experience.
**Domain**: _platform/auth
**Delivers**:
- Matrix rain background animation (CSS/JS, no canvas)
- Chainglass ASCII art logo with glitch/typing effects
- Dark terminal aesthetic with green/cyan color scheme
- "Sign in with GitHub" button styled to match aesthetic
- Responsive layout (mobile/tablet/desktop)
- `prefers-reduced-motion` support

**Depends on**: Phase 1 (login page exists)
**Key risks**: Animation performance on low-end devices. Mitigate with `prefers-reduced-motion` and reduced particle count.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 2.1 | Create matrix rain background component — falling characters with varying speeds and opacity | _platform/auth | Smooth 60fps animation, respects `prefers-reduced-motion`, no layout jank | Reference AsciiSpinner pattern (Finding 06) |
| 2.2 | Create Chainglass ASCII art logo component — large text art with glitch/typing animation | _platform/auth | Logo renders centered, animates on mount, static fallback for reduced-motion | |
| 2.3 | Create login-screen.tsx — compose matrix rain + logo + sign-in button + denied message into full-screen terminal UI | _platform/auth | Full viewport, dark background, scanline effect, terminal cursor blinking | |
| 2.4 | Style "Sign in with GitHub" button with terminal/hacker aesthetic | _platform/auth | Button visible, accessible, matches terminal theme, has hover/focus states | |
| 2.5 | Add responsive breakpoints — adjust ASCII art size and rain density for mobile/tablet | _platform/auth | Login screen looks good at 320px, 768px, and 1440px widths | Per PL-05: mounted guard |
| 2.6 | Integrate styled login screen into `/login` page, replacing placeholder | _platform/auth | `/login` renders the full animated experience | |

### Phase 3: Logout & Navigation Integration

**Objective**: Add logout button to dashboard navigation and protect all server actions.
**Domain**: _platform/auth + cross-domain
**Delivers**:
- Logout button in sidebar footer with user display
- Session validation in all 5 server action files
- Auth validation in API route handlers (except health and auth routes)

**Depends on**: Phase 1 (auth working)
**Key risks**: Must modify 5 existing server action files — keep changes minimal (single import + validation call at top of each action function).

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 3.1 | Create `useAuth()` hook — client-side hook using Auth.js `useSession()` or fetching `/api/auth/session` to expose user state | _platform/auth | Returns `{ user, isLoading, isAuthenticated }`. Re-fetches on mount. | |
| 3.2 | Add user display + logout button to DashboardSidebar's SidebarFooter | cross-domain | GitHub username visible in sidebar footer, logout button calls `signOut()` | Per Finding 05 |
| 3.3 | Add session validation to all 5 server action files (`workspace-actions.ts`, `file-actions.ts`, `workunit-actions.ts`, `workflow-actions.ts`, `sdk-settings-actions.ts`) | cross-domain | Each exported action calls `auth()` as first line, returns error ActionState if no session | Per Finding 03 |
| 3.4 | Add session validation to API route handlers (agents, workspaces, events — NOT health) | cross-domain | Unauthenticated API requests return 401 JSON response. Auth checked via `auth()` before `ensureInitialized()`. | |

### Phase 4: Documentation & Polish

**Objective**: Create setup documentation and polish the end-to-end experience.
**Domain**: _platform/auth
**Delivers**:
- GitHub OAuth App setup guide (`docs/how/auth/github-oauth-setup.md`)
- README.md quick-start auth section
- End-to-end manual test of full flow
- Any polish from login screen iteration

**Depends on**: Phases 1-3
**Key risks**: None.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 4.1 | Verify and finalize `docs/how/auth/github-oauth-setup.md` — update env var names to `AUTH_*` prefix, verify callback URL matches Auth.js convention | _platform/auth | Guide covers: create OAuth app, set callback URL, copy credentials, create .env.local, configure auth.yaml | Already drafted — update for Auth.js v5 conventions |
| 4.2 | Add auth quick-start section to README.md | _platform/auth | README has "Authentication Setup" section with essential steps and link to detailed guide | |
| 4.3 | Manual end-to-end verification: unauthenticated → login screen → GitHub OAuth → dashboard → logout → login screen | _platform/auth | Full flow works without errors | |
| 4.4 | Polish login screen based on iteration feedback | _platform/auth | Animations smooth, colors consistent, responsive, accessible | |

## Acceptance Criteria

- [ ] Unauthenticated users are redirected to `/login`
- [ ] Login page displays animated ASCII art with hacker-console aesthetic at 60fps (static fallback for `prefers-reduced-motion`)
- [ ] "Sign in with GitHub" button initiates OAuth flow
- [ ] Successful OAuth sets a session cookie (30-day expiry)
- [ ] Denied users see "User 'xyz' is not authorized" message
- [ ] `.chainglass/auth.yaml` with `allowed_users` list controls access
- [ ] Logout button visible in dashboard sidebar footer
- [ ] Logout destroys session and redirects to `/login`
- [ ] API routes return 401 for unauthenticated requests (except `/api/health` and `/api/auth/*`)
- [ ] Server actions validate session before executing (via `auth()` from Auth.js)
- [ ] Login screen renders correctly at 320px, 768px, and 1440px without horizontal scroll
- [ ] GitHub OAuth setup documented (README + docs/how/)
- [ ] Session lasts 30 days
- [ ] Access denied shows GitHub username

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Standalone build fails to bundle Auth.js deps | Medium | High | Add to `serverExternalPackages`, test build in Phase 1 (task 1.9) |
| Server action authors forget session validation | Low | High | Document pattern, add to CLAUDE.md conventions |
| ASCII art animations cause motion sickness | Low | Medium | Respect `prefers-reduced-motion`, provide static fallback |
| GitHub OAuth rate limits during development | Low | Low | Use personal access token for testing if needed |

## Deviation Ledger

**Deviation**: Using Auth.js v5 (next-auth) instead of hand-rolled OAuth + JWT.
- **Rationale**: Auth.js is the idiomatic, community-standard approach for Next.js authentication. Hand-rolling JWT signing, OAuth token exchange, and session management introduces unnecessary security risk and maintenance burden. Auth.js handles edge-runtime compatibility, session management, CSRF protection, and provider integration out of the box.
- **Impact**: Removes need for `IAuthService` interface, `FakeAuthService`, custom session.ts, custom github-oauth.ts. Reduces Phase 1 from 14 tasks to 9. Collapses Phase 2 (allowlist) into Phase 1 via signIn callback. Reduces total phases from 5 to 4.
- **Constitution Principle 2 (Interface-First)**: Partially deferred — Auth.js provides its own session interface via `auth()`. Custom wrapper interface deferred until needed.
- **Constitution Principle 4 (Fakes Over Mocks)**: Auth.js sessions can be tested via fixtures; no custom fake needed for the auth library itself.
