import {
  FakeSchemaValidator,
  SchemaValidatorAdapter,
  ValidationErrorCodes,
  type ValidationResult,
} from '@chainglass/workflow';
import { beforeEach, describe, expect, it } from 'vitest';

/**
 * Tests for ISchemaValidator implementations.
 *
 * Per Critical Discovery 07: AJV errors must be transformed into actionable
 * ResultError format with code, path, expected, actual, and action.
 */

describe('SchemaValidatorAdapter', () => {
  const validator = new SchemaValidatorAdapter();

  const simpleSchema = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    required: ['name', 'status'],
    properties: {
      name: { type: 'string' },
      status: { type: 'string', enum: ['pending', 'active', 'complete'] },
      count: { type: 'integer', minimum: 0 },
    },
    additionalProperties: false,
  };

  describe('validate() success', () => {
    it('should return valid for correct data', () => {
      /*
      Test Doc:
      - Why: Core operation - valid data should pass validation
      - Contract: validate() returns {valid: true, errors: []} for valid data
      - Usage Notes: Check both valid flag and empty errors array
      - Quality Contribution: Ensures valid data passes correctly
      - Worked Example: validate(schema, {name:'test',status:'pending'}) → valid
      */
      const data = { name: 'test', status: 'pending' };
      const result = validator.validate(simpleSchema, data);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should handle optional fields', () => {
      const data = { name: 'test', status: 'active', count: 5 };
      const result = validator.validate(simpleSchema, data);
      expect(result.valid).toBe(true);
    });
  });

  describe('validate() errors', () => {
    it('should return E010 for missing required field', () => {
      /*
      Test Doc:
      - Why: Agent needs to know exactly which field is missing
      - Contract: validate() returns error with code E010, path to field, action to fix
      - Usage Notes: Path uses JSON pointer format
      - Quality Contribution: Enables agents to auto-fix missing fields
      - Worked Example: validate(schema, {name:'test'}) → E010 /status missing
      */
      const data = { name: 'test' }; // missing 'status'
      const result = validator.validate(simpleSchema, data);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);

      const error = result.errors.find((e) => e.code === ValidationErrorCodes.MISSING_REQUIRED);
      expect(error).toBeDefined();
      expect(error?.path).toBe('/status');
      expect(error?.message).toContain('Missing required field');
      expect(error?.action).toContain('status');
    });

    it('should return E012 for invalid enum value', () => {
      /*
      Test Doc:
      - Why: Agent needs to know allowed values and how to fix
      - Contract: validate() returns error with allowed values and fix action
      - Usage Notes: expected field contains allowed enum values
      - Quality Contribution: Enables agents to select correct value
      - Worked Example: validate(schema, {status:'invalid'}) → E012 expected pending|active|complete
      */
      const data = { name: 'test', status: 'invalid' };
      const result = validator.validate(simpleSchema, data);

      expect(result.valid).toBe(false);

      const error = result.errors.find((e) => e.code === ValidationErrorCodes.INVALID_ENUM);
      expect(error).toBeDefined();
      expect(error?.path).toBe('/status');
      expect(error?.expected).toContain('pending');
      expect(error?.expected).toContain('active');
      expect(error?.expected).toContain('complete');
      expect(error?.actual).toBe('invalid');
      expect(error?.action).toContain('allowed values');
    });

    it('should return E011 for invalid type', () => {
      const data = { name: 123, status: 'pending' }; // name should be string
      const result = validator.validate(simpleSchema, data);

      expect(result.valid).toBe(false);

      const error = result.errors.find((e) => e.code === ValidationErrorCodes.INVALID_TYPE);
      expect(error).toBeDefined();
      expect(error?.path).toBe('/name');
      expect(error?.expected).toBe('string');
    });

    it('should return E014 for additional properties', () => {
      const data = { name: 'test', status: 'pending', extra: 'field' };
      const result = validator.validate(simpleSchema, data);

      expect(result.valid).toBe(false);

      const error = result.errors.find((e) => e.code === ValidationErrorCodes.ADDITIONAL_PROPERTY);
      expect(error).toBeDefined();
      expect(error?.path).toContain('extra');
      expect(error?.action).toContain('Remove');
    });

    it('should return E015 for minimum violation', () => {
      const data = { name: 'test', status: 'pending', count: -1 };
      const result = validator.validate(simpleSchema, data);

      expect(result.valid).toBe(false);

      const error = result.errors.find((e) => e.code === ValidationErrorCodes.MINIMUM_VIOLATED);
      expect(error).toBeDefined();
      expect(error?.path).toBe('/count');
      expect(error?.expected).toContain('>= 0');
    });

    it('should return multiple errors for multiple issues', () => {
      const data = { status: 'invalid' }; // missing name, invalid status
      const result = validator.validate(simpleSchema, data);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(2);

      const codes = result.errors.map((e) => e.code);
      expect(codes).toContain(ValidationErrorCodes.MISSING_REQUIRED);
      expect(codes).toContain(ValidationErrorCodes.INVALID_ENUM);
    });
  });

  describe('compile()', () => {
    it('should return reusable validator function', () => {
      /*
      Test Doc:
      - Why: Compiled validators are more efficient for repeated validation
      - Contract: compile() returns function that validates like validate()
      - Usage Notes: Compile once, call many times
      - Quality Contribution: Enables efficient batch validation
      - Worked Example: compile(schema)(data) === validate(schema, data)
      */
      const validateFn = validator.compile(simpleSchema);

      const validResult = validateFn({ name: 'test', status: 'active' });
      expect(validResult.valid).toBe(true);

      const invalidResult = validateFn({ name: 'test' });
      expect(invalidResult.valid).toBe(false);
    });
  });

  describe('with core workflow schema', () => {
    it('should validate wf-phase status correctly', async () => {
      // Use the actual wf-phase schema
      const wfPhaseSchema = await import(
        '../../../packages/workflow/schemas/wf-phase.schema.json',
        { with: { type: 'json' } }
      );

      const validData = {
        phase: 'gather',
        facilitator: 'agent',
        state: 'active',
        status: [
          {
            timestamp: '2026-01-22T10:00:00Z',
            from: 'orchestrator',
            action: 'prepare',
          },
        ],
      };

      const result = validator.validate(wfPhaseSchema.default, validData);
      expect(result.valid).toBe(true);
    });

    it('should return actionable error for invalid facilitator', async () => {
      const wfPhaseSchema = await import(
        '../../../packages/workflow/schemas/wf-phase.schema.json',
        { with: { type: 'json' } }
      );

      const invalidData = {
        phase: 'gather',
        facilitator: 'invalid-facilitator',
        state: 'active',
        status: [],
      };

      const result = validator.validate(wfPhaseSchema.default, invalidData);
      expect(result.valid).toBe(false);

      const error = result.errors.find((e) => e.path === '/facilitator');
      expect(error).toBeDefined();
      expect(error?.expected).toContain('agent');
      expect(error?.expected).toContain('orchestrator');
    });
  });
});

describe('FakeSchemaValidator', () => {
  let validator: FakeSchemaValidator;

  beforeEach(() => {
    validator = new FakeSchemaValidator();
  });

  describe('test helpers', () => {
    it('setValid should make validation pass', () => {
      const data = { test: 'data' };
      validator.setValid(data);

      const result = validator.validate({}, data);
      expect(result.valid).toBe(true);
    });

    it('setInvalid should make validation fail with errors', () => {
      const data = { test: 'data' };
      const errors = [FakeSchemaValidator.missingRequired('field')];
      validator.setInvalid(data, errors);

      const result = validator.validate({}, data);
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(errors);
    });

    it('reset should clear presets', () => {
      const data = { test: 'data' };
      validator.setValid(data);
      validator.reset();

      // Should use real validation now
      const schema = {
        type: 'object',
        required: ['name'],
      };
      const result = validator.validate(schema, data);
      // Will fail because 'name' is missing
      expect(result.valid).toBe(false);
    });
  });

  describe('static helpers', () => {
    it('missingRequired should create E010 error', () => {
      const error = FakeSchemaValidator.missingRequired('status');
      expect(error.code).toBe(ValidationErrorCodes.MISSING_REQUIRED);
      expect(error.path).toBe('/status');
    });

    it('invalidEnum should create E012 error', () => {
      const error = FakeSchemaValidator.invalidEnum('/status', ['a', 'b'], 'c');
      expect(error.code).toBe(ValidationErrorCodes.INVALID_ENUM);
      expect(error.expected).toBe('a | b');
      expect(error.actual).toBe('c');
    });
  });
});
