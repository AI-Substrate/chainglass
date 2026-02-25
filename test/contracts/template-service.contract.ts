/**
 * Contract tests for ITemplateService.
 *
 * Shared test suite that runs against both FakeTemplateService (Phase 1)
 * and the real TemplateService (Phase 2). Ensures fake↔real parity.
 *
 * Per Constitution P2: contract tests verify fake-real parity.
 */

import type { ITemplateService } from '@chainglass/workflow';
import type { WorkspaceContext } from '@chainglass/workflow';
import { beforeEach, describe, expect, it } from 'vitest';

export interface TemplateServiceTestContext {
  service: ITemplateService;
  name: string;
}

const TEST_CTX: WorkspaceContext = {
  workspaceSlug: 'test-ws',
  workspaceName: 'Test Workspace',
  workspacePath: '/tmp/test-ws',
  worktreePath: '/tmp/test-ws',
  worktreeBranch: 'main',
  isMainWorktree: true,
  hasGit: true,
};

export function templateServiceContractTests(createContext: () => TemplateServiceTestContext) {
  describe(`${createContext().name} implements ITemplateService contract`, () => {
    let service: ITemplateService;

    beforeEach(() => {
      const ctx = createContext();
      service = ctx.service;
    });

    it('should return empty list on fresh workspace', async () => {
      /*
      Test Doc:
      - Why: Verify baseline behavior — no templates exist yet
      - Contract: listWorkflows() returns empty data array with no errors
      - Usage Notes: Uses TEST_CTX fixture for workspace context
      - Quality Contribution: Prevents null/undefined returns on empty state
      - Worked Example: listWorkflows(ctx) → { data: [], errors: [] }
      */
      const result = await service.listWorkflows(TEST_CTX);
      expect(result.data).toEqual([]);
      expect(result.errors).toEqual([]);
    });

    it('should return null for non-existent template', async () => {
      /*
      Test Doc:
      - Why: Verify graceful handling of missing templates
      - Contract: showWorkflow() returns null data with no errors for missing slug
      - Usage Notes: Does NOT throw — returns Result pattern with null
      - Quality Contribution: Prevents crashes on invalid template references
      - Worked Example: showWorkflow(ctx, 'no-such') → { data: null, errors: [] }
      */
      const result = await service.showWorkflow(TEST_CTX, 'no-such-template');
      expect(result.data).toBeNull();
      expect(result.errors).toEqual([]);
    });

    it('should return empty instances list for template with no instances', async () => {
      /*
      Test Doc:
      - Why: Verify baseline — template exists but has no instances
      - Contract: listInstances() returns empty array for template with no instances
      - Usage Notes: Template slug may or may not exist; both cases return empty
      - Quality Contribution: Prevents errors when querying uninstantiated templates
      - Worked Example: listInstances(ctx, 'my-template') → { data: [], errors: [] }
      */
      const result = await service.listInstances(TEST_CTX, 'my-template');
      expect(result.data).toEqual([]);
      expect(result.errors).toEqual([]);
    });

    it('should track saveFrom calls', async () => {
      /*
      Test Doc:
      - Why: Verify saveFrom is callable and returns Result pattern
      - Contract: saveFrom() accepts graph slug + template slug, returns SaveFromResult
      - Usage Notes: Real implementation deferred to Phase 2
      - Quality Contribution: Ensures interface signature is exercisable
      - Worked Example: saveFrom(ctx, 'my-graph', 'my-template') → { data: ..., errors: [] }
      */
      const result = await service.saveFrom(TEST_CTX, 'my-graph', 'my-template');
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('errors');
    });

    it('should track instantiate calls', async () => {
      /*
      Test Doc:
      - Why: Verify instantiate is callable and returns Result pattern
      - Contract: instantiate() accepts template slug + instance ID, returns InstantiateResult
      - Usage Notes: Real implementation deferred to Phase 2
      - Quality Contribution: Ensures interface signature is exercisable
      - Worked Example: instantiate(ctx, 'tpl', 'inst-1') → { data: ..., errors: [] }
      */
      const result = await service.instantiate(TEST_CTX, 'my-template', 'inst-1');
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('errors');
    });

    it('should track refresh calls', async () => {
      /*
      Test Doc:
      - Why: Verify refresh is callable and returns Result pattern
      - Contract: refresh() accepts template slug + instance ID, returns RefreshResult
      - Usage Notes: Real implementation deferred to Phase 2
      - Quality Contribution: Ensures interface signature is exercisable
      - Worked Example: refresh(ctx, 'tpl', 'inst-1') → { data: ..., errors: [] }
      */
      const result = await service.refresh(TEST_CTX, 'my-template', 'inst-1');
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('errors');
    });
  });
}
