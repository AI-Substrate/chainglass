/**
 * WorkUnit Type Compatibility Tests
 *
 * These tests verify that the new WorkUnit discriminated union types
 * structurally satisfy NarrowWorkUnit for backward compatibility.
 *
 * TDD RED Phase: Tests import types that don't exist yet.
 */

import { describe, expect, it } from 'vitest';
// Import narrow types from package interfaces
import type {
  NarrowWorkUnit,
  NarrowWorkUnitInput,
  NarrowWorkUnitOutput,
} from '../../../../../packages/positional-graph/src/interfaces/positional-graph-service.interface.js';

// Import new types from the feature folder
import type {
  AgenticWorkUnit,
  CodeUnit,
  UserInputUnit,
  WorkUnit,
  WorkUnitInput,
  WorkUnitOutput,
} from '../../../../../packages/positional-graph/src/features/029-agentic-work-units/index.js';

describe('WorkUnit Type Compatibility', () => {
  /**
   * Test Doc:
   * - Why: Backward compatibility with collateInputs() consumers
   * - Contract: AgenticWorkUnit structurally extends NarrowWorkUnit
   * - Usage Notes: Pass WorkUnit where NarrowWorkUnit expected
   * - Quality Contribution: Catches field mismatches that break DI
   * - Worked Example: AgenticWorkUnit assigned to NarrowWorkUnit variable
   */
  it('AgenticWorkUnit should satisfy NarrowWorkUnit', () => {
    const unit: AgenticWorkUnit = {
      slug: 'test-agent',
      type: 'agent',
      version: '1.0.0',
      inputs: [{ name: 'input1', type: 'data', data_type: 'text', required: true }],
      outputs: [{ name: 'output1', type: 'data', data_type: 'text', required: true }],
      agent: { prompt_template: 'prompts/main.md' },
    };

    // This assignment must compile - structural subtyping (per DYK #3)
    const narrow: NarrowWorkUnit = unit;

    expect(narrow.slug).toBe('test-agent');
    expect(narrow.inputs).toHaveLength(1);
    expect(narrow.outputs).toHaveLength(1);
  });

  /**
   * Test Doc:
   * - Why: Backward compatibility with collateInputs() consumers
   * - Contract: CodeUnit structurally extends NarrowWorkUnit
   * - Usage Notes: Pass WorkUnit where NarrowWorkUnit expected
   * - Quality Contribution: Catches field mismatches that break DI
   * - Worked Example: CodeUnit assigned to NarrowWorkUnit variable
   */
  it('CodeUnit should satisfy NarrowWorkUnit', () => {
    const unit: CodeUnit = {
      slug: 'test-code',
      type: 'code',
      version: '1.0.0',
      inputs: [{ name: 'script_input', type: 'file', required: true }],
      outputs: [{ name: 'result', type: 'data', data_type: 'boolean', required: true }],
      code: { script: 'scripts/main.sh', timeout: 60 },
    };

    // This assignment must compile - structural subtyping (per DYK #3)
    const narrow: NarrowWorkUnit = unit;

    expect(narrow.slug).toBe('test-code');
    expect(narrow.inputs).toHaveLength(1);
    expect(narrow.outputs).toHaveLength(1);
  });

  /**
   * Test Doc:
   * - Why: Backward compatibility with collateInputs() consumers
   * - Contract: UserInputUnit structurally extends NarrowWorkUnit
   * - Usage Notes: Pass WorkUnit where NarrowWorkUnit expected
   * - Quality Contribution: Catches field mismatches that break DI
   * - Worked Example: UserInputUnit assigned to NarrowWorkUnit variable
   */
  it('UserInputUnit should satisfy NarrowWorkUnit', () => {
    const unit: UserInputUnit = {
      slug: 'test-user-input',
      type: 'user-input',
      version: '1.0.0',
      inputs: [],
      outputs: [{ name: 'answer', type: 'data', data_type: 'text', required: true }],
      user_input: { question_type: 'text', prompt: 'Enter your answer:' },
    };

    // This assignment must compile - structural subtyping (per DYK #3)
    const narrow: NarrowWorkUnit = unit;

    expect(narrow.slug).toBe('test-user-input');
    expect(narrow.inputs).toHaveLength(0);
    expect(narrow.outputs).toHaveLength(1);
  });

  /**
   * Test Doc:
   * - Why: Union type must satisfy narrow type for any variant
   * - Contract: WorkUnit union type can be assigned to NarrowWorkUnit
   * - Usage Notes: Use this pattern for type guards
   * - Quality Contribution: Verifies discriminated union compatibility
   * - Worked Example: WorkUnit assigned to NarrowWorkUnit variable
   */
  it('WorkUnit union should satisfy NarrowWorkUnit', () => {
    const agentUnit: WorkUnit = {
      slug: 'test-agent',
      type: 'agent',
      version: '1.0.0',
      inputs: [],
      outputs: [{ name: 'output1', type: 'data', data_type: 'text', required: true }],
      agent: { prompt_template: 'prompts/main.md' },
    };

    // This assignment must compile - structural subtyping
    const narrow: NarrowWorkUnit = agentUnit;

    expect(narrow.slug).toBe('test-agent');
  });

  /**
   * Test Doc:
   * - Why: WorkUnitInput must be compatible with NarrowWorkUnitInput
   * - Contract: WorkUnitInput with optional data_type is assignable to NarrowWorkUnitInput
   * - Usage Notes: data_type is optional at type level (per DYK #1), Zod enforces when type='data'
   * - Quality Contribution: Catches input type incompatibilities
   * - Worked Example: WorkUnitInput assigned to NarrowWorkUnitInput
   */
  it('WorkUnitInput should satisfy NarrowWorkUnitInput', () => {
    // Input with data_type (for type='data')
    const dataInput: WorkUnitInput = {
      name: 'input1',
      type: 'data',
      data_type: 'text',
      required: true,
    };

    // Input without data_type (for type='file')
    const fileInput: WorkUnitInput = {
      name: 'input2',
      type: 'file',
      required: true,
    };

    // Both must compile when assigned to narrow type
    const narrowData: NarrowWorkUnitInput = dataInput;
    const narrowFile: NarrowWorkUnitInput = fileInput;

    expect(narrowData.name).toBe('input1');
    expect(narrowFile.name).toBe('input2');
  });

  /**
   * Test Doc:
   * - Why: WorkUnitOutput must be compatible with NarrowWorkUnitOutput
   * - Contract: WorkUnitOutput with optional data_type is assignable to NarrowWorkUnitOutput
   * - Usage Notes: Mirrors input compatibility
   * - Quality Contribution: Catches output type incompatibilities
   * - Worked Example: WorkUnitOutput assigned to NarrowWorkUnitOutput
   */
  it('WorkUnitOutput should satisfy NarrowWorkUnitOutput', () => {
    const output: WorkUnitOutput = {
      name: 'output1',
      type: 'data',
      data_type: 'text',
      required: true,
    };

    // Must compile when assigned to narrow type
    const narrow: NarrowWorkUnitOutput = output;

    expect(narrow.name).toBe('output1');
  });
});

describe('WorkUnit Type Discrimination', () => {
  /**
   * Test Doc:
   * - Why: Type narrowing must work for runtime dispatch
   * - Contract: TypeScript narrows WorkUnit based on type field
   * - Usage Notes: Use switch statement or if checks on type field
   * - Quality Contribution: Verifies discriminated union works correctly
   * - Worked Example: switch(unit.type) narrows to specific type
   */
  it('should narrow types based on type field', () => {
    const agentUnit: WorkUnit = {
      slug: 'test-agent',
      type: 'agent',
      version: '1.0.0',
      inputs: [],
      outputs: [{ name: 'output1', type: 'data', data_type: 'text', required: true }],
      agent: { prompt_template: 'prompts/main.md' },
    };

    // Type narrowing via switch
    let promptTemplate: string | undefined;
    if (agentUnit.type === 'agent') {
      // TypeScript should narrow to AgenticWorkUnit here
      promptTemplate = agentUnit.agent.prompt_template;
    }

    expect(promptTemplate).toBe('prompts/main.md');
  });

  /**
   * Test Doc:
   * - Why: Each unit type must have its specific config accessible
   * - Contract: After narrowing, type-specific fields are accessible
   * - Usage Notes: Use type guards to access agent/code/user_input fields
   * - Quality Contribution: Verifies type-specific config access
   * - Worked Example: code unit narrows to CodeUnit with code.script
   */
  it('should access type-specific config after narrowing', () => {
    const codeUnit: WorkUnit = {
      slug: 'test-code',
      type: 'code',
      version: '1.0.0',
      inputs: [],
      outputs: [{ name: 'result', type: 'data', data_type: 'boolean', required: true }],
      code: { script: 'scripts/main.sh', timeout: 120 },
    };

    let script: string | undefined;
    let timeout: number | undefined;
    if (codeUnit.type === 'code') {
      script = codeUnit.code.script;
      timeout = codeUnit.code.timeout;
    }

    expect(script).toBe('scripts/main.sh');
    expect(timeout).toBe(120);
  });
});
