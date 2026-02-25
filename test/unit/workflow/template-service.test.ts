/**
 * TemplateService TDD tests — saveFrom, listWorkflows, showWorkflow,
 * instantiate, listInstances, refresh.
 *
 * Why: Validates the core template lifecycle operations against real filesystem
 * operations using FakeFileSystem. TDD per constitution P3.
 *
 * Contract: ITemplateService — all methods return {data, errors} Result pattern.
 *
 * Usage Notes: Tests use FakeFileSystem with pre-populated graph data to simulate
 * working graphs. Each test group covers one service method.
 *
 * Quality Contribution: Ensures templates strip runtime state, bundle units,
 * and produce valid TemplateManifest/InstanceMetadata results.
 *
 * Worked Example: A graph at .chainglass/data/workflows/my-graph/ with 2 nodes
 * referencing 2 units is saved as a template, verified to contain graph.yaml,
 * nodes/*, and bundled units/ — with state.json excluded.
 */

import { FakeFileSystem, FakePathResolver, FakeYamlParser } from '@chainglass/shared';
import { beforeEach, describe, expect, it } from 'vitest';

import { InstanceAdapter } from '../../../packages/workflow/src/adapters/instance.adapter.js';
import { TemplateAdapter } from '../../../packages/workflow/src/adapters/template.adapter.js';
import { TemplateService } from '../../../packages/workflow/src/services/template.service.js';
import { createTestWorkspaceContext } from '../../helpers/workspace-context.js';

const WORKTREE = '/test-workspace';

function makeGraphYaml() {
  return {
    slug: 'my-graph',
    version: '1.0.0',
    description: 'Test graph',
    created_at: '2026-01-01T00:00:00Z',
    lines: [
      {
        id: 'line-1',
        nodes: ['writer-a1b', 'reviewer-c3d'],
        properties: {},
        orchestratorSettings: {},
      },
    ],
    properties: {},
    orchestratorSettings: {},
  };
}

function makeNodeYaml(id: string, unitSlug: string) {
  return {
    id,
    unit_slug: unitSlug,
    created_at: '2026-01-01T00:00:00Z',
    inputs: {},
    properties: {},
    orchestratorSettings: {},
  };
}

function makeUnitYaml(slug: string, type: string) {
  return {
    slug,
    type,
    version: '1.0.0',
    outputs: [{ name: 'result', type: 'data', data_type: 'text', required: true }],
  };
}

describe('TemplateService', () => {
  let fs: FakeFileSystem;
  let pathResolver: FakePathResolver;
  let yamlParser: FakeYamlParser;
  let templateAdapter: TemplateAdapter;
  let instanceAdapter: InstanceAdapter;
  let service: TemplateService;
  const ctx = createTestWorkspaceContext(WORKTREE);

  beforeEach(() => {
    fs = new FakeFileSystem();
    pathResolver = new FakePathResolver();
    yamlParser = new FakeYamlParser();
    templateAdapter = new TemplateAdapter(fs, pathResolver);
    instanceAdapter = new InstanceAdapter(fs, pathResolver);
    service = new TemplateService(fs, pathResolver, yamlParser, templateAdapter, instanceAdapter);
  });

  function setupWorkingGraph() {
    const graphYaml = makeGraphYaml();
    const writerNode = makeNodeYaml('writer-a1b', 'spec-writer');
    const reviewerNode = makeNodeYaml('reviewer-c3d', 'code-reviewer');

    // Graph definition files
    const graphDir = `${WORKTREE}/.chainglass/data/workflows/my-graph`;
    fs.setFile(`${graphDir}/graph.yaml`, 'graph-yaml-content');
    fs.setFile(`${graphDir}/nodes/writer-a1b/node.yaml`, 'writer-node-yaml');
    fs.setFile(`${graphDir}/nodes/reviewer-c3d/node.yaml`, 'reviewer-node-yaml');

    // Runtime artifacts (should be excluded)
    fs.setFile(`${graphDir}/state.json`, '{"graph_status":"complete"}');
    fs.setDir(`${graphDir}/nodes/writer-a1b/outputs`);
    fs.setFile(`${graphDir}/nodes/writer-a1b/outputs/main.md`, 'output content');
    fs.setFile(`${graphDir}/nodes/writer-a1b/events.json`, '[]');

    // Global units
    const unitsDir = `${WORKTREE}/.chainglass/units`;
    fs.setFile(`${unitsDir}/spec-writer/unit.yaml`, 'writer-unit-yaml');
    fs.setFile(`${unitsDir}/spec-writer/prompts/main.md`, 'Write a spec...');
    fs.setFile(`${unitsDir}/code-reviewer/unit.yaml`, 'reviewer-unit-yaml');
    fs.setFile(`${unitsDir}/code-reviewer/prompts/main.md`, 'Review the code...');

    // Configure YAML parser to return structured data
    yamlParser.setPresetParseResult('graph-yaml-content', graphYaml);
    yamlParser.setPresetParseResult('writer-node-yaml', writerNode);
    yamlParser.setPresetParseResult('reviewer-node-yaml', reviewerNode);
    yamlParser.setPresetParseResult('writer-unit-yaml', makeUnitYaml('spec-writer', 'agent'));
    yamlParser.setPresetParseResult('reviewer-unit-yaml', makeUnitYaml('code-reviewer', 'agent'));
  }

  describe('saveFrom', () => {
    it('should copy graph.yaml to template directory', async () => {
      setupWorkingGraph();
      const result = await service.saveFrom(ctx, 'my-graph', 'my-template');

      expect(result.errors).toHaveLength(0);
      expect(result.data).not.toBeNull();

      const templateGraphPath = `${WORKTREE}/.chainglass/templates/workflows/my-template/graph.yaml`;
      expect(await fs.exists(templateGraphPath)).toBe(true);
    });

    it('should copy node.yaml files for each node', async () => {
      setupWorkingGraph();
      await service.saveFrom(ctx, 'my-graph', 'my-template');

      const templateDir = `${WORKTREE}/.chainglass/templates/workflows/my-template`;
      expect(await fs.exists(`${templateDir}/nodes/writer-a1b/node.yaml`)).toBe(true);
      expect(await fs.exists(`${templateDir}/nodes/reviewer-c3d/node.yaml`)).toBe(true);
    });

    it('should exclude state.json from template', async () => {
      setupWorkingGraph();
      await service.saveFrom(ctx, 'my-graph', 'my-template');

      const templateDir = `${WORKTREE}/.chainglass/templates/workflows/my-template`;
      expect(await fs.exists(`${templateDir}/state.json`)).toBe(false);
    });

    it('should exclude node outputs and events from template', async () => {
      setupWorkingGraph();
      await service.saveFrom(ctx, 'my-graph', 'my-template');

      const templateDir = `${WORKTREE}/.chainglass/templates/workflows/my-template`;
      expect(await fs.exists(`${templateDir}/nodes/writer-a1b/outputs/main.md`)).toBe(false);
      expect(await fs.exists(`${templateDir}/nodes/writer-a1b/events.json`)).toBe(false);
    });

    it('should bundle referenced units from global units directory', async () => {
      setupWorkingGraph();
      await service.saveFrom(ctx, 'my-graph', 'my-template');

      const templateDir = `${WORKTREE}/.chainglass/templates/workflows/my-template`;
      expect(await fs.exists(`${templateDir}/units/spec-writer/unit.yaml`)).toBe(true);
      expect(await fs.exists(`${templateDir}/units/spec-writer/prompts/main.md`)).toBe(true);
      expect(await fs.exists(`${templateDir}/units/code-reviewer/unit.yaml`)).toBe(true);
      expect(await fs.exists(`${templateDir}/units/code-reviewer/prompts/main.md`)).toBe(true);
    });

    it('should return TemplateManifest with correct metadata', async () => {
      setupWorkingGraph();
      const result = await service.saveFrom(ctx, 'my-graph', 'my-template');

      expect(result.data).toMatchObject({
        slug: 'my-template',
        graphSlug: 'my-graph',
        graphVersion: '1.0.0',
        lineCount: 1,
      });
      expect(result.data?.nodes).toHaveLength(2);
      expect(result.data?.units).toHaveLength(2);
    });

    it('should deduplicate units when multiple nodes reference the same unit', async () => {
      setupWorkingGraph();
      // Add a third node that references the same unit as the first
      const graphYaml = makeGraphYaml();
      graphYaml.lines[0].nodes.push('writer2-e5f');
      fs.setFile(
        `${WORKTREE}/.chainglass/data/workflows/my-graph/nodes/writer2-e5f/node.yaml`,
        'writer2-node-yaml'
      );
      yamlParser.setPresetParseResult(
        'writer2-node-yaml',
        makeNodeYaml('writer2-e5f', 'spec-writer')
      );
      yamlParser.setPresetParseResult('graph-yaml-content', graphYaml);

      const result = await service.saveFrom(ctx, 'my-graph', 'my-template');

      // Should have 3 nodes but only 2 unique units
      expect(result.data?.nodes).toHaveLength(3);
      expect(result.data?.units).toHaveLength(2);
    });

    it('should return error if graph does not exist', async () => {
      // No graph setup
      const result = await service.saveFrom(ctx, 'nonexistent', 'my-template');

      expect(result.data).toBeNull();
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('nonexistent');
    });
  });

  describe('listWorkflows', () => {
    /**
     * Why: Validates template discovery via glob scan of templates directory.
     * Contract: ITemplateService.listWorkflows returns TemplateManifest[].
     * Usage Notes: Uses pre-populated template dirs in FakeFileSystem.
     * Quality Contribution: Ensures template listing returns correct manifest data.
     * Worked Example: Two templates → listWorkflows returns 2 manifests.
     */

    it('should return empty list when no templates exist', async () => {
      const result = await service.listWorkflows(ctx);
      expect(result.errors).toHaveLength(0);
      expect(result.data).toHaveLength(0);
    });

    it('should list templates after saveFrom', async () => {
      setupWorkingGraph();
      await service.saveFrom(ctx, 'my-graph', 'my-template');

      const result = await service.listWorkflows(ctx);
      expect(result.errors).toHaveLength(0);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].slug).toBe('my-template');
    });
  });

  describe('showWorkflow', () => {
    /**
     * Why: Validates single template inspection returning full manifest.
     * Contract: ITemplateService.showWorkflow returns TemplateManifest | null.
     * Usage Notes: Returns null for non-existent templates (not error).
     * Quality Contribution: Verifies node and unit counts match expected values.
     * Worked Example: Show a template with 2 nodes and 2 units.
     */

    it('should return null for non-existent template', async () => {
      const result = await service.showWorkflow(ctx, 'nonexistent');
      expect(result.errors).toHaveLength(0);
      expect(result.data).toBeNull();
    });

    it('should return manifest for existing template', async () => {
      setupWorkingGraph();
      await service.saveFrom(ctx, 'my-graph', 'my-template');

      const result = await service.showWorkflow(ctx, 'my-template');
      expect(result.errors).toHaveLength(0);
      expect(result.data).not.toBeNull();
      expect(result.data?.slug).toBe('my-template');
      expect(result.data?.nodes).toHaveLength(2);
      expect(result.data?.units).toHaveLength(2);
    });
  });

  describe('instantiate', () => {
    /**
     * Why: Validates template instantiation produces independent copy with fresh state.
     * Contract: ITemplateService.instantiate returns InstanceMetadata.
     * Usage Notes: Per Workshop 003 — single destination, all data tracked.
     * Quality Contribution: Ensures instances are self-contained with correct metadata.
     * Worked Example: Instantiate a 2-node template, verify all files copied + state.json created.
     */

    it('should copy graph.yaml to instance directory', async () => {
      setupWorkingGraph();
      await service.saveFrom(ctx, 'my-graph', 'my-template');

      const result = await service.instantiate(ctx, 'my-template', 'sprint-42');
      expect(result.errors).toHaveLength(0);

      const instanceDir = `${WORKTREE}/.chainglass/instances/my-template/sprint-42`;
      expect(await fs.exists(`${instanceDir}/graph.yaml`)).toBe(true);
    });

    it('should copy node.yaml files to instance', async () => {
      setupWorkingGraph();
      await service.saveFrom(ctx, 'my-graph', 'my-template');
      await service.instantiate(ctx, 'my-template', 'sprint-42');

      const instanceDir = `${WORKTREE}/.chainglass/instances/my-template/sprint-42`;
      expect(await fs.exists(`${instanceDir}/nodes/writer-a1b/node.yaml`)).toBe(true);
      expect(await fs.exists(`${instanceDir}/nodes/reviewer-c3d/node.yaml`)).toBe(true);
    });

    it('should create fresh state.json with pending status', async () => {
      setupWorkingGraph();
      await service.saveFrom(ctx, 'my-graph', 'my-template');
      await service.instantiate(ctx, 'my-template', 'sprint-42');

      const instanceDir = `${WORKTREE}/.chainglass/instances/my-template/sprint-42`;
      const stateContent = await fs.readFile(`${instanceDir}/state.json`);
      const state = JSON.parse(stateContent);
      expect(state.graph_status).toBe('pending');
      expect(state.nodes).toEqual({});
    });

    it('should copy units to instance', async () => {
      setupWorkingGraph();
      await service.saveFrom(ctx, 'my-graph', 'my-template');
      await service.instantiate(ctx, 'my-template', 'sprint-42');

      const instanceDir = `${WORKTREE}/.chainglass/instances/my-template/sprint-42`;
      expect(await fs.exists(`${instanceDir}/units/spec-writer/unit.yaml`)).toBe(true);
      expect(await fs.exists(`${instanceDir}/units/code-reviewer/unit.yaml`)).toBe(true);
    });

    it('should write instance.yaml with correct metadata', async () => {
      setupWorkingGraph();
      await service.saveFrom(ctx, 'my-graph', 'my-template');
      const result = await service.instantiate(ctx, 'my-template', 'sprint-42');

      expect(result.data).not.toBeNull();
      expect(result.data?.slug).toBe('sprint-42');
      expect(result.data?.template_source).toBe('my-template');
      expect(result.data?.units).toHaveLength(2);
    });

    it('should return error for non-existent template', async () => {
      const result = await service.instantiate(ctx, 'nonexistent', 'sprint-42');
      expect(result.data).toBeNull();
      expect(result.errors).toHaveLength(1);
    });
  });

  describe('listInstances', () => {
    /**
     * Why: Validates instance discovery for a template.
     * Contract: ITemplateService.listInstances returns InstanceMetadata[].
     * Usage Notes: Lists instances by scanning instance directories.
     * Quality Contribution: Ensures instance listing returns correct metadata.
     * Worked Example: Two instances from same template → list returns both.
     */

    it('should return empty list when no instances exist', async () => {
      const result = await service.listInstances(ctx, 'my-template');
      expect(result.errors).toHaveLength(0);
      expect(result.data).toHaveLength(0);
    });

    it('should list instances after instantiation', async () => {
      setupWorkingGraph();
      await service.saveFrom(ctx, 'my-graph', 'my-template');
      await service.instantiate(ctx, 'my-template', 'sprint-42');
      await service.instantiate(ctx, 'my-template', 'sprint-43');

      const result = await service.listInstances(ctx, 'my-template');
      expect(result.errors).toHaveLength(0);
      expect(result.data).toHaveLength(2);
    });
  });

  describe('refresh', () => {
    /**
     * Why: Validates unit refresh overwrites instance units from template.
     * Contract: ITemplateService.refresh returns refreshed unit slugs + metadata.
     * Usage Notes: Per spec AC-16 — warns on active run.
     * Quality Contribution: Ensures refresh updates timestamps and content.
     * Worked Example: Update template unit prompt, refresh instance, verify new content.
     */

    it('should refresh units from template', async () => {
      setupWorkingGraph();
      await service.saveFrom(ctx, 'my-graph', 'my-template');
      await service.instantiate(ctx, 'my-template', 'sprint-42');

      // Modify template unit (simulate template update)
      const templateUnitPath = `${WORKTREE}/.chainglass/templates/workflows/my-template/units/spec-writer/prompts/main.md`;
      fs.setFile(templateUnitPath, 'UPDATED prompt content');

      const result = await service.refresh(ctx, 'my-template', 'sprint-42');
      expect(result.errors).toHaveLength(0);
      expect(result.data).not.toBeNull();
      expect(result.data?.refreshedUnits).toContain('spec-writer');
      expect(result.data?.refreshedUnits).toContain('code-reviewer');
    });

    it('should warn if instance has active run', async () => {
      setupWorkingGraph();
      await service.saveFrom(ctx, 'my-graph', 'my-template');
      await service.instantiate(ctx, 'my-template', 'sprint-42');

      // Simulate active run
      const instanceDir = `${WORKTREE}/.chainglass/instances/my-template/sprint-42`;
      const activeState = {
        graph_status: 'in_progress',
        updated_at: new Date().toISOString(),
        nodes: {},
      };
      fs.setFile(`${instanceDir}/state.json`, JSON.stringify(activeState));

      const result = await service.refresh(ctx, 'my-template', 'sprint-42');
      expect(result.data).not.toBeNull();
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('ACTIVE_RUN_WARNING');
    });

    it('should update refreshed_at timestamps', async () => {
      setupWorkingGraph();
      await service.saveFrom(ctx, 'my-graph', 'my-template');
      await service.instantiate(ctx, 'my-template', 'sprint-42');

      const result = await service.refresh(ctx, 'my-template', 'sprint-42');
      expect(result.data).not.toBeNull();

      // All units should have updated refreshed_at
      for (const unit of result.data?.instanceMetadata.units ?? []) {
        expect(unit.refreshed_at).toBeDefined();
      }
    });

    it('should return error for non-existent instance', async () => {
      const result = await service.refresh(ctx, 'my-template', 'nonexistent');
      expect(result.data).toBeNull();
      expect(result.errors).toHaveLength(1);
    });
  });
});
