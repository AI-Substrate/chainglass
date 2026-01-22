/**
 * Tests for JsonOutputAdapter.
 *
 * Per TDD: Tests written first (RED phase).
 * JsonOutputAdapter formats service results as JSON with CommandResponse envelope.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { PrepareResult, ResultError } from '@chainglass/shared';
import { JsonOutputAdapter } from '@chainglass/shared';

describe('JsonOutputAdapter', () => {
  let adapter: JsonOutputAdapter;

  beforeEach(() => {
    adapter = new JsonOutputAdapter();
  });

  describe('successful result formatting', () => {
    it('should format successful result with envelope', () => {
      /*
      Test Doc:
      - Why: Agents parse JSON output; envelope structure must be consistent
      - Contract: format() wraps result in { success: true, command, timestamp, data }
      - Usage Notes: data contains result without errors array
      - Quality Contribution: Ensures agent-parseable JSON responses
      - Worked Example: format('phase.prepare', { phase: 'gather', errors: [] }) → { success: true, data: { phase: 'gather' } }
      */
      const result: PrepareResult = {
        phase: 'gather',
        runDir: '/path/to/run',
        status: 'ready',
        inputs: { required: ['user-request.md'], resolved: [{ name: 'user-request.md', path: '/path/to/run/inputs/user-request.md', exists: true }] },
        copiedFromPrior: [],
        errors: [],
      };

      const output = adapter.format('phase.prepare', result);
      const parsed = JSON.parse(output);

      expect(parsed.success).toBe(true);
      expect(parsed.command).toBe('phase.prepare');
      expect(parsed.data.phase).toBe('gather');
      expect(parsed.data.runDir).toBe('/path/to/run');
      expect(parsed.data.status).toBe('ready');
    });

    it('should omit errors array from data on success', () => {
      /*
      Test Doc:
      - Why: Errors array is redundant on success (always empty)
      - Contract: data field does not include errors property
      - Usage Notes: Per DYK Insight #5 - use Omit<T, 'errors'> + runtime destructure
      - Quality Contribution: Clean JSON output without empty errors arrays
      - Worked Example: { phase: 'gather', errors: [] } → data: { phase: 'gather' }
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
      const parsed = JSON.parse(output);

      expect(parsed.data.errors).toBeUndefined();
      expect(parsed.data.phase).toBe('gather');
    });

    it('should include ISO timestamp', () => {
      /*
      Test Doc:
      - Why: Timestamps enable correlation and debugging
      - Contract: timestamp field is ISO 8601 formatted string
      - Usage Notes: Timestamp reflects when format() was called
      - Quality Contribution: Provides temporal context for log analysis
      - Worked Example: timestamp: "2026-01-22T14:30:00.000Z"
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
      const parsed = JSON.parse(output);

      expect(parsed.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);
    });

    it('should produce valid JSON', () => {
      /*
      Test Doc:
      - Why: JSON output must be machine-parseable
      - Contract: format() returns valid JSON string
      - Usage Notes: No extra text, no trailing characters
      - Quality Contribution: Enables reliable JSON parsing by agents
      - Worked Example: JSON.parse(output) does not throw
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
  });

  describe('error result formatting', () => {
    it('should format single error result', () => {
      /*
      Test Doc:
      - Why: Agents need actionable error details to fix issues
      - Contract: format() wraps errors in { success: false, error: { code, message, details } }
      - Usage Notes: Single error has message from first error
      - Quality Contribution: Enables autonomous agent error recovery
      - Worked Example: format(..., { errors: [{ code: 'E001', message: 'Missing input' }] }) → { success: false, error: { ... } }
      */
      const error: ResultError = {
        code: 'E001',
        path: 'run/inputs/files/user-request.md',
        message: 'Missing required input file',
        action: 'Create the file before running prepare',
      };

      const result: PrepareResult = {
        phase: 'gather',
        runDir: '/path/to/run',
        status: 'failed',
        inputs: { required: ['user-request.md'], resolved: [] },
        copiedFromPrior: [],
        errors: [error],
      };

      const output = adapter.format('phase.prepare', result);
      const parsed = JSON.parse(output);

      expect(parsed.success).toBe(false);
      expect(parsed.error.code).toBe('E001');
      expect(parsed.error.message).toBe('Missing required input file');
      expect(parsed.error.action).toBe('Create the file before running prepare');
    });

    it('should format multiple errors', () => {
      /*
      Test Doc:
      - Why: Multiple errors may occur; all should be surfaced
      - Contract: error.details contains all errors; message indicates count
      - Usage Notes: Primary code/message from first error
      - Quality Contribution: Comprehensive error reporting
      - Worked Example: 3 errors → message: "3 errors occurred", details.length: 3
      */
      const errors: ResultError[] = [
        { code: 'E001', message: 'Missing file A', path: '/a.txt' },
        { code: 'E001', message: 'Missing file B', path: '/b.txt' },
        { code: 'E001', message: 'Missing file C', path: '/c.txt' },
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
      const parsed = JSON.parse(output);

      expect(parsed.success).toBe(false);
      expect(parsed.error.message).toBe('3 errors occurred');
      expect(parsed.error.details).toHaveLength(3);
    });

    it('should include expected/actual for validation errors', () => {
      /*
      Test Doc:
      - Why: Validation errors need expected/actual for agent to fix
      - Contract: error.details[].expected and error.details[].actual present when provided
      - Usage Notes: Only schema validation errors typically have these
      - Quality Contribution: Precise error context for autonomous fixes
      - Worked Example: { expected: "pending | active", actual: "invalid" }
      */
      const error: ResultError = {
        code: 'E012',
        path: '/status',
        message: 'Invalid enum value',
        expected: 'pending | active | complete',
        actual: 'invalid',
        action: 'Update status to use one of the allowed values',
      };

      const result: PrepareResult = {
        phase: 'gather',
        runDir: '/path/to/run',
        status: 'failed',
        inputs: { required: [], resolved: [] },
        copiedFromPrior: [],
        errors: [error],
      };

      const output = adapter.format('phase.prepare', result);
      const parsed = JSON.parse(output);

      expect(parsed.error.details[0].expected).toBe('pending | active | complete');
      expect(parsed.error.details[0].actual).toBe('invalid');
    });

    it('should not include data field on error', () => {
      /*
      Test Doc:
      - Why: Error responses should not have data (clarity)
      - Contract: data field is absent when success is false
      - Usage Notes: Error envelope has error field instead
      - Quality Contribution: Clear success/error distinction
      - Worked Example: { success: false, error: {...} } - no data key
      */
      const result: PrepareResult = {
        phase: 'gather',
        runDir: '/path/to/run',
        status: 'failed',
        inputs: { required: [], resolved: [] },
        copiedFromPrior: [],
        errors: [{ code: 'E001', message: 'Error' }],
      };

      const output = adapter.format('phase.prepare', result);
      const parsed = JSON.parse(output);

      expect(parsed.data).toBeUndefined();
      expect(parsed.error).toBeDefined();
    });
  });

  describe('command name handling', () => {
    it('should include command name in envelope', () => {
      /*
      Test Doc:
      - Why: Command name enables response routing and logging
      - Contract: command field matches the command parameter
      - Usage Notes: Use dotted notation (e.g., "phase.prepare")
      - Quality Contribution: Enables response correlation
      - Worked Example: format('wf.compose', ...) → command: "wf.compose"
      */
      const result: PrepareResult = {
        phase: 'gather',
        runDir: '/path/to/run',
        status: 'ready',
        inputs: { required: [], resolved: [] },
        copiedFromPrior: [],
        errors: [],
      };

      const output = adapter.format('wf.compose', result);
      const parsed = JSON.parse(output);

      expect(parsed.command).toBe('wf.compose');
    });
  });
});
