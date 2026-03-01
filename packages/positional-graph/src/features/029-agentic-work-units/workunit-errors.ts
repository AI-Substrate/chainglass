/**
 * WorkUnit Error Factories
 *
 * Error factory functions for work unit operations (E180-E187).
 * Follows the existing positional-graph error pattern.
 *
 * @packageDocumentation
 */

import type { ResultError } from '@chainglass/shared';

// ============================================
// Error Code Constants
// ============================================

/**
 * WorkUnit error codes (E180-E187).
 * Separate range from positional-graph errors (E150-E179).
 */
export const WORKUNIT_ERROR_CODES = {
  E180: 'E180', // Unit not found
  E181: 'E181', // YAML parse error
  E182: 'E182', // Schema validation error
  E183: 'E183', // No template (user-input)
  E184: 'E184', // Path escape attempt
  E185: 'E185', // Template not found
  E186: 'E186', // Type mismatch
  E187: 'E187', // Invalid slug
  E188: 'E188', // Slug already exists (Plan 058)
  E189: 'E189', // Reserved for future concurrency (Plan 058)
  E190: 'E190', // Delete failed (Plan 058)
} as const;

export type WorkunitErrorCode = keyof typeof WORKUNIT_ERROR_CODES;

// ============================================
// Error Factory Functions
// ============================================

/**
 * E180: Unit folder or unit.yaml doesn't exist.
 *
 * @param slug - The unit slug that was not found
 * @returns ResultError with code E180
 */
export function workunitNotFoundError(slug: string): ResultError {
  return {
    code: WORKUNIT_ERROR_CODES.E180,
    message: `WorkUnit '${slug}' not found`,
    action: `Check the unit exists at .chainglass/units/${slug}/unit.yaml`,
  };
}

/**
 * E181: YAML syntax error in unit.yaml.
 *
 * @param slug - The unit slug with the parse error
 * @param details - The YAML parser error message
 * @returns ResultError with code E181
 */
export function workunitYamlParseError(slug: string, details: string): ResultError {
  return {
    code: WORKUNIT_ERROR_CODES.E181,
    message: `Failed to parse unit.yaml for '${slug}': ${details}`,
    action: 'Fix the YAML syntax error in unit.yaml',
  };
}

/**
 * E182: unit.yaml doesn't match WorkUnitSchema.
 *
 * @param slug - The unit slug with validation errors
 * @param issues - Array of validation issue messages (from formatZodErrors)
 * @returns ResultError with code E182
 */
export function workunitSchemaValidationError(slug: string, issues: string[]): ResultError {
  const issueList = issues.join('; ');
  return {
    code: WORKUNIT_ERROR_CODES.E182,
    message: `WorkUnit '${slug}' has invalid schema: ${issueList}`,
    action:
      "Fix the unit.yaml according to the schema. Ensure 'type' is one of: agent, code, user-input",
  };
}

/**
 * E183: getTemplateContent called on user-input unit.
 *
 * @param slug - The user-input unit slug
 * @returns ResultError with code E183
 */
export function workunitNoTemplateError(slug: string): ResultError {
  return {
    code: WORKUNIT_ERROR_CODES.E183,
    message: `WorkUnit '${slug}' is a user-input type and has no template`,
    action: 'User-input units collect input directly; use agent or code units for templates',
  };
}

/**
 * E184: Template path escapes unit folder (security).
 *
 * @param slug - The unit slug with the malicious path
 * @param path - The path that attempted to escape
 * @returns ResultError with code E184
 */
export function workunitPathEscapeError(slug: string, path: string): ResultError {
  return {
    code: WORKUNIT_ERROR_CODES.E184,
    message: `Template path '${path}' in unit '${slug}' attempts to escape the unit folder`,
    action: 'Use relative paths that stay within the unit folder',
  };
}

/**
 * E185: Template file doesn't exist.
 *
 * @param slug - The unit slug
 * @param templatePath - The path to the missing template
 * @returns ResultError with code E185
 */
export function workunitTemplateNotFoundError(slug: string, templatePath: string): ResultError {
  return {
    code: WORKUNIT_ERROR_CODES.E185,
    message: `Template file '${templatePath}' not found for unit '${slug}'`,
    action: `Create the template file at .chainglass/units/${slug}/${templatePath}`,
  };
}

/**
 * E186: Reserved param used with wrong unit type.
 *
 * @param paramName - The reserved parameter name (e.g., 'main-prompt')
 * @param expectedType - The unit type required by the param
 * @param actualType - The actual unit type
 * @returns ResultError with code E186
 */
export function workunitTypeMismatchError(
  paramName: string,
  expectedType: string,
  actualType: string
): ResultError {
  return {
    code: WORKUNIT_ERROR_CODES.E186,
    message: `Reserved parameter '${paramName}' requires '${expectedType}' unit type, but got '${actualType}'`,
    action: `Use '${paramName}' only with ${expectedType} units`,
  };
}

/**
 * E187: Slug doesn't match naming pattern.
 *
 * @param slug - The invalid slug
 * @returns ResultError with code E187
 */
export function workunitSlugInvalidError(slug: string): ResultError {
  return {
    code: WORKUNIT_ERROR_CODES.E187,
    message: `Invalid unit slug '${slug}'`,
    action:
      'Slug must start with a letter and contain only lowercase letters, numbers, and hyphens',
  };
}

/**
 * E188: Unit slug already exists (for create duplicate rejection).
 * Per Plan 058 Phase 1.
 */
export function workunitSlugExistsError(slug: string): ResultError {
  return {
    code: WORKUNIT_ERROR_CODES.E188,
    message: `WorkUnit '${slug}' already exists`,
    action: 'Choose a different slug or delete the existing unit first',
  };
}

/**
 * E190: Delete operation failed.
 * Per Plan 058 Phase 1.
 */
export function workunitDeleteFailedError(slug: string, reason: string): ResultError {
  return {
    code: WORKUNIT_ERROR_CODES.E190,
    message: `Failed to delete WorkUnit '${slug}': ${reason}`,
    action: 'Check filesystem permissions and try again',
  };
}
