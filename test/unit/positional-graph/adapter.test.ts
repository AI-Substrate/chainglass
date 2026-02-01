import { atomicWriteFile } from '@chainglass/positional-graph';
import { PositionalGraphAdapter } from '@chainglass/positional-graph/adapter';
import { FakeFileSystem, FakePathResolver } from '@chainglass/shared';
import type { WorkspaceContext } from '@chainglass/workflow';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

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

describe('PositionalGraphAdapter', () => {
  let fs: FakeFileSystem;
  let pathResolver: FakePathResolver;
  let adapter: PositionalGraphAdapter;
  let ctx: WorkspaceContext;

  beforeEach(() => {
    fs = new FakeFileSystem();
    pathResolver = new FakePathResolver();
    adapter = new PositionalGraphAdapter(fs, pathResolver);
    ctx = createTestContext();
  });

  // ============================================
  // getGraphDir
  // ============================================

  describe('getGraphDir', () => {
    it('returns correct path under workspace data dir', () => {
      const dir = adapter.getGraphDir(ctx, 'my-pipeline');
      expect(dir).toBe('/workspace/my-project/.chainglass/data/workflows/my-pipeline');
    });

    it('rejects invalid slug with path traversal attempt', () => {
      expect(() => adapter.getGraphDir(ctx, '../../../etc')).toThrow(/Invalid graph slug/);
    });

    it('rejects slug starting with number', () => {
      expect(() => adapter.getGraphDir(ctx, '123-bad')).toThrow(/Invalid graph slug/);
    });

    it('uses worktreePath, not workspacePath', () => {
      const ctxWithWorktree = createTestContext('/workspace/my-project/worktrees/feature-branch');
      const dir = adapter.getGraphDir(ctxWithWorktree, 'my-pipeline');
      expect(dir).toBe(
        '/workspace/my-project/worktrees/feature-branch/.chainglass/data/workflows/my-pipeline'
      );
    });
  });

  // ============================================
  // ensureGraphDir
  // ============================================

  describe('ensureGraphDir', () => {
    it('creates graph directory with nodes/ subdirectory', async () => {
      await adapter.ensureGraphDir(ctx, 'my-pipeline');

      const graphDir = adapter.getGraphDir(ctx, 'my-pipeline');
      expect(await fs.exists(graphDir)).toBe(true);
      expect(await fs.exists(pathResolver.join(graphDir, 'nodes'))).toBe(true);
    });

    it('is idempotent — calling twice does not error', async () => {
      await adapter.ensureGraphDir(ctx, 'my-pipeline');
      await adapter.ensureGraphDir(ctx, 'my-pipeline');

      const graphDir = adapter.getGraphDir(ctx, 'my-pipeline');
      expect(await fs.exists(graphDir)).toBe(true);
    });
  });

  // ============================================
  // listGraphSlugs
  // ============================================

  describe('listGraphSlugs', () => {
    it('returns empty array when no graphs exist', async () => {
      // Ensure domain dir exists but is empty
      const domainDir = pathResolver.join(ctx.worktreePath, '.chainglass/data/workflows');
      await fs.mkdir(domainDir, { recursive: true });

      const slugs = await adapter.listGraphSlugs(ctx);
      expect(slugs).toEqual([]);
    });

    it('returns slug array for existing graphs', async () => {
      await adapter.ensureGraphDir(ctx, 'pipeline-a');
      await adapter.ensureGraphDir(ctx, 'pipeline-b');

      const slugs = await adapter.listGraphSlugs(ctx);
      expect(slugs).toContain('pipeline-a');
      expect(slugs).toContain('pipeline-b');
      expect(slugs).toHaveLength(2);
    });

    it('returns empty array when domain dir does not exist', async () => {
      const slugs = await adapter.listGraphSlugs(ctx);
      expect(slugs).toEqual([]);
    });
  });

  // ============================================
  // graphExists
  // ============================================

  describe('graphExists', () => {
    it('returns false when graph dir does not exist', async () => {
      expect(await adapter.graphExists(ctx, 'nonexistent')).toBe(false);
    });

    it('returns false when graph dir exists but graph.yaml is missing', async () => {
      await adapter.ensureGraphDir(ctx, 'empty-graph');
      expect(await adapter.graphExists(ctx, 'empty-graph')).toBe(false);
    });

    it('returns true when graph.yaml exists', async () => {
      await adapter.ensureGraphDir(ctx, 'my-pipeline');
      const graphDir = adapter.getGraphDir(ctx, 'my-pipeline');
      await fs.writeFile(pathResolver.join(graphDir, 'graph.yaml'), 'slug: my-pipeline');
      expect(await adapter.graphExists(ctx, 'my-pipeline')).toBe(true);
    });
  });

  // ============================================
  // removeGraph
  // ============================================

  describe('removeGraph', () => {
    it('removes graph directory recursively', async () => {
      await adapter.ensureGraphDir(ctx, 'my-pipeline');
      const graphDir = adapter.getGraphDir(ctx, 'my-pipeline');
      await fs.writeFile(pathResolver.join(graphDir, 'graph.yaml'), 'slug: my-pipeline');

      await adapter.removeGraph(ctx, 'my-pipeline');
      expect(await fs.exists(graphDir)).toBe(false);
    });

    it('is safe to call on nonexistent graph', async () => {
      // Should not throw
      await adapter.removeGraph(ctx, 'nonexistent');
    });
  });
});

// ============================================
// atomicWriteFile (standalone utility)
// ============================================

describe('atomicWriteFile', () => {
  let fs: FakeFileSystem;
  let pathResolver: FakePathResolver;

  beforeEach(() => {
    fs = new FakeFileSystem();
    pathResolver = new FakePathResolver();
  });

  it('writes content to the target path', async () => {
    const dir = '/tmp/test';
    await fs.mkdir(dir, { recursive: true });
    const filePath = pathResolver.join(dir, 'file.yaml');

    await atomicWriteFile(fs, filePath, 'hello: world');
    expect(await fs.readFile(filePath)).toBe('hello: world');
  });

  it('temp file is cleaned up after success', async () => {
    const dir = '/tmp/test';
    await fs.mkdir(dir, { recursive: true });
    const filePath = pathResolver.join(dir, 'file.yaml');

    await atomicWriteFile(fs, filePath, 'content');

    // Temp file should not exist after successful write
    expect(await fs.exists(`${filePath}.tmp`)).toBe(false);
  });

  it('overwrites existing file', async () => {
    const dir = '/tmp/test';
    await fs.mkdir(dir, { recursive: true });
    const filePath = pathResolver.join(dir, 'file.yaml');

    await fs.writeFile(filePath, 'old content');
    await atomicWriteFile(fs, filePath, 'new content');
    expect(await fs.readFile(filePath)).toBe('new content');
  });
});
