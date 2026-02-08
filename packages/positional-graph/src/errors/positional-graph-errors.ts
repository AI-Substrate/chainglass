import type { ResultError } from '@chainglass/shared';

// ============================================
// Error Code Constants
// ============================================

export const POSITIONAL_GRAPH_ERROR_CODES = {
  // Structure errors (E150-E156)
  E150: 'E150', // Line not found
  E151: 'E151', // Line not empty
  E152: 'E152', // Invalid line index
  E153: 'E153', // Node not found
  E154: 'E154', // Invalid node position
  E155: 'E155', // Duplicate node / unit not found
  E156: 'E156', // Cannot remove last line
  E157: 'E157', // Graph not found
  E158: 'E158', // Graph already exists
  E159: 'E159', // WorkUnit not found

  // Input resolution errors (E160-E164)
  E160: 'E160', // Input not declared
  E161: 'E161', // Predecessor not found
  E162: 'E162', // Ambiguous predecessor
  E163: 'E163', // Output not declared
  E164: 'E164', // Invalid ordinal

  // Status errors (E170-E171)
  E170: 'E170', // Node not ready
  E171: 'E171', // Transition blocked

  // Execution lifecycle errors (E172-E179)
  E172: 'E172', // Invalid state transition
  E173: 'E173', // Question not found
  // E174 removed - output overwrites are allowed per spec clarification Q5
  E175: 'E175', // Output not found
  E176: 'E176', // Node not running
  E177: 'E177', // Node not waiting
  E178: 'E178', // Input not available
  E179: 'E179', // File not found

  // Node event system errors (E190-E197) — Plan 032
  E190: 'E190', // Event type not found
  E191: 'E191', // Event payload validation failed
  E192: 'E192', // Event source not allowed
  E193: 'E193', // Event state transition invalid
  E194: 'E194', // Question event not found (for answer)
  E195: 'E195', // Question already answered
  E196: 'E196', // Event not found
  E197: 'E197', // Invalid JSON payload
} as const;

export type PositionalGraphErrorCode = keyof typeof POSITIONAL_GRAPH_ERROR_CODES;

// ============================================
// Structure Error Factories (E150-E156)
// ============================================

export function lineNotFoundError(lineId: string): ResultError {
  return {
    code: POSITIONAL_GRAPH_ERROR_CODES.E150,
    message: `Line '${lineId}' not found in graph`,
    action: 'Check available lines with: cg wf show <slug>',
  };
}

export function lineNotEmptyError(lineId: string, nodeIds: string[]): ResultError {
  return {
    code: POSITIONAL_GRAPH_ERROR_CODES.E151,
    message: `Line '${lineId}' contains ${nodeIds.length} node(s): ${nodeIds.join(', ')}`,
    action: 'Remove all nodes first, or use --cascade to remove line and its nodes',
  };
}

export function invalidLineIndexError(index: number, maxIndex: number): ResultError {
  return {
    code: POSITIONAL_GRAPH_ERROR_CODES.E152,
    message: `Line index ${index} is out of range (0-${maxIndex})`,
    expected: `0 to ${maxIndex}`,
    actual: String(index),
    action: 'Use a valid line index within the graph',
  };
}

export function nodeNotFoundError(nodeId: string): ResultError {
  return {
    code: POSITIONAL_GRAPH_ERROR_CODES.E153,
    message: `Node '${nodeId}' not found in graph`,
    action: 'Check available nodes with: cg wf show <slug>',
  };
}

export function invalidNodePositionError(position: number, maxPosition: number): ResultError {
  return {
    code: POSITIONAL_GRAPH_ERROR_CODES.E154,
    message: `Node position ${position} is out of range (0-${maxPosition})`,
    expected: `0 to ${maxPosition}`,
    actual: String(position),
    action: 'Use a valid position within the line',
  };
}

export function duplicateNodeError(nodeId: string): ResultError {
  return {
    code: POSITIONAL_GRAPH_ERROR_CODES.E155,
    message: `Node '${nodeId}' already exists in graph`,
    action: 'Each node ID must be unique within the graph',
  };
}

export function cannotRemoveLastLineError(): ResultError {
  return {
    code: POSITIONAL_GRAPH_ERROR_CODES.E156,
    message: 'Cannot remove the last line — a graph must have at least one line',
    action: 'Add another line before removing this one',
  };
}

export function graphNotFoundError(slug: string): ResultError {
  return {
    code: POSITIONAL_GRAPH_ERROR_CODES.E157,
    message: `Graph '${slug}' not found`,
    action: 'Check available graphs with: cg wf list',
  };
}

export function graphAlreadyExistsError(slug: string): ResultError {
  return {
    code: POSITIONAL_GRAPH_ERROR_CODES.E158,
    message: `Graph '${slug}' already exists`,
    action: 'Use a different slug or delete the existing graph first',
  };
}

export function unitNotFoundError(unitSlug: string): ResultError {
  return {
    code: POSITIONAL_GRAPH_ERROR_CODES.E159,
    message: `WorkUnit '${unitSlug}' not found`,
    action: 'Check available units with: cg unit list',
  };
}

// ============================================
// Input Resolution Error Factories (E160-E164)
// ============================================

export function inputNotDeclaredError(inputName: string, nodeId: string): ResultError {
  return {
    code: POSITIONAL_GRAPH_ERROR_CODES.E160,
    message: `Input '${inputName}' is not declared on node '${nodeId}'`,
    action: 'Check the WorkUnit definition for valid input names',
  };
}

export function predecessorNotFoundError(unitSlug: string, nodeId: string): ResultError {
  return {
    code: POSITIONAL_GRAPH_ERROR_CODES.E161,
    message: `No predecessor with unit slug '${unitSlug}' found for node '${nodeId}'`,
    action: 'Ensure the referenced unit exists on a preceding line',
  };
}

export function ambiguousPredecessorError(
  unitSlug: string,
  matchingNodeIds: string[]
): ResultError {
  return {
    code: POSITIONAL_GRAPH_ERROR_CODES.E162,
    message: `Multiple predecessors match unit slug '${unitSlug}': ${matchingNodeIds.join(', ')}`,
    action: 'Use ordinal disambiguation (e.g., from_unit: "slug:2") or from_node with explicit ID',
  };
}

export function outputNotDeclaredError(outputName: string, unitSlug: string): ResultError {
  return {
    code: POSITIONAL_GRAPH_ERROR_CODES.E163,
    message: `Output '${outputName}' is not declared on unit '${unitSlug}'`,
    action: 'Check the WorkUnit definition for valid output names',
  };
}

export function invalidOrdinalError(
  ordinal: number,
  unitSlug: string,
  maxOrdinal: number
): ResultError {
  return {
    code: POSITIONAL_GRAPH_ERROR_CODES.E164,
    message: `Ordinal ${ordinal} for unit '${unitSlug}' is out of range (1-${maxOrdinal})`,
    expected: `1 to ${maxOrdinal}`,
    actual: String(ordinal),
    action: 'Use a valid ordinal number',
  };
}

// ============================================
// Status Error Factories (E170-E171)
// ============================================

export function nodeNotReadyError(nodeId: string, reason: string): ResultError {
  return {
    code: POSITIONAL_GRAPH_ERROR_CODES.E170,
    message: `Node '${nodeId}' is not ready to run: ${reason}`,
    action: 'Check node status with: cg wf status <slug> --node <nodeId>',
  };
}

export function transitionBlockedError(lineId: string): ResultError {
  return {
    code: POSITIONAL_GRAPH_ERROR_CODES.E171,
    message: `Transition to line '${lineId}' is blocked — manual trigger required`,
    action: `Trigger transition with: cg wf trigger <slug> ${lineId}`,
  };
}

// ============================================
// Execution Lifecycle Error Factories (E172-E179)
// ============================================

export function invalidStateTransitionError(
  nodeId: string,
  fromState: string,
  toState: string
): ResultError {
  return {
    code: POSITIONAL_GRAPH_ERROR_CODES.E172,
    message: `Invalid state transition for node '${nodeId}': ${fromState} -> ${toState}`,
    action: 'Check node status with: cg wf status <slug> --node <nodeId>',
  };
}

export function questionNotFoundError(questionId: string): ResultError {
  return {
    code: POSITIONAL_GRAPH_ERROR_CODES.E173,
    message: `Question not found: ${questionId}`,
    action: 'Verify question ID and check node state for pending questions',
  };
}

export function outputNotFoundError(outputName: string, nodeId: string): ResultError {
  return {
    code: POSITIONAL_GRAPH_ERROR_CODES.E175,
    message: `Output '${outputName}' not found for node '${nodeId}'`,
    action:
      'Save the output first using: cg wf node save-output-data or cg wf node save-output-file',
  };
}

export function nodeNotRunningError(nodeId: string): ResultError {
  return {
    code: POSITIONAL_GRAPH_ERROR_CODES.E176,
    message: `Node '${nodeId}' is not in running state`,
    action: 'Start node first with: cg wf node start <slug> <nodeId>',
  };
}

export function nodeNotWaitingError(nodeId: string): ResultError {
  return {
    code: POSITIONAL_GRAPH_ERROR_CODES.E177,
    message: `Node '${nodeId}' is not waiting for an answer`,
    action: 'Node must be in waiting-question state to receive an answer',
  };
}

export function inputNotAvailableError(inputName: string, reason: string): ResultError {
  return {
    code: POSITIONAL_GRAPH_ERROR_CODES.E178,
    message: `Input '${inputName}' not available: ${reason}`,
    action: 'Wait for source node to complete, then retry',
  };
}

export function fileNotFoundError(sourcePath: string, reason?: string): ResultError {
  const message = reason
    ? `File error for '${sourcePath}': ${reason}`
    : `Source file not found: ${sourcePath}`;
  return {
    code: POSITIONAL_GRAPH_ERROR_CODES.E179,
    message,
    action: 'Verify file path exists and is accessible',
  };
}
