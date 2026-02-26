/**
 * E2E test: Template lifecycle.
 *
 * Why: Proves the full template lifecycle works end-to-end with committed
 * templates, real filesystem, and real YAML parsing.
 *
 * Contract: withTemplateWorkflow() + TemplateService produce correct,
 * isolated, refreshable instances from committed template artifacts.
 *
 * Usage Notes: Uses withTemplateWorkflow('simple-serial') which copies
 * the committed template to a temp workspace and instantiates.
 *
 * Quality Contribution: AC-21 — full lifecycle validation. Also covers
 * isolation and refresh with input wiring preservation.
 *
 * Worked Example: Instantiate simple-serial (2 nodes, wiring) → verify
 * structure → modify template → verify isolation → refresh → verify update.
 */

import * as nodeFs from 'node:fs/promises';
import * as path from 'node:path';

import { YamlParserAdapter } from '@chainglass/shared';
import { describe, expect, it } from 'vitest';

import {
  type TemplateTestContext,
  withTemplateWorkflow,
} from '../../dev/test-graphs/shared/template-test-runner.js';

describe('Template lifecycle E2E', () => {
  it('should instantiate simple-serial with correct structure', async () => {
    await withTemplateWorkflow('simple-serial', async (ttc: TemplateTestContext) => {
      const instanceDir = path.join(
        ttc.workspacePath,
        '.chainglass',
        'instances',
        'simple-serial',
        ttc.instanceId
      );

      // Verify instance structure
      expect(await fileExists(path.join(instanceDir, 'graph.yaml'))).toBe(true);
      expect(await fileExists(path.join(instanceDir, 'state.json'))).toBe(true);
      expect(await fileExists(path.join(instanceDir, 'instance.yaml'))).toBe(true);

      // Verify state is pending
      const state = JSON.parse(
        await nodeFs.readFile(path.join(instanceDir, 'state.json'), 'utf-8')
      );
      expect(state.graph_status).toBe('pending');

      // Verify graph has 2 lines
      const yamlParser = new YamlParserAdapter();
      const graphContent = await nodeFs.readFile(path.join(instanceDir, 'graph.yaml'), 'utf-8');
      const graph = yamlParser.parse<{ lines: unknown[] }>(graphContent, 'graph.yaml');
      expect(graph.lines).toHaveLength(2);

      // Verify both units present
      expect(await fileExists(path.join(instanceDir, 'units', 'setup', 'unit.yaml'))).toBe(true);
      expect(await fileExists(path.join(instanceDir, 'units', 'worker', 'unit.yaml'))).toBe(true);
    });
  });

  it('should preserve input wiring in instance nodes', async () => {
    await withTemplateWorkflow('simple-serial', async (ttc: TemplateTestContext) => {
      const instanceDir = path.join(
        ttc.workspacePath,
        '.chainglass',
        'instances',
        'simple-serial',
        ttc.instanceId
      );

      // Find the worker node (has input wiring)
      const nodesDir = path.join(instanceDir, 'nodes');
      const nodeIds = await nodeFs.readdir(nodesDir);
      const yamlParser = new YamlParserAdapter();

      let foundWiring = false;
      for (const nodeId of nodeIds) {
        const nodeYaml = path.join(nodesDir, nodeId, 'node.yaml');
        const content = await nodeFs.readFile(nodeYaml, 'utf-8');
        const node = yamlParser.parse<{ unit_slug: string; inputs?: Record<string, unknown> }>(
          content,
          nodeYaml
        );
        if (node.unit_slug === 'worker' && node.inputs?.task) {
          foundWiring = true;
          const taskInput = node.inputs.task as { from_node: string; from_output: string };
          expect(taskInput.from_output).toBe('instructions');
        }
      }
      expect(foundWiring).toBe(true);
    });
  });

  it('should not propagate template changes to instance', async () => {
    await withTemplateWorkflow('simple-serial', async (ttc: TemplateTestContext) => {
      const instanceDir = path.join(
        ttc.workspacePath,
        '.chainglass',
        'instances',
        'simple-serial',
        ttc.instanceId
      );
      const templateDir = path.join(
        ttc.workspacePath,
        '.chainglass',
        'templates',
        'workflows',
        'simple-serial'
      );

      // Read original instance unit
      const instanceUnit = path.join(instanceDir, 'units', 'setup', 'unit.yaml');
      const originalContent = await nodeFs.readFile(instanceUnit, 'utf-8');

      // Modify template unit
      const templateUnit = path.join(templateDir, 'units', 'setup', 'unit.yaml');
      await nodeFs.writeFile(
        templateUnit,
        'slug: setup\ntype: user-input\nversion: 99.0.0\nMODIFIED: true\n'
      );

      // Instance should be unchanged
      const afterModify = await nodeFs.readFile(instanceUnit, 'utf-8');
      expect(afterModify).toBe(originalContent);
    });
  });

  it('should refresh instance units from template', async () => {
    await withTemplateWorkflow('simple-serial', async (ttc: TemplateTestContext) => {
      const instanceDir = path.join(
        ttc.workspacePath,
        '.chainglass',
        'instances',
        'simple-serial',
        ttc.instanceId
      );
      const templateDir = path.join(
        ttc.workspacePath,
        '.chainglass',
        'templates',
        'workflows',
        'simple-serial'
      );

      // Modify template unit
      const templateUnit = path.join(templateDir, 'units', 'setup', 'unit.yaml');
      await nodeFs.writeFile(
        templateUnit,
        'slug: setup\ntype: user-input\nversion: 99.0.0\nREFRESHED: true\n'
      );

      // Refresh
      const result = await ttc.templateService.refresh(ttc.ctx, 'simple-serial', ttc.instanceId);
      expect(result.data).not.toBeNull();
      expect(result.data?.refreshedUnits).toContain('setup');

      // Instance should now have updated content
      const instanceUnit = path.join(instanceDir, 'units', 'setup', 'unit.yaml');
      const afterRefresh = await nodeFs.readFile(instanceUnit, 'utf-8');
      expect(afterRefresh).toContain('REFRESHED: true');
    });
  });

  it('should create independent second instance', async () => {
    await withTemplateWorkflow('simple-serial', async (ttc: TemplateTestContext) => {
      // Create a second instance
      const result2 = await ttc.templateService.instantiate(ttc.ctx, 'simple-serial', 'second-run');
      expect(result2.errors).toHaveLength(0);

      const inst1Dir = path.join(
        ttc.workspacePath,
        '.chainglass',
        'instances',
        'simple-serial',
        ttc.instanceId
      );
      const inst2Dir = path.join(
        ttc.workspacePath,
        '.chainglass',
        'instances',
        'simple-serial',
        'second-run'
      );

      // Both exist independently
      expect(await fileExists(path.join(inst1Dir, 'state.json'))).toBe(true);
      expect(await fileExists(path.join(inst2Dir, 'state.json'))).toBe(true);

      // Modify state in first
      await nodeFs.writeFile(
        path.join(inst1Dir, 'state.json'),
        JSON.stringify({ graph_status: 'complete', nodes: {} })
      );

      // Second is unaffected
      const state2 = JSON.parse(await nodeFs.readFile(path.join(inst2Dir, 'state.json'), 'utf-8'));
      expect(state2.graph_status).toBe('pending');
    });
  });
});

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await nodeFs.stat(filePath);
    return true;
  } catch {
    return false;
  }
}
