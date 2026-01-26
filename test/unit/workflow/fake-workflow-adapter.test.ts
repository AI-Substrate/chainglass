/**
 * Tests for FakeWorkflowAdapter class.
 *
 * Per Phase 2: Fake Adapters for Testing - TDD RED first.
 * Per DYK Session: Uses call capture pattern (not FakeFileSystem).
 * Per DYK Session: Throws EntityNotFoundError for entity lookups, returns empty arrays for collections.
 */

import { EntityNotFoundError, FakeWorkflowAdapter, Workflow } from '@chainglass/workflow';
import { beforeEach, describe, expect, it } from 'vitest';

describe('FakeWorkflowAdapter', () => {
  let adapter: FakeWorkflowAdapter;

  beforeEach(() => {
    adapter = new FakeWorkflowAdapter();
  });

  describe('constructor', () => {
    it('should create instance', () => {
      /*
      Test Doc:
      - Why: FakeWorkflowAdapter must be instantiable for test setup
      - Contract: new FakeWorkflowAdapter() returns usable instance
      - Usage Notes: Create fresh instance in beforeEach for test isolation
      - Quality Contribution: Catches constructor errors early
      - Worked Example: const adapter = new FakeWorkflowAdapter() → adapter exists
      */
      expect(adapter).toBeInstanceOf(FakeWorkflowAdapter);
    });
  });

  describe('loadCurrent()', () => {
    it('should return loadCurrentResult when set', async () => {
      /*
      Test Doc:
      - Why: Tests must configure fake responses for deterministic behavior
      - Contract: Setting loadCurrentResult makes loadCurrent() return that value
      - Usage Notes: Set result before calling method
      - Quality Contribution: Ensures configurable response pattern works
      - Worked Example: adapter.loadCurrentResult = workflow → loadCurrent('slug') returns workflow
      */
      const workflow = Workflow.createCurrent({
        slug: 'hello-wf',
        workflowDir: '/home/user/.chainglass/workflows/hello-wf/current',
        version: '1.0.0',
        phases: [],
      });

      adapter.loadCurrentResult = workflow;

      const result = await adapter.loadCurrent('hello-wf');

      expect(result).toBe(workflow);
    });

    it('should throw EntityNotFoundError when loadCurrentResult not set', async () => {
      /*
      Test Doc:
      - Why: Per DYK Session - entity lookups must throw when entity not found
      - Contract: loadCurrent() throws EntityNotFoundError when no result configured
      - Usage Notes: Interface returns Promise<Workflow>, not Result type
      - Quality Contribution: Ensures default error behavior matches production adapter
      - Worked Example: adapter.loadCurrent('nonexistent') throws EntityNotFoundError
      */
      await expect(adapter.loadCurrent('nonexistent')).rejects.toThrow(EntityNotFoundError);
    });

    it('should throw EntityNotFoundError with correct context', async () => {
      /*
      Test Doc:
      - Why: Error must include debugging context per Critical Discovery 07
      - Contract: EntityNotFoundError includes entityType, identifier, path
      - Usage Notes: Use error.entityType for type narrowing in catch blocks
      - Quality Contribution: Ensures actionable error messages
      - Worked Example: error.entityType === 'Workflow', error.identifier === 'slug'
      */
      try {
        await adapter.loadCurrent('test-wf');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(EntityNotFoundError);
        const notFoundError = error as EntityNotFoundError;
        expect(notFoundError.entityType).toBe('Workflow');
        expect(notFoundError.identifier).toBe('test-wf');
      }
    });

    it('should track loadCurrent calls', async () => {
      /*
      Test Doc:
      - Why: Tests need to verify correct adapter usage
      - Contract: loadCurrentCalls tracks each loadCurrent() call with slug
      - Usage Notes: Check loadCurrentCalls.length and loadCurrentCalls[0].slug
      - Quality Contribution: Enables assertion of adapter method invocation
      - Worked Example: adapter.loadCurrent('test') → loadCurrentCalls[0].slug === 'test'
      */
      const workflow = Workflow.createCurrent({
        slug: 'test-wf',
        workflowDir: '/path',
        version: '1.0.0',
        phases: [],
      });

      adapter.loadCurrentResult = workflow;
      await adapter.loadCurrent('test-wf');
      await adapter.loadCurrent('another-wf');

      expect(adapter.loadCurrentCalls).toHaveLength(2);
      expect(adapter.loadCurrentCalls[0].slug).toBe('test-wf');
      expect(adapter.loadCurrentCalls[1].slug).toBe('another-wf');
    });
  });

  describe('loadCheckpoint()', () => {
    it('should return loadCheckpointResult when set', async () => {
      /*
      Test Doc:
      - Why: Tests must configure checkpoint responses
      - Contract: Setting loadCheckpointResult makes loadCheckpoint() return that value
      - Usage Notes: Checkpoint workflows have isCheckpoint=true
      - Quality Contribution: Ensures checkpoint loading works
      - Worked Example: adapter.loadCheckpointResult = workflow → loadCheckpoint('slug', 'v001') returns workflow
      */
      const createdAt = new Date('2026-01-25T10:00:00Z');
      const workflow = Workflow.createCheckpoint({
        slug: 'hello-wf',
        workflowDir: '/path/checkpoints/v001',
        version: '1.0.0',
        phases: [],
        checkpoint: {
          ordinal: 1,
          hash: 'abc12345',
          createdAt,
          comment: 'Initial release',
        },
      });

      adapter.loadCheckpointResult = workflow;

      const result = await adapter.loadCheckpoint('hello-wf', 'v001');

      expect(result).toBe(workflow);
      expect(result.isCheckpoint).toBe(true);
    });

    it('should throw EntityNotFoundError when loadCheckpointResult not set', async () => {
      /*
      Test Doc:
      - Why: Checkpoint lookups must throw when not found
      - Contract: loadCheckpoint() throws EntityNotFoundError when no result configured
      - Usage Notes: Both slug and version are used to identify the checkpoint
      - Quality Contribution: Ensures error path works
      - Worked Example: loadCheckpoint('slug', 'v999') throws
      */
      await expect(adapter.loadCheckpoint('hello-wf', 'v001')).rejects.toThrow(EntityNotFoundError);
    });

    it('should track loadCheckpoint calls with slug and version', async () => {
      /*
      Test Doc:
      - Why: Tests need to verify both slug and version were passed correctly
      - Contract: loadCheckpointCalls tracks slug and version parameters
      - Usage Notes: Use to verify correct checkpoint was requested
      - Quality Contribution: Catches incorrect parameter passing
      - Worked Example: loadCheckpointCalls[0] === { slug: 'wf', version: 'v001' }
      */
      const workflow = Workflow.createCheckpoint({
        slug: 'test-wf',
        workflowDir: '/path',
        version: '1.0.0',
        phases: [],
        checkpoint: { ordinal: 1, hash: 'abc', createdAt: new Date() },
      });

      adapter.loadCheckpointResult = workflow;
      await adapter.loadCheckpoint('test-wf', 'v001-abc12345');

      expect(adapter.loadCheckpointCalls).toHaveLength(1);
      expect(adapter.loadCheckpointCalls[0].slug).toBe('test-wf');
      expect(adapter.loadCheckpointCalls[0].version).toBe('v001-abc12345');
    });
  });

  describe('loadRun()', () => {
    it('should return loadRunResult when set', async () => {
      /*
      Test Doc:
      - Why: Tests must configure run responses
      - Contract: Setting loadRunResult makes loadRun() return that value
      - Usage Notes: Run workflows have isRun=true, both checkpoint and run metadata
      - Quality Contribution: Ensures run loading works
      - Worked Example: adapter.loadRunResult = workflow → loadRun(runDir) returns workflow
      */
      const workflow = Workflow.createRun({
        slug: 'hello-wf',
        workflowDir: '/path/run-001',
        version: '1.0.0',
        phases: [],
        checkpoint: { ordinal: 1, hash: 'abc12345', createdAt: new Date() },
        run: {
          runId: 'run-001',
          runDir: '/path/run-001',
          status: 'active',
          createdAt: new Date(),
        },
      });

      adapter.loadRunResult = workflow;

      const result = await adapter.loadRun('/path/run-001');

      expect(result).toBe(workflow);
      expect(result.isRun).toBe(true);
    });

    it('should throw EntityNotFoundError when loadRunResult not set', async () => {
      /*
      Test Doc:
      - Why: Run lookups must throw when not found
      - Contract: loadRun() throws EntityNotFoundError when no result configured
      - Usage Notes: Uses runDir (absolute path) to identify run
      - Quality Contribution: Ensures error path works
      - Worked Example: loadRun('/nonexistent') throws
      */
      await expect(adapter.loadRun('/nonexistent/run')).rejects.toThrow(EntityNotFoundError);
    });

    it('should track loadRun calls with runDir', async () => {
      /*
      Test Doc:
      - Why: Tests need to verify runDir was passed correctly
      - Contract: loadRunCalls tracks runDir parameter
      - Usage Notes: runDir is absolute path to run directory
      - Quality Contribution: Catches incorrect path passing
      - Worked Example: loadRunCalls[0].runDir === '/path/run-001'
      */
      const workflow = Workflow.createRun({
        slug: 'test-wf',
        workflowDir: '/path/run-001',
        version: '1.0.0',
        phases: [],
        checkpoint: { ordinal: 1, hash: 'abc', createdAt: new Date() },
        run: {
          runId: 'run-001',
          runDir: '/path/run-001',
          status: 'pending',
          createdAt: new Date(),
        },
      });

      adapter.loadRunResult = workflow;
      await adapter.loadRun('/path/to/run-001');

      expect(adapter.loadRunCalls).toHaveLength(1);
      expect(adapter.loadRunCalls[0].runDir).toBe('/path/to/run-001');
    });
  });

  describe('listCheckpoints()', () => {
    it('should return listCheckpointsResult when set', async () => {
      /*
      Test Doc:
      - Why: Tests must configure checkpoint list responses
      - Contract: Setting listCheckpointsResult makes listCheckpoints() return that array
      - Usage Notes: Each workflow in array should have isCheckpoint=true
      - Quality Contribution: Ensures checkpoint listing works
      - Worked Example: adapter.listCheckpointsResult = [wf1, wf2] → listCheckpoints() returns [wf1, wf2]
      */
      const checkpoint1 = Workflow.createCheckpoint({
        slug: 'hello-wf',
        workflowDir: '/path/v002',
        version: '1.0.0',
        phases: [],
        checkpoint: { ordinal: 2, hash: 'def', createdAt: new Date() },
      });
      const checkpoint2 = Workflow.createCheckpoint({
        slug: 'hello-wf',
        workflowDir: '/path/v001',
        version: '1.0.0',
        phases: [],
        checkpoint: { ordinal: 1, hash: 'abc', createdAt: new Date() },
      });

      adapter.listCheckpointsResult = [checkpoint1, checkpoint2];

      const result = await adapter.listCheckpoints('hello-wf');

      expect(result).toHaveLength(2);
      expect(result[0]).toBe(checkpoint1);
      expect(result[1]).toBe(checkpoint2);
    });

    it('should return empty array for listCheckpoints when not set', async () => {
      /*
      Test Doc:
      - Why: Per DYK Session - collections return empty arrays, not throw
      - Contract: listCheckpoints() returns [] when no result configured
      - Usage Notes: Differs from entity lookups which throw
      - Quality Contribution: Ensures graceful empty state handling
      - Worked Example: listCheckpoints('any') returns []
      */
      const result = await adapter.listCheckpoints('any-wf');

      expect(result).toEqual([]);
    });

    it('should track listCheckpoints calls with slug', async () => {
      /*
      Test Doc:
      - Why: Tests need to verify slug was passed correctly
      - Contract: listCheckpointsCalls tracks slug parameter
      - Usage Notes: Check which workflow's checkpoints were requested
      - Quality Contribution: Catches incorrect workflow requests
      - Worked Example: listCheckpointsCalls[0].slug === 'hello-wf'
      */
      await adapter.listCheckpoints('hello-wf');
      await adapter.listCheckpoints('another-wf');

      expect(adapter.listCheckpointsCalls).toHaveLength(2);
      expect(adapter.listCheckpointsCalls[0].slug).toBe('hello-wf');
      expect(adapter.listCheckpointsCalls[1].slug).toBe('another-wf');
    });
  });

  describe('listRuns()', () => {
    it('should return listRunsResult when set', async () => {
      /*
      Test Doc:
      - Why: Tests must configure run list responses
      - Contract: Setting listRunsResult makes listRuns() return that array
      - Usage Notes: Each workflow in array should have isRun=true
      - Quality Contribution: Ensures run listing works
      - Worked Example: adapter.listRunsResult = [run1, run2] → listRuns() returns [run1, run2]
      */
      const run1 = Workflow.createRun({
        slug: 'hello-wf',
        workflowDir: '/path/run-001',
        version: '1.0.0',
        phases: [],
        checkpoint: { ordinal: 1, hash: 'abc', createdAt: new Date() },
        run: { runId: 'run-001', runDir: '/path/run-001', status: 'active', createdAt: new Date() },
      });
      const run2 = Workflow.createRun({
        slug: 'hello-wf',
        workflowDir: '/path/run-002',
        version: '1.0.0',
        phases: [],
        checkpoint: { ordinal: 1, hash: 'abc', createdAt: new Date() },
        run: {
          runId: 'run-002',
          runDir: '/path/run-002',
          status: 'complete',
          createdAt: new Date(),
        },
      });

      adapter.listRunsResult = [run1, run2];

      const result = await adapter.listRuns('hello-wf');

      expect(result).toHaveLength(2);
      expect(result[0]).toBe(run1);
      expect(result[1]).toBe(run2);
    });

    it('should return empty array for listRuns when not set', async () => {
      /*
      Test Doc:
      - Why: Per DYK Session - collections return empty arrays, not throw
      - Contract: listRuns() returns [] when no result configured
      - Usage Notes: Differs from entity lookups which throw
      - Quality Contribution: Ensures graceful empty state handling
      - Worked Example: listRuns('any') returns []
      */
      const result = await adapter.listRuns('any-wf');

      expect(result).toEqual([]);
    });

    it('should filter listRuns by status when filter provided', async () => {
      /*
      Test Doc:
      - Why: Per DYK Session - implement status-only filtering (~10 lines)
      - Contract: listRuns(slug, { status: 'active' }) returns only active runs
      - Usage Notes: Only status filter is implemented per DYK decision
      - Quality Contribution: Demonstrates filter intent without over-engineering
      - Worked Example: Filter { status: 'active' } → only active runs returned
      */
      const activeRun = Workflow.createRun({
        slug: 'hello-wf',
        workflowDir: '/path/run-001',
        version: '1.0.0',
        phases: [],
        checkpoint: { ordinal: 1, hash: 'abc', createdAt: new Date() },
        run: { runId: 'run-001', runDir: '/path/run-001', status: 'active', createdAt: new Date() },
      });
      const completeRun = Workflow.createRun({
        slug: 'hello-wf',
        workflowDir: '/path/run-002',
        version: '1.0.0',
        phases: [],
        checkpoint: { ordinal: 1, hash: 'abc', createdAt: new Date() },
        run: {
          runId: 'run-002',
          runDir: '/path/run-002',
          status: 'complete',
          createdAt: new Date(),
        },
      });
      const pendingRun = Workflow.createRun({
        slug: 'hello-wf',
        workflowDir: '/path/run-003',
        version: '1.0.0',
        phases: [],
        checkpoint: { ordinal: 1, hash: 'abc', createdAt: new Date() },
        run: {
          runId: 'run-003',
          runDir: '/path/run-003',
          status: 'pending',
          createdAt: new Date(),
        },
      });

      adapter.listRunsResult = [activeRun, completeRun, pendingRun];

      const result = await adapter.listRuns('hello-wf', { status: 'active' });

      expect(result).toHaveLength(1);
      expect(result[0].run?.status).toBe('active');
    });

    it('should filter listRuns by array of statuses', async () => {
      /*
      Test Doc:
      - Why: RunListFilter supports status as array for OR logic
      - Contract: listRuns(slug, { status: ['active', 'pending'] }) returns both
      - Usage Notes: Multiple statuses are ORed together
      - Quality Contribution: Ensures array status filter works
      - Worked Example: Filter { status: ['active', 'pending'] } → both active and pending
      */
      const activeRun = Workflow.createRun({
        slug: 'hello-wf',
        workflowDir: '/path/run-001',
        version: '1.0.0',
        phases: [],
        checkpoint: { ordinal: 1, hash: 'abc', createdAt: new Date() },
        run: { runId: 'run-001', runDir: '/path/run-001', status: 'active', createdAt: new Date() },
      });
      const completeRun = Workflow.createRun({
        slug: 'hello-wf',
        workflowDir: '/path/run-002',
        version: '1.0.0',
        phases: [],
        checkpoint: { ordinal: 1, hash: 'abc', createdAt: new Date() },
        run: {
          runId: 'run-002',
          runDir: '/path/run-002',
          status: 'complete',
          createdAt: new Date(),
        },
      });
      const pendingRun = Workflow.createRun({
        slug: 'hello-wf',
        workflowDir: '/path/run-003',
        version: '1.0.0',
        phases: [],
        checkpoint: { ordinal: 1, hash: 'abc', createdAt: new Date() },
        run: {
          runId: 'run-003',
          runDir: '/path/run-003',
          status: 'pending',
          createdAt: new Date(),
        },
      });

      adapter.listRunsResult = [activeRun, completeRun, pendingRun];

      const result = await adapter.listRuns('hello-wf', { status: ['active', 'pending'] });

      expect(result).toHaveLength(2);
      expect(result.some((r) => r.run?.status === 'active')).toBe(true);
      expect(result.some((r) => r.run?.status === 'pending')).toBe(true);
    });

    it('should track listRuns calls with slug and filter', async () => {
      /*
      Test Doc:
      - Why: Tests need to verify correct filter was passed
      - Contract: listRunsCalls tracks slug and filter parameters
      - Usage Notes: Filter may be undefined if not provided
      - Quality Contribution: Catches incorrect filter passing
      - Worked Example: listRunsCalls[0] === { slug: 'wf', filter: { status: 'active' } }
      */
      await adapter.listRuns('hello-wf');
      await adapter.listRuns('another-wf', { status: 'complete' });

      expect(adapter.listRunsCalls).toHaveLength(2);
      expect(adapter.listRunsCalls[0].slug).toBe('hello-wf');
      expect(adapter.listRunsCalls[0].filter).toBeUndefined();
      expect(adapter.listRunsCalls[1].slug).toBe('another-wf');
      expect(adapter.listRunsCalls[1].filter).toEqual({ status: 'complete' });
    });
  });

  describe('exists()', () => {
    it('should return existsResult when set', async () => {
      /*
      Test Doc:
      - Why: Tests must configure exists responses
      - Contract: Setting existsResult makes exists() return that value
      - Usage Notes: Boolean result, no throwing
      - Quality Contribution: Ensures exists check works
      - Worked Example: adapter.existsResult = true → exists('slug') returns true
      */
      adapter.existsResult = true;

      const result = await adapter.exists('hello-wf');

      expect(result).toBe(true);
    });

    it('should return false for exists when not set', async () => {
      /*
      Test Doc:
      - Why: Default behavior should be safe (workflow doesn't exist)
      - Contract: exists() returns false when no result configured
      - Usage Notes: This is a boolean check, not entity lookup
      - Quality Contribution: Ensures safe default
      - Worked Example: exists('any') returns false
      */
      const result = await adapter.exists('any-wf');

      expect(result).toBe(false);
    });

    it('should track exists calls with slug', async () => {
      /*
      Test Doc:
      - Why: Tests need to verify exists was called with correct slug
      - Contract: existsCalls tracks slug parameter
      - Usage Notes: Useful for verifying precondition checks
      - Quality Contribution: Catches missing exists checks
      - Worked Example: existsCalls[0].slug === 'hello-wf'
      */
      await adapter.exists('hello-wf');
      await adapter.exists('another-wf');

      expect(adapter.existsCalls).toHaveLength(2);
      expect(adapter.existsCalls[0].slug).toBe('hello-wf');
      expect(adapter.existsCalls[1].slug).toBe('another-wf');
    });
  });

  describe('reset()', () => {
    it('should clear all state on reset', async () => {
      /*
      Test Doc:
      - Why: Test isolation requires clean state between tests
      - Contract: reset() clears all results and call tracking arrays
      - Usage Notes: Call in beforeEach or after test pollution
      - Quality Contribution: Prevents test pollution across cases
      - Worked Example: After reset(), all calls arrays empty, results undefined
      */
      // Setup some state
      const workflow = Workflow.createCurrent({
        slug: 'test',
        workflowDir: '/path',
        version: '1.0.0',
        phases: [],
      });

      adapter.loadCurrentResult = workflow;
      adapter.loadCheckpointResult = Workflow.createCheckpoint({
        slug: 'test',
        workflowDir: '/path',
        version: '1.0.0',
        phases: [],
        checkpoint: { ordinal: 1, hash: 'abc', createdAt: new Date() },
      });
      adapter.loadRunResult = Workflow.createRun({
        slug: 'test',
        workflowDir: '/path',
        version: '1.0.0',
        phases: [],
        checkpoint: { ordinal: 1, hash: 'abc', createdAt: new Date() },
        run: { runId: 'r1', runDir: '/path', status: 'pending', createdAt: new Date() },
      });
      adapter.listCheckpointsResult = [workflow];
      adapter.listRunsResult = [workflow];
      adapter.existsResult = true;

      // Make some calls
      await adapter.loadCurrent('test');
      await adapter.listCheckpoints('test');
      await adapter.exists('test');

      // Reset
      adapter.reset();

      // Verify all cleared
      expect(adapter.loadCurrentCalls).toHaveLength(0);
      expect(adapter.loadCheckpointCalls).toHaveLength(0);
      expect(adapter.loadRunCalls).toHaveLength(0);
      expect(adapter.listCheckpointsCalls).toHaveLength(0);
      expect(adapter.listRunsCalls).toHaveLength(0);
      expect(adapter.existsCalls).toHaveLength(0);

      // Verify results cleared (by checking default behavior returns)
      await expect(adapter.loadCurrent('test')).rejects.toThrow(EntityNotFoundError);
      expect(await adapter.listCheckpoints('test')).toEqual([]);
      expect(await adapter.exists('test')).toBe(false);
    });
  });

  describe('call tracking immutability', () => {
    it('should return copy of calls array (not internal reference)', async () => {
      /*
      Test Doc:
      - Why: Per DYK Session - use private arrays + spread operator pattern
      - Contract: Modifying returned calls array doesn't affect internal state
      - Usage Notes: Established pattern across 28+ fakes in codebase
      - Quality Contribution: Prevents accidental mutation of fake state
      - Worked Example: adapter.loadCurrentCalls.push(...) doesn't affect adapter
      */
      adapter.existsResult = true;
      await adapter.exists('test');

      const calls = adapter.existsCalls;
      calls.push({ slug: 'fake-call' });

      // Original should be unaffected
      expect(adapter.existsCalls).toHaveLength(1);
    });
  });
});
