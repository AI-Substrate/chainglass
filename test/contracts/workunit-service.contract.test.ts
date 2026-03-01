/**
 * IWorkUnitService contract tests.
 *
 * Per Plan 058 Phase 1: Run contract tests against both fake and real
 * implementations to verify parity.
 */

import {
  FakeWorkUnitService,
  WorkUnitAdapter,
  WorkUnitService,
} from '@chainglass/positional-graph';
import { FakeFileSystem, FakePathResolver, FakeYamlParser } from '@chainglass/shared';
import { describe, expect, it } from 'vitest';
import { workUnitServiceContractTests } from './workunit-service.contract.js';

// Run contract tests against the fake implementation
workUnitServiceContractTests('FakeWorkUnitService', () => new FakeWorkUnitService());

// Run contract tests against the real implementation with test doubles
workUnitServiceContractTests('WorkUnitService', () => {
  const fs = new FakeFileSystem();
  const pathResolver = new FakePathResolver();
  const yamlParser = new FakeYamlParser();

  // Set up base units directory
  fs.setDir('/test/workspace/.chainglass/units');

  const adapter = new WorkUnitAdapter(fs, pathResolver);
  return new WorkUnitService(adapter, fs, yamlParser, pathResolver);
});

// FT-003: AC19 cascade verification — tests rename updates unit_slug in node.yaml files
describe('WorkUnitService rename cascade (AC-19)', () => {
  it('should rewrite unit_slug in workflow node.yaml files during rename', async () => {
    const fs = new FakeFileSystem();
    const pathResolver = new FakePathResolver();
    const yamlParser = new FakeYamlParser();
    const ctx = {
      workspaceSlug: 'test',
      workspaceName: 'Test',
      workspacePath: '/test/workspace',
      worktreePath: '/test/workspace',
      worktreeBranch: null,
      isMainWorktree: true,
      hasGit: true,
    };

    // Seed: unit exists
    fs.setDir('/test/workspace/.chainglass/units');
    fs.setDir('/test/workspace/.chainglass/units/old-agent');
    fs.setFile(
      '/test/workspace/.chainglass/units/old-agent/unit.yaml',
      'slug: old-agent\ntype: agent\nversion: "1.0.0"\nagent:\n  prompt_template: prompts/main.md\noutputs:\n  - name: result\n    type: data\n    data_type: text\n    required: true\n'
    );

    // Seed: workflow node referencing old-agent
    const nodeYamlPath =
      '/test/workspace/.chainglass/data/workflows/demo/nodes/old-agent-abc/node.yaml';
    fs.setDir('/test/workspace/.chainglass/data/workflows');
    fs.setDir('/test/workspace/.chainglass/data/workflows/demo');
    fs.setDir('/test/workspace/.chainglass/data/workflows/demo/nodes');
    fs.setDir('/test/workspace/.chainglass/data/workflows/demo/nodes/old-agent-abc');
    fs.setFile(nodeYamlPath, 'id: old-agent-abc\nunit_slug: old-agent\ncreated_at: 2026-01-01\n');

    const adapter = new WorkUnitAdapter(fs, pathResolver);
    const service = new WorkUnitService(adapter, fs, yamlParser, pathResolver);

    const result = await service.rename(ctx, 'old-agent', 'new-agent');

    expect(result.errors).toHaveLength(0);
    expect(result.updatedFiles).toContain(nodeYamlPath);

    // Verify the node.yaml was rewritten
    const updatedContent = await fs.readFile(nodeYamlPath);
    expect(updatedContent).toContain('unit_slug: new-agent');
    expect(updatedContent).not.toContain('unit_slug: old-agent');
  });

  it('should rewrite unit_slug in template node.yaml files during rename', async () => {
    const fs = new FakeFileSystem();
    const pathResolver = new FakePathResolver();
    const yamlParser = new FakeYamlParser();
    const ctx = {
      workspaceSlug: 'test',
      workspaceName: 'Test',
      workspacePath: '/test/workspace',
      worktreePath: '/test/workspace',
      worktreeBranch: null,
      isMainWorktree: true,
      hasGit: true,
    };

    // Seed unit
    fs.setDir('/test/workspace/.chainglass/units');
    fs.setDir('/test/workspace/.chainglass/units/my-coder');
    fs.setFile(
      '/test/workspace/.chainglass/units/my-coder/unit.yaml',
      'slug: my-coder\ntype: code\nversion: "1.0.0"\ncode:\n  script: scripts/main.sh\noutputs:\n  - name: result\n    type: data\n    data_type: text\n    required: true\n'
    );

    // Seed template node
    const templateNodePath =
      '/test/workspace/.chainglass/templates/workflows/tmpl/nodes/my-coder-x1/node.yaml';
    fs.setDir('/test/workspace/.chainglass/templates/workflows');
    fs.setDir('/test/workspace/.chainglass/templates/workflows/tmpl');
    fs.setDir('/test/workspace/.chainglass/templates/workflows/tmpl/nodes');
    fs.setDir('/test/workspace/.chainglass/templates/workflows/tmpl/nodes/my-coder-x1');
    fs.setFile(templateNodePath, 'id: my-coder-x1\nunit_slug: my-coder\ncreated_at: 2026-01-01\n');

    const adapter = new WorkUnitAdapter(fs, pathResolver);
    const service = new WorkUnitService(adapter, fs, yamlParser, pathResolver);

    const result = await service.rename(ctx, 'my-coder', 'renamed-coder');

    expect(result.errors).toHaveLength(0);
    expect(result.updatedFiles).toContain(templateNodePath);

    const updatedContent = await fs.readFile(templateNodePath);
    expect(updatedContent).toContain('unit_slug: renamed-coder');
  });
});
