/**
 * Contract tests for IInstanceService.
 *
 * Shared test suite that runs against both FakeInstanceService (Phase 1)
 * and the real InstanceService (Phase 2+). Ensures fake↔real parity.
 *
 * Per Constitution P2: contract tests verify fake-real parity.
 */

import type { IInstanceService } from '@chainglass/workflow';
import type { WorkspaceContext } from '@chainglass/workflow';
import { beforeEach, describe, expect, it } from 'vitest';

export interface InstanceServiceTestContext {
  service: IInstanceService;
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

export function instanceServiceContractTests(createContext: () => InstanceServiceTestContext) {
  describe(`${createContext().name} implements IInstanceService contract`, () => {
    let service: IInstanceService;

    beforeEach(() => {
      const ctx = createContext();
      service = ctx.service;
    });

    it('should return null for non-existent instance', async () => {
      /*
      Test Doc:
      - Why: Verify graceful handling of missing instances
      - Contract: getStatus() returns null data with no errors for missing instance
      - Usage Notes: Does NOT throw — returns Result pattern with null
      - Quality Contribution: Prevents crashes on invalid instance references
      - Worked Example: getStatus(ctx, 'tpl', 'no-such') → { data: null, errors: [] }
      */
      const result = await service.getStatus(TEST_CTX, 'my-template', 'no-such-instance');
      expect(result.data).toBeNull();
      expect(result.errors).toEqual([]);
    });

    it('should track getStatus calls', async () => {
      /*
      Test Doc:
      - Why: Verify getStatus is callable and returns Result pattern
      - Contract: getStatus() accepts template slug + instance ID, returns GetStatusResult
      - Usage Notes: Real implementation deferred to Phase 2+
      - Quality Contribution: Ensures interface signature is exercisable
      - Worked Example: getStatus(ctx, 'tpl', 'inst-1') → { data: ..., errors: [] }
      */
      const result = await service.getStatus(TEST_CTX, 'my-template', 'inst-1');
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('errors');
    });
  });
}
