/**
 * JSON output adapter for formatting service results.
 *
 * Per Critical Discovery 01: Services return domain result objects,
 * adapters format for output (JSON or Console).
 *
 * Wraps results in CommandResponse<T> envelope with:
 * - success: true/false based on errors array
 * - command: Command name from caller
 * - timestamp: ISO 8601 formatted
 * - data: Result without errors (on success)
 * - error: Error details (on failure)
 */

import type {
  BaseResult,
  CommandResponseError,
  CommandResponseSuccess,
  ErrorDetail,
  IOutputAdapter,
  ResultError,
} from '../interfaces/index.js';

/**
 * Formats service results as JSON with CommandResponse envelope.
 *
 * Used when --json flag is passed to CLI commands.
 */
export class JsonOutputAdapter implements IOutputAdapter {
  private readonly indent: number | undefined;

  constructor(pretty?: boolean) {
    this.indent = pretty ? 2 : undefined;
  }

  /**
   * Format a command result as JSON.
   *
   * @param command - Command name (e.g., "phase.prepare")
   * @param result - Domain result object from service
   * @returns JSON string with CommandResponse envelope
   */
  format<T extends BaseResult>(command: string, result: T): string {
    const success = result.errors.length === 0;
    const timestamp = new Date().toISOString();

    if (success) {
      const response: CommandResponseSuccess<T> = {
        success: true,
        command,
        timestamp,
        data: this.omitErrors(result),
      };
      return JSON.stringify(response, null, this.indent);
    }
    const response: CommandResponseError = {
      success: false,
      command,
      timestamp,
      error: this.formatErrors(result.errors),
    };
    return JSON.stringify(response, null, this.indent);
  }

  /**
   * Remove errors array from result for data field.
   *
   * Per DYK Insight #5: Use Omit<T, 'errors'> type + runtime destructure.
   * The cast is safe because we're just removing a known property.
   */
  private omitErrors<T extends BaseResult>(result: T): Omit<T, 'errors'> {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { errors, ...data } = result;
    return data as Omit<T, 'errors'>;
  }

  /**
   * Format errors into ErrorDetail structure.
   *
   * Single error: message from that error
   * Multiple errors: count message
   */
  private formatErrors(errors: ResultError[]): ErrorDetail {
    const firstError = errors[0];

    return {
      code: firstError.code,
      message: errors.length === 1 ? firstError.message : `${errors.length} errors occurred`,
      action: firstError.action,
      details: errors,
    };
  }
}
