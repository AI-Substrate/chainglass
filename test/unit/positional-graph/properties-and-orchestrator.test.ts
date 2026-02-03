import { PositionalGraphService } from '@chainglass/positional-graph';
import { PositionalGraphAdapter } from '@chainglass/positional-graph/adapter';
import type {
  IPositionalGraphService,
  IWorkUnitLoader,
} from '@chainglass/positional-graph/interfaces';
import {
  GraphOrchestratorSettingsSchema,
  LineOrchestratorSettingsSchema,
  NodeConfigSchema,
  NodeOrchestratorSettingsSchema,
  NodePropertiesSchema,
} from '@chainglass/positional-graph/schemas';
import { FakeFileSystem, FakePathResolver, YamlParserAdapter } from '@chainglass/shared';
import type { WorkspaceContext } from '@chainglass/workflow';
import { beforeEach, describe, expect, it } from 'vitest';

function createTestContext(worktreePath = '/workspace/my-project'): WorkspaceContext {
  return {
    workspaceSlug: 'test-workspace',
    workspaceName: 'Test Workspace',
    workspacePath: worktreePath,
    worktreePath,
    worktreeBranch: 'main',
    isMainWorktree: true,
  };
}

const stubWorkUnitLoader: IWorkUnitLoader = {
  async load() {
    return { unit: { slug: 'stub', inputs: [], outputs: [] }, errors: [] };
  },
};

function createTestService(fs: FakeFileSystem, pathResolver: FakePathResolver) {
  const yamlParser = new YamlParserAdapter();
  const adapter = new PositionalGraphAdapter(fs, pathResolver);
  return new PositionalGraphService(fs, pathResolver, yamlParser, adapter, stubWorkUnitLoader);
}

describe('Properties and Orchestrator Settings', () => {
  let fs: FakeFileSystem;
  let pathResolver: FakePathResolver;
  let service: IPositionalGraphService;
  let ctx: WorkspaceContext;
  let yamlParser: YamlParserAdapter;

  beforeEach(() => {
    fs = new FakeFileSystem();
    pathResolver = new FakePathResolver();
    yamlParser = new YamlParserAdapter();
    service = createTestService(fs, pathResolver);
    ctx = createTestContext();
  });

  // ============================================
  // Schema validation
  // ============================================

  describe('Schema validation', () => {
    it('NodeConfigSchema parses without properties or orchestratorSettings', () => {
      const result = NodeConfigSchema.parse({
        id: 'test-a3f',
        unit_slug: 'test-unit',
        created_at: '2026-02-01T00:00:00Z',
      });
      expect(result.properties).toEqual({});
      expect(result.orchestratorSettings.execution).toBe('serial');
      expect(result.orchestratorSettings.waitForPrevious).toBe(true);
    });

    it('NodePropertiesSchema accepts arbitrary keys', () => {
      const result = NodePropertiesSchema.parse({ anything: 'goes', count: 42 });
      expect(result.anything).toBe('goes');
      expect(result.count).toBe(42);
    });

    it('NodeOrchestratorSettingsSchema applies defaults for empty object', () => {
      const result = NodeOrchestratorSettingsSchema.parse({});
      expect(result.execution).toBe('serial');
      expect(result.waitForPrevious).toBe(true);
    });

    it('NodeOrchestratorSettingsSchema rejects unknown keys', () => {
      const result = NodeOrchestratorSettingsSchema.safeParse({ bogus: 1 });
      expect(result.success).toBe(false);
    });

    it('LineOrchestratorSettingsSchema applies defaults', () => {
      const result = LineOrchestratorSettingsSchema.parse({});
      expect(result.transition).toBe('auto');
      expect(result.autoStartLine).toBe(true);
    });

    it('GraphOrchestratorSettingsSchema is empty', () => {
      const result = GraphOrchestratorSettingsSchema.parse({});
      expect(result).toEqual({});
    });
  });

  // ============================================
  // Service: properties round-trip
  // ============================================

  describe('Properties round-trip', () => {
    it('set and get node properties', async () => {
      const { lineId } = await service.create(ctx, 'test-graph');
      const addResult = await service.addNode(ctx, 'test-graph', lineId, 'simple-task');
      const nodeId = addResult.nodeId as string;

      const setResult = await service.updateNodeProperties(ctx, 'test-graph', nodeId, {
        name: 'My Coder',
        priority: 5,
      });
      expect(setResult.errors).toEqual([]);

      // Read node.yaml and verify
      const nodeDir = `/workspace/my-project/.chainglass/data/workflows/test-graph/nodes/${nodeId}`;
      const nodeYaml = await fs.readFile(pathResolver.join(nodeDir, 'node.yaml'));
      const config = yamlParser.parse<Record<string, unknown>>(nodeYaml, 'node.yaml');
      const props = config.properties as Record<string, unknown>;
      expect(props.name).toBe('My Coder');
      expect(props.priority).toBe(5);
    });

    it('deep-merge preserves existing properties', async () => {
      const { lineId } = await service.create(ctx, 'test-graph');
      const addResult = await service.addNode(ctx, 'test-graph', lineId, 'simple-task');
      const nodeId = addResult.nodeId as string;

      await service.updateNodeProperties(ctx, 'test-graph', nodeId, { a: 1, b: 2 });
      await service.updateNodeProperties(ctx, 'test-graph', nodeId, { b: 3, c: 4 });

      const nodeDir = `/workspace/my-project/.chainglass/data/workflows/test-graph/nodes/${nodeId}`;
      const nodeYaml = await fs.readFile(pathResolver.join(nodeDir, 'node.yaml'));
      const config = yamlParser.parse<Record<string, unknown>>(nodeYaml, 'node.yaml');
      const props = config.properties as Record<string, unknown>;
      expect(props.a).toBe(1);
      expect(props.b).toBe(3);
      expect(props.c).toBe(4);
    });

    it('set and get line properties', async () => {
      const { lineId } = await service.create(ctx, 'test-graph');

      const setResult = await service.updateLineProperties(ctx, 'test-graph', lineId, {
        color: 'blue',
      });
      expect(setResult.errors).toEqual([]);

      const loadResult = await service.load(ctx, 'test-graph');
      const line = loadResult.definition?.lines[0];
      expect(line?.properties.color).toBe('blue');
    });

    it('set and get graph properties', async () => {
      await service.create(ctx, 'test-graph');

      const setResult = await service.updateGraphProperties(ctx, 'test-graph', {
        author: 'jak',
      });
      expect(setResult.errors).toEqual([]);

      const loadResult = await service.load(ctx, 'test-graph');
      expect(loadResult.definition?.properties.author).toBe('jak');
    });
  });

  // ============================================
  // Service: orchestrator settings round-trip
  // ============================================

  describe('Orchestrator settings round-trip', () => {
    it('set and get node orchestrator settings', async () => {
      const { lineId } = await service.create(ctx, 'test-graph');
      const addResult = await service.addNode(ctx, 'test-graph', lineId, 'simple-task');
      const nodeId = addResult.nodeId as string;

      const setResult = await service.updateNodeOrchestratorSettings(ctx, 'test-graph', nodeId, {
        execution: 'parallel',
        waitForPrevious: false,
      });
      expect(setResult.errors).toEqual([]);

      const showResult = await service.showNode(ctx, 'test-graph', nodeId);
      expect(showResult.execution).toBe('parallel');
    });

    it('partial update preserves existing orch fields', async () => {
      const { lineId } = await service.create(ctx, 'test-graph');
      const addResult = await service.addNode(ctx, 'test-graph', lineId, 'simple-task');
      const nodeId = addResult.nodeId as string;

      // Set execution to parallel
      await service.updateNodeOrchestratorSettings(ctx, 'test-graph', nodeId, {
        execution: 'parallel',
      });

      // Set waitForPrevious without touching execution
      await service.updateNodeOrchestratorSettings(ctx, 'test-graph', nodeId, {
        waitForPrevious: false,
      });

      // Both should be set
      const nodeDir = `/workspace/my-project/.chainglass/data/workflows/test-graph/nodes/${nodeId}`;
      const nodeYaml = await fs.readFile(pathResolver.join(nodeDir, 'node.yaml'));
      const config = yamlParser.parse<Record<string, unknown>>(nodeYaml, 'node.yaml');
      const orch = config.orchestratorSettings as Record<string, unknown>;
      expect(orch.execution).toBe('parallel');
      expect(orch.waitForPrevious).toBe(false);
    });

    it('set and get line orchestrator settings', async () => {
      const { lineId } = await service.create(ctx, 'test-graph');

      const setResult = await service.updateLineOrchestratorSettings(ctx, 'test-graph', lineId, {
        transition: 'manual',
        autoStartLine: false,
      });
      expect(setResult.errors).toEqual([]);

      const showResult = await service.show(ctx, 'test-graph');
      expect(showResult.lines?.[0].transition).toBe('manual');
    });

    it('rejects unknown orchestrator keys', async () => {
      const { lineId } = await service.create(ctx, 'test-graph');
      const addResult = await service.addNode(ctx, 'test-graph', lineId, 'simple-task');
      const nodeId = addResult.nodeId as string;

      const result = await service.updateNodeOrchestratorSettings(ctx, 'test-graph', nodeId, {
        bogusKey: true,
      } as Record<string, unknown>);

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].code).toBe('E170');
    });
  });

  // ============================================
  // Backfill migration
  // ============================================

  describe('Backfill migration', () => {
    it('loads old-format node YAML with top-level execution', async () => {
      // Create a graph normally
      const { lineId } = await service.create(ctx, 'test-graph');
      const addResult = await service.addNode(ctx, 'test-graph', lineId, 'simple-task');
      const nodeId = addResult.nodeId as string;

      // Manually overwrite node.yaml with old format (top-level execution, no orchestratorSettings)
      const nodeDir = `/workspace/my-project/.chainglass/data/workflows/test-graph/nodes/${nodeId}`;
      const nodePath = pathResolver.join(nodeDir, 'node.yaml');
      const oldFormatYaml = yamlParser.stringify({
        id: nodeId,
        unit_slug: 'simple-task',
        execution: 'parallel',
        created_at: '2026-02-01T00:00:00Z',
      });
      await fs.writeFile(nodePath, oldFormatYaml);

      // Load via service — should backfill execution into orchestratorSettings
      const showResult = await service.showNode(ctx, 'test-graph', nodeId);
      expect(showResult.errors).toEqual([]);
      expect(showResult.execution).toBe('parallel');
    });

    it('loads old-format graph YAML with top-level transition on lines', async () => {
      // Create a graph normally
      await service.create(ctx, 'test-graph');

      // Manually overwrite graph.yaml with old format
      const graphDir = '/workspace/my-project/.chainglass/data/workflows/test-graph';
      const graphPath = pathResolver.join(graphDir, 'graph.yaml');
      const oldFormatYaml = yamlParser.stringify({
        slug: 'test-graph',
        version: '0.1.0',
        created_at: '2026-02-01T00:00:00Z',
        lines: [{ id: 'line-abc', transition: 'manual', nodes: [] }],
      });
      await fs.writeFile(graphPath, oldFormatYaml);

      // Load via service — should backfill transition into orchestratorSettings
      const showResult = await service.show(ctx, 'test-graph');
      expect(showResult.errors).toEqual([]);
      expect(showResult.lines?.[0].transition).toBe('manual');
    });
  });

  // ============================================
  // Defaults verification
  // ============================================

  describe('Defaults', () => {
    it('new node gets default orchestratorSettings', async () => {
      const { lineId } = await service.create(ctx, 'test-graph');
      const addResult = await service.addNode(ctx, 'test-graph', lineId, 'simple-task');
      const nodeId = addResult.nodeId as string;

      const showResult = await service.showNode(ctx, 'test-graph', nodeId);
      expect(showResult.execution).toBe('serial');
    });

    it('new line gets default orchestratorSettings', async () => {
      await service.create(ctx, 'test-graph');

      const showResult = await service.show(ctx, 'test-graph');
      expect(showResult.lines?.[0].transition).toBe('auto');
    });

    it('entities created without explicit properties have empty properties object', async () => {
      const { lineId } = await service.create(ctx, 'test-graph');
      const addResult = await service.addNode(ctx, 'test-graph', lineId, 'simple-task');
      const nodeId = addResult.nodeId as string;

      const nodeDir = `/workspace/my-project/.chainglass/data/workflows/test-graph/nodes/${nodeId}`;
      const nodeYaml = await fs.readFile(pathResolver.join(nodeDir, 'node.yaml'));
      const config = yamlParser.parse<Record<string, unknown>>(nodeYaml, 'node.yaml');
      expect(config.properties).toEqual({});
    });
  });
});
