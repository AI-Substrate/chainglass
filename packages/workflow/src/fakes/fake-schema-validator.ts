import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import type {
  ISchemaValidator,
  ValidationResult,
  ResultError,
} from '../interfaces/schema-validator.interface.js';
import { ValidationErrorCodes } from '../interfaces/schema-validator.interface.js';

/**
 * Fake schema validator for testing.
 *
 * Per Critical Discovery 07: Tests need to verify actionable error handling.
 * This fake provides configurable validation results.
 */
export class FakeSchemaValidator implements ISchemaValidator {
  /** Preset validation results for specific data */
  private validationResults = new Map<string, ValidationResult>();

  /** Whether to use real validation as fallback (default: true) */
  private useRealValidation = true;

  /** AJV instance for real validation fallback */
  private ajv: Ajv2020;

  constructor() {
    this.ajv = new Ajv2020({
      allErrors: true,
      strict: true,
      validateFormats: true,
    });
    addFormats(this.ajv);
  }

  // ========== Test Helpers ==========

  /**
   * Set a preset validation result for specific data (test helper).
   * Uses JSON.stringify for key matching.
   */
  setValidationResult(data: unknown, result: ValidationResult): void {
    const key = JSON.stringify(data);
    this.validationResults.set(key, result);
  }

  /**
   * Set validation to succeed for specific data (test helper).
   */
  setValid(data: unknown): void {
    this.setValidationResult(data, { valid: true, errors: [] });
  }

  /**
   * Set validation to fail with specific errors (test helper).
   */
  setInvalid(data: unknown, errors: ResultError[]): void {
    this.setValidationResult(data, { valid: false, errors });
  }

  /**
   * Configure whether to use real validation as fallback (test helper).
   */
  setUseRealValidation(use: boolean): void {
    this.useRealValidation = use;
  }

  /**
   * Reset all state (test helper).
   */
  reset(): void {
    this.validationResults.clear();
    this.useRealValidation = true;
    this.defaultResult = undefined;
  }

  /** Default result returned when no preset matches */
  private defaultResult?: ValidationResult;

  /**
   * Set a default result to be returned for all validations (test helper).
   * Useful when you want all validations to pass/fail without specifying data.
   */
  setDefaultResult(result: ValidationResult): void {
    this.defaultResult = result;
  }

  /**
   * Create a ResultError with standard format (test helper).
   */
  static createError(
    code: string,
    path: string,
    message: string,
    expected: string,
    actual: string,
    action: string,
  ): ResultError {
    return { code, path, message, expected, actual, action };
  }

  /**
   * Create a missing required field error (test helper).
   */
  static missingRequired(field: string, parentPath = '/'): ResultError {
    const path = parentPath === '/' ? `/${field}` : `${parentPath}/${field}`;
    return {
      code: ValidationErrorCodes.MISSING_REQUIRED,
      path,
      message: `Missing required field: ${field}`,
      expected: 'field to be present',
      actual: 'undefined',
      action: `Add the required "${field}" field`,
    };
  }

  /**
   * Create an invalid enum error (test helper).
   */
  static invalidEnum(path: string, allowed: string[], actual: string): ResultError {
    const expected = allowed.join(' | ');
    return {
      code: ValidationErrorCodes.INVALID_ENUM,
      path,
      message: `Expected ${path} to be one of: ${expected}`,
      expected,
      actual,
      action: `Update ${path} to use one of the allowed values: ${expected}`,
    };
  }

  // ========== ISchemaValidator Implementation ==========

  validate(schema: unknown, data: unknown): ValidationResult {
    // Check for preset result
    const key = JSON.stringify(data);
    if (this.validationResults.has(key)) {
      return this.validationResults.get(key)!;
    }

    // Check for default result
    if (this.defaultResult) {
      return this.defaultResult;
    }

    // Use real validation if enabled
    if (this.useRealValidation) {
      return this.realValidate(schema, data);
    }

    // No preset and real validation disabled - return valid
    return { valid: true, errors: [] };
  }

  compile(schema: unknown): (data: unknown) => ValidationResult {
    return (data: unknown) => this.validate(schema, data);
  }

  /**
   * Perform real validation using AJV.
   */
  private realValidate(schema: unknown, data: unknown): ValidationResult {
    try {
      const validateFn = this.ajv.compile(schema as object);
      const valid = validateFn(data);

      if (valid) {
        return { valid: true, errors: [] };
      }

      // Simple error transformation for fake
      const errors: ResultError[] = (validateFn.errors ?? []).map((err) => ({
        code: ValidationErrorCodes.VALIDATION_ERROR,
        path: err.instancePath || '/',
        message: err.message ?? 'Validation error',
        expected: 'valid value',
        actual: 'invalid',
        action: `Fix the value at ${err.instancePath || '/'}: ${err.message}`,
      }));

      return { valid: false, errors };
    } catch (e) {
      // Schema compilation error
      return {
        valid: false,
        errors: [{
          code: ValidationErrorCodes.VALIDATION_ERROR,
          path: '/',
          message: `Schema error: ${e instanceof Error ? e.message : String(e)}`,
          expected: 'valid schema',
          actual: 'invalid schema',
          action: 'Fix the schema definition',
        }],
      };
    }
  }
}
