# Fix Tasks: Phase 4: Documentation & Polish

Apply in order. Re-run review after fixes.

## Critical / High Fixes

### FT-001: Secure README auth-secret instructions
- **Severity**: HIGH
- **File(s)**: /Users/jak/substrate/063-login/README.md
- **Issue**: `.env.local` example uses command substitution syntax that dotenv does not execute; users may copy a literal value.
- **Fix**: Replace inline command substitution with a placeholder value and provide a separate explicit shell command to generate a secret.
- **Patch hint**:
  ```diff
   AUTH_GITHUB_ID=your_client_id
   AUTH_GITHUB_SECRET=your_client_secret
  -AUTH_SECRET=$(openssl rand -base64 32)
  +AUTH_SECRET=your_generated_secret_here
  +# Run in terminal and paste result above:
  +# openssl rand -base64 32
  ```

## Medium / Low Fixes

### FT-002: Re-run and document Phase 4 manual E2E flow
- **Severity**: MEDIUM
- **File(s)**: /Users/jak/substrate/063-login/docs/plans/063-login/tasks/phase-4-documentation-polish/execution.log.md
- **Issue**: Phase 4 marks E2E complete while noting dev server was not running and key checks were inherited from prior phases.
- **Fix**: Execute and record phase-local outcomes for redirect → login → OAuth success → dashboard → logout → denied-user flow.
- **Patch hint**:
  ```diff
  - [x] Full OAuth flow previously verified by user during Phase 1 ...
  - [x] Denied user flow previously verified by user ...
  + [x] Started dev server and verified unauthenticated redirect to /login
  + [x] Completed OAuth sign-in and confirmed dashboard load
  + [x] Verified sidebar logout returns to /login
  + [x] Verified denied user receives username-specific error message
  + Evidence: <command/output or observed URL transitions>
  ```

### FT-003: Add missing Domain Manifest mappings for changed phase artifacts
- **Severity**: MEDIUM
- **File(s)**: /Users/jak/substrate/063-login/docs/plans/063-login/login-plan.md
- **Issue**: Changed docs/planning files are not represented in `## Domain Manifest`.
- **Fix**: Add explicit rows (or a convention row for `docs/plans/**/tasks/**`) covering README, plan file, and phase task artifacts.
- **Patch hint**:
  ```diff
   | `docs/how/auth/github-oauth-setup.md` | _platform/auth | internal | Detailed setup guide |
  +| `README.md` | cross-domain | cross-domain | Quick-start auth setup documentation |
  +| `docs/plans/063-login/login-plan.md` | cross-domain | cross-domain | Phase planning/progress artifact |
  +| `docs/plans/063-login/tasks/phase-4-documentation-polish/tasks.md` | _platform/auth | internal | Phase 4 tasks dossier |
  +| `docs/plans/063-login/tasks/phase-4-documentation-polish/execution.log.md` | _platform/auth | internal | Phase 4 execution evidence |
  +| `docs/plans/063-login/tasks/phase-4-documentation-polish/tasks.fltplan.md` | _platform/auth | internal | Phase 4 flight plan artifact |
  ```

### FT-004: Synchronize auth contracts in domain-map
- **Severity**: MEDIUM
- **File(s)**: /Users/jak/substrate/063-login/docs/domains/domain-map.md
- **Issue**: Auth node/summary omit `requireAuth()` and `useAuth()`, and dependency labeling is out of sync with `_platform/sdk` consuming `signOut()`.
- **Fix**: Update auth node label + health summary contracts and add/correct labeled `_platform/sdk -> _platform/auth` edge (or align dependency docs).
- **Patch hint**:
  ```diff
  -auth["🔐 _platform/auth<br/>auth() · signIn() · signOut()<br/>middleware protection<br/>isUserAllowed()<br/>SessionProvider"]:::infra
  +auth["🔐 _platform/auth<br/>auth() · signIn() · signOut()<br/>requireAuth() · useAuth()<br/>middleware protection<br/>isUserAllowed()<br/>SessionProvider"]:::infra
  +sdk -->|"signOut()"| auth
  ```

### FT-005: Align auth domain boundary wording with implementation
- **Severity**: MEDIUM
- **File(s)**: /Users/jak/substrate/063-login/docs/domains/_platform/auth/domain.md
- **Issue**: Boundary section says SessionProvider integration is in `providers.tsx`, conflicting with layout-level provider pattern.
- **Fix**: Update boundary line to reflect `auth-provider.tsx` and layout-level integration.
- **Patch hint**:
  ```diff
  -- **SessionProvider integration** — added to `providers.tsx` for client-side session access
  +- **SessionProvider/AuthProvider integration** — provided via `features/063-login/components/auth-provider.tsx` and wired at dashboard/login layouts
  ```

### FT-006: Fix execution-evidence consistency details
- **Severity**: LOW
- **File(s)**: /Users/jak/substrate/063-login/docs/plans/063-login/tasks/phase-4-documentation-polish/execution.log.md
- **Issue**: `requireAuth()` count is stale and test-pass claim lacks reproducible command output.
- **Fix**: Update count to verified value and add exact command/output summary (or linked log).
- **Patch hint**:
  ```diff
  -- [x] 57 `requireAuth()` calls across 5 server action files
  +- [x] 52 `requireAuth()` calls across 5 server action files (verified with rg count)
  - - [x] All 4764 tests pass (338 files, 76 skipped)
  + - [x] Ran `<exact command>`; result: `<tests passed summary + timestamp/log reference>`
  ```

## Re-Review Checklist

- [ ] All critical/high fixes applied
- [ ] Re-run `/plan-7-v2-code-review` and achieve zero HIGH/CRITICAL
