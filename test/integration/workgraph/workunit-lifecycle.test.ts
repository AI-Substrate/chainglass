/**
 * Integration test for WorkUnit lifecycle.
 *
 * Per plan 2.11: create → validate → list → load lifecycle.
 *
 * Uses FakeFileSystem, FakePathResolver, FakeYamlParser for isolated testing.
 *
 * Per Plan 021 Phase 6: Updated to pass WorkspaceContext to all service methods.
 */

import { FakeFileSystem, FakePathResolver, FakeYamlParser } from '@chainglass/shared';
import type { WorkspaceContext } from '@chainglass/workflow';
import { WorkUnitService } from '@chainglass/workgraph';
import { beforeEach, describe, expect, it } from 'vitest';

import { createTestWorkspaceContext } from '../../helpers/workspace-context.js';

describe('WorkUnit Lifecycle Integration', () => {
  let fs: FakeFileSystem;
  let pathResolver: FakePathResolver;
  let yamlParser: FakeYamlParser;
  let service: WorkUnitService;
  let ctx: WorkspaceContext;

  beforeEach(() => {
    fs = new FakeFileSystem();
    pathResolver = new FakePathResolver();
    yamlParser = new FakeYamlParser();
    service = new WorkUnitService(fs, pathResolver, yamlParser);

    // Create workspace context with absolute path
    ctx = createTestWorkspaceContext('/test-workspace');

    // Set up base units directory (new workspace-scoped path)
    fs.setDir('/test-workspace/.chainglass/data/units');
  });

  it('should support full lifecycle: create → validate → list → load', async () => {
    /*
    Test Doc:
    - Why: End-to-end validation of WorkUnit management
    - Contract: Created unit should be validatable, listable, and loadable
    - Quality Contribution: Ensures all operations work together
    */

    // Step 1: Create a new agent unit
    const createResult = await service.create(ctx, 'my-agent', 'agent');
    expect(createResult.errors).toEqual([]);
    expect(createResult.slug).toBe('my-agent');
    expect(createResult.path).toContain('my-agent');

    // Verify directory structure created (new workspace-scoped path)
    expect(await fs.exists('/test-workspace/.chainglass/data/units/my-agent')).toBe(true);
    expect(await fs.exists('/test-workspace/.chainglass/data/units/my-agent/unit.yaml')).toBe(true);
    expect(
      await fs.exists('/test-workspace/.chainglass/data/units/my-agent/commands/main.md')
    ).toBe(true);

    // For the remaining steps, we need to configure the YAML parser to return
    // the correct parsed data since FakeYamlParser doesn't actually parse YAML
    const unitYaml = await fs.readFile('/test-workspace/.chainglass/data/units/my-agent/unit.yaml');
    yamlParser.setPresetParseResult(unitYaml, {
      slug: 'my-agent',
      type: 'agent',
      version: '1.0.0',
      description: 'A agent unit',
      inputs: [
        {
          name: 'topic',
          type: 'data',
          data_type: 'text',
          required: true,
          description: 'Input topic',
        },
      ],
      outputs: [
        {
          name: 'result',
          type: 'data',
          data_type: 'text',
          required: true,
          description: 'Output result',
        },
      ],
      agent: {
        prompt_template: 'commands/main.md',
      },
    });

    // Step 2: Validate the unit
    const validateResult = await service.validate(ctx, 'my-agent');
    expect(validateResult.errors).toEqual([]);
    expect(validateResult.valid).toBe(true);
    expect(validateResult.issues).toEqual([]);

    // Step 3: List all units
    const listResult = await service.list(ctx);
    expect(listResult.errors).toEqual([]);
    expect(listResult.units).toHaveLength(1);
    expect(listResult.units[0].slug).toBe('my-agent');
    expect(listResult.units[0].type).toBe('agent');
    expect(listResult.units[0].version).toBe('1.0.0');

    // Step 4: Load the unit
    const loadResult = await service.load(ctx, 'my-agent');
    expect(loadResult.errors).toEqual([]);
    expect(loadResult.unit).toBeDefined();
    expect(loadResult.unit?.slug).toBe('my-agent');
    expect(loadResult.unit?.type).toBe('agent');
    expect(loadResult.unit?.inputs).toHaveLength(1);
    expect(loadResult.unit?.outputs).toHaveLength(1);
    expect(loadResult.unit?.agent?.promptTemplate).toBe('commands/main.md');
  });

  it('should support multiple unit types in lifecycle', async () => {
    // Create agent unit
    const agentResult = await service.create(ctx, 'write-poem', 'agent');
    expect(agentResult.errors).toEqual([]);

    // Create code unit
    const codeResult = await service.create(ctx, 'process-data', 'code');
    expect(codeResult.errors).toEqual([]);

    // Create user-input unit
    const userInputResult = await service.create(ctx, 'ask-topic', 'user-input');
    expect(userInputResult.errors).toEqual([]);

    // Verify all three directories exist (new workspace-scoped path)
    expect(await fs.exists('/test-workspace/.chainglass/data/units/write-poem')).toBe(true);
    expect(await fs.exists('/test-workspace/.chainglass/data/units/process-data')).toBe(true);
    expect(await fs.exists('/test-workspace/.chainglass/data/units/ask-topic')).toBe(true);

    // Agent should have commands directory
    expect(
      await fs.exists('/test-workspace/.chainglass/data/units/write-poem/commands/main.md')
    ).toBe(true);

    // Code and user-input should not have commands directory
    expect(await fs.exists('/test-workspace/.chainglass/data/units/process-data/commands')).toBe(
      false
    );
    expect(await fs.exists('/test-workspace/.chainglass/data/units/ask-topic/commands')).toBe(
      false
    );
  });

  it('should prevent duplicate unit creation', async () => {
    // Create first unit
    await service.create(ctx, 'unique-unit', 'agent');

    // Try to create again
    const result = await service.create(ctx, 'unique-unit', 'agent');
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe('E122');
  });

  it('should handle validation of invalid unit', async () => {
    // Create unit but give it invalid data (new workspace-scoped path)
    fs.setDir('/test-workspace/.chainglass/data/units/broken-unit');
    fs.setFile('/test-workspace/.chainglass/data/units/broken-unit/unit.yaml', 'bad: content');
    yamlParser.setPresetParseResult('bad: content', {
      slug: 'broken-unit',
      type: 'agent',
      version: '1.0.0',
      // Missing required outputs
      outputs: [],
      agent: { prompt_template: 'main.md' },
    });

    const result = await service.validate(ctx, 'broken-unit');
    expect(result.valid).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.issues[0].severity).toBe('error');
    expect(result.issues[0].code).toBe('E132');
  });
});
