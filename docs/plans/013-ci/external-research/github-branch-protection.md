# GitHub Branch Protection and Required Status Checks Configuration

**Research Date**: 2026-01-27
**Source**: Perplexity Deep Research

## Executive Summary

The most robust approach to handling CI jobs with branch protection involves creating an aggregating "gate" job that depends on all other jobs and reporting a single, stable check to the branch protection system. This eliminates the need to track and update a long list of job-specific check names.

---

## 1. Best Practice for Job Naming

### Key Principles
- Use **static job names** that don't change based on matrix variables
- The `jobs.<job_id>.name` field is what appears in GitHub UI
- Avoid dynamic names like `"Python ${{ matrix.python-version }}"` for required checks

### Recommended Approach
```yaml
jobs:
  lint:
    name: Lint           # Static, clear name
    runs-on: ubuntu-latest
    # ...

  test:
    name: Test Suite     # Static name even with matrix
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [18, 20]
    # ...

  ci-result:
    name: CI Result      # Single aggregating job
    # ...
```

---

## 2. Granular Jobs vs Single Aggregate Job

### Recommendation: Use an Aggregating Gate Job

Create a final job called "CI Result" that depends on all other jobs. Configure branch protection to require only this single job.

**Benefits:**
- Eliminates need to manually track and update check names
- Provides a single, stable check name
- Handles edge cases like skipped jobs and matrix variations
- Scales gracefully as workflows become more complex

### The Pattern
```yaml
jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: pnpm biome check .

  typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: pnpm turbo build
      - run: pnpm tsc --noEmit

  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: pnpm turbo build
      - run: pnpm vitest run

  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: pnpm turbo build

  ci-result:
    name: CI Result
    runs-on: ubuntu-latest
    needs: [lint, typecheck, test, build]
    if: always()
    steps:
      - uses: re-actors/alls-green@release/v1
        with:
          jobs: ${{ toJSON(needs) }}
```

---

## 3. Handling Job Dependencies

### Using `needs` for Sequential Execution
```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - run: pnpm turbo build

  test:
    needs: build          # Runs after build
    runs-on: ubuntu-latest
    steps:
      - run: pnpm vitest run

  ci-result:
    needs: [build, test]  # Aggregates all
    if: always()
    # ...
```

### The `alls-green` Action
Recommended for properly evaluating job statuses:

```yaml
- uses: re-actors/alls-green@release/v1
  with:
    jobs: ${{ toJSON(needs) }}
```

This action:
- Properly handles skipped jobs within the matrix
- Allows configuration of jobs that may fail but should not block (`allowed-failures`)
- Allows configuration of jobs that may be skipped (`allowed-skips`)
- Correctly evaluates transitive dependencies

---

## 4. Programmatic Configuration

### GitHub CLI
```bash
# List current branch protection
gh api repos/{owner}/{repo}/branches/main/protection

# Note: gh CLI doesn't have a direct command for creating branch protection
# Use the REST API instead
```

### REST API
```bash
curl -L \
  -X PUT \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer <YOUR-TOKEN>" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  https://api.github.com/repos/OWNER/REPO/branches/main/protection \
  -d '{
    "required_status_checks": {
      "strict": true,
      "contexts": ["CI Result"]
    },
    "enforce_admins": true,
    "required_pull_request_reviews": {
      "required_approving_review_count": 1
    },
    "restrictions": null
  }'
```

### Terraform
```hcl
resource "github_branch_protection" "main" {
  repository_id            = github_repository.example.node_id
  pattern                  = "main"
  enforce_admins           = true

  required_status_checks {
    strict   = true
    contexts = ["CI Result"]
  }

  required_pull_request_reviews {
    required_approving_review_count = 1
  }
}
```

---

## 5. Strict vs Loose Status Check Mode

### Strict Mode (Default, Recommended)
- Branch must be up to date with base branch before merging
- Re-runs checks after other PRs merge
- Ensures every merged PR is validated against latest code
- **Trade-off**: More CI runs, longer wait times

### Loose Mode
- Allows merge even if not up to date with base branch
- Faster merging, fewer CI runs
- **Risk**: Incompatible changes may not be caught

### Recommendation
Use **strict mode** for most projects. The additional guarantees about code quality are worth the increased compute costs.

---

## 6. Handling Skipped Jobs

### The Problem
When a job is skipped due to path filtering or conditionals, it may not report a status, blocking the PR.

### Solutions

**Option 1: Use `if: always()` on gate job**
```yaml
ci-result:
  needs: [lint, test, build]
  if: always()
  # ...
```

**Option 2: Use `alls-green` with `allowed-skips`**
```yaml
- uses: re-actors/alls-green@release/v1
  with:
    jobs: ${{ toJSON(needs) }}
    allowed-skips: deploy
```

**Option 3: Use job-level conditionals instead of workflow-level path filtering**
- Workflow-level path filtering causes checks to never report
- Job-level `if` conditions report success when skipped

---

## 7. Integration with Merge Queues

### Critical Requirement
Workflows must include `merge_group` event trigger:

```yaml
on:
  pull_request:
  merge_group:       # Required for merge queue
```

Without this, checks won't run when PR enters the merge queue.

---

## 8. Common Pitfalls

| Pitfall | Solution |
|---------|----------|
| Jobs not appearing in dropdown | Ensure workflow has run at least once on target branch |
| Renamed jobs breaking rules | Update branch protection rules when renaming |
| Dynamic job names | Use static names for required checks |
| Skipped jobs blocking merge | Use gate job with `if: always()` |
| Matrix jobs creating many checks | Use aggregating gate job |
| Checks pending forever | Ensure workflow triggers on correct events |

---

## 9. Fork PRs and Dependabot

### Fork PRs
- Fork PRs have limited permissions
- Use `pull_request_target` for workflows needing write access
- Be careful with security implications

### Dependabot PRs
- Dependabot PRs trigger on `pull_request`
- May need separate workflow for auto-merge:
```yaml
on:
  pull_request:
    types: [opened, synchronize]

permissions:
  contents: write
  pull-requests: write
```

---

## 10. Complete Recommended Workflow

```yaml
name: CI

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]
  merge_group:

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  lint:
    name: Lint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: '.nvmrc'
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm biome check .

  typecheck:
    name: Type Check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: '.nvmrc'
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm turbo build
      - run: pnpm tsc --noEmit

  test:
    name: Test
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: '.nvmrc'
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm turbo build
      - run: pnpm vitest run --coverage
      - uses: davelosert/vitest-coverage-report-action@v2
        if: always() && github.event_name == 'pull_request'

  build:
    name: Build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: '.nvmrc'
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm turbo build

  ci-result:
    name: CI Result
    runs-on: ubuntu-latest
    needs: [lint, typecheck, test, build]
    if: always()
    steps:
      - uses: re-actors/alls-green@release/v1
        with:
          jobs: ${{ toJSON(needs) }}
```

### Branch Protection Configuration
Configure branch protection to require only **"CI Result"** as a required check.

---

## Citations

- [GitHub Branch Protection Docs](https://docs.github.com/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
- [alls-green Action](https://github.com/marketplace/actions/alls-green)
- [Terraform GitHub Provider](https://registry.terraform.io/providers/integrations/github/latest/docs/resources/branch_protection)
- [GitHub REST API - Branch Protection](https://docs.github.com/rest/branches/branch-protection)
- [Turborepo GitHub Actions Guide](https://turborepo.dev/docs/guides/ci-vendors/github-actions)
