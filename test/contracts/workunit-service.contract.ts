/**
 * IWorkUnitService Contract Tests.
 *
 * Per Plan 058 Phase 1: Contract tests for both read and write operations.
 * Ensures FakeWorkUnitService and real WorkUnitService pass identical behavioral tests.
 *
 * Updated from Plan 021 version: now imports from positional-graph (not workgraph),
 * uses E180 error codes (not E120), and tests CRUD operations.
 */

import type { CreateUnitSpec, IWorkUnitService } from '@chainglass/positional-graph';
import type { WorkspaceContext } from '@chainglass/workflow';
import { beforeEach, describe, expect, it } from 'vitest';

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

    // ========== Read Operations ==========

    describe('list()', () => {
      it('should return ListUnitsResult with units array', async () => {
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
      it('should return LoadUnitResult with unit or error', async () => {
        const result = await service.load(ctx, 'nonexistent-unit');
        expect(result).toHaveProperty('errors');
        expect(Array.isArray(result.errors)).toBe(true);
        if (result.errors.length === 0) {
          expect(result.unit).toBeDefined();
        } else {
          expect(result.errors[0]).toHaveProperty('code');
          expect(result.errors[0]).toHaveProperty('message');
        }
      });

      it('should return error E180 for non-existent unit', async () => {
        const result = await service.load(ctx, 'definitely-not-a-real-unit');
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors[0].code).toBe('E180');
      });
    });

    describe('validate()', () => {
      it('should return ValidateUnitResult with valid flag', async () => {
        const result = await service.validate(ctx, 'nonexistent-unit');
        expect(result).toHaveProperty('valid');
        expect(result).toHaveProperty('errors');
        expect(typeof result.valid).toBe('boolean');
      });
    });

    // ========== Write Operations (Plan 058) ==========

    describe('create()', () => {
      it('should create a unit and return CreateUnitResult', async () => {
        const spec: CreateUnitSpec = { slug: 'test-agent', type: 'agent' };
        const result = await service.create(ctx, spec);
        expect(result).toHaveProperty('slug');
        expect(result).toHaveProperty('type');
        expect(result).toHaveProperty('errors');
        expect(result.slug).toBe('test-agent');
        expect(result.type).toBe('agent');
        expect(result.errors).toHaveLength(0);
      });

      it('should accept all valid unit types', async () => {
        const types: ('agent' | 'code' | 'user-input')[] = ['agent', 'code', 'user-input'];
        for (const type of types) {
          const result = await service.create(ctx, { slug: `test-${type}`, type });
          expect(result.errors).toHaveLength(0);
          expect(result.type).toBe(type);
        }
      });

      it('should reject duplicate slugs with E188', async () => {
        await service.create(ctx, { slug: 'duplicate', type: 'agent' });
        const result = await service.create(ctx, { slug: 'duplicate', type: 'agent' });
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors[0].code).toBe('E188');
      });

      it('should make unit loadable after creation', async () => {
        await service.create(ctx, { slug: 'loadable-unit', type: 'agent' });
        const loadResult = await service.load(ctx, 'loadable-unit');
        expect(loadResult.unit).toBeDefined();
        expect(loadResult.unit?.slug).toBe('loadable-unit');
      });

      it('should make unit appear in list after creation', async () => {
        await service.create(ctx, { slug: 'listed-unit', type: 'code' });
        const listResult = await service.list(ctx);
        const found = listResult.units.find((u) => u.slug === 'listed-unit');
        expect(found).toBeDefined();
        expect(found?.type).toBe('code');
      });
    });

    describe('update()', () => {
      it('should update metadata fields', async () => {
        await service.create(ctx, { slug: 'update-test', type: 'agent' });
        const result = await service.update(ctx, 'update-test', {
          description: 'Updated description',
          version: '2.0.0',
        });
        expect(result.errors).toHaveLength(0);
      });

      it('should return E180 for non-existent unit', async () => {
        const result = await service.update(ctx, 'ghost-unit', { description: 'nope' });
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors[0].code).toBe('E180');
      });
    });

    describe('delete()', () => {
      it('should delete an existing unit', async () => {
        await service.create(ctx, { slug: 'delete-me', type: 'code' });
        const result = await service.delete(ctx, 'delete-me');
        expect(result.deleted).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should be idempotent for non-existent units', async () => {
        const result = await service.delete(ctx, 'never-existed');
        expect(result.deleted).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should make unit un-loadable after deletion', async () => {
        await service.create(ctx, { slug: 'to-delete', type: 'agent' });
        await service.delete(ctx, 'to-delete');
        const loadResult = await service.load(ctx, 'to-delete');
        expect(loadResult.unit).toBeUndefined();
        expect(loadResult.errors[0].code).toBe('E180');
      });
    });

    describe('rename()', () => {
      it('should rename a unit and update slug', async () => {
        await service.create(ctx, { slug: 'old-name', type: 'agent' });
        const result = await service.rename(ctx, 'old-name', 'new-name');
        expect(result.newSlug).toBe('new-name');
        expect(result.errors).toHaveLength(0);
      });

      it('should make unit loadable by new slug', async () => {
        await service.create(ctx, { slug: 'before-rename', type: 'code' });
        await service.rename(ctx, 'before-rename', 'after-rename');
        const loadResult = await service.load(ctx, 'after-rename');
        expect(loadResult.unit).toBeDefined();
      });

      it('should make old slug un-loadable', async () => {
        await service.create(ctx, { slug: 'rename-source', type: 'agent' });
        await service.rename(ctx, 'rename-source', 'rename-dest');
        const loadResult = await service.load(ctx, 'rename-source');
        expect(loadResult.unit).toBeUndefined();
      });

      it('should return E180 when old slug does not exist', async () => {
        const result = await service.rename(ctx, 'no-such-unit', 'new-slug');
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors[0].code).toBe('E180');
      });

      it('should return E188 when new slug already exists', async () => {
        await service.create(ctx, { slug: 'source-unit', type: 'agent' });
        await service.create(ctx, { slug: 'target-unit', type: 'code' });
        const result = await service.rename(ctx, 'source-unit', 'target-unit');
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors[0].code).toBe('E188');
      });
    });
  });
}
