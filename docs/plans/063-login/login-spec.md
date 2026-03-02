# GitHub Authentication & Login Screen

**Mode**: Full

## Research Context

📚 This specification incorporates findings from research-dossier.md

The codebase has **zero existing authentication** — no middleware, no auth libraries, no session management for users. All 25+ dashboard pages, 11 API routes, and 5 server action files are completely unprotected. The established provider hierarchy (providers.tsx), DI container pattern (TSyringe without decorators), server action conventions (Zod + ActionState), and config system (.chainglass/) provide strong foundations to build on. Twelve prior learnings (PL-01 through PL-12) inform implementation patterns.

## Summary

Gate access to Chainglass behind GitHub OAuth. Only GitHub users whose username appears in a local allowed-users settings file may use the app. Unauthenticated visitors see a visually striking, animated ASCII art login screen styled like a hacker console. Authenticated users see a logout button in the existing navigation. No other authentication methods are supported.

## Goals

- **Single sign-on via GitHub** — users click "Sign in with GitHub" and complete the OAuth flow; no passwords, no email/password forms
- **Allowlist-based access control** — a plain settings file in `.chainglass/` contains a list of permitted GitHub usernames; users not on the list are denied after OAuth
- **Animated ASCII art login screen** — a sleek, modern, hacker-console-styled login page with the Chainglass logo rendered in ASCII art and animated background effects (matrix rain, glitch effects, terminal aesthetics)
- **Logout** — a visible logout button in the dashboard navigation that ends the session and returns to the login screen
- **Minimal footprint** — keep the auth layer simple; no roles, no permissions hierarchy, no user database, no user profiles beyond what GitHub provides

## Non-Goals

- **No other auth providers** — no Google, email/password, magic links, SAML, or SSO beyond GitHub
- **No user management UI** — the allowed-users file is edited manually; no admin panel
- **No roles or permissions** — all allowed users have equal access to everything
- **No user profiles or avatars** — no profile pages; GitHub identity is used only for access gating
- **No remember-me / persistent sessions** — session duration follows standard cookie expiry
- **No API key or token-based auth for external consumers**
- **No rate limiting or brute-force protection** (beyond what GitHub OAuth provides natively)

## Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|-------------|---------------------|
| _platform/auth | **NEW** | **create** | New infrastructure domain owning session validation, route protection, OAuth flow, and client-side auth state |
| _platform/settings | existing | **consume** | Leverage config system patterns for allowed-users file loading |
| _platform/state | existing | **consume** | Publish auth state (current user) for reactive UI updates |
| _platform/sdk | existing | **consume** | Register logout command in command palette |
| _platform/events | existing | **consume** | Use SSE patterns if cross-tab logout sync needed in future |

### New Domain Sketches

#### _platform/auth [NEW]
- **Purpose**: Cross-cutting authentication and session management for the Chainglass web app. Provides GitHub OAuth flow, session cookie management, route protection via Next.js middleware, and a client-side `useAuth()` hook for UI consumption.
- **Boundary Owns**: OAuth callback handling, session creation/destruction, allowed-user validation, middleware route protection, login page, logout action, AuthProvider context, auth-related API routes
- **Boundary Excludes**: User profiles (no user management exists), permissions/roles (all users are equal), configuration UI for allowed users (manual file editing), SSE transport (owned by _platform/events)

## Complexity

- **Score**: CS-3 (medium)
- **Breakdown**: S=2, I=1, D=1, N=0, F=1, T=1 (Total: 6)
- **Confidence**: 0.85
- **Assumptions**:
  - GitHub OAuth app can be created by the user (guided setup)
  - `.chainglass/auth.yaml` is a simple YAML file with a list of usernames
  - Session stored in secure HTTP-only cookies (no database needed)
  - ASCII art animations use CSS/JS only (no canvas or WebGL)
- **Dependencies**:
  - GitHub OAuth App registration (user must create this on github.com)
  - OAuth client ID and secret stored in environment variables
- **Risks**:
  - Standalone Next.js output must correctly trace OAuth library dependencies
  - ASCII art animation performance on low-end devices
  - Cookie-based sessions must survive standalone deployment model
- **Phases** (suggested):
  1. GitHub OAuth flow + session management + middleware
  2. Allowed-users file loading and enforcement
  3. ASCII art animated login screen
  4. Logout button + navigation integration
  5. Polish and iteration on login screen design

## Acceptance Criteria

1. **Unauthenticated users are redirected to `/login`** — visiting any dashboard page or API route without a valid session cookie redirects to the login page
2. **Login page displays animated ASCII art** — the `/login` page renders the Chainglass logo in ASCII art with animated background effects (matrix-style rain, glitch effects, or similar hacker-console aesthetic); animations run smoothly at 60fps
3. **"Sign in with GitHub" button initiates OAuth** — clicking the button redirects to GitHub's OAuth authorization page with correct scopes
4. **Successful OAuth sets a session cookie** — after GitHub callback, a secure HTTP-only session cookie is set and the user is redirected to the dashboard
5. **Denied users see an access-denied message** — if the GitHub username is not in `.chainglass/auth.yaml`, the user sees a clear "not authorized" message on the login page instead of being admitted
6. **Allowed-users file controls access** — a file at `.chainglass/auth.yaml` containing a list of GitHub usernames (e.g., `allowed_users: [jakkaj]`) determines who may access the app
7. **Logout button visible in dashboard navigation** — an accessible logout button appears in the sidebar/navigation area
8. **Logout destroys session** — clicking logout clears the session cookie and redirects to `/login`
9. **API routes reject unauthenticated requests** — API routes under `/api/` (except `/api/health` and auth-related routes) return 401 for requests without a valid session
10. **Server actions validate session** — server actions check for a valid session before executing mutations
11. **Login screen is responsive** — the ASCII art login screen looks good on mobile, tablet, and desktop viewports
12. **GitHub OAuth setup is documented** — clear instructions guide the user through creating a GitHub OAuth App and configuring the client ID/secret (README quick-start + docs/how/ detailed guide)
13. **Session lasts 30 days** — authenticated sessions persist for 30 days before requiring re-authentication
14. **Access denied shows username** — when a user authenticates but is not on the allowlist, the denial message displays their GitHub username (e.g., "User 'xyz' is not authorized")

## Risks & Assumptions

- **Risk**: The `output: 'standalone'` Next.js config may not correctly bundle OAuth library dependencies. Mitigation: test standalone build early.
- **Risk**: ASCII art animations may cause accessibility issues (motion sensitivity). Mitigation: respect `prefers-reduced-motion` media query.
- **Assumption**: The app runs in a trusted environment where the `.chainglass/auth.yaml` file is not publicly accessible.
- **Assumption**: A single GitHub OAuth App is sufficient (no need for per-environment apps for dev vs prod).
- **Risk**: Cookie-based sessions have a 30-day expiry; no refresh token flow. Users must re-authenticate when cookies expire.

## Open Questions

_All resolved — see Clarifications below._

## Documentation Strategy

- **Location**: Hybrid — README.md quick-start section for OAuth app setup essentials, plus `docs/how/auth/github-oauth-setup.md` for detailed step-by-step guide with screenshots description
- **Rationale**: Users need fast onboarding (README) but also a reference for troubleshooting and environment-specific configuration (docs/how/)

## Testing Strategy

- **Approach**: Hybrid — TDD for security-critical paths (OAuth flow, session validation, allowlist enforcement), lightweight for UI components and config loading
- **Mock Policy**: Avoid mocks entirely — use real data/fixtures only, matching codebase convention. Auth.js sessions tested via fixtures and real OAuth flow. No vi.mock() or jest.mock().
- **Focus Areas**: Session cookie creation/validation, allowlist parsing and matching, middleware redirect logic, logout session destruction
- **Excluded**: Visual appearance of ASCII art animations, exact CSS styling, GitHub OAuth external API (tested via manual flow)

## Workshop Opportunities

| Topic | Type | Why Workshop | Key Questions |
|-------|------|--------------|---------------|
| ASCII Art Login Screen Design | UI/Animation | Complex visual design requiring iteration on animation types (matrix rain, glitch, typing effects), ASCII logo design, color palette, and performance tuning | What animation effects? How to render the Chainglass logo in ASCII? Color scheme? Performance budget? prefers-reduced-motion fallback? |
| ~~GitHub OAuth Flow~~ | ~~Integration Pattern~~ | ~~RESOLVED: Using Auth.js v5 (next-auth) — idiomatic Next.js auth library~~ | ~~Decided during DYK session 2026-03-01~~ |

## Clarifications

### Session 2026-03-01

**Q1: Workflow Mode** → **Full** — Multi-phase plan with required dossiers and all gates. Appropriate for CS-3 feature with ~5 phases.

**Q2: Testing Strategy** → **Hybrid** — TDD for OAuth/session logic (security-critical), lightweight for UI components and config loading.

**Q3: Mock Usage** → **Avoid mocks entirely** — Use real data/fixtures only, matching codebase convention (CLAUDE.md). Auth.js sessions tested via fixtures. No vi.mock() or jest.mock().

**Q4: Documentation Strategy** → **Hybrid** — README.md quick-start for OAuth app setup essentials, plus `docs/how/auth/github-oauth-setup.md` for detailed step-by-step guide.

**Q5: Domain Review** → **Approved as-is** — `_platform/auth` domain boundary confirmed. Owns OAuth flow, session management, middleware, login page, AuthProvider. Does not own user profiles, roles, or config UI. Consumes _platform/settings, _platform/state, _platform/sdk, _platform/events.

**Q6: Public Health Endpoint** → **Yes** — `/api/health` remains publicly accessible without authentication for monitoring and uptime checks.

**Q7: Session Duration** → **30 days** — Authenticated sessions persist for 30 days before requiring re-authentication with GitHub.

**Q8: Access Denied Message** → **Show username** — When a user authenticates but is not on the allowlist, display their GitHub username in the denial message (e.g., "User 'xyz' is not authorized").
