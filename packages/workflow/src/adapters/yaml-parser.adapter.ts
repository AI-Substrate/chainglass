import YAML from 'yaml';
import type { IYamlParser } from '../interfaces/yaml-parser.interface.js';
import { YamlParseError } from '../interfaces/yaml-parser.interface.js';

/**
 * Real YAML parser implementation using the yaml package.
 *
 * Per Critical Discovery 06: Preserves line/column information for
 * agent-friendly error messages.
 */
export class YamlParserAdapter implements IYamlParser {
  /**
   * Parse YAML content into a JavaScript object.
   * @throws YamlParseError with line/column on syntax error
   */
  parse<T = unknown>(content: string, filePath: string): T {
    try {
      return YAML.parse(content) as T;
    } catch (err) {
      if (err instanceof YAML.YAMLParseError || err instanceof YAML.YAMLWarning) {
        // Extract line and column from YAML error
        const line = err.linePos?.[0]?.line ?? 1;
        const col = err.linePos?.[0]?.col ?? 1;
        throw new YamlParseError(err.message, line, col, filePath);
      }
      // Re-throw unknown errors
      throw err;
    }
  }

  /**
   * Stringify a JavaScript object to YAML.
   */
  stringify(data: unknown): string {
    return YAML.stringify(data);
  }
}
