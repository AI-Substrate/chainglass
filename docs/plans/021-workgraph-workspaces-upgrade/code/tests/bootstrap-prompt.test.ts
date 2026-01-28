// THIS FILE IS SYMLINKED from docs/plans/021-workgraph-workspaces-upgrade/code/tests/bootstrap-prompt.test.ts
// Plan: docs/plans/021-workgraph-workspaces-upgrade/workgraph-workspaces-upgrade-plan.md

/**
 * BootstrapPromptService unit tests.
 *
 * Tests the generation of bootstrap prompts for agent execution.
 * Per DYK#8: Minimal bootstrap prompt, expand based on real needs.
 */

import { FakeFileSystem, FakePathResolver } from '@chainglass/shared';
import type { WorkspaceContext } from '@chainglass/workflow';
import { beforeEach, describe, expect, it } from 'vitest';
import { FakeWorkGraphService } from '../../../../../packages/workgraph/src/fakes/fake-workgraph-service.js';
import { BootstrapPromptService } from '../../../../../packages/workgraph/src/services/bootstrap-prompt.js';
import { createTestWorkspaceContext } from '../../../../../test/helpers/workspace-context.js';

// ============================================
// Test Context
// ============================================

interface TestContext {
  fs: FakeFileSystem;
  pathResolver: FakePathResolver;
  workGraphService: FakeWorkGraphService;
  service: BootstrapPromptService;
  wsCtx: WorkspaceContext;
}

function createContext(): TestContext {
  const fs = new FakeFileSystem();
  const pathResolver = new FakePathResolver();
  const workGraphService = new FakeWorkGraphService();
  const wsCtx = createTestWorkspaceContext('/test/worktree');
  const service = new BootstrapPromptService(fs, pathResolver, workGraphService);

  return { fs, pathResolver, workGraphService, service, wsCtx };
}

// ============================================
// Tests
// ============================================

describe('BootstrapPromptService', () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = createContext();
  });

  // ============================================
  // generate() - initial execution
  // ============================================

  describe('generate() - initial', () => {
    it('should generate initial prompt with node and unit info', async () => {
      /*
      Test Doc:
      - Why: Agents need context to execute a work-node
      - Contract: generate() returns prompt with node ID, unit slug, and instructions
      - Usage Notes: Per DYK#8, minimal prompt with essential steps
      - Quality Contribution: Verifies prompt structure
      - Worked Example: generate for write-poem-b2c → prompt with lifecycle steps
      */
      // Set up node config
      const nodePath = `${ctx.wsCtx.worktreePath}/.chainglass/data/work-graphs/test-graph/nodes/write-poem-b2c`;
      ctx.fs.setDir(nodePath);
      ctx.fs.setFile(
        `${nodePath}/node.yaml`,
        `
id: write-poem-b2c
unit_slug: write-poem
inputs:
  topic:
    from: user-input-a7f
    output: text
`
      );

      const result = await ctx.service.generate(ctx.wsCtx, {
        graphSlug: 'test-graph',
        nodeId: 'write-poem-b2c',
      });

      expect(result.errors).toEqual([]);
      expect(result.unitSlug).toBe('write-poem');
      expect(result.commandsPath).toContain('write-poem');
      expect(result.prompt).toContain('write-poem-b2c');
      expect(result.prompt).toContain('Step 1: Signal Start');
      expect(result.prompt).toContain('Step 2: Get Your Inputs');
      expect(result.prompt).toContain('Step 3: Read Your Task Instructions');
      expect(result.prompt).toContain('Step 4: Save Your Outputs');
      expect(result.prompt).toContain('Step 5: Complete');
      expect(result.prompt).toContain('FAIL FAST POLICY');
    });

    it('should return E107 for non-existent node', async () => {
      /*
      Test Doc:
      - Why: Cannot generate prompt for missing node
      - Contract: generate() returns E107 for non-existent node
      - Usage Notes: E107 = nodeNotFoundError
      - Quality Contribution: Validates node existence
      - Worked Example: generate for nonexistent → E107
      */
      const result = await ctx.service.generate(ctx.wsCtx, {
        graphSlug: 'test-graph',
        nodeId: 'nonexistent-node',
      });

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('E107');
    });

    it('should return E120 when node has no unit_slug', async () => {
      /*
      Test Doc:
      - Why: Need unit_slug to generate proper prompt
      - Contract: generate() returns E120 for missing unit_slug
      - Usage Notes: E120 = unitNotFound
      - Quality Contribution: Validates node configuration
      - Worked Example: node with no unit_slug → E120
      */
      const nodePath = `${ctx.wsCtx.worktreePath}/.chainglass/data/work-graphs/test-graph/nodes/bad-node`;
      ctx.fs.setDir(nodePath);
      ctx.fs.setFile(
        `${nodePath}/node.yaml`,
        `
id: bad-node
inputs: {}
`
      );

      const result = await ctx.service.generate(ctx.wsCtx, {
        graphSlug: 'test-graph',
        nodeId: 'bad-node',
      });

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('E120');
    });
  });

  // ============================================
  // generate() - resume execution
  // ============================================

  describe('generate() - resume', () => {
    it('should generate resume prompt with answer retrieval instructions', async () => {
      /*
      Test Doc:
      - Why: Resumed agents need different instructions
      - Contract: generate(resume=true) returns prompt with get-answer and continue steps
      - Usage Notes: Simpler prompt focused on continuation
      - Quality Contribution: Verifies resume vs initial prompt difference
      - Worked Example: generate resume for write-poem-b2c → prompt with handover-reason
      */
      // Set up node config
      const nodePath = `${ctx.wsCtx.worktreePath}/.chainglass/data/work-graphs/test-graph/nodes/write-poem-b2c`;
      ctx.fs.setDir(nodePath);
      ctx.fs.setFile(
        `${nodePath}/node.yaml`,
        `
id: write-poem-b2c
unit_slug: write-poem
inputs: {}
`
      );

      const result = await ctx.service.generate(ctx.wsCtx, {
        graphSlug: 'test-graph',
        nodeId: 'write-poem-b2c',
        resume: true,
      });

      expect(result.errors).toEqual([]);
      expect(result.prompt).toContain('RESUMING');
      expect(result.prompt).toContain('handover-reason');
      expect(result.prompt).toContain('get-answer');
      expect(result.prompt).not.toContain('Step 1: Signal Start');
    });
  });
});
