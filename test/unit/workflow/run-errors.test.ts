/**
 * Tests for run error classes (E050-E059).
 *
 * Per DYK-05: E050-E059 range reserved for run errors (E040-E049 used by InitService).
 */

import {
  InvalidRunStatusError,
  RunCorruptError,
  RunErrorCodes,
  RunNotFoundError,
  RunsDirNotFoundError,
} from '@chainglass/workflow';
import { describe, expect, it } from 'vitest';

describe('RunErrorCodes', () => {
  it('should have correct error codes in E050-E059 range', () => {
    /*
    Test Doc:
    - Why: Error codes must be in reserved range per DYK-05
    - Contract: All codes start with E05
    - Usage Notes: Used by cg runs commands for error classification
    - Quality Contribution: Ensures no collision with other error ranges
    - Worked Example: RUN_NOT_FOUND = 'E050'
    */
    expect(RunErrorCodes.RUN_NOT_FOUND).toBe('E050');
    expect(RunErrorCodes.RUNS_DIR_NOT_FOUND).toBe('E051');
    expect(RunErrorCodes.INVALID_RUN_STATUS).toBe('E052');
    expect(RunErrorCodes.RUN_CORRUPT).toBe('E053');
  });
});

describe('RunNotFoundError', () => {
  it('should create error with runId and path', () => {
    const error = new RunNotFoundError('run-2026-01-25-001', '/path/to/runs/run-2026-01-25-001');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(RunNotFoundError);
    expect(error.runId).toBe('run-2026-01-25-001');
    expect(error.path).toBe('/path/to/runs/run-2026-01-25-001');
    expect(error.code).toBe('E050');
    expect(error.name).toBe('RunNotFoundError');
    expect(error.message).toBe(
      "Run 'run-2026-01-25-001' not found at /path/to/runs/run-2026-01-25-001"
    );
  });
});

describe('RunsDirNotFoundError', () => {
  it('should create error with workflowSlug and path', () => {
    const error = new RunsDirNotFoundError('hello-wf', '/path/to/runs');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(RunsDirNotFoundError);
    expect(error.workflowSlug).toBe('hello-wf');
    expect(error.path).toBe('/path/to/runs');
    expect(error.code).toBe('E051');
    expect(error.name).toBe('RunsDirNotFoundError');
    expect(error.message).toBe("No runs directory found for workflow 'hello-wf' at /path/to/runs");
  });
});

describe('InvalidRunStatusError', () => {
  it('should create error with status details', () => {
    const validStatuses = ['pending', 'active', 'complete', 'failed'] as const;
    const error = new InvalidRunStatusError('run-001', 'invalid-status', validStatuses);

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(InvalidRunStatusError);
    expect(error.runId).toBe('run-001');
    expect(error.actualStatus).toBe('invalid-status');
    expect(error.validStatuses).toEqual(validStatuses);
    expect(error.code).toBe('E052');
    expect(error.name).toBe('InvalidRunStatusError');
    expect(error.message).toContain("invalid status 'invalid-status'");
    expect(error.message).toContain('pending, active, complete, failed');
  });
});

describe('RunCorruptError', () => {
  it('should create error with corruption reason', () => {
    const error = new RunCorruptError('run-001', '/path/to/run', 'Missing wf-status.json');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(RunCorruptError);
    expect(error.runId).toBe('run-001');
    expect(error.path).toBe('/path/to/run');
    expect(error.reason).toBe('Missing wf-status.json');
    expect(error.code).toBe('E053');
    expect(error.name).toBe('RunCorruptError');
    expect(error.message).toBe("Run 'run-001' at /path/to/run is corrupt: Missing wf-status.json");
  });
});
