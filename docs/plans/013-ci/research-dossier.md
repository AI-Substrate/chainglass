# Research Report: GitHub Actions CI Pipeline

**Generated**: 2026-01-27
**Research Query**: "we need CI with github actions. CI will run on PR, and also on pull to main. We need to report test coverage etc and fails as a first class concept in github UI. we will need just build and the features from just fft in there too."
**Mode**: Plan-Associated
**Location**: `docs/plans/013-ci/research-dossier.md`
**FlowSpace**: Not Available
**Findings**: 70+ from 7 subagents

## Executive Summary

### What It Does
This project requires a GitHub Actions CI pipeline to automate quality checks on pull requests and pushes to main, ensuring code quality through linting, formatting verification, type checking, testing with coverage reporting, and building all packages.

### Business Purpose
Prevent regressions from reaching production by enforcing quality gates at merge time. Surface test failures and coverage metrics directly in GitHub's UI (PR checks, annotations, coverage comments) to enable fast feedback loops.

### Key Insights
1. **No existing CI configuration** - `.github/` directory is empty; this is a greenfield CI implementation
2. **Turbo caching is critical** - Build times can be reduced 70-80% with proper caching strategy
3. **Sequential test execution required** - `fileParallelism: false` prevents MCP test resource contention
4. **Coverage thresholds enforced** - 80% minimum across statements/branches/functions/lines (currently scoped to hooks)

### Quick Stats
- **Packages**: 5 (web, cli, shared, workflow, mcp-server)
- **Test Files**: 135 (1942 tests, 19 skipped)
- **Quality Commands**: `just fft` (lint + format + test), `just check` (lint + typecheck + test)
- **Node Requirement**: >=20.19.0 (enforced via engine-strict)
- **Package Manager**: pnpm@9.15.4 (enforced via packageManager field)
- **Coverage Provider**: v8 with lcov output (GitHub-compatible)

## How It Currently Works

### Entry Points (Quality Commands)

| Command | What It Runs | Exit Behavior | CI Suitability |
|---------|-------------|---------------|----------------|
| `just lint` | `pnpm biome check .` | 0=pass, 1=fail | Direct use |
| `just format` | `pnpm biome format --write .` | Modifies files | Use check mode |
| `just typecheck` | `pnpm tsc --noEmit` | 0=pass, 1=fail | Direct use |
| `just test` | `pnpm vitest run` | 0=pass, 1=fail | Direct use |
| `just build` | `pnpm turbo build` | 0=pass, 1=fail | Direct use |
| `just fft` | lint -> format -> test | Sequential | Separate for CI |
| `just check` | lint -> typecheck -> test | Sequential | Separate for CI |

### Build Dependency Graph

```
packages/shared (foundation)
    |
    +---> packages/workflow
    |         |
    +---> packages/mcp-server
    |         |
    +---> apps/web
    |         |
    +-------->+---> apps/cli (bundles all)
```

**Turbo Configuration** (`turbo.json`):
- `build`: `dependsOn: ["^build"]`, outputs: `dist/**`, `.next/**`
- `test`: `dependsOn: ["^build"]` - tests require built dependencies
- `typecheck`: `dependsOn: ["^build"]` - type checking needs built types
- `lint`: No dependencies, can run in parallel

### Coverage Configuration

```typescript
// vitest.config.ts (lines 36-47)
coverage: {
  provider: 'v8',
  reporter: ['text', 'html', 'lcov'],  // lcov = GitHub-compatible
  include: ['apps/web/src/hooks/**/*.ts', 'apps/web/src/hooks/**/*.tsx'],
  thresholds: {
    statements: 80,
    branches: 80,
    functions: 80,
    lines: 80,
  },
}
```

## Architecture & Design

### CI Pipeline Structure (Recommended)

```yaml
# Workflow triggers
on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

# Job structure
jobs:
  quality:       # Parallel: lint, typecheck, format-check
  build:         # Sequential after quality
  test:          # Sequential after build, with coverage
```

### GitHub UI Integration Points

| Feature | GitHub Mechanism | Implementation |
|---------|-----------------|----------------|
| PR Status Checks | `jobs.<id>.name` | Required checks in branch protection |
| Test Annotations | `vitest-github-reporter` or SARIF | Inline failure comments |
| Coverage Comments | `coverage-comment` action | PR comment with diff |
| Coverage Badge | `gist` + `shields.io` | README badge |
| Failure Details | Job logs + annotations | GitHub Actions UI |

### Design Patterns Identified

1. **Justfile as Interface** - All quality commands wrapped in justfile for local/CI parity
2. **Turbo for Orchestration** - Handles build order, caching, parallelization
3. **Biome for Linting/Formatting** - Single tool replaces ESLint + Prettier
4. **V8 Coverage Provider** - Native instrumentation, lcov output for tooling
5. **Contract Testing** - Fakes and real implementations tested against same contracts

## Dependencies & Integration

### Runtime Dependencies for CI

| Dependency | Version | Source | Purpose |
|------------|---------|--------|---------|
| Node.js | >=20.19.0 | .nvmrc, package.json | Runtime |
| pnpm | 9.15.4 | packageManager field | Package manager |
| Turbo | ^2.3.3 | devDependency | Build orchestration |
| Vitest | ^3.2.4 | devDependency | Test runner |
| Biome | ^1.9.4 | devDependency | Lint/format |
| TypeScript | ^5.7.3 | devDependency | Type checking |

### GitHub Actions Requirements

| Action | Purpose | Version Recommendation |
|--------|---------|----------------------|
| `actions/checkout@v4` | Clone repository | Latest v4 |
| `actions/setup-node@v4` | Install Node.js | Latest v4 |
| `pnpm/action-setup@v4` | Install pnpm | Latest v4 |
| `actions/cache@v4` | Cache dependencies | Latest v4 |
| `turbo` Caching | Remote cache (optional) | TURBO_TOKEN + TURBO_TEAM |

### Caching Strategy

```yaml
# pnpm store cache (primary)
- uses: actions/cache@v4
  with:
    path: ~/.local/share/pnpm/store
    key: pnpm-store-${{ hashFiles('pnpm-lock.yaml') }}
    restore-keys: pnpm-store-

# Turbo local cache (secondary)
- uses: actions/cache@v4
  with:
    path: .turbo
    key: turbo-${{ github.sha }}
    restore-keys: turbo-
```

## Quality & Testing

### Current Test Distribution

| Category | Files | Purpose |
|----------|-------|---------|
| Unit | 105 | Isolated component testing |
| Integration | 16 | Cross-component interactions |
| Contract | 13 | Fake/real implementation parity |
| UI | 1 | React component visual testing |

### Test Execution Characteristics

- **Sequential execution**: `fileParallelism: false` (MCP compatibility)
- **Estimated runtime**: 2-5 minutes based on 1942 tests
- **Environment**: Node (default), jsdom (React components)
- **Skip conditions**: `SKIP_INTEGRATION_TESTS=true` for external CLI dependencies

### Coverage Reporting for GitHub

```yaml
# Generate coverage during test
- run: pnpm vitest run --coverage

# Upload lcov report for processing
- uses: actions/upload-artifact@v4
  with:
    name: coverage-report
    path: coverage/lcov.info

# Comment on PR with coverage
- uses: davelosert/vitest-coverage-report-action@v2
```

## Prior Learnings (From Previous Implementations)

### PL-01: Shared Package Must Build First
**Source**: `docs/plans/001-project-setup/implementation-discoveries.md`
**Type**: gotcha

**What They Found**:
> If Phase 3 starts before Phase 2 is complete, `workspace:*` imports fail.

**Action for CI**: Ensure `pnpm turbo build` runs before tests/typecheck. Turbo's `dependsOn: ["^build"]` handles this automatically.

---

### PL-02: Node.js Version Enforcement Critical
**Source**: `docs/plans/009-nextjs-upgrade/execution.log.md`
**Type**: unexpected-behavior

**What They Found**:
> Without enforcement, developers on Node 18 encounter cryptic build errors.

**Action for CI**: Use `actions/setup-node@v4` with `node-version-file: '.nvmrc'` to enforce version.

---

### PL-03: Vitest Paths Require Absolute Resolution
**Source**: `docs/plans/001-project-setup/execution.log.md`
**Type**: workaround

**What They Found**:
> Relative paths in vitest.config.ts don't work when vitest runs from project root.

**Action for CI**: Already fixed with `import.meta.dirname`. No CI action needed.

---

### PL-04: Turbopack Bundle Analyzer Incompatible
**Source**: `docs/plans/009-nextjs-upgrade/execution.log.md`
**Type**: decision

**What They Found**:
> @next/bundle-analyzer uses webpack internals, incompatible with Turbopack.

**Action for CI**: Don't add bundle analysis to CI pipeline. Use manual verification if needed.

---

### PL-05: Pre-existing Test Failures
**Source**: `docs/plans/009-nextjs-upgrade/execution.log.md`
**Type**: insight

**What They Found**:
> 11 failing tests related to CLI/MCP are pre-existing and require apps/cli/dist/cli.cjs to exist.

**Action for CI**: Run `just build` before `just test` to ensure CLI binary exists. Current state: 1942 passing, 19 skipped (all clean).

## Critical Discoveries

### Critical Finding 01: No Existing CI Configuration
**Impact**: Critical
**What**: The `.github/` directory is empty - this is a greenfield implementation
**Required Action**: Create `.github/workflows/ci.yml` from scratch

### Critical Finding 02: Format Check vs Format Write
**Impact**: High
**What**: `just format` uses `--write` flag which modifies files
**Required Action**: Use `pnpm biome check .` in CI (includes format checking without modification)

### Critical Finding 03: Test Execution Order
**Impact**: High
**What**: Tests depend on built packages (`dependsOn: ["^build"]` in turbo.json)
**Required Action**: Run `pnpm turbo build` before `pnpm vitest run`

### Critical Finding 04: Coverage Threshold Enforcement
**Impact**: Medium
**What**: 80% thresholds are configured but only for `apps/web/src/hooks/**`
**Required Action**: CI should fail if coverage drops below thresholds; consider expanding scope

## Modification Considerations

### Safe to Implement
1. **GitHub Actions workflow file** - New file, no existing config
2. **Coverage reporting integration** - lcov format already configured
3. **Caching strategy** - Standard pnpm + Turbo patterns

### Consider Carefully
1. **Parallel job execution** - Lint can run parallel, but test/build need ordering
2. **Coverage threshold expansion** - Currently only hooks; expanding may surface gaps
3. **Remote caching** - Requires TURBO_TOKEN secret management

### Avoid
1. **Changing vitest parallelism** - `fileParallelism: false` is intentional for MCP tests
2. **Skipping build step** - Tests depend on built artifacts
3. **Modifying engine requirements** - Node 20.19.0 is a hard requirement

## External Research Opportunities

### Research Opportunity 1: GitHub Actions pnpm Monorepo Caching 2024

**Why Needed**: Optimal caching strategy for pnpm + Turbo in GitHub Actions has evolved
**Impact on Plan**: Build time optimization (70-80% reduction possible)
**Source Findings**: DC-09, DE-02

**Ready-to-use prompt:**
```
/deepresearch "GitHub Actions CI caching best practices for pnpm monorepo with Turborepo 2024-2025.

Context: Next.js 16 + TypeScript monorepo with 5 packages, using pnpm 9.15.4, Turbo 2.3.3, Node 20.19+.

Questions:
1. What's the optimal cache key strategy for pnpm store + Turbo local cache?
2. Should we use Turbo remote caching, and how does it compare to GitHub Actions cache?
3. How to structure workflow for parallel jobs with shared cache?
4. Best practices for cache invalidation on dependency updates?"
```

### Research Opportunity 2: Vitest Coverage GitHub Integration

**Why Needed**: Best current options for displaying coverage in GitHub UI
**Impact on Plan**: Test failure visibility and coverage reporting
**Source Findings**: QT-02, IC-09

**Ready-to-use prompt:**
```
/deepresearch "Vitest test coverage integration with GitHub Actions UI 2024-2025.

Context: Vitest 3.2.4 with v8 coverage provider, lcov output format, 80% thresholds enforced.

Questions:
1. Best GitHub Action for Vitest coverage comments on PRs?
2. How to show test failure annotations inline in PR diff view?
3. Options for coverage badge generation (gist vs codecov vs other)?
4. How to fail PR check if coverage drops below threshold?"
```

### Research Opportunity 3: GitHub Actions Required Status Checks

**Why Needed**: Configure branch protection to require CI passing
**Impact on Plan**: Enforcement of quality gates before merge
**Source Findings**: IC-01, DE-01

**Ready-to-use prompt:**
```
/deepresearch "GitHub branch protection required status checks configuration 2024.

Context: Monorepo with multiple CI jobs (lint, typecheck, test, build). Want to require all checks pass before merge to main.

Questions:
1. Best practice for naming jobs to appear clearly in GitHub UI?
2. Should we use a single 'CI' job or multiple granular jobs for required checks?
3. How to handle matrix builds with required checks?
4. How to configure branch protection rules via API or terraform?"
```

## Recommended CI Workflow Structure

```yaml
name: CI

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: '.nvmrc'
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm biome check .

  typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: '.nvmrc'
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm turbo build  # Build dependencies first
      - run: pnpm tsc --noEmit

  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: '.nvmrc'
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm turbo build  # Build dependencies first
      - run: pnpm vitest run --coverage
      - uses: actions/upload-artifact@v4
        with:
          name: coverage
          path: coverage/

  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: '.nvmrc'
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm turbo build
```

## If Extending This CI
1. Add coverage comment action for PR feedback
2. Add Turbo remote caching for faster builds
3. Add matrix testing for multiple Node versions
4. Add deployment job for main branch pushes

## If Refactoring Build System
1. Consider expanding coverage scope beyond hooks
2. Evaluate enabling file parallelism with test isolation
3. Add bundle size tracking for web app

## Next Steps

1. Run `/deepresearch` prompts above for external best practices (optional)
2. Run `/plan-1b-specify` to create feature specification
3. Run `/plan-3-architect` to create implementation plan

---

**Research Complete**: 2026-01-27
**Report Location**: `docs/plans/013-ci/research-dossier.md`
