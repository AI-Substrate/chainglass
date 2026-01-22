import { LiteralSecretError } from '../exceptions.js';

/**
 * Secret pattern definitions.
 *
 * Per Critical Discovery 05: These patterns detect common API key formats.
 * Each pattern has a name (for error messages) and a regex.
 */
const SECRET_PATTERNS = [
  { name: 'OpenAI', pattern: /^sk-[A-Za-z0-9]{20,}$/ },
  { name: 'GitHub PAT', pattern: /^ghp_[A-Za-z0-9]{36}$/ },
  { name: 'Slack Bot', pattern: /^xoxb-\d+-\d+-[A-Za-z0-9]+$/ },
  { name: 'Stripe', pattern: /^sk_(live|test)_[A-Za-z0-9]{24,}$/ },
  { name: 'AWS', pattern: /^AKIA[0-9A-Z]{16}$/ },
];

/**
 * Whitelist prefixes for test fixtures.
 *
 * Values starting with these prefixes are NOT considered secrets,
 * allowing integration tests to use realistic-looking values.
 */
const WHITELIST_PREFIXES = ['sk_example', 'ghp_test_'];

/**
 * Detect if a string value appears to be a literal secret.
 *
 * Per Critical Discovery 05: Detects 5 secret patterns with whitelist
 * for test fixtures.
 *
 * @param value - The string value to check
 * @returns The secret type name (e.g., 'OpenAI') or null if not a secret
 */
export function detectLiteralSecret(value: string): string | null {
  // Empty string is never a secret
  if (!value) {
    return null;
  }

  // Check whitelist first - these are allowed
  for (const prefix of WHITELIST_PREFIXES) {
    if (value.startsWith(prefix)) {
      return null;
    }
  }

  // Check against each secret pattern
  for (const { name, pattern } of SECRET_PATTERNS) {
    if (pattern.test(value)) {
      return name;
    }
  }

  return null;
}

/**
 * Recursively validate that no literal secrets exist in a configuration object.
 *
 * Per Critical Discovery 05: Scans all string values in the config tree
 * and throws LiteralSecretError if any hardcoded secrets are found.
 *
 * @param obj - Configuration object to validate
 * @param path - Current path for error messages (internal use)
 * @throws LiteralSecretError if a literal secret is detected
 */
export function validateNoLiteralSecrets(obj: Record<string, unknown>, path = ''): void {
  validateValue(obj, path);
}

/**
 * Internal recursive validation helper.
 */
function validateValue(value: unknown, currentPath: string): void {
  // Check strings for secrets
  if (typeof value === 'string') {
    const secretType = detectLiteralSecret(value);
    if (secretType) {
      const fieldPath = currentPath || 'root';
      throw new LiteralSecretError(fieldPath, secretType);
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

  // Primitives (numbers, booleans, null) are never secrets
}
