/**
 * Execution Lifecycle Error Codes (E172-E179)
 *
 * Purpose: Tests for error factory functions used in execution lifecycle operations.
 * These error codes enable agents to receive structured, actionable error messages
 * when state transitions fail, outputs are missing, or questions cannot be resolved.
 *
 * Error Code Range:
 * - E172: InvalidStateTransition
 * - E173: QuestionNotFound
 * - E175: OutputNotFound (E174 removed - overwrites allowed)
 * - E176: NodeNotRunning
 * - E177: NodeNotWaiting
 * - E178: InputNotAvailable
 * - E179: FileNotFound
 */

import {
  POSITIONAL_GRAPH_ERROR_CODES,
  fileNotFoundError,
  inputNotAvailableError,
  invalidStateTransitionError,
  nodeNotRunningError,
  nodeNotWaitingError,
  outputNotFoundError,
  questionNotFoundError,
} from '@chainglass/positional-graph/errors';
import type { ResultError } from '@chainglass/shared';
import { describe, expect, it } from 'vitest';

function expectResultError(error: ResultError, code: string): void {
  expect(error.code).toBe(code);
  expect(error.message).toBeTruthy();
  expect(typeof error.message).toBe('string');
}

// ============================================
// Error Code Constants
// ============================================

describe('POSITIONAL_GRAPH_ERROR_CODES - Execution Lifecycle', () => {
  it('defines execution lifecycle error codes E172-E179 (excluding E174)', () => {
    expect(POSITIONAL_GRAPH_ERROR_CODES.E172).toBe('E172');
    expect(POSITIONAL_GRAPH_ERROR_CODES.E173).toBe('E173');
    // E174 removed - overwrites are allowed per spec clarification Q5
    expect(POSITIONAL_GRAPH_ERROR_CODES.E175).toBe('E175');
    expect(POSITIONAL_GRAPH_ERROR_CODES.E176).toBe('E176');
    expect(POSITIONAL_GRAPH_ERROR_CODES.E177).toBe('E177');
    expect(POSITIONAL_GRAPH_ERROR_CODES.E178).toBe('E178');
    expect(POSITIONAL_GRAPH_ERROR_CODES.E179).toBe('E179');
  });
});

// ============================================
// Execution Lifecycle Error Factories (E172-E179)
// ============================================

describe('Execution lifecycle error factories', () => {
  describe('E172: InvalidStateTransition', () => {
    it('includes from and to states in message', () => {
      /**
       * Purpose: Proves E172 error provides actionable transition context
       * Quality Contribution: Enables debugging of state machine violations
       * Acceptance Criteria: Error includes from state, to state, node ID
       */
      const error = invalidStateTransitionError('node-123', 'complete', 'starting');
      expectResultError(error, 'E172');
      expect(error.message).toContain('complete');
      expect(error.message).toContain('starting');
      expect(error.message).toContain('node-123');
    });

    it('provides action hint for recovery', () => {
      const error = invalidStateTransitionError('sample-coder-c4d', 'starting', 'starting');
      expect(error.action).toBeTruthy();
    });
  });

  describe('E173: QuestionNotFound', () => {
    it('includes question ID in message', () => {
      /**
       * Purpose: Proves question errors provide ID for debugging
       * Quality Contribution: Enables debugging of Q&A protocol issues
       * Acceptance Criteria: Error includes questionId
       */
      const error = questionNotFoundError('2026-02-03T10:32:00.000Z_f4e');
      expectResultError(error, 'E173');
      expect(error.message).toContain('2026-02-03T10:32:00.000Z_f4e');
    });

    it('provides action hint', () => {
      const error = questionNotFoundError('invalid-qid');
      expect(error.action).toBeTruthy();
    });
  });

  describe('E175: OutputNotFound', () => {
    it('includes output name in message', () => {
      /**
       * Purpose: Proves output errors provide name for debugging
       * Quality Contribution: Enables debugging of data flow issues
       * Acceptance Criteria: Error includes output name
       */
      const error = outputNotFoundError('script', 'node-123');
      expectResultError(error, 'E175');
      expect(error.message).toContain('script');
      expect(error.message).toContain('node-123');
    });

    it('provides action hint', () => {
      const error = outputNotFoundError('language', 'sample-coder-c4d');
      expect(error.action).toBeTruthy();
    });
  });

  describe('E176: NodeNotRunning', () => {
    it('includes node ID in message', () => {
      /**
       * Purpose: Proves status errors provide node ID for debugging
       * Quality Contribution: Enables debugging of status-dependent operations
       * Acceptance Criteria: Error includes nodeId
       */
      const error = nodeNotRunningError('sample-coder-c4d');
      expectResultError(error, 'E176');
      expect(error.message).toContain('sample-coder-c4d');
    });

    it('provides action hint', () => {
      const error = nodeNotRunningError('node-123');
      expect(error.action).toBeTruthy();
    });
  });

  describe('E177: NodeNotWaiting', () => {
    it('includes node ID in message', () => {
      /**
       * Purpose: Proves answer errors provide node ID for debugging
       * Quality Contribution: Enables debugging of Q&A protocol issues
       * Acceptance Criteria: Error includes nodeId
       */
      const error = nodeNotWaitingError('sample-coder-c4d');
      expectResultError(error, 'E177');
      expect(error.message).toContain('sample-coder-c4d');
    });

    it('provides action hint', () => {
      const error = nodeNotWaitingError('node-123');
      expect(error.action).toBeTruthy();
    });
  });

  describe('E178: InputNotAvailable', () => {
    it('includes input name and reason in message', () => {
      /**
       * Purpose: Proves input errors provide context for debugging
       * Quality Contribution: Enables debugging of data flow issues
       * Acceptance Criteria: Error includes inputName and reason
       */
      const error = inputNotAvailableError('spec', 'source node not complete');
      expectResultError(error, 'E178');
      expect(error.message).toContain('spec');
      expect(error.message).toContain('source node not complete');
    });

    it('provides action hint', () => {
      const error = inputNotAvailableError('language', 'source output missing');
      expect(error.action).toBeTruthy();
    });
  });

  describe('E179: FileNotFound', () => {
    it('includes source path in message', () => {
      /**
       * Purpose: Proves file errors provide path for debugging
       * Quality Contribution: Prevents confusion when files are missing
       * Acceptance Criteria: Error includes the missing path
       */
      const error = fileNotFoundError('/path/to/missing.txt');
      expectResultError(error, 'E179');
      expect(error.message).toContain('/path/to/missing.txt');
    });

    it('provides action hint', () => {
      const error = fileNotFoundError('./script.sh');
      expect(error.action).toBeTruthy();
    });
  });
});

// ============================================
// All new factories return proper ResultError shape
// ============================================

describe('All execution lifecycle error factories return ResultError shape', () => {
  const allErrors: ResultError[] = [
    invalidStateTransitionError('node-1', 'pending', 'starting'),
    questionNotFoundError('q-123'),
    outputNotFoundError('output-name', 'node-1'),
    nodeNotRunningError('node-1'),
    nodeNotWaitingError('node-1'),
    inputNotAvailableError('input-name', 'reason'),
    fileNotFoundError('/path/to/file'),
  ];

  it('all 7 new factories produce ResultError with code, message, and action', () => {
    expect(allErrors).toHaveLength(7);
    for (const error of allErrors) {
      expect(error.code).toBeTruthy();
      expect(error.message).toBeTruthy();
      expect(error.action).toBeTruthy();
    }
  });
});
