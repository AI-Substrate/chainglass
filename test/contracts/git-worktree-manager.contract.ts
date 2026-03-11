import type { IGitWorktreeManager } from '@chainglass/workflow';
import { describe, expect, it } from 'vitest';

/**
 * Contract tests for IGitWorktreeManager implementations.
 *
 * Per Plan 069 Phase 1: Defines behavioral expectations for fake/real parity.
 * Phase 2 adds GitWorktreeManagerAdapter to this suite alongside the fake.
 *
 * Usage:
 * ```typescript
 * import { gitWorktreeManagerContractTests } from '@test/contracts/git-worktree-manager.contract';
 *
 * gitWorktreeManagerContractTests('FakeGitWorktreeManager', () => new FakeGitWorktreeManager());
 * gitWorktreeManagerContractTests('GitWorktreeManagerAdapter', () => createRealManager());
 * ```
 */
export function gitWorktreeManagerContractTests(
  name: string,
  createManager: () => IGitWorktreeManager
) {
  describe(`${name} implements IGitWorktreeManager contract`, () => {
    it('should return a MainStatusResult from checkMainStatus', async () => {
      /*
      Test Doc:
      - Why: Contract ensures all implementations return structured status results
      - Contract: checkMainStatus() must return an object with a 'status' field
      - Quality Contribution: Prevents fake drift in status result shape
      */
      const manager = createManager();
      const result = await manager.checkMainStatus('/fake/repo');

      expect(result).toBeDefined();
      expect(result.status).toBeDefined();
      expect(typeof result.status).toBe('string');
    });

    it('should return a SyncMainResult from syncMain', async () => {
      /*
      Test Doc:
      - Why: Contract ensures sync results have consistent shape
      - Contract: syncMain() must return an object with a 'status' field
      - Quality Contribution: Phase 2 real adapter must match this shape
      */
      const manager = createManager();
      const result = await manager.syncMain('/fake/repo');

      expect(result).toBeDefined();
      expect(result.status).toBeDefined();
      expect(typeof result.status).toBe('string');
    });

    it('should return a CreateWorktreeGitResult from createWorktree', async () => {
      /*
      Test Doc:
      - Why: Contract ensures creation results have consistent shape
      - Contract: createWorktree() must return object with 'status' field
      - Quality Contribution: Phase 2 must return same shape from real git commands
      */
      const manager = createManager();
      const result = await manager.createWorktree('/fake/repo', '069-test', '/fake/worktree');

      expect(result).toBeDefined();
      expect(result.status).toBeDefined();
      expect(typeof result.status).toBe('string');
    });

    it('should include worktreePath and branchName on successful create', async () => {
      /*
      Test Doc:
      - Why: Success results must carry the data needed for downstream operations
      - Contract: When status is 'created', worktreePath and branchName must be present
      - Quality Contribution: Web layer depends on these fields for redirect URL building
      */
      const manager = createManager();
      const result = await manager.createWorktree('/fake/repo', '069-test', '/fake/worktree');

      if (result.status === 'created') {
        expect(result.worktreePath).toBeDefined();
        expect(typeof result.worktreePath).toBe('string');
        expect(result.branchName).toBeDefined();
        expect(typeof result.branchName).toBe('string');
      }
    });
  });
}
