# GitHub Actions CI Caching for pnpm Monorepo with Turborepo

**Research Date**: 2026-01-27
**Source**: Perplexity Deep Research

## Executive Summary

Proper caching can reduce CI pipeline duration from 5-10 minutes to under 2 minutes through intelligent cache management across multiple layers.

---

## 1. Optimal Cache Key Strategy for pnpm Store (2024-2025 Best Practices)

### Basic Pattern
```yaml
key: ${{ runner.os }}-pnpm-store-${{ hashFiles('**/pnpm-lock.yaml') }}
restore-keys: |
  ${{ runner.os }}-pnpm-store-
```

### Key Insights
- **pnpm's content-addressable store** uses file content hashing, meaning identical package contents receive identical storage locations regardless of package name or version
- **Store path varies by platform**: Linux uses `~/.local/share/pnpm/store`, with GitHub Actions runners often using `/home/runner/setup-pnpm/node_modules/.bin/store/v3`
- **Use `pnpm store path --silent`** to get the store location at runtime
- **Fallback with restore-keys** provides balance: exact lockfile match gives instant cache hit; partial match still benefits from previously cached packages

### Important: Store Path Handling
```yaml
- name: Get pnpm store directory
  shell: bash
  run: |
    echo "STORE_PATH=$(pnpm store path --silent)" >> $GITHUB_ENV
```

---

## 2. Turborepo Local Cache (.turbo/) Caching

### Recommended Strategy
```yaml
- name: Cache Turbo outputs
  uses: actions/cache@v4
  with:
    path: .turbo
    key: ${{ runner.os }}-turbo-${{ github.sha }}
    restore-keys: |
      ${{ runner.os }}-turbo-${{ github.ref }}-
      ${{ runner.os }}-turbo-refs/heads/main-
      ${{ runner.os }}-turbo-
```

### Key Considerations
- **SHA-based caching** ensures correctness - each commit gets its own cache entry
- **Turborepo caches task outputs** (`.next/`, `dist/`, test coverage) not dependencies
- **Configure outputs in turbo.json**: `"outputs": [".next/**", "!.next/cache/**"]`
- **The `.turbo` directory** can grow to several hundred megabytes over time

---

## 3. Turbo Remote Caching vs GitHub Actions Cache

### Vercel Remote Cache
**Pros:**
- Official Turborepo integration
- Shared across all team members and CI runners
- Sophisticated cache analytics
- Simple setup (~3 minutes)

**Cons:**
- Vendor lock-in
- Potential latency downloading from external servers
- Costs for large teams

**Setup:**
```yaml
- name: Build with remote cache
  env:
    TURBO_TOKEN: ${{ secrets.TURBO_TOKEN }}
    TURBO_TEAM: ${{ vars.TURBO_TEAM }}
  run: pnpm turbo build
```

### GitHub Actions Cache
**Pros:**
- Everything stays within GitHub
- No external dependencies
- Potentially lower latency

**Cons:**
- 10GB storage limit (expandable with pay-as-you-go)
- Less sophisticated analytics
- Manual configuration required

### Recommendation
For teams already using Vercel: Use Vercel Remote Cache. For others: Start with GitHub Actions cache, consider hybrid approach for larger teams.

---

## 4. Parallel Jobs Sharing Cached Dependencies

### Build-Once-Consume-Everywhere Pattern
```yaml
jobs:
  setup:
    name: Setup Dependencies
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
          run_install: false
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile

  build:
    needs: setup
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
          run_install: false
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - name: Cache Turbo outputs
        uses: actions/cache@v4
        with:
          path: .turbo
          key: ${{ runner.os }}-turbo-${{ github.sha }}
      - run: pnpm turbo build

  test:
    needs: setup
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
          run_install: false
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - name: Restore Turbo cache
        uses: actions/cache/restore@v4
        with:
          path: .turbo
          key: ${{ runner.os }}-turbo-${{ github.sha }}
          restore-keys: |
            ${{ runner.os }}-turbo-
      - run: pnpm turbo test
```

### Key Point
Use `fail-on-cache-miss: true` for critical cache dependencies to ensure clear failure visibility.

---

## 5. Cache Invalidation Best Practices

### Primary Triggers
1. **pnpm-lock.yaml changes** - Use as hash in cache key
2. **turbo.json changes** - Turborepo handles automatically via task hash
3. **Environment variable changes** - Configure in `globalEnv` in turbo.json
4. **next.config.js changes** - Should invalidate build caches

### Cleanup Workflow for Closed PRs
```yaml
name: Cleanup caches for closed branches

on:
  pull_request:
    types: [closed]
  schedule:
    - cron: '0 0 * * 0'  # Weekly

jobs:
  cleanup:
    runs-on: ubuntu-latest
    steps:
      - name: Clean caches
        run: |
          gh extension install actions/gh-actions-cache
          REPO=${{ github.repository }}
          BRANCH="${{ github.event.pull_request.head.ref }}"
          cacheKeysForPR=$(gh actions-cache list -R $REPO -B "refs/heads/$BRANCH" | cut -f 1)
          for cacheKey in $cacheKeysForPR; do
            gh actions-cache delete $cacheKey -R $REPO -B "refs/heads/$BRANCH" --confirm
          done
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

---

## 6. pnpm Content-Addressable Store Interaction

### How It Works
- Packages are stored **once** in the global store
- Projects use **hard links** to the store, not copies
- The unified lockfile (`sharedWorkspaceLockfile: true`) means all workspaces share dependency resolution
- **public-hoist-pattern[]=\*** causes hoisting to root `node_modules` for Next.js compatibility

### GitHub Actions Implications
- Cache the store directory, not individual `node_modules`
- The store is platform-specific (can't share between Linux/Windows/macOS)
- Partial cache restoration can cause subtle failures - consider validation steps

---

## Complete Production Workflow Example

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  quality:
    name: Quality Checks
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: pnpm/action-setup@v4
        with:
          version: 9
          run_install: false

      - name: Get pnpm store directory
        shell: bash
        run: echo "STORE_PATH=$(pnpm store path --silent)" >> $GITHUB_ENV

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm

      - name: Restore Turbo cache
        uses: actions/cache@v4
        with:
          path: .turbo
          key: ${{ runner.os }}-turbo-${{ github.sha }}
          restore-keys: |
            ${{ runner.os }}-turbo-${{ github.ref_name }}-
            ${{ runner.os }}-turbo-main-
            ${{ runner.os }}-turbo-

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run checks
        run: pnpm turbo lint typecheck test build
```

---

## Pitfalls to Avoid

| Pitfall | Solution |
|---------|----------|
| **Cache bloat over time** | Implement cleanup workflows, use LRU eviction awareness |
| **Stale cache causing build failures** | Use lockfile hash in key, validate cache after restore |
| **Race conditions with parallel cache writes** | Use `concurrency` groups to serialize cache operations |
| **Incorrect restore-keys causing wrong cache hits** | Order restore-keys from most specific to least specific |
| **Store path whitespace issues** | Use `pnpm store path --silent \| tr -d '\\n'` |
| **Cross-OS cache pollution** | Include `runner.os` in all cache keys |

---

## Key Metrics to Target

- **Cache hit rate**: Target 80%+ for effective caching
- **CI duration reduction**: Expect 5-10x speedup with proper caching
- **Storage usage**: Monitor to stay within 10GB limit (or configure higher)

---

## Citations

- [pnpm CI Documentation](https://pnpm.io/continuous-integration)
- [Turborepo GitHub Actions Guide](https://turborepo.dev/docs/guides/ci-vendors/github-actions)
- [pnpm/action-setup](https://github.com/pnpm/action-setup)
- [actions/cache](https://github.com/actions/cache)
- [Vercel Remote Cache](https://vercel.com/blog/vercel-remote-cache-turbo)
- [GitHub Actions Cache Documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching)
