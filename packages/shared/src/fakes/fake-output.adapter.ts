/**
 * Fake output adapter for testing.
 *
 * Per Critical Discovery 01: Services return domain result objects,
 * adapters format for output (JSON or Console).
 *
 * This fake captures formatted output for test assertions.
 * Follows the established fake pattern from FakeFileSystem, FakeYamlParser, etc.
 */

import type { BaseResult, IOutputAdapter } from '../interfaces/index.js';

/**
 * Recorded format call for test inspection.
 */
export interface FormattedResult<T extends BaseResult = BaseResult> {
  /** Command name passed to format() */
  command: string;
  /** Result object passed to format() */
  result: T;
  /** Output string returned from format() */
  output: string;
}

/**
 * Fake output adapter for testing.
 *
 * Captures all format() calls for inspection.
 * Can be configured with preset outputs or use default JSON formatting.
 */
export class FakeOutputAdapter implements IOutputAdapter {
  /** Recorded format calls */
  private calls: FormattedResult[] = [];

  /** Preset output for specific commands */
  private presetOutputs = new Map<string, string>();

  /** Use JSON format by default (for deterministic output) */
  private useJsonFormat = true;

  // ==================== Test Helpers ====================

  /**
   * Get the last formatted output (test helper).
   *
   * @returns Last output string, or null if no calls made
   */
  getLastOutput(): string | null {
    return this.calls.length > 0 ? this.calls[this.calls.length - 1].output : null;
  }

  /**
   * Get the last command name (test helper).
   *
   * @returns Last command string, or null if no calls made
   */
  getLastCommand(): string | null {
    return this.calls.length > 0 ? this.calls[this.calls.length - 1].command : null;
  }

  /**
   * Get all formatted results in order (test helper).
   *
   * @returns Array of all recorded format calls
   */
  getFormattedResults(): FormattedResult[] {
    return [...this.calls];
  }

  /**
   * Get number of format calls (test helper).
   */
  getCallCount(): number {
    return this.calls.length;
  }

  /**
   * Set a preset output for a specific command (test helper).
   *
   * When format() is called with this command, it returns the preset output.
   */
  setPresetOutput(command: string, output: string): void {
    this.presetOutputs.set(command, output);
  }

  /**
   * Configure whether to use JSON format for default output (test helper).
   *
   * @param use - If true, use JSON; if false, use simple string
   */
  setUseJsonFormat(use: boolean): void {
    this.useJsonFormat = use;
  }

  /**
   * Reset all state (test helper).
   */
  reset(): void {
    this.calls = [];
    this.presetOutputs.clear();
    this.useJsonFormat = true;
  }

  // ==================== IOutputAdapter Implementation ====================

  /**
   * Format a command result for output.
   *
   * Captures the call and returns either:
   * - Preset output (if configured for this command)
   * - JSON-formatted output (if useJsonFormat is true)
   * - Simple string output (otherwise)
   */
  format<T extends BaseResult>(command: string, result: T): string {
    // Check for preset output
    const presetOutput = this.presetOutputs.get(command);
    if (presetOutput !== undefined) {
      this.calls.push({ command, result, output: presetOutput });
      return presetOutput;
    }

    // Generate default output
    const output = this.useJsonFormat
      ? this.formatAsJson(command, result)
      : this.formatAsSimple(command, result);

    this.calls.push({ command, result, output });
    return output;
  }

  /**
   * Format as JSON (mimics JsonOutputAdapter behavior).
   */
  private formatAsJson<T extends BaseResult>(command: string, result: T): string {
    const success = result.errors.length === 0;
    return JSON.stringify({
      success,
      command,
      timestamp: new Date().toISOString(),
      ...(success
        ? { data: this.omitErrors(result) }
        : {
            error: {
              code: result.errors[0]?.code || 'ERROR',
              message: result.errors[0]?.message || 'Error',
            },
          }),
    });
  }

  /**
   * Format as simple string.
   */
  private formatAsSimple<T extends BaseResult>(command: string, result: T): string {
    const success = result.errors.length === 0;
    return success
      ? `[FAKE] ${command}: SUCCESS`
      : `[FAKE] ${command}: FAILED - ${result.errors[0]?.message || 'Error'}`;
  }

  /**
   * Remove errors array from result.
   */
  private omitErrors<T extends BaseResult>(result: T): Omit<T, 'errors'> {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { errors, ...data } = result;
    return data as Omit<T, 'errors'>;
  }
}
