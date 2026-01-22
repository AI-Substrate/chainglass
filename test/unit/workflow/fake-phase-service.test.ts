import { FakePhaseService } from '@chainglass/workflow';
import { beforeEach, describe, expect, it } from 'vitest';

/**
 * Tests for FakePhaseService.
 *
 * Per Phase 3: Phase Operations - Verifies the fake captures calls
 * and returns configurable results for testing.
 */

describe('FakePhaseService', () => {
  let service: FakePhaseService;

  beforeEach(() => {
    service = new FakePhaseService();
  });

  describe('prepare() call capture', () => {
    it('should capture prepare calls', async () => {
      /*
      Test Doc:
      - Why: Tests need to verify prepare was called correctly
      - Contract: getPrepareCalls() returns all prepare invocations
      - Usage Notes: Use in CLI tests to verify service calls
      - Quality Contribution: Enables behavior verification
      - Worked Example: prepare('gather', '/run') → captured in getPrepareCalls()
      */
      await service.prepare('gather', '/runs/run-001');
      await service.prepare('process', '/runs/run-001');

      expect(service.getPrepareCallCount()).toBe(2);
      expect(service.getPrepareCalls()[0].phase).toBe('gather');
      expect(service.getPrepareCalls()[1].phase).toBe('process');
    });

    it('should return preset result when configured', async () => {
      /*
      Test Doc:
      - Why: Tests need to configure specific results
      - Contract: setPrepareResult() configures return value
      - Usage Notes: Set before calling prepare()
      - Quality Contribution: Enables result stubbing
      - Worked Example: setPrepareResult('gather', {...}) → prepare returns that result
      */
      const expectedResult = FakePhaseService.createPrepareSuccessResult('gather', '/runs/run-001');
      service.setPrepareResult('gather', expectedResult);

      const result = await service.prepare('gather', '/runs/run-001');

      expect(result.phase).toBe('gather');
      expect(result.status).toBe('ready');
      expect(result.errors).toHaveLength(0);
    });

    it('should return error when configured with setPrepareError', async () => {
      /*
      Test Doc:
      - Why: Tests need to simulate errors
      - Contract: setPrepareError() configures error response
      - Usage Notes: Shortcut for setting up error results
      - Quality Contribution: Simplifies error testing
      - Worked Example: setPrepareError('gather', 'E001', 'Missing') → returns error
      */
      service.setPrepareError('gather', 'E001', 'Missing input file');

      const result = await service.prepare('gather', '/runs/run-001');

      expect(result.status).toBe('failed');
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('E001');
    });

    it('should return last call with getLastPrepareCall', async () => {
      /*
      Test Doc:
      - Why: Common pattern to check most recent call
      - Contract: getLastPrepareCall() returns most recent prepare call
      - Usage Notes: Returns null if no calls made
      - Quality Contribution: Convenience for single-call tests
      - Worked Example: prepare('gather') → getLastPrepareCall().phase === 'gather'
      */
      expect(service.getLastPrepareCall()).toBeNull();

      await service.prepare('gather', '/runs/run-001');
      await service.prepare('process', '/runs/run-001');

      expect(service.getLastPrepareCall()?.phase).toBe('process');
    });
  });

  describe('validate() call capture', () => {
    it('should capture validate calls', async () => {
      /*
      Test Doc:
      - Why: Tests need to verify validate was called correctly
      - Contract: getValidateCalls() returns all validate invocations
      - Usage Notes: Use in CLI tests to verify service calls
      - Quality Contribution: Enables behavior verification
      - Worked Example: validate('gather', '/run', 'outputs') → captured
      */
      await service.validate('gather', '/runs/run-001', 'outputs');
      await service.validate('gather', '/runs/run-001', 'inputs');

      expect(service.getValidateCallCount()).toBe(2);
      expect(service.getValidateCalls()[0].check).toBe('outputs');
      expect(service.getValidateCalls()[1].check).toBe('inputs');
    });

    it('should return preset result when configured', async () => {
      /*
      Test Doc:
      - Why: Tests need to configure specific results
      - Contract: setValidateResult() configures return value for phase+mode
      - Usage Notes: Set before calling validate()
      - Quality Contribution: Enables result stubbing
      - Worked Example: setValidateResult('gather', 'outputs', {...}) → returns that
      */
      const expectedResult = FakePhaseService.createValidateSuccessResult(
        'gather',
        '/runs/run-001',
        'outputs',
        [{ name: 'data.json', path: '/path', valid: true }]
      );
      service.setValidateResult('gather', 'outputs', expectedResult);

      const result = await service.validate('gather', '/runs/run-001', 'outputs');

      expect(result.check).toBe('outputs');
      expect(result.files.validated).toHaveLength(1);
      expect(result.errors).toHaveLength(0);
    });

    it('should return error when configured with setValidateError', async () => {
      /*
      Test Doc:
      - Why: Tests need to simulate errors
      - Contract: setValidateError() configures error response
      - Usage Notes: Shortcut for setting up error results
      - Quality Contribution: Simplifies error testing
      - Worked Example: setValidateError('gather', 'outputs', 'E010', 'Missing') → error
      */
      service.setValidateError('gather', 'outputs', 'E010', 'Missing output file');

      const result = await service.validate('gather', '/runs/run-001', 'outputs');

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('E010');
    });

    it('should return last call with getLastValidateCall', async () => {
      /*
      Test Doc:
      - Why: Common pattern to check most recent call
      - Contract: getLastValidateCall() returns most recent validate call
      - Usage Notes: Returns null if no calls made
      - Quality Contribution: Convenience for single-call tests
      - Worked Example: validate('gather', ...) → getLastValidateCall().phase === 'gather'
      */
      expect(service.getLastValidateCall()).toBeNull();

      await service.validate('gather', '/runs/run-001', 'outputs');
      await service.validate('process', '/runs/run-001', 'inputs');

      expect(service.getLastValidateCall()?.phase).toBe('process');
      expect(service.getLastValidateCall()?.check).toBe('inputs');
    });
  });

  describe('reset()', () => {
    it('should clear all state', async () => {
      /*
      Test Doc:
      - Why: Tests need clean state between runs
      - Contract: reset() clears calls and presets
      - Usage Notes: Call in beforeEach for test isolation
      - Quality Contribution: Prevents test pollution
      - Worked Example: reset() → all counts are 0, no presets
      */
      await service.prepare('gather', '/runs/run-001');
      await service.validate('gather', '/runs/run-001', 'outputs');
      service.setPrepareResult(
        'process',
        FakePhaseService.createPrepareSuccessResult('process', '/run')
      );

      service.reset();

      expect(service.getPrepareCallCount()).toBe(0);
      expect(service.getValidateCallCount()).toBe(0);
      expect(service.getLastPrepareCall()).toBeNull();
      expect(service.getLastValidateCall()).toBeNull();
    });
  });

  describe('default results', () => {
    it('should use default prepare result when no preset matches', async () => {
      /*
      Test Doc:
      - Why: Convenient to set default for all phases
      - Contract: setDefaultPrepareResult() used when no phase-specific preset
      - Usage Notes: Lower priority than phase-specific presets
      - Quality Contribution: Reduces test setup boilerplate
      - Worked Example: setDefaultPrepareResult(...) → all prepare calls return it
      */
      const defaultResult = FakePhaseService.createPrepareSuccessResult('default', '/run');
      service.setDefaultPrepareResult(defaultResult);

      const result = await service.prepare('any-phase', '/runs/run-001');

      expect(result.status).toBe('ready');
    });

    it('should use default validate result when no preset matches', async () => {
      /*
      Test Doc:
      - Why: Convenient to set default for all phases
      - Contract: setDefaultValidateResult() used when no phase-specific preset
      - Usage Notes: Lower priority than phase/mode-specific presets
      - Quality Contribution: Reduces test setup boilerplate
      - Worked Example: setDefaultValidateResult(...) → all validate calls return it
      */
      const defaultResult = FakePhaseService.createValidateSuccessResult(
        'default',
        '/run',
        'outputs'
      );
      service.setDefaultValidateResult(defaultResult);

      const result = await service.validate('any-phase', '/runs/run-001', 'outputs');

      expect(result.errors).toHaveLength(0);
    });
  });
});
