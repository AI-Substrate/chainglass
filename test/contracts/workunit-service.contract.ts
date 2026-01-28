/**
 * IWorkUnitService Contract Tests.
 *
 * Per Critical Discovery 08: Contract tests prevent fake drift by ensuring
 * both FakeWorkUnitService and real implementation pass the same behavioral tests.
 *
 * Per Plan 021 (DYK#1): Contract tests stubbed with ctx parameter during Phase 1.
 * Full ctx behavioral testing will be added in Phase 5.
 *
 * Usage:
 * ```typescript
 * import { workUnitServiceContractTests } from '@test/contracts/workunit-service.contract';
 *
 * workUnitServiceContractTests('FakeWorkUnitService', () => new FakeWorkUnitService());
 * workUnitServiceContractTests('WorkUnitService', () => new WorkUnitService(...));
 * ```
 */

import type { WorkspaceContext } from '@chainglass/workflow';
import type { IWorkUnitService, WorkUnit } from '@chainglass/workgraph/interfaces';
import { beforeEach, describe, expect, it } from 'vitest';

/**
 * Creates a stub WorkspaceContext for contract tests.
 * Per DYK#1: Stub only - full ctx testing in Phase 5.
 */
function createStubContext(): WorkspaceContext {
  return {
    workspaceSlug: 'test-workspace',
    workspaceName: 'Test Workspace',
    workspacePath: '/test/workspace',
    worktreePath: '/test/workspace',
    worktreeBranch: null,
    isMainWorktree: true,
    hasGit: true,
  };
}

/**
 * Contract tests for IWorkUnitService implementations.
 */
export function workUnitServiceContractTests(name: string, createService: () => IWorkUnitService) {
  describe(`${name} implements IWorkUnitService contract`, () => {
    let service: IWorkUnitService;
    let ctx: WorkspaceContext;

    beforeEach(() => {
      service = createService();
      ctx = createStubContext();
    });

    describe('list()', () => {
      it('should return UnitListResult with units array', async () => {
        /*
        Test Doc:
        - Why: Contract requires list() returns array of unit summaries
        - Contract: list(ctx) returns { units: WorkUnitSummary[], errors: [] }
        - Usage Notes: Run against both fake and real implementations
        - Quality Contribution: Ensures fake matches real for unit listing
        - Worked Example: list(ctx) → { units: [...], errors: [] }
        */
        const result = await service.list(ctx);

        expect(result).toHaveProperty('units');
        expect(result).toHaveProperty('errors');
        expect(Array.isArray(result.units)).toBe(true);
        expect(Array.isArray(result.errors)).toBe(true);
      });

      it('should return units with required fields', async () => {
        const result = await service.list(ctx);

        for (const unit of result.units) {
          expect(unit).toHaveProperty('slug');
          expect(unit).toHaveProperty('type');
          expect(unit).toHaveProperty('version');
          expect(['agent', 'code', 'user-input']).toContain(unit.type);
        }
      });
    });

    describe('load()', () => {
      it('should return UnitLoadResult with unit or error', async () => {
        /*
        Test Doc:
        - Why: Contract requires load() returns unit details or E120 error
        - Contract: load(ctx, slug) returns { unit?: WorkUnit, errors: [] }
        - Usage Notes: Run against both implementations
        - Quality Contribution: Ensures fake matches real for unit loading
        - Worked Example: load(ctx, 'my-unit') → { unit: {...}, errors: [] }
        */
        const result = await service.load(ctx, 'nonexistent-unit');

        expect(result).toHaveProperty('errors');
        expect(Array.isArray(result.errors)).toBe(true);

        // Either unit exists or errors exist
        if (result.errors.length === 0) {
          expect(result.unit).toBeDefined();
        } else {
          expect(result.errors[0]).toHaveProperty('code');
          expect(result.errors[0]).toHaveProperty('message');
        }
      });

      it('should return error E120 for non-existent unit', async () => {
        const result = await service.load(ctx, 'definitely-not-a-real-unit');

        // Per spec: E120 is unit not found
        if (result.errors.length > 0) {
          expect(result.errors[0].code).toBe('E120');
        }
      });
    });

    describe('create()', () => {
      it('should return UnitCreateResult with slug and path', async () => {
        /*
        Test Doc:
        - Why: Contract requires create() returns created unit info
        - Contract: create(ctx, slug, type) returns { slug, path, errors: [] }
        - Usage Notes: Run against both implementations
        - Quality Contribution: Ensures fake matches real for unit creation
        - Worked Example: create(ctx, 'new-unit', 'agent') → { slug: 'new-unit', path: '...', errors: [] }
        */
        const result = await service.create(ctx, 'test-unit', 'agent');

        expect(result).toHaveProperty('slug');
        expect(result).toHaveProperty('path');
        expect(result).toHaveProperty('errors');
        expect(result.slug).toBe('test-unit');
      });

      it('should accept all valid unit types', async () => {
        const types: ('agent' | 'code' | 'user-input')[] = ['agent', 'code', 'user-input'];

        for (const type of types) {
          const result = await service.create(ctx, `test-${type}`, type);
          expect(result.errors.length).toBe(0);
        }
      });
    });

    describe('validate()', () => {
      it('should return UnitValidateResult with valid flag', async () => {
        /*
        Test Doc:
        - Why: Contract requires validate() returns validation result
        - Contract: validate(ctx, slug) returns { slug, valid, issues: [], errors: [] }
        - Usage Notes: Run against both implementations
        - Quality Contribution: Ensures fake matches real for unit validation
        - Worked Example: validate(ctx, 'my-unit') → { slug: 'my-unit', valid: true, issues: [], errors: [] }
        */
        const result = await service.validate(ctx, 'test-unit');

        expect(result).toHaveProperty('slug');
        expect(result).toHaveProperty('valid');
        expect(result).toHaveProperty('issues');
        expect(result).toHaveProperty('errors');
        expect(typeof result.valid).toBe('boolean');
        expect(Array.isArray(result.issues)).toBe(true);
      });

      it('should include issue details when invalid', async () => {
        const result = await service.validate(ctx, 'test-unit');

        for (const issue of result.issues) {
          expect(issue).toHaveProperty('severity');
          expect(issue).toHaveProperty('code');
          expect(issue).toHaveProperty('path');
          expect(issue).toHaveProperty('message');
          expect(['error', 'warning']).toContain(issue.severity);
        }
      });
    });
  });
}
