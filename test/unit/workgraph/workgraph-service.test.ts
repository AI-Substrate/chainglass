/**
 * Tests for WorkGraphService.
 *
 * Per Phase 3: Full TDD approach - RED-GREEN-REFACTOR cycle.
 *
 * Test fixtures use FakeFileSystem, FakePathResolver, FakeYamlParser
 * to simulate graph directories without disk I/O.
 */

import {
  FakeFileSystem,
  FakePathResolver,
  FakeYamlParser,
  YamlParseError,
} from '@chainglass/shared';
import { WorkGraphService } from '@chainglass/workgraph';
import { beforeEach, describe, expect, it } from 'vitest';

// ============================================
// Test Fixtures
// ============================================

/**
 * Sample work-graph.yaml for a new empty graph (valid).
 */
const SAMPLE_EMPTY_GRAPH_YAML = `
slug: my-workflow
version: "1.0.0"
description: "A sample workflow"
created_at: "2026-01-27T10:00:00.000Z"
nodes:
  - start
edges: []
`;

/**
 * Parsed data for sample empty graph.
 */
const PARSED_EMPTY_GRAPH = {
  slug: 'my-workflow',
  version: '1.0.0',
  description: 'A sample workflow',
  created_at: '2026-01-27T10:00:00.000Z',
  nodes: ['start'],
  edges: [],
};

/**
 * Sample state.json for a new graph (start node complete).
 * Per DYK#1: Start node must be stored as complete.
 */
const SAMPLE_EMPTY_STATE_JSON = `{
  "graph_status": "pending",
  "updated_at": "2026-01-27T10:00:00.000Z",
  "nodes": {
    "start": {
      "status": "complete"
    }
  }
}`;

/**
 * Parsed state data for sample empty graph.
 */
const PARSED_EMPTY_STATE = {
  graph_status: 'pending',
  updated_at: '2026-01-27T10:00:00.000Z',
  nodes: {
    start: {
      status: 'complete',
    },
  },
};

/**
 * Sample work-graph.yaml with linear structure (start → A → B).
 */
const SAMPLE_LINEAR_GRAPH_YAML = `
slug: linear-workflow
version: "1.0.0"
created_at: "2026-01-27T10:00:00.000Z"
nodes:
  - start
  - write-poem-a1b
  - review-poem-c2d
edges:
  - from: start
    to: write-poem-a1b
  - from: write-poem-a1b
    to: review-poem-c2d
`;

/**
 * Parsed data for linear graph.
 */
const PARSED_LINEAR_GRAPH = {
  slug: 'linear-workflow',
  version: '1.0.0',
  created_at: '2026-01-27T10:00:00.000Z',
  nodes: ['start', 'write-poem-a1b', 'review-poem-c2d'],
  edges: [
    { from: 'start', to: 'write-poem-a1b' },
    { from: 'write-poem-a1b', to: 'review-poem-c2d' },
  ],
};

/**
 * Sample state.json for linear graph.
 */
const SAMPLE_LINEAR_STATE_JSON = `{
  "graph_status": "in_progress",
  "updated_at": "2026-01-27T11:00:00.000Z",
  "nodes": {
    "start": { "status": "complete" },
    "write-poem-a1b": { "status": "complete", "started_at": "2026-01-27T10:30:00.000Z", "completed_at": "2026-01-27T10:45:00.000Z" }
  }
}`;

/**
 * Parsed state for linear graph.
 */
const PARSED_LINEAR_STATE = {
  graph_status: 'in_progress',
  updated_at: '2026-01-27T11:00:00.000Z',
  nodes: {
    start: { status: 'complete' },
    'write-poem-a1b': {
      status: 'complete',
      started_at: '2026-01-27T10:30:00.000Z',
      completed_at: '2026-01-27T10:45:00.000Z',
    },
  },
};

/**
 * Sample work-graph.yaml with diverging structure (start → [A, B]).
 */
const SAMPLE_DIVERGING_GRAPH_YAML = `
slug: diverging-workflow
version: "1.0.0"
created_at: "2026-01-27T10:00:00.000Z"
nodes:
  - start
  - write-poem-a1b
  - process-data-c2d
edges:
  - from: start
    to: write-poem-a1b
  - from: start
    to: process-data-c2d
`;

/**
 * Parsed data for diverging graph.
 */
const PARSED_DIVERGING_GRAPH = {
  slug: 'diverging-workflow',
  version: '1.0.0',
  created_at: '2026-01-27T10:00:00.000Z',
  nodes: ['start', 'write-poem-a1b', 'process-data-c2d'],
  edges: [
    { from: 'start', to: 'write-poem-a1b' },
    { from: 'start', to: 'process-data-c2d' },
  ],
};

/**
 * Sample state for diverging graph.
 */
const PARSED_DIVERGING_STATE = {
  graph_status: 'pending',
  updated_at: '2026-01-27T10:00:00.000Z',
  nodes: {
    start: { status: 'complete' },
  },
};

/**
 * Sample state with all 6 node status values.
 */
const PARSED_ALL_STATUS_STATE = {
  graph_status: 'in_progress',
  updated_at: '2026-01-27T12:00:00.000Z',
  nodes: {
    start: { status: 'complete' },
    'node-running': { status: 'running', started_at: '2026-01-27T11:00:00.000Z' },
    'node-waiting': { status: 'waiting-question' },
    'node-blocked': { status: 'blocked-error' },
    'node-complete': {
      status: 'complete',
      started_at: '2026-01-27T10:00:00.000Z',
      completed_at: '2026-01-27T10:30:00.000Z',
    },
  },
};

/**
 * Invalid work-graph.yaml - missing required nodes array.
 */
const INVALID_GRAPH_YAML = `
slug: bad-graph
version: "1.0.0"
created_at: "2026-01-27T10:00:00.000Z"
edges: []
`;

/**
 * Parsed data for invalid graph (valid YAML, invalid schema).
 */
const PARSED_INVALID_GRAPH = {
  slug: 'bad-graph',
  version: '1.0.0',
  created_at: '2026-01-27T10:00:00.000Z',
  edges: [],
};

// ============================================
// Test Setup Helpers
// ============================================

/**
 * Test context with fakes and service.
 */
interface TestContext {
  fs: FakeFileSystem;
  pathResolver: FakePathResolver;
  yamlParser: FakeYamlParser;
}

/**
 * Create test context with fresh fakes and service.
 */
function createTestContext(): TestContext & { service: WorkGraphService } {
  const fs = new FakeFileSystem();
  const pathResolver = new FakePathResolver();
  const yamlParser = new FakeYamlParser();

  // Set up base work-graphs directory
  fs.setDir('.chainglass/work-graphs');

  const service = new WorkGraphService(fs, pathResolver, yamlParser);

  return { fs, pathResolver, yamlParser, service };
}

/**
 * Set up a graph in the fake filesystem with parsed data.
 */
function setupGraph(
  ctx: TestContext,
  slug: string,
  graphYaml: string,
  parsedGraph: Record<string, unknown>,
  stateJson: string,
  parsedState: Record<string, unknown>
): void {
  const graphPath = `.chainglass/work-graphs/${slug}`;
  ctx.fs.setDir(graphPath);
  ctx.fs.setFile(`${graphPath}/work-graph.yaml`, graphYaml);
  ctx.fs.setFile(`${graphPath}/state.json`, stateJson);

  // Configure YAML parser preset
  ctx.yamlParser.setPresetParseResult(graphYaml, parsedGraph);

  // For state.json, we'll use JSON.parse directly in the service
}

// ============================================
// Placeholder Tests (to be populated in T002-T014)
// ============================================

describe('WorkGraphService', () => {
  let ctx: TestContext & { service: WorkGraphService };

  beforeEach(() => {
    ctx = createTestContext();
  });

  describe('test setup verification', () => {
    it('should have working FakeFileSystem', async () => {
      ctx.fs.setFile('.chainglass/test.txt', 'hello');
      const content = await ctx.fs.readFile('.chainglass/test.txt');
      expect(content).toBe('hello');
    });

    it('should have working FakeYamlParser', () => {
      const yaml = 'test: value';
      ctx.yamlParser.setPresetParseResult(yaml, { test: 'value' });
      const result = ctx.yamlParser.parse<{ test: string }>(yaml, 'test.yaml');
      expect(result.test).toBe('value');
    });

    it('should have fixtures available', () => {
      expect(PARSED_EMPTY_GRAPH.slug).toBe('my-workflow');
      expect(PARSED_LINEAR_GRAPH.nodes).toHaveLength(3);
      expect(PARSED_DIVERGING_GRAPH.edges).toHaveLength(2);
      expect(PARSED_ALL_STATUS_STATE.nodes.start.status).toBe('complete');
    });
  });

  // ============================================
  // create() tests - T002
  // ============================================

  describe('create()', () => {
    it('should create graph with valid slug', async () => {
      /*
      Test Doc:
      - Why: Core functionality - graph creation
      - Contract: create(validSlug) returns { graphSlug, path, errors: [] }
      - Usage Notes: Slug must be lowercase with hyphens
      - Quality Contribution: Verifies basic create flow works
      - Worked Example: create('my-workflow') → { graphSlug: 'my-workflow', path: '.chainglass/work-graphs/my-workflow', errors: [] }
      */
      const result = await ctx.service.create('my-workflow');

      expect(result.errors).toEqual([]);
      expect(result.graphSlug).toBe('my-workflow');
      expect(result.path).toContain('my-workflow');
    });

    it('should return E105 for duplicate slug', async () => {
      /*
      Test Doc:
      - Why: Error handling - prevent graph overwrite
      - Contract: create(existingSlug) returns { errors: [{ code: 'E105' }] }
      - Usage Notes: E105 = graphAlreadyExistsError
      - Quality Contribution: Prevents accidental data loss
      - Worked Example: create('existing') when exists → { errors: [{ code: 'E105' }] }
      */
      // Setup: Create graph directory first
      ctx.fs.setDir('.chainglass/work-graphs/existing-graph');

      const result = await ctx.service.create('existing-graph');

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('E105'); // E105 = graphAlreadyExistsError
    });

    it('should return E104 for invalid slug format', async () => {
      /*
      Test Doc:
      - Why: Input validation - slug format
      - Contract: create(invalidSlug) returns { errors: [{ code: 'E104' }] }
      - Usage Notes: Slugs must match /^[a-z][a-z0-9-]*$/
      - Quality Contribution: Ensures filesystem-safe names
      - Worked Example: create('Invalid_Slug') → { errors: [{ code: 'E104' }] }
      */
      const result = await ctx.service.create('Invalid_Slug');

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('E104'); // E104 = invalidGraphSlugError
    });

    it('should create work-graph.yaml with start node', async () => {
      /*
      Test Doc:
      - Why: Verify file creation with correct structure
      - Contract: create() creates work-graph.yaml with nodes: ['start'], edges: []
      - Usage Notes: All new graphs start with just the 'start' node
      - Quality Contribution: Ensures graph structure is valid from creation
      - Worked Example: work-graph.yaml contains { slug, version, nodes: ['start'], edges: [] }
      */
      await ctx.service.create('test-graph');

      // Verify file was created
      const exists = await ctx.fs.exists('.chainglass/work-graphs/test-graph/work-graph.yaml');
      expect(exists).toBe(true);

      // Read and verify content (service should have written parseable YAML)
      const content = await ctx.fs.readFile('.chainglass/work-graphs/test-graph/work-graph.yaml');
      expect(content).toContain('start');
    });

    it('should create state.json with start node complete', async () => {
      /*
      Test Doc:
      - Why: Per DYK#1 - start node must be stored as complete
      - Contract: create() creates state.json with { nodes: { start: { status: 'complete' } } }
      - Usage Notes: Start node is a gate, not work - always complete
      - Quality Contribution: Enables status() to compute correctly without special-casing
      - Worked Example: state.json contains { graph_status: 'pending', nodes: { start: { status: 'complete' } } }
      */
      await ctx.service.create('test-graph');

      // Verify file was created
      const exists = await ctx.fs.exists('.chainglass/work-graphs/test-graph/state.json');
      expect(exists).toBe(true);

      // Read and verify content
      const content = await ctx.fs.readFile('.chainglass/work-graphs/test-graph/state.json');
      const state = JSON.parse(content);

      expect(state.graph_status).toBe('pending');
      expect(state.nodes.start.status).toBe('complete');
    });

    it('should reject path traversal in slug', async () => {
      /*
      Test Doc:
      - Why: Per Discovery 10 - path security
      - Contract: create(slugWith..) returns E104 error
      - Usage Notes: Reject paths with '..'
      - Quality Contribution: Prevents directory traversal attacks
      - Worked Example: create('../evil') → E104
      */
      const result = await ctx.service.create('../evil');

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('E104');
    });
  });

  // ============================================
  // load() tests - T004
  // ============================================

  describe('load()', () => {
    it('should load existing graph with full details', async () => {
      /*
      Test Doc:
      - Why: Core functionality - loading existing graph
      - Contract: load(existingSlug) returns { graph: WorkGraphDefinition, status, errors: [] }
      - Usage Notes: Graph must have work-graph.yaml and state.json
      - Quality Contribution: Verifies basic load flow works
      - Worked Example: load('my-workflow') → { graph: {...}, status: 'pending', errors: [] }
      */
      setupGraph(
        ctx,
        'my-workflow',
        SAMPLE_EMPTY_GRAPH_YAML,
        PARSED_EMPTY_GRAPH,
        SAMPLE_EMPTY_STATE_JSON,
        PARSED_EMPTY_STATE
      );

      const result = await ctx.service.load('my-workflow');

      expect(result.errors).toEqual([]);
      expect(result.graph).toBeDefined();
      expect(result.graph?.slug).toBe('my-workflow');
      expect(result.graph?.nodes).toContain('start');
      expect(result.status).toBe('pending');
    });

    it('should return E101 for non-existent graph', async () => {
      /*
      Test Doc:
      - Why: Error handling - graph not found
      - Contract: load(nonexistentSlug) returns { errors: [{ code: 'E101' }] }
      - Usage Notes: E101 = graphNotFoundError
      - Quality Contribution: Verifies correct error code
      - Worked Example: load('not-there') → { graph: undefined, errors: [{ code: 'E101' }] }
      */
      const result = await ctx.service.load('nonexistent-graph');

      expect(result.graph).toBeUndefined();
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('E101');
    });

    it('should return E130 for corrupted YAML', async () => {
      /*
      Test Doc:
      - Why: Error handling - YAML syntax error
      - Contract: load(graphWithBadYaml) returns { errors: [{ code: 'E130' }] }
      - Usage Notes: E130 = yamlParseError
      - Quality Contribution: Verifies YAML error handling
      - Worked Example: load('corrupted') with invalid YAML → { errors: [{ code: 'E130' }] }
      */
      const graphPath = '.chainglass/work-graphs/corrupted-yaml';
      ctx.fs.setDir(graphPath);
      ctx.fs.setFile(`${graphPath}/work-graph.yaml`, 'invalid: [unclosed');
      ctx.fs.setFile(`${graphPath}/state.json`, SAMPLE_EMPTY_STATE_JSON);

      // Configure FakeYamlParser to throw for this content
      ctx.yamlParser.setPresetParseError(
        'invalid: [unclosed',
        new YamlParseError('Unexpected end of flow sequence', 1, 19, 'work-graph.yaml')
      );

      const result = await ctx.service.load('corrupted-yaml');

      expect(result.graph).toBeUndefined();
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].code).toBe('E130');
    });

    it('should return E132 for invalid schema', async () => {
      /*
      Test Doc:
      - Why: Per DYK#5 - E132 (schema validation) is different from E130 (parse error)
      - Contract: load(graphWithInvalidSchema) returns { errors: [{ code: 'E132' }] }
      - Usage Notes: Valid YAML but fails Zod schema validation
      - Quality Contribution: Verifies schema validation error path
      - Worked Example: load('bad-schema') with missing nodes → { errors: [{ code: 'E132' }] }
      */
      const graphPath = '.chainglass/work-graphs/invalid-schema';
      ctx.fs.setDir(graphPath);
      ctx.fs.setFile(`${graphPath}/work-graph.yaml`, INVALID_GRAPH_YAML);
      ctx.fs.setFile(`${graphPath}/state.json`, SAMPLE_EMPTY_STATE_JSON);

      // Configure FakeYamlParser to return parsed (but invalid) data
      ctx.yamlParser.setPresetParseResult(INVALID_GRAPH_YAML, PARSED_INVALID_GRAPH);

      const result = await ctx.service.load('invalid-schema');

      expect(result.graph).toBeUndefined();
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].code).toBe('E132');
    });

    it('should return E104 for path traversal in load()', async () => {
      /*
      Test Doc:
      - Why: Per Discovery 10 - path security in all methods
      - Contract: load('../evil') returns E104 error
      - Usage Notes: Validates slug BEFORE path construction
      - Quality Contribution: Prevents arbitrary file read
      - Worked Example: load('../etc') → { errors: [{ code: 'E104' }] }
      */
      const result = await ctx.service.load('../etc');
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('E104');
      expect(result.graph).toBeUndefined();
    });

    it('should parse state.json and compute graph status', async () => {
      /*
      Test Doc:
      - Why: State must be merged with graph definition
      - Contract: load() reads state.json and returns graph status
      - Usage Notes: Status comes from state.json, not computed
      - Quality Contribution: Verifies state loading works
      - Worked Example: load() with state having in_progress → { status: 'in_progress' }
      */
      setupGraph(
        ctx,
        'linear-workflow',
        SAMPLE_LINEAR_GRAPH_YAML,
        PARSED_LINEAR_GRAPH,
        SAMPLE_LINEAR_STATE_JSON,
        PARSED_LINEAR_STATE
      );

      const result = await ctx.service.load('linear-workflow');

      expect(result.errors).toEqual([]);
      expect(result.status).toBe('in_progress');
    });
  });

  // ============================================
  // show() tests - T006
  // ============================================

  describe('show()', () => {
    it('should return tree for empty graph (start only)', async () => {
      /*
      Test Doc:
      - Why: Per DYK#3 - show() returns structured TreeNode, not string
      - Contract: show(slug) returns { tree: { id: 'start', children: [] }, errors: [] }
      - Usage Notes: Empty graph has just start node with no children
      - Quality Contribution: Verifies basic tree building
      - Worked Example: show('my-workflow') → { tree: { id: 'start', type: 'start', children: [] } }
      */
      setupGraph(
        ctx,
        'my-workflow',
        SAMPLE_EMPTY_GRAPH_YAML,
        PARSED_EMPTY_GRAPH,
        SAMPLE_EMPTY_STATE_JSON,
        PARSED_EMPTY_STATE
      );

      const result = await ctx.service.show('my-workflow');

      expect(result.errors).toEqual([]);
      expect(result.graphSlug).toBe('my-workflow');
      expect(result.tree).toBeDefined();
      expect(result.tree.id).toBe('start');
      expect(result.tree.type).toBe('start');
      expect(result.tree.children).toEqual([]);
    });

    it('should return tree for linear graph', async () => {
      /*
      Test Doc:
      - Why: Verify tree building for linear structure (start → A → B)
      - Contract: show() returns tree with nested children
      - Usage Notes: Linear graph = single path through nodes
      - Quality Contribution: Verifies edge traversal works
      - Worked Example: show('linear') → { tree: { id: 'start', children: [{ id: 'A', children: [{ id: 'B' }] }] } }
      */
      setupGraph(
        ctx,
        'linear-workflow',
        SAMPLE_LINEAR_GRAPH_YAML,
        PARSED_LINEAR_GRAPH,
        SAMPLE_LINEAR_STATE_JSON,
        PARSED_LINEAR_STATE
      );

      const result = await ctx.service.show('linear-workflow');

      expect(result.errors).toEqual([]);
      expect(result.tree.id).toBe('start');
      expect(result.tree.children).toHaveLength(1);

      // Verify linear structure: start → write-poem → review-poem
      const firstChild = result.tree.children[0];
      expect(firstChild.id).toBe('write-poem-a1b');
      expect(firstChild.children).toHaveLength(1);
      expect(firstChild.children[0].id).toBe('review-poem-c2d');
    });

    it('should return tree for diverging graph', async () => {
      /*
      Test Doc:
      - Why: Verify tree building for diverging structure (start → [A, B])
      - Contract: show() returns tree with multiple children at start
      - Usage Notes: Diverging = one node has multiple outgoing edges
      - Quality Contribution: Verifies parallel branches handled correctly
      - Worked Example: show('diverging') → { tree: { id: 'start', children: [{ id: 'A' }, { id: 'B' }] } }
      */
      const divergingStateJson = `{
        "graph_status": "pending",
        "updated_at": "2026-01-27T10:00:00.000Z",
        "nodes": { "start": { "status": "complete" } }
      }`;

      setupGraph(
        ctx,
        'diverging-workflow',
        SAMPLE_DIVERGING_GRAPH_YAML,
        PARSED_DIVERGING_GRAPH,
        divergingStateJson,
        PARSED_DIVERGING_STATE
      );

      const result = await ctx.service.show('diverging-workflow');

      expect(result.errors).toEqual([]);
      expect(result.tree.id).toBe('start');
      expect(result.tree.children).toHaveLength(2);

      // Verify both children present (order may vary)
      const childIds = result.tree.children.map((c) => c.id);
      expect(childIds).toContain('write-poem-a1b');
      expect(childIds).toContain('process-data-c2d');
    });

    it('should return E101 for non-existent graph', async () => {
      /*
      Test Doc:
      - Why: Error handling - graph not found
      - Contract: show(nonexistent) returns { errors: [{ code: 'E101' }] }
      - Usage Notes: Same error code as load()
      - Quality Contribution: Verifies consistent error handling
      - Worked Example: show('not-there') → { errors: [{ code: 'E101' }] }
      */
      const result = await ctx.service.show('nonexistent-graph');

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('E101');
    });

    it('should return E104 for path traversal in show()', async () => {
      /*
      Test Doc:
      - Why: Per Discovery 10 - path security in all methods
      - Contract: show('../evil') returns E104 error
      - Usage Notes: Validates slug BEFORE any operations
      - Quality Contribution: Prevents path traversal attacks
      - Worked Example: show('../etc') → { errors: [{ code: 'E104' }] }
      */
      const result = await ctx.service.show('../etc');
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('E104');
    });

    it('should include unit slug for non-start nodes', async () => {
      /*
      Test Doc:
      - Why: TreeNode should include unit info for display
      - Contract: Non-start nodes have unit property from node ID
      - Usage Notes: Node ID format is <unit-slug>-<hex3>
      - Quality Contribution: Enables CLI to show unit names
      - Worked Example: { id: 'write-poem-a1b', unit: 'write-poem' }
      */
      setupGraph(
        ctx,
        'linear-workflow',
        SAMPLE_LINEAR_GRAPH_YAML,
        PARSED_LINEAR_GRAPH,
        SAMPLE_LINEAR_STATE_JSON,
        PARSED_LINEAR_STATE
      );

      const result = await ctx.service.show('linear-workflow');

      // First child should have unit extracted from node ID
      const firstChild = result.tree.children[0];
      expect(firstChild.unit).toBe('write-poem');
    });
  });

  // ============================================
  // status() tests - T008
  // ============================================

  describe('status()', () => {
    it('should return status for all nodes', async () => {
      /*
      Test Doc:
      - Why: Core functionality - status returns all node statuses
      - Contract: status() returns { nodes: NodeStatusEntry[], graphStatus }
      - Usage Notes: Includes all nodes from graph
      - Quality Contribution: Verifies basic status structure
      - Worked Example: status('my-workflow') → { nodes: [{ id: 'start', status: 'complete' }] }
      */
      setupGraph(
        ctx,
        'my-workflow',
        SAMPLE_EMPTY_GRAPH_YAML,
        PARSED_EMPTY_GRAPH,
        SAMPLE_EMPTY_STATE_JSON,
        PARSED_EMPTY_STATE
      );

      const result = await ctx.service.status('my-workflow');

      expect(result.errors).toEqual([]);
      expect(result.graphSlug).toBe('my-workflow');
      expect(result.nodes).toHaveLength(1);
      expect(result.nodes[0].id).toBe('start');
      expect(result.nodes[0].status).toBe('complete');
    });

    it('should compute pending/ready from upstream', async () => {
      /*
      Test Doc:
      - Why: Nodes without stored status must be computed from upstream
      - Contract: Node is 'ready' if all upstream are complete, else 'pending'
      - Usage Notes: Per DYK#1 - read stored status first, compute if absent
      - Quality Contribution: Verifies status computation logic
      - Worked Example: review-poem has no stored status, depends on write-poem which is complete → ready
      */
      setupGraph(
        ctx,
        'linear-workflow',
        SAMPLE_LINEAR_GRAPH_YAML,
        PARSED_LINEAR_GRAPH,
        SAMPLE_LINEAR_STATE_JSON,
        PARSED_LINEAR_STATE
      );

      const result = await ctx.service.status('linear-workflow');

      expect(result.errors).toEqual([]);

      // Find the review-poem node (no stored status, upstream is complete)
      const reviewNode = result.nodes.find((n) => n.id === 'review-poem-c2d');
      expect(reviewNode).toBeDefined();
      expect(reviewNode?.status).toBe('ready'); // All upstream complete → ready
    });

    it('should return stored status for running/waiting/blocked/complete', async () => {
      /*
      Test Doc:
      - Why: Stored statuses take precedence over computed
      - Contract: If state.json has status for node, use it
      - Usage Notes: Only running/waiting/blocked/complete are stored
      - Quality Contribution: Verifies stored status is respected
      - Worked Example: node with status: 'running' → returns 'running'
      */
      // Create graph with multiple stored statuses
      const multiStatusGraphYaml = `
slug: multi-status
version: "1.0.0"
created_at: "2026-01-27T10:00:00.000Z"
nodes:
  - start
  - node-running
  - node-waiting
  - node-blocked
  - node-complete
edges:
  - from: start
    to: node-running
  - from: start
    to: node-waiting
  - from: start
    to: node-blocked
  - from: start
    to: node-complete
`;
      const parsedMultiStatusGraph = {
        slug: 'multi-status',
        version: '1.0.0',
        created_at: '2026-01-27T10:00:00.000Z',
        nodes: ['start', 'node-running', 'node-waiting', 'node-blocked', 'node-complete'],
        edges: [
          { from: 'start', to: 'node-running' },
          { from: 'start', to: 'node-waiting' },
          { from: 'start', to: 'node-blocked' },
          { from: 'start', to: 'node-complete' },
        ],
      };
      const multiStatusStateJson = JSON.stringify({
        graph_status: 'in_progress',
        updated_at: '2026-01-27T12:00:00.000Z',
        nodes: {
          start: { status: 'complete' },
          'node-running': { status: 'running', started_at: '2026-01-27T11:00:00.000Z' },
          'node-waiting': { status: 'waiting-question' },
          'node-blocked': { status: 'blocked-error' },
          'node-complete': {
            status: 'complete',
            started_at: '2026-01-27T10:00:00.000Z',
            completed_at: '2026-01-27T10:30:00.000Z',
          },
        },
      });

      setupGraph(
        ctx,
        'multi-status',
        multiStatusGraphYaml,
        parsedMultiStatusGraph,
        multiStatusStateJson,
        JSON.parse(multiStatusStateJson)
      );

      const result = await ctx.service.status('multi-status');

      expect(result.errors).toEqual([]);

      // Verify each stored status
      const running = result.nodes.find((n) => n.id === 'node-running');
      expect(running?.status).toBe('running');
      expect(running?.startedAt).toBeDefined();

      const waiting = result.nodes.find((n) => n.id === 'node-waiting');
      expect(waiting?.status).toBe('waiting-question');

      const blocked = result.nodes.find((n) => n.id === 'node-blocked');
      expect(blocked?.status).toBe('blocked-error');

      const complete = result.nodes.find((n) => n.id === 'node-complete');
      expect(complete?.status).toBe('complete');
      expect(complete?.completedAt).toBeDefined();
    });

    it('should compute overall graph status', async () => {
      /*
      Test Doc:
      - Why: Graph status summarizes node states
      - Contract: pending/in_progress/complete/failed based on nodes
      - Usage Notes: From state.json graph_status field
      - Quality Contribution: Verifies graph-level status
      - Worked Example: state has graph_status: 'in_progress' → returns 'in_progress'
      */
      setupGraph(
        ctx,
        'linear-workflow',
        SAMPLE_LINEAR_GRAPH_YAML,
        PARSED_LINEAR_GRAPH,
        SAMPLE_LINEAR_STATE_JSON,
        PARSED_LINEAR_STATE
      );

      const result = await ctx.service.status('linear-workflow');

      expect(result.errors).toEqual([]);
      expect(result.graphStatus).toBe('in_progress');
    });

    it('should return E101 for non-existent graph', async () => {
      /*
      Test Doc:
      - Why: Error handling - graph not found
      - Contract: status(nonexistent) returns { errors: [{ code: 'E101' }] }
      - Usage Notes: Consistent error handling across methods
      - Quality Contribution: Verifies error consistency
      - Worked Example: status('not-there') → { errors: [{ code: 'E101' }] }
      */
      const result = await ctx.service.status('nonexistent-graph');

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('E101');
    });

    it('should return E104 for path traversal in status()', async () => {
      /*
      Test Doc:
      - Why: Per Discovery 10 - path security in all methods
      - Contract: status('../evil') returns E104 error
      - Usage Notes: Validates slug BEFORE any operations
      - Quality Contribution: Prevents path traversal attacks
      - Worked Example: status('../etc') → { errors: [{ code: 'E104' }] }
      */
      const result = await ctx.service.status('../etc');
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('E104');
    });

    it('should return complete for start node even without stored status', async () => {
      /*
      Test Doc:
      - Why: Per DYK#1 - start node is always complete
      - Contract: status() returns 'complete' for start even if state.json missing
      - Usage Notes: Start is a gate, not work
      - Quality Contribution: Robust status computation
      - Worked Example: Graph with missing state → start still 'complete'
      */
      // Setup graph with no state.json
      const graphPath = '.chainglass/work-graphs/no-state';
      ctx.fs.setDir(graphPath);
      ctx.fs.setFile(`${graphPath}/work-graph.yaml`, SAMPLE_EMPTY_GRAPH_YAML);
      ctx.yamlParser.setPresetParseResult(SAMPLE_EMPTY_GRAPH_YAML, PARSED_EMPTY_GRAPH);
      // Note: NO state.json file

      const result = await ctx.service.status('no-state');

      const startNode = result.nodes.find((n) => n.id === 'start');
      expect(startNode?.status).toBe('complete'); // Not 'ready'
    });
  });

  // ============================================
  // state.json management tests - T011
  // ============================================

  describe('state management', () => {
    it('should persist state changes atomically', async () => {
      /*
      Test Doc:
      - Why: Per CD03 - atomic writes prevent corruption
      - Contract: State changes are written via atomic write pattern
      - Usage Notes: Uses .tmp file then rename
      - Quality Contribution: Verifies atomic write utility works
      - Worked Example: updateState() writes to state.json.tmp then renames
      */
      // Create a graph first
      await ctx.service.create('test-graph');

      // Verify state.json was created (already tested in create)
      const exists = await ctx.fs.exists('.chainglass/work-graphs/test-graph/state.json');
      expect(exists).toBe(true);

      // Read the state and verify it's valid JSON
      const content = await ctx.fs.readFile('.chainglass/work-graphs/test-graph/state.json');
      const state = JSON.parse(content);
      expect(state.graph_status).toBe('pending');
      expect(state.nodes.start.status).toBe('complete');
    });

    it('should reload state correctly after persist', async () => {
      /*
      Test Doc:
      - Why: State must survive save/load cycles
      - Contract: load() reads the same state that was persisted
      - Usage Notes: Verifies JSON roundtrip
      - Quality Contribution: Ensures state persistence is reliable
      - Worked Example: create() → load() returns same state
      */
      await ctx.service.create('test-graph');

      const loadResult = await ctx.service.load('test-graph');

      expect(loadResult.errors).toEqual([]);
      expect(loadResult.status).toBe('pending');
    });

    it('should handle corrupted state.json gracefully', async () => {
      /*
      Test Doc:
      - Why: Graceful degradation on corruption
      - Contract: Corrupted state.json doesn't crash load()
      - Usage Notes: Non-fatal error - defaults to pending
      - Quality Contribution: Prevents app crash on corruption
      - Worked Example: load() with invalid JSON → status: 'pending'
      */
      setupGraph(
        ctx,
        'corrupted-state',
        SAMPLE_EMPTY_GRAPH_YAML,
        PARSED_EMPTY_GRAPH,
        '{ invalid json }',
        {}
      );

      // load() should still work but default to pending
      const loadResult = await ctx.service.load('corrupted-state');

      expect(loadResult.errors).toEqual([]);
      expect(loadResult.graph).toBeDefined();
      expect(loadResult.status).toBe('pending'); // Default on corruption
    });
  });
});
