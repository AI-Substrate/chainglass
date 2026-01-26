# GitHub Actions CI Pipeline Implementation Plan

**Mode**: Simple
**Plan Version**: 1.0.0
**Created**: 2026-01-27
**Spec**: [./ci-spec.md](./ci-spec.md)
**Status**: READY

## Table of Contents
1. [Executive Summary](#executive-summary)
2. [Critical Research Findings](#critical-research-findings)
3. [Implementation](#implementation)
4. [Change Footnotes Ledger](#change-footnotes-ledger)

## Executive Summary

**Problem**: The repository has no CI pipeline. Code changes can be merged without automated quality validation, risking regressions and inconsistent code quality.

**Solution**: Create a GitHub Actions CI workflow that runs lint, typecheck, test (with coverage), and build jobs on every PR and push to main. Use a gate job pattern for single required check in branch protection.

**Approach**:
- Create workflow file with parallel jobs where possible
- Update vitest config for coverage reporting format
- Validate via PR-based iteration (push, observe, fix, repeat)
- Document CI for contributors

**Expected outcome**: All PRs are validated before merge with fast feedback (<5 min), coverage visibility, and reliable quality gates.

## Critical Research Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | Critical | Test parallelism must stay disabled (`fileParallelism: false`) | Never modify this setting; MCP tests spawn 20+ processes |
| 02 | Critical | Build must run before test/typecheck per turbo.json dependencies | Run `pnpm turbo build` before test jobs |
| 03 | High | Node 20.19.0 is hard requirement (.nvmrc, package.json engines) | Use `node-version-file: '.nvmrc'` in setup-node |
| 04 | High | YAML syntax parsing stricter than local validators | Validate workflow in GitHub UI before relying on it |
| 05 | High | Fork PRs can't receive coverage comments (permission issue) | Document limitation; coverage shows in logs for forks |
| 06 | High | pnpm cache must use store, not node_modules | Use `cache: 'pnpm'` in setup-node action |
| 07 | Medium | Coverage action needs `pull-requests: write` permission | Add explicit permissions block to test job |
| 08 | Medium | Gate job pattern recommended for branch protection | Use `re-actors/alls-green@release/v1` as single required check |
| 09 | Medium | Vitest needs json-summary and json reporters for coverage action | Add reporters to vitest.config.ts coverage settings |
| 10 | Medium | Concurrency groups needed for PR cancellation | Add `concurrency` block with `cancel-in-progress: true` |
| 11 | Low | Turbo cache (.turbo/) can speed up subsequent runs | Use cache action with SHA-based key |
| 12 | Low | Path filters can skip CI for docs-only changes | Optional optimization for later |

## Implementation

**Objective**: Implement complete CI pipeline with quality gates, coverage reporting, and documentation.

**Testing Approach**: Manual Only (validate via actual GitHub Actions runs)
**Mock Usage**: N/A (no automated tests for this feature)

### Tasks

| Status | ID | Task | CS | Type | Dependencies | Absolute Path(s) | Validation | Notes |
|--------|-----|------|----|------|--------------|------------------|------------|-------|
| [ ] | T001 | Update vitest.config.ts with coverage reporters | 1 | Config | -- | `/home/jak/substrate/013-ci/vitest.config.ts` | `just test` runs without error; coverage/ contains json files | Add json-summary, json to reporter array |
| [ ] | T002 | Create .github/workflows directory | 1 | Setup | -- | `/home/jak/substrate/013-ci/.github/workflows/` | Directory exists | Created implicitly with ci.yml |
| [ ] | T003 | Create CI workflow file with lint job | 2 | Core | T001 | `/home/jak/substrate/013-ci/.github/workflows/ci.yml` | Workflow appears in GitHub Actions tab | Includes triggers, concurrency, setup steps |
| [ ] | T004 | Add build job to workflow | 2 | Core | T003 | `/home/jak/substrate/013-ci/.github/workflows/ci.yml` | Build job runs `pnpm turbo build` successfully | All 5 packages build |
| [ ] | T005 | Add typecheck job to workflow | 1 | Core | T004 | `/home/jak/substrate/013-ci/.github/workflows/ci.yml` | Typecheck job runs after build | Depends on build job |
| [ ] | T006 | Add test job with coverage | 2 | Core | T004 | `/home/jak/substrate/013-ci/.github/workflows/ci.yml` | Tests pass; coverage comment appears on PR | Requires pull-requests: write |
| [ ] | T007 | Add gate job using alls-green | 2 | Core | T006 | `/home/jak/substrate/013-ci/.github/workflows/ci.yml` | Gate job reports success when all jobs pass | Uses re-actors/alls-green action |
| [ ] | T008 | Create PR on 013-ci branch to test workflow | 1 | Validation | T007 | N/A | All CI jobs run and pass | Iterate if failures |
| [ ] | T009 | Verify coverage comment appears on PR | 1 | Validation | T008 | N/A | Coverage summary visible in PR comments | Check file-coverage-mode works |
| [ ] | T010 | Verify concurrent PR cancellation works | 1 | Validation | T008 | N/A | Old runs cancelled when new commits pushed | Observe in Actions tab |
| [ ] | T011 | Create docs/how/ci.md documentation | 2 | Docs | T009 | `/home/jak/substrate/013-ci/docs/how/ci.md` | File exists with complete content | Covers jobs, branch protection, troubleshooting |
| [ ] | T012 | Document branch protection setup in ci.md | 1 | Docs | T011 | `/home/jak/substrate/013-ci/docs/how/ci.md` | Instructions for configuring "CI Result" as required check | Admin reference section |

### Acceptance Criteria

- [ ] AC-1: CI triggers on PR to main and push to main
- [ ] AC-2: Lint job fails PR when biome reports errors
- [ ] AC-3: Typecheck job fails when TypeScript errors exist
- [ ] AC-4: Test job fails when vitest tests fail
- [ ] AC-5: Build job validates all 5 packages build successfully
- [ ] AC-6: Coverage comment appears on PRs showing percentages
- [ ] AC-7: CI fails when coverage drops below 80% threshold
- [ ] AC-8: Single "CI Result" check can be configured for branch protection
- [ ] AC-9: New commits cancel previous workflow runs on same PR
- [ ] AC-10: pnpm cache hits on subsequent runs (check logs)
- [ ] AC-11: Documentation exists at docs/how/ci.md

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Workflow syntax errors on first run | High | Low | Iterate via PR; errors visible in Actions tab |
| Coverage action permission denied | Medium | Low | Explicit `permissions: pull-requests: write` |
| Fork PRs don't get coverage comments | Medium | Low | Document limitation; coverage in logs |
| CI exceeds 10 min runtime | Low | Medium | Caching strategy; can optimize later |
| Branch protection blocks merges if CI breaks | Low | High | Don't enable required checks until CI stable |

### Workflow Structure

```
┌─────────────────────────────────────────────────────────────┐
│                         CI Workflow                         │
├─────────────────────────────────────────────────────────────┤
│  Triggers: push(main), pull_request(main)                   │
│  Concurrency: cancel-in-progress per PR                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌────────────────────────────────────────────────────┐     │
│  │  All jobs: checkout + pnpm setup + node setup      │     │
│  │            + pnpm install --frozen-lockfile        │     │
│  └────────────────────────────────────────────────────┘     │
│                                                             │
│  ┌─────────┐    ┌─────────┐                                 │
│  │  lint   │    │  build  │  (parallel start)               │
│  └────┬────┘    └────┬────┘                                 │
│       │              │                                      │
│       │         ┌────┴────────────────┐                     │
│       │         │                     │                     │
│       │    ┌────▼─────┐    ┌──────────▼─────┐               │
│       │    │typecheck │    │  test+coverage │               │
│       │    └────┬─────┘    └──────────┬─────┘               │
│       │         │                     │                     │
│       └─────────┼─────────────────────┘                     │
│                 │                                           │
│            ┌────▼────┐                                      │
│            │  gate   │  (alls-green aggregator)             │
│            │CI Result│                                      │
│            └─────────┘                                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### File Modification Order

1. **T001**: `vitest.config.ts` - Add json reporters (prerequisite for coverage action)
2. **T002-T007**: `.github/workflows/ci.yml` - Build workflow incrementally
3. **T008-T010**: Validation via PR iteration
4. **T011-T012**: `docs/how/ci.md` - Document after CI is working

### Key Implementation Details

**vitest.config.ts change** (T001):
```typescript
// Line 38: Add json-summary and json reporters
reporter: ['text', 'html', 'lcov', 'json-summary', 'json'],
```

**Workflow triggers and concurrency** (T003):
```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

concurrency:
  group: ${{ github.workflow }}-${{ github.head_ref || github.run_id }}
  cancel-in-progress: true
```

**Common setup steps** (all jobs):
```yaml
steps:
  - uses: actions/checkout@v4
  - uses: pnpm/action-setup@v4
  - uses: actions/setup-node@v4
    with:
      node-version-file: '.nvmrc'
      cache: 'pnpm'
  - run: pnpm install --frozen-lockfile
```

**Gate job pattern** (T007):
```yaml
gate:
  name: CI Result
  runs-on: ubuntu-latest
  needs: [lint, typecheck, test, build]
  if: always()
  steps:
    - uses: re-actors/alls-green@release/v1
      with:
        jobs: ${{ toJSON(needs) }}
```

## Change Footnotes Ledger

[^1]: [To be added during implementation via plan-6a]
[^2]: [To be added during implementation via plan-6a]

---

**Next steps:**
- **Ready to implement**: `/plan-6-implement-phase --plan "docs/plans/013-ci/ci-plan.md"`
- **Optional validation**: `/plan-4-complete-the-plan` (recommended for CS-3+ tasks)
