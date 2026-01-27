/**
 * Contract test factory for ISampleAdapter implementations.
 *
 * Per Phase 3: Sample Domain (Exemplar)
 * Per Critical Discovery 03: Contract tests prevent fake drift by ensuring
 * both SampleAdapter (real) and FakeSampleAdapter pass identical tests.
 * Per DYK-P3-04: TestContext includes adapter, ctx (default), createContext() for isolation tests.
 *
 * Follows the established pattern from workspace-registry-adapter.contract.ts.
 */

import { type ISampleAdapter, Sample, type WorkspaceContext } from '@chainglass/workflow';
import { beforeEach, describe, expect, it } from 'vitest';

// ==================== Test Fixtures ====================

/**
 * Create a default WorkspaceContext for testing.
 *
 * Per DYK-P3-04: Factory provides default context fixture.
 */
export function createDefaultContext(overrides?: Partial<WorkspaceContext>): WorkspaceContext {
  return {
    workspaceSlug: 'test-workspace',
    workspaceName: 'Test Workspace',
    workspacePath: '/home/user/test-workspace',
    worktreePath: '/home/user/test-workspace',
    worktreeBranch: 'main',
    isMainWorktree: true,
    hasGit: true,
    ...overrides,
  };
}

const SAMPLE_1 = Sample.create({
  name: 'Test Sample',
  description: 'A sample for testing',
  slug: 'test-sample',
  createdAt: new Date('2026-01-27T10:00:00Z'),
  updatedAt: new Date('2026-01-27T10:00:00Z'),
});

const SAMPLE_2 = Sample.create({
  name: 'Another Sample',
  description: 'Another sample for testing',
  slug: 'another-sample',
  createdAt: new Date('2026-01-27T11:00:00Z'),
  updatedAt: new Date('2026-01-27T11:00:00Z'),
});

// ==================== Contract Test Context ====================

/**
 * Test context for sample adapter contract tests.
 *
 * Per DYK-P3-04: Includes adapter, ctx (default), createContext() for isolation tests.
 */
export interface SampleAdapterTestContext {
  /** The adapter implementation to test */
  adapter: ISampleAdapter;
  /** Default workspace context for simple tests */
  ctx: WorkspaceContext;
  /** Create a new context with optional overrides (for isolation tests) */
  createContext: (overrides?: Partial<WorkspaceContext>) => WorkspaceContext;
  /** Setup function called before each test */
  setup: () => Promise<void>;
  /** Cleanup function called after each test */
  cleanup: () => Promise<void>;
  /** Description of the implementation */
  name: string;
}

// ==================== Contract Test Factory ====================

/**
 * Contract tests that run against both SampleAdapter and FakeSampleAdapter.
 *
 * These tests verify the behavioral contract of ISampleAdapter:
 * - save() stores sample and returns success
 * - load() retrieves saved sample
 * - list() returns all saved samples
 * - remove() deletes sample from storage
 * - exists() returns accurate existence status
 * - Error handling matches expected behavior
 */
export function sampleAdapterContractTests(createContext: () => SampleAdapterTestContext) {
  let ctx: SampleAdapterTestContext;

  beforeEach(async () => {
    ctx = createContext();
    await ctx.setup();
  });

  describe(`${createContext().name} implements ISampleAdapter contract`, () => {
    describe('save() contract', () => {
      it('should save a new sample and return ok=true with created=true', async () => {
        /*
        Test Doc:
        - Why: Contract requires save returns success status for new samples
        - Contract: save(ctx, sample) → { ok: true, created: true } for new sample
        - Quality Contribution: Ensures consistent return type
        */
        const result = await ctx.adapter.save(ctx.ctx, SAMPLE_1);

        expect(result.ok).toBe(true);
        expect(result.created).toBe(true);
        expect(result.errorCode).toBeUndefined();
      });

      it('should update existing sample and return created=false', async () => {
        /*
        Test Doc:
        - Why: Contract requires save can update existing samples
        - Contract: save() returns created=false for existing sample
        - Quality Contribution: Differentiates create vs update
        */
        // First save
        await ctx.adapter.save(ctx.ctx, SAMPLE_1);

        // Update (same slug)
        const updatedSample = Sample.create({
          name: 'Updated Name',
          description: 'Updated description',
          slug: SAMPLE_1.slug,
          createdAt: SAMPLE_1.createdAt,
        });
        const result = await ctx.adapter.save(ctx.ctx, updatedSample);

        expect(result.ok).toBe(true);
        expect(result.created).toBe(false);
      });

      it('should return sample with updated timestamp', async () => {
        /*
        Test Doc:
        - Why: Per DYK-P3-02, adapter owns updatedAt - overwrites on every save
        - Contract: save() returns sample with fresh updatedAt timestamp
        - Quality Contribution: Ensures timestamp management
        */
        const oldTimestamp = new Date('2020-01-01T00:00:00Z');
        const sample = Sample.create({
          name: 'Old Sample',
          description: 'Test',
          slug: 'old-sample',
          createdAt: oldTimestamp,
          updatedAt: oldTimestamp,
        });

        const result = await ctx.adapter.save(ctx.ctx, sample);

        expect(result.ok).toBe(true);
        expect(result.sample).toBeDefined();
        // updatedAt should be refreshed (not the old timestamp)
        if (result.sample) {
          expect(result.sample.updatedAt.getTime()).toBeGreaterThan(oldTimestamp.getTime());
        }
      });
    });

    describe('load() contract', () => {
      it('should return saved sample', async () => {
        /*
        Test Doc:
        - Why: Contract requires load returns saved data
        - Contract: load(ctx, slug) → Sample with matching slug
        - Quality Contribution: Ensures data integrity
        */
        await ctx.adapter.save(ctx.ctx, SAMPLE_1);

        const loaded = await ctx.adapter.load(ctx.ctx, SAMPLE_1.slug);

        expect(loaded).toBeInstanceOf(Sample);
        expect(loaded.slug).toBe(SAMPLE_1.slug);
        expect(loaded.name).toBe(SAMPLE_1.name);
        expect(loaded.description).toBe(SAMPLE_1.description);
      });

      it('should throw EntityNotFoundError for missing sample', async () => {
        /*
        Test Doc:
        - Why: Contract requires error for missing sample
        - Contract: load(ctx, missing) throws EntityNotFoundError
        - Quality Contribution: Consistent error handling
        */
        await expect(ctx.adapter.load(ctx.ctx, 'nonexistent')).rejects.toThrow();
      });
    });

    describe('list() contract', () => {
      it('should return empty array when no samples', async () => {
        /*
        Test Doc:
        - Why: Contract requires empty array for empty storage
        - Contract: list(ctx) → [] when no samples
        - Quality Contribution: Prevents null handling issues
        */
        const samples = await ctx.adapter.list(ctx.ctx);

        expect(Array.isArray(samples)).toBe(true);
        expect(samples).toHaveLength(0);
      });

      it('should return all saved samples', async () => {
        /*
        Test Doc:
        - Why: Contract requires list returns all samples
        - Contract: list(ctx) → Sample[] with all saved samples
        - Quality Contribution: Ensures complete enumeration
        */
        await ctx.adapter.save(ctx.ctx, SAMPLE_1);
        await ctx.adapter.save(ctx.ctx, SAMPLE_2);

        const samples = await ctx.adapter.list(ctx.ctx);

        expect(samples).toHaveLength(2);
        expect(samples.every((s) => s instanceof Sample)).toBe(true);

        const slugs = samples.map((s) => s.slug);
        expect(slugs).toContain(SAMPLE_1.slug);
        expect(slugs).toContain(SAMPLE_2.slug);
      });
    });

    describe('remove() contract', () => {
      it('should remove saved sample', async () => {
        /*
        Test Doc:
        - Why: Contract requires remove deletes sample
        - Contract: remove(ctx, slug) removes sample from storage
        - Quality Contribution: Ensures cleanup works
        */
        await ctx.adapter.save(ctx.ctx, SAMPLE_1);

        const result = await ctx.adapter.remove(ctx.ctx, SAMPLE_1.slug);

        expect(result.ok).toBe(true);

        // Verify removal
        const exists = await ctx.adapter.exists(ctx.ctx, SAMPLE_1.slug);
        expect(exists).toBe(false);
      });

      it('should return E082 for missing sample', async () => {
        /*
        Test Doc:
        - Why: Contract requires error for missing sample
        - Contract: remove(ctx, missing) returns E082
        - Quality Contribution: Consistent error handling
        */
        const result = await ctx.adapter.remove(ctx.ctx, 'nonexistent');

        expect(result.ok).toBe(false);
        expect(result.errorCode).toBe('E082');
      });
    });

    describe('exists() contract', () => {
      it('should return true for saved sample', async () => {
        /*
        Test Doc:
        - Why: Contract requires accurate existence check
        - Contract: exists(ctx, slug) → true when sample exists
        - Quality Contribution: Enables pre-check before operations
        */
        await ctx.adapter.save(ctx.ctx, SAMPLE_1);

        const exists = await ctx.adapter.exists(ctx.ctx, SAMPLE_1.slug);

        expect(exists).toBe(true);
      });

      it('should return false for missing sample', async () => {
        /*
        Test Doc:
        - Why: Contract requires accurate non-existence check
        - Contract: exists(ctx, missing) → false
        - Quality Contribution: Enables pre-check before operations
        */
        const exists = await ctx.adapter.exists(ctx.ctx, 'nonexistent');

        expect(exists).toBe(false);
      });
    });
  });
}
