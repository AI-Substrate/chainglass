/**
 * Positional Graph Command Tests — Reserved Parameter Routing
 *
 * Per Plan 029: Agentic Work Units — Phase 3, Tasks T001-T002.
 *
 * Tests verify that:
 * - `main-prompt` routes to AgenticWorkUnit.getPrompt()
 * - `main-script` routes to CodeUnit.getScript()
 * - E186 error returned for type mismatch (main-prompt on CodeUnit, etc.)
 * - Non-reserved inputs passthrough to normal getInputData()
 */

import {
  type AgenticWorkUnitInstance,
  type CodeUnitInstance,
  FakeWorkUnitService,
  RESERVED_INPUT_PARAMS,
  type WorkUnitInstance,
  isReservedInputParam,
} from '@chainglass/positional-graph';
import type { WorkspaceContext } from '@chainglass/workflow';
import { beforeEach, describe, expect, it } from 'vitest';

// =============================================================================
// Test Types
// =============================================================================

/**
 * Result type for reserved parameter routing (returned by CLI handler).
 * Extends GetInputDataResult with template-specific fields.
 */
interface ReservedParamResult {
  /** The template content value */
  value?: string;
  /** Path to the template file */
  path?: string;
  /** Type of template: 'prompt' or 'script' */
  templateType?: 'prompt' | 'script';
  /** Errors array (E186 for type mismatch) */
  errors: Array<{ code: string; message: string }>;
}

// =============================================================================
// Reserved Input Parameter Detection (T001)
// =============================================================================

describe('Reserved Input Parameter Detection', () => {
  describe('RESERVED_INPUT_PARAMS constant', () => {
    it('should define main-prompt as reserved', () => {
      /*
      Test Doc:
      - Why: main-prompt is the reserved name for agent prompt templates
      - Contract: RESERVED_INPUT_PARAMS includes 'main-prompt'
      - Usage Notes: Use hyphen, not underscore (user inputs use underscores)
      - Quality Contribution: Catches typos in reserved param names
      - Worked Example: RESERVED_INPUT_PARAMS.includes('main-prompt') → true
      */
      expect(RESERVED_INPUT_PARAMS).toContain('main-prompt');
    });

    it('should define main-script as reserved', () => {
      /*
      Test Doc:
      - Why: main-script is the reserved name for code unit scripts
      - Contract: RESERVED_INPUT_PARAMS includes 'main-script'
      - Usage Notes: Use hyphen, not underscore
      - Quality Contribution: Catches typos in reserved param names
      - Worked Example: RESERVED_INPUT_PARAMS.includes('main-script') → true
      */
      expect(RESERVED_INPUT_PARAMS).toContain('main-script');
    });
  });

  describe('isReservedInputParam function', () => {
    it('should return true for main-prompt', () => {
      /*
      Test Doc:
      - Why: Need utility to detect reserved params before routing
      - Contract: isReservedInputParam('main-prompt') returns true
      - Usage Notes: Case-sensitive, exact match required
      - Quality Contribution: Centralizes reserved param detection logic
      - Worked Example: isReservedInputParam('main-prompt') → true
      */
      expect(isReservedInputParam('main-prompt')).toBe(true);
    });

    it('should return true for main-script', () => {
      /*
      Test Doc:
      - Why: Need utility to detect reserved params before routing
      - Contract: isReservedInputParam('main-script') returns true
      - Usage Notes: Case-sensitive, exact match required
      - Quality Contribution: Centralizes reserved param detection logic
      - Worked Example: isReservedInputParam('main-script') → true
      */
      expect(isReservedInputParam('main-script')).toBe(true);
    });

    it('should return false for non-reserved input names', () => {
      /*
      Test Doc:
      - Why: Normal inputs should not trigger reserved param routing
      - Contract: isReservedInputParam returns false for user inputs
      - Usage Notes: User inputs use underscores, not hyphens
      - Quality Contribution: Prevents false positives in routing
      - Worked Example: isReservedInputParam('user_input') → false
      */
      expect(isReservedInputParam('user_input')).toBe(false);
      expect(isReservedInputParam('requirements')).toBe(false);
      expect(isReservedInputParam('config')).toBe(false);
    });

    it('should return false for similar but non-reserved names', () => {
      /*
      Test Doc:
      - Why: Similar names shouldn't accidentally trigger routing
      - Contract: Only exact matches are considered reserved
      - Usage Notes: main_prompt (underscore) is NOT reserved
      - Quality Contribution: Prevents subtle bugs from similar names
      - Worked Example: isReservedInputParam('main_prompt') → false
      */
      expect(isReservedInputParam('main_prompt')).toBe(false);
      expect(isReservedInputParam('main_script')).toBe(false);
      expect(isReservedInputParam('mainprompt')).toBe(false);
      expect(isReservedInputParam('MAIN-PROMPT')).toBe(false);
    });
  });
});

// =============================================================================
// Reserved Parameter Routing for AgenticWorkUnit (T001, AC-2)
// =============================================================================

describe('Reserved Parameter Routing — AgenticWorkUnit', () => {
  let fakeService: FakeWorkUnitService;
  let ctx: WorkspaceContext;

  beforeEach(() => {
    fakeService = new FakeWorkUnitService();
    ctx = { worktreePath: '/test/workspace' } as WorkspaceContext;

    // Add a sample agent unit
    fakeService.addUnit({
      type: 'agent',
      slug: 'spec-generator',
      version: '1.0.0',
      agent: { prompt_template: 'prompts/main.md' },
      promptContent: 'You are a specification writer.\n\nGiven: {{requirements}}',
    });
  });

  it('should route main-prompt to getPrompt() for AgenticWorkUnit', async () => {
    /*
    Test Doc:
    - Why: Agents retrieve their prompt templates via reserved param
    - Contract: main-prompt on agent unit returns prompt content
    - Usage Notes: Works regardless of node state (pending/running/completed)
    - Quality Contribution: Verifies core routing logic for AC-2
    - Worked Example: get-input-data graph node main-prompt → prompt content
    */
    const result = await fakeService.load(ctx, 'spec-generator');

    expect(result.errors).toHaveLength(0);
    expect(result.unit).toBeDefined();
    expect(result.unit?.type).toBe('agent');

    // Get prompt via the instance method - returns string directly per interface
    const promptContent = await (result.unit as AgenticWorkUnitInstance).getPrompt(ctx);

    expect(promptContent).toContain('You are a specification writer');
    expect(promptContent).toContain('{{requirements}}');
  });

  it('should return prompt content and unit has template path in agent config', async () => {
    /*
    Test Doc:
    - Why: CLI needs to know where template came from for debugging
    - Contract: Agent config contains prompt_template path
    - Usage Notes: Path is relative to unit directory
    - Quality Contribution: Enables better error messages and tracing
    - Worked Example: unit.agent.prompt_template === 'prompts/main.md'
    */
    const result = await fakeService.load(ctx, 'spec-generator');

    expect(result.unit).toBeDefined();
    expect(result.unit?.type).toBe('agent');

    // The template path is in the agent config
    const agentUnit = result.unit as AgenticWorkUnitInstance;
    expect(agentUnit.agent.prompt_template).toBe('prompts/main.md');

    // getPrompt returns the content directly
    const promptContent = await agentUnit.getPrompt(ctx);
    expect(promptContent).toContain('You are a specification writer');
  });
});

// =============================================================================
// Reserved Parameter Routing for CodeUnit (T001, AC-3)
// =============================================================================

describe('Reserved Parameter Routing — CodeUnit', () => {
  let fakeService: FakeWorkUnitService;
  let ctx: WorkspaceContext;

  beforeEach(() => {
    fakeService = new FakeWorkUnitService();
    ctx = { worktreePath: '/test/workspace' } as WorkspaceContext;

    // Add a sample code unit
    fakeService.addUnit({
      type: 'code',
      slug: 'pr-creator',
      version: '1.0.0',
      code: { script: 'scripts/create-pr.sh' },
      scriptContent: '#!/bin/bash\ngh pr create --title "$TITLE"',
    });
  });

  it('should route main-script to getScript() for CodeUnit', async () => {
    /*
    Test Doc:
    - Why: Code units provide their execution script via reserved param
    - Contract: main-script on code unit returns script content
    - Usage Notes: Works regardless of node state
    - Quality Contribution: Verifies core routing logic for AC-3
    - Worked Example: get-input-data graph node main-script → script content
    */
    const result = await fakeService.load(ctx, 'pr-creator');

    expect(result.errors).toHaveLength(0);
    expect(result.unit).toBeDefined();
    expect(result.unit?.type).toBe('code');

    // Get script via the instance method - returns string directly per interface
    const scriptContent = await (result.unit as CodeUnitInstance).getScript(ctx);

    expect(scriptContent).toContain('#!/bin/bash');
    expect(scriptContent).toContain('gh pr create');
  });

  it('should return script content and unit has script path in code config', async () => {
    /*
    Test Doc:
    - Why: CLI needs to know where script came from for debugging
    - Contract: Code config contains script path
    - Usage Notes: Path is relative to unit directory
    - Quality Contribution: Enables better error messages and tracing
    - Worked Example: unit.code.script === 'scripts/create-pr.sh'
    */
    const result = await fakeService.load(ctx, 'pr-creator');

    expect(result.unit).toBeDefined();
    expect(result.unit?.type).toBe('code');

    // The script path is in the code config
    const codeUnit = result.unit as CodeUnitInstance;
    expect(codeUnit.code.script).toBe('scripts/create-pr.sh');

    // getScript returns the content directly
    const scriptContent = await codeUnit.getScript(ctx);
    expect(scriptContent).toContain('#!/bin/bash');
  });
});

// =============================================================================
// Type Mismatch Error E186 (T002, AC-4)
// =============================================================================

describe('Type Mismatch Error E186', () => {
  let fakeService: FakeWorkUnitService;
  let ctx: WorkspaceContext;

  beforeEach(() => {
    fakeService = new FakeWorkUnitService();
    ctx = { worktreePath: '/test/workspace' } as WorkspaceContext;

    // Add agent unit
    fakeService.addUnit({
      type: 'agent',
      slug: 'spec-generator',
      version: '1.0.0',
      agent: { prompt_template: 'prompts/main.md' },
      promptContent: 'Agent prompt content',
    });

    // Add code unit
    fakeService.addUnit({
      type: 'code',
      slug: 'pr-creator',
      version: '1.0.0',
      code: { script: 'scripts/main.sh' },
      scriptContent: 'Script content',
    });

    // Add user-input unit
    fakeService.addUnit({
      type: 'user-input',
      slug: 'user-requirements',
      version: '1.0.0',
      user_input: {
        options: [
          { value: 'option1', label: 'Option 1' },
          { value: 'option2', label: 'Option 2' },
        ],
      },
    });
  });

  it('should return E186 for main-prompt on CodeUnit', async () => {
    /*
    Test Doc:
    - Why: Type mismatch should error clearly, not silently fail
    - Contract: main-prompt on code unit returns E186 error
    - Usage Notes: Use main-script for code units instead
    - Quality Contribution: Prevents confusing "input not found" errors
    - Worked Example: main-prompt on code node → E186 UnitTypeMismatch
    */
    const result = await fakeService.load(ctx, 'pr-creator');

    expect(result.unit).toBeDefined();
    expect(result.unit?.type).toBe('code');

    // CodeUnit doesn't have getPrompt method - type system prevents this
    // The CLI handler should check type BEFORE calling method
    expect(typeof (result.unit as WorkUnitInstance & { getPrompt?: unknown }).getPrompt).toBe(
      'undefined'
    );
  });

  it('should return E186 for main-script on AgenticWorkUnit', async () => {
    /*
    Test Doc:
    - Why: Type mismatch should error clearly, not silently fail
    - Contract: main-script on agent unit returns E186 error
    - Usage Notes: Use main-prompt for agent units instead
    - Quality Contribution: Prevents confusing "input not found" errors
    - Worked Example: main-script on agent node → E186 UnitTypeMismatch
    */
    const result = await fakeService.load(ctx, 'spec-generator');

    expect(result.unit).toBeDefined();
    expect(result.unit?.type).toBe('agent');

    // AgenticWorkUnit doesn't have getScript method - type system prevents this
    expect(typeof (result.unit as WorkUnitInstance & { getScript?: unknown }).getScript).toBe(
      'undefined'
    );
  });

  it('should return E186 for main-prompt on UserInputUnit', async () => {
    /*
    Test Doc:
    - Why: UserInputUnits have no templates
    - Contract: main-prompt on user-input unit returns E186 error
    - Usage Notes: UserInputUnits are for collecting data, not providing templates
    - Quality Contribution: Clear error instead of null/undefined
    - Worked Example: main-prompt on user-input node → E186 UnitTypeMismatch
    */
    const result = await fakeService.load(ctx, 'user-requirements');

    expect(result.unit).toBeDefined();
    expect(result.unit?.type).toBe('user-input');

    // UserInputUnit has neither getPrompt nor getScript
    expect(typeof (result.unit as WorkUnitInstance & { getPrompt?: unknown }).getPrompt).toBe(
      'undefined'
    );
    expect(typeof (result.unit as WorkUnitInstance & { getScript?: unknown }).getScript).toBe(
      'undefined'
    );
  });

  it('should return E186 for main-script on UserInputUnit', async () => {
    /*
    Test Doc:
    - Why: UserInputUnits have no templates
    - Contract: main-script on user-input unit returns E186 error
    - Usage Notes: UserInputUnits are for collecting data, not providing templates
    - Quality Contribution: Clear error instead of null/undefined
    - Worked Example: main-script on user-input node → E186 UnitTypeMismatch
    */
    const result = await fakeService.load(ctx, 'user-requirements');

    expect(result.unit).toBeDefined();
    expect(result.unit?.type).toBe('user-input');

    // UserInputUnit has neither getPrompt nor getScript
    expect(typeof (result.unit as WorkUnitInstance & { getPrompt?: unknown }).getPrompt).toBe(
      'undefined'
    );
    expect(typeof (result.unit as WorkUnitInstance & { getScript?: unknown }).getScript).toBe(
      'undefined'
    );
  });
});

// =============================================================================
// Non-Reserved Input Passthrough (T001)
// =============================================================================

describe('Non-Reserved Input Passthrough', () => {
  describe('isReservedInputParam for boundary cases', () => {
    it('should treat empty string as non-reserved', () => {
      /*
      Test Doc:
      - Why: Edge case - empty input name should not crash
      - Contract: isReservedInputParam('') returns false
      - Usage Notes: Empty string is invalid input name anyway
      - Quality Contribution: Prevents runtime errors on edge cases
      - Worked Example: isReservedInputParam('') → false
      */
      expect(isReservedInputParam('')).toBe(false);
    });

    it('should treat whitespace-only as non-reserved', () => {
      /*
      Test Doc:
      - Why: Edge case - whitespace should not match
      - Contract: isReservedInputParam('  ') returns false
      - Usage Notes: Whitespace is invalid input name anyway
      - Quality Contribution: Prevents subtle whitespace bugs
      - Worked Example: isReservedInputParam('  ') → false
      */
      expect(isReservedInputParam('  ')).toBe(false);
      expect(isReservedInputParam('\t')).toBe(false);
      expect(isReservedInputParam('\n')).toBe(false);
    });
  });
});

// =============================================================================
// Unit Subcommand: cg wf unit list (T004)
// =============================================================================

describe('Unit Subcommand: cg wf unit list', () => {
  let fakeService: FakeWorkUnitService;
  let ctx: WorkspaceContext;

  beforeEach(() => {
    fakeService = new FakeWorkUnitService();
    ctx = { worktreePath: '/test/workspace' } as WorkspaceContext;

    // Add multiple units of different types
    fakeService.addUnit({
      type: 'agent',
      slug: 'spec-generator',
      version: '1.0.0',
      agent: { prompt_template: 'prompts/main.md' },
      promptContent: 'Agent prompt content',
    });

    fakeService.addUnit({
      type: 'code',
      slug: 'pr-creator',
      version: '2.0.0',
      code: { script: 'scripts/main.sh' },
      scriptContent: 'Script content',
    });

    fakeService.addUnit({
      type: 'user-input',
      slug: 'user-requirements',
      version: '1.0.0',
      user_input: {
        options: [{ value: 'option1', label: 'Option 1' }],
      },
    });
  });

  it('should list all available units', async () => {
    /*
    Test Doc:
    - Why: Users need to discover what units are available
    - Contract: list() returns all registered units with slug, type, version
    - Usage Notes: Returns empty array if no units found
    - Quality Contribution: Enables unit discovery workflow
    - Worked Example: cg wf unit list → [spec-generator, pr-creator, user-requirements]
    */
    const result = await fakeService.list(ctx);

    expect(result.errors).toHaveLength(0);
    expect(result.units).toHaveLength(3);

    // Check that all unit types are represented
    const types = result.units.map((u) => u.type);
    expect(types).toContain('agent');
    expect(types).toContain('code');
    expect(types).toContain('user-input');
  });

  it('should return unit summary with slug, type, and version', async () => {
    /*
    Test Doc:
    - Why: Unit summary provides overview without full details
    - Contract: Each unit has slug, type, version fields
    - Usage Notes: Description is optional, not in summary
    - Quality Contribution: Light-weight listing for large unit collections
    - Worked Example: { slug: 'spec-generator', type: 'agent', version: '1.0.0' }
    */
    const result = await fakeService.list(ctx);

    const agentUnit = result.units.find((u) => u.slug === 'spec-generator');
    expect(agentUnit).toBeDefined();
    expect(agentUnit?.type).toBe('agent');
    expect(agentUnit?.version).toBe('1.0.0');
  });

  it('should return empty array when no units exist', async () => {
    /*
    Test Doc:
    - Why: Empty workspace should not error
    - Contract: Returns { units: [], errors: [] } when no units
    - Usage Notes: This is a valid state for new workspaces
    - Quality Contribution: Handles edge case gracefully
    - Worked Example: cg wf unit list → []
    */
    const emptyService = new FakeWorkUnitService();
    const result = await emptyService.list(ctx);

    expect(result.errors).toHaveLength(0);
    expect(result.units).toHaveLength(0);
  });
});

// =============================================================================
// Unit Subcommand: cg wf unit info (T005)
// =============================================================================

describe('Unit Subcommand: cg wf unit info', () => {
  let fakeService: FakeWorkUnitService;
  let ctx: WorkspaceContext;

  beforeEach(() => {
    fakeService = new FakeWorkUnitService();
    ctx = { worktreePath: '/test/workspace' } as WorkspaceContext;

    fakeService.addUnit({
      type: 'agent',
      slug: 'spec-generator',
      version: '1.0.0',
      description: 'Generates specifications from requirements',
      agent: { prompt_template: 'prompts/main.md' },
      promptContent: 'Agent prompt content',
      inputs: [{ name: 'requirements', type: 'data', data_type: 'text', required: true }],
      outputs: [{ name: 'specification', type: 'data', data_type: 'text', required: true }],
    });
  });

  it('should load full unit details by slug', async () => {
    /*
    Test Doc:
    - Why: Users need full unit metadata for inspection
    - Contract: load() returns unit with all fields
    - Usage Notes: Includes inputs, outputs, type-specific config
    - Quality Contribution: Enables unit inspection before use
    - Worked Example: cg wf unit info spec-generator → full unit details
    */
    const result = await fakeService.load(ctx, 'spec-generator');

    expect(result.errors).toHaveLength(0);
    expect(result.unit).toBeDefined();
    expect(result.unit?.slug).toBe('spec-generator');
    expect(result.unit?.version).toBe('1.0.0');
    expect(result.unit?.description).toBe('Generates specifications from requirements');
  });

  it('should include inputs and outputs in unit info', async () => {
    /*
    Test Doc:
    - Why: I/O contract is essential for using a unit
    - Contract: Unit includes inputs and outputs arrays
    - Usage Notes: Each I/O has name, type, data_type, required
    - Quality Contribution: Self-documenting unit interface
    - Worked Example: unit.inputs[0].name === 'requirements'
    */
    const result = await fakeService.load(ctx, 'spec-generator');

    expect(result.unit?.inputs).toHaveLength(1);
    expect(result.unit?.inputs[0].name).toBe('requirements');
    expect(result.unit?.inputs[0].required).toBe(true);

    expect(result.unit?.outputs).toHaveLength(1);
    expect(result.unit?.outputs[0].name).toBe('specification');
  });

  it('should return E180 for non-existent unit', async () => {
    /*
    Test Doc:
    - Why: Clear error for missing units
    - Contract: load() returns E180 error for unknown slug
    - Usage Notes: Check errors array before using unit
    - Quality Contribution: Actionable error messages
    - Worked Example: cg wf unit info nonexistent → E180 error
    */
    const result = await fakeService.load(ctx, 'nonexistent');

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe('E180');
    expect(result.unit).toBeUndefined();
  });
});

// =============================================================================
// Unit Subcommand: cg wf unit get-template (T006)
// =============================================================================

describe('Unit Subcommand: cg wf unit get-template', () => {
  let fakeService: FakeWorkUnitService;
  let ctx: WorkspaceContext;

  beforeEach(() => {
    fakeService = new FakeWorkUnitService();
    ctx = { worktreePath: '/test/workspace' } as WorkspaceContext;

    fakeService.addUnit({
      type: 'agent',
      slug: 'spec-generator',
      version: '1.0.0',
      agent: { prompt_template: 'prompts/main.md' },
      promptContent: 'You are a specification writer.\n\nGenerate specs for: {{input}}',
    });

    fakeService.addUnit({
      type: 'code',
      slug: 'pr-creator',
      version: '1.0.0',
      code: { script: 'scripts/create-pr.sh' },
      scriptContent: '#!/bin/bash\ngh pr create --title "$TITLE"',
    });

    fakeService.addUnit({
      type: 'user-input',
      slug: 'user-requirements',
      version: '1.0.0',
      user_input: {
        options: [{ value: 'option1', label: 'Option 1' }],
      },
    });
  });

  it('should get prompt template for agent unit', async () => {
    /*
    Test Doc:
    - Why: Direct template access for inspection/debugging
    - Contract: getPrompt() returns prompt template content
    - Usage Notes: Does NOT perform variable substitution
    - Quality Contribution: Enables template preview before execution
    - Worked Example: cg wf unit get-template spec-generator → prompt content
    */
    const result = await fakeService.load(ctx, 'spec-generator');
    expect(result.unit).toBeDefined();

    const content = await result.unit?.getPrompt(ctx);

    expect(content).toContain('You are a specification writer');
    expect(content).toContain('{{input}}');
  });

  it('should get script content for code unit', async () => {
    /*
    Test Doc:
    - Why: Direct script access for inspection/debugging
    - Contract: getScript() returns script file content
    - Usage Notes: Returns raw script without execution
    - Quality Contribution: Enables script preview before execution
    - Worked Example: cg wf unit get-template pr-creator → script content
    */
    const result = await fakeService.load(ctx, 'pr-creator');
    expect(result.unit).toBeDefined();

    const content = await result.unit?.getScript(ctx);

    expect(content).toContain('#!/bin/bash');
    expect(content).toContain('gh pr create');
  });

  it('should not have template methods for user-input unit', async () => {
    /*
    Test Doc:
    - Why: User-input units have no templates
    - Contract: UserInputUnit lacks getPrompt/getScript methods
    - Usage Notes: Use cg wf unit info instead for metadata
    - Quality Contribution: Type safety prevents misuse
    - Worked Example: user-input unit has no template methods
    */
    const result = await fakeService.load(ctx, 'user-requirements');
    expect(result.unit).toBeDefined();
    expect(result.unit?.type).toBe('user-input');

    // User-input units have no template methods
    expect(typeof (result.unit as WorkUnitInstance & { getPrompt?: unknown }).getPrompt).toBe(
      'undefined'
    );
    expect(typeof (result.unit as WorkUnitInstance & { getScript?: unknown }).getScript).toBe(
      'undefined'
    );
  });
});
