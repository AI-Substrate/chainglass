/**
 * WorkspaceChangeNotifierService integration tests.
 *
 * Per Subtask 001: WorkspaceChangeNotifierService - File Watching for CLI Changes
 *
 * These tests use the REAL chokidar file watcher and REAL filesystem
 * to verify the service works end-to-end with actual file changes.
 *
 * Tests create temporary directories, write real files, and verify
 * that callbacks are invoked when state.json files change.
 */

import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NodeFileSystemAdapter } from '@chainglass/shared';
import { WorkspaceChangeNotifierService } from '@chainglass/workflow';
import { ChokidarFileWatcherFactory } from '@chainglass/workflow';
import { Workspace } from '@chainglass/workflow';
import { FakeGitWorktreeResolver, FakeWorkspaceRegistryAdapter } from '@chainglass/workflow/fakes';
import type { GraphChangedEvent } from '@chainglass/workflow/interfaces';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('WorkspaceChangeNotifierService Integration', () => {
  let tempDir: string;
  let registryPath: string;
  let workspacePath: string;
  let service: WorkspaceChangeNotifierService;

  // Real implementations
  let realFilesystem: NodeFileSystemAdapter;
  let realWatcherFactory: ChokidarFileWatcherFactory;

  // Fakes (still needed for registry and worktree resolution)
  let fakeRegistry: FakeWorkspaceRegistryAdapter;
  let fakeWorktreeResolver: FakeGitWorktreeResolver;

  beforeEach(async () => {
    // Create unique temp directory for this test
    tempDir = join(
      tmpdir(),
      `wcns-integration-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    registryPath = join(tempDir, 'config', 'workspaces.json');
    workspacePath = join(tempDir, 'workspace1');

    // Create directory structure
    await mkdir(join(tempDir, 'config'), { recursive: true });
    await mkdir(join(workspacePath, '.chainglass', 'data', 'work-graphs', 'demo-graph'), {
      recursive: true,
    });

    // Write initial registry (for reference, though we use fake)
    await writeFile(
      registryPath,
      JSON.stringify({
        workspaces: { ws1: { path: workspacePath } },
      })
    );

    // Write initial state.json
    const stateFile = join(
      workspacePath,
      '.chainglass',
      'data',
      'work-graphs',
      'demo-graph',
      'state.json'
    );
    await writeFile(stateFile, JSON.stringify({ nodes: [] }));

    // Create real implementations
    realFilesystem = new NodeFileSystemAdapter();
    realWatcherFactory = new ChokidarFileWatcherFactory();

    // Create fakes for registry and worktree (we control these)
    fakeRegistry = new FakeWorkspaceRegistryAdapter();
    fakeWorktreeResolver = new FakeGitWorktreeResolver();

    // Set up workspace in fake registry
    const workspace = Workspace.create({
      slug: 'ws1',
      name: 'Test Workspace',
      path: workspacePath,
    });
    fakeRegistry.addWorkspace(workspace);

    // Set up worktree (single worktree = workspace path)
    fakeWorktreeResolver.setWorktrees(workspacePath, [
      {
        path: workspacePath,
        head: 'abc123def456abc123def456abc123def456abc1',
        branch: 'main',
        isDetached: false,
        isBare: false,
        isPrunable: false,
      },
    ]);

    // Create service with real filesystem and watcher, fake registry
    service = new WorkspaceChangeNotifierService(
      fakeRegistry,
      fakeWorktreeResolver,
      realFilesystem,
      realWatcherFactory,
      registryPath
    );
  });

  afterEach(async () => {
    // Stop service if running
    if (service?.isWatching()) {
      await service.stop();
    }

    // Clean up temp directory
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('emits GraphChangedEvent when state.json is modified', async () => {
    // Set up event capture with promise-based completion
    let resolveEvent: (event: GraphChangedEvent) => void;
    const eventPromise = new Promise<GraphChangedEvent>((resolve) => {
      resolveEvent = resolve;
    });

    service.onGraphChanged((event) => {
      resolveEvent(event);
    });

    await service.start();

    // Give watcher time to initialize (chokidar needs a moment)
    await sleep(200);

    // Modify state.json
    const stateFile = join(
      workspacePath,
      '.chainglass',
      'data',
      'work-graphs',
      'demo-graph',
      'state.json'
    );
    await writeFile(stateFile, JSON.stringify({ nodes: [{ id: 'new-node' }] }));

    // Wait for event with timeout
    const event = await Promise.race([
      eventPromise,
      sleep(5000).then(() => {
        throw new Error('Timeout: No GraphChangedEvent received within 5 seconds');
      }),
    ]);

    expect(event).toBeDefined();
    expect(event.graphSlug).toBe('demo-graph');
    expect(event.workspaceSlug).toBe('ws1');
    expect(event.worktreePath).toBe(workspacePath);
    expect(event.filePath).toBe(stateFile);
    expect(event.timestamp).toBeInstanceOf(Date);
  });

  it('ignores changes to non-state.json files', async () => {
    const events: GraphChangedEvent[] = [];
    service.onGraphChanged((event) => events.push(event));

    await service.start();
    await sleep(200);

    // Write to a different file (should be ignored)
    const layoutFile = join(
      workspacePath,
      '.chainglass',
      'data',
      'work-graphs',
      'demo-graph',
      'layout.json'
    );
    await writeFile(layoutFile, JSON.stringify({ layout: {} }));

    // Wait a bit for any potential event
    await sleep(500);

    expect(events).toHaveLength(0);
  });

  it('detects changes to multiple graphs', async () => {
    // Create a second graph directory
    const graph2Path = join(workspacePath, '.chainglass', 'data', 'work-graphs', 'second-graph');
    await mkdir(graph2Path, { recursive: true });
    await writeFile(join(graph2Path, 'state.json'), JSON.stringify({ nodes: [] }));

    const events: GraphChangedEvent[] = [];
    service.onGraphChanged((event) => events.push(event));

    await service.start();
    await sleep(200);

    // Modify both graphs
    const state1 = join(
      workspacePath,
      '.chainglass',
      'data',
      'work-graphs',
      'demo-graph',
      'state.json'
    );
    const state2 = join(
      workspacePath,
      '.chainglass',
      'data',
      'work-graphs',
      'second-graph',
      'state.json'
    );

    await writeFile(state1, JSON.stringify({ nodes: [{ id: '1' }] }));
    await sleep(300); // Wait for debounce
    await writeFile(state2, JSON.stringify({ nodes: [{ id: '2' }] }));

    // Wait for events
    await sleep(500);

    expect(events.length).toBeGreaterThanOrEqual(2);

    const graphSlugs = events.map((e) => e.graphSlug);
    expect(graphSlugs).toContain('demo-graph');
    expect(graphSlugs).toContain('second-graph');
  });

  it('stops watching after stop() is called', async () => {
    const events: GraphChangedEvent[] = [];
    service.onGraphChanged((event) => events.push(event));

    await service.start();
    await sleep(200);

    await service.stop();

    // Modify file after stop
    const stateFile = join(
      workspacePath,
      '.chainglass',
      'data',
      'work-graphs',
      'demo-graph',
      'state.json'
    );
    await writeFile(stateFile, JSON.stringify({ nodes: [{ id: 'after-stop' }] }));

    // Wait a bit
    await sleep(500);

    // Should not have received any events
    expect(events).toHaveLength(0);
  });
});

/**
 * Helper to sleep for a given number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
