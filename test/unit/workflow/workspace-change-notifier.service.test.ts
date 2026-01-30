/**
 * WorkspaceChangeNotifierService unit tests.
 *
 * Per Subtask 001: WorkspaceChangeNotifierService - File Watching for CLI Changes
 * Per Constitution Principle 4: Use fakes over mocks for testing
 *
 * Testing approach: TDD (RED phase - tests written before implementation)
 * All tests use FakeFileWatcher and other fakes - no real filesystem.
 */

import { FakeFileSystem } from '@chainglass/shared';
import { Workspace } from '@chainglass/workflow';
// This import will fail until ST004 is complete (TDD RED phase)
import { WorkspaceChangeNotifierService } from '@chainglass/workflow';
import { type FakeFileWatcher, FakeFileWatcherFactory } from '@chainglass/workflow/fakes';
import { FakeWorkspaceRegistryAdapter } from '@chainglass/workflow/fakes';
import { FakeGitWorktreeResolver } from '@chainglass/workflow/fakes';
import type { GraphChangedEvent, Worktree } from '@chainglass/workflow/interfaces';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Helper to create valid Worktree objects for tests */
function createWorktree(path: string, branch: string | null = 'main'): Worktree {
  return {
    path,
    head: 'abc123def456abc123def456abc123def456abc1',
    branch,
    isDetached: branch === null,
    isBare: false,
    isPrunable: false,
  };
}

describe('WorkspaceChangeNotifierService', () => {
  // Fakes
  let fakeRegistry: FakeWorkspaceRegistryAdapter;
  let fakeWorktreeResolver: FakeGitWorktreeResolver;
  let fakeFilesystem: FakeFileSystem;
  let fakeWatcherFactory: FakeFileWatcherFactory;

  // Service under test
  let service: WorkspaceChangeNotifierService;

  // Test data
  const testWorkspace = Workspace.create({
    slug: 'test-workspace',
    name: 'Test Workspace',
    path: '/home/user/test-workspace',
    createdAt: new Date(),
  });

  const testRegistryPath = '/home/user/.config/chainglass/workspaces.json';

  beforeEach(() => {
    // Create fresh fakes
    fakeRegistry = new FakeWorkspaceRegistryAdapter();
    fakeWorktreeResolver = new FakeGitWorktreeResolver();
    fakeFilesystem = new FakeFileSystem();
    fakeWatcherFactory = new FakeFileWatcherFactory();

    // Set up default workspace
    fakeRegistry.addWorkspace(testWorkspace);

    // Set up worktree (no additional worktrees, just main path)
    fakeWorktreeResolver.setWorktrees(testWorkspace.path, [createWorktree(testWorkspace.path)]);

    // Set up filesystem to show work-graphs directory exists
    const workGraphsPath = `${testWorkspace.path}/.chainglass/data/work-graphs`;
    fakeFilesystem.setDir(workGraphsPath);

    // Create service
    service = new WorkspaceChangeNotifierService(
      fakeRegistry,
      fakeWorktreeResolver,
      fakeFilesystem,
      fakeWatcherFactory,
      testRegistryPath
    );
  });

  describe('start()', () => {
    it('reads workspace registry on start', async () => {
      await service.start();

      expect(fakeRegistry.listCalls).toHaveLength(1);
    });

    it('resolves worktrees for each workspace', async () => {
      await service.start();

      expect(fakeWorktreeResolver.detectWorktreesCalls).toHaveLength(1);
      expect(fakeWorktreeResolver.detectWorktreesCalls[0].repoPath).toBe(testWorkspace.path);
    });

    it('creates watchers for registry and workgraph paths', async () => {
      await service.start();

      // Should create 2 watchers: one for registry, one for workgraphs
      expect(fakeWatcherFactory.getWatcherCount()).toBe(2);
    });

    it('watches the registry file for changes', async () => {
      await service.start();

      const registryWatcher = fakeWatcherFactory.getWatcher(0);
      expect(registryWatcher).toBeDefined();
      expect(registryWatcher?.getWatchedPaths()).toContain(testRegistryPath);
    });

    it('watches all worktree work-graphs directories', async () => {
      await service.start();

      const workgraphWatcher = fakeWatcherFactory.getWatcher(1);
      const expectedPath = `${testWorkspace.path}/.chainglass/data/work-graphs`;
      expect(workgraphWatcher).toBeDefined();
      expect(workgraphWatcher?.getWatchedPaths()).toContain(expectedPath);
    });

    it('throws if already started', async () => {
      await service.start();

      await expect(service.start()).rejects.toThrow('already watching');
    });

    it('sets isWatching() to true', async () => {
      expect(service.isWatching()).toBe(false);

      await service.start();

      expect(service.isWatching()).toBe(true);
    });

    it('handles multiple workspaces', async () => {
      // Add second workspace
      const secondWorkspace = Workspace.create({
        slug: 'second-workspace',
        name: 'Second Workspace',
        path: '/home/user/second-workspace',
        createdAt: new Date(),
      });
      fakeRegistry.addWorkspace(secondWorkspace);
      fakeWorktreeResolver.setWorktrees(secondWorkspace.path, [
        createWorktree(secondWorkspace.path),
      ]);
      fakeFilesystem.setDir(`${secondWorkspace.path}/.chainglass/data/work-graphs`);

      await service.start();

      const workgraphWatcher = fakeWatcherFactory.getWatcher(1);
      const watchedPaths = workgraphWatcher?.getWatchedPaths();
      expect(watchedPaths).toHaveLength(2);
      expect(watchedPaths).toContain(`${testWorkspace.path}/.chainglass/data/work-graphs`);
      expect(watchedPaths).toContain(`${secondWorkspace.path}/.chainglass/data/work-graphs`);
    });

    it('handles workspace with multiple worktrees', async () => {
      // Add linked worktree
      fakeWorktreeResolver.setWorktrees(testWorkspace.path, [
        createWorktree(testWorkspace.path),
        createWorktree('/home/user/test-workspace-feature', 'feature'),
      ]);
      fakeFilesystem.setDir('/home/user/test-workspace-feature/.chainglass/data/work-graphs');

      await service.start();

      const workgraphWatcher = fakeWatcherFactory.getWatcher(1);
      const watchedPaths = workgraphWatcher?.getWatchedPaths();
      expect(watchedPaths).toContain(`${testWorkspace.path}/.chainglass/data/work-graphs`);
      expect(watchedPaths).toContain(
        '/home/user/test-workspace-feature/.chainglass/data/work-graphs'
      );
    });

    it('skips worktrees without .chainglass/data/work-graphs directory', async () => {
      // Reset filesystem so directory doesn't exist
      fakeFilesystem.reset();

      await service.start();

      const workgraphWatcher = fakeWatcherFactory.getWatcher(1);
      // Watcher created but no paths added
      expect(workgraphWatcher?.getWatchedPaths()).toHaveLength(0);
    });
  });

  describe('onGraphChanged()', () => {
    it('emits event when state.json changes', async () => {
      const events: GraphChangedEvent[] = [];
      service.onGraphChanged((e) => events.push(e));

      await service.start();

      // Simulate file change
      const workgraphWatcher = fakeWatcherFactory.getWatcher(1) as FakeFileWatcher;
      const changedPath = `${testWorkspace.path}/.chainglass/data/work-graphs/demo-graph/state.json`;
      workgraphWatcher.simulateChange(changedPath);

      expect(events).toHaveLength(1);
      expect(events[0].graphSlug).toBe('demo-graph');
    });

    it('extracts correct graphSlug from path', async () => {
      const events: GraphChangedEvent[] = [];
      service.onGraphChanged((e) => events.push(e));

      await service.start();

      const workgraphWatcher = fakeWatcherFactory.getWatcher(1) as FakeFileWatcher;
      const changedPath = `${testWorkspace.path}/.chainglass/data/work-graphs/my-complex-workflow/state.json`;
      workgraphWatcher.simulateChange(changedPath);

      expect(events[0].graphSlug).toBe('my-complex-workflow');
    });

    it('resolves workspaceSlug from worktree path', async () => {
      const events: GraphChangedEvent[] = [];
      service.onGraphChanged((e) => events.push(e));

      await service.start();

      const workgraphWatcher = fakeWatcherFactory.getWatcher(1) as FakeFileWatcher;
      const changedPath = `${testWorkspace.path}/.chainglass/data/work-graphs/demo-graph/state.json`;
      workgraphWatcher.simulateChange(changedPath);

      expect(events[0].workspaceSlug).toBe('test-workspace');
      expect(events[0].worktreePath).toBe(testWorkspace.path);
    });

    it('ignores non-state.json file changes', async () => {
      const events: GraphChangedEvent[] = [];
      service.onGraphChanged((e) => events.push(e));

      await service.start();

      const workgraphWatcher = fakeWatcherFactory.getWatcher(1) as FakeFileWatcher;
      // These should all be ignored
      workgraphWatcher.simulateChange(
        `${testWorkspace.path}/.chainglass/data/work-graphs/demo-graph/layout.json`
      );
      workgraphWatcher.simulateChange(
        `${testWorkspace.path}/.chainglass/data/work-graphs/demo-graph/work-graph.yaml`
      );
      workgraphWatcher.simulateAdd(
        `${testWorkspace.path}/.chainglass/data/work-graphs/new-graph/state.json`
      );

      expect(events).toHaveLength(0);
    });

    it('allows multiple callbacks to be registered', async () => {
      const events1: GraphChangedEvent[] = [];
      const events2: GraphChangedEvent[] = [];
      service.onGraphChanged((e) => events1.push(e));
      service.onGraphChanged((e) => events2.push(e));

      await service.start();

      const workgraphWatcher = fakeWatcherFactory.getWatcher(1) as FakeFileWatcher;
      workgraphWatcher.simulateChange(
        `${testWorkspace.path}/.chainglass/data/work-graphs/demo-graph/state.json`
      );

      expect(events1).toHaveLength(1);
      expect(events2).toHaveLength(1);
    });

    it('returns unsubscribe function that works', async () => {
      const events: GraphChangedEvent[] = [];
      const unsubscribe = service.onGraphChanged((e) => events.push(e));

      await service.start();

      const workgraphWatcher = fakeWatcherFactory.getWatcher(1) as FakeFileWatcher;

      // First change should be received
      workgraphWatcher.simulateChange(
        `${testWorkspace.path}/.chainglass/data/work-graphs/demo-graph/state.json`
      );
      expect(events).toHaveLength(1);

      // Unsubscribe
      unsubscribe();

      // Second change should NOT be received
      workgraphWatcher.simulateChange(
        `${testWorkspace.path}/.chainglass/data/work-graphs/demo-graph/state.json`
      );
      expect(events).toHaveLength(1);
    });

    it('includes correct filePath and timestamp in event', async () => {
      const events: GraphChangedEvent[] = [];
      service.onGraphChanged((e) => events.push(e));

      await service.start();

      const workgraphWatcher = fakeWatcherFactory.getWatcher(1) as FakeFileWatcher;
      const changedPath = `${testWorkspace.path}/.chainglass/data/work-graphs/demo-graph/state.json`;
      workgraphWatcher.simulateChange(changedPath);

      expect(events[0].filePath).toBe(changedPath);
      expect(events[0].timestamp).toBeInstanceOf(Date);
    });

    it('handles callback errors gracefully', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      const goodEvents: GraphChangedEvent[] = [];
      service.onGraphChanged(() => {
        throw new Error('Callback exploded!');
      });
      service.onGraphChanged((e) => goodEvents.push(e));

      await service.start();

      const workgraphWatcher = fakeWatcherFactory.getWatcher(1) as FakeFileWatcher;
      workgraphWatcher.simulateChange(
        `${testWorkspace.path}/.chainglass/data/work-graphs/demo-graph/state.json`
      );

      // Good callback still received event
      expect(goodEvents).toHaveLength(1);
      expect(consoleError).toHaveBeenCalled();

      consoleError.mockRestore();
    });
  });

  describe('rescan()', () => {
    it('adds watchers for new workspaces', async () => {
      await service.start();

      const workgraphWatcher = fakeWatcherFactory.getWatcher(1) as FakeFileWatcher;
      expect(workgraphWatcher.getWatchedPaths()).toHaveLength(1);

      // Add new workspace
      const newWorkspace = Workspace.create({
        slug: 'new-workspace',
        name: 'New Workspace',
        path: '/home/user/new-workspace',
        createdAt: new Date(),
      });
      fakeRegistry.addWorkspace(newWorkspace);
      fakeWorktreeResolver.setWorktrees(newWorkspace.path, [createWorktree(newWorkspace.path)]);
      fakeFilesystem.setDir(`${newWorkspace.path}/.chainglass/data/work-graphs`);

      await service.rescan();

      expect(workgraphWatcher.getWatchedPaths()).toHaveLength(2);
      expect(workgraphWatcher.getWatchedPaths()).toContain(
        `${newWorkspace.path}/.chainglass/data/work-graphs`
      );
    });

    it('removes watchers for deleted workspaces', async () => {
      // Start with two workspaces
      const secondWorkspace = Workspace.create({
        slug: 'second-workspace',
        name: 'Second',
        path: '/home/user/second',
        createdAt: new Date(),
      });
      fakeRegistry.addWorkspace(secondWorkspace);
      fakeWorktreeResolver.setWorktrees(secondWorkspace.path, [
        createWorktree(secondWorkspace.path),
      ]);
      fakeFilesystem.setDir(`${secondWorkspace.path}/.chainglass/data/work-graphs`);

      await service.start();

      const workgraphWatcher = fakeWatcherFactory.getWatcher(1) as FakeFileWatcher;
      expect(workgraphWatcher.getWatchedPaths()).toHaveLength(2);

      // Remove second workspace
      fakeRegistry.remove(secondWorkspace.slug);

      await service.rescan();

      expect(workgraphWatcher.getWatchedPaths()).toHaveLength(1);
      expect(workgraphWatcher.getWatchedPaths()).not.toContain(
        `${secondWorkspace.path}/.chainglass/data/work-graphs`
      );
    });

    it('handles new worktrees in existing workspace', async () => {
      await service.start();

      const workgraphWatcher = fakeWatcherFactory.getWatcher(1) as FakeFileWatcher;
      expect(workgraphWatcher.getWatchedPaths()).toHaveLength(1);

      // Add new worktree to existing workspace
      fakeWorktreeResolver.setWorktrees(testWorkspace.path, [
        createWorktree(testWorkspace.path),
        createWorktree('/home/user/test-workspace-feature', 'feature'),
      ]);
      fakeFilesystem.setDir('/home/user/test-workspace-feature/.chainglass/data/work-graphs');

      await service.rescan();

      expect(workgraphWatcher.getWatchedPaths()).toHaveLength(2);
    });

    it('is called automatically on registry file change', async () => {
      await service.start();

      const registryWatcher = fakeWatcherFactory.getWatcher(0) as FakeFileWatcher;
      const workgraphWatcher = fakeWatcherFactory.getWatcher(1) as FakeFileWatcher;

      // Add new workspace to registry
      const newWorkspace = Workspace.create({
        slug: 'auto-detected',
        name: 'Auto Detected',
        path: '/home/user/auto-detected',
        createdAt: new Date(),
      });
      fakeRegistry.addWorkspace(newWorkspace);
      fakeWorktreeResolver.setWorktrees(newWorkspace.path, [createWorktree(newWorkspace.path)]);
      fakeFilesystem.setDir(`${newWorkspace.path}/.chainglass/data/work-graphs`);

      // Simulate registry file change
      registryWatcher.simulateChange(testRegistryPath);

      // Give async rescan time to complete
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(workgraphWatcher.getWatchedPaths()).toContain(
        `${newWorkspace.path}/.chainglass/data/work-graphs`
      );
    });
  });

  describe('stop()', () => {
    it('closes all file watchers', async () => {
      await service.start();

      const registryWatcher = fakeWatcherFactory.getWatcher(0) as FakeFileWatcher;
      const workgraphWatcher = fakeWatcherFactory.getWatcher(1) as FakeFileWatcher;

      await service.stop();

      expect(registryWatcher.isClosed()).toBe(true);
      expect(workgraphWatcher.isClosed()).toBe(true);
    });

    it('clears all registered callbacks', async () => {
      const events: GraphChangedEvent[] = [];
      service.onGraphChanged((e) => events.push(e));

      await service.start();
      await service.stop();

      // Restart service
      fakeWatcherFactory.clear();
      await service.start();

      // Callback should not fire (was cleared)
      const newWorkgraphWatcher = fakeWatcherFactory.getLastWatcher() as FakeFileWatcher;
      newWorkgraphWatcher.simulateChange(
        `${testWorkspace.path}/.chainglass/data/work-graphs/demo-graph/state.json`
      );

      expect(events).toHaveLength(0);
    });

    it('sets isWatching() to false', async () => {
      await service.start();
      expect(service.isWatching()).toBe(true);

      await service.stop();
      expect(service.isWatching()).toBe(false);
    });

    it('allows restart after stop', async () => {
      await service.start();
      await service.stop();

      // Clear factory for fresh watchers
      fakeWatcherFactory.clear();

      // Should not throw
      await service.start();
      expect(service.isWatching()).toBe(true);
    });

    it('is idempotent (can call multiple times)', async () => {
      await service.start();

      // Should not throw
      await service.stop();
      await service.stop();
      await service.stop();

      expect(service.isWatching()).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('handles empty workspace list gracefully', async () => {
      // Clear all workspaces
      fakeRegistry.remove(testWorkspace.slug);

      await service.start();

      // Should create registry watcher but workgraph watcher has no paths
      expect(fakeWatcherFactory.getWatcherCount()).toBe(2);
      const workgraphWatcher = fakeWatcherFactory.getWatcher(1) as FakeFileWatcher;
      expect(workgraphWatcher.getWatchedPaths()).toHaveLength(0);
    });

    it('handles workspace with path that does not exist', async () => {
      // Workspace path doesn't exist
      fakeWorktreeResolver.setWorktrees(testWorkspace.path, []);

      await service.start();

      // Should not throw, just skip this workspace
      expect(service.isWatching()).toBe(true);
    });

    it('handles missing .chainglass/data directory gracefully', async () => {
      // Reset filesystem so directory doesn't exist
      fakeFilesystem.reset();

      await service.start();

      // Watcher created but no paths added
      const workgraphWatcher = fakeWatcherFactory.getWatcher(1) as FakeFileWatcher;
      expect(workgraphWatcher.getWatchedPaths()).toHaveLength(0);
    });

    it('handles watcher error events without crashing', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      await service.start();

      const workgraphWatcher = fakeWatcherFactory.getWatcher(1) as FakeFileWatcher;
      workgraphWatcher.simulateError(new Error('Permission denied'));

      // Service should still be running
      expect(service.isWatching()).toBe(true);
      expect(consoleError).toHaveBeenCalled();

      consoleError.mockRestore();
    });

    it('expands ~ in registry path', async () => {
      // Clear factory to start fresh for this test
      fakeWatcherFactory.clear();

      // Create service with ~ path
      const serviceWithTilde = new WorkspaceChangeNotifierService(
        fakeRegistry,
        fakeWorktreeResolver,
        fakeFilesystem,
        fakeWatcherFactory,
        '~/.config/chainglass/workspaces.json'
      );

      await serviceWithTilde.start();

      // Registry watcher is created first (index 0)
      const registryWatcher = fakeWatcherFactory.getWatcher(0) as FakeFileWatcher;
      const watchedPaths = registryWatcher.getWatchedPaths();

      // Should have expanded ~ to HOME
      expect(watchedPaths.some((p) => p.includes(process.env.HOME || '/home'))).toBe(true);
      expect(watchedPaths.some((p) => p.startsWith('~'))).toBe(false);

      await serviceWithTilde.stop();
    });
  });
});
