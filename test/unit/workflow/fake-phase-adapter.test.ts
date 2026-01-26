/**
 * Tests for FakePhaseAdapter class.
 *
 * Per Phase 2: Fake Adapters for Testing - TDD RED first.
 * Per DYK Session: Uses call capture pattern (not FakeFileSystem).
 * Per DYK Session: Throws EntityNotFoundError for entity lookups, returns empty arrays for collections.
 */

import { EntityNotFoundError, FakePhaseAdapter, Phase, Workflow } from '@chainglass/workflow';
import { beforeEach, describe, expect, it } from 'vitest';

describe('FakePhaseAdapter', () => {
  let adapter: FakePhaseAdapter;

  beforeEach(() => {
    adapter = new FakePhaseAdapter();
  });

  // Helper to create a minimal Phase for testing
  function createTestPhase(name: string): Phase {
    return new Phase({
      name,
      phaseDir: `/path/to/${name}`,
      runDir: '/path/to/run',
      description: `Test phase: ${name}`,
      order: 1,
      status: 'pending',
      facilitator: 'agent',
      state: 'active',
    });
  }

  // Helper to create a minimal Workflow for testing
  function createTestWorkflow(): Workflow {
    return Workflow.createCurrent({
      slug: 'test-wf',
      workflowDir: '/path/to/workflow',
      version: '1.0.0',
      phases: [],
    });
  }

  describe('constructor', () => {
    it('should create instance', () => {
      /*
      Test Doc:
      - Why: FakePhaseAdapter must be instantiable for test setup
      - Contract: new FakePhaseAdapter() returns usable instance
      - Usage Notes: Create fresh instance in beforeEach for test isolation
      - Quality Contribution: Catches constructor errors early
      - Worked Example: const adapter = new FakePhaseAdapter() → adapter exists
      */
      expect(adapter).toBeInstanceOf(FakePhaseAdapter);
    });
  });

  describe('loadFromPath()', () => {
    it('should return loadFromPathResult when set', async () => {
      /*
      Test Doc:
      - Why: Tests must configure fake responses for deterministic behavior
      - Contract: Setting loadFromPathResult makes loadFromPath() return that value
      - Usage Notes: Set result before calling method
      - Quality Contribution: Ensures configurable response pattern works
      - Worked Example: adapter.loadFromPathResult = phase → loadFromPath(dir) returns phase
      */
      const phase = createTestPhase('gather');

      adapter.loadFromPathResult = phase;

      const result = await adapter.loadFromPath('/path/to/gather');

      expect(result).toBe(phase);
    });

    it('should throw EntityNotFoundError when loadFromPathResult not set', async () => {
      /*
      Test Doc:
      - Why: Per DYK Session - entity lookups must throw when entity not found
      - Contract: loadFromPath() throws EntityNotFoundError when no result configured
      - Usage Notes: Interface returns Promise<Phase>, not Result type
      - Quality Contribution: Ensures default error behavior matches production adapter
      - Worked Example: adapter.loadFromPath('/nonexistent') throws EntityNotFoundError
      */
      await expect(adapter.loadFromPath('/nonexistent/phase')).rejects.toThrow(EntityNotFoundError);
    });

    it('should throw EntityNotFoundError with correct context', async () => {
      /*
      Test Doc:
      - Why: Error must include debugging context per Critical Discovery 07
      - Contract: EntityNotFoundError includes entityType, identifier, path
      - Usage Notes: Use error.entityType for type narrowing in catch blocks
      - Quality Contribution: Ensures actionable error messages
      - Worked Example: error.entityType === 'Phase', path used as identifier
      */
      try {
        await adapter.loadFromPath('/path/to/missing-phase');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(EntityNotFoundError);
        const notFoundError = error as EntityNotFoundError;
        expect(notFoundError.entityType).toBe('Phase');
        expect(notFoundError.path).toBe('/path/to/missing-phase');
      }
    });

    it('should track loadFromPath calls', async () => {
      /*
      Test Doc:
      - Why: Tests need to verify correct adapter usage
      - Contract: loadFromPathCalls tracks each loadFromPath() call with phaseDir
      - Usage Notes: Check loadFromPathCalls.length and loadFromPathCalls[0].phaseDir
      - Quality Contribution: Enables assertion of adapter method invocation
      - Worked Example: adapter.loadFromPath('/path') → loadFromPathCalls[0].phaseDir === '/path'
      */
      const phase = createTestPhase('gather');

      adapter.loadFromPathResult = phase;
      await adapter.loadFromPath('/path/to/gather');
      await adapter.loadFromPath('/path/to/analyze');

      expect(adapter.loadFromPathCalls).toHaveLength(2);
      expect(adapter.loadFromPathCalls[0].phaseDir).toBe('/path/to/gather');
      expect(adapter.loadFromPathCalls[1].phaseDir).toBe('/path/to/analyze');
    });
  });

  describe('listForWorkflow()', () => {
    it('should return listForWorkflowResult when set', async () => {
      /*
      Test Doc:
      - Why: Tests must configure phase list responses
      - Contract: Setting listForWorkflowResult makes listForWorkflow() return that array
      - Usage Notes: Returns phases in execution order
      - Quality Contribution: Ensures phase listing works
      - Worked Example: adapter.listForWorkflowResult = [p1, p2] → listForWorkflow() returns [p1, p2]
      */
      const phase1 = createTestPhase('gather');
      const phase2 = createTestPhase('analyze');

      adapter.listForWorkflowResult = [phase1, phase2];

      const workflow = createTestWorkflow();
      const result = await adapter.listForWorkflow(workflow);

      expect(result).toHaveLength(2);
      expect(result[0]).toBe(phase1);
      expect(result[1]).toBe(phase2);
    });

    it('should return empty array for listForWorkflow when not set', async () => {
      /*
      Test Doc:
      - Why: Per DYK Session - collections return empty arrays, not throw
      - Contract: listForWorkflow() returns [] when no result configured
      - Usage Notes: Differs from entity lookups which throw
      - Quality Contribution: Ensures graceful empty state handling
      - Worked Example: listForWorkflow(workflow) returns []
      */
      const workflow = createTestWorkflow();
      const result = await adapter.listForWorkflow(workflow);

      expect(result).toEqual([]);
    });

    it('should track listForWorkflow calls with workflow', async () => {
      /*
      Test Doc:
      - Why: Tests need to verify correct workflow was passed
      - Contract: listForWorkflowCalls tracks workflow parameter
      - Usage Notes: Use to verify correct workflow was queried
      - Quality Contribution: Catches incorrect workflow passing
      - Worked Example: listForWorkflowCalls[0].workflow === passedWorkflow
      */
      const workflow = createTestWorkflow();
      await adapter.listForWorkflow(workflow);

      expect(adapter.listForWorkflowCalls).toHaveLength(1);
      expect(adapter.listForWorkflowCalls[0].workflow).toBe(workflow);
    });

    it('should track multiple listForWorkflow calls', async () => {
      /*
      Test Doc:
      - Why: Tests may make multiple calls with different workflows
      - Contract: All calls are tracked in order
      - Usage Notes: Useful for testing navigation patterns
      - Quality Contribution: Enables verification of multi-workflow operations
      - Worked Example: Multiple calls → multiple entries in listForWorkflowCalls
      */
      const workflow1 = createTestWorkflow();
      const workflow2 = Workflow.createCheckpoint({
        slug: 'other-wf',
        workflowDir: '/path',
        version: '1.0.0',
        phases: [],
        checkpoint: { ordinal: 1, hash: 'abc', createdAt: new Date() },
      });

      await adapter.listForWorkflow(workflow1);
      await adapter.listForWorkflow(workflow2);

      expect(adapter.listForWorkflowCalls).toHaveLength(2);
      expect(adapter.listForWorkflowCalls[0].workflow.slug).toBe('test-wf');
      expect(adapter.listForWorkflowCalls[1].workflow.slug).toBe('other-wf');
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
      const phase = createTestPhase('gather');
      const workflow = createTestWorkflow();

      adapter.loadFromPathResult = phase;
      adapter.listForWorkflowResult = [phase];

      // Make some calls
      await adapter.loadFromPath('/path');
      await adapter.listForWorkflow(workflow);

      // Reset
      adapter.reset();

      // Verify all cleared
      expect(adapter.loadFromPathCalls).toHaveLength(0);
      expect(adapter.listForWorkflowCalls).toHaveLength(0);

      // Verify results cleared (by checking default behavior returns)
      await expect(adapter.loadFromPath('/path')).rejects.toThrow(EntityNotFoundError);
      expect(await adapter.listForWorkflow(workflow)).toEqual([]);
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
      - Worked Example: adapter.loadFromPathCalls.push(...) doesn't affect adapter
      */
      adapter.listForWorkflowResult = [];
      const workflow = createTestWorkflow();
      await adapter.listForWorkflow(workflow);

      const calls = adapter.listForWorkflowCalls;
      calls.push({ workflow: createTestWorkflow() });

      // Original should be unaffected
      expect(adapter.listForWorkflowCalls).toHaveLength(1);
    });
  });
});
