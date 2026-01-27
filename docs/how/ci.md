# Continuous Integration (CI)

This document describes the GitHub Actions CI pipeline for the Chainglass project.

## Overview

The CI pipeline runs automatically on:
- Pull requests targeting `main`
- Direct pushes to `main`

All jobs must pass before a PR can be merged (when branch protection is configured).

## Jobs

### Lint

Runs Biome linter to check code style and catch common issues.

```bash
pnpm biome check .
```

**Failure causes**: Formatting issues, lint errors, import organization problems.

### Build

Builds all 5 monorepo packages using Turborepo:
- `packages/shared`
- `packages/workflow`
- `packages/mcp-server`
- `apps/web`
- `apps/cli`

```bash
pnpm turbo build
```

**Failure causes**: TypeScript compilation errors, missing dependencies, import errors.

### Type Check

Runs TypeScript type checking across the entire codebase.

```bash
pnpm tsc --noEmit
```

**Depends on**: Build (packages must be built first for cross-package type resolution)

**Failure causes**: Type errors, missing type declarations, incompatible types.

### Test

Runs the Vitest test suite with coverage reporting.

```bash
pnpm vitest run --coverage
```

**Depends on**: Build (some tests require built packages)

**Features**:
- Sequential test execution (MCP tests spawn many processes)
- Coverage thresholds enforced (65% lines/statements/functions, 60% branches)
- Coverage comment posted on PRs

**Failure causes**: Test failures, coverage below threshold.

### CI Result (Gate)

Aggregates all job statuses into a single check. This is the job to configure as "required" in branch protection.

Uses [alls-green](https://github.com/re-actors/alls-green) to properly handle all job outcomes including skipped jobs.

## Caching

The pipeline uses two levels of caching:

1. **pnpm store cache**: Handled automatically by `actions/setup-node` with `cache: 'pnpm'`
2. **Turbo cache**: Stored in `.turbo/` directory, keyed by commit SHA

Cache hits significantly reduce CI runtime on subsequent runs.

## Concurrency

When you push new commits to a PR, any in-progress workflow runs are automatically cancelled. This prevents wasted compute and ensures you always see results for the latest code.

Concurrency is grouped by: `CI-<branch-name>`

## Coverage Reporting

On pull requests, a coverage comment is automatically posted showing:
- Statement coverage percentage
- Branch coverage percentage
- Function coverage percentage
- Line coverage percentage

The comment updates on each push (no duplicate comments).

**Note**: Coverage comments only appear on PRs from the same repository. Fork PRs will see coverage in the job logs but won't receive comments due to GitHub permission restrictions.

### Coverage Thresholds

The project enforces minimum coverage thresholds:
- **Statements**: 65%
- **Branches**: 60%
- **Functions**: 65%
- **Lines**: 65%

If coverage drops below these thresholds, the test job fails.

### Coverage Scope

Coverage includes all source files in the monorepo:
```
packages/shared/src/**/*.ts
packages/workflow/src/**/*.ts
packages/mcp-server/src/**/*.ts
apps/web/src/**/*.ts
apps/web/src/**/*.tsx
apps/cli/src/**/*.ts
```

## Troubleshooting

### "Lint" job fails

1. Run locally: `just lint`
2. Auto-fix: `pnpm biome check . --write`
3. Commit fixes and push

### "Build" job fails

1. Run locally: `just build`
2. Check for TypeScript errors in the failing package
3. Ensure all imports resolve correctly

### "Type Check" job fails

1. Run locally: `just typecheck`
2. Fix TypeScript errors shown in output
3. If errors reference built packages, run `just build` first

### "Test" job fails

1. Run locally: `just test`
2. If coverage failure: check which files need more tests
3. If test failure: check the specific test output

### Workflow doesn't run

- Ensure the PR targets `main` branch
- Check that the workflow file syntax is valid
- Verify GitHub Actions is enabled for the repository

### Coverage comment missing

- Only appears on PRs (not push to main)
- Fork PRs don't receive comments (GitHub limitation)
- Check that the test job has `pull-requests: write` permission

## Branch Protection Setup

To require CI to pass before merging:

1. Go to **Settings** > **Branches** > **Branch protection rules**
2. Click **Add rule** (or edit existing rule for `main`)
3. Enable **Require status checks to pass before merging**
4. Search for and select **CI Result**
5. Optionally enable **Require branches to be up to date before merging**
6. Click **Save changes**

**Why "CI Result"?** Using the aggregating gate job as the single required check means you don't need to update branch protection when adding/removing/renaming jobs.

## Local Equivalents

The CI jobs mirror local commands:

| CI Job | Local Command |
|--------|---------------|
| Lint | `just lint` |
| Build | `just build` |
| Type Check | `just typecheck` |
| Test | `just test` |
| All checks | `just check` |
| Fix + Test | `just fft` |

Always run `just fft` before pushing to catch issues locally.

## Workflow File

The workflow is defined in `.github/workflows/ci.yml`.
