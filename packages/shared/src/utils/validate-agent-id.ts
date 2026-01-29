/**
 * Plan 019: Agent Manager Refactor - Agent ID Validation Utility
 *
 * Security utility to prevent path traversal and other injection attacks
 * in agent IDs. Used by AgentManagerService and AgentInstance.
 *
 * Per AC-23: Invalid agent IDs rejected with path traversal prevention.
 * Per Critical Finding 03: Path traversal risk in session IDs.
 * Per PL-09: Path traversal prevention in session IDs.
 */

/**
 * Error thrown when agent ID validation fails.
 */
export class ValidationError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Validation result type.
 */
export interface ValidationResult {
  /** Whether the ID is valid */
  valid: boolean;
  /** Error message if invalid */
  error?: string;
  /** Error code if invalid */
  code?: string;
}

/**
 * Maximum allowed length for agent IDs.
 * Per Invariant #2: max 64 chars.
 */
const MAX_AGENT_ID_LENGTH = 64;

/**
 * Pattern for valid agent ID characters.
 * Per Invariant #2: Alphanumeric + dash/underscore only.
 */
const VALID_AGENT_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

/**
 * Dangerous patterns that indicate path traversal attempts.
 */
const PATH_TRAVERSAL_PATTERNS = [
  '..', // Parent directory traversal
  '/', // Unix path separator
  '\\', // Windows path separator
  '\0', // Null byte injection
];

/**
 * Validate an agent ID for security and format compliance.
 *
 * @param agentId - The agent ID to validate
 * @returns ValidationResult indicating validity and error details
 *
 * Rejects:
 * - Empty or whitespace-only IDs
 * - IDs longer than 64 characters
 * - IDs containing path separators (/, \)
 * - IDs containing path traversal sequences (..)
 * - IDs containing null bytes
 * - IDs with non-alphanumeric characters (except - and _)
 */
export function validateAgentId(agentId: string): ValidationResult {
  // Check for null/undefined
  if (agentId == null) {
    return {
      valid: false,
      error: 'Agent ID is required',
      code: 'AGENT_ID_REQUIRED',
    };
  }

  // Check for empty string or whitespace
  if (agentId.trim().length === 0) {
    return {
      valid: false,
      error: 'Agent ID cannot be empty or whitespace',
      code: 'AGENT_ID_EMPTY',
    };
  }

  // Check for whitespace (ID should match trimmed version)
  if (agentId !== agentId.trim()) {
    return {
      valid: false,
      error: 'Agent ID cannot contain leading or trailing whitespace',
      code: 'AGENT_ID_WHITESPACE',
    };
  }

  // Check for embedded whitespace
  if (/\s/.test(agentId)) {
    return {
      valid: false,
      error: 'Agent ID cannot contain whitespace',
      code: 'AGENT_ID_WHITESPACE',
    };
  }

  // Check length
  if (agentId.length > MAX_AGENT_ID_LENGTH) {
    return {
      valid: false,
      error: `Agent ID exceeds maximum length of ${MAX_AGENT_ID_LENGTH} characters`,
      code: 'AGENT_ID_TOO_LONG',
    };
  }

  // Check for path traversal patterns
  for (const pattern of PATH_TRAVERSAL_PATTERNS) {
    if (agentId.includes(pattern)) {
      return {
        valid: false,
        error: `Agent ID contains forbidden pattern: ${pattern === '\0' ? '\\0' : pattern}`,
        code: 'AGENT_ID_PATH_TRAVERSAL',
      };
    }
  }

  // Check character pattern (alphanumeric + dash/underscore)
  if (!VALID_AGENT_ID_PATTERN.test(agentId)) {
    return {
      valid: false,
      error: 'Agent ID must contain only alphanumeric characters, dashes, and underscores',
      code: 'AGENT_ID_INVALID_CHARS',
    };
  }

  return { valid: true };
}

/**
 * Validate an agent ID and throw ValidationError if invalid.
 *
 * @param agentId - The agent ID to validate
 * @throws ValidationError if the ID is invalid
 */
export function assertValidAgentId(agentId: string): void {
  const result = validateAgentId(agentId);
  if (!result.valid) {
    throw new ValidationError(result.error ?? 'Unknown validation error', result.code ?? 'UNKNOWN');
  }
}

/**
 * Generate a unique agent ID.
 *
 * Creates IDs in the format: `agent-<timestamp>-<random>`
 * This format is guaranteed to pass validation.
 *
 * @returns A valid unique agent ID
 */
export function generateAgentId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `agent-${timestamp}-${random}`;
}
