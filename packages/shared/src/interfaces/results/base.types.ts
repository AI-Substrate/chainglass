/**
 * Base result types for workflow operations.
 *
 * Per Critical Discovery 01: Services return domain result objects,
 * adapters format for output (JSON or Console).
 *
 * Per DYK Insight #1: ResultError relocated from @chainglass/workflow
 * to @chainglass/shared to avoid circular dependencies.
 */

/**
 * Actionable error for agent-friendly error messages.
 *
 * Per Critical Discovery 07: Errors must include actionable information.
 * Fields are optional per spec § JSON Output Framework - only include
 * what's relevant for the specific error type.
 */
export interface ResultError {
  /** Error code (E001, E010, E012, etc.) */
  code: string;
  /** JSON pointer to the invalid field (e.g., "/status", "/inputs/files/0") */
  path?: string;
  /** Human-readable error message */
  message: string;
  /** What was expected (e.g., "pending | active | complete") */
  expected?: string;
  /** What was actually provided */
  actual?: string;
  /** Specific fix instruction for the agent */
  action?: string;
}

/**
 * Base result interface for all service operations.
 *
 * The `errors` array determines success/failure:
 * - `errors.length === 0` → success
 * - `errors.length > 0` → failure
 *
 * All command-specific result types extend this interface.
 */
export interface BaseResult {
  /** Array of errors (empty = success) */
  errors: ResultError[];
}
