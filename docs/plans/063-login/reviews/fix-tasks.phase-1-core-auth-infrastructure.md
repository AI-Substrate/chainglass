# Fix Tasks: Phase 1: Core Auth Infrastructure

Apply in order. Re-run review after fixes.

## Critical / High Fixes

### FT-001: Correct domain dependency direction for `_platform/auth`
- **Severity**: HIGH
- **File(s)**: /Users/jak/substrate/063-login/docs/domains/domain-map.md
- **Issue**: Auth is modeled as infrastructure depending on business domains.
- **Fix**:
  1. Reverse auth edges to business → auth.
  2. Keep labels as consumed auth contracts.
- **Patch hint**:
  ```diff
  -auth -->|"middleware<br/>(protects all routes)"| fileBrowser
  -auth -->|"middleware<br/>(protects all routes)"| workflowUI
  -auth -->|"middleware<br/>(protects all routes)"| workunitEditor
  +fileBrowser -->|"middleware protection"| auth
  +workflowUI -->|"middleware protection"| auth
  +workunitEditor -->|"middleware protection"| auth
  ```

### FT-002: Backfill phase evidence and close T009 quality gate
- **Severity**: HIGH
- **File(s)**:
  - /Users/jak/substrate/063-login/docs/plans/063-login/tasks/phase-1-core-auth-infrastructure/execution.log.md
  - /Users/jak/substrate/063-login/docs/plans/063-login/tasks/phase-1-core-auth-infrastructure/tasks.md
- **Issue**: T003-T008 are marked complete without matching execution evidence; T009 remains partial and lacks required build/quality outputs.
- **Fix**:
  1. Add per-task entries for T003-T009 with concrete outputs.
  2. Run and capture `pnpm build` and `just fft` results.
  3. Reconcile phase status/checklist to match evidence.
- **Patch hint**:
  ```diff
  +### T006: Route protection proxy
  +**Status**: ✅ Complete
  +**Evidence**:
  +- [command] ...
  +- [result] unauthenticated page -> /login; unauthenticated API -> 401
  +
  +### T009: Build + quality gate
  +**Status**: ✅ Complete
  +**Evidence**:
  +- pnpm build: [output summary]
  +- just fft: [output summary]
  ```

### FT-003: Bring tests into rule compliance (R-TEST-002)
- **Severity**: HIGH
- **File(s)**: /Users/jak/substrate/063-login/test/unit/web/features/063-login/lib/allowed-users.test.ts
- **Issue**: Tests are missing required 5-field Test Doc blocks and required naming style.
- **Fix**:
  1. Add Test Doc comment (Why/Contract/Usage Notes/Quality Contribution/Worked Example) to each test.
  2. Rename tests to `should ...` or Given-When-Then style.
- **Patch hint**:
  ```diff
  -it('returns empty set when YAML is invalid', () => {
  +it('should return an empty set when YAML content is invalid', () => {
  +  /*
  +  Test Doc:
  +  - Why: ...
  +  - Contract: ...
  +  - Usage Notes: ...
  +  - Quality Contribution: ...
  +  - Worked Example: ...
  +  */
  ```

## Medium / Low Fixes

### FT-004: Align route-protection artifact naming (`proxy.ts` vs `middleware.ts`)
- **Severity**: MEDIUM
- **File(s)**:
  - /Users/jak/substrate/063-login/apps/web/proxy.ts
  - /Users/jak/substrate/063-login/docs/domains/_platform/auth/domain.md
  - /Users/jak/substrate/063-login/docs/plans/063-login/login-plan.md
  - /Users/jak/substrate/063-login/docs/plans/063-login/tasks/phase-1-core-auth-infrastructure/tasks.md
- **Issue**: Implementation uses `proxy.ts` while docs/tasks still assert `middleware.ts`.
- **Fix**: Pick one canonical convention and update all artifacts consistently (for Next.js 16, `proxy.ts` is valid).
- **Patch hint**:
  ```diff
  -`apps/web/middleware.ts`
  +`apps/web/proxy.ts`
  ```

### FT-005: Implement AC14 denied-username message
- **Severity**: MEDIUM
- **File(s)**: /Users/jak/substrate/063-login/apps/web/app/login/page.tsx
- **Issue**: AccessDenied message does not include denied GitHub username.
- **Fix**: Propagate username through auth error flow and render `User '<username>' is not authorized`.
- **Patch hint**:
  ```diff
  -Access denied: your GitHub account is not authorized
  +User '{username}' is not authorized
  ```

### FT-006: Add warning logging to allowlist loader failures
- **Severity**: MEDIUM
- **File(s)**: /Users/jak/substrate/063-login/apps/web/src/features/063-login/lib/allowed-users.ts
- **Issue**: Missing/invalid file path is silently swallowed despite task requirement to warn.
- **Fix**: Log warning/error details in catch path before deny-by-default fallback.
- **Patch hint**:
  ```diff
  -} catch {
  +} catch (error) {
  +  console.warn('Failed to load .chainglass/auth.yaml allowlist', error);
     return new Set();
   }
  ```

### FT-007: Move YAML fixtures to required fixtures directory
- **Severity**: MEDIUM
- **File(s)**:
  - /Users/jak/substrate/063-login/test/unit/web/features/063-login/lib/fixtures/valid-auth.yaml
  - /Users/jak/substrate/063-login/test/unit/web/features/063-login/lib/fixtures/mixed-case-auth.yaml
  - /Users/jak/substrate/063-login/test/unit/web/features/063-login/lib/fixtures/invalid-auth.yaml
  - /Users/jak/substrate/063-login/test/unit/web/features/063-login/lib/fixtures/empty-auth.yaml
- **Issue**: Fixture placement violates `R-TEST-006`.
- **Fix**: Move fixtures under `test/fixtures/...` and update fixture resolution in tests.
- **Patch hint**:
  ```diff
  -const FIXTURES_DIR = resolve(__dirname, 'fixtures');
  +const FIXTURES_DIR = resolve(process.cwd(), 'test/fixtures/web/063-login');
  ```

### FT-008: Improve type-safety and concept/docs alignment
- **Severity**: LOW
- **File(s)**:
  - /Users/jak/substrate/063-login/apps/web/src/auth.ts
  - /Users/jak/substrate/063-login/docs/domains/_platform/auth/domain.md
- **Issue**: Fragile login type assertion; Concepts table missing SessionProvider mapping.
- **Fix**:
  1. Replace assertion with explicit runtime string guard.
  2. Add SessionProvider concept row and ensure entry points are current.
- **Patch hint**:
  ```diff
  -return isUserAllowed(profile?.login as string ?? '');
  +const login = typeof profile?.login === 'string' ? profile.login : '';
  +return isUserAllowed(login);
  ```

## Re-Review Checklist

- [ ] All critical/high fixes applied
- [ ] Re-run `/plan-7-v2-code-review` and achieve zero HIGH/CRITICAL
