import Ajv2020, { type ErrorObject } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import type {
  ISchemaValidator,
  ValidationResult,
  ResultError,
} from '../interfaces/schema-validator.interface.js';
import { ValidationErrorCodes } from '../interfaces/schema-validator.interface.js';

/**
 * Real schema validator implementation using AJV.
 *
 * Per Critical Discovery 07: Transforms AJV errors into actionable
 * ResultError format with code, path, expected, actual, and action.
 */
export class SchemaValidatorAdapter implements ISchemaValidator {
  private ajv: Ajv2020;

  constructor() {
    this.ajv = new Ajv2020({
      allErrors: true,
      strict: true,
      validateFormats: true,
    });
    addFormats(this.ajv);
  }

  /**
   * Validate data against a JSON Schema.
   */
  validate(schema: unknown, data: unknown): ValidationResult {
    const validateFn = this.ajv.compile(schema as object);
    const valid = validateFn(data);

    if (valid) {
      return { valid: true, errors: [] };
    }

    const errors = this.transformErrors(validateFn.errors ?? [], data);
    return { valid: false, errors };
  }

  /**
   * Compile a schema for repeated validation.
   */
  compile(schema: unknown): (data: unknown) => ValidationResult {
    const validateFn = this.ajv.compile(schema as object);

    return (data: unknown): ValidationResult => {
      const valid = validateFn(data);

      if (valid) {
        return { valid: true, errors: [] };
      }

      const errors = this.transformErrors(validateFn.errors ?? [], data);
      return { valid: false, errors };
    };
  }

  /**
   * Transform AJV errors into actionable ResultError format.
   */
  private transformErrors(ajvErrors: ErrorObject[], data: unknown): ResultError[] {
    return ajvErrors.map((err) => this.transformError(err, data));
  }

  /**
   * Transform a single AJV error into ResultError.
   */
  private transformError(err: ErrorObject, data: unknown): ResultError {
    const path = err.instancePath || '/';
    const actual = this.getActualValue(err, data);

    switch (err.keyword) {
      case 'required':
        return this.transformRequiredError(err, path);

      case 'type':
        return this.transformTypeError(err, path, actual);

      case 'enum':
        return this.transformEnumError(err, path, actual);

      case 'pattern':
        return this.transformPatternError(err, path, actual);

      case 'additionalProperties':
        return this.transformAdditionalPropertiesError(err, path);

      case 'minimum':
      case 'exclusiveMinimum':
        return this.transformMinimumError(err, path, actual);

      case 'maximum':
      case 'exclusiveMaximum':
        return this.transformMaximumError(err, path, actual);

      case 'minItems':
        return this.transformMinItemsError(err, path, actual);

      case 'maxItems':
        return this.transformMaxItemsError(err, path, actual);

      case 'format':
        return this.transformFormatError(err, path, actual);

      default:
        return this.transformGenericError(err, path, actual);
    }
  }

  private transformRequiredError(err: ErrorObject, path: string): ResultError {
    const missingProperty = err.params?.missingProperty as string;
    const fieldPath = path === '/' ? `/${missingProperty}` : `${path}/${missingProperty}`;

    return {
      code: ValidationErrorCodes.MISSING_REQUIRED,
      path: fieldPath,
      message: `Missing required field: ${missingProperty}`,
      expected: 'field to be present',
      actual: 'undefined',
      action: `Add the required "${missingProperty}" field`,
    };
  }

  private transformTypeError(err: ErrorObject, path: string, actual: string): ResultError {
    const expectedType = err.params?.type as string;

    return {
      code: ValidationErrorCodes.INVALID_TYPE,
      path,
      message: `Invalid type at ${path}`,
      expected: expectedType,
      actual,
      action: `Change ${path} to be of type ${expectedType}`,
    };
  }

  private transformEnumError(err: ErrorObject, path: string, actual: string): ResultError {
    const allowedValues = (err.params?.allowedValues as string[]) ?? [];
    const expected = allowedValues.join(' | ');

    return {
      code: ValidationErrorCodes.INVALID_ENUM,
      path,
      message: `Expected ${path} to be one of: ${expected}`,
      expected,
      actual,
      action: `Update ${path} to use one of the allowed values: ${expected}`,
    };
  }

  private transformPatternError(err: ErrorObject, path: string, actual: string): ResultError {
    const pattern = err.params?.pattern as string;

    return {
      code: ValidationErrorCodes.INVALID_PATTERN,
      path,
      message: `Value at ${path} does not match required pattern`,
      expected: `Pattern: ${pattern}`,
      actual,
      action: `Update ${path} to match the pattern: ${pattern}`,
    };
  }

  private transformAdditionalPropertiesError(err: ErrorObject, path: string): ResultError {
    const additionalProperty = err.params?.additionalProperty as string;

    return {
      code: ValidationErrorCodes.ADDITIONAL_PROPERTY,
      path: path === '/' ? `/${additionalProperty}` : `${path}/${additionalProperty}`,
      message: `Additional property "${additionalProperty}" is not allowed`,
      expected: 'no additional properties',
      actual: additionalProperty,
      action: `Remove the "${additionalProperty}" property or add it to the schema`,
    };
  }

  private transformMinimumError(err: ErrorObject, path: string, actual: string): ResultError {
    const limit = err.params?.limit as number;

    return {
      code: ValidationErrorCodes.MINIMUM_VIOLATED,
      path,
      message: `Value at ${path} is below minimum`,
      expected: `>= ${limit}`,
      actual,
      action: `Update ${path} to be at least ${limit}`,
    };
  }

  private transformMaximumError(err: ErrorObject, path: string, actual: string): ResultError {
    const limit = err.params?.limit as number;

    return {
      code: ValidationErrorCodes.MAXIMUM_VIOLATED,
      path,
      message: `Value at ${path} exceeds maximum`,
      expected: `<= ${limit}`,
      actual,
      action: `Update ${path} to be at most ${limit}`,
    };
  }

  private transformMinItemsError(err: ErrorObject, path: string, actual: string): ResultError {
    const limit = err.params?.limit as number;

    return {
      code: ValidationErrorCodes.MIN_ITEMS,
      path,
      message: `Array at ${path} has too few items`,
      expected: `at least ${limit} items`,
      actual,
      action: `Add more items to ${path} (minimum ${limit} required)`,
    };
  }

  private transformMaxItemsError(err: ErrorObject, path: string, actual: string): ResultError {
    const limit = err.params?.limit as number;

    return {
      code: ValidationErrorCodes.MAX_ITEMS,
      path,
      message: `Array at ${path} has too many items`,
      expected: `at most ${limit} items`,
      actual,
      action: `Remove items from ${path} (maximum ${limit} allowed)`,
    };
  }

  private transformFormatError(err: ErrorObject, path: string, actual: string): ResultError {
    const format = err.params?.format as string;

    return {
      code: ValidationErrorCodes.INVALID_FORMAT,
      path,
      message: `Value at ${path} is not a valid ${format}`,
      expected: `${format} format`,
      actual,
      action: `Update ${path} to be a valid ${format}`,
    };
  }

  private transformGenericError(err: ErrorObject, path: string, actual: string): ResultError {
    return {
      code: ValidationErrorCodes.VALIDATION_ERROR,
      path,
      message: err.message ?? 'Validation error',
      expected: 'valid value',
      actual,
      action: `Fix the value at ${path}: ${err.message}`,
    };
  }

  /**
   * Get the actual value at the error path for display.
   */
  private getActualValue(err: ErrorObject, data: unknown): string {
    try {
      if (err.keyword === 'required') {
        return 'undefined';
      }

      const pathParts = err.instancePath.split('/').filter(Boolean);
      let current: unknown = data;

      for (const part of pathParts) {
        if (current && typeof current === 'object' && part in current) {
          current = (current as Record<string, unknown>)[part];
        } else {
          return 'undefined';
        }
      }

      if (current === null) return 'null';
      if (current === undefined) return 'undefined';
      if (typeof current === 'object') {
        return Array.isArray(current)
          ? `array(${current.length})`
          : 'object';
      }
      return String(current);
    } catch {
      return 'unknown';
    }
  }
}
