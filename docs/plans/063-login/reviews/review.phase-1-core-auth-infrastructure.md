# Code Review: Phase 1: Core Auth Infrastructure

**Plan**: /Users/jak/substrate/063-login/docs/plans/063-login/login-plan.md
**Spec**: /Users/jak/substrate/063-login/docs/plans/063-login/login-spec.md
**Phase**: Phase 1: Core Auth Infrastructure
**Date**: 2026-03-02
**Reviewer**: Automated (plan-7-v2)
**Testing Approach**: Hybrid (from spec)

## A) Verdict

**REQUEST_CHANGES**

Phase 1 has substantial progress, but blocking issues remain in domain topology and evidence completeness.

**Key failure areas**:
- **Domain compliance**: `_platform/auth` dependency edges are reversed in the domain map.
- **Testing**: Execution evidence is incomplete for tasks marked complete; T009 remains partial without required build/quality proof.
- **Doctrine**: New unit tests violate mandatory project test documentation and organization rules.

## B) Summary

Core auth infrastructure artifacts are largely present in the computed diff: Auth.js config, allowlist parsing, auth route handler, login route, proxy protection, and docs. However, `_platform/auth` is currently modeled as depending on business domains in `domain-map.md`, violating consumer→provider direction. Evidence quality is also below phase gate: execution log covers only T001-T002 while tasks table marks T003-T008 complete, and T009 is still `[~]` without recorded `pnpm build`/`just fft` outcomes. In addition, the new test file does not satisfy required `R-TEST-002` test-doc standards, and fixtures are placed outside mandated `test/fixtures/` structure. The phase should be reworked and re-reviewed before approval.

## C) Checklist

**Testing Approach: Hybrid**

Hybrid-specific:
- [x] Core validation tests added for allowlist parsing and matching
- [ ] Security-critical path verification is fully evidenced end-to-end
- [ ] Test/manual/build evidence is mapped consistently to completed tasks

Universal:
- [ ] Only in-scope files changed (Phase 2 task artifacts are also present in diff)
- [ ] Linters/type checks clean (no recorded pass evidence for this phase)
- [ ] Domain compliance checks pass

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | HIGH | /Users/jak/substrate/063-login/docs/domains/domain-map.md:71-73 | dependency-direction | `_platform/auth` is shown as infra→business (`auth --> fileBrowser/workflowUI/workunitEditor`). | Reverse to business→auth edges with explicit consumed contract labels. |
| F002 | HIGH | /Users/jak/substrate/063-login/docs/plans/063-login/tasks/phase-1-core-auth-infrastructure/execution.log.md:1-31 | testing | Execution log documents T001-T002 only; T003-T008 marked complete elsewhere, and T009 remains partial without required command evidence. | Backfill per-task evidence (T003-T009), run/record `pnpm build` + `just fft`, then reconcile statuses. |
| F003 | HIGH | /Users/jak/substrate/063-login/test/unit/web/features/063-login/lib/allowed-users.test.ts:8-54 | doctrine | Violates `R-TEST-002` (missing required 5-field Test Doc comments and required naming style). | Add required Test Doc blocks and rename tests to `should ...` or Given-When-Then. |
| F004 | MEDIUM | /Users/jak/substrate/063-login/apps/web/proxy.ts:1-22 | scope | Implementation uses `proxy.ts` (valid in Next.js 16), while phase/docs still declare `middleware.ts`. | Align plan/tasks/domain docs to `proxy.ts` (or rename implementation and all references consistently). |
| F005 | MEDIUM | /Users/jak/substrate/063-login/apps/web/app/login/page.tsx:15-18 | correctness | AC14 requires denied username display; current AccessDenied message is generic. | Surface denied GitHub username in error path and render it in `/login`. |
| F006 | MEDIUM | /Users/jak/substrate/063-login/apps/web/src/features/063-login/lib/allowed-users.ts:15-22 | error-handling | T004 says "log warning, deny all" on missing/invalid file, but catch path silently denies all. | Add warning/error logging in catch path while preserving deny-by-default behavior. |
| F007 | MEDIUM | /Users/jak/substrate/063-login/test/unit/web/features/063-login/lib/fixtures/*.yaml | doctrine | Violates `R-TEST-006` (`test fixtures` must be under `test/fixtures/`). | Move fixtures to `test/fixtures/...` and update test path resolution. |
| F008 | LOW | /Users/jak/substrate/063-login/apps/web/src/auth.ts:17-18 | correctness | `profile?.login as string ?? ''` relies on assertion instead of safe narrowing. | Use explicit runtime string guard before calling `isUserAllowed()`. |
| F009 | LOW | /Users/jak/substrate/063-login/apps/web/src/features/063-login/lib/allowed-users.ts:1-33 | pattern | New YAML loader may duplicate existing parser capability (`IYamlParser`/`YamlParserAdapter`) in shared domains. | Evaluate reuse/extension of existing YAML parsing abstraction instead of parallel parser logic. |
| F010 | LOW | /Users/jak/substrate/063-login/docs/domains/_platform/auth/domain.md:103-111 | concepts-docs | Concepts table omits `SessionProvider` despite contract list including it. | Add matching Concepts row (Concept Entry Point What It Does). |

## E) Detailed Findings

### E.1) Implementation Quality

- **F005 (MEDIUM)** `/Users/jak/substrate/063-login/apps/web/app/login/page.tsx:15-18` — AccessDenied message does not include denied username (AC14 gap).
- **F006 (MEDIUM)** `/Users/jak/substrate/063-login/apps/web/src/features/063-login/lib/allowed-users.ts:15-22` — silent catch violates explicit phase requirement to log warning.
- **F008 (LOW)** `/Users/jak/substrate/063-login/apps/web/src/auth.ts:17-18` — fragile type assertion in signIn callback.

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ❌ | Phase/docs boundary expects `middleware.ts`; implementation uses `/Users/jak/substrate/063-login/apps/web/proxy.ts` without synchronized artifact updates. |
| Contract-only imports | ✅ | No cross-domain internal import violation detected in changed code files. |
| Dependency direction | ❌ | `/Users/jak/substrate/063-login/docs/domains/domain-map.md` has infra→business auth arrows. |
| Domain.md updated | ❌ | `/Users/jak/substrate/063-login/docs/domains/_platform/auth/domain.md` still references `middleware.ts` path/model. |
| Registry current | ✅ | `/Users/jak/substrate/063-login/docs/domains/registry.md` includes `_platform/auth`. |
| No orphan files | ❌ | Domain Manifest is incomplete for full diff (`proxy.ts`, test artifacts, lock/config deltas). |
| Map nodes current | ✅ | Auth node and health summary entry are present. |
| Map edges current | ❌ | Auth edge semantics conflict with map rule (consumer → provider). |
| No circular business deps | ✅ | No new business→business cycle introduced. |
| Concepts documented | ⚠️ | Concepts section exists but contract/concept alignment is incomplete (`SessionProvider`). |

### E.3) Anti-Reinvention

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| Allowed-users YAML loader (`/Users/jak/substrate/063-login/apps/web/src/features/063-login/lib/allowed-users.ts`) | `IYamlParser`/`YamlParserAdapter` | shared/workflow infra | ⚠️ Reuse opportunity (recommend evaluate `extend`) |
| Login route provider wrapper (`/Users/jak/substrate/063-login/apps/web/app/login/layout.tsx`) | Existing root provider stack (`/Users/jak/substrate/063-login/apps/web/src/components/providers.tsx`) | _platform/auth | ⚠️ Potential duplication (confirm intentional separation) |
| Auth route handler, auth config, proxy | None significant | _platform/auth | ✅ proceed |

### E.4) Testing & Evidence

**Coverage confidence**: 59%

| AC | Confidence | Evidence |
|----|------------|----------|
| AC1 | 70 | `/Users/jak/substrate/063-login/apps/web/proxy.ts` enforces redirect/401 behavior for unauthenticated requests. |
| AC3 | 78 | `/Users/jak/substrate/063-login/apps/web/src/features/063-login/components/sign-in-button.tsx` invokes `signIn('github', { callbackUrl: '/' })`. |
| AC4 | 55 | `/Users/jak/substrate/063-login/apps/web/src/auth.ts` configures Auth.js sessions; no recorded end-to-end cookie/callback evidence. |
| AC5 | 72 | allowlist callback + AccessDenied branch exist (`auth.ts`, `login/page.tsx`). |
| AC6 | 84 | `.chainglass/auth.yaml`, parser implementation, and allowlist tests are present. |
| AC9 | 70 | `proxy.ts` returns 401 for unauthenticated API requests and excludes `/api/health`/`/api/auth/*`. |
| AC12 | 90 | `/Users/jak/substrate/063-login/docs/how/auth/github-oauth-setup.md` provides setup/troubleshooting details. |
| AC13 | 88 | `session.maxAge: 30 * 24 * 60 * 60` present in auth config. |
| AC14 | 10 | Denial message is generic; denied username is not shown. |

### E.5) Doctrine Compliance

- **F003 (HIGH)** `/Users/jak/substrate/063-login/test/unit/web/features/063-login/lib/allowed-users.test.ts` violates `R-TEST-002` test doc and naming requirements.
- **F007 (MEDIUM)** `/Users/jak/substrate/063-login/test/unit/web/features/063-login/lib/fixtures/*.yaml` violates `R-TEST-006` fixture placement requirement.

Checked against:
- /Users/jak/substrate/063-login/docs/project-rules/rules.md
- /Users/jak/substrate/063-login/docs/project-rules/idioms.md
- /Users/jak/substrate/063-login/docs/project-rules/architecture.md
- /Users/jak/substrate/063-login/docs/project-rules/constitution.md

## F) Coverage Map

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| AC1 | Unauthenticated users redirected to `/login` | `/Users/jak/substrate/063-login/apps/web/proxy.ts` redirect + API 401 branches | 70 |
| AC3 | Sign in with GitHub initiates OAuth | `/Users/jak/substrate/063-login/apps/web/src/features/063-login/components/sign-in-button.tsx` | 78 |
| AC4 | Successful OAuth sets session cookie | Auth.js config exists, but no recorded runtime proof | 55 |
| AC5 | Denied users see access-denied message | AccessDenied branch in login page | 72 |
| AC6 | `.chainglass/auth.yaml` controls access | YAML file + parser + tests present | 84 |
| AC9 | API routes reject unauthenticated requests | proxy API path returns 401 | 70 |
| AC12 | OAuth setup is documented | `/Users/jak/substrate/063-login/docs/how/auth/github-oauth-setup.md` added | 90 |
| AC13 | Session lasts 30 days | `session.maxAge` set to 30 days in auth config | 88 |
| AC14 | Access denied shows username | Not implemented in current login page | 10 |

**Overall coverage confidence**: 59%

## G) Commands Executed

```bash
cd /Users/jak/substrate/063-login && git --no-pager diff --stat
cd /Users/jak/substrate/063-login && git --no-pager diff --staged --stat
cd /Users/jak/substrate/063-login && mkdir -p /Users/jak/substrate/063-login/docs/plans/063-login/reviews
cd /Users/jak/substrate/063-login && git --no-pager diff > /Users/jak/substrate/063-login/docs/plans/063-login/reviews/_computed.diff
cd /Users/jak/substrate/063-login && git --no-pager diff --staged >> /Users/jak/substrate/063-login/docs/plans/063-login/reviews/_computed.diff
cd /Users/jak/substrate/063-login && git --no-pager diff --name-status
cd /Users/jak/substrate/063-login && git --no-pager diff --staged --name-status
cd /Users/jak/substrate/063-login && git ls-files --others --exclude-standard
# For each untracked file (excluding docs/plans/063-login/reviews/*):
cd /Users/jak/substrate/063-login && git --no-pager diff --no-index -- /dev/null <untracked-file> >> /Users/jak/substrate/063-login/docs/plans/063-login/reviews/_computed.diff
```

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review —
> only context on the work that was done before the review.

**Review result**: REQUEST_CHANGES

**Plan**: /Users/jak/substrate/063-login/docs/plans/063-login/login-plan.md
**Spec**: /Users/jak/substrate/063-login/docs/plans/063-login/login-spec.md
**Phase**: Phase 1: Core Auth Infrastructure
**Tasks dossier**: /Users/jak/substrate/063-login/docs/plans/063-login/tasks/phase-1-core-auth-infrastructure/tasks.md
**Execution log**: /Users/jak/substrate/063-login/docs/plans/063-login/tasks/phase-1-core-auth-infrastructure/execution.log.md
**Review file**: /Users/jak/substrate/063-login/docs/plans/063-login/reviews/review.phase-1-core-auth-infrastructure.md

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| /Users/jak/substrate/063-login/apps/web/proxy.ts | Created | _platform/auth | Align artifacts (`middleware.ts` vs `proxy.ts`) and confirm final canonical path |
| /Users/jak/substrate/063-login/apps/web/src/auth.ts | Created | _platform/auth | Tighten signIn typing |
| /Users/jak/substrate/063-login/apps/web/src/features/063-login/lib/allowed-users.ts | Created | _platform/auth | Add warning logs for missing/invalid config |
| /Users/jak/substrate/063-login/apps/web/app/login/page.tsx | Created | _platform/auth | Implement AC14 username display |
| /Users/jak/substrate/063-login/apps/web/src/features/063-login/components/sign-in-button.tsx | Created | _platform/auth | No blocking action |
| /Users/jak/substrate/063-login/docs/domains/domain-map.md | Modified | cross-domain | Reverse dependency direction |
| /Users/jak/substrate/063-login/docs/domains/_platform/auth/domain.md | Created | _platform/auth | Sync boundary/source with proxy path; update Concepts table |
| /Users/jak/substrate/063-login/docs/plans/063-login/tasks/phase-1-core-auth-infrastructure/execution.log.md | Created | phase artifact | Backfill T003-T009 evidence |
| /Users/jak/substrate/063-login/test/unit/web/features/063-login/lib/allowed-users.test.ts | Created | test | Add required Test Doc blocks + naming updates |
| /Users/jak/substrate/063-login/test/unit/web/features/063-login/lib/fixtures/*.yaml | Created | test | Move to `test/fixtures/...` per rules |

### Required Fixes (if REQUEST_CHANGES)

| # | File (absolute path) | What To Fix | Why |
|---|---------------------|-------------|-----|
| 1 | /Users/jak/substrate/063-login/docs/domains/domain-map.md | Reverse `_platform/auth` edges to consumer→provider direction | Current direction violates domain dependency policy |
| 2 | /Users/jak/substrate/063-login/docs/plans/063-login/tasks/phase-1-core-auth-infrastructure/execution.log.md | Add concrete evidence for T003-T009 and record `pnpm build`/`just fft` outcomes | Current evidence trail is incomplete and inconsistent with task completion |
| 3 | /Users/jak/substrate/063-login/test/unit/web/features/063-login/lib/allowed-users.test.ts | Add `R-TEST-002` Test Doc comments and naming compliance | Required project rule violation (HIGH) |
| 4 | /Users/jak/substrate/063-login/apps/web/app/login/page.tsx | Implement denied username message for AC14 | Spec AC14 not currently met |

### Domain Artifacts to Update (if any)

| File (absolute path) | What's Missing |
|---------------------|----------------|
| /Users/jak/substrate/063-login/docs/domains/domain-map.md | Correct auth edge direction and labels |
| /Users/jak/substrate/063-login/docs/domains/_platform/auth/domain.md | Sync route protection file path (`proxy.ts` vs `middleware.ts`) + add SessionProvider concept |
| /Users/jak/substrate/063-login/docs/plans/063-login/login-plan.md | Complete Domain Manifest mapping for changed files |

### Next Step

/plan-6-v2-implement-phase --plan /Users/jak/substrate/063-login/docs/plans/063-login/login-plan.md --phase "Phase 1: Core Auth Infrastructure"
