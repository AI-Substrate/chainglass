import type { IYamlParser } from '../interfaces/yaml-parser.interface.js';
import type { YamlParseError } from '../interfaces/yaml-parser.interface.js';

/**
 * Fake YAML parser for testing.
 *
 * Per Discovery 08: Fakes need call capture for testing.
 * This fake captures all parse() and stringify() calls and can be
 * configured with preset results or errors.
 */
export class FakeYamlParser implements IYamlParser {
  /** Captured parse calls */
  private parseCalls: Array<{ content: string; filePath: string; result: unknown }> = [];
  /** Captured stringify calls */
  private stringifyCalls: Array<{ data: unknown; result: string }> = [];

  /** Preset parse results by content */
  private presetParseResults = new Map<string, unknown>();
  /** Preset parse errors by content */
  private presetParseErrors = new Map<string, YamlParseError>();
  /** Preset stringify results by JSON of data */
  private presetStringifyResults = new Map<string, string>();

  // ==================== Test Helpers ====================

  /**
   * Set a preset parse result for specific content.
   */
  setPresetParseResult(content: string, result: unknown): void {
    this.presetParseResults.set(content, result);
    this.presetParseErrors.delete(content);
  }

  /**
   * Set a preset parse error for specific content.
   */
  setPresetParseError(content: string, error: YamlParseError): void {
    this.presetParseErrors.set(content, error);
    this.presetParseResults.delete(content);
  }

  /**
   * Set a preset stringify result for specific data.
   */
  setPresetStringifyResult(data: unknown, result: string): void {
    this.presetStringifyResults.set(JSON.stringify(data), result);
  }

  /**
   * Get all parse calls.
   */
  getParseCalls(): Array<{ content: string; filePath: string; result: unknown }> {
    return [...this.parseCalls];
  }

  /**
   * Get all stringify calls.
   */
  getStringifyCalls(): Array<{ data: unknown; result: string }> {
    return [...this.stringifyCalls];
  }

  /**
   * Reset all state.
   */
  reset(): void {
    this.parseCalls = [];
    this.stringifyCalls = [];
    this.presetParseResults.clear();
    this.presetParseErrors.clear();
    this.presetStringifyResults.clear();
  }

  // ==================== IYamlParser Implementation ====================

  parse<T = unknown>(content: string, filePath: string): T {
    // Check for preset error
    const error = this.presetParseErrors.get(content);
    if (error) {
      throw error;
    }

    // Check for preset result
    const presetResult = this.presetParseResults.get(content);
    if (presetResult !== undefined) {
      this.parseCalls.push({ content, filePath, result: presetResult });
      return presetResult as T;
    }

    // Default behavior: try to parse as JSON (simple approximation of YAML)
    // Real YAML parsing would require the yaml package
    try {
      // Try JSON first for simple cases
      const result = JSON.parse(content) as T;
      this.parseCalls.push({ content, filePath, result });
      return result;
    } catch {
      // For fake, treat non-JSON as an empty object
      const result = {} as T;
      this.parseCalls.push({ content, filePath, result });
      return result;
    }
  }

  stringify(data: unknown): string {
    // Check for preset result
    const key = JSON.stringify(data);
    const presetResult = this.presetStringifyResults.get(key);
    if (presetResult !== undefined) {
      this.stringifyCalls.push({ data, result: presetResult });
      return presetResult;
    }

    // Default behavior: JSON stringify (simple approximation of YAML)
    const result = JSON.stringify(data, null, 2);
    this.stringifyCalls.push({ data, result });
    return result;
  }
}
