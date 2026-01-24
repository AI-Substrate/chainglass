/**
 * Output adapter interface for formatting service results.
 *
 * Per Critical Discovery 01: Services return domain result objects,
 * adapters format for output (JSON or Console).
 *
 * Implementations:
 * - JsonOutputAdapter: Wraps in CommandResponse<T> envelope
 * - ConsoleOutputAdapter: Produces human-readable text with icons
 * - FakeOutputAdapter: Captures output for test assertions
 */

import type { BaseResult, ResultError } from './results/index.js';

/**
 * JSON response envelope for successful operations.
 *
 * Per spec § JSON Output Framework.
 */
export interface CommandResponseSuccess<T extends BaseResult> {
  /** Always true for success */
  success: true;
  /** Command that was executed (e.g., "phase.prepare") */
  command: string;
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Result data with errors array omitted */
  data: Omit<T, 'errors'>;
}

/**
 * Error detail in JSON error response.
 */
export interface ErrorDetail {
  /** Primary error code */
  code: string;
  /** Summary message (single error) or count message (multiple) */
  message: string;
  /** Suggested action to fix */
  action?: string;
  /** All individual errors */
  details: ResultError[];
}

/**
 * JSON response envelope for failed operations.
 *
 * Per spec § JSON Output Framework.
 */
export interface CommandResponseError {
  /** Always false for failure */
  success: false;
  /** Command that was executed */
  command: string;
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Error information */
  error: ErrorDetail;
}

/**
 * Union type for command response envelope.
 */
export type CommandResponse<T extends BaseResult> =
  | CommandResponseSuccess<T>
  | CommandResponseError;

/**
 * Output adapter interface.
 *
 * Transforms domain result objects into formatted output strings.
 * Selection between JSON and Console is done via DI based on --json flag.
 */
export interface IOutputAdapter {
  /**
   * Format a command result for output.
   *
   * @param command - Command name (e.g., "phase.prepare", "wf.compose")
   * @param result - Domain result object from service
   * @returns Formatted string (JSON or human-readable)
   */
  format<T extends BaseResult>(command: string, result: T): string;
}
