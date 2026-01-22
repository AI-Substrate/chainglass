/**
 * Schema validator interface for JSON Schema validation.
 *
 * Per Critical Discovery 07: AJV errors must be transformed into actionable
 * ResultError format for agent-friendly error messages.
 */

/**
 * Actionable validation error.
 *
 * Per Critical Discovery 07: Errors must include:
 * - code: Error type identifier (E010, E012, etc.)
 * - path: JSON pointer to invalid field
 * - message: Human-readable description
 * - expected: What was expected
 * - actual: What was provided
 * - action: Specific fix instruction
 */
export interface ResultError {
  /** Error code (E010, E011, E012, etc.) */
  code: string;
  /** JSON pointer to the invalid field (e.g., "/status", "/phases/gather/order") */
  path: string;
  /** Human-readable error message */
  message: string;
  /** What was expected (e.g., "pending | active | complete") */
  expected: string;
  /** What was actually provided */
  actual: string;
  /** Specific fix instruction for the agent */
  action: string;
}

/**
 * Result of validation operation.
 */
export interface ValidationResult {
  /** True if data is valid */
  valid: boolean;
  /** Array of errors (empty if valid) */
  errors: ResultError[];
}

/**
 * Schema validation interface.
 *
 * Implementations:
 * - SchemaValidatorAdapter: Real implementation using AJV
 * - FakeSchemaValidator: Configurable implementation for testing
 */
export interface ISchemaValidator {
  /**
   * Validate data against a JSON Schema.
   *
   * @param schema JSON Schema object
   * @param data Data to validate
   * @returns Validation result with actionable errors
   */
  validate(schema: unknown, data: unknown): ValidationResult;

  /**
   * Compile a schema for repeated validation.
   * Returns a validate function that can be called multiple times.
   *
   * @param schema JSON Schema object
   * @returns Compiled validator function
   */
  compile(schema: unknown): (data: unknown) => ValidationResult;
}

/**
 * Standard error codes for validation errors.
 */
export const ValidationErrorCodes = {
  /** Missing required field */
  MISSING_REQUIRED: 'E010',
  /** Invalid type */
  INVALID_TYPE: 'E011',
  /** Invalid enum value */
  INVALID_ENUM: 'E012',
  /** Invalid pattern */
  INVALID_PATTERN: 'E013',
  /** Additional properties not allowed */
  ADDITIONAL_PROPERTY: 'E014',
  /** Minimum constraint violated */
  MINIMUM_VIOLATED: 'E015',
  /** Maximum constraint violated */
  MAXIMUM_VIOLATED: 'E016',
  /** Array too short */
  MIN_ITEMS: 'E017',
  /** Array too long */
  MAX_ITEMS: 'E018',
  /** Format validation failed */
  INVALID_FORMAT: 'E019',
  /** Generic validation error */
  VALIDATION_ERROR: 'E099',
} as const;
