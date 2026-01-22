/**
 * Tests for FakeOutputAdapter.
 *
 * Verifies the fake captures calls correctly and provides useful test helpers.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { PrepareResult } from '@chainglass/shared';
import { FakeOutputAdapter } from '@chainglass/shared';

describe('FakeOutputAdapter', () => {
  let adapter: FakeOutputAdapter;

  beforeEach(() => {
    adapter = new FakeOutputAdapter();
  });

  describe('output capture', () => {
    it('should capture last formatted output', () => {
      /*
      Test Doc:
      - Why: Tests need to verify what output was produced
      - Contract: getLastOutput() returns the string from last format() call
      - Usage Notes: Returns null if no calls made
      - Quality Contribution: Enables output verification in tests
      - Worked Example: format('cmd', result) → getLastOutput() returns formatted string
      */
      const result: PrepareResult = {
        phase: 'gather',
        runDir: '/path/to/run',
        status: 'ready',
        inputs: { required: [], resolved: [] },
        copiedFromPrior: [],
        errors: [],
      };

      adapter.format('phase.prepare', result);

      expect(adapter.getLastOutput()).not.toBeNull();
      expect(adapter.getLastOutput()?.length).toBeGreaterThan(0);
    });

    it('should capture last command', () => {
      /*
      Test Doc:
      - Why: Tests need to verify which command was formatted
      - Contract: getLastCommand() returns the command from last format() call
      - Usage Notes: Returns null if no calls made
      - Quality Contribution: Enables command verification in tests
      - Worked Example: format('phase.prepare', result) → getLastCommand() returns 'phase.prepare'
      */
      const result: PrepareResult = {
        phase: 'gather',
        runDir: '/path/to/run',
        status: 'ready',
        inputs: { required: [], resolved: [] },
        copiedFromPrior: [],
        errors: [],
      };

      adapter.format('phase.prepare', result);

      expect(adapter.getLastCommand()).toBe('phase.prepare');
    });

    it('should capture all results in order', () => {
      /*
      Test Doc:
      - Why: Tests may need to verify multiple format calls
      - Contract: getFormattedResults() returns array of all calls in order
      - Usage Notes: Each entry has command, result, and output
      - Quality Contribution: Enables verification of call sequences
      - Worked Example: format() 3 times → getFormattedResults().length === 3
      */
      const result1: PrepareResult = {
        phase: 'gather',
        runDir: '/run1',
        status: 'ready',
        inputs: { required: [], resolved: [] },
        copiedFromPrior: [],
        errors: [],
      };

      const result2: PrepareResult = {
        phase: 'process',
        runDir: '/run2',
        status: 'ready',
        inputs: { required: [], resolved: [] },
        copiedFromPrior: [],
        errors: [],
      };

      adapter.format('phase.prepare', result1);
      adapter.format('phase.validate', result2);

      const results = adapter.getFormattedResults();
      expect(results).toHaveLength(2);
      expect(results[0].command).toBe('phase.prepare');
      expect(results[1].command).toBe('phase.validate');
    });

    it('should reset captured state', () => {
      /*
      Test Doc:
      - Why: Tests need clean state between assertions
      - Contract: reset() clears all captured calls
      - Usage Notes: Also clears preset outputs
      - Quality Contribution: Test isolation
      - Worked Example: format() then reset() → getLastOutput() returns null
      */
      const result: PrepareResult = {
        phase: 'gather',
        runDir: '/path/to/run',
        status: 'ready',
        inputs: { required: [], resolved: [] },
        copiedFromPrior: [],
        errors: [],
      };

      adapter.format('phase.prepare', result);
      expect(adapter.getLastOutput()).not.toBeNull();

      adapter.reset();

      expect(adapter.getLastOutput()).toBeNull();
      expect(adapter.getLastCommand()).toBeNull();
      expect(adapter.getFormattedResults()).toHaveLength(0);
    });
  });

  describe('preset outputs', () => {
    it('should return preset output when configured', () => {
      /*
      Test Doc:
      - Why: Tests may need to control exact output
      - Contract: setPresetOutput() makes format() return that string
      - Usage Notes: Only applies to matching command
      - Quality Contribution: Deterministic test outputs
      - Worked Example: setPresetOutput('cmd', '{"test":true}') → format('cmd', ...) returns '{"test":true}'
      */
      const result: PrepareResult = {
        phase: 'gather',
        runDir: '/path/to/run',
        status: 'ready',
        inputs: { required: [], resolved: [] },
        copiedFromPrior: [],
        errors: [],
      };

      adapter.setPresetOutput('phase.prepare', '{"preset":true}');

      const output = adapter.format('phase.prepare', result);

      expect(output).toBe('{"preset":true}');
    });
  });

  describe('default output format', () => {
    it('should produce valid JSON by default', () => {
      /*
      Test Doc:
      - Why: Default output should be predictable
      - Contract: Default format is valid JSON
      - Usage Notes: Can be disabled with setUseJsonFormat(false)
      - Quality Contribution: Consistent test behavior
      - Worked Example: format('cmd', result) → JSON.parse succeeds
      */
      const result: PrepareResult = {
        phase: 'gather',
        runDir: '/path/to/run',
        status: 'ready',
        inputs: { required: [], resolved: [] },
        copiedFromPrior: [],
        errors: [],
      };

      const output = adapter.format('phase.prepare', result);

      expect(() => JSON.parse(output)).not.toThrow();
    });

    it('should indicate success/failure in JSON output', () => {
      /*
      Test Doc:
      - Why: Tests need to verify success/failure detection
      - Contract: JSON output has correct success field
      - Usage Notes: Mimics JsonOutputAdapter behavior
      - Quality Contribution: Behavior verification
      - Worked Example: errors: [] → success: true; errors: [...] → success: false
      */
      const successResult: PrepareResult = {
        phase: 'gather',
        runDir: '/path/to/run',
        status: 'ready',
        inputs: { required: [], resolved: [] },
        copiedFromPrior: [],
        errors: [],
      };

      const failureResult: PrepareResult = {
        phase: 'gather',
        runDir: '/path/to/run',
        status: 'failed',
        inputs: { required: [], resolved: [] },
        copiedFromPrior: [],
        errors: [{ code: 'E001', message: 'Error' }],
      };

      const successOutput = JSON.parse(adapter.format('phase.prepare', successResult));
      const failureOutput = JSON.parse(adapter.format('phase.prepare', failureResult));

      expect(successOutput.success).toBe(true);
      expect(failureOutput.success).toBe(false);
    });
  });
});
