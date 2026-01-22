import fs from 'node:fs';
import YAML from 'yaml';

import { ConfigurationError } from '../exceptions.js';

/**
 * Load configuration from a YAML file.
 *
 * Per the config system spec:
 * - Returns parsed object for valid YAML
 * - Returns empty object {} for missing files (graceful degradation)
 * - Returns empty object {} for empty files
 * - Throws ConfigurationError with file path for invalid YAML
 *
 * @param filePath - Absolute path to the YAML file
 * @returns Parsed configuration object, or empty object if file missing/empty
 * @throws ConfigurationError if YAML is invalid
 */
export function loadYamlConfig(filePath: string): Record<string, unknown> {
  // Handle missing file gracefully
  if (!fs.existsSync(filePath)) {
    return {};
  }

  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch (error) {
    throw new ConfigurationError(
      `Failed to read config file: ${filePath}\n${error instanceof Error ? error.message : String(error)}`
    );
  }

  // Handle empty or whitespace-only files
  if (!content.trim()) {
    return {};
  }

  try {
    const parsed = YAML.parse(content);
    // YAML.parse can return null for empty documents
    if (parsed === null || parsed === undefined) {
      return {};
    }
    // Ensure we return an object
    if (typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new ConfigurationError(
        `Config file must contain a YAML mapping (object), got ${Array.isArray(parsed) ? 'array' : typeof parsed}: ${filePath}`
      );
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof ConfigurationError) {
      throw error;
    }
    // YAML parsing error
    const message = error instanceof Error ? error.message : String(error);
    throw new ConfigurationError(`Invalid YAML in config file: ${filePath}\n${message}`);
  }
}
