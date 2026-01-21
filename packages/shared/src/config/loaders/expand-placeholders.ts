import { ConfigurationError } from '../exceptions.js';

/**
 * Pattern to match ${VAR} placeholders in strings.
 */
const PLACEHOLDER_PATTERN = /\$\{([^}]+)\}/g;

/**
 * Pattern to detect any remaining unexpanded placeholder.
 */
const UNEXPANDED_PATTERN = /\$\{([^}]+)\}/;

/**
 * Expand ${VAR} placeholders in configuration values using process.env or custom lookup.
 *
 * Per Critical Discovery 04:
 * - Recursively processes all string values in the config object
 * - ${VAR} is replaced with lookup value (defaults to process.env)
 * - Multiple placeholders in a single string are all expanded
 * - Missing env vars leave the ${VAR} placeholder in place
 * - Non-string values are passed through unchanged
 * - Arrays are processed recursively
 *
 * FIX-006: Optional envLookup parameter supports transactional loading
 * by allowing pending secrets to be included in placeholder expansion
 * before they're committed to process.env.
 *
 * @param obj - Configuration object to process
 * @param envLookup - Optional environment lookup (defaults to process.env)
 * @returns New object with placeholders expanded (original unchanged)
 */
export function expandPlaceholders(
  obj: Record<string, unknown>,
  envLookup?: Record<string, string | undefined>
): Record<string, unknown> {
  const lookup = envLookup ?? process.env;
  return expandPlaceholdersInternal(obj, lookup) as Record<string, unknown>;
}

/**
 * Internal recursive placeholder expansion.
 */
function expandPlaceholdersInternal(
  value: unknown,
  envLookup: Record<string, string | undefined>
): unknown {
  // Handle strings - the main expansion case
  if (typeof value === 'string') {
    return expandStringPlaceholders(value, envLookup);
  }

  // Handle arrays recursively
  if (Array.isArray(value)) {
    return value.map((item) => expandPlaceholdersInternal(item, envLookup));
  }

  // Handle objects recursively
  if (typeof value === 'object' && value !== null) {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      result[key] = expandPlaceholdersInternal(val, envLookup);
    }
    return result;
  }

  // Pass through primitives unchanged (numbers, booleans, null)
  return value;
}

/**
 * Expand all ${VAR} placeholders in a string.
 *
 * @param str - String potentially containing placeholders
 * @param envLookup - Environment lookup to use for expansion
 * @returns String with placeholders replaced by env values, or original placeholder if env var missing
 */
function expandStringPlaceholders(
  str: string,
  envLookup: Record<string, string | undefined>
): string {
  return str.replace(PLACEHOLDER_PATTERN, (_match, varName: string) => {
    const envValue = envLookup[varName];
    // If env var is set, use it; otherwise leave placeholder as-is
    // (validateNoUnexpandedPlaceholders will catch missing ones later)
    return envValue !== undefined ? envValue : `\${${varName}}`;
  });
}

/**
 * Validate that no unexpanded ${...} placeholders remain in the configuration.
 *
 * Per Critical Discovery 04:
 * - Throws ConfigurationError if any ${VAR} patterns remain
 * - Error includes the field path (e.g., "sample.api_key")
 * - Error includes the unexpanded variable name
 * - Recursively checks nested objects and arrays
 *
 * @param obj - Configuration object to validate
 * @param path - Current path for error messages (internal use)
 * @throws ConfigurationError if unexpanded placeholders found
 */
export function validateNoUnexpandedPlaceholders(obj: Record<string, unknown>, path = ''): void {
  validateValue(obj, path);
}

/**
 * Internal recursive validation of values.
 */
function validateValue(value: unknown, currentPath: string): void {
  // Check strings for unexpanded placeholders
  if (typeof value === 'string') {
    const match = value.match(UNEXPANDED_PATTERN);
    if (match) {
      const varName = match[1];
      const fieldPath = currentPath || 'root';
      throw new ConfigurationError(
        `Unexpanded placeholder in '${fieldPath}': \${${varName}}\n` +
          `Set environment variable: ${varName}=<value>\n` +
          `Or add to .env file: ${varName}=your-value-here`
      );
    }
    return;
  }

  // Check arrays recursively
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const itemPath = currentPath ? `${currentPath}[${i}]` : `[${i}]`;
      validateValue(value[i], itemPath);
    }
    return;
  }

  // Check objects recursively
  if (typeof value === 'object' && value !== null) {
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      const fieldPath = currentPath ? `${currentPath}.${key}` : key;
      validateValue(val, fieldPath);
    }
    return;
  }

  // Primitives (numbers, booleans, null) can't have placeholders
}
