import type { ComposeResult } from '@chainglass/shared';
import { type ComposeCall, FakeWorkflowService } from '@chainglass/workflow';
import { beforeEach, describe, expect, it } from 'vitest';

/**
 * Tests for FakeWorkflowService.
 *
 * Per DYK-04: Follows FakeOutputAdapter pattern with call capture + preset results.
 */

describe('FakeWorkflowService', () => {
  let service: FakeWorkflowService;

  beforeEach(() => {
    service = new FakeWorkflowService();
  });

  describe('compose()', () => {
    it('should return auto-generated success result by default', async () => {
      /*
      Test Doc:
      - Why: Fake should work out-of-box without explicit setup
      - Contract: Returns valid ComposeResult with generated runDir
      - Usage Notes: Auto-generates run folder name based on date
      - Quality Contribution: Ensures fake is usable immediately
      - Worked Example: compose('template') → { runDir: '.../run-YYYY-MM-DD-001' }
      */
      const result = await service.compose('hello-workflow', '.chainglass/runs');

      expect(result.errors).toHaveLength(0);
      expect(result.template).toBe('hello-workflow');
      expect(result.runDir).toMatch(/\.chainglass\/runs\/run-\d{4}-\d{2}-\d{2}-001$/);
      expect(result.phases).toHaveLength(1);
      expect(result.phases[0].status).toBe('pending');
    });

    it('should increment ordinal for multiple calls', async () => {
      /*
      Test Doc:
      - Why: Fake should generate unique run folders
      - Contract: Each compose() call gets incrementing ordinal
      - Usage Notes: Ordinal is tracked in-memory, not based on filesystem
      - Quality Contribution: Prevents duplicate run folders in tests
      - Worked Example: Two calls → ...001, ...002
      */
      const result1 = await service.compose('template', '.chainglass/runs');
      const result2 = await service.compose('template', '.chainglass/runs');

      expect(result1.runDir).toMatch(/run-\d{4}-\d{2}-\d{2}-001$/);
      expect(result2.runDir).toMatch(/run-\d{4}-\d{2}-\d{2}-002$/);
    });

    it('should return preset result when configured', async () => {
      /*
      Test Doc:
      - Why: Tests need to configure specific responses
      - Contract: setComposeResult() configures response for template
      - Usage Notes: Preset takes precedence over default
      - Quality Contribution: Enables precise test control
      - Worked Example: setComposeResult('t', result) → compose('t') → result
      */
      const preset: ComposeResult = {
        runDir: '/custom/run',
        template: 'custom-template',
        phases: [{ name: 'phase1', order: 1, status: 'pending' }],
        errors: [],
      };
      service.setComposeResult('hello-workflow', preset);

      const result = await service.compose('hello-workflow', '.chainglass/runs');

      expect(result).toEqual(preset);
    });

    it('should return default result when configured', async () => {
      /*
      Test Doc:
      - Why: Tests may want all calls to return same result
      - Contract: setDefaultResult() configures fallback response
      - Usage Notes: Used when no preset matches
      - Quality Contribution: Simplifies test setup
      - Worked Example: setDefaultResult(result) → all compose() calls → result
      */
      const defaultResult: ComposeResult = {
        runDir: '/default/run',
        template: 'default',
        phases: [],
        errors: [],
      };
      service.setDefaultResult(defaultResult);

      const result = await service.compose('any-template', '.chainglass/runs');

      expect(result).toEqual(defaultResult);
    });

    it('should return preset error result', async () => {
      /*
      Test Doc:
      - Why: Tests need to simulate error conditions
      - Contract: setComposeError() configures error response
      - Usage Notes: Convenience method for error setup
      - Quality Contribution: Enables error path testing
      - Worked Example: setComposeError('t', 'E020', 'Not found') → compose('t') → error
      */
      service.setComposeError('bad-template', 'E020', 'Template not found', 'Create the template');

      const result = await service.compose('bad-template', '.chainglass/runs');

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('E020');
      expect(result.errors[0].message).toBe('Template not found');
      expect(result.errors[0].action).toBe('Create the template');
    });
  });

  describe('call tracking', () => {
    it('should capture compose calls', async () => {
      /*
      Test Doc:
      - Why: Tests need to verify correct arguments were passed
      - Contract: getLastComposeCall() returns call details
      - Usage Notes: Returns null if no calls made
      - Quality Contribution: Enables argument verification
      - Worked Example: compose('t', 'r') → getLastComposeCall() → { template: 't', runsDir: 'r' }
      */
      await service.compose('my-template', '.chainglass/runs');

      const lastCall = service.getLastComposeCall();

      expect(lastCall).not.toBeNull();
      expect(lastCall?.template).toBe('my-template');
      expect(lastCall?.runsDir).toBe('.chainglass/runs');
      expect(lastCall?.timestamp).toBeDefined();
    });

    it('should return all compose calls', async () => {
      /*
      Test Doc:
      - Why: Tests may need to verify multiple calls
      - Contract: getComposeCalls() returns all calls in order
      - Usage Notes: Returns empty array if no calls
      - Quality Contribution: Enables sequence verification
      - Worked Example: compose('a') → compose('b') → getComposeCalls() → [a, b]
      */
      await service.compose('template-1', '.chainglass/runs');
      await service.compose('template-2', '.chainglass/runs');

      const calls = service.getComposeCalls();

      expect(calls).toHaveLength(2);
      expect(calls[0].template).toBe('template-1');
      expect(calls[1].template).toBe('template-2');
    });

    it('should count compose calls', async () => {
      /*
      Test Doc:
      - Why: Tests may need to verify call count
      - Contract: getComposeCallCount() returns number of calls
      - Usage Notes: Useful for "was called N times" assertions
      - Quality Contribution: Enables call count verification
      - Worked Example: Two compose calls → getComposeCallCount() → 2
      */
      expect(service.getComposeCallCount()).toBe(0);

      await service.compose('template', '.chainglass/runs');
      expect(service.getComposeCallCount()).toBe(1);

      await service.compose('template', '.chainglass/runs');
      expect(service.getComposeCallCount()).toBe(2);
    });

    it('should return null when no calls made', async () => {
      /*
      Test Doc:
      - Why: Tests need to verify no calls were made
      - Contract: getLastComposeCall() returns null if no calls
      - Usage Notes: Check for null before accessing properties
      - Quality Contribution: Enables "not called" assertions
      - Worked Example: Fresh service → getLastComposeCall() → null
      */
      expect(service.getLastComposeCall()).toBeNull();
    });
  });

  describe('reset()', () => {
    it('should clear all state', async () => {
      /*
      Test Doc:
      - Why: Tests need isolation between scenarios
      - Contract: reset() clears calls, presets, and counter
      - Usage Notes: Call between test scenarios
      - Quality Contribution: Enables test isolation
      - Worked Example: compose() → reset() → getComposeCallCount() → 0
      */
      service.setComposeResult('template', {
        runDir: '/preset',
        template: 't',
        phases: [],
        errors: [],
      });
      await service.compose('template', '.chainglass/runs');

      service.reset();

      expect(service.getComposeCallCount()).toBe(0);
      expect(service.getLastComposeCall()).toBeNull();
      // Preset should be cleared, so default behavior returns
      const result = await service.compose('template', '.chainglass/runs');
      expect(result.runDir).toMatch(/run-\d{4}-\d{2}-\d{2}-001$/); // Counter reset
    });
  });

  describe('static helpers', () => {
    it('createSuccessResult should create valid result', () => {
      /*
      Test Doc:
      - Why: Convenience for creating test fixtures
      - Contract: Returns ComposeResult with no errors
      - Usage Notes: Use for setting up success scenarios
      - Quality Contribution: Reduces test boilerplate
      - Worked Example: createSuccessResult('t', 'r', [...]) → { errors: [] }
      */
      const result = FakeWorkflowService.createSuccessResult(
        'my-workflow',
        '.chainglass/runs/run-001',
        [{ name: 'gather', order: 1, status: 'pending' }]
      );

      expect(result.errors).toHaveLength(0);
      expect(result.template).toBe('my-workflow');
      expect(result.runDir).toBe('.chainglass/runs/run-001');
      expect(result.phases).toHaveLength(1);
    });

    it('createErrorResult should create error result', () => {
      /*
      Test Doc:
      - Why: Convenience for creating error fixtures
      - Contract: Returns ComposeResult with error
      - Usage Notes: Use for setting up error scenarios
      - Quality Contribution: Reduces test boilerplate
      - Worked Example: createErrorResult('E020', 'Not found') → { errors: [{ code: 'E020' }] }
      */
      const result = FakeWorkflowService.createErrorResult(
        'E020',
        'Template not found',
        'Create the template'
      );

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('E020');
      expect(result.errors[0].message).toBe('Template not found');
      expect(result.errors[0].action).toBe('Create the template');
      expect(result.runDir).toBe('');
      expect(result.phases).toHaveLength(0);
    });
  });
});
