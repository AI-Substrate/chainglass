/**
 * Integration tests for WorkGraphService lifecycle.
 *
 * Per Phase 3 T014: Tests create → load → show → status full cycle.
 * Uses real filesystem operations in a temporary directory.
 *
 * Per Plan 021 Phase 6: Updated to pass WorkspaceContext to all service methods.
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { NodeFileSystemAdapter, PathResolverAdapter, YamlParserAdapter } from '@chainglass/shared';
import type { WorkspaceContext } from '@chainglass/workflow';
import { WorkGraphService } from '@chainglass/workgraph';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createTestWorkspaceContext } from '../../helpers/workspace-context.js';

describe('WorkGraphService Lifecycle Integration', () => {
  let tempDir: string;
  let service: WorkGraphService;
  let fileSystem: NodeFileSystemAdapter;
  let ctx: WorkspaceContext;

  beforeEach(async () => {
    // Create a unique temporary directory for each test
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'workgraph-test-'));

    // Create the .chainglass/data/work-graphs directory structure (new workspace-scoped path)
    const graphsDir = path.join(tempDir, '.chainglass', 'data', 'work-graphs');
    await fs.mkdir(graphsDir, { recursive: true });

    // Change to temp directory for relative path operations
    process.chdir(tempDir);

    // Create workspace context pointing to temp directory
    ctx = createTestWorkspaceContext(tempDir);

    // Create real adapters
    fileSystem = new NodeFileSystemAdapter();
    const pathResolver = new PathResolverAdapter();
    const yamlParser = new YamlParserAdapter();

    // Create service instance
    service = new WorkGraphService(fileSystem, pathResolver, yamlParser);
  });

  afterEach(async () => {
    // Clean up temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should complete full create → load → show → status lifecycle', async () => {
    /*
    Test Doc:
    - Why: End-to-end validation of WorkGraphService
    - Contract: All methods work together correctly
    - Usage Notes: Uses real filesystem
    - Quality Contribution: Proves integration works
    - Worked Example: create('test') → load('test') → show('test') → status('test')
    */

    // 1. CREATE
    const createResult = await service.create(ctx, 'test-workflow');
    expect(createResult.errors).toEqual([]);
    expect(createResult.graphSlug).toBe('test-workflow');
    expect(createResult.path).toContain('test-workflow');

    // Verify files were created on disk (new workspace-scoped path)
    const graphDir = path.join(tempDir, '.chainglass', 'data', 'work-graphs', 'test-workflow');
    const yamlExists = await fileSystem.exists(path.join(graphDir, 'work-graph.yaml'));
    const stateExists = await fileSystem.exists(path.join(graphDir, 'state.json'));
    expect(yamlExists).toBe(true);
    expect(stateExists).toBe(true);

    // 2. LOAD
    const loadResult = await service.load(ctx, 'test-workflow');
    expect(loadResult.errors).toEqual([]);
    expect(loadResult.graph).toBeDefined();
    expect(loadResult.graph?.slug).toBe('test-workflow');
    expect(loadResult.graph?.nodes).toContain('start');
    expect(loadResult.status).toBe('pending');

    // 3. SHOW
    const showResult = await service.show(ctx, 'test-workflow');
    expect(showResult.errors).toEqual([]);
    expect(showResult.graphSlug).toBe('test-workflow');
    expect(showResult.tree).toBeDefined();
    expect(showResult.tree.id).toBe('start');
    expect(showResult.tree.type).toBe('start');
    expect(showResult.tree.children).toEqual([]);

    // 4. STATUS
    const statusResult = await service.status(ctx, 'test-workflow');
    expect(statusResult.errors).toEqual([]);
    expect(statusResult.graphSlug).toBe('test-workflow');
    expect(statusResult.graphStatus).toBe('pending');
    expect(statusResult.nodes).toHaveLength(1);
    expect(statusResult.nodes[0].id).toBe('start');
    expect(statusResult.nodes[0].status).toBe('complete');
  });

  it('should return E105 when creating duplicate graph', async () => {
    // Create first graph
    await service.create(ctx, 'duplicate-test');

    // Try to create again
    const result = await service.create(ctx, 'duplicate-test');
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe('E105');
  });

  it('should return E101 when loading non-existent graph', async () => {
    const result = await service.load(ctx, 'nonexistent');
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe('E101');
    expect(result.graph).toBeUndefined();
  });

  it('should handle slug validation correctly', async () => {
    // Valid slug
    const validResult = await service.create(ctx, 'my-valid-slug');
    expect(validResult.errors).toEqual([]);

    // Invalid slug (uppercase)
    const invalidResult = await service.create(ctx, 'Invalid_Slug');
    expect(invalidResult.errors).toHaveLength(1);
    expect(invalidResult.errors[0].code).toBe('E104');

    // Invalid slug (path traversal)
    const traversalResult = await service.create(ctx, '../evil');
    expect(traversalResult.errors).toHaveLength(1);
    expect(traversalResult.errors[0].code).toBe('E104');
  });
});
