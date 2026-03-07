/**
 * Seed workspace helper — creates a test workspace for harness verification.
 *
 * Approach (from DYK Phase 4):
 *   1. Create workspace directory on host at scratch/harness-test-workspace/
 *   2. git init + initial commit so worktree APIs return real data
 *   3. Write the workspace registry JSON inside the container via docker exec
 *   4. Verify the workspace appears in GET /api/workspaces
 *
 * The app does NOT auto-discover directories — workspaces must be registered
 * in ~/.config/chainglass/workspaces.json inside the container.
 */

import { execFileSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { computePorts } from '../ports/allocator.js';

const execFileAsync = promisify(execFile);

const REPO_ROOT = path.resolve(import.meta.dirname ?? '.', '../../..');
const WORKSPACE_DIR_NAME = 'harness-test-workspace';
const HOST_WORKSPACE_PATH = path.join(REPO_ROOT, 'scratch', WORKSPACE_DIR_NAME);
const CONTAINER_WORKSPACE_PATH = `/app/scratch/${WORKSPACE_DIR_NAME}`;
const CONTAINER_NAME_PREFIX = 'chainglass-';

export interface SeedResult {
  workspace: {
    name: string;
    slug: string;
    path: string;
    hostPath: string;
  };
  created: boolean;
  registered: boolean;
  verified: boolean;
}

function getContainerName(): string {
  const ports = computePorts();
  return `${CONTAINER_NAME_PREFIX}${ports.worktree}`;
}

function createWorkspaceDir(): boolean {
  if (existsSync(HOST_WORKSPACE_PATH)) {
    // Check if it's already a git repo
    if (existsSync(path.join(HOST_WORKSPACE_PATH, '.git'))) {
      return false; // Already exists
    }
  }

  mkdirSync(HOST_WORKSPACE_PATH, { recursive: true });

  // git init + initial commit
  execFileSync('git', ['init'], { cwd: HOST_WORKSPACE_PATH });
  writeFileSync(
    path.join(HOST_WORKSPACE_PATH, 'README.md'),
    '# Harness Test Workspace\n\nSeeded by `harness seed` for integration testing.\n',
  );
  execFileSync('git', ['add', '.'], { cwd: HOST_WORKSPACE_PATH });
  execFileSync('git', ['commit', '-m', 'Initial seed commit'], {
    cwd: HOST_WORKSPACE_PATH,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Harness',
      GIT_AUTHOR_EMAIL: 'harness@chainglass.dev',
      GIT_COMMITTER_NAME: 'Harness',
      GIT_COMMITTER_EMAIL: 'harness@chainglass.dev',
    },
  });

  return true;
}

function buildSeedEntry(): Record<string, unknown> {
  return {
    slug: WORKSPACE_DIR_NAME,
    name: 'Harness Test Workspace',
    path: CONTAINER_WORKSPACE_PATH,
    createdAt: new Date().toISOString(),
    preferences: {
      emoji: '🧪',
      color: '',
      starred: false,
      sortOrder: 0,
      starredWorktrees: [],
      worktreePreferences: {},
      sdkSettings: {},
      sdkShortcuts: {},
      sdkMru: [],
    },
  };
}

async function registerInContainer(): Promise<boolean> {
  const containerName = getContainerName();
  const seedEntry = buildSeedEntry();

  try {
    // Read-modify-write: read existing registry, upsert our entry, write back
    const readResult = await execFileAsync('docker', [
      'exec', containerName,
      'sh', '-c',
      'cat /root/.config/chainglass/workspaces.json 2>/dev/null || echo "null"',
    ], { timeout: 10_000 });

    let registry: { version: number; workspaces: Record<string, unknown>[] };
    try {
      const existing = JSON.parse(readResult.stdout.trim());
      if (existing && existing.version === 1 && Array.isArray(existing.workspaces)) {
        registry = existing;
      } else {
        registry = { version: 1, workspaces: [] };
      }
    } catch {
      registry = { version: 1, workspaces: [] };
    }

    // Upsert: remove old harness entry if present, add fresh one
    registry.workspaces = registry.workspaces.filter(
      (w) => (w as { slug?: string }).slug !== WORKSPACE_DIR_NAME,
    );
    registry.workspaces.push(seedEntry);

    const registryJson = JSON.stringify(registry, null, 2);

    await execFileAsync('docker', [
      'exec', containerName,
      'sh', '-c',
      `mkdir -p /root/.config/chainglass && cat > /root/.config/chainglass/workspaces.json << 'HARNESS_EOF'
${registryJson}
HARNESS_EOF`,
    ], { timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}

async function verifyRegistration(): Promise<boolean> {
  const ports = computePorts();
  try {
    const res = await fetch(`http://127.0.0.1:${ports.app}/api/workspaces?include=worktrees`);
    if (!res.ok) return false;
    const data = (await res.json()) as { workspaces: Array<{ slug: string }> };
    return data.workspaces.some((w) => w.slug === WORKSPACE_DIR_NAME);
  } catch {
    return false;
  }
}

export async function seedWorkspace(): Promise<SeedResult> {
  const created = createWorkspaceDir();
  const registered = await registerInContainer();
  const verified = registered ? await verifyRegistration() : false;

  return {
    workspace: {
      name: 'Harness Test Workspace',
      slug: WORKSPACE_DIR_NAME,
      path: CONTAINER_WORKSPACE_PATH,
      hostPath: HOST_WORKSPACE_PATH,
    },
    created,
    registered,
    verified,
  };
}
