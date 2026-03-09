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

import { FakeFileSystem } from '@chainglass/shared';
import { FakeProcessManager } from '@chainglass/shared';
import { Workspace } from '@chainglass/workflow';
import type { WorkspaceContext, WorkspaceInfo } from '@chainglass/workflow';
import { beforeEach, describe, expect, it } from 'vitest';
import { FakeGitWorktreeManager } from '../../../packages/workflow/src/fakes/fake-git-worktree-manager.js';
import { FakeGitWorktreeResolver } from '../../../packages/workflow/src/fakes/fake-git-worktree-resolver.js';
import { FakeWorkspaceContextResolver } from '../../../packages/workflow/src/fakes/fake-workspace-context-resolver.js';
import { FakeWorkspaceRegistryAdapter } from '../../../packages/workflow/src/fakes/fake-workspace-registry-adapter.js';
import { WorkspaceService } from '../../../packages/workflow/src/services/workspace.service.js';
import { WorktreeBootstrapRunner } from '../../../packages/workflow/src/services/worktree-bootstrap-runner.js';

describe('WorkspaceService', () => {
  let registryAdapter: FakeWorkspaceRegistryAdapter;
  let contextResolver: FakeWorkspaceContextResolver;
  let gitResolver: FakeGitWorktreeResolver;
  let gitManager: FakeGitWorktreeManager;
  let bootstrapRunner: WorktreeBootstrapRunner;
  let service: WorkspaceService;

  beforeEach(() => {
    registryAdapter = new FakeWorkspaceRegistryAdapter();
    contextResolver = new FakeWorkspaceContextResolver();
    gitResolver = new FakeGitWorktreeResolver();
    gitManager = new FakeGitWorktreeManager();
    const fakeFs = new FakeFileSystem();
    const fakePm = new FakeProcessManager();
    bootstrapRunner = new WorktreeBootstrapRunner(fakePm, fakeFs);
    service = new WorkspaceService(
      registryAdapter,
      contextResolver,
      gitResolver,
      gitManager,
      bootstrapRunner
    );
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

  // ==================== T012: updatePreferences() ====================

  describe('updatePreferences()', () => {
    it('should update emoji preference for existing workspace', async () => {
      /*
      Test Doc:
      - Why: Core use case — user picks an emoji for their workspace
      - Contract: updatePreferences(slug, {emoji}) → { success: true }, preference persisted
      - Quality Contribution: Validates the primary update flow
      */
      const ws = Workspace.create({
        name: 'Test',
        path: '/home/user/test',
        preferences: { emoji: '', color: '', starred: false, sortOrder: 0 },
      });
      registryAdapter.addWorkspace(ws);

      const result = await service.updatePreferences(ws.slug, { emoji: '🔮' });

      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);

      const loaded = await registryAdapter.load(ws.slug);
      expect(loaded.preferences.emoji).toBe('🔮');
    });

    it('should preserve existing preferences on partial update', async () => {
      /*
      Test Doc:
      - Why: Partial updates must not clobber other preferences
      - Contract: updatePreferences with only starred preserves emoji/color
      - Quality Contribution: Prevents accidental data loss during partial update
      */
      const ws = Workspace.create({
        name: 'Test',
        path: '/home/user/test',
        preferences: { emoji: '🦊', color: 'orange', starred: false, sortOrder: 3 },
      });
      registryAdapter.addWorkspace(ws);

      await service.updatePreferences(ws.slug, { starred: true });

      const loaded = await registryAdapter.load(ws.slug);
      expect(loaded.preferences.emoji).toBe('🦊');
      expect(loaded.preferences.color).toBe('orange');
      expect(loaded.preferences.starred).toBe(true);
      expect(loaded.preferences.sortOrder).toBe(3);
    });

    it('should reject invalid emoji not in palette', async () => {
      /*
      Test Doc:
      - Why: Palette validation prevents garbage data
      - Contract: updatePreferences with invalid emoji → { success: false }
      - Quality Contribution: Ensures data quality
      */
      const ws = Workspace.create({ name: 'Test', path: '/home/user/test' });
      registryAdapter.addWorkspace(ws);

      const result = await service.updatePreferences(ws.slug, { emoji: '💩' });

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should reject invalid color not in palette', async () => {
      /*
      Test Doc:
      - Why: Color validation prevents garbage data
      - Contract: updatePreferences with invalid color → { success: false }
      - Quality Contribution: Ensures data quality
      */
      const ws = Workspace.create({ name: 'Test', path: '/home/user/test' });
      registryAdapter.addWorkspace(ws);

      const result = await service.updatePreferences(ws.slug, { color: 'neon-chartreuse' });

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should allow empty string for emoji (unset)', async () => {
      /*
      Test Doc:
      - Why: DYK-P1-05 — empty string means "unset", must be valid
      - Contract: updatePreferences with emoji='' → { success: true }
      - Quality Contribution: Prevents one-way door where emoji can never be removed
      */
      const ws = Workspace.create({
        name: 'Test',
        path: '/home/user/test',
        preferences: { emoji: '🔮', color: 'purple', starred: false, sortOrder: 0 },
      });
      registryAdapter.addWorkspace(ws);

      const result = await service.updatePreferences(ws.slug, { emoji: '' });

      expect(result.success).toBe(true);
      const loaded = await registryAdapter.load(ws.slug);
      expect(loaded.preferences.emoji).toBe('');
    });

    it('should allow empty string for color (unset)', async () => {
      /*
      Test Doc:
      - Why: DYK-P1-05 — empty string means "unset", must be valid
      - Contract: updatePreferences with color='' → { success: true }
      */
      const ws = Workspace.create({
        name: 'Test',
        path: '/home/user/test',
        preferences: { emoji: '🔮', color: 'purple', starred: false, sortOrder: 0 },
      });
      registryAdapter.addWorkspace(ws);

      const result = await service.updatePreferences(ws.slug, { color: '' });

      expect(result.success).toBe(true);
      const loaded = await registryAdapter.load(ws.slug);
      expect(loaded.preferences.color).toBe('');
    });

    it('should return error for non-existent workspace', async () => {
      /*
      Test Doc:
      - Why: Must handle missing workspace gracefully
      - Contract: updatePreferences(missing) → { success: false }
      - Quality Contribution: Prevents uncaught exceptions
      */
      const result = await service.updatePreferences('nonexistent', { emoji: '🔮' });

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should reject negative sortOrder', async () => {
      /*
      Test Doc:
      - Why: FIX-Q1 — sortOrder must be non-negative integer
      - Contract: updatePreferences with sortOrder < 0 → { success: false }
      - Quality Contribution: Prevents invalid display ordering
      */
      const ws = Workspace.create({ name: 'Test', path: '/home/user/test' });
      registryAdapter.addWorkspace(ws);

      const result = await service.updatePreferences(ws.slug, { sortOrder: -1 });
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should reject NaN sortOrder', async () => {
      /*
      Test Doc:
      - Why: FIX-Q1 — non-finite sortOrder must be rejected
      - Contract: updatePreferences with NaN sortOrder → { success: false }
      - Quality Contribution: Prevents data corruption from invalid numeric input
      */
      const ws = Workspace.create({ name: 'Test', path: '/home/user/test' });
      registryAdapter.addWorkspace(ws);

      const result = await service.updatePreferences(ws.slug, { sortOrder: Number.NaN });
      expect(result.success).toBe(false);
    });

    it('should accept valid sortOrder', async () => {
      /*
      Test Doc:
      - Why: FIX-Q1 — valid non-negative integers must be accepted
      - Contract: updatePreferences with sortOrder >= 0 → { success: true }
      - Quality Contribution: Confirms happy path with hardened validation
      */
      const ws = Workspace.create({ name: 'Test', path: '/home/user/test' });
      registryAdapter.addWorkspace(ws);

      const result = await service.updatePreferences(ws.slug, { sortOrder: 5 });
      expect(result.success).toBe(true);
      const loaded = await registryAdapter.load(ws.slug);
      expect(loaded.preferences.sortOrder).toBe(5);
    });
  });

  // ==================== Plan 069: previewCreateWorktree() Tests ====================

  describe('previewCreateWorktree()', () => {
    it('should return preview with allocated ordinal for plain slug', async () => {
      const ws = Workspace.create({ name: 'Test', path: '/home/user/project' });
      registryAdapter.addWorkspace(ws);
      contextResolver.setWorkspaceInfo(ws.slug, {
        slug: ws.slug,
        name: ws.name,
        path: ws.path,
        createdAt: ws.createdAt,
        hasGit: true,
        worktrees: [],
      });
      gitManager.setBranches(['main', '067-foo', '068-bar'], ['origin/main']);
      gitManager.setPlanFolders(['065-old']);

      const result = await service.previewCreateWorktree({
        workspaceSlug: ws.slug,
        requestedName: 'my-feature',
      });

      expect(result.ordinal).toBe(69);
      expect(result.normalizedSlug).toBe('my-feature');
      expect(result.branchName).toBe('069-my-feature');
      expect(result.worktreePath).toContain('069-my-feature');
    });

    it('should use provided ordinal for pasted NNN-slug', async () => {
      const ws = Workspace.create({ name: 'Test', path: '/home/user/project' });
      registryAdapter.addWorkspace(ws);
      contextResolver.setWorkspaceInfo(ws.slug, {
        slug: ws.slug,
        name: ws.name,
        path: ws.path,
        createdAt: ws.createdAt,
        hasGit: true,
        worktrees: [],
      });
      gitManager.setBranches(['main'], ['origin/main']);

      const result = await service.previewCreateWorktree({
        workspaceSlug: ws.slug,
        requestedName: '042-custom',
      });

      expect(result.ordinal).toBe(42);
      expect(result.branchName).toBe('042-custom');
    });
  });

  // ==================== Plan 069: createWorktree() Tests ====================

  describe('createWorktree()', () => {
    it('should block on dirty main before create', async () => {
      const ws = Workspace.create({ name: 'Test', path: '/home/user/project' });
      registryAdapter.addWorkspace(ws);
      contextResolver.setWorkspaceInfo(ws.slug, {
        slug: ws.slug,
        name: ws.name,
        path: ws.path,
        createdAt: ws.createdAt,
        hasGit: true,
        worktrees: [],
      });
      gitManager.setMainStatus('dirty', { detail: 'Uncommitted changes' });

      const result = await service.createWorktree({
        workspaceSlug: ws.slug,
        requestedName: 'my-feature',
      });

      expect(result.status).toBe('blocked');
      if (result.status === 'blocked') {
        expect(result.errors.length).toBeGreaterThan(0);
      }
    });

    it('should block on diverged main', async () => {
      const ws = Workspace.create({ name: 'Test', path: '/home/user/project' });
      registryAdapter.addWorkspace(ws);
      contextResolver.setWorkspaceInfo(ws.slug, {
        slug: ws.slug,
        name: ws.name,
        path: ws.path,
        createdAt: ws.createdAt,
        hasGit: true,
        worktrees: [],
      });
      gitManager.setMainStatus('diverged', { detail: 'Local and remote diverged' });

      const result = await service.createWorktree({
        workspaceSlug: ws.slug,
        requestedName: 'my-feature',
      });

      expect(result.status).toBe('blocked');
    });

    it('should create worktree with skipped bootstrap', async () => {
      const ws = Workspace.create({ name: 'Test', path: '/home/user/project' });
      registryAdapter.addWorkspace(ws);
      contextResolver.setWorkspaceInfo(ws.slug, {
        slug: ws.slug,
        name: ws.name,
        path: ws.path,
        createdAt: ws.createdAt,
        hasGit: true,
        worktrees: [],
      });
      gitManager.setMainStatus('clean');
      gitManager.setSyncResult('already-up-to-date');
      gitManager.setBranches(['main'], ['origin/main']);
      gitManager.setCreateResult('created', {
        worktreePath: '/home/user/069-my-feature',
        branchName: '069-my-feature',
      });

      const result = await service.createWorktree({
        workspaceSlug: ws.slug,
        requestedName: 'my-feature',
      });

      expect(result.status).toBe('created');
      if (result.status === 'created') {
        expect(result.branchName).toContain('my-feature');
        expect(result.bootstrapStatus.outcome).toBe('skipped');
      }
    });

    it('should return blocked for non-existent workspace', async () => {
      const result = await service.createWorktree({
        workspaceSlug: 'nonexistent',
        requestedName: 'my-feature',
      });

      expect(result.status).toBe('blocked');
    });
  });
});
