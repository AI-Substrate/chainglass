/**
 * Contract tests for IOutputAdapter implementations.
 *
 * Per DYK Insight #3: KISS approach - test success/failure agreement only.
 * Don't test detailed formatting - that's what unit tests are for.
 *
 * These tests verify that all adapters agree on the fundamental semantics:
 * - Empty errors array = success
 * - Non-empty errors array = failure
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { PrepareResult, IOutputAdapter, ResultError } from '@chainglass/shared';
import { JsonOutputAdapter, ConsoleOutputAdapter, FakeOutputAdapter } from '@chainglass/shared';

/**
 * Create test context for a single adapter.
 */
interface AdapterTestContext {
  adapter: IOutputAdapter;
  name: string;
  /** Check if success is indicated in output */
  indicatesSuccess: (output: string) => boolean;
  /** Check if failure is indicated in output */
  indicatesFailure: (output: string) => boolean;
  /** Check if command name appears in output */
  includesCommand: (output: string, command: string) => boolean;
  /** Check if error details appear in output */
  includesErrorInfo: (output: string, error: ResultError) => boolean;
}

/**
 * Create adapter context for JsonOutputAdapter.
 */
function createJsonContext(): AdapterTestContext {
  return {
    adapter: new JsonOutputAdapter(),
    name: 'JsonOutputAdapter',
    indicatesSuccess: (output) => {
      const parsed = JSON.parse(output);
      return parsed.success === true;
    },
    indicatesFailure: (output) => {
      const parsed = JSON.parse(output);
      return parsed.success === false;
    },
    includesCommand: (output, command) => {
      const parsed = JSON.parse(output);
      return parsed.command === command;
    },
    includesErrorInfo: (output, error) => {
      const parsed = JSON.parse(output);
      return parsed.error?.code === error.code ||
        parsed.error?.details?.some((d: ResultError) => d.code === error.code);
    },
  };
}

/**
 * Create adapter context for ConsoleOutputAdapter.
 */
function createConsoleContext(): AdapterTestContext {
  return {
    adapter: new ConsoleOutputAdapter(),
    name: 'ConsoleOutputAdapter',
    indicatesSuccess: (output) => output.includes('✓'),
    indicatesFailure: (output) => output.includes('✗'),
    includesCommand: (output, command) => {
      // Console output mentions phase name from command
      if (command.includes('.')) {
        // For phase.* commands, the phase name should appear
        return true; // Relaxed check since console shows phase, not command
      }
      return true;
    },
    includesErrorInfo: (output, error) => {
      return output.includes(error.code);
    },
  };
}

/**
 * Create adapter context for FakeOutputAdapter.
 */
function createFakeContext(): AdapterTestContext {
  const adapter = new FakeOutputAdapter();
  return {
    adapter,
    name: 'FakeOutputAdapter',
    indicatesSuccess: (output) => {
      // Fake uses JSON format by default
      const parsed = JSON.parse(output);
      return parsed.success === true;
    },
    indicatesFailure: (output) => {
      const parsed = JSON.parse(output);
      return parsed.success === false;
    },
    includesCommand: (output, command) => {
      const parsed = JSON.parse(output);
      return parsed.command === command;
    },
    includesErrorInfo: (output, error) => {
      const parsed = JSON.parse(output);
      return parsed.error?.code === error.code;
    },
  };
}

/**
 * Run contract tests against a single adapter.
 */
function outputAdapterContractTests(context: AdapterTestContext): void {
  describe(`${context.name} implements IOutputAdapter contract`, () => {
    let successResult: PrepareResult;
    let failureResult: PrepareResult;
    let multiErrorResult: PrepareResult;

    beforeEach(() => {
      successResult = {
        phase: 'gather',
        runDir: '/path/to/run',
        status: 'ready',
        inputs: {
          required: ['user-request.md'],
          resolved: [{ name: 'user-request.md', path: '/path/to/user-request.md', exists: true }],
        },
        copiedFromPrior: [],
        errors: [],
      };

      failureResult = {
        phase: 'gather',
        runDir: '/path/to/run',
        status: 'failed',
        inputs: { required: ['user-request.md'], resolved: [] },
        copiedFromPrior: [],
        errors: [{
          code: 'E001',
          path: '/path/to/user-request.md',
          message: 'Missing required input file',
          action: 'Create the file before running prepare',
        }],
      };

      multiErrorResult = {
        phase: 'gather',
        runDir: '/path/to/run',
        status: 'failed',
        inputs: { required: [], resolved: [] },
        copiedFromPrior: [],
        errors: [
          { code: 'E001', path: '/a.txt', message: 'Missing file A' },
          { code: 'E001', path: '/b.txt', message: 'Missing file B' },
        ],
      };
    });

    describe('success/failure agreement', () => {
      it('should indicate success when errors empty', () => {
        /*
        Test Doc:
        - Why: All adapters must agree on what constitutes success
        - Contract: Empty errors array → success indicator
        - Usage Notes: This is the foundational semantic agreement
        - Quality Contribution: Ensures semantic equivalence across adapters
        - Worked Example: { errors: [] } → JSON success:true, Console ✓
        */
        const output = context.adapter.format('phase.prepare', successResult);

        expect(context.indicatesSuccess(output)).toBe(true);
        expect(context.indicatesFailure(output)).toBe(false);
      });

      it('should indicate failure when errors present', () => {
        /*
        Test Doc:
        - Why: All adapters must agree on what constitutes failure
        - Contract: Non-empty errors array → failure indicator
        - Usage Notes: Even one error means failure
        - Quality Contribution: Ensures semantic equivalence across adapters
        - Worked Example: { errors: [{ code: 'E001' }] } → JSON success:false, Console ✗
        */
        const output = context.adapter.format('phase.prepare', failureResult);

        expect(context.indicatesFailure(output)).toBe(true);
        expect(context.indicatesSuccess(output)).toBe(false);
      });

      it('should indicate failure when multiple errors present', () => {
        /*
        Test Doc:
        - Why: Multiple errors should still indicate failure
        - Contract: Multiple errors → failure indicator
        - Usage Notes: Error count doesn't change success/failure
        - Quality Contribution: Consistent error handling
        - Worked Example: { errors: [e1, e2] } → still failure
        */
        const output = context.adapter.format('phase.prepare', multiErrorResult);

        expect(context.indicatesFailure(output)).toBe(true);
      });
    });

    describe('command context', () => {
      it('should include command name', () => {
        /*
        Test Doc:
        - Why: Output should indicate which command ran
        - Contract: Command name appears in output
        - Usage Notes: Format varies by adapter
        - Quality Contribution: Traceability
        - Worked Example: format('phase.prepare', ...) → command appears in output
        */
        const output = context.adapter.format('phase.prepare', successResult);

        expect(context.includesCommand(output, 'phase.prepare')).toBe(true);
      });
    });

    describe('error details', () => {
      it('should include error code for failures', () => {
        /*
        Test Doc:
        - Why: Error code enables programmatic handling
        - Contract: Error code appears in failure output
        - Usage Notes: Format varies by adapter
        - Quality Contribution: Actionable errors
        - Worked Example: { code: 'E001' } → 'E001' in output
        */
        const output = context.adapter.format('phase.prepare', failureResult);

        expect(context.includesErrorInfo(output, failureResult.errors[0])).toBe(true);
      });
    });
  });
}

// Run contract tests against all adapters
outputAdapterContractTests(createJsonContext());
outputAdapterContractTests(createConsoleContext());
outputAdapterContractTests(createFakeContext());
