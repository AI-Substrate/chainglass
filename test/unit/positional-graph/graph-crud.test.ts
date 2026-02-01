import { PositionalGraphService } from '@chainglass/positional-graph';
import { PositionalGraphAdapter } from '@chainglass/positional-graph/adapter';
import type {
  GraphCreateResult,
  IPositionalGraphService,
  PGListResult,
  PGLoadResult,
  PGShowResult,
} from '@chainglass/positional-graph/interfaces';
import { FakeFileSystem, FakePathResolver, YamlParserAdapter } from '@chainglass/shared';
import type { BaseResult } from '@chainglass/shared';
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

function createTestService(fs: FakeFileSystem, pathResolver: FakePathResolver) {
  const yamlParser = new YamlParserAdapter();
  const adapter = new PositionalGraphAdapter(fs, pathResolver);
  return new PositionalGraphService(fs, pathResolver, yamlParser, adapter);
}

describe('PositionalGraphService', () => {
  let fs: FakeFileSystem;
  let pathResolver: FakePathResolver;
  let service: IPositionalGraphService;
  let ctx: WorkspaceContext;

  beforeEach(() => {
    fs = new FakeFileSystem();
    pathResolver = new FakePathResolver();
    service = createTestService(fs, pathResolver);
    ctx = createTestContext();
  });

  // ============================================
  // create
  // ============================================

  describe('create', () => {
    it('creates graph with one empty line', async () => {
      const result: GraphCreateResult = await service.create(ctx, 'my-pipeline');

      expect(result.errors).toEqual([]);
      expect(result.graphSlug).toBe('my-pipeline');
      expect(result.lineId).toBeTruthy();

      // Verify graph.yaml on disk
      const graphDir = '/workspace/my-project/.chainglass/data/workflows/my-pipeline';
      const graphYaml = await fs.readFile(pathResolver.join(graphDir, 'graph.yaml'));
      expect(graphYaml).toBeTruthy();

      // Parse and verify structure
      const yamlParser = new YamlParserAdapter();
      const parsed = yamlParser.parse<Record<string, unknown>>(graphYaml, 'graph.yaml');
      expect(parsed.slug).toBe('my-pipeline');
      expect(parsed.version).toBe('0.1.0');
      expect(Array.isArray(parsed.lines)).toBe(true);
      const lines = parsed.lines as Array<{ id: string; nodes: string[] }>;
      expect(lines).toHaveLength(1);
      expect(lines[0].nodes).toEqual([]);
      expect(lines[0].id).toBe(result.lineId);
    });

    it('initializes state.json', async () => {
      await service.create(ctx, 'my-pipeline');

      const graphDir = '/workspace/my-project/.chainglass/data/workflows/my-pipeline';
      const stateJson = await fs.readFile(pathResolver.join(graphDir, 'state.json'));
      const state = JSON.parse(stateJson);
      expect(state.graph_status).toBe('pending');
      expect(state.nodes).toEqual({});
      expect(state.transitions).toEqual({});
      expect(state.updated_at).toBeTruthy();
    });

    it('generates line ID in correct format', async () => {
      const result = await service.create(ctx, 'my-pipeline');
      expect(result.lineId).toMatch(/^line-[0-9a-f]{3}$/);
    });

    it('returns error for duplicate slug', async () => {
      await service.create(ctx, 'my-pipeline');
      const result = await service.create(ctx, 'my-pipeline');

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('E158');
    });
  });

  // ============================================
  // load
  // ============================================

  describe('load', () => {
    it('returns parsed graph definition', async () => {
      await service.create(ctx, 'my-pipeline');
      const result: PGLoadResult = await service.load(ctx, 'my-pipeline');

      expect(result.errors).toEqual([]);
      expect(result.definition).toBeTruthy();
      expect(result.definition?.slug).toBe('my-pipeline');
      expect(result.definition?.version).toBe('0.1.0');
      expect(result.definition?.lines).toHaveLength(1);
    });

    it('returns error for nonexistent graph', async () => {
      const result = await service.load(ctx, 'nonexistent');

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('E157');
    });
  });

  // ============================================
  // show
  // ============================================

  describe('show', () => {
    it('returns graph structure for display', async () => {
      await service.create(ctx, 'my-pipeline');
      const result: PGShowResult = await service.show(ctx, 'my-pipeline');

      expect(result.errors).toEqual([]);
      expect(result.slug).toBe('my-pipeline');
      expect(result.version).toBe('0.1.0');
      expect(result.lines).toHaveLength(1);
      expect(result.lines?.[0].nodeCount).toBe(0);
      expect(result.totalNodeCount).toBe(0);
    });
  });

  // ============================================
  // delete
  // ============================================

  describe('delete', () => {
    it('removes graph directory', async () => {
      await service.create(ctx, 'my-pipeline');
      const result: BaseResult = await service.delete(ctx, 'my-pipeline');

      expect(result.errors).toEqual([]);

      // Verify graph is gone
      const graphDir = '/workspace/my-project/.chainglass/data/workflows/my-pipeline';
      expect(await fs.exists(graphDir)).toBe(false);
    });

    it('is idempotent for nonexistent graph', async () => {
      const result = await service.delete(ctx, 'nonexistent');
      expect(result.errors).toEqual([]);
    });
  });

  // ============================================
  // show — edge cases
  // ============================================

  describe('show — edge cases', () => {
    it('returns error for nonexistent graph', async () => {
      const result = await service.show(ctx, 'nonexistent');
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('E157');
    });
  });

  // ============================================
  // load — edge cases
  // ============================================

  describe('load — edge cases', () => {
    it('returns error for invalid YAML content', async () => {
      // Manually write invalid YAML
      const graphDir = '/workspace/my-project/.chainglass/data/workflows/bad-yaml';
      await fs.mkdir(pathResolver.join(graphDir, 'nodes'), { recursive: true });
      await fs.writeFile(
        pathResolver.join(graphDir, 'graph.yaml'),
        '{{invalid yaml: [[[unterminated'
      );

      const result = await service.load(ctx, 'bad-yaml');
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('invalid YAML');
    });

    it('returns error for schema validation failure', async () => {
      // Write valid YAML but invalid schema (missing required fields)
      const graphDir = '/workspace/my-project/.chainglass/data/workflows/bad-schema';
      await fs.mkdir(pathResolver.join(graphDir, 'nodes'), { recursive: true });
      const yamlParser = new YamlParserAdapter();
      await fs.writeFile(
        pathResolver.join(graphDir, 'graph.yaml'),
        yamlParser.stringify({ slug: 'bad-schema', lines: [] })
      );

      const result = await service.load(ctx, 'bad-schema');
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('invalid schema');
    });
  });

  // ============================================
  // delete — edge cases
  // ============================================

  describe('delete — edge cases', () => {
    it('returns error for nonexistent graph after show/load confirms it', async () => {
      // Delete nonexistent is idempotent (already tested above)
      // But show/load of deleted graph should return E157
      await service.create(ctx, 'to-delete');
      await service.delete(ctx, 'to-delete');

      const loadResult = await service.load(ctx, 'to-delete');
      expect(loadResult.errors[0].code).toBe('E157');
    });
  });

  // ============================================
  // list
  // ============================================

  describe('list', () => {
    it('returns empty array when no graphs exist', async () => {
      const result: PGListResult = await service.list(ctx);

      expect(result.errors).toEqual([]);
      expect(result.slugs).toEqual([]);
    });

    it('returns all graph slugs', async () => {
      await service.create(ctx, 'pipeline-a');
      await service.create(ctx, 'pipeline-b');

      const result = await service.list(ctx);

      expect(result.errors).toEqual([]);
      expect(result.slugs).toContain('pipeline-a');
      expect(result.slugs).toContain('pipeline-b');
      expect(result.slugs).toHaveLength(2);
    });
  });
});
