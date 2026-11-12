import { ConfigurationError } from '../exceptions.js';

/**
 * Maximum nesting depth for environment variable keys.
 * Prevents DOS via deeply nested env vars.
 */
const MAX_NESTING_DEPTH = 4;

/**
 * Pattern for validating individual segments after splitting on __.
 * Per DYK-05: Strict validation matching fail-fast philosophy.
 *
 * Each segment must:
 * - Start with uppercase letter (A-Z)
 * - Contain only uppercase letters, digits and single underscores between words
 *
 * Valid segments: DEBUG, SAMPLE, TIMEOUT, A, B123, MAX_RETRIES, REMOTE_VIEW
 * Invalid segments: sample, 123ABC (starts with digit)
 *
 * Multi-word segments are valid because the CG_ prefix is shared: besides config overrides
 * (`CG_<SECTION>__<FIELD>`, ADR-0003, e.g. `CG_MYFEATURE__MAX_RETRIES`), chainglass passes plain
 * process variables under it (`CG_SERVER_PORT`, `CG_NODE_ID`, `CG_REMOTE_VIEW__DAEMON_PORT`). They
 * parse to keys no config section registers (`server_port`, `remote_view`), which the loader
 * ignores; rejecting them made the web server and the CLI fail to load config whenever one was in
 * the environment.
 */
const SEGMENT_PATTERN = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/;

/**
 * Set a value in a nested object using a path array.
 *
 * @param obj - Target object to modify
 * @param pathParts - Array of keys representing the path
 * @param value - Value to set at the path
 */
function setNestedValue(obj: Record<string, unknown>, pathParts: string[], value: string): void {
  let current = obj;

  for (let i = 0; i < pathParts.length - 1; i++) {
    const key = pathParts[i];
    if (current[key] === undefined) {
      current[key] = {};
    } else if (typeof current[key] !== 'object' || current[key] === null) {
      // Path collision - intermediate value is not an object
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }

  const finalKey = pathParts[pathParts.length - 1];
  current[finalKey] = value;
}

/**
 * Parse CG_* environment variables into a nested configuration object.
 *
 * Per Critical Discovery 03 and DYK-05:
 * - Only processes CG_ prefixed variables
 * - Uses __ (double underscore) for nesting levels
 * - Lowercases all keys in the output
 * - Enforces MAX_NESTING_DEPTH = 4
 * - Strict validation: rejects malformed vars with ConfigurationError
 *
 * @returns Parsed configuration object from environment variables
 * @throws ConfigurationError if any CG_* variable is malformed
 */
export function parseEnvVars(): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(process.env)) {
    // Skip non-CG_ variables
    if (!key.startsWith('CG_')) {
      continue;
    }

    // Skip undefined values (shouldn't happen but TypeScript requires check)
    if (value === undefined) {
      continue;
    }

    // Strict validation per DYK-05
    validateEnvKey(key);

    // Parse the key into path segments
    const keyWithoutPrefix = key.slice(3); // Remove 'CG_' prefix
    const pathParts = keyWithoutPrefix.split('__').map((s) => s.toLowerCase());

    // Check nesting depth
    if (pathParts.length > MAX_NESTING_DEPTH) {
      throw new ConfigurationError(
        `Environment variable nesting exceeds maximum depth of ${MAX_NESTING_DEPTH}: ${key}\nConsider flattening your configuration structure.`
      );
    }

    setNestedValue(result, pathParts, value);
  }

  return result;
}

/**
 * Validate an environment variable key against strict rules.
 *
 * Per DYK-05: Strict validation matching fail-fast philosophy.
 *
 * @param key - The full environment variable name (including CG_ prefix)
 * @throws ConfigurationError if the key is malformed
 */
function validateEnvKey(key: string): void {
  const withoutPrefix = key.slice(3); // Remove 'CG_' prefix

  // Check for trailing underscore
  if (withoutPrefix.endsWith('_')) {
    throw new ConfigurationError(
      `Invalid environment variable: ${key}\nKeys must not end with an underscore.`
    );
  }

  // Check for triple underscores (creates empty segments)
  if (withoutPrefix.includes('___')) {
    throw new ConfigurationError(
      `Invalid environment variable: ${key}\nTriple underscores create empty path segments. Use double underscores (__) for nesting.`
    );
  }

  // Check for invalid characters (only A-Z, 0-9, _ allowed)
  if (/[^A-Z0-9_]/.test(withoutPrefix)) {
    if (/[a-z]/.test(withoutPrefix)) {
      throw new ConfigurationError(
        `Invalid environment variable: ${key}\n` +
          `Keys after CG_ prefix must be UPPERCASE. Use: CG_${withoutPrefix.toUpperCase()}`
      );
    }
    throw new ConfigurationError(
      `Invalid environment variable: ${key}\nKeys may only contain uppercase letters, digits, and underscores.`
    );
  }

  // Split on __ and validate each segment
  const segments = withoutPrefix.split('__');

  for (const segment of segments) {
    // Check for empty segments (leading __, trailing __, or consecutive __)
    if (!segment) {
      throw new ConfigurationError(
        `Invalid environment variable: ${key}\nEmpty path segments are not allowed. Check for leading/trailing/consecutive double underscores.`
      );
    }

    // Each segment must match pattern (start with a letter; uppercase words joined by single _)
    if (!SEGMENT_PATTERN.test(segment)) {
      throw new ConfigurationError(
        `Invalid environment variable: ${key}\nEach segment must start with an uppercase letter and contain only uppercase letters, digits and single underscores.\nInvalid segment: '${segment}'`
      );
    }
  }
}
