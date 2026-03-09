# Workshop: Worktree Integration Testing — Setup & Teardown Patterns

**Type**: Integration Pattern
**Plan**: 069-new-worktree
**Spec**: [new-worktree-spec.md](../new-worktree-spec.md)
**Created**: 2026-03-09
**Status**: Draft

**Related Documents**:
- [Workshop 002: Main Sync Strategy and Git Safety](./002-main-sync-strategy-and-git-safety.md)
- [Workshop 001: Naming and Post-Create Hook](./001-new-worktree-naming-and-post-create-hook.md)

**Domain Context**:
- **Primary Domain**: workspace
- **Related Domains**: `_platform/file-ops` (IFileSystem, IProcessManager)

---

## Purpose

Document how to create, verify, and tear down real git worktrees in integration tests. The codebase has no existing worktree integration tests — this workshop establishes the pattern for posterity so future plans can test worktree-mutating behavior against real git repos without guesswork.

## Key Questions Addressed

- How do we create a throwaway git repo in a temp directory for testing?
- How do we run `git worktree add` in tests and verify the result?
- How do we clean up worktrees and temp dirs reliably?
- What's the hybrid approach (real git + fake services) and when to use each?
- How does the existing codebase handle integration test setup?

---

## Existing Codebase Patterns

### Pattern 1: Temp Directory + Real Filesystem (Integration)

From `test/helpers/positional-graph-e2e-helpers.ts`:

```typescript
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

async function createTestServiceStack(prefix: string) {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), `${prefix}-`));
  const chaingleassDir = path.join(tmpDir, '.chainglass', 'data', 'workflows');
  await fs.mkdir(chaingleassDir, { recursive: true });
  // ... wire real adapters
  return { workspacePath: tmpDir };
}
```

**Key characteristics**:
- `fs.mkdtemp()` for unique temp directories
- Pre-creates `.chainglass/` structure inside temp dir
- Real `NodeFileSystemAdapter` + `PathResolverAdapter`
- Cleanup via `fs.rm(tmpDir, { recursive: true, force: true })`

### Pattern 2: Git Repo Fixture (Unit)

From `test/unit/web/features/041-file-browser/file-list.test.ts`:

```typescript
import { execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

let fixtureDir: string;

beforeEach(() => {
  fixtureDir = mkdtempSync(join(tmpdir(), 'file-list-test-'));
  execSync('git init', { cwd: fixtureDir, stdio: 'ignore' });
  execSync('git config user.email "test@test.com"', { cwd: fixtureDir, stdio: 'ignore' });
  execSync('git config user.name "Test"', { cwd: fixtureDir, stdio: 'ignore' });
  mkdirSync(join(fixtureDir, 'src'), { recursive: true });
  writeFileSync(join(fixtureDir, 'src', 'app.ts'), 'export const app = true;');
  writeFileSync(join(fixtureDir, 'README.md'), '# Test');
  execSync('git add . && git commit -m "init"', { cwd: fixtureDir, stdio: 'ignore' });
});

afterEach(() => {
  rmSync(fixtureDir, { recursive: true, force: true });
});
```

**Key characteristics**:
- Synchronous setup with `execSync` for git commands
- Sets git identity (required for commits)
- Creates real files and commits them
- Synchronous teardown with `rmSync`

### Pattern 3: Hybrid (Real FS + Fake Services)

From `test/integration/workflow/features/023/central-watcher.integration.test.ts`:

```typescript
// Real infrastructure
realFilesystem = new NodeFileSystemAdapter();
realWatcherFactory = new NativeFileWatcherFactory();

// Controlled fakes
fakeRegistry = new FakeWorkspaceRegistryAdapter();
fakeWorktreeResolver = new FakeGitWorktreeResolver();

// Mix real + fake
service = new CentralWatcherService(
  fakeRegistry, fakeWorktreeResolver,
  realFilesystem, realWatcherFactory,
  registryPath
);
```

**Key characteristics**:
- Real filesystem for I/O operations
- Fake registry/resolver for controlled workspace state
- Best of both: real side effects where needed, deterministic state elsewhere

### macOS `/var` Symlink Warning

On macOS, `os.tmpdir()` returns `/var/folders/...` but `/var` is a symlink to `/private/var`. If your test compares paths, normalize with `fs.realpath()`:

```typescript
const rawTmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'test-'));
const tmpDir = await fs.realpath(rawTmpDir);  // /private/var/... on macOS
```

---

## Worktree Integration Test Pattern

### The Full Pattern

This is the recommended pattern for testing worktree creation end-to-end:

```typescript
import { execSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { realpathSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, beforeEach, afterEach, it, expect } from 'vitest';

describe('Worktree creation integration', () => {
  let mainRepoPath: string;
  let worktreePath: string;

  beforeEach(() => {
    // 1. Create temp directory (realpath for macOS /var symlink)
    const raw = mkdtempSync(join(tmpdir(), 'wt-integration-'));
    mainRepoPath = realpathSync(raw);

    // 2. Initialize a git repo with at least one commit
    execSync('git init', { cwd: mainRepoPath, stdio: 'ignore' });
    execSync('git config user.email "test@test.com"', { cwd: mainRepoPath, stdio: 'ignore' });
    execSync('git config user.name "Test"', { cwd: mainRepoPath, stdio: 'ignore' });

    // 3. Create initial content and commit
    writeFileSync(join(mainRepoPath, 'README.md'), '# Test Repo');
    mkdirSync(join(mainRepoPath, 'docs', 'plans'), { recursive: true });
    execSync('git add . && git commit -m "Initial commit"', {
      cwd: mainRepoPath,
      stdio: 'ignore',
    });

    // 4. Worktree path is a sibling directory
    worktreePath = join(mainRepoPath, '..', '069-test-feature');
  });

  afterEach(() => {
    // IMPORTANT: Remove worktrees BEFORE removing the main repo
    // git worktree remove requires the main repo to exist
    try {
      execSync(`git worktree remove "${worktreePath}" --force`, {
        cwd: mainRepoPath,
        stdio: 'ignore',
      });
    } catch {
      // Worktree may not have been created in this test
    }

    // Now safe to remove the main repo
    rmSync(mainRepoPath, { recursive: true, force: true });

    // Clean up worktree directory if it still exists
    if (existsSync(worktreePath)) {
      rmSync(worktreePath, { recursive: true, force: true });
    }
  });

  it('creates a worktree with a new branch', () => {
    // Create the worktree
    execSync(
      `git worktree add -b 069-test-feature "${worktreePath}" main`,
      { cwd: mainRepoPath, stdio: 'ignore' }
    );

    // Verify the worktree exists
    expect(existsSync(worktreePath)).toBe(true);
    expect(existsSync(join(worktreePath, 'README.md'))).toBe(true);

    // Verify the branch was created
    const branches = execSync('git branch', { cwd: mainRepoPath, encoding: 'utf-8' });
    expect(branches).toContain('069-test-feature');

    // Verify git worktree list shows it
    const worktrees = execSync('git worktree list', {
      cwd: mainRepoPath,
      encoding: 'utf-8',
    });
    expect(worktrees).toContain('069-test-feature');
  });
});
```

### Teardown Order Is Critical

```
1. git worktree remove <path> --force    ← FIRST (needs main repo)
2. rm -rf <mainRepoPath>                  ← SECOND
3. rm -rf <worktreePath> (if still exists) ← LAST (cleanup stragglers)
```

If you reverse steps 1 and 2, `git worktree remove` fails because the main repo is gone, and the worktree directory becomes an orphan that confuses future `git` operations in the same parent directory.

### Testing with `GitWorktreeManagerAdapter`

To test the real adapter (not just raw git commands):

```typescript
import { NodeProcessManager } from '@chainglass/shared';
import { GitWorktreeManagerAdapter } from '@chainglass/workflow';

describe('GitWorktreeManagerAdapter integration', () => {
  let mainRepoPath: string;
  let adapter: GitWorktreeManagerAdapter;

  beforeEach(() => {
    // ... same temp dir + git init as above ...
    const processManager = new NodeProcessManager();
    adapter = new GitWorktreeManagerAdapter(processManager);
  });

  it('checkMainStatus returns clean for fresh repo', async () => {
    const status = await adapter.checkMainStatus(mainRepoPath);
    // Note: fresh repo has no 'origin' remote, so fetch will fail
    // This tests the local-only path
    expect(status.status).toBeDefined();
  });

  it('createWorktree creates a real worktree', async () => {
    const result = await adapter.createWorktree(
      mainRepoPath,
      '069-test',
      worktreePath
    );
    expect(result.status).toBe('created');
    expect(existsSync(worktreePath)).toBe(true);
  });
});
```

### Testing with Bootstrap Hook

```typescript
it('runs .chainglass/new-worktree.sh after creation', () => {
  // Create the hook
  const hookDir = join(mainRepoPath, '.chainglass');
  mkdirSync(hookDir, { recursive: true });
  writeFileSync(
    join(hookDir, 'new-worktree.sh'),
    '#!/bin/bash\necho "HOOK_RAN=true" > "$CHAINGLASS_NEW_WORKTREE_PATH/.hook-result"',
    { mode: 0o755 }
  );
  execSync('git add . && git commit -m "Add hook"', {
    cwd: mainRepoPath,
    stdio: 'ignore',
  });

  // Create worktree
  execSync(
    `git worktree add -b 069-hooked "${worktreePath}" main`,
    { cwd: mainRepoPath, stdio: 'ignore' }
  );

  // Run hook manually (or via WorktreeBootstrapRunner)
  execSync(`bash "${join(hookDir, 'new-worktree.sh')}"`, {
    cwd: worktreePath,
    env: {
      ...process.env,
      CHAINGLASS_MAIN_REPO_PATH: mainRepoPath,
      CHAINGLASS_NEW_WORKTREE_PATH: worktreePath,
      CHAINGLASS_NEW_BRANCH_NAME: '069-hooked',
    },
    stdio: 'ignore',
  });

  // Verify hook ran
  expect(existsSync(join(worktreePath, '.hook-result'))).toBe(true);
});
```

---

## Environment Variables for Bootstrap Hooks

| Variable | Type | Example | Description |
|----------|------|---------|-------------|
| `CHAINGLASS_MAIN_REPO_PATH` | string | `/Users/dev/project` | Absolute path to main repo |
| `CHAINGLASS_MAIN_BRANCH` | string | `main` | Always `main` in v1 |
| `CHAINGLASS_WORKSPACE_SLUG` | string | `my-project` | Workspace slug |
| `CHAINGLASS_REQUESTED_NAME` | string | `my-feature` | What the user typed |
| `CHAINGLASS_NORMALIZED_SLUG` | string | `my-feature` | After normalization |
| `CHAINGLASS_NEW_WORKTREE_ORDINAL` | string | `069` | Allocated ordinal |
| `CHAINGLASS_NEW_BRANCH_NAME` | string | `069-my-feature` | Full branch name |
| `CHAINGLASS_NEW_WORKTREE_NAME` | string | `069-my-feature` | Same as branch name |
| `CHAINGLASS_NEW_WORKTREE_PATH` | string | `/Users/dev/069-my-feature` | Absolute worktree path |
| `CHAINGLASS_TRIGGER` | string | `chainglass-web` | What triggered creation |

---

## Testing Tiers

| Tier | Speed | What It Tests | When to Use |
|------|-------|---------------|-------------|
| **Unit (fakes)** | < 1ms | Domain logic, naming, state mapping | Always — covers 90% of behavior |
| **Contract (fake/real parity)** | < 100ms | Interface shape conformance | After changing interface or adding implementations |
| **Integration (real git)** | 1-5s | Actual `git worktree add`, file existence, branch creation | Before shipping git-mutating features |
| **E2E (full stack)** | 60-180s | CLI → service → git → verify | Smoke testing release candidates |

### When Fakes Are Sufficient

- Naming allocator (pure functions — no git needed)
- Service orchestration (fake manager returns configured states)
- Form state mapping (type-level testing)
- Error handling paths (fake injects errors)

### When Real Git Is Needed

- `GitWorktreeManagerAdapter.checkMainStatus()` parses real git output
- `GitWorktreeManagerAdapter.createWorktree()` runs real `git worktree add`
- Bootstrap runner executes real bash scripts
- Verifying the worktree directory structure after creation

---

## Quick Reference

```bash
# Create a temp git repo for testing
TMPDIR=$(mktemp -d)
cd "$TMPDIR"
git init
git config user.email "test@test.com"
git config user.name "Test"
echo "# Test" > README.md
git add . && git commit -m "init"

# Create a worktree
git worktree add -b 069-test ../069-test main

# Verify
ls ../069-test/README.md  # should exist
git branch               # should show 069-test
git worktree list         # should show both

# Teardown (ORDER MATTERS)
git worktree remove ../069-test --force   # 1. remove worktree first
rm -rf "$TMPDIR"                           # 2. then remove main repo
rm -rf "$(dirname "$TMPDIR")/069-test"     # 3. cleanup stragglers
```

---

## Open Questions

### Q1: Should we add a shared `createTestGitRepo()` helper?

**RECOMMENDATION**: Yes, but only when a second test file needs it. The file-list test uses inline `execSync` and that's fine for a single file. When we add worktree integration tests, extract a shared helper to `test/helpers/git-fixture.ts`:

```typescript
export function createTestGitRepo(prefix: string): string {
  const raw = mkdtempSync(join(tmpdir(), `${prefix}-`));
  const dir = realpathSync(raw);
  execSync('git init', { cwd: dir, stdio: 'ignore' });
  execSync('git config user.email "test@test.com"', { cwd: dir, stdio: 'ignore' });
  execSync('git config user.name "Test"', { cwd: dir, stdio: 'ignore' });
  writeFileSync(join(dir, 'README.md'), '# Test');
  execSync('git add . && git commit -m "init"', { cwd: dir, stdio: 'ignore' });
  return dir;
}

export function cleanupTestGitRepo(mainPath: string, ...worktreePaths: string[]): void {
  for (const wt of worktreePaths) {
    try { execSync(`git worktree remove "${wt}" --force`, { cwd: mainPath, stdio: 'ignore' }); } catch {}
  }
  rmSync(mainPath, { recursive: true, force: true });
  for (const wt of worktreePaths) {
    if (existsSync(wt)) rmSync(wt, { recursive: true, force: true });
  }
}
```

### Q2: Should worktree integration tests run in the main test suite or E2E?

**RECOMMENDATION**: Integration suite (`test/integration/`), not E2E. They're fast (1-5s per test), don't need a running server, and follow the existing `central-watcher.integration.test.ts` pattern. Run via `vitest.e2e.config.ts` or a dedicated integration config.

---

## Decision Summary

| Decision | Rationale |
|----------|-----------|
| Use `execSync` for git setup, not `IProcessManager` | Setup is test infrastructure, not the system under test |
| Always `realpath()` temp dirs on macOS | `/var` → `/private/var` symlink breaks path comparisons |
| Teardown worktrees BEFORE main repo | `git worktree remove` needs the main repo to exist |
| Hybrid approach: real git + fake registry | Tests real git behavior without needing workspace registration infrastructure |
| Extract shared helper on second use | YAGNI until multiple test files need git repos |
