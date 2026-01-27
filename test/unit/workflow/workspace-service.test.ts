/**
 * WorkspaceService unit tests.
 *
 * Per Phase 4: Service Layer + DI Integration
 * Per R-TEST-007: Uses fakes only, no vi.mock/vi.fn.
 *
 * Tests cover:
 * - T036: add() - success, duplicate slug (E075), invalid path (E076/E077)
 * - T037: list() - empty registry, multiple workspaces
 * - T038: getInfo() - with/without worktrees, not found
 */

import { Workspace } from '@chainglass/workflow';
import type { WorkspaceContext, WorkspaceInfo } from '@chainglass/workflow';
import { beforeEach, describe, expect, it } from 'vitest';
import { FakeGitWorktreeResolver } from '../../../packages/workflow/src/fakes/fake-git-worktree-resolver.js';
import { FakeWorkspaceContextResolver } from '../../../packages/workflow/src/fakes/fake-workspace-context-resolver.js';
import { FakeWorkspaceRegistryAdapter } from '../../../packages/workflow/src/fakes/fake-workspace-registry-adapter.js';
import { WorkspaceService } from '../../../packages/workflow/src/services/workspace.service.js';

describe('WorkspaceService', () => {
  let registryAdapter: FakeWorkspaceRegistryAdapter;
  let contextResolver: FakeWorkspaceContextResolver;
  let gitResolver: FakeGitWorktreeResolver;
  let service: WorkspaceService;

  beforeEach(() => {
    registryAdapter = new FakeWorkspaceRegistryAdapter();
    contextResolver = new FakeWorkspaceContextResolver();
    gitResolver = new FakeGitWorktreeResolver();
    service = new WorkspaceService(registryAdapter, contextResolver, gitResolver);
  });

  // ==================== T036: add() Tests ====================

  describe('add()', () => {
    it('should register new workspace', async () => {
      // Arrange - nothing to set up, empty registry

      // Act
      const result = await service.add('My Project', '/home/user/my-project');

      // Assert
      expect(result.success).toBe(true);
      expect(result.workspace).toBeDefined();
      expect(result.workspace?.name).toBe('My Project');
      expect(result.workspace?.path).toBe('/home/user/my-project');
      expect(result.workspace?.slug).toBe('my-project');
      expect(result.errors).toHaveLength(0);

      // Verify adapter was called
      expect(registryAdapter.saveCalls).toHaveLength(1);
    });

    it('should return E075 for duplicate slug', async () => {
      // Arrange - pre-populate registry with existing workspace
      const existing = Workspace.create({
        name: 'My Project',
        path: '/home/user/existing',
      });
      registryAdapter.addWorkspace(existing);

      // Act - try to add workspace that would have same slug
      const result = await service.add('My Project', '/home/user/another');

      // Assert
      expect(result.success).toBe(false);
      expect(result.workspace).toBeUndefined();
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('E075');
      expect(result.errors[0].message).toContain('already exists');
    });

    it('should return E076 for relative path', async () => {
      // Act - try to add with relative path
      const result = await service.add('My Project', './relative/path');

      // Assert
      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('E076');
      expect(result.errors[0].message).toContain('relative');
    });

    it('should return E076 for path with traversal', async () => {
      // Act - try to add with directory traversal
      const result = await service.add('My Project', '/home/user/../etc/passwd');

      // Assert
      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('E076');
      expect(result.errors[0].message).toContain('traversal');
    });

    it('should accept tilde path', async () => {
      // Act - add with tilde path (should be accepted)
      const result = await service.add('My Project', '~/my-project');

      // Assert
      expect(result.success).toBe(true);
      expect(result.workspace).toBeDefined();
      expect(result.workspace?.path).toBe('~/my-project');
    });

    it('should allow custom slug via options', async () => {
      // Act
      const result = await service.add('My Project', '/home/user/project', {
        slug: 'custom-slug',
      });

      // Assert
      expect(result.success).toBe(true);
      expect(result.workspace?.slug).toBe('custom-slug');
    });
  });

  // ==================== T037: list() Tests ====================

  describe('list()', () => {
    it('should return empty array when no workspaces', async () => {
      // Act
      const result = await service.list();

      // Assert
      expect(result).toEqual([]);
      expect(registryAdapter.listCalls).toHaveLength(1);
    });

    it('should return all workspaces', async () => {
      // Arrange - add multiple workspaces
      const ws1 = Workspace.create({ name: 'Project A', path: '/home/user/a' });
      const ws2 = Workspace.create({ name: 'Project B', path: '/home/user/b' });
      const ws3 = Workspace.create({ name: 'Project C', path: '/home/user/c' });
      registryAdapter.addWorkspace(ws1);
      registryAdapter.addWorkspace(ws2);
      registryAdapter.addWorkspace(ws3);

      // Act
      const result = await service.list();

      // Assert
      expect(result).toHaveLength(3);
      expect(result.map((w) => w.name)).toContain('Project A');
      expect(result.map((w) => w.name)).toContain('Project B');
      expect(result.map((w) => w.name)).toContain('Project C');
    });
  });

  // ==================== T038: getInfo() Tests ====================

  describe('getInfo()', () => {
    it('should return null for not found', async () => {
      // Act
      const result = await service.getInfo('nonexistent');

      // Assert
      expect(result).toBeNull();
    });

    it('should return workspace info without git', async () => {
      // Arrange - add workspace and set up context resolver
      const ws = Workspace.create({ name: 'My Project', path: '/home/user/project' });
      registryAdapter.addWorkspace(ws);

      // Set up context resolver to return info without git
      contextResolver.setWorkspaceInfo(ws.slug, {
        slug: ws.slug,
        name: ws.name,
        path: ws.path,
        createdAt: ws.createdAt,
        hasGit: false,
        worktrees: [],
      });

      // Act
      const result = await service.getInfo(ws.slug);

      // Assert
      expect(result).not.toBeNull();
      expect(result?.slug).toBe(ws.slug);
      expect(result?.name).toBe(ws.name);
      expect(result?.hasGit).toBe(false);
      expect(result?.worktrees).toHaveLength(0);
    });

    it('should return workspace info with worktrees', async () => {
      // Arrange - add workspace
      const ws = Workspace.create({ name: 'My Project', path: '/home/user/project' });
      registryAdapter.addWorkspace(ws);

      // Set up git resolver to return worktrees
      gitResolver.setWorktrees(ws.path, [
        {
          path: '/home/user/project',
          head: 'abc123def456',
          branch: 'main',
          isDetached: false,
          isBare: false,
          isPrunable: false,
        },
        {
          path: '/home/user/project-feature',
          head: '789xyz000111',
          branch: 'feature-branch',
          isDetached: false,
          isBare: false,
          isPrunable: false,
        },
      ]);

      // Set up context resolver to return info with worktrees
      contextResolver.setWorkspaceInfo(ws.slug, {
        slug: ws.slug,
        name: ws.name,
        path: ws.path,
        createdAt: ws.createdAt,
        hasGit: true,
        worktrees: [
          {
            path: '/home/user/project',
            head: 'abc123def456',
            branch: 'main',
            isDetached: false,
            isBare: false,
            isPrunable: false,
          },
          {
            path: '/home/user/project-feature',
            head: '789xyz000111',
            branch: 'feature-branch',
            isDetached: false,
            isBare: false,
            isPrunable: false,
          },
        ],
      });

      // Act
      const result = await service.getInfo(ws.slug);

      // Assert
      expect(result).not.toBeNull();
      expect(result?.hasGit).toBe(true);
      expect(result?.worktrees).toHaveLength(2);
      expect(result?.worktrees[0].branch).toBe('main');
      expect(result?.worktrees[1].branch).toBe('feature-branch');
    });
  });

  // ==================== remove() Tests ====================

  describe('remove()', () => {
    it('should remove workspace', async () => {
      // Arrange - add workspace
      const ws = Workspace.create({ name: 'My Project', path: '/home/user/project' });
      registryAdapter.addWorkspace(ws);

      // Act
      const result = await service.remove(ws.slug);

      // Assert
      expect(result.success).toBe(true);
      expect(result.removedSlug).toBe(ws.slug);
      expect(result.errors).toHaveLength(0);
      expect(registryAdapter.removeCalls).toHaveLength(1);
    });

    it('should return E074 for not found', async () => {
      // Act - try to remove nonexistent workspace
      const result = await service.remove('nonexistent');

      // Assert
      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('E074');
    });
  });

  // ==================== resolveContext() Tests ====================

  describe('resolveContext()', () => {
    it('should find workspace from path', async () => {
      // Arrange - set up context resolver
      const ctx: WorkspaceContext = {
        workspaceSlug: 'my-project',
        workspaceName: 'My Project',
        workspacePath: '/home/user/project',
        worktreePath: '/home/user/project',
        worktreeBranch: 'main',
        isMainWorktree: true,
        hasGit: true,
      };
      contextResolver.setContext('/home/user/project', ctx);

      // Act
      const result = await service.resolveContext('/home/user/project/src/file.ts');

      // Assert
      expect(result).not.toBeNull();
      expect(result?.workspaceSlug).toBe('my-project');
    });

    it('should return null for unregistered path', async () => {
      // Act - no context set up, so path won't resolve
      const result = await service.resolveContext('/home/user/unknown');

      // Assert
      expect(result).toBeNull();
    });
  });
});
