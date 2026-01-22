/**
 * Tests for ConsoleOutputAdapter.
 *
 * Per TDD: Tests written first (RED phase).
 * ConsoleOutputAdapter formats service results as human-readable text with icons.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { PrepareResult, ValidateResult, FinalizeResult, ComposeResult, ResultError } from '@chainglass/shared';
import { ConsoleOutputAdapter } from '@chainglass/shared';

describe('ConsoleOutputAdapter', () => {
  let adapter: ConsoleOutputAdapter;

  beforeEach(() => {
    adapter = new ConsoleOutputAdapter();
  });

  describe('successful result formatting', () => {
    it('should format success with checkmark icon', () => {
      /*
      Test Doc:
      - Why: Humans need visual success indicator
      - Contract: Successful result output contains ✓ icon
      - Usage Notes: Icon appears at start of primary message
      - Quality Contribution: Clear visual feedback for humans
      - Worked Example: { errors: [] } → "✓ ..."
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

      expect(output).toContain('✓');
    });

    it('should include phase name in prepare success', () => {
      /*
      Test Doc:
      - Why: User needs to know which phase was prepared
      - Contract: Output mentions the phase name
      - Usage Notes: Phase name appears in human-readable form
      - Quality Contribution: Context for multi-phase workflows
      - Worked Example: PrepareResult { phase: 'gather' } → "... 'gather' ..."
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

      expect(output).toContain('gather');
    });

    it('should list resolved inputs on prepare success', () => {
      /*
      Test Doc:
      - Why: User needs to see what inputs were found
      - Contract: Output lists resolved input file names
      - Usage Notes: Shows file names, not full paths
      - Quality Contribution: Confirmation that inputs are ready
      - Worked Example: resolved: [{ name: 'user-request.md' }] → "user-request.md"
      */
      const result: PrepareResult = {
        phase: 'gather',
        runDir: '/path/to/run',
        status: 'ready',
        inputs: {
          required: ['user-request.md', 'config.json'],
          resolved: [
            { name: 'user-request.md', path: '/path/to/user-request.md', exists: true },
            { name: 'config.json', path: '/path/to/config.json', exists: true },
          ],
        },
        copiedFromPrior: [],
        errors: [],
      };

      const output = adapter.format('phase.prepare', result);

      expect(output).toContain('user-request.md');
      expect(output).toContain('config.json');
    });

    it('should list validated outputs on validate success', () => {
      /*
      Test Doc:
      - Why: User needs to see what outputs passed validation
      - Contract: Output lists validated output file names
      - Usage Notes: Shows which files were validated
      - Quality Contribution: Confirmation that outputs are valid
      - Worked Example: validated: [{ name: 'gather-data.json' }] → "gather-data.json"
      */
      const result: ValidateResult = {
        phase: 'gather',
        runDir: '/path/to/run',
        outputs: {
          required: ['gather-data.json'],
          validated: [
            { name: 'gather-data.json', path: '/path/to/gather-data.json', valid: true },
          ],
        },
        errors: [],
      };

      const output = adapter.format('phase.validate', result);

      expect(output).toContain('gather-data.json');
    });

    it('should show extracted params on finalize success', () => {
      /*
      Test Doc:
      - Why: User needs to see what parameters were extracted
      - Contract: Output shows extracted parameter names/values
      - Usage Notes: Parameters are shown in readable format
      - Quality Contribution: Visibility into phase outputs
      - Worked Example: extractedParams: { item_count: 3 } → "item_count: 3"
      */
      const result: FinalizeResult = {
        phase: 'gather',
        runDir: '/path/to/run',
        extractedParams: { item_count: 3, request_type: 'processing' },
        phaseStatus: 'complete',
        errors: [],
      };

      const output = adapter.format('phase.finalize', result);

      expect(output).toContain('item_count');
      expect(output).toContain('3');
    });

    it('should show created phases on compose success', () => {
      /*
      Test Doc:
      - Why: User needs to see what phases are in the workflow
      - Contract: Output lists phase names from compose result
      - Usage Notes: Shows phase order and status
      - Quality Contribution: Overview of workflow structure
      - Worked Example: phases: [{ name: 'gather' }, { name: 'process' }] → "gather, process"
      */
      const result: ComposeResult = {
        runDir: '/path/to/run',
        template: 'hello-workflow',
        phases: [
          { name: 'gather', status: 'pending', order: 1 },
          { name: 'process', status: 'pending', order: 2 },
          { name: 'report', status: 'pending', order: 3 },
        ],
        errors: [],
      };

      const output = adapter.format('wf.compose', result);

      expect(output).toContain('gather');
      expect(output).toContain('process');
      expect(output).toContain('report');
    });
  });

  describe('error result formatting', () => {
    it('should format failure with X icon', () => {
      /*
      Test Doc:
      - Why: Humans need visual failure indicator
      - Contract: Failed result output contains ✗ icon
      - Usage Notes: Icon appears at start of error message
      - Quality Contribution: Clear visual feedback for errors
      - Worked Example: { errors: [...] } → "✗ ..."
      */
      const result: PrepareResult = {
        phase: 'gather',
        runDir: '/path/to/run',
        status: 'failed',
        inputs: { required: [], resolved: [] },
        copiedFromPrior: [],
        errors: [{ code: 'E001', message: 'Error occurred' }],
      };

      const output = adapter.format('phase.prepare', result);

      expect(output).toContain('✗');
    });

    it('should include error code in failure', () => {
      /*
      Test Doc:
      - Why: Error codes enable quick lookup and debugging
      - Contract: Output shows error code
      - Usage Notes: Code shown in brackets or clear format
      - Quality Contribution: Error identification for troubleshooting
      - Worked Example: { code: 'E001' } → "[E001]" or "E001"
      */
      const result: PrepareResult = {
        phase: 'gather',
        runDir: '/path/to/run',
        status: 'failed',
        inputs: { required: [], resolved: [] },
        copiedFromPrior: [],
        errors: [{ code: 'E001', message: 'Missing required input file' }],
      };

      const output = adapter.format('phase.prepare', result);

      expect(output).toContain('E001');
    });

    it('should list each error path', () => {
      /*
      Test Doc:
      - Why: Multiple errors need to show affected locations
      - Contract: Each error's path is shown
      - Usage Notes: Paths help user locate issues
      - Quality Contribution: Precise error location for fixes
      - Worked Example: errors: [{ path: '/a.txt' }, { path: '/b.txt' }] → both paths shown
      */
      const errors: ResultError[] = [
        { code: 'E001', message: 'Missing file A', path: '/a.txt' },
        { code: 'E001', message: 'Missing file B', path: '/b.txt' },
      ];

      const result: PrepareResult = {
        phase: 'gather',
        runDir: '/path/to/run',
        status: 'failed',
        inputs: { required: [], resolved: [] },
        copiedFromPrior: [],
        errors,
      };

      const output = adapter.format('phase.prepare', result);

      expect(output).toContain('/a.txt');
      expect(output).toContain('/b.txt');
    });

    it('should include action suggestion', () => {
      /*
      Test Doc:
      - Why: Users need to know how to fix errors
      - Contract: Output shows error action suggestion
      - Usage Notes: Action is the recommended fix
      - Quality Contribution: Actionable error messages
      - Worked Example: { action: 'Create the file' } → output contains action text
      */
      const result: PrepareResult = {
        phase: 'gather',
        runDir: '/path/to/run',
        status: 'failed',
        inputs: { required: [], resolved: [] },
        copiedFromPrior: [],
        errors: [{
          code: 'E001',
          message: 'Missing required input file',
          action: 'Create the file before running prepare',
        }],
      };

      const output = adapter.format('phase.prepare', result);

      expect(output).toContain('Create the file before running prepare');
    });

    it('should show expected/actual for validation errors', () => {
      /*
      Test Doc:
      - Why: Validation errors need context on what was wrong
      - Contract: Output shows expected and actual values
      - Usage Notes: Helps user understand the mismatch
      - Quality Contribution: Clear validation error context
      - Worked Example: { expected: 'pending', actual: 'invalid' } → both shown
      */
      const result: ValidateResult = {
        phase: 'gather',
        runDir: '/path/to/run',
        outputs: { required: [], validated: [] },
        errors: [{
          code: 'E012',
          path: '/status',
          message: 'Invalid enum value',
          expected: 'pending | active | complete',
          actual: 'invalid',
          action: 'Update status to use one of the allowed values',
        }],
      };

      const output = adapter.format('phase.validate', result);

      expect(output).toContain('pending | active | complete');
      expect(output).toContain('invalid');
    });
  });

  describe('generic result handling', () => {
    it('should handle unknown commands gracefully', () => {
      /*
      Test Doc:
      - Why: System should handle new/unknown commands
      - Contract: Unknown commands still produce readable output
      - Usage Notes: Generic formatting as fallback
      - Quality Contribution: Robustness for future commands
      - Worked Example: format('unknown.command', { errors: [] }) → doesn't throw
      */
      const result: PrepareResult = {
        phase: 'gather',
        runDir: '/path/to/run',
        status: 'ready',
        inputs: { required: [], resolved: [] },
        copiedFromPrior: [],
        errors: [],
      };

      // Should not throw
      const output = adapter.format('unknown.command', result);

      expect(output).toBeDefined();
      expect(output.length).toBeGreaterThan(0);
    });
  });
});
