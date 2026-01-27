# Vitest Test Coverage Integration with GitHub Actions UI

**Research Date**: 2026-01-27
**Source**: Perplexity Deep Research

## Executive Summary

The recommended approach for Vitest coverage integration with GitHub Actions uses `davelosert/vitest-coverage-report-action@v2` for PR comments, Vitest's built-in GitHub reporter for inline annotations, and native threshold enforcement.

---

## 1. Best GitHub Action for Coverage Comments (2024-2025)

**Recommended: `davelosert/vitest-coverage-report-action@v2`**

This is the de facto standard for Vitest coverage reporting. It:
- Parses `json-summary` and `json` coverage reports automatically
- Generates PR comments with coverage metrics
- Reads thresholds directly from Vite configuration
- Supports multiple file coverage modes: `changes`, `all`, `none`
- Automatically handles comment updating (avoids duplicates)

---

## 2. Inline Test Failure Annotations

Vitest has a **built-in GitHub Actions reporter** that automatically outputs annotations when `GITHUB_ACTIONS=true`. These include:
- File paths and line numbers
- Error messages visible in PR diff view

**Limitation**: GitHub only annotates files modified in the PR. Failures in unchanged files appear in the checks summary but not inline.

---

## 3. Coverage Badge Options

### Option A: Shields.io Dynamic Badge (No External Services)
Generate a JSON file during CI and commit to repo:
```json
{
  "schemaVersion": 1,
  "label": "coverage",
  "message": "85%",
  "color": "green"
}
```

### Option B: External Services
- Codecov
- Coveralls
- Custom gist-based badges

---

## 4. Threshold Enforcement Configuration

**Vitest Native Thresholds** (recommended approach):
```typescript
// vitest.config.ts
coverage: {
  thresholds: {
    lines: 80,
    functions: 80,
    branches: 80,
    statements: 80,
    perFile: true  // Prevents per-file regressions
  }
}
```

When coverage drops below threshold, Vitest exits with non-zero code, failing the CI job automatically.

---

## 5. Monorepo Coverage Handling

**Key Configuration:**
- Use `working-directory` parameter in the action
- Use `file-coverage-root-path` for path translation
- Run coverage per-package with `--project` filter:
```bash
npx vitest run --project core --coverage.enabled true
```

For aggregation, use multiple action invocations with unique `name` parameters.

---

## 6. Complete GitHub Actions Workflow Example

```yaml
name: Test and Coverage

on:
  pull_request:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 9

      - name: Install dependencies
        run: pnpm install

      - name: Build packages
        run: pnpm turbo build

      - name: Run tests with coverage
        run: npx vitest run --coverage.enabled true

      - name: Report coverage
        uses: davelosert/vitest-coverage-report-action@v2
        if: always()
        with:
          json-summary-path: ./coverage/coverage-summary.json
          json-final-path: ./coverage/coverage-final.json
          file-coverage-mode: changes
```

---

## 7. Vitest Configuration for CI

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      enabled: true,
      provider: 'v8',
      reporter: ['text', 'json-summary', 'json', 'html', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['**/node_modules/**', '**/dist/**'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
        perFile: true
      },
      reportsDirectory: './coverage',
      reportOnFailure: true  // Critical for CI - reports even on test failures
    }
  }
});
```

**Required reporters for GitHub integration:**
- `json-summary` - High-level coverage metrics
- `json` - Detailed file-specific coverage for annotations

---

## 8. Coverage Trend Comparison (Before/After Diff)

Use `json-summary-compare-path` parameter with a matrix job strategy:

```yaml
jobs:
  test:
    strategy:
      matrix:
        branch:
          - ${{ github.head_ref }}
          - main
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ matrix.branch }}
      # ... run tests and upload artifacts

  report:
    needs: test
    steps:
      - uses: davelosert/vitest-coverage-report-action@v2
        with:
          json-summary-compare-path: ./coverage-main/coverage-summary.json
```

This shows up/down arrows and percentage changes in the PR comment.

---

## 9. Key Pitfalls to Avoid

| Pitfall | Solution |
|---------|----------|
| Path mismatch in coverage reports | Use `file-coverage-root-path` parameter |
| Duplicate PR comments | Action auto-updates existing comments |
| Missing coverage on test failures | Set `reportOnFailure: true` in Vitest config |
| Fork PR permission issues | Use `workflow_run` trigger for two-workflow architecture |
| Large coverage artifacts | Use `file-coverage-mode: changes` to report only modified files |
| Config file not found | Ensure vitest.config.ts is in expected location or pass thresholds explicitly |

---

## 10. Alternative Actions Comparison

| Action | Pros | Cons |
|--------|------|------|
| `davelosert/vitest-coverage-report-action` | Most maintained, threshold auto-detection | None significant |
| `hyperse-io/vitest-coverage-reporter` | Similar features | Less adoption |
| `step-security/vitest-coverage-report-action` | Security-focused fork | May lag upstream |

---

## Integration with Your Stack

Given your configuration:
- **lcov already configured**: Good for external tools if needed later
- **Coverage scoped to `apps/web/src/hooks/**`**: Update `include` pattern in config
- **Sequential execution**: `fileParallelism: false` works fine with coverage
- **Requires build first**: Add `pnpm turbo build` step before tests in workflow

### Required Changes to vitest.config.ts

Add `json-summary` and `json` reporters for the coverage action:

```typescript
coverage: {
  provider: 'v8',
  reporter: ['text', 'html', 'lcov', 'json-summary', 'json'],  // Added json-summary, json
  include: ['apps/web/src/hooks/**/*.ts', 'apps/web/src/hooks/**/*.tsx'],
  // ... rest of config
}
```
