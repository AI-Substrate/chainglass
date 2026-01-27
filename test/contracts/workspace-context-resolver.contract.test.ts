/**
 * Contract test execution for IWorkspaceContextResolver.
 *
 * Per Phase 2: WorkspaceContext Resolution + Worktree Discovery
 * Per Critical Discovery 03: Runs contract tests against both Real and Fake implementations.
 *
 * Follows the established pattern from workspace-registry-adapter.contract.test.ts.
 */

import { FakeFileSystem } from '@chainglass/shared';
import {
  FakeWorkspaceContextResolver,
  FakeWorkspaceRegistryAdapter,
  Workspace,
  type WorkspaceContext,
  WorkspaceContextResolver,
} from '@chainglass/workflow';
import { describe } from 'vitest';
import {
  type WorkspaceContextResolverTestContext,
  workspaceContextResolverContractTests,
} from './workspace-context-resolver.contract.js';

// ==================== Test Fixtures ====================

const SAMPLE_WORKSPACE = Workspace.create({
  name: 'Test Project',
  path: '/home/user/test-project',
  slug: 'test-project',
  createdAt: new Date('2026-01-27T10:00:00Z'),
});

const SAMPLE_CONTEXT: WorkspaceContext = {
  workspaceSlug: 'test-project',
  workspaceName: 'Test Project',
  workspacePath: '/home/user/test-project',
  worktreePath: '/home/user/test-project',
  worktreeBranch: null,
  isMainWorktree: true,
  hasGit: false,
};

// ==================== FakeWorkspaceContextResolver Tests ====================

describe('FakeWorkspaceContextResolver contract tests', () => {
  workspaceContextResolverContractTests(() => {
    const resolver = new FakeWorkspaceContextResolver();

    const context: WorkspaceContextResolverTestContext = {
      resolver,
      name: 'FakeWorkspaceContextResolver',
      setup: async () => {
        // Set up sample context in fake
        resolver.setContext('/home/user/test-project', SAMPLE_CONTEXT);
      },
      cleanup: async () => {
        resolver.reset();
      },
    };

    return context;
  });
});

// ==================== WorkspaceContextResolver Tests ====================

describe('WorkspaceContextResolver contract tests', () => {
  workspaceContextResolverContractTests(() => {
    const registryAdapter = new FakeWorkspaceRegistryAdapter();
    const fileSystem = new FakeFileSystem();
    const resolver = new WorkspaceContextResolver(registryAdapter, fileSystem);

    const context: WorkspaceContextResolverTestContext = {
      resolver,
      name: 'WorkspaceContextResolver',
      setup: async () => {
        // Set up sample workspace in registry
        registryAdapter.addWorkspace(SAMPLE_WORKSPACE);
      },
      cleanup: async () => {
        registryAdapter.reset();
      },
    };

    return context;
  });
});
