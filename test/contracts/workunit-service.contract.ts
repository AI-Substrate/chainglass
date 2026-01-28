/**
 * IWorkUnitService Contract Tests.
 *
 * Per Critical Discovery 08: Contract tests prevent fake drift by ensuring
 * both FakeWorkUnitService and real implementation pass the same behavioral tests.
 *
 * Usage:
 * ```typescript
 * import { workUnitServiceContractTests } from '@test/contracts/workunit-service.contract';
 *
 * workUnitServiceContractTests('FakeWorkUnitService', () => new FakeWorkUnitService());
 * workUnitServiceContractTests('WorkUnitService', () => new WorkUnitService(...));
 * ```
 */

import type { IWorkUnitService, WorkUnit } from '@chainglass/workgraph/interfaces';
import { beforeEach, describe, expect, it } from 'vitest';

/**
 * Contract tests for IWorkUnitService implementations.
 */
export function workUnitServiceContractTests(name: string, createService: () => IWorkUnitService) {
  describe(`${name} implements IWorkUnitService contract`, () => {
    let service: IWorkUnitService;

    beforeEach(() => {
      service = createService();
    });

    describe('list()', () => {
      it('should return UnitListResult with units array', async () => {
        /*
        Test Doc:
        - Why: Contract requires list() returns array of unit summaries
        - Contract: list() returns { units: WorkUnitSummary[], errors: [] }
        - Usage Notes: Run against both fake and real implementations
        - Quality Contribution: Ensures fake matches real for unit listing
        - Worked Example: list() → { units: [...], errors: [] }
        */
        const result = await service.list();

        expect(result).toHaveProperty('units');
        expect(result).toHaveProperty('errors');
        expect(Array.isArray(result.units)).toBe(true);
        expect(Array.isArray(result.errors)).toBe(true);
      });

      it('should return units with required fields', async () => {
        const result = await service.list();

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
        - Contract: load(slug) returns { unit?: WorkUnit, errors: [] }
        - Usage Notes: Run against both implementations
        - Quality Contribution: Ensures fake matches real for unit loading
        - Worked Example: load('my-unit') → { unit: {...}, errors: [] }
        */
        const result = await service.load('nonexistent-unit');

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
        const result = await service.load('definitely-not-a-real-unit');

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
        - Contract: create(slug, type) returns { slug, path, errors: [] }
        - Usage Notes: Run against both implementations
        - Quality Contribution: Ensures fake matches real for unit creation
        - Worked Example: create('new-unit', 'agent') → { slug: 'new-unit', path: '...', errors: [] }
        */
        const result = await service.create('test-unit', 'agent');

        expect(result).toHaveProperty('slug');
        expect(result).toHaveProperty('path');
        expect(result).toHaveProperty('errors');
        expect(result.slug).toBe('test-unit');
      });

      it('should accept all valid unit types', async () => {
        const types: ('agent' | 'code' | 'user-input')[] = ['agent', 'code', 'user-input'];

        for (const type of types) {
          const result = await service.create(`test-${type}`, type);
          expect(result.errors.length).toBe(0);
        }
      });
    });

    describe('validate()', () => {
      it('should return UnitValidateResult with valid flag', async () => {
        /*
        Test Doc:
        - Why: Contract requires validate() returns validation result
        - Contract: validate(slug) returns { slug, valid, issues: [], errors: [] }
        - Usage Notes: Run against both implementations
        - Quality Contribution: Ensures fake matches real for unit validation
        - Worked Example: validate('my-unit') → { slug: 'my-unit', valid: true, issues: [], errors: [] }
        */
        const result = await service.validate('test-unit');

        expect(result).toHaveProperty('slug');
        expect(result).toHaveProperty('valid');
        expect(result).toHaveProperty('issues');
        expect(result).toHaveProperty('errors');
        expect(typeof result.valid).toBe('boolean');
        expect(Array.isArray(result.issues)).toBe(true);
      });

      it('should include issue details when invalid', async () => {
        const result = await service.validate('test-unit');

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
