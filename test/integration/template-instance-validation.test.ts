/**
 * Integration tests: Template/Instance lifecycle with real filesystem.
 *
 * Why: Validates the full template lifecycle against real disk I/O and
 * real YAML parsing — Phase 2 only used FakeFileSystem.
 *
 * Contract: TemplateService (saveFrom, instantiate, refresh) produces
 * correct filesystem structures when backed by NodeFileSystemAdapter.
 *
 * Usage Notes: Each test creates a temp workspace, copies units, builds
 * a graph imperatively via PositionalGraphService, then exercises
 * template operations. Cleanup in afterEach.
 *
 * Quality Contribution: Proves AC-6 (independent instances), AC-7/AC-12
 * (template isolation), AC-8 (multi-instance), AC-16 (refresh safety).
 *
 * Worked Example: Build a 1-node graph → saveFrom → instantiate →
 * verify instance has graph.yaml + state.json + units/.
 */

import * as nodeFs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { PositionalGraphAdapter, PositionalGraphService } from '@chainglass/positional-graph';
import type { IWorkUnitLoader } from '@chainglass/positional-graph';
import { NodeFileSystemAdapter, PathResolverAdapter, YamlParserAdapter } from '@chainglass/shared';
import type { WorkspaceContext } from '@chainglass/workflow';
import { InstanceAdapter, TemplateAdapter, TemplateService } from '@chainglass/workflow';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// ─── Test Infrastructure (T003) ────────────────────────────────────

const FIXTURES_ROOT = path.resolve(import.meta.dirname, '../../dev/test-graphs');

interface TestContext {
  tmpDir: string;
  ctx: WorkspaceContext;
  graphService: PositionalGraphService;
  templateService: TemplateService;
}

let testCtx: TestContext;

function createCtx(worktreePath: string): WorkspaceContext {
  return {
    workspaceSlug: 'integration-test',
    workspaceName: 'Integration Test',
    workspacePath: worktreePath,
    worktreePath,
    worktreeBranch: null,
    isMainWorktree: true,
    hasGit: false,
  };
}

async function setupTestWorkspace(): Promise<TestContext> {
  const tmpDir = await nodeFs.mkdtemp(path.join(os.tmpdir(), 'tpl-integ-'));
  const ctx = createCtx(tmpDir);

  // Create directory structure
  const unitsDir = path.join(tmpDir, '.chainglass', 'units');
  const workflowsDir = path.join(tmpDir, '.chainglass', 'data', 'workflows');
  await nodeFs.mkdir(unitsDir, { recursive: true });
  await nodeFs.mkdir(workflowsDir, { recursive: true });

  // Copy smoke fixture units
  const fixtureUnits = path.join(FIXTURES_ROOT, 'smoke', 'units');
  await nodeFs.cp(fixtureUnits, unitsDir, { recursive: true });

  // Make scripts executable
  const scripts = await findScripts(unitsDir);
  for (const script of scripts) {
    await nodeFs.chmod(script, 0o755);
  }

  // Wire real services
  const fs = new NodeFileSystemAdapter();
  const pathResolver = new PathResolverAdapter();
  const yamlParser = new YamlParserAdapter();

  const graphAdapter = new PositionalGraphAdapter(fs, pathResolver);
  const loader: IWorkUnitLoader = buildLoader(tmpDir, yamlParser);
  const graphService = new PositionalGraphService(
    fs,
    pathResolver,
    yamlParser,
    graphAdapter,
    loader
  );

  const templateAdapter = new TemplateAdapter(fs, pathResolver);
  const instanceAdapter = new InstanceAdapter(fs, pathResolver);
  const templateService = new TemplateService(
    fs,
    pathResolver,
    yamlParser,
    templateAdapter,
    instanceAdapter
  );

  return { tmpDir, ctx, graphService, templateService };
}

function buildLoader(workspacePath: string, yamlParser: YamlParserAdapter): IWorkUnitLoader {
  return {
    async load(_ctx: WorkspaceContext, slug: string) {
      const unitYamlPath = path.join(workspacePath, '.chainglass', 'units', slug, 'unit.yaml');
      try {
        const content = await nodeFs.readFile(unitYamlPath, 'utf-8');
        const parsed = yamlParser.parse<{
          slug: string;
          type: 'agent' | 'code' | 'user-input';
          inputs?: Array<{ name: string; type: 'data' | 'file'; required: boolean }>;
          outputs: Array<{ name: string; type: 'data' | 'file'; required: boolean }>;
        }>(content, unitYamlPath);
        return {
          unit: {
            slug: parsed.slug,
            type: parsed.type,
            inputs: parsed.inputs ?? [],
            outputs: parsed.outputs,
          },
          errors: [],
        };
      } catch {
        return { errors: [{ message: `Unit '${slug}' not found`, code: 'UNIT_NOT_FOUND' }] };
      }
    },
  };
}

async function findScripts(dir: string): Promise<string[]> {
  const results: string[] = [];
  const entries = await nodeFs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await findScripts(fullPath)));
    } else if (entry.name.endsWith('.sh')) {
      results.push(fullPath);
    }
  }
  return results;
}

async function buildSimpleGraph(
  ctx: WorkspaceContext,
  service: PositionalGraphService,
  slug: string
) {
  const createResult = await service.create(ctx, slug);
  const line0 = createResult.lineId ?? '';
  const addResult = await service.addNode(ctx, slug, line0, 'ping');
  const nodeId = addResult.nodeId ?? '';
  return { line0, nodeId };
}

// ─── Test Suite ────────────────────────────────────────────────────

describe('Template/Instance integration (real filesystem)', () => {
  beforeEach(async () => {
    testCtx = await setupTestWorkspace();
  });

  afterEach(async () => {
    if (testCtx?.tmpDir) {
      await nodeFs.rm(testCtx.tmpDir, { recursive: true, force: true });
    }
  });

  // ─── T004: Full lifecycle ───────────────────────────────────────

  describe('save-from → instantiate → verify', () => {
    /**
     * Why: Proves the full lifecycle works with real filesystem I/O.
     * Contract: saveFrom + instantiate produce correct directory structures.
     * Usage Notes: Builds graph imperatively, saves as template, instantiates.
     * Quality Contribution: AC-6 — instantiation creates independent copy.
     * Worked Example: 1-node graph → template → instance with pending state.
     */

    it('should create instance with graph.yaml, state.json, and units', async () => {
      const { ctx, graphService, templateService } = testCtx;

      // Build graph
      await buildSimpleGraph(ctx, graphService, 'my-graph');

      // Save as template
      const saveResult = await templateService.saveFrom(ctx, 'my-graph', 'my-tpl');
      expect(saveResult.errors).toHaveLength(0);
      expect(saveResult.data).not.toBeNull();

      // Instantiate
      const instResult = await templateService.instantiate(ctx, 'my-tpl', 'run-1');
      expect(instResult.errors).toHaveLength(0);

      // Verify instance structure
      const instanceDir = path.join(testCtx.tmpDir, '.chainglass', 'instances', 'my-tpl', 'run-1');
      expect(await fileExists(path.join(instanceDir, 'graph.yaml'))).toBe(true);
      expect(await fileExists(path.join(instanceDir, 'state.json'))).toBe(true);
      expect(await fileExists(path.join(instanceDir, 'instance.yaml'))).toBe(true);
      expect(await fileExists(path.join(instanceDir, 'units', 'ping', 'unit.yaml'))).toBe(true);

      // Verify state.json is pending
      const stateContent = await nodeFs.readFile(path.join(instanceDir, 'state.json'), 'utf-8');
      const state = JSON.parse(stateContent);
      expect(state.graph_status).toBe('pending');

      // Verify graph.yaml is parseable
      const graphContent = await nodeFs.readFile(path.join(instanceDir, 'graph.yaml'), 'utf-8');
      const yamlParser = new YamlParserAdapter();
      const graphDef = yamlParser.parse<{ slug: string; lines: unknown[] }>(
        graphContent,
        'graph.yaml'
      );
      expect(graphDef.slug).toBe('my-graph');
      expect(graphDef.lines).toHaveLength(1);
    });

    it('should not include state.json in template', async () => {
      const { ctx, graphService, templateService } = testCtx;
      await buildSimpleGraph(ctx, graphService, 'my-graph');
      await templateService.saveFrom(ctx, 'my-graph', 'my-tpl');

      const templateDir = path.join(
        testCtx.tmpDir,
        '.chainglass',
        'templates',
        'workflows',
        'my-tpl'
      );
      expect(await fileExists(path.join(templateDir, 'state.json'))).toBe(false);
      expect(await fileExists(path.join(templateDir, 'graph.yaml'))).toBe(true);
    });
  });

  // ─── T005: Multiple instances ───────────────────────────────────

  describe('multiple instances from same template', () => {
    /**
     * Why: Proves instances are independent — separate state, separate data.
     * Contract: Two instantiate() calls produce isolated directories.
     * Usage Notes: Modifies state in one instance, verifies the other is unaffected.
     * Quality Contribution: AC-8 — multiple independent instances.
     * Worked Example: Instantiate twice → modify state in run-1 → run-2 unchanged.
     */

    it('should create independent instances with separate state', async () => {
      const { ctx, graphService, templateService } = testCtx;
      await buildSimpleGraph(ctx, graphService, 'my-graph');
      await templateService.saveFrom(ctx, 'my-graph', 'my-tpl');

      // Create two instances
      await templateService.instantiate(ctx, 'my-tpl', 'run-1');
      await templateService.instantiate(ctx, 'my-tpl', 'run-2');

      const inst1Dir = path.join(testCtx.tmpDir, '.chainglass', 'instances', 'my-tpl', 'run-1');
      const inst2Dir = path.join(testCtx.tmpDir, '.chainglass', 'instances', 'my-tpl', 'run-2');

      // Both exist
      expect(await fileExists(path.join(inst1Dir, 'state.json'))).toBe(true);
      expect(await fileExists(path.join(inst2Dir, 'state.json'))).toBe(true);

      // Modify state in run-1
      await nodeFs.writeFile(
        path.join(inst1Dir, 'state.json'),
        JSON.stringify({ graph_status: 'complete', nodes: {} })
      );

      // Verify run-2 is unaffected
      const state2 = JSON.parse(await nodeFs.readFile(path.join(inst2Dir, 'state.json'), 'utf-8'));
      expect(state2.graph_status).toBe('pending');
    });
  });

  // ─── T006: Refresh safety ──────────────────────────────────────

  describe('refresh during active run', () => {
    /**
     * Why: Proves refresh warns on active run but still updates units.
     * Contract: refresh() returns ACTIVE_RUN_WARNING when state is in_progress.
     * Usage Notes: Manually sets state.json to in_progress before refresh.
     * Quality Contribution: AC-16 — active run warning on refresh.
     * Worked Example: Set in_progress → refresh → warning + units updated.
     */

    it('should warn on active run and still refresh units', async () => {
      const { ctx, graphService, templateService } = testCtx;
      await buildSimpleGraph(ctx, graphService, 'my-graph');
      await templateService.saveFrom(ctx, 'my-graph', 'my-tpl');
      await templateService.instantiate(ctx, 'my-tpl', 'run-1');

      // Set state to in_progress
      const instanceDir = path.join(testCtx.tmpDir, '.chainglass', 'instances', 'my-tpl', 'run-1');
      await nodeFs.writeFile(
        path.join(instanceDir, 'state.json'),
        JSON.stringify({
          graph_status: 'in_progress',
          updated_at: new Date().toISOString(),
          nodes: {},
        })
      );

      // Refresh
      const result = await templateService.refresh(ctx, 'my-tpl', 'run-1');
      expect(result.data).not.toBeNull();
      expect(result.data?.refreshedUnits).toContain('ping');

      // Should have warning
      const warnings = result.errors.filter((e) => e.code === 'ACTIVE_RUN_WARNING');
      expect(warnings).toHaveLength(1);

      // state.json should NOT be changed by refresh (refresh only touches units)
      const stateAfter = JSON.parse(
        await nodeFs.readFile(path.join(instanceDir, 'state.json'), 'utf-8')
      );
      expect(stateAfter.graph_status).toBe('in_progress');
    });
  });

  // ─── T007: Template isolation ──────────────────────────────────

  describe('template modification does not affect instance', () => {
    /**
     * Why: Proves instances are independent from templates after creation.
     * Contract: Modifying template files does not change instance files.
     * Usage Notes: Modify template prompt, verify instance unchanged, then
     * refresh to verify instance picks up the change.
     * Quality Contribution: AC-7 (template isolation), AC-12 (unit isolation).
     * Worked Example: Change template prompt → instance unchanged → refresh → updated.
     */

    it('should not propagate template changes to existing instance', async () => {
      const { ctx, graphService, templateService } = testCtx;
      await buildSimpleGraph(ctx, graphService, 'my-graph');
      await templateService.saveFrom(ctx, 'my-graph', 'my-tpl');
      await templateService.instantiate(ctx, 'my-tpl', 'run-1');

      // Read original instance unit content
      const instanceUnitYaml = path.join(
        testCtx.tmpDir,
        '.chainglass',
        'instances',
        'my-tpl',
        'run-1',
        'units',
        'ping',
        'unit.yaml'
      );
      const originalContent = await nodeFs.readFile(instanceUnitYaml, 'utf-8');

      // Modify template unit
      const templateUnitYaml = path.join(
        testCtx.tmpDir,
        '.chainglass',
        'templates',
        'workflows',
        'my-tpl',
        'units',
        'ping',
        'unit.yaml'
      );
      await nodeFs.writeFile(
        templateUnitYaml,
        'slug: ping\ntype: code\nversion: 2.0.0\nMODIFIED: true\n'
      );

      // Instance should be unchanged
      const afterModify = await nodeFs.readFile(instanceUnitYaml, 'utf-8');
      expect(afterModify).toBe(originalContent);

      // Now refresh — instance should pick up the change
      const result = await templateService.refresh(ctx, 'my-tpl', 'run-1');
      expect(result.data?.refreshedUnits).toContain('ping');

      const afterRefresh = await nodeFs.readFile(instanceUnitYaml, 'utf-8');
      expect(afterRefresh).toContain('MODIFIED: true');
      expect(afterRefresh).not.toBe(originalContent);
    });
  });
});

// ─── Helpers ─────────────────────────────────────────────────────

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await nodeFs.stat(filePath);
    return true;
  } catch {
    return false;
  }
}
