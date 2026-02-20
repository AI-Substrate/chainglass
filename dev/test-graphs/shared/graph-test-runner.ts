/**
 * Plan 037: Test Graph Infrastructure — Graph Test Runner
 *
 * Provides withTestGraph() lifecycle helper for integration tests.
 * Composes createTestServiceStack() from e2e-helpers — does NOT reinvent service wiring.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import type { IPositionalGraphService } from '@chainglass/positional-graph/interfaces';
import { NodeFileSystemAdapter, YamlParserAdapter } from '@chainglass/shared';
import type { WorkspaceContext } from '@chainglass/workflow';
import {
  type TestServiceStack,
  createTestServiceStack,
} from '../../../test/helpers/positional-graph-e2e-helpers.js';
import { makeScriptsExecutable } from './helpers.js';

/** Base context available to all test graph callbacks. */
export interface TestGraphContext {
  /** Workspace context for service calls. */
  ctx: WorkspaceContext;
  /** Positional graph service with real filesystem adapters. */
  service: IPositionalGraphService;
  /** Absolute path to the temp workspace root. */
  workspacePath: string;
}

/** Fixture root directory (dev/test-graphs/) resolved relative to this file. */
const FIXTURES_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

/**
 * Build a real IWorkUnitLoader that reads unit.yaml from the temp workspace.
 * This ensures addNode() validates units actually exist on disk.
 *
 * DYK#2: createTestServiceStack accepts IWorkUnitLoader (narrow), not IWorkUnitService.
 * We build a minimal loader that reads unit.yaml and maps to NarrowWorkUnit.
 */
function buildDiskLoader(workspacePath: string) {
  const nodeFs = new NodeFileSystemAdapter();
  const yamlParser = new YamlParserAdapter();

  return {
    async load(_ctx: WorkspaceContext, slug: string) {
      const unitPath = path.join(workspacePath, '.chainglass', 'units', slug, 'unit.yaml');
      try {
        const content = await nodeFs.readFile(unitPath);
        const parsed = yamlParser.parse(content, unitPath) as {
          slug: string;
          type: 'agent' | 'code' | 'user-input';
          inputs?: Array<{
            name: string;
            type: 'data' | 'file';
            required: boolean;
            description?: string;
          }>;
          outputs?: Array<{
            name: string;
            type: 'data' | 'file';
            required: boolean;
            description?: string;
          }>;
        };
        return {
          unit: {
            slug: parsed.slug,
            type: parsed.type,
            inputs: (parsed.inputs ?? []).map((i) => ({
              name: i.name,
              type: i.type,
              required: i.required,
              description: i.description,
            })),
            outputs: (parsed.outputs ?? []).map((o) => ({
              name: o.name,
              type: o.type,
              required: o.required,
              description: o.description,
            })),
          },
          errors: [],
        };
      } catch {
        return {
          unit: undefined,
          errors: [{ code: 'UNIT_NOT_FOUND', message: `Unit '${slug}' not found at ${unitPath}` }],
        };
      }
    },
  };
}

/**
 * Run a test with a fully-wired test graph fixture.
 *
 * Lifecycle:
 * 1. Create temp workspace (mkdtemp)
 * 2. Create .chainglass/units/ and data/workflows/ directories
 * 3. Copy work unit fixtures from dev/test-graphs/<fixtureName>/units/
 * 4. Make all .sh scripts executable
 * 5. Wire PositionalGraphService with real IWorkUnitLoader (reads from disk)
 * 6. Call testFn with TestGraphContext
 * 7. Clean up temp workspace (rm -rf)
 *
 * Phase 3 extensibility: Build orchestration stack on top of tgc.service in your test.
 */
export async function withTestGraph(
  fixtureName: string,
  testFn: (tgc: TestGraphContext) => Promise<void>
): Promise<void> {
  // Validate fixtureName to prevent path traversal
  if (!/^[a-z0-9_-]+$/.test(fixtureName)) {
    throw new Error(`Invalid fixtureName: "${fixtureName}" (must match ^[a-z0-9_-]+$)`);
  }

  // 1. Determine fixture source
  const fixtureDir = path.join(FIXTURES_ROOT, fixtureName);
  const unitsSource = path.join(fixtureDir, 'units');

  // Verify fixture exists
  try {
    await fs.stat(unitsSource);
  } catch {
    throw new Error(`Test graph fixture '${fixtureName}' not found at ${unitsSource}`);
  }

  // 2. Build the real disk-reading loader (wired to temp workspace path later)
  // We need to create the temp dir first, then build the loader pointing at it
  const os = await import('node:os');
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), `tg-${fixtureName}-`));
  let stackWorkspacePath: string | undefined;

  try {
    // 3. Create required directories
    const unitsTarget = path.join(tmpDir, '.chainglass', 'units');
    const workflowsDir = path.join(tmpDir, '.chainglass', 'data', 'workflows');
    await fs.mkdir(unitsTarget, { recursive: true });
    await fs.mkdir(workflowsDir, { recursive: true });

    // 4. Copy units from fixture
    await fs.cp(unitsSource, unitsTarget, { recursive: true });

    // 5. Make scripts executable
    await makeScriptsExecutable(unitsTarget);

    // 6. Build loader and service stack
    const loader = buildDiskLoader(tmpDir);
    const stack: TestServiceStack = await createTestServiceStack(`tg-${fixtureName}`, loader);
    stackWorkspacePath = stack.workspacePath;

    // Override the workspace path to use OUR temp dir (createTestServiceStack makes its own)
    // We need to use our tmpDir because that's where units are copied
    const tgc: TestGraphContext = {
      ctx: {
        workspaceSlug: `tg-${fixtureName}`,
        workspaceName: `Test Graph: ${fixtureName}`,
        workspacePath: tmpDir,
        worktreePath: tmpDir,
        worktreeBranch: null,
        isMainWorktree: true,
        hasGit: false,
      },
      service: stack.service,
      workspacePath: tmpDir,
    };

    // 7. Run the test
    await testFn(tgc);
  } finally {
    // 8. Cleanup our temp dir + the one createTestServiceStack allocated
    await fs.rm(tmpDir, { recursive: true, force: true });
    if (stackWorkspacePath && stackWorkspacePath !== tmpDir) {
      await fs.rm(stackWorkspacePath, { recursive: true, force: true });
    }
  }
}
