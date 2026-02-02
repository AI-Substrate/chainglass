#!/usr/bin/env npx tsx
/**
 * Demo: Trigger file changes that CentralWatcherService will detect.
 *
 * Writes to the temp directory created by `watch.ts`. Run watch.ts
 * first, then run this script to see events appear in the watcher.
 *
 * Usage:
 *   npx tsx scripts/file-watcher/trigger.ts           # update existing graph
 *   npx tsx scripts/file-watcher/trigger.ts new        # create a new graph
 *   npx tsx scripts/file-watcher/trigger.ts burst      # rapid-fire 5 updates
 *   npx tsx scripts/file-watcher/trigger.ts non-graph  # write a non-graph file (adapter ignores it)
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DEMO_DIR = join(tmpdir(), 'chainglass-watcher-demo');
const MARKER_FILE = join(DEMO_DIR, 'demo-paths.json');

interface DemoPaths {
  dataDir: string;
  stateFile: string;
  graphDir: string;
}

async function loadPaths(): Promise<DemoPaths> {
  try {
    const raw = await readFile(MARKER_FILE, 'utf-8');
    return JSON.parse(raw) as DemoPaths;
  } catch {
    console.error('Could not read demo paths. Is watch.ts running?');
    console.error(`Expected marker at: ${MARKER_FILE}`);
    process.exit(1);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomId(): string {
  return Math.random().toString(36).slice(2, 8);
}

// ---------------------------------------------------------------------------
// Trigger modes
// ---------------------------------------------------------------------------

async function updateExistingGraph(paths: DemoPaths) {
  const data = {
    nodes: [
      { id: `node-${randomId()}`, type: 'task', label: `Task ${Date.now()}` },
      { id: `node-${randomId()}`, type: 'input', label: 'Input data' },
    ],
    edges: [{ from: 'node-1', to: 'node-2' }],
    updatedAt: new Date().toISOString(),
  };

  console.log(`Writing to: ${paths.stateFile}`);
  await writeFile(paths.stateFile, JSON.stringify(data, null, 2));
  console.log('Done. The watcher should detect this change.');
}

async function createNewGraph(paths: DemoPaths) {
  const slug = `graph-${randomId()}`;
  const graphDir = join(paths.dataDir, 'work-graphs', slug);
  const stateFile = join(graphDir, 'state.json');

  await mkdir(graphDir, { recursive: true });

  const data = {
    nodes: [{ id: 'initial', type: 'start', label: `New graph ${slug}` }],
    edges: [],
    createdAt: new Date().toISOString(),
  };

  console.log(`Creating new graph: ${slug}`);
  console.log(`Writing to: ${stateFile}`);
  await writeFile(stateFile, JSON.stringify(data, null, 2));
  console.log('Done. The watcher should detect the new state.json.');
}

async function burstUpdates(paths: DemoPaths) {
  console.log('Sending 5 rapid updates (200ms apart)...');
  for (let i = 1; i <= 5; i++) {
    const data = {
      nodes: [{ id: `burst-${i}`, label: `Burst update ${i}` }],
      burst: i,
      updatedAt: new Date().toISOString(),
    };
    await writeFile(paths.stateFile, JSON.stringify(data, null, 2));
    console.log(`  [${i}/5] written`);
    if (i < 5) await sleep(200);
  }
  console.log('Done. Due to awaitWriteFinish, some events may be coalesced.');
}

async function writeNonGraphFile(paths: DemoPaths) {
  const filePath = join(paths.dataDir, 'random-file.txt');
  console.log(`Writing non-graph file: ${filePath}`);
  await writeFile(filePath, `Random data at ${new Date().toISOString()}\n`);
  console.log('Done. The CentralWatcherService will see this, but');
  console.log('WorkGraphWatcherAdapter will IGNORE it (not a state.json under work-graphs/).');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const paths = await loadPaths();
  const mode = process.argv[2] ?? 'update';

  console.log('--- Trigger File Change ---');
  console.log('');

  switch (mode) {
    case 'update':
      await updateExistingGraph(paths);
      break;
    case 'new':
      await createNewGraph(paths);
      break;
    case 'burst':
      await burstUpdates(paths);
      break;
    case 'non-graph':
      await writeNonGraphFile(paths);
      break;
    default:
      console.log('Unknown mode. Use: update | new | burst | non-graph');
      process.exit(1);
  }
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
