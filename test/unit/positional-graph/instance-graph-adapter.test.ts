/**
 * InstanceGraphAdapter unit tests.
 *
 * Why: Validates that the adapter returns pre-resolved instance paths
 * and ignores slug arguments — scoped to one instance at construction.
 *
 * Contract: InstanceGraphAdapter extends PositionalGraphAdapter, overrides
 * getGraphDir() to return fixed instancePath.
 *
 * Usage Notes: Uses FakeFileSystem. Adapter constructed with absolute
 * instance path. All method calls return paths relative to that root.
 *
 * Quality Contribution: Ensures the DI-swappable adapter correctly routes
 * the graph engine to instance directories instead of data/workflows/.
 *
 * Worked Example: Adapter at /workspace/.chainglass/instances/tpl/run-1
 * → getGraphDir() returns that path regardless of slug.
 */

import { FakeFileSystem, FakePathResolver } from '@chainglass/shared';
import { beforeEach, describe, expect, it } from 'vitest';

import { InstanceGraphAdapter } from '../../../packages/positional-graph/src/adapter/instance-graph.adapter.js';
import { createTestWorkspaceContext } from '../../helpers/workspace-context.js';

const WORKTREE = '/test-workspace';
const INSTANCE_PATH = '/test-workspace/.chainglass/instances/my-template/sprint-42';

describe('InstanceGraphAdapter', () => {
  let fs: FakeFileSystem;
  let pathResolver: FakePathResolver;
  let adapter: InstanceGraphAdapter;
  const ctx = createTestWorkspaceContext(WORKTREE);

  beforeEach(() => {
    fs = new FakeFileSystem();
    pathResolver = new FakePathResolver();
    adapter = new InstanceGraphAdapter(fs, pathResolver, INSTANCE_PATH);
  });

  it('should return pre-resolved instance path from getGraphDir', () => {
    const result = adapter.getGraphDir(ctx, 'any-slug');
    expect(result).toBe(INSTANCE_PATH);
  });

  it('should ignore slug argument', () => {
    const result1 = adapter.getGraphDir(ctx, 'foo');
    const result2 = adapter.getGraphDir(ctx, 'bar');
    expect(result1).toBe(result2);
    expect(result1).toBe(INSTANCE_PATH);
  });

  it('should not validate slug pattern (slug is ignored)', () => {
    // Normally PositionalGraphAdapter would throw on invalid slug
    // InstanceGraphAdapter ignores slug entirely
    expect(() => adapter.getGraphDir(ctx, 'INVALID/SLUG')).not.toThrow();
  });

  it('should check graphExists at instance path', async () => {
    fs.setFile(`${INSTANCE_PATH}/graph.yaml`, 'content');
    expect(await adapter.graphExists(ctx, 'ignored')).toBe(true);
  });

  it('should return false for graphExists when no graph.yaml', async () => {
    expect(await adapter.graphExists(ctx, 'ignored')).toBe(false);
  });

  it('should create dirs in ensureGraphDir at instance path', async () => {
    await adapter.ensureGraphDir(ctx, 'ignored');
    expect(await fs.exists(INSTANCE_PATH)).toBe(true);
  });
});
