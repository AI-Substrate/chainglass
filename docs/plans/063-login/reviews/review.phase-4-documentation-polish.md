# Code Review: Phase 4: Documentation & Polish

**Plan**: /Users/jak/substrate/063-login/docs/plans/063-login/login-plan.md
**Spec**: /Users/jak/substrate/063-login/docs/plans/063-login/login-spec.md
**Phase**: Phase 4: Documentation & Polish
**Date**: 2026-03-03
**Reviewer**: Automated (plan-7-v2)
**Testing Approach**: Hybrid

## A) Verdict

**REQUEST_CHANGES**

High-severity documentation guidance can create an invalid `AUTH_SECRET`, and domain/testing evidence artifacts are not fully current for this phase.

**Key failure areas**:
- **Implementation**: README setup uses command substitution syntax inside `.env.local`, which would often be copied literally.
- **Domain compliance**: Domain manifest and domain-map are stale relative to Phase 4 changes and current auth contracts.
- **Testing**: Phase 4 marks E2E verification complete without re-running runtime flow in this phase.

## B) Summary

Phase 4 changes are scoped correctly to documentation/polish artifacts and introduce no runtime code regressions. However, one high-severity setup instruction in `README.md` can lead to a broken or predictable `AUTH_SECRET` configuration. Domain traceability is partially out of date: changed planning/docs files are not fully represented in the plan manifest, and auth contracts in `domain-map.md` lag behind `domain.md`. Testing evidence is partially indirect because key OAuth/logout checks were not re-executed in this phase with a running app.

## C) Checklist

**Testing Approach: Hybrid**

Hybrid (Manual + Lightweight for this phase):
- [x] Documentation validation steps are recorded
- [ ] Runtime manual E2E flow was re-executed during this phase
- [ ] Claims include reproducible command/output artifacts

Universal (all approaches):
- [x] Only in-scope files changed
- [ ] Linters/type checks clean (not evidenced in phase artifacts)
- [ ] Domain compliance checks pass

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | HIGH | /Users/jak/substrate/063-login/README.md:39-43 | security | `.env.local` example uses `AUTH_SECRET=$(openssl rand -base64 32)`, which dotenv does not execute. | Replace with placeholder value and separate shell command to generate/paste a random secret. |
| F002 | MEDIUM | /Users/jak/substrate/063-login/docs/plans/063-login/tasks/phase-4-documentation-polish/execution.log.md:31-45 | testing | Phase 4 E2E is marked complete but runtime flow was not re-run with dev server. | Re-run unauthenticated/login/denied/logout flow in Phase 4 and record observed outcomes. |
| F003 | MEDIUM | /Users/jak/substrate/063-login/docs/plans/063-login/login-plan.md:22-50 | domain | Domain Manifest omits multiple changed docs/planning artifacts from this phase. | Add explicit manifest rows (or a convention row) for README/plan/tasks artifacts. |
| F004 | MEDIUM | /Users/jak/substrate/063-login/docs/domains/domain-map.md:23,102 | domain | Auth node and health summary do not include `requireAuth()`/`useAuth()`; dependency labeling is out of sync for `_platform/sdk` consuming `signOut()`. | Update auth node contracts/summary and add/correct labeled `_platform/sdk -> _platform/auth` edge (or align domain docs). |
| F005 | MEDIUM | /Users/jak/substrate/063-login/docs/domains/_platform/auth/domain.md:30 | pattern | Boundary text says SessionProvider integration is in `providers.tsx`, conflicting with layout-level provider pattern documented later. | Update boundary text to reflect `auth-provider.tsx` and layout-level provider placement. |
| F006 | LOW | /Users/jak/substrate/063-login/docs/plans/063-login/tasks/phase-4-documentation-polish/execution.log.md:38 | correctness | Execution log states 57 `requireAuth()` calls across 5 action files; current count is 52. | Correct the documented count to the verified current value. |
| F007 | LOW | /Users/jak/substrate/063-login/docs/plans/063-login/tasks/phase-4-documentation-polish/execution.log.md:34 | evidence | "All 4764 tests pass" has no command transcript or attached output in phase evidence. | Add the exact command and summarized output (or link to captured log) in execution evidence. |

## E) Detailed Findings

### E.1) Implementation Quality

- **F001 (HIGH, security)**: README setup currently encourages a common copy/paste failure mode where the `AUTH_SECRET` value becomes a literal string. This can break auth or create predictable secrets.
- **F005 (MEDIUM, pattern)**: Domain boundary wording is inconsistent with the actual provider architecture and the same file’s later notes.
- **F006 (LOW, correctness)**: Numeric implementation evidence (`requireAuth()` count) is inconsistent with current source state.

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ✅ | No new runtime source files; changed files remain in expected docs/plan/domain locations. |
| Contract-only imports | ✅ | Phase is documentation-only; no cross-domain code imports introduced. |
| Dependency direction | ✅ | No implementation dependency changes introduced in this phase. |
| Domain.md updated | ✅ | History/contracts/composition/concepts were updated for Phase 3/4. |
| Registry current | ✅ | No new domain created; registry does not require an additional domain row. |
| No orphan files | ❌ | Changed files (`README.md`, `login-plan.md`, phase task artifacts) are not fully represented in Domain Manifest. |
| Map nodes current | ❌ | Auth node and health summary contracts in `domain-map.md` are stale vs current auth contracts. |
| Map edges current | ❌ | Map edge labeling is out of sync with `_platform/sdk` consuming `signOut()` per auth domain docs. |
| No circular business deps | ✅ | No new business-domain cycle introduced by these changes. |
| Concepts documented | ✅ | `§ Concepts` exists with Concept/Entry Point/Description and includes new contracts. |

Domain findings:
- **F003**: Manifest traceability gap in plan artifact mapping.
- **F004**: Domain-map contract and edge drift.

### E.3) Anti-Reinvention

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| _(none — docs/planning artifacts only)_ | None | N/A | proceed |

### E.4) Testing & Evidence

**Coverage confidence**: 62%

| AC | Confidence | Evidence |
|----|------------|----------|
| AC12 | 96 | `/Users/jak/substrate/063-login/README.md:31-50`, `/Users/jak/substrate/063-login/docs/how/auth/github-oauth-setup.md:10-87`, `/Users/jak/substrate/063-login/docs/plans/063-login/tasks/phase-4-documentation-polish/execution.log.md:10-30` |
| AC6 | 90 | `/Users/jak/substrate/063-login/README.md:44-48`, `/Users/jak/substrate/063-login/docs/how/auth/github-oauth-setup.md:47-56`, execution log allowlist checks |
| AC10 | 80 | `/Users/jak/substrate/063-login/docs/plans/063-login/tasks/phase-4-documentation-polish/execution.log.md:38`, `/Users/jak/substrate/063-login/docs/domains/_platform/auth/domain.md:51` |
| AC9 | 74 | `/Users/jak/substrate/063-login/docs/plans/063-login/tasks/phase-4-documentation-polish/execution.log.md:39-40`, `/Users/jak/substrate/063-login/docs/domains/_platform/auth/domain.md:86-87` |
| AC1 | 60 | `/Users/jak/substrate/063-login/docs/plans/063-login/tasks/phase-4-documentation-polish/execution.log.md:40-41` |
| AC14 | 58 | `/Users/jak/substrate/063-login/docs/plans/063-login/tasks/phase-4-documentation-polish/execution.log.md:42` |
| AC3 | 46 | `/Users/jak/substrate/063-login/docs/plans/063-login/tasks/phase-4-documentation-polish/execution.log.md:41` |
| AC4 | 40 | Prior-flow reference in execution log; no phase-local cookie artifact |
| AC7 | 38 | Contract/docs evidence only; no phase-local runtime capture |
| AC8 | 32 | Logout behavior not explicitly re-executed in this phase log |
| AC11 | 25 | No viewport-specific verification evidence recorded in this phase |

### E.5) Doctrine Compliance

Checked against:
- `/Users/jak/substrate/063-login/docs/project-rules/rules.md`
- `/Users/jak/substrate/063-login/docs/project-rules/idioms.md`
- `/Users/jak/substrate/063-login/docs/project-rules/architecture.md`
- `/Users/jak/substrate/063-login/docs/project-rules/constitution.md`

No material doctrine/rules violations were identified in the changed files.

## F) Coverage Map

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| AC1 | Unauthenticated users redirected to `/login` | Execution checklist + proxy matcher verification in `/Users/jak/substrate/063-login/docs/plans/063-login/tasks/phase-4-documentation-polish/execution.log.md:40-41` | 60 |
| AC2 | Animated ASCII login at smooth performance | Prior-phase verification reference only in Phase 4 log | 35 |
| AC3 | Sign in button initiates OAuth | Prior user-verified OAuth flow reference (`execution.log.md:41`) | 46 |
| AC4 | Successful OAuth sets session cookie | Prior-flow reference; no phase-local cookie capture | 40 |
| AC5 | Denied users see access-denied message | Denied-user flow reference in `/Users/jak/substrate/063-login/docs/plans/063-login/tasks/phase-4-documentation-polish/execution.log.md:42` | 55 |
| AC6 | `.chainglass/auth.yaml` controls access | README + setup guide + execution checklist allowlist evidence | 90 |
| AC7 | Logout button visible in navigation | Domain docs + prior verification reference only | 38 |
| AC8 | Logout destroys session and redirects | Not explicitly re-run in Phase 4 evidence | 32 |
| AC9 | API routes reject unauthenticated requests | Execution checklist auth-guard verification (`execution.log.md:39-40`) | 74 |
| AC10 | Server actions validate session | Execution checklist + auth domain contracts (`execution.log.md:38`) | 80 |
| AC11 | Login screen responsive across viewports | No viewport-specific Phase 4 capture | 25 |
| AC12 | OAuth setup documented (README + docs/how) | Direct documentation updates in README and setup guide | 96 |
| AC13 | Session lasts 30 days | No Phase 4 re-validation; inherited from earlier implementation | 30 |
| AC14 | Access denied shows GitHub username | Denied-user message reference in Phase 4 log (`execution.log.md:42`) | 58 |

**Overall coverage confidence**: 62%

## G) Commands Executed

```bash
git --no-pager diff --stat
git --no-pager diff --staged --stat
git --no-pager log --oneline -20
git --no-pager show --name-status --pretty=format:'%H %s' -1
git --no-pager log --oneline -5 -- README.md
git --no-pager log --oneline -5 -- docs/how/auth/github-oauth-setup.md
git --no-pager log --oneline -5 -- docs/domains/_platform/auth/domain.md
git --no-pager log --oneline -5 -- docs/plans/063-login/login-plan.md
git --no-pager log --oneline -5 -- docs/plans/063-login/tasks/phase-4-documentation-polish/tasks.md
git --no-pager log --oneline -5 -- docs/plans/063-login/tasks/phase-4-documentation-polish/execution.log.md
git --no-pager diff 6864293..HEAD > /Users/jak/substrate/063-login/docs/plans/063-login/reviews/_computed.diff
git --no-pager diff --name-status 6864293..HEAD
rg 'requireAuth\(' /Users/jak/substrate/063-login/apps/web/app/actions --glob '*.ts' --count
```

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review —
> only context on the work that was done before the review.

**Review result**: REQUEST_CHANGES

**Plan**: /Users/jak/substrate/063-login/docs/plans/063-login/login-plan.md
**Spec**: /Users/jak/substrate/063-login/docs/plans/063-login/login-spec.md
**Phase**: Phase 4: Documentation & Polish
**Tasks dossier**: /Users/jak/substrate/063-login/docs/plans/063-login/tasks/phase-4-documentation-polish/tasks.md
**Execution log**: /Users/jak/substrate/063-login/docs/plans/063-login/tasks/phase-4-documentation-polish/execution.log.md
**Review file**: /Users/jak/substrate/063-login/docs/plans/063-login/reviews/review.phase-4-documentation-polish.md

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| /Users/jak/substrate/063-login/README.md | Modified | cross-domain (docs) | Yes (F001) |
| /Users/jak/substrate/063-login/docs/domains/_platform/auth/domain.md | Modified | _platform/auth | Yes (F005) |
| /Users/jak/substrate/063-login/docs/how/auth/github-oauth-setup.md | Modified | _platform/auth | No |
| /Users/jak/substrate/063-login/docs/plans/063-login/login-plan.md | Modified | cross-domain (plan) | Yes (F003) |
| /Users/jak/substrate/063-login/docs/plans/063-login/tasks/phase-4-documentation-polish/execution.log.md | Added | _platform/auth (phase artifact) | Yes (F002, F006, F007) |
| /Users/jak/substrate/063-login/docs/plans/063-login/tasks/phase-4-documentation-polish/tasks.fltplan.md | Added | _platform/auth (phase artifact) | Yes (F003, via manifest mapping) |
| /Users/jak/substrate/063-login/docs/plans/063-login/tasks/phase-4-documentation-polish/tasks.md | Added | _platform/auth (phase artifact) | Yes (F003, via manifest mapping) |

### Required Fixes (if REQUEST_CHANGES)

| # | File (absolute path) | What To Fix | Why |
|---|---------------------|-------------|-----|
| 1 | /Users/jak/substrate/063-login/README.md | Replace `AUTH_SECRET=$(openssl rand -base64 32)` with safe placeholder + explicit generation instruction | Prevent invalid/literal secret configuration |
| 2 | /Users/jak/substrate/063-login/docs/plans/063-login/tasks/phase-4-documentation-polish/execution.log.md | Re-run and document phase-local runtime E2E flow with observed outcomes | Current evidence relies on prior phases; insufficient for Phase 4 completion |
| 3 | /Users/jak/substrate/063-login/docs/plans/063-login/login-plan.md | Add Domain Manifest mappings for changed docs/plan artifacts | Remove orphan-file domain-traceability violations |
| 4 | /Users/jak/substrate/063-login/docs/domains/domain-map.md | Sync auth contracts + dependency edge labels with current auth domain contracts | Remove domain-map drift |
| 5 | /Users/jak/substrate/063-login/docs/domains/_platform/auth/domain.md | Correct stale provider ownership text (`providers.tsx` claim) | Align boundary statement with actual layout-level provider architecture |

### Domain Artifacts to Update (if any)

| File (absolute path) | What's Missing |
|---------------------|----------------|
| /Users/jak/substrate/063-login/docs/plans/063-login/login-plan.md | Domain Manifest rows for phase-changed docs/planning artifacts |
| /Users/jak/substrate/063-login/docs/domains/domain-map.md | Auth contract labels (`requireAuth()`, `useAuth()`) and aligned labeled dependency edge(s) |
| /Users/jak/substrate/063-login/docs/domains/_platform/auth/domain.md | Boundary wording alignment for SessionProvider/AuthProvider placement |

### Next Step

/plan-6-v2-implement-phase --plan /Users/jak/substrate/063-login/docs/plans/063-login/login-plan.md --phase "Phase 4: Documentation & Polish"
Then re-run: /plan-7-v2-code-review --phase "Phase 4: Documentation & Polish" --plan /Users/jak/substrate/063-login/docs/plans/063-login/login-plan.md
