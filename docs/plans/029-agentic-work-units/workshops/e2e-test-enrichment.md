# Workshop: E2E Test Enrichment for Full Work Unit Types

**Type**: Data Model + Test Strategy
**Plan**: 029-agentic-work-units
**Spec**: (Pre-specification workshop)
**Created**: 2026-02-04
**Status**: Draft

**Related Documents**:
- `docs/plans/029-agentic-work-units/workshops/workunit-loading.md`
- `docs/plans/029-agentic-work-units/research-dossier.md`
- `test/unit/positional-graph/test-helpers.ts`
- `test/e2e/positional-graph-execution-e2e.test.ts`

---

## Purpose

Define how to upgrade the E2E test fixtures and test-helpers from Plan 028 to use the full discriminated `WorkUnit` types (`AgenticWorkUnit`, `CodeUnit`, `UserInputUnit`) instead of the current `NarrowWorkUnit`. This enables testing of:

1. **Type-aware execution paths** — different behavior for agent vs code vs user-input units
2. **Reserved parameter routing** — `main-prompt` and `main-script` input handling
3. **Template content access** — agents can retrieve their prompt templates programmatically
4. **Row 0 semantics** — UserInputUnit as workflow entry point

## Key Questions Addressed

- How do we add `type` and config fields to test fixtures without breaking existing tests?
- What new test coverage is needed for each unit type?
- How do we stub template content access in tests?
- What changes are needed to the E2E test script?

---

## Overview

### Current State

The E2E test (Plan 028) uses `NarrowWorkUnit` fixtures with only:
- `slug: string`
- `inputs: NarrowWorkUnitInput[]`
- `outputs: NarrowWorkUnitOutput[]`

```typescript
// Current test-helpers.ts
export const e2eExecutionFixtures = {
  sampleSpecBuilder: createWorkUnit({
    slug: 'sample-spec-builder',
    inputs: [],
    outputs: [{ name: 'spec', type: 'data', required: true }],
  }),
  // ... (no type field, no agent/code/user_input config)
};
```

### Target State

Enriched fixtures with full discriminated types:
- `type: 'agent' | 'code' | 'user-input'`
- Type-specific config (`agent`, `code`, `user_input`)
- Template content available for reserved parameter tests

```typescript
// Target: Enriched fixtures
export const e2eEnrichedFixtures = {
  sampleSpecBuilder: {
    slug: 'sample-spec-builder',
    type: 'agent',
    version: '1.0.0',
    inputs: [],
    outputs: [{ name: 'spec', type: 'data', data_type: 'text', required: true }],
    agent: {
      prompt_template: 'prompts/main.md',
      supported_agents: ['claude-code'],
    },
  } satisfies AgenticWorkUnit,
};
```

---

## Type Definitions

### Enriched Input/Output (With data_type)

```typescript
// packages/positional-graph/src/interfaces/workunit.types.ts

/**
 * Enriched input declaration with data_type.
 */
export interface WorkUnitInput {
  name: string;
  type: 'data' | 'file';
  data_type?: 'text' | 'number' | 'boolean' | 'json';  // Required when type='data'
  required: boolean;
  description?: string;
}

/**
 * Enriched output declaration with data_type.
 */
export interface WorkUnitOutput {
  name: string;
  type: 'data' | 'file';
  data_type?: 'text' | 'number' | 'boolean' | 'json';
  required: boolean;
  description?: string;
}
```

### Discriminated Union Types

```typescript
// Full type definitions from workunit-loading workshop

interface WorkUnitBase {
  slug: string;
  version: string;
  description?: string;
  inputs: WorkUnitInput[];
  outputs: WorkUnitOutput[];
}

export interface AgenticWorkUnit extends WorkUnitBase {
  type: 'agent';
  agent: {
    prompt_template: string;
    system_prompt?: string;
    supported_agents?: ('claude-code' | 'copilot')[];
    estimated_tokens?: number;
  };
}

export interface CodeUnit extends WorkUnitBase {
  type: 'code';
  code: {
    script: string;
    timeout?: number;
  };
}

export interface UserInputUnit extends WorkUnitBase {
  type: 'user-input';
  user_input: {
    question_type: 'text' | 'single' | 'multi' | 'confirm';
    prompt: string;
    options?: Array<{ key: string; label: string; description?: string }>;
    default?: string | boolean;
  };
}

export type WorkUnit = AgenticWorkUnit | CodeUnit | UserInputUnit;

/**
 * NarrowWorkUnit remains for backward compatibility.
 * All WorkUnit types structurally satisfy NarrowWorkUnit.
 */
export type NarrowWorkUnit = Pick<WorkUnit, 'slug' | 'inputs' | 'outputs'>;
```

---

## Enriched Test Fixtures

### Naming Convention Note

**IMPORTANT**: The existing `e2eExecutionFixtures` in test-helpers.ts has inconsistent casing:
- `samplePrPreparer` (lowercase "r")
- `samplePrCreator` (uppercase "PR")

For the enriched fixtures, we standardize on **camelCase with acronyms lowercase** (`Pr` not `PR`):
- `samplePrPreparer` ✓
- `samplePrCreator` ✓ (changed from `samplePrCreator`)

When implementing, also update `e2eExecutionFixtures.samplePrCreator` → `samplePrCreator` for consistency.

### 7-Node E2E Pipeline (Enriched)

```typescript
// test/unit/positional-graph/test-helpers.ts

/**
 * Enriched E2E execution lifecycle fixtures with full WorkUnit types.
 *
 * Pipeline structure:
 * - Line 0 (Spec Creation): spec-builder [agent] → spec-reviewer [agent]
 * - Line 1 (Implementation): coder [agent+Q&A] → tester [agent]
 * - Line 2 (PR Preparation): alignment-tester [agent] || pr-preparer [agent] → pr-creator [code]
 *
 * Naming convention: camelCase with acronyms lowercase (Pr not PR)
 */
export const e2eEnrichedFixtures = {
  /**
   * sample-spec-builder: Entry point agent
   * Type: AgenticWorkUnit
   */
  sampleSpecBuilder: {
    slug: 'sample-spec-builder',
    type: 'agent',
    version: '1.0.0',
    description: 'Creates initial specification from user request',
    inputs: [],
    outputs: [
      { name: 'spec', type: 'data', data_type: 'text', required: true, description: 'The generated specification' },
    ],
    agent: {
      prompt_template: 'prompts/main.md',
      system_prompt: 'You are a specification writer.',
      supported_agents: ['claude-code'],
      estimated_tokens: 1500,
    },
  } satisfies AgenticWorkUnit,

  /**
   * sample-spec-reviewer: Reviews and refines spec
   * Type: AgenticWorkUnit
   */
  sampleSpecReviewer: {
    slug: 'sample-spec-reviewer',
    type: 'agent',
    version: '1.0.0',
    description: 'Reviews specification for completeness and clarity',
    inputs: [
      { name: 'spec', type: 'data', data_type: 'text', required: true },
    ],
    outputs: [
      { name: 'reviewed_spec', type: 'data', data_type: 'text', required: true },
      { name: 'review_notes', type: 'data', data_type: 'text', required: false },
    ],
    agent: {
      prompt_template: 'prompts/main.md',
      supported_agents: ['claude-code'],
      estimated_tokens: 1500,
    },
  } satisfies AgenticWorkUnit,

  /**
   * sample-coder: Writes code with Q&A for language selection
   * Type: AgenticWorkUnit
   */
  sampleCoderE2E: {
    slug: 'sample-coder',
    type: 'agent',
    version: '1.0.0',
    description: 'Generates code based on specification, asks which language to use',
    inputs: [
      { name: 'spec', type: 'data', data_type: 'text', required: true },
    ],
    outputs: [
      { name: 'language', type: 'data', data_type: 'text', required: true },
      { name: 'code', type: 'file', required: true },
    ],
    agent: {
      prompt_template: 'prompts/main.md',
      supported_agents: ['claude-code'],
      estimated_tokens: 2000,
    },
  } satisfies AgenticWorkUnit,

  /**
   * sample-tester: Tests the generated code
   * Type: AgenticWorkUnit
   */
  sampleTesterE2E: {
    slug: 'sample-tester',
    type: 'agent',
    version: '1.0.0',
    description: 'Runs generated code and reports output',
    inputs: [
      { name: 'language', type: 'data', data_type: 'text', required: true },
      { name: 'code', type: 'file', required: true },
    ],
    outputs: [
      { name: 'test_passed', type: 'data', data_type: 'boolean', required: true },
      { name: 'test_output', type: 'data', data_type: 'text', required: true },
    ],
    agent: {
      prompt_template: 'prompts/main.md',
      supported_agents: ['claude-code'],
      estimated_tokens: 1000,
    },
  } satisfies AgenticWorkUnit,

  /**
   * sample-spec-alignment-tester: Verifies code aligns with spec
   * Type: AgenticWorkUnit
   * Line 2, Position 0 (PARALLEL)
   */
  sampleSpecAlignmentTester: {
    slug: 'sample-spec-alignment-tester',
    type: 'agent',
    version: '1.0.0',
    description: 'Verifies implementation aligns with specification',
    inputs: [
      { name: 'spec', type: 'data', data_type: 'text', required: true },
      { name: 'code', type: 'file', required: true },
      { name: 'test_output', type: 'data', data_type: 'text', required: true },
    ],
    outputs: [
      { name: 'alignment_score', type: 'data', data_type: 'text', required: true },
      { name: 'alignment_notes', type: 'data', data_type: 'text', required: true },
    ],
    agent: {
      prompt_template: 'prompts/main.md',
      supported_agents: ['claude-code'],
      estimated_tokens: 1500,
    },
  } satisfies AgenticWorkUnit,

  /**
   * sample-pr-preparer: Prepares PR metadata
   * Type: AgenticWorkUnit
   * Line 2, Position 1 (PARALLEL)
   */
  samplePrPreparer: {
    slug: 'sample-pr-preparer',
    type: 'agent',
    version: '1.0.0',
    description: 'Prepares PR metadata (title, body, labels)',
    inputs: [
      { name: 'spec', type: 'data', data_type: 'text', required: true },
      { name: 'test_output', type: 'data', data_type: 'text', required: true },
    ],
    outputs: [
      { name: 'pr_title', type: 'data', data_type: 'text', required: true },
      { name: 'pr_body', type: 'data', data_type: 'text', required: true },
      { name: 'pr_labels', type: 'data', data_type: 'text', required: false },
    ],
    agent: {
      prompt_template: 'prompts/main.md',
      supported_agents: ['claude-code'],
      estimated_tokens: 1000,
    },
  } satisfies AgenticWorkUnit,

  /**
   * sample-pr-creator: Creates the actual PR
   * Type: CodeUnit (simple script execution, no Q&A)
   * Line 2, Position 2 (SERIAL)
   */
  samplePrCreator: {
    slug: 'sample-pr-creator',
    type: 'code',
    version: '1.0.0',
    description: 'Creates PR using GitHub CLI',
    inputs: [
      { name: 'pr_title', type: 'data', data_type: 'text', required: true },
      { name: 'pr_body', type: 'data', data_type: 'text', required: true },
    ],
    outputs: [
      { name: 'pr_url', type: 'data', data_type: 'text', required: true },
      { name: 'pr_number', type: 'data', data_type: 'text', required: true },
    ],
    code: {
      script: 'scripts/main.sh',
      timeout: 60,
    },
  } satisfies CodeUnit,
};
```

### UserInputUnit Fixture (Row 0 Entry Point)

```typescript
/**
 * sample-user-requirements: Entry point UserInputUnit
 * Type: UserInputUnit
 * Purpose: Demonstrates Row 0 semantics — human provides initial data
 */
export const sampleUserRequirements: UserInputUnit = {
  slug: 'sample-user-requirements',
  type: 'user-input',
  version: '1.0.0',
  description: 'Collects requirements from user to start the workflow',
  inputs: [],  // Entry point — no inputs
  outputs: [
    { name: 'requirements', type: 'data', data_type: 'text', required: true },
  ],
  user_input: {
    question_type: 'text',
    prompt: 'Enter the requirements for the code to generate:',
  },
};

/**
 * sample-language-selector: Single-choice UserInputUnit
 * Type: UserInputUnit
 * Purpose: Demonstrates single-choice question type
 */
export const sampleLanguageSelector: UserInputUnit = {
  slug: 'sample-language-selector',
  type: 'user-input',
  version: '1.0.0',
  description: 'User selects programming language',
  inputs: [],
  outputs: [
    { name: 'language', type: 'data', data_type: 'text', required: true },
  ],
  user_input: {
    question_type: 'single',
    prompt: 'Which programming language should be used?',
    options: [
      { key: 'A', label: 'TypeScript', description: 'Recommended for web projects' },
      { key: 'B', label: 'Python', description: 'Good for data/ML projects' },
      { key: 'C', label: 'Go', description: 'Good for CLI tools' },
      { key: 'D', label: 'Rust', description: 'Good for performance-critical code' },
    ],
  },
};
```

---

## Stub Service Enhancements

### stubWorkUnitService (Full WorkUnit Support)

```typescript
// test/unit/positional-graph/workunit-test-helpers.ts

import type {
  IWorkUnitService,
  WorkUnit,
  NarrowWorkUnit,
  UnitLoadResult,
  UnitListResult,
  UnitValidateResult,
  TemplateContentResult,
} from '@chainglass/positional-graph/interfaces';
import { unitNotFoundError, unitNoTemplateError } from '@chainglass/positional-graph/errors';

/**
 * Options for stubWorkUnitService.
 */
export interface StubWorkUnitServiceOptions {
  /** Full WorkUnit definitions */
  units: WorkUnit[];

  /**
   * Template content for AgenticWorkUnit and CodeUnit.
   * Key: slug, Value: template content string
   */
  templateContent?: Map<string, string>;

  /** If true, returns error for unknown slugs */
  strictMode?: boolean;
}

/**
 * Creates a stub IWorkUnitService for testing enriched unit types.
 *
 * @example
 * const service = stubWorkUnitService({
 *   units: [
 *     e2eEnrichedFixtures.sampleSpecBuilder,
 *     e2eEnrichedFixtures.sampleCoderE2E,
 *   ],
 *   templateContent: new Map([
 *     ['sample-spec-builder', 'You are a specification writer.\n\n{{spec}}'],
 *     ['sample-coder', 'Write code for:\n\n{{spec}}'],
 *   ]),
 *   strictMode: true,
 * });
 */
export function stubWorkUnitService(options: StubWorkUnitServiceOptions): IWorkUnitService {
  const { units, templateContent = new Map(), strictMode = false } = options;
  const unitMap = new Map(units.map(u => [u.slug, u]));

  return {
    async list(ctx): Promise<UnitListResult> {
      return {
        units: units.map(u => ({
          slug: u.slug,
          type: u.type,
          version: u.version,
          description: u.description,
        })),
        errors: [],
      };
    },

    async load(ctx, slug): Promise<UnitLoadResult> {
      const unit = unitMap.get(slug);
      if (!unit) {
        if (strictMode) {
          return { errors: [unitNotFoundError(slug)] };
        }
        // Non-strict: return minimal stub
        return {
          unit: undefined,
          errors: [unitNotFoundError(slug)]
        };
      }
      return { unit, errors: [] };
    },

    async validate(ctx, slug): Promise<UnitValidateResult> {
      const unit = unitMap.get(slug);
      return { valid: !!unit, errors: [] };
    },

    async getTemplateContent(ctx, slug): Promise<TemplateContentResult> {
      const unit = unitMap.get(slug);
      if (!unit) {
        return { errors: [unitNotFoundError(slug)] };
      }

      // Check unit type
      if (unit.type === 'user-input') {
        return { errors: [unitNoTemplateError(slug)] };
      }

      // Get template content from stub map
      const content = templateContent.get(slug);
      if (!content) {
        return {
          errors: [{
            code: 'E185',
            message: `Template content not configured for '${slug}' in stub`,
            action: 'Add template content to stubWorkUnitService options',
          }],
        };
      }

      return {
        content,
        path: `/stub/.chainglass/units/${slug}/${unit.type === 'agent' ? 'prompts/main.md' : 'scripts/main.sh'}`,
        templateType: unit.type === 'agent' ? 'prompt' : 'script',
        errors: [],
      };
    },
  };
}
```

### stubWorkUnitLoader (Enhanced with Type Support)

```typescript
/**
 * Enhanced stubWorkUnitLoader that accepts both NarrowWorkUnit and WorkUnit.
 * WorkUnit types are automatically narrowed to NarrowWorkUnit for IWorkUnitLoader.
 */
export function stubWorkUnitLoader(
  options: StubWorkUnitLoaderOptions & { enrichedUnits?: WorkUnit[] } = {}
): IWorkUnitLoader {
  const { units = [], enrichedUnits = [], slugs = [], strictMode = false, ...rest } = options;

  // Merge NarrowWorkUnit and WorkUnit arrays
  // WorkUnit is structurally compatible with NarrowWorkUnit
  const allUnits: NarrowWorkUnit[] = [
    ...units,
    ...enrichedUnits.map(u => ({
      slug: u.slug,
      inputs: u.inputs,
      outputs: u.outputs,
    })),
  ];

  return stubWorkUnitLoader({ ...rest, units: allUnits, slugs, strictMode });
}
```

---

## E2E Test Adjustments

### New Test Sections

The E2E test needs these new sections to exercise enriched unit types:

#### Section 13: Unit Type Verification

```typescript
// test/e2e/positional-graph-execution-e2e.test.ts

async function testUnitTypeVerification(): Promise<void> {
  section('Unit Type Verification');

  step('13.1: Verify coder is AgenticWorkUnit (type=agent)');
  const coderUnitInfo = await runCli<UnitInfoResult>(['unit', 'info', 'sample-coder']);
  assert(coderUnitInfo.ok, `Unit info failed: ${JSON.stringify(coderUnitInfo.errors)}`);
  assert(coderUnitInfo.data?.type === 'agent', `Expected type='agent', got ${coderUnitInfo.data?.type}`);
  assert(coderUnitInfo.data?.agent?.prompt_template, 'Agent should have prompt_template');
  console.log('    sample-coder: type=agent, prompt_template exists');

  step('13.2: Verify pr-creator is CodeUnit (type=code)');
  const prCreatorInfo = await runCli<UnitInfoResult>(['unit', 'info', 'sample-pr-creator']);
  assert(prCreatorInfo.ok, `Unit info failed: ${JSON.stringify(prCreatorInfo.errors)}`);
  assert(prCreatorInfo.data?.type === 'code', `Expected type='code', got ${prCreatorInfo.data?.type}`);
  assert(prCreatorInfo.data?.code?.script, 'Code unit should have script');
  console.log('    sample-pr-creator: type=code, script exists');

  step('13.3: Verify user-requirements is UserInputUnit (type=user-input)');
  const userReqInfo = await runCli<UnitInfoResult>(['unit', 'info', 'sample-user-requirements']);
  assert(userReqInfo.ok, `Unit info failed: ${JSON.stringify(userReqInfo.errors)}`);
  assert(userReqInfo.data?.type === 'user-input', `Expected type='user-input', got ${userReqInfo.data?.type}`);
  assert(userReqInfo.data?.user_input?.question_type, 'UserInput should have question_type');
  console.log('    sample-user-requirements: type=user-input, question_type exists');
}
```

#### Section 14: Reserved Parameter Routing Tests

**DESIGN NOTE**: Reserved parameter routing (`main-prompt`, `main-script`) accesses **static template content** from the WorkUnit definition, NOT runtime data. Therefore:
- Template content is accessible regardless of node execution state (pending, running, or completed)
- This test runs after Line 1 completes, demonstrating that template access works on completed nodes
- The CLI routes reserved parameter names to `WorkUnitService.getTemplateContent()` instead of normal input resolution

```typescript
async function testReservedParameterRouting(): Promise<void> {
  section('Reserved Parameter Routing');

  // NOTE: Reserved parameters access unit template content, not runtime data.
  // They work regardless of node state (pending, running, completed).
  // We test after Line 1 completes to verify this design.

  step('14.1: Get main-prompt for AgenticWorkUnit (coder node is completed)');
  const promptResult = await runCli<GetInputDataResult>([
    'node', 'get-input-data', GRAPH_SLUG, nodeIds.coder, 'main-prompt'
  ]);
  assert(promptResult.ok, `Get main-prompt failed: ${JSON.stringify(promptResult.errors)}`);
  assert(typeof promptResult.data?.value === 'string', 'main-prompt should return string content');
  assert(promptResult.data?.value?.length > 0, 'main-prompt should have content');
  console.log(`    main-prompt returned ${promptResult.data?.value?.length} chars (works on completed node)`);

  step('14.2: Get main-script for CodeUnit (pr-creator node is pending)');
  // PR-creator hasn't started yet — verifies reserved params work on pending nodes too
  const scriptResult = await runCli<GetInputDataResult>([
    'node', 'get-input-data', GRAPH_SLUG, nodeIds.prCreator, 'main-script'
  ]);
  assert(scriptResult.ok, `Get main-script failed: ${JSON.stringify(scriptResult.errors)}`);
  assert(typeof scriptResult.data?.value === 'string', 'main-script should return string content');
  console.log(`    main-script returned ${scriptResult.data?.value?.length} chars (works on pending node)`);

  step('14.3: E186 - main-prompt on CodeUnit should fail');
  const e186Result = await runCliExpectError([
    'node', 'get-input-data', GRAPH_SLUG, nodeIds.prCreator, 'main-prompt'
  ]);
  assert(e186Result.errors[0]?.code === 'E186', `Expected E186, got ${e186Result.errors[0]?.code}`);
  console.log('    E186 UnitTypeMismatch: main-prompt on CodeUnit rejected');

  step('14.4: E183 - main-prompt on UserInputUnit should fail');
  // Test via unit command (no UserInputUnit node in main graph)
  const e183Result = await runCliExpectError([
    'unit', 'get-template', 'sample-user-requirements'
  ]);
  assert(e183Result.errors[0]?.code === 'E183', `Expected E183, got ${e183Result.errors[0]?.code}`);
  console.log('    E183 NoTemplate: UserInputUnit has no template');
}
```

#### Section 15: Row 0 UserInputUnit Tests

```typescript
async function testRow0UserInput(): Promise<void> {
  section('Row 0 UserInputUnit (Entry Point)');

  // Create alternate graph with UserInputUnit on Line 0
  const altGraphSlug = 'e2e-user-input-test';

  step('15.1: Create graph with UserInputUnit on Line 0');
  await runCli(['delete', altGraphSlug]).catch(() => {});
  const createResult = await runCli<GraphCreateResult>(['create', altGraphSlug]);
  assert(createResult.ok, `Create failed: ${JSON.stringify(createResult.errors)}`);
  const altLine0 = createResult.data?.lineId;

  step('15.2: Add UserInputUnit to Line 0');
  const userInputResult = await runCli<AddNodeResult>([
    'node', 'add', altGraphSlug, altLine0!, 'sample-user-requirements'
  ]);
  assert(userInputResult.ok, `Add failed: ${JSON.stringify(userInputResult.errors)}`);
  const userInputNodeId = userInputResult.data?.nodeId;
  console.log(`    UserInputUnit added: ${userInputNodeId}`);

  step('15.3: Verify UserInputUnit is ready (Line 0 entry point)');
  const status = await runCli<StatusResult>(['status', altGraphSlug, '--node', userInputNodeId!]);
  assert(status.data?.ready === true, 'UserInputUnit on Line 0 should be ready');
  console.log('    UserInputUnit ready: true (entry point)');

  step('15.4: UserInputUnit outputs become available after completion');
  await runCli(['node', 'start', altGraphSlug, userInputNodeId!]);
  await runCli([
    'node', 'save-output-data', altGraphSlug, userInputNodeId!, 'requirements',
    '"Build a function that validates email addresses"'
  ]);
  await runCli(['node', 'end', altGraphSlug, userInputNodeId!]);

  const output = await runCli<GetOutputDataResult>([
    'node', 'get-output-data', altGraphSlug, userInputNodeId!, 'requirements'
  ]);
  assert(output.ok, `Get output failed: ${JSON.stringify(output.errors)}`);
  assert(output.data?.value?.toString().includes('email'), 'Output should contain user input');
  console.log('    UserInputUnit output available after completion');

  step('15.5: Cleanup');
  await runCli(['delete', altGraphSlug]);
}
```

### Updated Main Flow

```typescript
async function main(): Promise<void> {
  console.log('=== Positional Graph Execution Lifecycle E2E Test ===\n');
  console.log('Graph: 3 lines, 7 nodes');
  console.log('  Line 0: spec-builder [agent], spec-reviewer [agent] (serial)');
  console.log('  Line 1: coder [agent+Q&A], tester [agent] (serial, MANUAL gate to Line 2)');
  console.log('  Line 2: alignment-tester, pr-preparer [agent] (PARALLEL) + PR-creator [code] (serial)\n');

  try {
    await setup();
    await testReadinessDetection();
    await testErrorCodes();
    await testUnitTypeVerification();         // NEW: Section 13
    await executeLine0();
    await executeLine1WithQA();
    await testReservedParameterRouting();     // NEW: Section 14
    await testManualTransition();
    await testParallelExecution();
    await completePRCreator();
    await validateFinalState();
    await testRow0UserInput();                // NEW: Section 15

    console.log('\n=== ALL TESTS PASSED ===');
  } finally {
    await cleanup();
  }
}
```

---

## On-Disk Unit Files Required

### New Unit Files to Create

The E2E test copies units from `.chainglass/data/units/` to the temp workspace. These units need to be created/updated:

#### sample-spec-builder/unit.yaml

```yaml
slug: sample-spec-builder
type: agent
version: 1.0.0
description: Creates initial specification from user request

inputs: []

outputs:
  - name: spec
    type: data
    data_type: text
    required: true
    description: The generated specification

agent:
  prompt_template: prompts/main.md
  system_prompt: "You are a specification writer."
  supported_agents:
    - claude-code
  estimated_tokens: 1500
```

#### sample-spec-builder/prompts/main.md

```markdown
You are a specification writer. Your task is to create a clear, detailed specification.

Generate a specification that includes:
1. Overview and purpose
2. Technical requirements
3. Edge cases to handle
4. Acceptance criteria
```

#### sample-spec-reviewer/unit.yaml

```yaml
slug: sample-spec-reviewer
type: agent
version: 1.0.0
description: Reviews specification for completeness and clarity

inputs:
  - name: spec
    type: data
    data_type: text
    required: true

outputs:
  - name: reviewed_spec
    type: data
    data_type: text
    required: true
  - name: review_notes
    type: data
    data_type: text
    required: false

agent:
  prompt_template: prompts/main.md
  supported_agents:
    - claude-code
  estimated_tokens: 1500
```

#### sample-spec-alignment-tester/unit.yaml

```yaml
slug: sample-spec-alignment-tester
type: agent
version: 1.0.0
description: Verifies implementation aligns with specification

inputs:
  - name: spec
    type: data
    data_type: text
    required: true
  - name: code
    type: file
    required: true
  - name: test_output
    type: data
    data_type: text
    required: true

outputs:
  - name: alignment_score
    type: data
    data_type: text
    required: true
  - name: alignment_notes
    type: data
    data_type: text
    required: true

agent:
  prompt_template: prompts/main.md
  supported_agents:
    - claude-code
  estimated_tokens: 1500
```

#### sample-pr-preparer/unit.yaml

```yaml
slug: sample-pr-preparer
type: agent
version: 1.0.0
description: Prepares PR metadata (title, body, labels)

inputs:
  - name: spec
    type: data
    data_type: text
    required: true
  - name: test_output
    type: data
    data_type: text
    required: true

outputs:
  - name: pr_title
    type: data
    data_type: text
    required: true
  - name: pr_body
    type: data
    data_type: text
    required: true
  - name: pr_labels
    type: data
    data_type: text
    required: false

agent:
  prompt_template: prompts/main.md
  supported_agents:
    - claude-code
  estimated_tokens: 1000
```

#### sample-pr-creator/unit.yaml (CodeUnit)

```yaml
slug: sample-pr-creator
type: code
version: 1.0.0
description: Creates PR using GitHub CLI

inputs:
  - name: pr_title
    type: data
    data_type: text
    required: true
  - name: pr_body
    type: data
    data_type: text
    required: true

outputs:
  - name: pr_url
    type: data
    data_type: text
    required: true
  - name: pr_number
    type: data
    data_type: text
    required: true

code:
  script: scripts/main.sh
  timeout: 60
```

#### sample-pr-creator/scripts/main.sh

```bash
#!/bin/bash
# Mock PR creation script for E2E testing
echo "Creating PR with title: $PR_TITLE"
echo "PR_URL=https://github.com/example/repo/pull/42"
echo "PR_NUMBER=42"
```

#### sample-user-requirements/unit.yaml (UserInputUnit)

```yaml
slug: sample-user-requirements
type: user-input
version: 1.0.0
description: Collects requirements from user to start the workflow

inputs: []

outputs:
  - name: requirements
    type: data
    data_type: text
    required: true
    description: The requirements for what code to generate

user_input:
  question_type: text
  prompt: "Enter the requirements for the code to generate:"
```

---

## Compatibility Matrix

### Backward Compatibility

| Component | Change Type | Backward Compatible? |
|-----------|-------------|---------------------|
| `NarrowWorkUnit` | Extended by `WorkUnit` | Yes — structural subtyping |
| `IWorkUnitLoader.load()` | Returns `NarrowWorkUnit` | Yes — unchanged signature |
| `stubWorkUnitLoader()` | New `enrichedUnits` option | Yes — additive |
| `createWorkUnit()` | Unchanged | Yes — still creates NarrowWorkUnit |
| `e2eExecutionFixtures` | Rename `samplePRCreator` → `samplePrCreator` | Minor breaking — update references |
| `e2eEnrichedFixtures` | NEW | N/A — additive |
| E2E test sections 1-12 | Unchanged | Yes — existing tests pass |
| E2E test sections 13-15 | NEW | N/A — additive |

### Type Compatibility

```typescript
// WorkUnit types are structurally compatible with NarrowWorkUnit
const unit: AgenticWorkUnit = { ... };
const narrow: NarrowWorkUnit = unit;  // ✓ Compiles

// IWorkUnitLoader can accept WorkUnit where NarrowWorkUnit is expected
const loader: IWorkUnitLoader = {
  async load(ctx, slug) {
    const fullUnit: WorkUnit = await loadFull(ctx, slug);
    return { unit: fullUnit, errors: [] };  // ✓ Compiles
  }
};
```

---

## Implementation Checklist

### Test Helpers Updates

- [ ] Rename `samplePRCreator` → `samplePrCreator` in `e2eExecutionFixtures` (naming consistency)
- [ ] Add `WorkUnit`, `AgenticWorkUnit`, `CodeUnit`, `UserInputUnit` imports
- [ ] Add `e2eEnrichedFixtures` constant with full types
- [ ] Add `sampleUserRequirements`, `sampleLanguageSelector` UserInput fixtures
- [ ] Add `stubWorkUnitService()` function
- [ ] Update `stubWorkUnitLoader()` with `enrichedUnits` option
- [ ] Export new types and fixtures

### E2E Test Updates

- [ ] Add `UnitInfoResult` type definition
- [ ] Add Section 13: Unit Type Verification tests
- [ ] Add Section 14: Reserved Parameter Routing tests
- [ ] Add Section 15: Row 0 UserInputUnit tests
- [ ] Update test summary output

### On-Disk Unit Files

- [ ] Create `sample-spec-builder/unit.yaml` + prompts/main.md
- [ ] Create `sample-spec-reviewer/unit.yaml` + prompts/main.md
- [ ] Create `sample-spec-alignment-tester/unit.yaml` + prompts/main.md
- [ ] Create `sample-pr-preparer/unit.yaml` + prompts/main.md
- [ ] Create `sample-pr-creator/unit.yaml` + scripts/main.sh (CodeUnit)
- [ ] Create `sample-user-requirements/unit.yaml` (UserInputUnit)

### Dependencies (From workunit-loading.md)

- [ ] `packages/positional-graph/src/interfaces/workunit.types.ts` (types)
- [ ] `packages/positional-graph/src/schemas/workunit.schema.ts` (Zod)
- [ ] `packages/positional-graph/src/services/workunit.service.ts` (IWorkUnitService)
- [ ] CLI reserved parameter routing

---

## Open Questions

### Q1: Should we keep e2eExecutionFixtures alongside e2eEnrichedFixtures?

**RESOLVED**: Yes — keep both for backward compatibility. Tests that only need NarrowWorkUnit continue using `e2eExecutionFixtures`. Tests requiring full types use `e2eEnrichedFixtures`.

### Q2: How do we handle template content in tests without reading files?

**RESOLVED**: Use `stubWorkUnitService` with `templateContent` Map option. Tests inject mock template content without filesystem access.

### Q3: Should Reserved Parameter tests run before or after node execution tests?

**RESOLVED**: Run Section 14 (Reserved Parameters) after Line 1 completes but before Line 2 parallel execution. Reserved parameters access **static template content** from the WorkUnit definition, not runtime data. They work regardless of node state:
- Step 14.1 tests on completed coder node (proves template access works post-completion)
- Step 14.2 tests on pending pr-creator node (proves template access works pre-execution)

This design validates that reserved parameter routing is unit-level metadata access, not node-state-dependent.

---

## Quick Reference

### Fixture Usage

```typescript
// Use NarrowWorkUnit fixtures (original)
import { e2eExecutionFixtures, createE2EExecutionTestLoader } from './test-helpers';

// Use enriched WorkUnit fixtures (new)
import { e2eEnrichedFixtures, stubWorkUnitService } from './test-helpers';
```

### Unit Type Discrimination

```typescript
function handleUnit(unit: WorkUnit) {
  switch (unit.type) {
    case 'agent':
      console.log('Prompt:', unit.agent.prompt_template);
      break;
    case 'code':
      console.log('Script:', unit.code.script);
      break;
    case 'user-input':
      console.log('Question:', unit.user_input.prompt);
      break;
  }
}
```

### Reserved Parameter Names

| Parameter | Valid For | Returns |
|-----------|-----------|---------|
| `main-prompt` | AgenticWorkUnit | Prompt template content |
| `main-script` | CodeUnit | Script file content |

### Error Codes

| Code | When |
|------|------|
| E183 | `getTemplateContent` on UserInputUnit |
| E185 | Template file not found |
| E186 | Reserved param type mismatch (e.g., main-prompt on CodeUnit) |
