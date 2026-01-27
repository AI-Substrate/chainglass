/**
 * Run ISampleAdapter contract tests against both implementations.
 *
 * Per Phase 3: Sample Domain (Exemplar)
 * Per Critical Discovery 03: Contract tests prevent fake drift.
 * Per DYK-P3-05: FakeSampleAdapter uses composite key for data isolation.
 *
 * Follows the established pattern from workspace-registry-adapter.contract.test.ts.
 */

import { FakeFileSystem, FakePathResolver } from '@chainglass/shared';
import { FakeSampleAdapter, SampleAdapter } from '@chainglass/workflow';
import { describe, expect, it } from 'vitest';
import {
  type SampleAdapterTestContext,
  createDefaultContext,
  sampleAdapterContractTests,
} from './sample-adapter.contract.js';

// ==================== FakeSampleAdapter Context ====================

function createFakeSampleAdapterContext(): SampleAdapterTestContext {
  const adapter = new FakeSampleAdapter();
  const defaultCtx = createDefaultContext();

  return {
    name: 'FakeSampleAdapter',
    adapter,
    ctx: defaultCtx,
    createContext: (overrides) => createDefaultContext(overrides),
    setup: async () => {
      adapter.reset();
    },
    cleanup: async () => {
      adapter.reset();
    },
  };
}

// ==================== SampleAdapter Context ====================

function createSampleAdapterContext(): SampleAdapterTestContext {
  const fs = new FakeFileSystem();
  const pathResolver = new FakePathResolver();
  const adapter = new SampleAdapter(fs, pathResolver);
  const defaultCtx = createDefaultContext();

  return {
    name: 'SampleAdapter',
    adapter,
    ctx: defaultCtx,
    createContext: (overrides) => createDefaultContext(overrides),
    setup: async () => {
      fs.reset();
    },
    cleanup: async () => {
      fs.reset();
    },
  };
}

// ==================== Run Contract Tests ====================

// T031: FakeSampleAdapter contract tests
sampleAdapterContractTests(createFakeSampleAdapterContext);

// T032: SampleAdapter contract tests
sampleAdapterContractTests(createSampleAdapterContext);

// ==================== Helper Tests ====================

describe('ISampleAdapter contract tests', () => {
  it('contract test factory is defined', () => {
    // This verifies the contract factory was created successfully
    expect(typeof sampleAdapterContractTests).toBe('function');
    expect(typeof createDefaultContext).toBe('function');
  });

  it('createDefaultContext returns valid WorkspaceContext', () => {
    const ctx = createDefaultContext();
    expect(ctx.workspaceSlug).toBe('test-workspace');
    expect(ctx.worktreePath).toBe('/home/user/test-workspace');
    expect(ctx.isMainWorktree).toBe(true);
  });

  it('createDefaultContext accepts overrides', () => {
    const ctx = createDefaultContext({
      workspaceSlug: 'custom-slug',
      worktreePath: '/custom/path',
    });
    expect(ctx.workspaceSlug).toBe('custom-slug');
    expect(ctx.worktreePath).toBe('/custom/path');
    expect(ctx.isMainWorktree).toBe(true); // Default preserved
  });
});

// ==================== Data Isolation Tests (T033) ====================

describe('ISampleAdapter data isolation (T033)', () => {
  describe('FakeSampleAdapter isolation', () => {
    it('should isolate data between different worktree paths', async () => {
      /*
      Test Doc:
      - Why: Per DYK-P3-05, each worktree has isolated data storage
      - Contract: Samples in worktree A are not visible in worktree B
      - Quality Contribution: Ensures feature branch data stays separate
      - Worked Example: Save to A, list from B → empty, list from A → sample
      */
      const adapter = new FakeSampleAdapter();

      // Two different worktree contexts
      const ctxA = createDefaultContext({ worktreePath: '/project/worktree-a' });
      const ctxB = createDefaultContext({ worktreePath: '/project/worktree-b' });

      // Save sample to worktree A
      const { Sample } = await import('@chainglass/workflow');
      const sample = Sample.create({
        name: 'Test Sample',
        description: 'Isolation test',
        slug: 'test-sample',
      });

      await adapter.save(ctxA, sample);

      // List from worktree A should show the sample
      const samplesA = await adapter.list(ctxA);
      expect(samplesA).toHaveLength(1);
      expect(samplesA[0].slug).toBe('test-sample');

      // List from worktree B should be empty
      const samplesB = await adapter.list(ctxB);
      expect(samplesB).toHaveLength(0);

      // exists() should also be isolated
      expect(await adapter.exists(ctxA, 'test-sample')).toBe(true);
      expect(await adapter.exists(ctxB, 'test-sample')).toBe(false);
    });

    it('should allow same slug in different worktrees', async () => {
      /*
      Test Doc:
      - Why: Different worktrees can have samples with the same slug
      - Contract: Samples with same slug in different contexts are separate
      - Quality Contribution: Enables parallel development
      */
      const adapter = new FakeSampleAdapter();

      const ctxA = createDefaultContext({ worktreePath: '/project/main' });
      const ctxB = createDefaultContext({ worktreePath: '/project/feature' });

      const { Sample } = await import('@chainglass/workflow');
      const sampleA = Sample.create({
        name: 'Main Sample',
        description: 'In main',
        slug: 'shared-slug',
      });
      const sampleB = Sample.create({
        name: 'Feature Sample',
        description: 'In feature',
        slug: 'shared-slug',
      });

      await adapter.save(ctxA, sampleA);
      await adapter.save(ctxB, sampleB);

      // Both should exist independently
      const loadedA = await adapter.load(ctxA, 'shared-slug');
      const loadedB = await adapter.load(ctxB, 'shared-slug');

      expect(loadedA.name).toBe('Main Sample');
      expect(loadedB.name).toBe('Feature Sample');
    });
  });

  describe('SampleAdapter isolation', () => {
    it('should isolate data between different worktree paths', async () => {
      /*
      Test Doc:
      - Why: Real adapter must also isolate by worktree path
      - Contract: Same behavior as FakeSampleAdapter
      - Quality Contribution: Ensures parity between fake and real
      */
      const { FakeFileSystem, FakePathResolver } = await import('@chainglass/shared');
      const { SampleAdapter, Sample } = await import('@chainglass/workflow');

      const fs = new FakeFileSystem();
      const pathResolver = new FakePathResolver();
      const adapter = new SampleAdapter(fs, pathResolver);

      const ctxA = createDefaultContext({ worktreePath: '/project/worktree-a' });
      const ctxB = createDefaultContext({ worktreePath: '/project/worktree-b' });

      const sample = Sample.create({
        name: 'Test Sample',
        description: 'Isolation test',
        slug: 'test-sample',
      });

      await adapter.save(ctxA, sample);

      // List from worktree A should show the sample
      const samplesA = await adapter.list(ctxA);
      expect(samplesA).toHaveLength(1);

      // List from worktree B should be empty
      const samplesB = await adapter.list(ctxB);
      expect(samplesB).toHaveLength(0);
    });
  });
});

// ==================== ensureStructure Tests (T034) ====================

describe('ISampleAdapter ensureStructure (T034)', () => {
  it('should create .chainglass/data/samples/ directory on first write', async () => {
    /*
    Test Doc:
    - Why: Storage directories may not exist on first use
    - Contract: save() creates directory structure automatically
    - Quality Contribution: Seamless first-run experience
    - Worked Example: Fresh worktree → save() → directory created
    */
    const { FakeFileSystem, FakePathResolver } = await import('@chainglass/shared');
    const { SampleAdapter, Sample } = await import('@chainglass/workflow');

    const fs = new FakeFileSystem();
    const pathResolver = new FakePathResolver();
    const adapter = new SampleAdapter(fs, pathResolver);

    const ctx = createDefaultContext({ worktreePath: '/project/fresh-worktree' });
    const expectedDir = '/project/fresh-worktree/.chainglass/data/samples';

    // Directory should not exist initially
    expect(await fs.exists(expectedDir)).toBe(false);

    // Save a sample
    const sample = Sample.create({
      name: 'First Sample',
      description: 'Creates directory',
      slug: 'first-sample',
    });

    const result = await adapter.save(ctx, sample);

    expect(result.ok).toBe(true);

    // Directory should now exist
    expect(await fs.exists(expectedDir)).toBe(true);

    // Sample file should exist
    expect(await fs.exists(`${expectedDir}/first-sample.json`)).toBe(true);
  });

  it('should not fail when directory already exists', async () => {
    /*
    Test Doc:
    - Why: Multiple saves should work without error
    - Contract: ensureStructure() is idempotent
    - Quality Contribution: Robust operation
    */
    const { FakeFileSystem, FakePathResolver } = await import('@chainglass/shared');
    const { SampleAdapter, Sample } = await import('@chainglass/workflow');

    const fs = new FakeFileSystem();
    const pathResolver = new FakePathResolver();
    const adapter = new SampleAdapter(fs, pathResolver);

    const ctx = createDefaultContext({ worktreePath: '/project/existing' });

    const sample1 = Sample.create({
      name: 'Sample One',
      description: 'First',
      slug: 'sample-one',
    });
    const sample2 = Sample.create({
      name: 'Sample Two',
      description: 'Second',
      slug: 'sample-two',
    });

    // First save creates directory
    const result1 = await adapter.save(ctx, sample1);
    expect(result1.ok).toBe(true);

    // Second save should also succeed (directory already exists)
    const result2 = await adapter.save(ctx, sample2);
    expect(result2.ok).toBe(true);

    // Both samples should exist
    const samples = await adapter.list(ctx);
    expect(samples).toHaveLength(2);
  });
});
