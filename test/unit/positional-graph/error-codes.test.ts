import {
  POSITIONAL_GRAPH_ERROR_CODES,
  ambiguousPredecessorError,
  cannotRemoveLastLineError,
  duplicateNodeError,
  graphAlreadyExistsError,
  graphNotFoundError,
  inputNotDeclaredError,
  invalidLineIndexError,
  invalidNodePositionError,
  invalidOrdinalError,
  lineNotEmptyError,
  lineNotFoundError,
  nodeNotFoundError,
  nodeNotReadyError,
  outputNotDeclaredError,
  predecessorNotFoundError,
  transitionBlockedError,
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

describe('POSITIONAL_GRAPH_ERROR_CODES', () => {
  it('defines structure error codes E150-E158', () => {
    expect(POSITIONAL_GRAPH_ERROR_CODES.E150).toBe('E150');
    expect(POSITIONAL_GRAPH_ERROR_CODES.E151).toBe('E151');
    expect(POSITIONAL_GRAPH_ERROR_CODES.E152).toBe('E152');
    expect(POSITIONAL_GRAPH_ERROR_CODES.E153).toBe('E153');
    expect(POSITIONAL_GRAPH_ERROR_CODES.E154).toBe('E154');
    expect(POSITIONAL_GRAPH_ERROR_CODES.E155).toBe('E155');
    expect(POSITIONAL_GRAPH_ERROR_CODES.E156).toBe('E156');
    expect(POSITIONAL_GRAPH_ERROR_CODES.E157).toBe('E157');
    expect(POSITIONAL_GRAPH_ERROR_CODES.E158).toBe('E158');
  });

  it('defines input resolution error codes E160-E164', () => {
    expect(POSITIONAL_GRAPH_ERROR_CODES.E160).toBe('E160');
    expect(POSITIONAL_GRAPH_ERROR_CODES.E161).toBe('E161');
    expect(POSITIONAL_GRAPH_ERROR_CODES.E162).toBe('E162');
    expect(POSITIONAL_GRAPH_ERROR_CODES.E163).toBe('E163');
    expect(POSITIONAL_GRAPH_ERROR_CODES.E164).toBe('E164');
  });

  it('defines status error codes E170-E171', () => {
    expect(POSITIONAL_GRAPH_ERROR_CODES.E170).toBe('E170');
    expect(POSITIONAL_GRAPH_ERROR_CODES.E171).toBe('E171');
  });
});

// ============================================
// Structure Error Factories (E150-E156)
// ============================================

describe('Structure error factories', () => {
  it('E150: lineNotFoundError', () => {
    const error = lineNotFoundError('line-a4f');
    expectResultError(error, 'E150');
    expect(error.message).toContain('line-a4f');
  });

  it('E151: lineNotEmptyError', () => {
    const error = lineNotEmptyError('line-b7e', ['node-a3f', 'node-c4d']);
    expectResultError(error, 'E151');
    expect(error.message).toContain('line-b7e');
  });

  it('E152: invalidLineIndexError', () => {
    const error = invalidLineIndexError(5, 3);
    expectResultError(error, 'E152');
    expect(error.message).toContain('5');
  });

  it('E153: nodeNotFoundError', () => {
    const error = nodeNotFoundError('sample-coder-c4d');
    expectResultError(error, 'E153');
    expect(error.message).toContain('sample-coder-c4d');
  });

  it('E154: invalidNodePositionError', () => {
    const error = invalidNodePositionError(10, 3);
    expectResultError(error, 'E154');
    expect(error.message).toContain('10');
  });

  it('E155: duplicateNodeError', () => {
    const error = duplicateNodeError('sample-coder-c4d');
    expectResultError(error, 'E155');
    expect(error.message).toContain('sample-coder-c4d');
  });

  it('E156: cannotRemoveLastLineError', () => {
    const error = cannotRemoveLastLineError();
    expectResultError(error, 'E156');
  });

  it('E157: graphNotFoundError', () => {
    const error = graphNotFoundError('my-pipeline');
    expectResultError(error, 'E157');
    expect(error.message).toContain('my-pipeline');
  });

  it('E158: graphAlreadyExistsError', () => {
    const error = graphAlreadyExistsError('my-pipeline');
    expectResultError(error, 'E158');
    expect(error.message).toContain('my-pipeline');
  });
});

// ============================================
// Input Resolution Error Factories (E160-E164)
// ============================================

describe('Input resolution error factories', () => {
  it('E160: inputNotDeclaredError', () => {
    const error = inputNotDeclaredError('spec', 'sample-coder-c4d');
    expectResultError(error, 'E160');
    expect(error.message).toContain('spec');
  });

  it('E161: predecessorNotFoundError', () => {
    const error = predecessorNotFoundError('research-concept', 'sample-coder-c4d');
    expectResultError(error, 'E161');
    expect(error.message).toContain('research-concept');
  });

  it('E162: ambiguousPredecessorError', () => {
    const error = ambiguousPredecessorError('research-concept', [
      'research-concept-a3f',
      'research-concept-b7e',
    ]);
    expectResultError(error, 'E162');
    expect(error.message).toContain('research-concept');
  });

  it('E163: outputNotDeclaredError', () => {
    const error = outputNotDeclaredError('summary', 'research-concept');
    expectResultError(error, 'E163');
    expect(error.message).toContain('summary');
  });

  it('E164: invalidOrdinalError', () => {
    const error = invalidOrdinalError(5, 'research-concept', 2);
    expectResultError(error, 'E164');
    expect(error.message).toContain('5');
  });
});

// ============================================
// Status Error Factories (E170-E171)
// ============================================

describe('Status error factories', () => {
  it('E170: nodeNotReadyError', () => {
    const error = nodeNotReadyError('sample-coder-c4d', 'inputs not available');
    expectResultError(error, 'E170');
    expect(error.message).toContain('sample-coder-c4d');
  });

  it('E171: transitionBlockedError', () => {
    const error = transitionBlockedError('line-c8b');
    expectResultError(error, 'E171');
    expect(error.message).toContain('line-c8b');
  });
});

// ============================================
// All factories return proper ResultError shape
// ============================================

describe('All error factories return ResultError shape', () => {
  const allErrors: ResultError[] = [
    lineNotFoundError('line-a4f'),
    lineNotEmptyError('line-b7e', ['n1']),
    invalidLineIndexError(5, 3),
    nodeNotFoundError('node-a3f'),
    invalidNodePositionError(10, 3),
    duplicateNodeError('node-a3f'),
    cannotRemoveLastLineError(),
    graphNotFoundError('my-pipeline'),
    graphAlreadyExistsError('my-pipeline'),
    inputNotDeclaredError('spec', 'node-a3f'),
    predecessorNotFoundError('unit', 'node-a3f'),
    ambiguousPredecessorError('unit', ['n1', 'n2']),
    outputNotDeclaredError('out', 'unit'),
    invalidOrdinalError(5, 'unit', 2),
    nodeNotReadyError('node-a3f', 'reason'),
    transitionBlockedError('line-a4f'),
  ];

  it('all 16 factories produce ResultError with code and message', () => {
    expect(allErrors).toHaveLength(16);
    for (const error of allErrors) {
      expect(error.code).toBeTruthy();
      expect(error.message).toBeTruthy();
    }
  });
});
