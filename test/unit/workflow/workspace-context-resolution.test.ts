/**
 * Unit tests for WorkspaceContext resolution.
 *
 * Per Phase 2: WorkspaceContext Resolution + Worktree Discovery
 * Per Testing Philosophy: Full TDD - tests written first
 *
 * T014: Tests for resolveFromPath() with registered workspace
 * T015: Tests for resolveFromPath() with unregistered path
 *
 * These tests use FakeWorkspaceRegistryAdapter to control workspace state.
 */

import { FakeFileSystem } from '@chainglass/shared';
import {
  FakeWorkspaceRegistryAdapter,
  type IWorkspaceContextResolver,
  Workspace,
  type WorkspaceContext,
  WorkspaceContextResolver,
} from '@chainglass/workflow';
import { beforeEach, describe, expect, it } from 'vitest';

// ==================== Test Fixtures ====================

const SAMPLE_WORKSPACE_1 = Workspace.create({
  name: 'Test Project',
  path: '/home/user/test-project',
  slug: 'test-project',
  createdAt: new Date('2026-01-27T10:00:00Z'),
});

const SAMPLE_WORKSPACE_2 = Workspace.create({
  name: 'Another Project',
  path: '/home/user/another-project',
  slug: 'another-project',
  createdAt: new Date('2026-01-27T11:00:00Z'),
});

// Overlapping workspace - nested inside workspace 1's path
const NESTED_WORKSPACE = Workspace.create({
  name: 'Nested Project',
  path: '/home/user/test-project/packages/nested',
  slug: 'nested-project',
  createdAt: new Date('2026-01-27T12:00:00Z'),
});

// ==================== Test Setup ====================

/**
 * Test context for workspace context resolver tests.
 */
interface TestContext {
  registryAdapter: FakeWorkspaceRegistryAdapter;
  fileSystem: FakeFileSystem;
  resolver: IWorkspaceContextResolver;
}

/**
 * Creates test context with fakes.
 */
function createTestContext(): TestContext {
  const registryAdapter = new FakeWorkspaceRegistryAdapter();
  const fileSystem = new FakeFileSystem();

  // Use real WorkspaceContextResolver with fake dependencies
  const resolver = new WorkspaceContextResolver(registryAdapter, fileSystem);

  return { registryAdapter, fileSystem, resolver };
}

// ==================== T014: resolveFromPath with registered workspace ====================

describe('WorkspaceContext resolveFromPath (registered workspace)', () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = createTestContext();
    // Set up workspace in fake registry
    ctx.registryAdapter.addWorkspace(SAMPLE_WORKSPACE_1);
    ctx.registryAdapter.addWorkspace(SAMPLE_WORKSPACE_2);
  });

  describe('exact workspace path match', () => {
    it('should return context for exact workspace path', async () => {
      /*
      Test Doc:
      - Why: Users may cd directly to workspace root
      - Contract: resolveFromPath(workspacePath) returns context with matching workspace
      - Usage Notes: CWD at exact workspace root
      - Quality Contribution: Exact path lookup works
      - Worked Example: resolveFromPath("/home/user/test-project") → context with workspaceSlug="test-project"
      */
      const result = await ctx.resolver.resolveFromPath('/home/user/test-project');

      expect(result).not.toBeNull();
      expect(result?.workspaceSlug).toBe('test-project');
      expect(result?.workspaceName).toBe('Test Project');
      expect(result?.workspacePath).toBe('/home/user/test-project');
    });

    it('should set worktreePath equal to workspacePath when not in git worktree', async () => {
      /*
      Test Doc:
      - Why: worktreePath tracks current worktree, falls back to workspace root
      - Contract: worktreePath equals workspacePath when no git worktree
      - Quality Contribution: Consistent default behavior
      */
      const result = await ctx.resolver.resolveFromPath('/home/user/test-project');

      expect(result).not.toBeNull();
      expect(result?.worktreePath).toBe(result?.workspacePath);
    });
  });

  describe('nested subdirectory path', () => {
    it('should return context for path nested one level deep', async () => {
      /*
      Test Doc:
      - Why: Users typically work in subdirectories like src/
      - Contract: resolveFromPath(nested) returns parent workspace context
      - Usage Notes: CWD in workspace/src
      - Quality Contribution: Walks up directory tree correctly
      - Worked Example: resolveFromPath("/home/user/test-project/src") → workspace "test-project"
      */
      const result = await ctx.resolver.resolveFromPath('/home/user/test-project/src');

      expect(result).not.toBeNull();
      expect(result?.workspaceSlug).toBe('test-project');
      expect(result?.workspacePath).toBe('/home/user/test-project');
    });

    it('should return context for deeply nested path', async () => {
      /*
      Test Doc:
      - Why: Monorepos have deeply nested files
      - Contract: resolveFromPath walks all the way up to find workspace
      - Usage Notes: CWD deep in packages/foo/src/lib
      - Quality Contribution: Deep path resolution works
      - Worked Example: resolveFromPath("/home/user/test-project/packages/foo/src/lib") → workspace "test-project"
      */
      const result = await ctx.resolver.resolveFromPath(
        '/home/user/test-project/packages/foo/src/lib'
      );

      expect(result).not.toBeNull();
      expect(result?.workspaceSlug).toBe('test-project');
      expect(result?.workspacePath).toBe('/home/user/test-project');
    });
  });

  describe('overlapping workspace paths (DYK-03)', () => {
    beforeEach(() => {
      // Add nested workspace that overlaps with SAMPLE_WORKSPACE_1
      ctx.registryAdapter.addWorkspace(NESTED_WORKSPACE);
    });

    it('should return most specific (longest) matching workspace', async () => {
      /*
      Test Doc:
      - Why: Multiple workspaces can have overlapping paths
      - Contract: resolveFromPath returns longest matching path (most specific)
      - Usage Notes: Per DYK-03, sort by path.length descending before matching
      - Quality Contribution: Prevents matching wrong workspace
      - Worked Example: 
        - /home/user/test-project is registered
        - /home/user/test-project/packages/nested is also registered
        - CWD: /home/user/test-project/packages/nested/src
        - Result: nested-project (NOT test-project)
      */
      const result = await ctx.resolver.resolveFromPath(
        '/home/user/test-project/packages/nested/src'
      );

      expect(result).not.toBeNull();
      expect(result?.workspaceSlug).toBe('nested-project');
      expect(result?.workspacePath).toBe('/home/user/test-project/packages/nested');
    });

    it('should still match parent workspace for paths outside nested workspace', async () => {
      /*
      Test Doc:
      - Why: Sibling directories should still match parent
      - Contract: Overlapping workspaces only affect their subtree
      - Worked Example:
        - /home/user/test-project/packages/other is NOT in nested-project
        - Should still match test-project
      */
      const result = await ctx.resolver.resolveFromPath(
        '/home/user/test-project/packages/other/src'
      );

      expect(result).not.toBeNull();
      expect(result?.workspaceSlug).toBe('test-project');
      expect(result?.workspacePath).toBe('/home/user/test-project');
    });
  });

  describe('workspace with trailing slash', () => {
    it('should handle input path with trailing slash', async () => {
      /*
      Test Doc:
      - Why: Paths may come with trailing slash from tab completion
      - Contract: Trailing slash is normalized away
      - Quality Contribution: Robust path handling
      */
      const result = await ctx.resolver.resolveFromPath('/home/user/test-project/');

      expect(result).not.toBeNull();
      expect(result?.workspaceSlug).toBe('test-project');
    });
  });
});

// ==================== T015: resolveFromPath with unregistered path ====================

describe('WorkspaceContext resolveFromPath (unregistered path)', () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = createTestContext();
    // Only register SAMPLE_WORKSPACE_1 - leave other paths unregistered
    ctx.registryAdapter.addWorkspace(SAMPLE_WORKSPACE_1);
  });

  describe('path not in any workspace', () => {
    it('should return null for completely unregistered path', async () => {
      /*
      Test Doc:
      - Why: User may cd to random directory outside any workspace
      - Contract: resolveFromPath returns null for unregistered paths
      - Usage Notes: No error thrown, just null
      - Quality Contribution: Clean null handling, not exceptions
      - Worked Example: resolveFromPath("/tmp/random") → null
      */
      const result = await ctx.resolver.resolveFromPath('/tmp/random');

      expect(result).toBeNull();
    });

    it('should return null for root path', async () => {
      /*
      Test Doc:
      - Why: Filesystem root is never a workspace
      - Contract: resolveFromPath("/") returns null
      - Quality Contribution: Edge case handled
      */
      const result = await ctx.resolver.resolveFromPath('/');

      expect(result).toBeNull();
    });

    it('should return null for home directory without registered workspace', async () => {
      /*
      Test Doc:
      - Why: User's home directory typically isn't a workspace
      - Contract: resolveFromPath(home) returns null unless registered
      - Worked Example: resolveFromPath("/home/user") → null (not registered)
      */
      const result = await ctx.resolver.resolveFromPath('/home/user');

      expect(result).toBeNull();
    });
  });

  describe('sibling of workspace', () => {
    it('should return null for sibling directory of registered workspace', async () => {
      /*
      Test Doc:
      - Why: Workspace registration doesn't affect siblings
      - Contract: Only the workspace and its descendants match
      - Worked Example: 
        - /home/user/test-project registered
        - /home/user/other-project NOT registered
        - resolveFromPath("/home/user/other-project") → null
      */
      const result = await ctx.resolver.resolveFromPath('/home/user/other-project');

      expect(result).toBeNull();
    });
  });

  describe('parent of workspace', () => {
    it('should return null for parent directory of registered workspace', async () => {
      /*
      Test Doc:
      - Why: Parent directory is not the workspace
      - Contract: Only workspace root and descendants match
      - Worked Example:
        - /home/user/test-project registered
        - resolveFromPath("/home/user") → null
      */
      const result = await ctx.resolver.resolveFromPath('/home/user');

      expect(result).toBeNull();
    });
  });

  describe('empty registry', () => {
    it('should return null when no workspaces registered', async () => {
      /*
      Test Doc:
      - Why: Clean install has no workspaces
      - Contract: Empty registry means all paths return null
      - Quality Contribution: First-run experience handled
      */
      // Clear all workspaces
      ctx.registryAdapter.reset();

      const result = await ctx.resolver.resolveFromPath('/home/user/any-path');

      expect(result).toBeNull();
    });
  });
});
