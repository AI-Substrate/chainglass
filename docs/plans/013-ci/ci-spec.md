# GitHub Actions CI Pipeline

**Mode**: Simple

📚 This specification incorporates findings from `research-dossier.md` and external research.

## Research Context

**Components affected:**
- `.github/workflows/` (new directory - greenfield)
- `vitest.config.ts` (minor update for coverage reporters)

**Critical dependencies:**
- Node.js >=20.19.0 (enforced via .nvmrc)
- pnpm 9.15.4 (enforced via packageManager field)
- Turbo build order: shared → workflow/mcp-server/web → cli

**Modification risks:**
- Low risk: Greenfield CI implementation, no existing config to break
- Medium risk: Coverage reporter additions require testing
- Avoid: Changing vitest parallelism (`fileParallelism: false` is intentional)

**Link:** See `research-dossier.md` for full analysis

## Summary

**WHAT**: Implement a GitHub Actions CI pipeline that runs on pull requests and pushes to main, executing the project's quality checks (lint, typecheck, test, build) and surfacing results in GitHub's native UI.

**WHY**: Enable fast feedback on code quality by blocking merges when checks fail. Surface test failures and coverage metrics directly in pull request UI to catch regressions before they reach production. Establish consistent quality gates that apply to all contributors.

## Goals

1. **Automated Quality Gates** - All code changes are validated before merge via lint, type check, test, and build steps
2. **Fast Feedback** - Developers see check results and test failures directly in GitHub's PR interface within minutes
3. **Coverage Visibility** - Test coverage metrics are visible on pull requests, with enforcement of 80% minimum threshold
4. **Merge Protection** - PRs cannot merge to main unless all quality checks pass
5. **Local/CI Parity** - CI runs the same checks available locally via `just` commands
6. **Efficient Execution** - Caching strategy minimizes CI runtime and compute costs

## Non-Goals

1. **Deployment** - This spec covers CI only, not CD (continuous deployment)
2. **Multi-environment testing** - Matrix testing across multiple Node versions or OS platforms
3. **E2E browser testing** - No Playwright or similar browser automation in CI
4. **External service integration** - No Codecov, Coveralls, or similar third-party services
5. **Bundle size tracking** - No automated bundle analysis (Turbopack incompatible)
6. **Remote caching** - Turbo remote caching (Vercel) is out of scope; use GitHub Actions cache only
7. **Merge queues** - Advanced merge queue configuration is out of scope for initial implementation

## Complexity

**Score**: CS-3 (medium)

**Breakdown**:
| Dimension | Score | Rationale |
|-----------|-------|-----------|
| Surface Area (S) | 1 | 2-3 files: workflow YAML, vitest.config.ts update |
| Integration (I) | 1 | GitHub Actions (external, stable platform) |
| Data/State (D) | 0 | No schema or state changes |
| Novelty (N) | 1 | Requirements clear, but first CI setup for this repo |
| Non-Functional (F) | 1 | Performance matters (caching), security standard |
| Testing/Rollout (T) | 1 | Integration testing via actual PR workflow |

**Total**: S(1) + I(1) + D(0) + N(1) + F(1) + T(1) = **5** → CS-3

**Confidence**: 0.85 (high confidence - comprehensive external research completed)

**Assumptions**:
- GitHub repository has Actions enabled
- Repository permissions allow workflow creation
- Branch protection can be configured after CI is working

**Dependencies**:
- GitHub Actions runner availability (ubuntu-latest)
- pnpm/action-setup@v4 action
- actions/setup-node@v4 with pnpm cache support

**Risks**:
- Initial workflow may fail on first run due to syntax/config issues
- Coverage action requires `pull-requests: write` permission
- Branch protection setup is manual (one-time configuration)

**Phases**:
1. Core CI workflow (lint, typecheck, test, build)
2. Coverage reporting integration
3. Branch protection configuration (manual, documented)

## Acceptance Criteria

### AC-1: CI Triggers on PR and Push to Main
**Given** a developer opens a pull request targeting main
**When** the PR is created or updated
**Then** the CI workflow runs automatically
**And** the same workflow runs on direct pushes to main

### AC-2: Lint Check Blocks on Failure
**Given** the CI workflow is running
**When** `pnpm biome check .` reports errors
**Then** the Lint job fails with non-zero exit code
**And** the failure is visible in GitHub PR checks UI

### AC-3: Type Check Blocks on Failure
**Given** packages have been built
**When** `pnpm tsc --noEmit` reports type errors
**Then** the Type Check job fails
**And** error details are visible in job logs

### AC-4: Test Check Blocks on Failure
**Given** packages have been built
**When** `pnpm vitest run` has failing tests
**Then** the Test job fails
**And** test failure annotations appear in GitHub UI

### AC-5: Build Check Validates All Packages
**Given** the CI workflow is running
**When** `pnpm turbo build` is executed
**Then** all 5 packages build successfully (shared, workflow, mcp-server, web, cli)
**And** build failures cause the job to fail

### AC-6: Coverage Report on Pull Requests
**Given** tests complete successfully on a pull request
**When** coverage data is generated
**Then** a coverage summary comment appears on the PR
**And** the comment shows statement/branch/function/line percentages

### AC-7: Coverage Threshold Enforcement
**Given** coverage is configured with 80% thresholds
**When** coverage drops below 80% on any metric
**Then** the test job fails
**And** the failure reason indicates coverage threshold violation

### AC-8: Single Required Check for Branch Protection
**Given** the CI workflow completes
**When** all jobs (lint, typecheck, test, build) pass
**Then** a single "CI Result" status check reports success
**And** this single check can be configured as required in branch protection

### AC-9: Concurrent PR Cancellation
**Given** a PR has a running CI workflow
**When** the PR is updated with new commits
**Then** the previous workflow run is cancelled
**And** a new workflow run starts for the latest commit

### AC-10: Dependency Caching
**Given** a CI workflow runs
**When** pnpm dependencies are installed
**Then** the pnpm store is cached for subsequent runs
**And** cache hits reduce install time on unchanged lockfile

## Risks & Assumptions

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Workflow syntax errors on first run | Medium | Low | Test locally with `act` or iterate via PRs |
| Coverage action permission denied | Medium | Low | Ensure `pull-requests: write` in job permissions |
| Cache bloat over time | Low | Low | Cache keys include lockfile hash for automatic invalidation |
| Fork PRs can't post coverage comments | Medium | Medium | Document limitation; comments appear on non-fork PRs only |
| CI takes too long (>10 min) | Low | Medium | Caching strategy targets <5 min runs |

### Assumptions

1. **GitHub Actions is enabled** for the repository
2. **ubuntu-latest runner** has sufficient resources for builds
3. **pnpm and Node versions** in CI match local development
4. **Branch protection** will be configured manually after CI is verified working
5. **Coverage scope** remains limited to `apps/web/src/hooks/**` (existing config)
6. **Sequential test execution** (`fileParallelism: false`) is required and acceptable

## Open Questions

1. **Q1**: Should coverage comments include file-level details, or just summary metrics?
   - Default: Summary only (`file-coverage-mode: changes`)

2. **Q2**: Should we enforce coverage on the entire codebase or keep current hooks-only scope?
   - Default: Keep current scope; expanding is a separate effort

3. **Q3**: Do we need Dependabot PR compatibility (auto-approve/merge)?
   - Default: Not in initial scope; add later if needed

## ADR Seeds (Optional)

### Decision Drivers
- Single required check simplifies branch protection maintenance
- GitHub Actions native (no external CI services)
- Coverage threshold enforcement via Vitest native config

### Candidate Alternatives
- **A: Granular required checks** - Require each job (lint, test, build) individually
- **B: Single gate job** - Use aggregating "CI Result" job as single required check (recommended)
- **C: External CI** - Use CircleCI, GitLab CI, or other providers

### Stakeholders
- All contributors (affected by merge requirements)
- Repository administrators (configure branch protection)

## External Research

**Incorporated:**
- `external-research/pnpm-turbo-caching.md` - Caching strategies for pnpm + Turbo
- `external-research/vitest-coverage-github.md` - Coverage reporting with GitHub UI
- `external-research/github-branch-protection.md` - Branch protection and gate job pattern

**Key Findings:**
1. Use `re-actors/alls-green@release/v1` action for aggregating job status
2. Use `davelosert/vitest-coverage-report-action@v2` for PR coverage comments
3. Add `json-summary` and `json` reporters to vitest config for coverage action
4. Use `concurrency` groups to cancel stale workflow runs
5. Cache pnpm store using `actions/setup-node@v4` with `cache: pnpm`
6. Static job names required for reliable branch protection

**Applied To:**
- Acceptance Criteria (AC-8: single required check pattern)
- Complexity assessment (research reduced novelty score)
- Risks (coverage permission requirement identified)
- Non-Goals (remote caching, merge queues deferred based on research)

---

## Documentation Strategy

**Location**: docs/how/ only

**Rationale**: CI documentation is a detailed operational guide; doesn't need to clutter main README.

**Content Plan**:
- `docs/how/ci.md` - CI pipeline overview, job descriptions, troubleshooting failed runs
- Branch protection setup instructions (one-time admin reference)
- How to interpret coverage reports

**Target Audience**: Contributors, repository administrators

**Maintenance**: Update when CI workflow structure changes significantly

---

## Testing Strategy

**Approach**: Manual Only

**Rationale**: Primary deliverables are YAML workflow files that cannot be unit tested; validation occurs by running the actual workflow on GitHub Actions.

**Verification Steps**:
1. Create PR to trigger workflow and verify all jobs run
2. Introduce intentional lint/type/test failure to verify blocking behavior
3. Verify coverage comment appears on PR
4. Verify CI Result gate job aggregates status correctly
5. Run `just fft` locally before committing to catch obvious errors

**Excluded**: No new automated tests needed; existing test suite validates vitest.config.ts changes.

---

## Clarifications

### Session 2026-01-27

**Q1: Workflow Mode**
- **Answer**: A (Simple)
- **Rationale**: Greenfield implementation with comprehensive research; straightforward path to implementation despite CS-3 rating.

**Q2: Testing Strategy**
- **Answer**: D (Manual Only)
- **Rationale**: YAML workflow files validated by actual GitHub Actions runs; no unit-testable code.

**Q3: Documentation Strategy**
- **Answer**: B (docs/how/ only)
- **Rationale**: CI guide is operational documentation; main README stays focused on project overview.

---

**Specification Complete**: 2026-01-27
**Next Step**: Run `/plan-3-architect` to generate the implementation plan.
