/**
 * WorkUnit Schema Validation Tests
 *
 * Tests for Zod schemas that validate work unit definitions.
 *
 * TDD RED Phase: Tests import schemas that don't exist yet.
 */

import { describe, expect, it } from 'vitest';

// Import schemas that will be created in T005
import {
  AgenticWorkUnitSchema,
  CodeUnitSchema,
  UserInputUnitSchema,
  WorkUnitInputSchema,
  WorkUnitOutputSchema,
  WorkUnitSchema,
  formatZodErrors,
} from '../../../../../packages/positional-graph/src/features/029-agentic-work-units/workunit.schema.js';

describe('WorkUnitSchema - Valid Units', () => {
  /**
   * Test Doc:
   * - Why: AgenticWorkUnit must validate with all required fields
   * - Contract: Valid agent unit passes schema validation
   * - Usage Notes: Requires type='agent' with agent config
   * - Quality Contribution: Verifies happy path validation
   * - Worked Example: Complete agent unit → success: true
   */
  it('should validate AgenticWorkUnit with all required fields', () => {
    const validAgentUnit = {
      slug: 'spec-generator',
      type: 'agent',
      version: '1.0.0',
      inputs: [{ name: 'input1', type: 'data', data_type: 'text', required: true }],
      outputs: [{ name: 'output1', type: 'data', data_type: 'text', required: true }],
      agent: { prompt_template: 'prompts/main.md' },
    };

    const result = WorkUnitSchema.safeParse(validAgentUnit);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe('agent');
    }
  });

  /**
   * Test Doc:
   * - Why: CodeUnit must validate with all required fields
   * - Contract: Valid code unit passes schema validation
   * - Usage Notes: Requires type='code' with code config
   * - Quality Contribution: Verifies happy path validation
   * - Worked Example: Complete code unit → success: true
   */
  it('should validate CodeUnit with all required fields', () => {
    const validCodeUnit = {
      slug: 'test-runner',
      type: 'code',
      version: '1.0.0',
      inputs: [{ name: 'code_file', type: 'file', required: true }],
      outputs: [{ name: 'result', type: 'data', data_type: 'boolean', required: true }],
      code: { script: 'scripts/main.sh', timeout: 60 },
    };

    const result = WorkUnitSchema.safeParse(validCodeUnit);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe('code');
    }
  });

  /**
   * Test Doc:
   * - Why: UserInputUnit must validate with all required fields
   * - Contract: Valid user-input unit passes schema validation
   * - Usage Notes: Requires type='user-input' with user_input config
   * - Quality Contribution: Verifies happy path validation
   * - Worked Example: Complete user-input unit → success: true
   */
  it('should validate UserInputUnit with all required fields', () => {
    const validUserInputUnit = {
      slug: 'user-requirements',
      type: 'user-input',
      version: '1.0.0',
      inputs: [],
      outputs: [{ name: 'answer', type: 'data', data_type: 'text', required: true }],
      user_input: { question_type: 'text', prompt: 'Enter your requirements:' },
    };

    const result = WorkUnitSchema.safeParse(validUserInputUnit);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe('user-input');
    }
  });
});

describe('WorkUnitSchema - Missing Type Field', () => {
  /**
   * Test Doc:
   * - Why: Spec requires type field explicitly (Q7 resolution)
   * - Contract: Missing type returns validation error
   * - Usage Notes: Type field is required, not optional
   * - Quality Contribution: Catches units without type declaration
   * - Worked Example: { slug: 'test' } → success: false
   */
  it('should reject unit with missing type field', () => {
    const invalidUnit = {
      slug: 'test-unit',
      version: '1.0.0',
      inputs: [],
      outputs: [{ name: 'out', type: 'data', data_type: 'text', required: true }],
      // Missing type field
    };

    const result = WorkUnitSchema.safeParse(invalidUnit);
    expect(result.success).toBe(false);
  });

  /**
   * Test Doc:
   * - Why: Type field must be one of the valid discriminator values
   * - Contract: Invalid type value returns validation error
   * - Usage Notes: Only 'agent', 'code', 'user-input' are valid
   * - Quality Contribution: Catches typos and invalid type values
   * - Worked Example: type: 'invalid' → success: false
   */
  it('should reject unit with invalid type value', () => {
    const invalidUnit = {
      slug: 'test-unit',
      type: 'invalid',
      version: '1.0.0',
      inputs: [],
      outputs: [{ name: 'out', type: 'data', data_type: 'text', required: true }],
      agent: { prompt_template: 'prompts/main.md' },
    };

    const result = WorkUnitSchema.safeParse(invalidUnit);
    expect(result.success).toBe(false);
  });
});

describe('WorkUnitSchema - Type/Config Mismatch', () => {
  /**
   * Test Doc:
   * - Why: Agent type requires agent config section
   * - Contract: type='agent' without agent config fails validation
   * - Usage Notes: Each type requires its corresponding config
   * - Quality Contribution: Catches incomplete configurations
   * - Worked Example: type: 'agent' without agent: → success: false
   */
  it('should reject agent type without agent config', () => {
    const invalidUnit = {
      slug: 'test-unit',
      type: 'agent',
      version: '1.0.0',
      inputs: [],
      outputs: [{ name: 'out', type: 'data', data_type: 'text', required: true }],
      // Missing agent config
    };

    const result = WorkUnitSchema.safeParse(invalidUnit);
    expect(result.success).toBe(false);
  });

  /**
   * Test Doc:
   * - Why: Agent type should not have code config
   * - Contract: type='agent' with code config fails validation
   * - Usage Notes: Config section must match type
   * - Quality Contribution: Catches copy-paste errors
   * - Worked Example: type: 'agent' with code: → success: false
   */
  it('should reject agent type with wrong config section', () => {
    const invalidUnit = {
      slug: 'test-unit',
      type: 'agent',
      version: '1.0.0',
      inputs: [],
      outputs: [{ name: 'out', type: 'data', data_type: 'text', required: true }],
      code: { script: 'scripts/main.sh' }, // Wrong config for agent type
    };

    const result = WorkUnitSchema.safeParse(invalidUnit);
    expect(result.success).toBe(false);
  });

  /**
   * Test Doc:
   * - Why: Code type requires code config section
   * - Contract: type='code' without code config fails validation
   * - Usage Notes: Each type requires its corresponding config
   * - Quality Contribution: Catches incomplete configurations
   * - Worked Example: type: 'code' without code: → success: false
   */
  it('should reject code type without code config', () => {
    const invalidUnit = {
      slug: 'test-unit',
      type: 'code',
      version: '1.0.0',
      inputs: [],
      outputs: [{ name: 'out', type: 'data', data_type: 'boolean', required: true }],
      // Missing code config
    };

    const result = WorkUnitSchema.safeParse(invalidUnit);
    expect(result.success).toBe(false);
  });
});

describe('WorkUnitSchema - Input/Output Validation', () => {
  /**
   * Test Doc:
   * - Why: Slug must follow naming convention (per DYK #1: no hyphens in reserved)
   * - Contract: Invalid slug format fails validation
   * - Usage Notes: Slug must start with letter, contain only lowercase, numbers, hyphens
   * - Quality Contribution: Catches invalid slug names
   * - Worked Example: slug: '123-bad' → success: false
   */
  it('should reject invalid slug format', () => {
    const invalidUnit = {
      slug: '123-bad', // Must start with letter
      type: 'agent',
      version: '1.0.0',
      inputs: [],
      outputs: [{ name: 'out', type: 'data', data_type: 'text', required: true }],
      agent: { prompt_template: 'prompts/main.md' },
    };

    const result = WorkUnitSchema.safeParse(invalidUnit);
    expect(result.success).toBe(false);
  });

  /**
   * Test Doc:
   * - Why: data_type is required when input type is 'data' (per DYK #1)
   * - Contract: Input with type='data' but no data_type fails validation
   * - Usage Notes: Zod refine enforces this conditionally
   * - Quality Contribution: Catches incomplete data inputs
   * - Worked Example: type: 'data' without data_type → success: false
   */
  it('should require data_type when input type is data', () => {
    const invalidUnit = {
      slug: 'test-unit',
      type: 'agent',
      version: '1.0.0',
      inputs: [
        {
          name: 'input1',
          type: 'data',
          // Missing data_type - should be required for data type
          required: true,
        },
      ],
      outputs: [{ name: 'out', type: 'data', data_type: 'text', required: true }],
      agent: { prompt_template: 'prompts/main.md' },
    };

    const result = WorkUnitSchema.safeParse(invalidUnit);
    expect(result.success).toBe(false);
  });

  /**
   * Test Doc:
   * - Why: file inputs don't require data_type
   * - Contract: Input with type='file' without data_type passes validation
   * - Usage Notes: data_type is only required for type='data'
   * - Quality Contribution: Verifies conditional validation works correctly
   * - Worked Example: type: 'file' without data_type → success: true
   */
  it('should allow file input without data_type', () => {
    const validUnit = {
      slug: 'test-unit',
      type: 'code',
      version: '1.0.0',
      inputs: [
        {
          name: 'input_file',
          type: 'file',
          // No data_type - allowed for file type
          required: true,
        },
      ],
      outputs: [{ name: 'out', type: 'data', data_type: 'boolean', required: true }],
      code: { script: 'scripts/main.sh' },
    };

    const result = WorkUnitSchema.safeParse(validUnit);
    expect(result.success).toBe(true);
  });

  /**
   * Test Doc:
   * - Why: Input names must follow naming convention
   * - Contract: Invalid input name format fails validation
   * - Usage Notes: Names must be lowercase with underscores, start with letter
   * - Quality Contribution: Catches invalid input names
   * - Worked Example: name: 'BadName' → success: false
   */
  it('should reject invalid input name format', () => {
    const invalidUnit = {
      slug: 'test-unit',
      type: 'agent',
      version: '1.0.0',
      inputs: [
        {
          name: 'BadName', // Must be lowercase with underscores
          type: 'data',
          data_type: 'text',
          required: true,
        },
      ],
      outputs: [{ name: 'out', type: 'data', data_type: 'text', required: true }],
      agent: { prompt_template: 'prompts/main.md' },
    };

    const result = WorkUnitSchema.safeParse(invalidUnit);
    expect(result.success).toBe(false);
  });
});

describe('WorkUnitSchema - UserInput Specific Validation', () => {
  /**
   * Test Doc:
   * - Why: single/multi question types require options
   * - Contract: question_type='single' without options fails validation
   * - Usage Notes: options must have at least 2 items
   * - Quality Contribution: Catches incomplete choice questions
   * - Worked Example: question_type: 'single' without options → success: false
   */
  it('should require options for single question type', () => {
    const invalidUnit = {
      slug: 'test-user-input',
      type: 'user-input',
      version: '1.0.0',
      inputs: [],
      outputs: [{ name: 'answer', type: 'data', data_type: 'text', required: true }],
      user_input: {
        question_type: 'single',
        prompt: 'Choose one:',
        // Missing options - required for single
      },
    };

    const result = WorkUnitSchema.safeParse(invalidUnit);
    expect(result.success).toBe(false);
  });

  /**
   * Test Doc:
   * - Why: options must have at least 2 items for meaningful choice
   * - Contract: question_type='single' with 1 option fails validation
   * - Usage Notes: Minimum 2 options required
   * - Quality Contribution: Catches meaningless single-option choice
   * - Worked Example: options with 1 item → success: false
   */
  it('should require at least 2 options for single question type', () => {
    const invalidUnit = {
      slug: 'test-user-input',
      type: 'user-input',
      version: '1.0.0',
      inputs: [],
      outputs: [{ name: 'answer', type: 'data', data_type: 'text', required: true }],
      user_input: {
        question_type: 'single',
        prompt: 'Choose one:',
        options: [{ key: 'a', label: 'Option A' }], // Only 1 option
      },
    };

    const result = WorkUnitSchema.safeParse(invalidUnit);
    expect(result.success).toBe(false);
  });

  /**
   * Test Doc:
   * - Why: text question type doesn't require options
   * - Contract: question_type='text' without options passes validation
   * - Usage Notes: options only required for single/multi
   * - Quality Contribution: Verifies conditional validation works correctly
   * - Worked Example: question_type: 'text' without options → success: true
   */
  it('should allow text question type without options', () => {
    const validUnit = {
      slug: 'test-user-input',
      type: 'user-input',
      version: '1.0.0',
      inputs: [],
      outputs: [{ name: 'answer', type: 'data', data_type: 'text', required: true }],
      user_input: {
        question_type: 'text',
        prompt: 'Enter your answer:',
        // No options - allowed for text type
      },
    };

    const result = WorkUnitSchema.safeParse(validUnit);
    expect(result.success).toBe(true);
  });

  /**
   * Test Doc:
   * - Why: Valid single choice with proper options should pass
   * - Contract: question_type='single' with 2+ valid options passes validation
   * - Usage Notes: Each option needs key and label
   * - Quality Contribution: Verifies complete choice configuration
   * - Worked Example: single with 2 options → success: true
   */
  it('should validate single question type with valid options', () => {
    const validUnit = {
      slug: 'test-user-input',
      type: 'user-input',
      version: '1.0.0',
      inputs: [],
      outputs: [{ name: 'answer', type: 'data', data_type: 'text', required: true }],
      user_input: {
        question_type: 'single',
        prompt: 'Choose one:',
        options: [
          { key: 'a', label: 'Option A' },
          { key: 'b', label: 'Option B' },
        ],
      },
    };

    const result = WorkUnitSchema.safeParse(validUnit);
    expect(result.success).toBe(true);
  });
});

describe('formatZodErrors', () => {
  /**
   * Test Doc:
   * - Why: Zod default errors are developer-hostile (per DYK #4)
   * - Contract: formatZodErrors transforms Zod issues to actionable messages
   * - Usage Notes: Used before passing to E182 error factory
   * - Quality Contribution: Verifies error messages are user-friendly
   * - Worked Example: Zod error → human-readable string array
   */
  it('should format Zod errors into actionable messages', () => {
    const invalidUnit = {
      slug: '123-bad', // Invalid
      type: 'invalid', // Invalid
      version: '1.0.0',
      inputs: [],
      outputs: [],
    };

    const result = WorkUnitSchema.safeParse(invalidUnit);
    expect(result.success).toBe(false);

    if (!result.success) {
      const formattedErrors = formatZodErrors(result.error, '123-bad');
      expect(formattedErrors.length).toBeGreaterThan(0);
      // Each error should be a human-readable string
      for (const err of formattedErrors) {
        expect(typeof err).toBe('string');
        expect(err.length).toBeGreaterThan(0);
      }
    }
  });
});
