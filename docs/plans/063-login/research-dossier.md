# Research Report: Authentication System (GitHub OAuth)

**Generated**: 2026-03-01T20:40:00Z
**Research Query**: "Auth - GitHub Auth only, allowed users file in .chainglass, ASCII art animated login screen"
**Mode**: Pre-Plan (branch 063-login detected)
**Location**: docs/plans/063-login/research-dossier.md
**FlowSpace**: Not Available (fs2 scan needed)
**Findings**: 58 across 8 subagents

## Executive Summary

### What It Does
Chainglass is a Next.js 16 web app with no existing authentication. All routes, API handlers, and server actions are completely unprotected. The app uses a `(dashboard)` route group containing 25+ pages.

### Business Purpose
Add GitHub OAuth authentication to gate access to the application. Only users listed in a `.chainglass` settings file should be allowed access. A visually striking ASCII art animated login screen provides the entry experience.

### Key Insights
1. **Greenfield auth** — no middleware, no auth libraries, no session management for users exists. Clean slate.
2. **Strong patterns to follow** — DI container, server actions, provider hierarchy, config system all have established conventions (PL-01 through PL-12).
3. **Domain system ready** — `_platform/auth` fits naturally as a new infrastructure domain alongside existing `_platform/settings`, `_platform/sdk`, etc.

### Quick Stats
- **Components to protect**: 25+ pages, 11 API routes, 5 server action files
- **Auth libraries installed**: 0 (greenfield)
- **Existing middleware**: None
- **Prior Learnings**: 12 relevant discoveries from previous implementations
- **Domains**: 13 active; auth would be new `_platform/auth` infrastructure domain

## How It Currently Works

### Entry Points
| Entry Point | Type | Location | Purpose |
|------------|------|----------|---------|
| Root Layout | Layout | `app/layout.tsx` | ThemeProvider + Providers wrapper |
| Dashboard Layout | Layout | `app/(dashboard)/layout.tsx` | NavigationWrapper (sidebar + mobile nav) |
| API Routes | REST | `app/api/*` (11 routes) | Agents, workspaces, events, health |
| Server Actions | Mutation | `app/actions/*` (5 files) | Workspace, file, workunit, workflow, SDK settings |

### Core Execution Flow
1. **Request enters** → Root layout renders ThemeProvider + Providers
2. **Providers wrap** → QueryClientProvider, NuqsAdapter, SDKProvider, GlobalStateProvider, Toaster
3. **Dashboard layout** → NavigationWrapper (responsive: BottomTabBar mobile, DashboardShell desktop)
4. **No auth check anywhere** → all content renders immediately

### Provider Hierarchy
```
RootLayout
  └─ ThemeProvider (next-themes)
     └─ Providers (providers.tsx)
        ├─ QueryClientProvider (React Query)
        ├─ NuqsAdapter (URL state)
        ├─ SDKProvider (command palette, settings)
        ├─ GlobalStateProvider (runtime state)
        └─ Toaster (notifications)
```

## Architecture & Design

### Component Map
- **Root Layout** (`app/layout.tsx`): CSS imports, ThemeProvider, Providers
- **Dashboard Layout** (`app/(dashboard)/layout.tsx`): NavigationWrapper, force-dynamic
- **Providers** (`src/components/providers.tsx`): Client providers hierarchy
- **DI Container** (`src/lib/di-container.ts`): TSyringe factory pattern (no decorators)
- **Bootstrap Singleton** (`src/lib/bootstrap-singleton.ts`): getContainer() for server-side

### Design Patterns (PS-01 through PS-10)
1. **Layered Provider Pattern** — nested providers in providers.tsx
2. **Try-Catch Error Boundaries** — graceful degradation on init failure
3. **Server Actions + Zod** — validation with ActionState return type
4. **useActionState Hook** — React form state management
5. **TSyringe DI** — factory pattern, no decorators (RSC compatible)
6. **Context + Hook** — useSDKContext(), useGlobalState() patterns
7. **SSE Notification-Fetch** — React Query + EventSource for real-time
8. **Cache Invalidation** — revalidatePath() after mutations
9. **CVA Variants** — class-variance-authority for UI components
10. **Accessible Forms** — aria-describedby for error linking

### Key Interfaces
- **ActionState** — `{ success, message?, errors?, fields? }` for server actions
- **IConfigService** — `get<T>()`, `require<T>()`, `set<T>()` for configuration
- **ILogger** — structured logging with `child()` context
- **IStateService** — `publish()`, `subscribe()`, `get()` for runtime state
- **ISessionMetadataStorage** — `create()`, `get()`, `update()`, `delete()`, `list()`

## Dependencies & Integration

### What Auth Will Depend On
| Dependency | Type | Purpose |
|------------|------|---------|
| Next.js cookies() | Framework | Secure session cookie storage |
| GitHub OAuth API | External | Authentication provider |
| .chainglass config | Internal | Allowed users list |
| IConfigService | Internal | Load auth configuration |
| ILogger | Internal | Audit logging |
| IStateService | Internal | Publish auth state reactively |

### What Will Depend On Auth
| Consumer | Purpose |
|----------|---------|
| All (dashboard) pages | Route protection |
| All API routes | Request authentication |
| All server actions | Mutation authorization |
| NavigationWrapper | Show user/logout button |
| Future domains | User identity context |

## Quality & Testing

### Testing Strategy
- **Coverage threshold**: 50% enforced (aim 80%+ for auth)
- **Fast feedback**: `just test-feature 063` for isolated auth tests
- **Pre-commit gate**: `just fft` (lint + format + typecheck + test)
- **Patterns**: Unit → Contract → Integration → E2E
- **Fixtures**: Create `auth-fixtures.ts` with sample users/sessions
- **No mocks**: Use real fixtures and fakes via DI

## Prior Learnings (Critical)

| ID | Type | Source | Key Insight | Action |
|----|------|--------|-------------|--------|
| PL-01 | DI | Plan 001 | Dual registration (prod/test) | Create FakeAuthService |
| PL-02 | Startup | Plan 004 | Config before container | Load secrets first |
| PL-03 | Next.js | Plan 009 | `await cookies()` async | All cookie ops async |
| PL-05 | Hydration | Plan 006 | Mounted check for viewport | Login screen responsive guard |
| PL-06 | Config | Plan 004 | .chainglass auto-create | Store allowed-users here |
| PL-08 | Types | Plan 054 | Discriminated unions | AuthState type variants |
| PL-09 | Forms | Plan 054 | Server actions for forms | Login via server action |
| PL-10 | Providers | Plan 053 | Mount auth first | AuthProvider at top |
| PL-12 | Security | Plan 004 | Secret detection | OAuth secrets in env only |

## Domain Context

### Proposed: `_platform/auth` (Infrastructure Domain)

**Owns**:
- Session validation (middleware)
- Route protection
- Client-side auth state (useAuth hook, AuthProvider)
- GitHub OAuth flow handlers

**Contracts**:
- `IAuthService` — `getCurrentUser()`, `validateSession()`
- `useAuth()` hook — client-side auth context
- `FakeAuthService` — test double

**Consumed by**: file-browser, workflow-ui, workunit-editor, SDK, events

## Modification Considerations

### Safe to Modify
- `src/components/providers.tsx` — add AuthProvider (established pattern)
- `app/actions/` — add auth-actions.ts (follows existing pattern)
- `app/api/` — add auth routes (follows existing pattern)

### New Files Needed
- `middleware.ts` — Next.js edge middleware for route protection
- `app/login/page.tsx` — Login page (outside dashboard route group)
- `app/api/auth/` — GitHub OAuth callback routes
- `src/components/login/` — ASCII art animated login screen
- `.chainglass/auth.yaml` or similar — allowed users config

### Danger Zones
- Root layout — keep changes minimal (add redirect logic, not providers)
- next.config.mjs — standalone output must trace auth dependencies

## External Research Opportunities

### Research Opportunity 1: Next.js 16 + GitHub OAuth Best Practices

**Why Needed**: No auth library installed; need to decide between next-auth v5, arctic/lucia, or manual OAuth implementation for Next.js 16 with standalone output.
**Impact on Plan**: Determines library choice and implementation architecture.

### Research Opportunity 2: ASCII Art Animation in React/CSS

**Why Needed**: User wants a "hacker console" style animated ASCII login screen with Chainglass logo. Need current best practices for performant text animations in React 19.
**Impact on Plan**: Determines animation approach (CSS vs canvas vs requestAnimationFrame).

## Next Steps

1. Run `/plan-1b-specify` to create the feature specification
2. Consider `/deepresearch` for GitHub OAuth library choice if needed
3. Consider `/plan-2c-workshop` for the ASCII art login screen design

---

**Research Complete**: 2026-03-01T20:42:00Z
**Report Location**: docs/plans/063-login/research-dossier.md
