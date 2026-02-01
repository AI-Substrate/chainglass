#!/usr/bin/env npx tsx
/**
 * Demo: CentralWatcherService + WorkGraphWatcherAdapter
 *
 * Starts a real chokidar-backed watcher on a temp directory,
 * registers the WorkGraphWatcherAdapter, and logs every event
 * to the console. Run the companion `trigger.ts` script in
 * another terminal to see events flow through.
 *
 * Usage:
 *   npx tsx scripts/file-watcher/watch.ts
 *
 * Then in another terminal:
 *   npx tsx scripts/file-watcher/trigger.ts
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { NodeFileSystemAdapter } from '@chainglass/shared';
import {
  CentralWatcherService,
  ChokidarFileWatcherFactory,
  FakeGitWorktreeResolver,
  FakeWorkspaceRegistryAdapter,
  Workspace,
  WorkGraphWatcherAdapter,
} from '@chainglass/workflow';

// ---------------------------------------------------------------------------
// Setup: temp directory that mimics a real workspace
// ---------------------------------------------------------------------------
const DEMO_DIR = join(tmpdir(), 'chainglass-watcher-demo');
const WORKSPACE_PATH = join(DEMO_DIR, 'my-workspace');
const DATA_DIR = join(WORKSPACE_PATH, '.chainglass', 'data');
const GRAPH_DIR = join(DATA_DIR, 'work-graphs', 'demo-graph');
const STATE_FILE = join(GRAPH_DIR, 'state.json');
const REGISTRY_FILE = join(DEMO_DIR, 'workspaces.json');

// Write out the path so the trigger script knows where to write
const MARKER_FILE = join(DEMO_DIR, 'demo-paths.json');

async function setup() {
  await mkdir(GRAPH_DIR, { recursive: true });
  // Seed initial state.json so chokidar can detect "change" events
  await writeFile(STATE_FILE, JSON.stringify({ nodes: [], edges: [] }, null, 2));
  // Write an empty registry file (CentralWatcherService watches this too)
  await writeFile(REGISTRY_FILE, '[]');
  // Write marker so trigger.ts knows paths
  await writeFile(
    MARKER_FILE,
    JSON.stringify({ dataDir: DATA_DIR, stateFile: STATE_FILE, graphDir: GRAPH_DIR }, null, 2),
  );
}

// ---------------------------------------------------------------------------
// Wire up the watcher
// ---------------------------------------------------------------------------
async function main() {
  await setup();

  console.log('--- CentralWatcherService Demo ---');
  console.log(`Workspace : ${WORKSPACE_PATH}`);
  console.log(`Data dir  : ${DATA_DIR}`);
  console.log(`State file: ${STATE_FILE}`);
  console.log('');

  // Fake registry + resolver (we control the workspace list)
  const registry = new FakeWorkspaceRegistryAdapter();
  const resolver = new FakeGitWorktreeResolver();

  const workspace = Workspace.create({
    name: 'demo-workspace',
    path: WORKSPACE_PATH,
  });
  registry.addWorkspace(workspace);

  resolver.setWorktrees(WORKSPACE_PATH, [
    {
      path: WORKSPACE_PATH,
      head: 'abc1234',
      branch: 'main',
      isDetached: false,
      isBare: false,
      isPrunable: false,
    },
  ]);

  // Real filesystem + real chokidar
  const service = new CentralWatcherService(
    registry,
    resolver,
    new NodeFileSystemAdapter(),
    new ChokidarFileWatcherFactory(),
    REGISTRY_FILE,
  );

  // Register the WorkGraphWatcherAdapter
  const adapter = new WorkGraphWatcherAdapter();
  const unsubscribe = adapter.onGraphChanged((event) => {
    console.log('');
    console.log('=== WorkGraphChangedEvent ===');
    console.log(`  graphSlug     : ${event.graphSlug}`);
    console.log(`  workspaceSlug : ${event.workspaceSlug}`);
    console.log(`  filePath      : ${event.filePath}`);
    console.log(`  timestamp     : ${event.timestamp.toISOString()}`);
    console.log('=============================');
    console.log('');
  });
  service.registerAdapter(adapter);

  // Start watching
  await service.start();
  console.log('Watcher started. Waiting for file changes...');
  console.log('Run `npx tsx scripts/file-watcher/trigger.ts` in another terminal.');
  console.log('Press Ctrl+C to stop.');
  console.log('');

  // Keep alive until Ctrl+C
  const shutdown = async () => {
    console.log('\nShutting down...');
    unsubscribe();
    await service.stop();
    console.log('Watcher stopped.');
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
