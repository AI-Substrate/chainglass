/**
 * Output Storage Tests (Phase 2: Output Storage)
 *
 * Purpose: Tests for saveOutputData, saveOutputFile, getOutputData, getOutputFile
 * service methods. These enable agents to save their work results and downstream
 * nodes to retrieve them.
 *
 * Test Plan from tasks.md Alignment Brief:
 * - saveOutputData: saves value, merges with existing, handles JSON types, E153 for unknown node
 * - saveOutputFile: copies file, rejects path traversal, E179 for missing source
 * - getOutputData: reads from data.json, E175 if missing
 * - getOutputFile: returns absolute path, E175/E179 if missing
 *
 * Directory Structure (DYK decision):
 * - nodes/{nodeId}/data/data.json     - Output values with { "outputs": {...} } wrapper
 * - nodes/{nodeId}/data/outputs/      - File storage directory
 */

import { PositionalGraphService } from '@chainglass/positional-graph';
import { PositionalGraphAdapter } from '@chainglass/positional-graph/adapter';
import type {
  IPositionalGraphService,
  IWorkUnitLoader,
} from '@chainglass/positional-graph/interfaces';
import { FakeFileSystem, FakePathResolver, YamlParserAdapter } from '@chainglass/shared';
import type { ResultError } from '@chainglass/shared';
import type { WorkspaceContext } from '@chainglass/workflow';
import { beforeEach, describe, expect, it } from 'vitest';

// ============================================
// Test Helpers
// ============================================

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

function createFakeUnitLoader(knownSlugs: string[]): IWorkUnitLoader {
  const known = new Set(knownSlugs);
  return {
    async load(_ctx: WorkspaceContext, slug: string) {
      if (known.has(slug)) {
        return { unit: { slug, inputs: [], outputs: [] }, errors: [] };
      }
      return { errors: [{ code: 'E159', message: `Unit '${slug}' not found` } as ResultError] };
    },
  };
}

function createTestService(
  fs: FakeFileSystem,
  pathResolver: FakePathResolver,
  loader: IWorkUnitLoader
): IPositionalGraphService {
  const yamlParser = new YamlParserAdapter();
  const adapter = new PositionalGraphAdapter(fs, pathResolver);
  return new PositionalGraphService(fs, pathResolver, yamlParser, adapter, loader);
}

// ============================================
// saveOutputData Tests (T001)
// ============================================

describe('PositionalGraphService — saveOutputData', () => {
  let fs: FakeFileSystem;
  let pathResolver: FakePathResolver;
  let service: IPositionalGraphService;
  let ctx: WorkspaceContext;
  let nodeId: string;

  beforeEach(async () => {
    fs = new FakeFileSystem();
    pathResolver = new FakePathResolver();
    const loader = createFakeUnitLoader(['sample-coder', 'sample-input']);
    service = createTestService(fs, pathResolver, loader);
    ctx = createTestContext();

    // Create graph and node for testing
    const { lineId } = await service.create(ctx, 'test-graph');
    const result = await service.addNode(ctx, 'test-graph', lineId, 'sample-coder');
    if (!result.nodeId) throw new Error('nodeId expected');
    nodeId = result.nodeId;
  });

  it('saves value to data.json with outputs wrapper', async () => {
    /**
     * Purpose: Proves saveOutputData writes to correct location with wrapper
     * Quality Contribution: Core output storage functionality
     * Acceptance Criteria: data.json contains { "outputs": { "spec": "hello" } }
     */
    const result = await service.saveOutputData(ctx, 'test-graph', nodeId, 'spec', 'hello');

    expect(result.errors).toEqual([]);
    expect(result.saved).toBe(true);
    expect(result.nodeId).toBe(nodeId);
    expect(result.outputName).toBe('spec');

    // Verify file contents
    const dataPath = `/workspace/my-project/.chainglass/data/workflows/test-graph/nodes/${nodeId}/data/data.json`;
    const content = await fs.readFile(dataPath);
    const parsed = JSON.parse(content);
    expect(parsed).toEqual({ outputs: { spec: 'hello' } });
  });

  it('merges with existing outputs', async () => {
    /**
     * Purpose: Proves saveOutputData preserves existing outputs
     * Quality Contribution: Non-destructive write pattern
     * Acceptance Criteria: Existing outputs preserved after adding new one
     */
    await service.saveOutputData(ctx, 'test-graph', nodeId, 'language', 'bash');
    const result = await service.saveOutputData(ctx, 'test-graph', nodeId, 'script', 'echo hello');

    expect(result.errors).toEqual([]);
    expect(result.saved).toBe(true);

    // Verify both outputs present
    const dataPath = `/workspace/my-project/.chainglass/data/workflows/test-graph/nodes/${nodeId}/data/data.json`;
    const content = await fs.readFile(dataPath);
    const parsed = JSON.parse(content);
    expect(parsed.outputs.language).toBe('bash');
    expect(parsed.outputs.script).toBe('echo hello');
  });

  it('handles JSON types: string, number, boolean, object, array, null', async () => {
    /**
     * Purpose: Proves saveOutputData handles all JSON value types
     * Quality Contribution: Type flexibility for diverse outputs
     * Acceptance Criteria: All JSON types stored correctly
     */
    await service.saveOutputData(ctx, 'test-graph', nodeId, 'str', 'hello');
    await service.saveOutputData(ctx, 'test-graph', nodeId, 'num', 42);
    await service.saveOutputData(ctx, 'test-graph', nodeId, 'bool', true);
    await service.saveOutputData(ctx, 'test-graph', nodeId, 'obj', { key: 'value' });
    await service.saveOutputData(ctx, 'test-graph', nodeId, 'arr', [1, 2, 3]);
    await service.saveOutputData(ctx, 'test-graph', nodeId, 'nil', null);

    const dataPath = `/workspace/my-project/.chainglass/data/workflows/test-graph/nodes/${nodeId}/data/data.json`;
    const content = await fs.readFile(dataPath);
    const parsed = JSON.parse(content);

    expect(parsed.outputs.str).toBe('hello');
    expect(parsed.outputs.num).toBe(42);
    expect(parsed.outputs.bool).toBe(true);
    expect(parsed.outputs.obj).toEqual({ key: 'value' });
    expect(parsed.outputs.arr).toEqual([1, 2, 3]);
    expect(parsed.outputs.nil).toBeNull();
  });

  it('overwrites existing output (per spec Q5: overwrites allowed)', async () => {
    /**
     * Purpose: Proves overwriting existing output is allowed
     * Quality Contribution: Flexibility for retry scenarios
     * Acceptance Criteria: New value replaces old value
     */
    await service.saveOutputData(ctx, 'test-graph', nodeId, 'spec', 'old value');
    const result = await service.saveOutputData(ctx, 'test-graph', nodeId, 'spec', 'new value');

    expect(result.errors).toEqual([]);
    expect(result.saved).toBe(true);

    const dataPath = `/workspace/my-project/.chainglass/data/workflows/test-graph/nodes/${nodeId}/data/data.json`;
    const content = await fs.readFile(dataPath);
    const parsed = JSON.parse(content);
    expect(parsed.outputs.spec).toBe('new value');
  });

  it('returns E153 for unknown node', async () => {
    /**
     * Purpose: Proves error handling for invalid node ID
     * Quality Contribution: Clear error messages for debugging
     * Acceptance Criteria: E153 error returned
     */
    const result = await service.saveOutputData(
      ctx,
      'test-graph',
      'nonexistent-node',
      'spec',
      'hello'
    );

    expect(result.saved).toBe(false);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0].code).toBe('E153');
  });

  it('returns error for unknown graph', async () => {
    /**
     * Purpose: Proves error handling for invalid graph slug
     * Quality Contribution: Clear error messages for debugging
     * Acceptance Criteria: Error returned for non-existent graph
     */
    const result = await service.saveOutputData(ctx, 'nonexistent-graph', nodeId, 'spec', 'hello');

    expect(result.saved).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

// ============================================
// saveOutputFile Tests (T005)
// ============================================

describe('PositionalGraphService — saveOutputFile', () => {
  let fs: FakeFileSystem;
  let pathResolver: FakePathResolver;
  let service: IPositionalGraphService;
  let ctx: WorkspaceContext;
  let nodeId: string;

  beforeEach(async () => {
    fs = new FakeFileSystem();
    pathResolver = new FakePathResolver();
    const loader = createFakeUnitLoader(['sample-coder', 'sample-input']);
    service = createTestService(fs, pathResolver, loader);
    ctx = createTestContext();

    // Create graph and node for testing
    const { lineId } = await service.create(ctx, 'test-graph');
    const result = await service.addNode(ctx, 'test-graph', lineId, 'sample-coder');
    if (!result.nodeId) throw new Error('nodeId expected');
    nodeId = result.nodeId;

    // Create a source file to copy
    await fs.writeFile('/workspace/my-project/script.sh', '#!/bin/bash\necho "hello"');
  });

  it('copies file to data/outputs/ directory', async () => {
    /**
     * Purpose: Proves saveOutputFile copies file to correct location
     * Quality Contribution: Core file output functionality
     * Acceptance Criteria: File copied to data/outputs/, path recorded in data.json
     */
    const result = await service.saveOutputFile(
      ctx,
      'test-graph',
      nodeId,
      'script',
      '/workspace/my-project/script.sh'
    );

    expect(result.errors).toEqual([]);
    expect(result.saved).toBe(true);
    expect(result.nodeId).toBe(nodeId);
    expect(result.outputName).toBe('script');
    expect(result.filePath).toContain('data/outputs/');

    // Verify file was copied
    const destPath = `/workspace/my-project/.chainglass/data/workflows/test-graph/nodes/${nodeId}/data/outputs/script.sh`;
    const exists = await fs.exists(destPath);
    expect(exists).toBe(true);

    // Verify data.json contains the relative path
    const dataPath = `/workspace/my-project/.chainglass/data/workflows/test-graph/nodes/${nodeId}/data/data.json`;
    const content = await fs.readFile(dataPath);
    const parsed = JSON.parse(content);
    expect(parsed.outputs.script).toContain('data/outputs/script.sh');
  });

  it('rejects path traversal in source path', async () => {
    /**
     * Purpose: Prevents arbitrary file read via malicious source path
     * Quality Contribution: Critical security control (CF-03)
     * Acceptance Criteria: E179 returned for ../etc/passwd
     */
    const result = await service.saveOutputFile(
      ctx,
      'test-graph',
      nodeId,
      'malicious',
      '../../../etc/passwd'
    );

    expect(result.saved).toBe(false);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0].code).toBe('E179');
  });

  it('rejects path traversal in output name', async () => {
    /**
     * Purpose: Prevents directory escape via malicious output name
     * Quality Contribution: Critical security control (CF-03)
     * Acceptance Criteria: Error returned for ../malicious
     */
    const result = await service.saveOutputFile(
      ctx,
      'test-graph',
      nodeId,
      '../malicious',
      '/workspace/my-project/script.sh'
    );

    expect(result.saved).toBe(false);
    expect(result.errors.length).toBe(1);
  });

  it('returns E179 for missing source file', async () => {
    /**
     * Purpose: Proves error handling for non-existent source
     * Quality Contribution: Clear error messages for debugging
     * Acceptance Criteria: E179 error returned
     */
    const result = await service.saveOutputFile(
      ctx,
      'test-graph',
      nodeId,
      'script',
      '/workspace/my-project/nonexistent.sh'
    );

    expect(result.saved).toBe(false);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0].code).toBe('E179');
  });

  it('creates data/outputs/ directory if missing', async () => {
    /**
     * Purpose: Proves directories are created automatically
     * Quality Contribution: Robust initialization
     * Acceptance Criteria: Directory created on first save
     */
    const result = await service.saveOutputFile(
      ctx,
      'test-graph',
      nodeId,
      'script',
      '/workspace/my-project/script.sh'
    );

    expect(result.errors).toEqual([]);
    expect(result.saved).toBe(true);

    const dirPath = `/workspace/my-project/.chainglass/data/workflows/test-graph/nodes/${nodeId}/data/outputs`;
    const exists = await fs.exists(dirPath);
    expect(exists).toBe(true);
  });

  it('preserves file extension', async () => {
    /**
     * Purpose: Proves file extension is preserved from source
     * Quality Contribution: Proper file naming
     * Acceptance Criteria: Extension matches source file
     */
    const result = await service.saveOutputFile(
      ctx,
      'test-graph',
      nodeId,
      'script',
      '/workspace/my-project/script.sh'
    );

    expect(result.filePath).toContain('.sh');
  });

  it('returns E153 for unknown node', async () => {
    /**
     * Purpose: Proves error handling for invalid node ID
     * Quality Contribution: Clear error messages for debugging
     * Acceptance Criteria: E153 error returned
     */
    const result = await service.saveOutputFile(
      ctx,
      'test-graph',
      'nonexistent-node',
      'script',
      '/workspace/my-project/script.sh'
    );

    expect(result.saved).toBe(false);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0].code).toBe('E153');
  });
});

// ============================================
// getOutputData Tests (T009)
// ============================================

describe('PositionalGraphService — getOutputData', () => {
  let fs: FakeFileSystem;
  let pathResolver: FakePathResolver;
  let service: IPositionalGraphService;
  let ctx: WorkspaceContext;
  let nodeId: string;

  beforeEach(async () => {
    fs = new FakeFileSystem();
    pathResolver = new FakePathResolver();
    const loader = createFakeUnitLoader(['sample-coder', 'sample-input']);
    service = createTestService(fs, pathResolver, loader);
    ctx = createTestContext();

    // Create graph and node for testing
    const { lineId } = await service.create(ctx, 'test-graph');
    const result = await service.addNode(ctx, 'test-graph', lineId, 'sample-coder');
    if (!result.nodeId) throw new Error('nodeId expected');
    nodeId = result.nodeId;
  });

  it('reads value from data.json', async () => {
    /**
     * Purpose: Proves getOutputData retrieves stored values
     * Quality Contribution: Core data retrieval functionality
     * Acceptance Criteria: Returns stored value
     */
    await service.saveOutputData(ctx, 'test-graph', nodeId, 'language', 'bash');

    const result = await service.getOutputData(ctx, 'test-graph', nodeId, 'language');

    expect(result.errors).toEqual([]);
    expect(result.value).toBe('bash');
    expect(result.nodeId).toBe(nodeId);
    expect(result.outputName).toBe('language');
  });

  it('returns E175 for missing output', async () => {
    /**
     * Purpose: Proves error handling for non-existent output
     * Quality Contribution: Clear error messages for debugging
     * Acceptance Criteria: E175 error returned
     */
    const result = await service.getOutputData(ctx, 'test-graph', nodeId, 'nonexistent');

    expect(result.value).toBeUndefined();
    expect(result.errors.length).toBe(1);
    expect(result.errors[0].code).toBe('E175');
  });

  it('returns E175 if data.json missing', async () => {
    /**
     * Purpose: Proves error handling when no outputs saved yet
     * Quality Contribution: Clear error messages for debugging
     * Acceptance Criteria: E175 error returned
     */
    const result = await service.getOutputData(ctx, 'test-graph', nodeId, 'spec');

    expect(result.value).toBeUndefined();
    expect(result.errors.length).toBe(1);
    expect(result.errors[0].code).toBe('E175');
  });

  it('returns E153 for unknown node', async () => {
    /**
     * Purpose: Proves error handling for invalid node ID
     * Quality Contribution: Clear error messages for debugging
     * Acceptance Criteria: E153 error returned
     */
    const result = await service.getOutputData(ctx, 'test-graph', 'nonexistent-node', 'spec');

    expect(result.value).toBeUndefined();
    expect(result.errors.length).toBe(1);
    expect(result.errors[0].code).toBe('E153');
  });
});

// ============================================
// getOutputFile Tests (T012)
// ============================================

describe('PositionalGraphService — getOutputFile', () => {
  let fs: FakeFileSystem;
  let pathResolver: FakePathResolver;
  let service: IPositionalGraphService;
  let ctx: WorkspaceContext;
  let nodeId: string;

  beforeEach(async () => {
    fs = new FakeFileSystem();
    pathResolver = new FakePathResolver();
    const loader = createFakeUnitLoader(['sample-coder', 'sample-input']);
    service = createTestService(fs, pathResolver, loader);
    ctx = createTestContext();

    // Create graph and node for testing
    const { lineId } = await service.create(ctx, 'test-graph');
    const result = await service.addNode(ctx, 'test-graph', lineId, 'sample-coder');
    if (!result.nodeId) throw new Error('nodeId expected');
    nodeId = result.nodeId;

    // Create a source file and save as output
    await fs.writeFile('/workspace/my-project/script.sh', '#!/bin/bash\necho "hello"');
  });

  it('returns absolute path for saved file', async () => {
    /**
     * Purpose: Proves getOutputFile returns absolute path (stored as relative)
     * Quality Contribution: Git-portable storage with absolute access
     * Acceptance Criteria: Returns absolute path to file
     */
    await service.saveOutputFile(
      ctx,
      'test-graph',
      nodeId,
      'script',
      '/workspace/my-project/script.sh'
    );

    const result = await service.getOutputFile(ctx, 'test-graph', nodeId, 'script');

    expect(result.errors).toEqual([]);
    expect(result.filePath).toBe(
      `/workspace/my-project/.chainglass/data/workflows/test-graph/nodes/${nodeId}/data/outputs/script.sh`
    );
    expect(result.nodeId).toBe(nodeId);
    expect(result.outputName).toBe('script');
  });

  it('returns E175 for missing output', async () => {
    /**
     * Purpose: Proves error handling for non-existent output
     * Quality Contribution: Clear error messages for debugging
     * Acceptance Criteria: E175 error returned
     */
    const result = await service.getOutputFile(ctx, 'test-graph', nodeId, 'nonexistent');

    expect(result.filePath).toBeUndefined();
    expect(result.errors.length).toBe(1);
    expect(result.errors[0].code).toBe('E175');
  });

  it('returns E175 if data.json missing', async () => {
    /**
     * Purpose: Proves error handling when no outputs saved yet
     * Quality Contribution: Clear error messages for debugging
     * Acceptance Criteria: E175 error returned
     */
    const result = await service.getOutputFile(ctx, 'test-graph', nodeId, 'script');

    expect(result.filePath).toBeUndefined();
    expect(result.errors.length).toBe(1);
    expect(result.errors[0].code).toBe('E175');
  });

  it('returns E153 for unknown node', async () => {
    /**
     * Purpose: Proves error handling for invalid node ID
     * Quality Contribution: Clear error messages for debugging
     * Acceptance Criteria: E153 error returned
     */
    const result = await service.getOutputFile(ctx, 'test-graph', 'nonexistent-node', 'script');

    expect(result.filePath).toBeUndefined();
    expect(result.errors.length).toBe(1);
    expect(result.errors[0].code).toBe('E153');
  });
});
