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
