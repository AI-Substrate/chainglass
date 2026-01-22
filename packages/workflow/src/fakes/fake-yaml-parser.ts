import YAML from 'yaml';
import type { IYamlParser } from '../interfaces/yaml-parser.interface.js';
import { YamlParseError } from '../interfaces/yaml-parser.interface.js';

/**
 * Fake YAML parser for testing.
 *
 * Per Critical Discovery 06: Tests need to verify YAML error handling
 * with precise line/column information.
 */
export class FakeYamlParser implements IYamlParser {
  /** Preset parse results for specific content */
  private parseResults = new Map<string, unknown>();

  /** Errors to throw for specific content */
  private parseErrors = new Map<string, YamlParseError>();

  /** Whether to use real parsing as fallback (default: true) */
  private useRealParsing = true;

  // ========== Test Helpers ==========

  /**
   * Set a preset parse result for specific content (test helper).
   */
  setParseResult(content: string, result: unknown): void {
    this.parseResults.set(content, result);
  }

  /**
   * Set an error to throw for specific content (test helper).
   */
  setParseError(content: string, error: YamlParseError): void {
    this.parseErrors.set(content, error);
  }

  /**
   * Configure whether to use real parsing as fallback (test helper).
   */
  setUseRealParsing(use: boolean): void {
    this.useRealParsing = use;
  }

  /**
   * Reset all state (test helper).
   */
  reset(): void {
    this.parseResults.clear();
    this.parseErrors.clear();
    this.useRealParsing = true;
  }

  // ========== IYamlParser Implementation ==========

  parse<T = unknown>(content: string, filePath: string): T {
    // Check for preset error
    const error = this.parseErrors.get(content);
    if (error) {
      throw error;
    }

    // Check for preset result
    if (this.parseResults.has(content)) {
      return this.parseResults.get(content) as T;
    }

    // Use real parsing if enabled
    if (this.useRealParsing) {
      try {
        return YAML.parse(content) as T;
      } catch (err) {
        if (err instanceof YAML.YAMLParseError || err instanceof YAML.YAMLWarning) {
          const line = err.linePos?.[0]?.line ?? 1;
          const col = err.linePos?.[0]?.col ?? 1;
          throw new YamlParseError(err.message, line, col, filePath);
        }
        throw err;
      }
    }

    // No result configured and real parsing disabled
    throw new YamlParseError('No preset result configured', 1, 1, filePath);
  }

  stringify(data: unknown): string {
    return YAML.stringify(data);
  }
}
