/**
 * Session ID Validator
 *
 * Validates session IDs to prevent path traversal attacks.
 * Per DYK-02: Security - path traversal prevention.
 *
 * Valid session IDs:
 * - Alphanumeric characters (a-z, A-Z, 0-9)
 * - Hyphens (-)
 * - Underscores (_)
 * - Maximum 255 characters
 *
 * Invalid session IDs:
 * - Forward slashes (/)
 * - Backslashes (\)
 * - Double dots (..)
 * - Single dot (.)
 * - Whitespace (spaces, tabs, newlines)
 * - Empty string
 * - Longer than 255 characters
 *
 * Part of Plan 015: Agent Activity Fidelity Enhancement (Phase 1)
 */

/**
 * Error thrown when session ID validation fails.
 */
export class SessionIdValidationError extends Error {
  constructor(
    message: string,
    public readonly sessionId: string,
    public readonly reason: string
  ) {
    super(message);
    this.name = 'SessionIdValidationError';
  }
}

/**
 * Maximum allowed session ID length.
 * Prevents filesystem path length issues.
 */
export const MAX_SESSION_ID_LENGTH = 255;

/**
 * Regex pattern for valid session IDs.
 * Allows: alphanumeric, hyphens, underscores
 * Must be at least 1 character
 */
const VALID_SESSION_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

/**
 * Characters/patterns that indicate path traversal attempts.
 */
const DANGEROUS_PATTERNS = [
  '/', // Forward slash - directory separator
  '\\', // Backslash - Windows directory separator
  '..', // Parent directory traversal
  '.', // Current directory (when alone)
];

/**
 * Validates a session ID and throws if invalid.
 *
 * Use this when you want to fail-fast on invalid input.
 *
 * @param sessionId The session ID to validate
 * @throws SessionIdValidationError if validation fails
 *
 * @example
 * ```typescript
 * validateSessionId('valid-session-123'); // OK
 * validateSessionId('../hack'); // throws SessionIdValidationError
 * ```
 */
export function validateSessionId(sessionId: string): void {
  // Check for empty string
  if (!sessionId || sessionId.length === 0) {
    throw new SessionIdValidationError('Session ID cannot be empty', sessionId, 'empty');
  }

  // Check for max length
  if (sessionId.length > MAX_SESSION_ID_LENGTH) {
    throw new SessionIdValidationError(
      `Session ID exceeds maximum length of ${MAX_SESSION_ID_LENGTH} characters`,
      sessionId,
      'too_long'
    );
  }

  // Check for single dot (current directory)
  if (sessionId === '.') {
    throw new SessionIdValidationError(
      'Session ID cannot be a single dot',
      sessionId,
      'current_directory'
    );
  }

  // Check for dangerous patterns
  for (const pattern of DANGEROUS_PATTERNS) {
    if (sessionId.includes(pattern)) {
      throw new SessionIdValidationError(
        `Session ID contains invalid characters: ${pattern}`,
        sessionId,
        'path_traversal'
      );
    }
  }

  // Check for whitespace
  if (/\s/.test(sessionId)) {
    throw new SessionIdValidationError(
      'Session ID cannot contain whitespace',
      sessionId,
      'whitespace'
    );
  }

  // Check against valid pattern
  if (!VALID_SESSION_ID_PATTERN.test(sessionId)) {
    throw new SessionIdValidationError(
      'Session ID contains invalid characters. Only alphanumeric, hyphens, and underscores allowed.',
      sessionId,
      'invalid_characters'
    );
  }
}

/**
 * Checks if a session ID is valid without throwing.
 *
 * Use this for conditional checks where you don't want exceptions.
 *
 * @param sessionId The session ID to validate
 * @returns true if valid, false if invalid
 *
 * @example
 * ```typescript
 * if (isValidSessionId(input)) {
 *   // Safe to use
 * } else {
 *   // Handle invalid input
 * }
 * ```
 */
export function isValidSessionId(sessionId: string): boolean {
  try {
    validateSessionId(sessionId);
    return true;
  } catch {
    return false;
  }
}
