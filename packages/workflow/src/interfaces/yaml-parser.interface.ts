/**
 * YAML parser interface for workflow files.
 *
 * Per Critical Discovery 06: YAML parse errors must include line/column
 * information for agent-friendly error messages.
 */

/**
 * Error thrown when YAML parsing fails.
 * Includes line and column information for precise error location.
 */
export class YamlParseError extends Error {
  constructor(
    message: string,
    public readonly line: number,
    public readonly column: number,
    public readonly filePath: string,
  ) {
    super(`${filePath}:${line}:${column}: ${message}`);
    this.name = 'YamlParseError';
  }
}

/**
 * Result of a successful YAML parse.
 */
export interface ParseResult<T> {
  /** Parsed data */
  data: T;
  /** Source file path (for error messages) */
  filePath: string;
}

/**
 * YAML parser interface.
 *
 * Implementations:
 * - YamlParserAdapter: Real implementation using yaml package
 * - FakeYamlParser: Configurable implementation for testing
 */
export interface IYamlParser {
  /**
   * Parse YAML content into a JavaScript object.
   *
   * @param content YAML content as string
   * @param filePath Source file path (for error messages)
   * @returns Parsed data
   * @throws YamlParseError with line/column on syntax error
   */
  parse<T = unknown>(content: string, filePath: string): T;

  /**
   * Stringify a JavaScript object to YAML.
   *
   * @param data Object to stringify
   * @returns YAML string
   */
  stringify(data: unknown): string;
}
