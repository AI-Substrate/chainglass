/**
 * WorkGraph Error Codes.
 *
 * Per Discovery 09: E101-E149 range allocated for WorkGraph-specific errors.
 * All errors include actionable information for agent-friendly error handling.
 */

import type { ResultError } from '@chainglass/shared';

// ============================================
// Error Code Constants
// ============================================

/**
 * WorkGraph error codes (E101-E149).
 */
export const WORKGRAPH_ERROR_CODES = {
  // Graph errors (E101-E109)
  E101: 'E101', // Graph not found
  E102: 'E102', // Cannot remove node with dependents
  E103: 'E103', // Missing required inputs
  E104: 'E104', // Invalid graph slug format
  E105: 'E105', // Graph already exists
  E106: 'E106', // Invalid graph structure
  E107: 'E107', // Node not found in graph
  E108: 'E108', // Cycle detected
  E109: 'E109', // Graph validation failed

  // Node errors (E110-E119)
  E110: 'E110', // Cannot execute blocked node
  E111: 'E111', // Node already running
  E112: 'E112', // Node not in running state
  E113: 'E113', // Missing required outputs
  E114: 'E114', // Invalid node ID format
  E115: 'E115', // Node already complete
  E116: 'E116', // Dependent nodes affected
  E117: 'E117', // Input not available
  E118: 'E118', // Output not found
  E119: 'E119', // Node validation failed

  // Unit errors (E120-E129)
  E120: 'E120', // Unit not found
  E121: 'E121', // Invalid unit slug format
  E122: 'E122', // Unit already exists
  E123: 'E123', // Type mismatch
  E124: 'E124', // Missing required field
  E125: 'E125', // Invalid unit type
  E126: 'E126', // Unit validation failed
  E127: 'E127', // Prompt template not found
  E128: 'E128', // Script file not found
  E129: 'E129', // Invalid unit configuration

  // Schema errors (E130-E139)
  E130: 'E130', // YAML parse error
  E131: 'E131', // JSON parse error
  E132: 'E132', // Schema validation failed
  E133: 'E133', // Invalid datetime format
  E134: 'E134', // Invalid version format
  E135: 'E135', // Missing required property
  E136: 'E136', // Invalid enum value
  E137: 'E137', // Invalid pattern
  E138: 'E138', // Array constraint violation
  E139: 'E139', // Type constraint violation

  // I/O errors (E140-E149)
  E140: 'E140', // File not found
  E141: 'E141', // File read error
  E142: 'E142', // File write error
  E143: 'E143', // Directory not found
  E144: 'E144', // Directory creation failed
  E145: 'E145', // Path security violation
  E146: 'E146', // Atomic write failed
  E147: 'E147', // File already exists
  E148: 'E148', // Invalid file path
  E149: 'E149', // Permission denied
} as const;

export type WorkGraphErrorCode = keyof typeof WORKGRAPH_ERROR_CODES;

// ============================================
// Error Factory Functions
// ============================================

/**
 * Create a graph not found error.
 */
export function graphNotFoundError(slug: string): ResultError {
  return {
    code: WORKGRAPH_ERROR_CODES.E101,
    message: `Graph '${slug}' not found`,
    action: `Create the graph with: cg wg create ${slug}`,
  };
}

/**
 * Create a cannot remove node with dependents error.
 */
export function cannotRemoveWithDependentsError(nodeId: string, dependents: string[]): ResultError {
  return {
    code: WORKGRAPH_ERROR_CODES.E102,
    message: `Cannot remove node '${nodeId}' - has ${dependents.length} dependent(s): ${dependents.join(', ')}`,
    action: 'Use --cascade to remove dependents, or remove dependents first',
  };
}

/**
 * Create a missing required inputs error.
 */
export function missingRequiredInputsError(unitSlug: string, missingInputs: string[]): ResultError {
  return {
    code: WORKGRAPH_ERROR_CODES.E103,
    message: `Unit '${unitSlug}' requires inputs: ${missingInputs.join(', ')}`,
    action: 'Add a UserInputUnit before this node to provide the required inputs',
  };
}

/**
 * Create an invalid graph slug error.
 */
export function invalidGraphSlugError(slug: string): ResultError {
  return {
    code: WORKGRAPH_ERROR_CODES.E104,
    message: `Invalid graph slug: '${slug}'`,
    expected: 'lowercase with hyphens (e.g., my-workflow)',
    actual: slug,
    action: 'Use lowercase letters, numbers, and hyphens only',
  };
}

/**
 * Create a graph already exists error.
 */
export function graphAlreadyExistsError(slug: string): ResultError {
  return {
    code: WORKGRAPH_ERROR_CODES.E105,
    message: `Graph '${slug}' already exists`,
    action: 'Choose a different slug or delete the existing graph',
  };
}

/**
 * Create a node not found error.
 */
export function nodeNotFoundError(graphSlug: string, nodeId: string): ResultError {
  return {
    code: WORKGRAPH_ERROR_CODES.E107,
    message: `Node '${nodeId}' not found in graph '${graphSlug}'`,
    action: `Check available nodes with: cg wg show ${graphSlug}`,
  };
}

/**
 * Create a cycle detected error.
 */
export function cycleDetectedError(path: string[]): ResultError {
  return {
    code: WORKGRAPH_ERROR_CODES.E108,
    message: `Adding this edge would create a cycle: ${path.join(' → ')}`,
    action: 'WorkGraphs must be directed acyclic graphs (DAGs)',
  };
}

/**
 * Create a cannot execute blocked node error.
 */
export function cannotExecuteBlockedError(nodeId: string, blockingNodes: string[]): ResultError {
  return {
    code: WORKGRAPH_ERROR_CODES.E110,
    message: `Cannot execute '${nodeId}' - blocked by: ${blockingNodes.join(', ')}`,
    action: 'Complete the blocking nodes first',
  };
}

/**
 * Create a unit not found error.
 */
export function unitNotFoundError(slug: string): ResultError {
  return {
    code: WORKGRAPH_ERROR_CODES.E120,
    message: `Unit '${slug}' not found`,
    action: `Create the unit with: cg unit create ${slug} --type agent`,
  };
}

/**
 * Create an invalid unit slug error.
 */
export function invalidUnitSlugError(slug: string): ResultError {
  return {
    code: WORKGRAPH_ERROR_CODES.E121,
    message: `Invalid unit slug: '${slug}'`,
    expected: 'lowercase with hyphens (e.g., my-unit)',
    actual: slug,
    action: 'Use lowercase letters, numbers, and hyphens only',
  };
}

/**
 * Create a unit already exists error.
 */
export function unitAlreadyExistsError(slug: string): ResultError {
  return {
    code: WORKGRAPH_ERROR_CODES.E122,
    message: `Unit '${slug}' already exists`,
    action: 'Choose a different slug or delete the existing unit',
  };
}

/**
 * Create a type mismatch error.
 */
export function typeMismatchError(
  outputName: string,
  expectedType: string,
  actualType: string
): ResultError {
  return {
    code: WORKGRAPH_ERROR_CODES.E123,
    message: `Type mismatch for output '${outputName}'`,
    expected: expectedType,
    actual: actualType,
    action: 'Ensure the output value matches the declared type',
  };
}

/**
 * Create a YAML parse error.
 */
export function yamlParseError(path: string, message: string): ResultError {
  return {
    code: WORKGRAPH_ERROR_CODES.E130,
    path,
    message: `YAML parse error: ${message}`,
    action: 'Check the YAML syntax',
  };
}

/**
 * Create a schema validation error.
 */
export function schemaValidationError(
  path: string,
  message: string,
  expected?: string,
  actual?: string
): ResultError {
  return {
    code: WORKGRAPH_ERROR_CODES.E132,
    path,
    message,
    expected,
    actual,
    action: 'Fix the validation error and try again',
  };
}

/**
 * Create a file not found error.
 */
export function fileNotFoundError(path: string): ResultError {
  return {
    code: WORKGRAPH_ERROR_CODES.E140,
    path,
    message: `File not found: ${path}`,
    action: 'Check the file path and ensure the file exists',
  };
}

/**
 * Create a path traversal error.
 * Per Discovery 10: Reject paths containing '..' for security.
 */
export function pathTraversalError(path: string): ResultError {
  return {
    code: WORKGRAPH_ERROR_CODES.E145,
    path,
    message: `Path security violation: '${path}' contains path traversal`,
    action: 'File paths must not contain ".." components',
  };
}

/**
 * Create error for unimplemented features.
 * Per CD02: Methods should return errors, not throw.
 *
 * @param feature - Feature name (e.g., 'addNodeAfter')
 * @param targetPhase - Phase where feature will be implemented
 * @returns ResultError with code E199
 */
export function unimplementedFeatureError(feature: string, targetPhase: string): ResultError {
  return {
    code: 'E199',
    message: `Feature '${feature}' is not yet implemented. Planned for ${targetPhase}.`,
    action: `Wait for ${targetPhase} implementation or check plan for timeline.`,
  };
}

// ============================================
// Error Index Export
// ============================================

export const errors = {
  index: {
    graphNotFoundError,
    cannotRemoveWithDependentsError,
    missingRequiredInputsError,
    invalidGraphSlugError,
    graphAlreadyExistsError,
    nodeNotFoundError,
    cycleDetectedError,
    cannotExecuteBlockedError,
    unitNotFoundError,
    invalidUnitSlugError,
    unitAlreadyExistsError,
    typeMismatchError,
    yamlParseError,
    schemaValidationError,
    fileNotFoundError,
    pathTraversalError,
    unimplementedFeatureError,
  },
};
