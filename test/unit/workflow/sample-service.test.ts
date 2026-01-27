/**
 * SampleService unit tests.
 *
 * Per Phase 4: Service Layer + DI Integration
 * Per R-TEST-007: Uses fakes only, no vi.mock/vi.fn.
 *
 * Tests cover:
 * - T041: CRUD operations - add, list, get, delete, not found (E082)
 */

import { Sample } from '@chainglass/workflow';
import type { WorkspaceContext } from '@chainglass/workflow';
import { beforeEach, describe, expect, it } from 'vitest';
import { FakeSampleAdapter } from '../../../packages/workflow/src/fakes/fake-sample-adapter.js';
import { SampleService } from '../../../packages/workflow/src/services/sample.service.js';
import {
  createDefaultContext,
  createWorktreeContext,
} from '../../fixtures/workspace-context.fixture.js';

describe('SampleService', () => {
  let adapter: FakeSampleAdapter;
  let service: SampleService;
  let ctx: WorkspaceContext;

  beforeEach(() => {
    adapter = new FakeSampleAdapter();
    service = new SampleService(adapter);
    ctx = createDefaultContext();
  });

  // ==================== add() Tests ====================

  describe('add()', () => {
    it('should create new sample', async () => {
      // Act
      const result = await service.add(ctx, 'Test Sample', 'A sample description');

      // Assert
      expect(result.success).toBe(true);
      expect(result.sample).toBeDefined();
      expect(result.sample?.name).toBe('Test Sample');
      expect(result.sample?.description).toBe('A sample description');
      expect(result.sample?.slug).toBe('test-sample');
      expect(result.errors).toHaveLength(0);

      // Verify adapter was called
      expect(adapter.saveCalls).toHaveLength(1);
    });

    it('should return E083 for duplicate slug', async () => {
      // Arrange - pre-populate with existing sample
      const existing = Sample.create({
        name: 'Test Sample',
        description: 'Existing',
      });
      adapter.addSample(ctx, existing);

      // Act - try to add sample with same slug
      const result = await service.add(ctx, 'Test Sample', 'New description');

      // Assert
      expect(result.success).toBe(false);
      expect(result.sample).toBeUndefined();
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('E083');
      expect(result.errors[0].message).toContain('already exists');
    });
  });

  // ==================== list() Tests ====================

  describe('list()', () => {
    it('should return empty array when no samples', async () => {
      // Act
      const result = await service.list(ctx);

      // Assert
      expect(result).toEqual([]);
      expect(adapter.listCalls).toHaveLength(1);
    });

    it('should return all samples in context', async () => {
      // Arrange - add multiple samples
      const s1 = Sample.create({ name: 'Sample A', description: 'Desc A' });
      const s2 = Sample.create({ name: 'Sample B', description: 'Desc B' });
      const s3 = Sample.create({ name: 'Sample C', description: 'Desc C' });
      adapter.addSample(ctx, s1);
      adapter.addSample(ctx, s2);
      adapter.addSample(ctx, s3);

      // Act
      const result = await service.list(ctx);

      // Assert
      expect(result).toHaveLength(3);
      expect(result.map((s) => s.name)).toContain('Sample A');
      expect(result.map((s) => s.name)).toContain('Sample B');
      expect(result.map((s) => s.name)).toContain('Sample C');
    });

    it('should isolate samples by context', async () => {
      // Arrange - add samples to different worktrees
      const ctx1 = createWorktreeContext('/home/test/workspace', 'main');
      const ctx2 = createWorktreeContext('/home/test/workspace-feature', 'feature');

      const s1 = Sample.create({ name: 'Sample 1', description: 'In main' });
      const s2 = Sample.create({ name: 'Sample 2', description: 'In feature' });
      adapter.addSample(ctx1, s1);
      adapter.addSample(ctx2, s2);

      // Act - list from each context
      const result1 = await service.list(ctx1);
      const result2 = await service.list(ctx2);

      // Assert - each context only sees its own samples
      expect(result1).toHaveLength(1);
      expect(result1[0].name).toBe('Sample 1');

      expect(result2).toHaveLength(1);
      expect(result2[0].name).toBe('Sample 2');
    });
  });

  // ==================== get() Tests ====================

  describe('get()', () => {
    it('should return sample by slug', async () => {
      // Arrange
      const sample = Sample.create({ name: 'My Sample', description: 'Description' });
      adapter.addSample(ctx, sample);

      // Act
      const result = await service.get(ctx, sample.slug);

      // Assert
      expect(result).not.toBeNull();
      expect(result?.name).toBe('My Sample');
    });

    it('should return null for not found', async () => {
      // Act
      const result = await service.get(ctx, 'nonexistent');

      // Assert
      expect(result).toBeNull();
    });
  });

  // ==================== delete() Tests ====================

  describe('delete()', () => {
    it('should delete sample', async () => {
      // Arrange
      const sample = Sample.create({ name: 'My Sample', description: 'Description' });
      adapter.addSample(ctx, sample);

      // Act
      const result = await service.delete(ctx, sample.slug);

      // Assert
      expect(result.success).toBe(true);
      expect(result.deletedSlug).toBe(sample.slug);
      expect(result.errors).toHaveLength(0);
      expect(adapter.removeCalls).toHaveLength(1);
    });

    it('should return E082 for not found', async () => {
      // Act - try to delete nonexistent sample
      const result = await service.delete(ctx, 'nonexistent');

      // Assert
      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('E082');
    });
  });
});
