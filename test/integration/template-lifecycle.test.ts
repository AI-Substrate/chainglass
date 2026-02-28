/**
 * Integration test: Template lifecycle and script path validation.
 *
 * Why: Validates that scripts in work units remain executable and can
 * resolve their own paths after being copied from template to instance.
 * Per Finding 01 (Critical): Script relative paths may break.
 *
 * Contract: TemplateService.saveFrom() + instantiate() preserve script
 * executability and path structure.
 *
 * Usage Notes: Uses real FakeFileSystem with code unit containing scripts/.
 * Verifies script file exists and is accessible after the full lifecycle.
 *
 * Quality Contribution: Catches the critical risk of script path breakage
 * when units are copied between directories.
 *
 * Worked Example: A code unit with scripts/ping.sh → save as template →
 * instantiate → verify script exists at instance path.
 */

import { FakeFileSystem, FakePathResolver, FakeYamlParser } from '@chainglass/shared';
import { beforeEach, describe, expect, it } from 'vitest';

import { InstanceAdapter } from '../../packages/workflow/src/adapters/instance.adapter.js';
import { TemplateAdapter } from '../../packages/workflow/src/adapters/template.adapter.js';
import { TemplateService } from '../../packages/workflow/src/services/template.service.js';
import { createTestWorkspaceContext } from '../helpers/workspace-context.js';

const WORKTREE = '/test-workspace';

describe('Template lifecycle: script paths after copy', () => {
  let fs: FakeFileSystem;
  let pathResolver: FakePathResolver;
  let yamlParser: FakeYamlParser;
  let service: TemplateService;
  const ctx = createTestWorkspaceContext(WORKTREE);

  beforeEach(() => {
    fs = new FakeFileSystem();
    pathResolver = new FakePathResolver();
    yamlParser = new FakeYamlParser();
    const templateAdapter = new TemplateAdapter(fs, pathResolver);
    const instanceAdapter = new InstanceAdapter(fs, pathResolver);
    service = new TemplateService(fs, pathResolver, yamlParser, templateAdapter, instanceAdapter);
  });

  function setupGraphWithCodeUnit() {
    const graphYaml = {
      slug: 'code-graph',
      version: '1.0.0',
      created_at: '2026-01-01T00:00:00Z',
      lines: [{ id: 'line-0', nodes: ['ping-a1b'], properties: {}, orchestratorSettings: {} }],
      properties: {},
      orchestratorSettings: {},
    };

    const nodeYaml = {
      id: 'ping-a1b',
      unit_slug: 'ping',
      created_at: '2026-01-01T00:00:00Z',
      inputs: {},
      properties: {},
      orchestratorSettings: {},
    };

    const unitYaml = {
      slug: 'ping',
      type: 'code',
      version: '1.0.0',
      outputs: [{ name: 'result', type: 'data', data_type: 'text', required: true }],
      code: { script: 'scripts/ping.sh' },
    };

    const graphDir = `${WORKTREE}/.chainglass/data/workflows/code-graph`;
    fs.setFile(`${graphDir}/graph.yaml`, 'graph-yaml');
    fs.setFile(`${graphDir}/nodes/ping-a1b/node.yaml`, 'node-yaml');
    fs.setFile(`${graphDir}/state.json`, '{}');

    const unitsDir = `${WORKTREE}/.chainglass/units`;
    fs.setFile(`${unitsDir}/ping/unit.yaml`, 'unit-yaml');
    fs.setFile(`${unitsDir}/ping/scripts/ping.sh`, '#!/bin/bash\necho "pong"');

    yamlParser.setPresetParseResult('graph-yaml', graphYaml);
    yamlParser.setPresetParseResult('node-yaml', nodeYaml);
    yamlParser.setPresetParseResult('unit-yaml', unitYaml);
  }

  it('should preserve script files from template to instance', async () => {
    setupGraphWithCodeUnit();

    // Save as template
    const saveResult = await service.saveFrom(ctx, 'code-graph', 'code-template');
    expect(saveResult.errors).toHaveLength(0);

    // Verify script in template
    const templateScript = `${WORKTREE}/.chainglass/templates/workflows/code-template/units/ping/scripts/ping.sh`;
    expect(await fs.exists(templateScript)).toBe(true);
    expect(await fs.readFile(templateScript)).toContain('echo "pong"');

    // Instantiate
    const instResult = await service.instantiate(ctx, 'code-template', 'run-1');
    expect(instResult.errors).toHaveLength(0);

    // Verify script in instance
    const instanceScript = `${WORKTREE}/.chainglass/instances/code-template/run-1/units/ping/scripts/ping.sh`;
    expect(await fs.exists(instanceScript)).toBe(true);
    expect(await fs.readFile(instanceScript)).toContain('echo "pong"');
  });

  it('should preserve unit.yaml alongside script in instance', async () => {
    setupGraphWithCodeUnit();

    await service.saveFrom(ctx, 'code-graph', 'code-template');
    await service.instantiate(ctx, 'code-template', 'run-1');

    // unit.yaml should be at same level as scripts/
    const instanceUnitYaml = `${WORKTREE}/.chainglass/instances/code-template/run-1/units/ping/unit.yaml`;
    expect(await fs.exists(instanceUnitYaml)).toBe(true);
  });

  it('should preserve script paths through refresh', async () => {
    setupGraphWithCodeUnit();

    await service.saveFrom(ctx, 'code-graph', 'code-template');
    await service.instantiate(ctx, 'code-template', 'run-1');

    // Update script in template
    const templateScript = `${WORKTREE}/.chainglass/templates/workflows/code-template/units/ping/scripts/ping.sh`;
    fs.setFile(templateScript, '#!/bin/bash\necho "UPDATED pong"');

    // Refresh
    const refreshResult = await service.refresh(ctx, 'code-template', 'run-1');
    expect(refreshResult.errors).toHaveLength(0);

    // Verify updated script in instance
    const instanceScript = `${WORKTREE}/.chainglass/instances/code-template/run-1/units/ping/scripts/ping.sh`;
    expect(await fs.readFile(instanceScript)).toContain('UPDATED pong');
  });
});
