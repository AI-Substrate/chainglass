/**
 * WorkUnit Error Factory Tests
 *
 * Tests for error factory functions E180-E187.
 *
 * TDD RED Phase: Tests import errors that don't exist yet.
 */

import { describe, expect, it } from 'vitest';

// Import error factories that will be created in T007
import {
  WORKUNIT_ERROR_CODES,
  workunitNoTemplateError,
  workunitNotFoundError,
  workunitPathEscapeError,
  workunitSchemaValidationError,
  workunitSlugInvalidError,
  workunitTemplateNotFoundError,
  workunitTypeMismatchError,
  workunitYamlParseError,
} from '../../../../../packages/positional-graph/src/features/029-agentic-work-units/workunit-errors.js';

describe('WorkUnit Error Codes', () => {
  /**
   * Test Doc:
   * - Why: Error codes must be consistent and predictable
   * - Contract: WORKUNIT_ERROR_CODES constant contains all E180-E187 codes
   * - Usage Notes: Import constant for error code references
   * - Quality Contribution: Prevents typos in error codes
   * - Worked Example: WORKUNIT_ERROR_CODES.E180 → 'E180'
   */
  it('should define all error codes E180-E187', () => {
    expect(WORKUNIT_ERROR_CODES.E180).toBe('E180');
    expect(WORKUNIT_ERROR_CODES.E181).toBe('E181');
    expect(WORKUNIT_ERROR_CODES.E182).toBe('E182');
    expect(WORKUNIT_ERROR_CODES.E183).toBe('E183');
    expect(WORKUNIT_ERROR_CODES.E184).toBe('E184');
    expect(WORKUNIT_ERROR_CODES.E185).toBe('E185');
    expect(WORKUNIT_ERROR_CODES.E186).toBe('E186');
    expect(WORKUNIT_ERROR_CODES.E187).toBe('E187');
  });
});

describe('workunitNotFoundError (E180)', () => {
  /**
   * Test Doc:
   * - Why: Unit folder or unit.yaml doesn't exist
   * - Contract: Returns error with code E180, message containing slug, actionable guidance
   * - Usage Notes: Called when WorkUnitService.load() can't find the unit
   * - Quality Contribution: Verifies error structure matches pattern
   * - Worked Example: workunitNotFoundError('my-unit') → { code: 'E180', message, action }
   */
  it('should return E180 with slug in message', () => {
    const error = workunitNotFoundError('my-missing-unit');

    expect(error.code).toBe('E180');
    expect(error.message).toContain('my-missing-unit');
    expect(error.action).toBeDefined();
    expect(error.action?.length).toBeGreaterThan(0);
  });
});

describe('workunitYamlParseError (E181)', () => {
  /**
   * Test Doc:
   * - Why: YAML syntax error in unit.yaml
   * - Contract: Returns error with code E181, message with parse details, actionable guidance
   * - Usage Notes: Called when YAML parser fails
   * - Quality Contribution: Verifies error structure matches pattern
   * - Worked Example: workunitYamlParseError('my-unit', 'invalid: yaml::') → { code: 'E181', message, action }
   */
  it('should return E181 with parse error details', () => {
    const error = workunitYamlParseError('my-unit', 'unexpected token at line 5');

    expect(error.code).toBe('E181');
    expect(error.message).toContain('my-unit');
    expect(error.message).toContain('unexpected token');
    expect(error.action).toBeDefined();
  });
});

describe('workunitSchemaValidationError (E182)', () => {
  /**
   * Test Doc:
   * - Why: unit.yaml doesn't match WorkUnitSchema
   * - Contract: Returns error with code E182, message with validation issues, actionable guidance
   * - Usage Notes: Called when Zod schema validation fails
   * - Quality Contribution: Verifies error includes validation details for debugging
   * - Worked Example: workunitSchemaValidationError('my-unit', ['missing type']) → { code: 'E182', message, action }
   */
  it('should return E182 with validation issues', () => {
    const issues = ['missing required field: type', 'invalid slug format'];
    const error = workunitSchemaValidationError('my-unit', issues);

    expect(error.code).toBe('E182');
    expect(error.message).toContain('my-unit');
    expect(error.message).toContain('missing required field');
    expect(error.action).toBeDefined();
  });
});

describe('workunitNoTemplateError (E183)', () => {
  /**
   * Test Doc:
   * - Why: getTemplateContent called on user-input unit
   * - Contract: Returns error with code E183, clear message, actionable guidance
   * - Usage Notes: UserInputUnits don't have templates - this is expected
   * - Quality Contribution: Prevents confusing "file not found" errors
   * - Worked Example: workunitNoTemplateError('user-requirements') → { code: 'E183', message, action }
   */
  it('should return E183 for user-input units', () => {
    const error = workunitNoTemplateError('user-requirements');

    expect(error.code).toBe('E183');
    expect(error.message).toContain('user-requirements');
    expect(error.message.toLowerCase()).toContain('template');
    expect(error.action).toBeDefined();
  });
});

describe('workunitPathEscapeError (E184)', () => {
  /**
   * Test Doc:
   * - Why: Security - template path escapes unit folder
   * - Contract: Returns error with code E184, message containing the path, actionable guidance
   * - Usage Notes: Prevents reading files outside unit folder
   * - Quality Contribution: Catches malicious path traversal attempts
   * - Worked Example: workunitPathEscapeError('my-unit', '../../../.env') → { code: 'E184', message, action }
   */
  it('should return E184 with escaped path', () => {
    const error = workunitPathEscapeError('my-unit', '../../../.env');

    expect(error.code).toBe('E184');
    expect(error.message).toContain('my-unit');
    expect(error.message).toContain('../../../.env');
    expect(error.action).toBeDefined();
  });
});

describe('workunitTemplateNotFoundError (E185)', () => {
  /**
   * Test Doc:
   * - Why: Template file doesn't exist
   * - Contract: Returns error with code E185, message containing path, actionable guidance
   * - Usage Notes: unit.yaml is valid but referenced template file is missing
   * - Quality Contribution: Distinguishes from E180 (unit not found)
   * - Worked Example: workunitTemplateNotFoundError('my-unit', 'prompts/main.md') → { code: 'E185', message, action }
   */
  it('should return E185 with template path', () => {
    const error = workunitTemplateNotFoundError('my-unit', 'prompts/main.md');

    expect(error.code).toBe('E185');
    expect(error.message).toContain('my-unit');
    expect(error.message).toContain('prompts/main.md');
    expect(error.action).toBeDefined();
  });
});

describe('workunitTypeMismatchError (E186)', () => {
  /**
   * Test Doc:
   * - Why: Reserved param used with wrong unit type
   * - Contract: Returns error with code E186, message containing both types, actionable guidance
   * - Usage Notes: e.g., main-prompt on CodeUnit
   * - Quality Contribution: Prevents confusing "input not found" errors
   * - Worked Example: workunitTypeMismatchError('main-prompt', 'agent', 'code') → { code: 'E186', message, action }
   */
  it('should return E186 with type mismatch details', () => {
    const error = workunitTypeMismatchError('main-prompt', 'agent', 'code');

    expect(error.code).toBe('E186');
    expect(error.message).toContain('main-prompt');
    expect(error.message).toContain('agent');
    expect(error.message).toContain('code');
    expect(error.action).toBeDefined();
  });
});

describe('workunitSlugInvalidError (E187)', () => {
  /**
   * Test Doc:
   * - Why: Slug doesn't match naming pattern
   * - Contract: Returns error with code E187, message containing slug, actionable guidance
   * - Usage Notes: Slug must start with letter, lowercase with hyphens
   * - Quality Contribution: Catches invalid slug early
   * - Worked Example: workunitSlugInvalidError('123-bad') → { code: 'E187', message, action }
   */
  it('should return E187 with invalid slug', () => {
    const error = workunitSlugInvalidError('123-bad-slug');

    expect(error.code).toBe('E187');
    expect(error.message).toContain('123-bad-slug');
    expect(error.action).toBeDefined();
  });
});

describe('Error Result Type Compliance', () => {
  /**
   * Test Doc:
   * - Why: All errors must follow ResultError interface pattern
   * - Contract: Each error has code, message, and action fields
   * - Usage Notes: Errors are compatible with BaseResult.errors array
   * - Quality Contribution: Ensures consistent error handling across codebase
   * - Worked Example: All error factories return { code, message, action }
   */
  it('should all return errors with code, message, and action', () => {
    const errors = [
      workunitNotFoundError('slug'),
      workunitYamlParseError('slug', 'details'),
      workunitSchemaValidationError('slug', ['issue']),
      workunitNoTemplateError('slug'),
      workunitPathEscapeError('slug', 'path'),
      workunitTemplateNotFoundError('slug', 'path'),
      workunitTypeMismatchError('param', 'expected', 'actual'),
      workunitSlugInvalidError('slug'),
    ];

    for (const error of errors) {
      expect(error).toHaveProperty('code');
      expect(error).toHaveProperty('message');
      expect(error).toHaveProperty('action');
      expect(typeof error.code).toBe('string');
      expect(typeof error.message).toBe('string');
      expect(typeof error.action).toBe('string');
    }
  });
});
