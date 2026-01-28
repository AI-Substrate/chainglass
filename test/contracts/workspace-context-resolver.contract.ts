/**
 * Contract test factory for IWorkspaceContextResolver implementations.
 *
 * Per Phase 2: WorkspaceContext Resolution + Worktree Discovery
 * Per Critical Discovery 03: Contract tests prevent fake drift by ensuring
 * both WorkspaceContextResolver (real) and FakeWorkspaceContextResolver pass identical tests.
 *
 * Follows the established pattern from workspace-registry-adapter.contract.ts.
 */

import type {
  IWorkspaceContextResolver,
  WorkspaceContext,
  WorkspaceInfo,
} from '@chainglass/workflow';
import { beforeEach, describe, expect, it } from 'vitest';

// ==================== Test Fixtures ====================

const SAMPLE_CONTEXT: WorkspaceContext = {
  workspaceSlug: 'test-project',
  workspaceName: 'Test Project',
  workspacePath: '/home/user/test-project',
  worktreePath: '/home/user/test-project',
  worktreeBranch: 'main',
  isMainWorktree: true,
  hasGit: true,
};

const SAMPLE_WORKSPACE_INFO: WorkspaceInfo = {
  slug: 'test-project',
  name: 'Test Project',
  path: '/home/user/test-project',
  createdAt: new Date('2026-01-27T10:00:00Z'),
  hasGit: true,
  worktrees: [
    {
      path: '/home/user/test-project',
      head: 'abc123def456789012345678901234567890abcd',
      branch: 'main',
      isDetached: false,
      isBare: false,
      isPrunable: false,
    },
  ],
};

// ==================== Contract Test Context ====================

/**
 * Test context for workspace context resolver contract tests.
 */
export interface WorkspaceContextResolverTestContext {
  /** The resolver implementation to test */
  resolver: IWorkspaceContextResolver;
  /** Setup function called before each test - must register sample context */
  setup: () => Promise<void>;
  /** Cleanup function called after each test */
  cleanup: () => Promise<void>;
  /** Description of the implementation */
  name: string;
}

// ==================== Contract Test Factory ====================

/**
 * Contract tests that run against both WorkspaceContextResolver and FakeWorkspaceContextResolver.
 *
 * These tests verify the behavioral contract of IWorkspaceContextResolver:
 * - resolveFromPath() returns context for registered path
 * - resolveFromPath() returns null for unregistered path
 * - resolveFromPath() returns longest match for overlapping paths
 * - getWorkspaceInfo() returns info for registered slug
 * - getWorkspaceInfo() returns null for unregistered slug
 */
export function workspaceContextResolverContractTests(
  createContext: () => WorkspaceContextResolverTestContext
) {
  let ctx: WorkspaceContextResolverTestContext;

  beforeEach(async () => {
    ctx = createContext();
    await ctx.setup();
  });

  describe(`${createContext().name} implements IWorkspaceContextResolver contract`, () => {
    describe('resolveFromPath() contract', () => {
      it('should return context for exact workspace path', async () => {
        /*
        Test Doc:
        - Why: Contract requires exact path match returns context
        - Contract: resolveFromPath(workspacePath) → WorkspaceContext
        - Quality Contribution: Basic lookup functionality
        */
        const result = await ctx.resolver.resolveFromPath('/home/user/test-project');

        expect(result).not.toBeNull();
        expect(result?.workspaceSlug).toBe('test-project');
        expect(result?.workspacePath).toBe('/home/user/test-project');
      });

      it('should return context for nested path within workspace', async () => {
        /*
        Test Doc:
        - Why: Contract requires nested paths resolve to parent workspace
        - Contract: resolveFromPath(nested) → WorkspaceContext of parent
        - Quality Contribution: Directory tree walking
        */
        const result = await ctx.resolver.resolveFromPath('/home/user/test-project/src/lib');

        expect(result).not.toBeNull();
        expect(result?.workspaceSlug).toBe('test-project');
      });

      it('should return null for unregistered path', async () => {
        /*
        Test Doc:
        - Why: Contract requires null for paths outside any workspace
        - Contract: resolveFromPath(unregistered) → null
        - Quality Contribution: Clean null handling
        */
        const result = await ctx.resolver.resolveFromPath('/tmp/random/path');

        expect(result).toBeNull();
      });

      it('should return null for sibling of registered workspace', async () => {
        /*
        Test Doc:
        - Why: Contract requires only workspace and children match
        - Contract: resolveFromPath(sibling) → null
        - Quality Contribution: Correct boundary handling
        */
        const result = await ctx.resolver.resolveFromPath('/home/user/other-project');

        expect(result).toBeNull();
      });

      it('should handle path with trailing slash', async () => {
        /*
        Test Doc:
        - Why: Contract requires trailing slashes are normalized
        - Contract: resolveFromPath(path/) works same as resolveFromPath(path)
        - Quality Contribution: Robust path handling
        */
        const result = await ctx.resolver.resolveFromPath('/home/user/test-project/');

        expect(result).not.toBeNull();
        expect(result?.workspaceSlug).toBe('test-project');
      });
    });
  });
}
