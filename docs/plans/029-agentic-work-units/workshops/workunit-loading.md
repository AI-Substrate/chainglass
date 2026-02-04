# Workshop: WorkUnit Loading in Positional-Graph

**Type**: Data Model + Integration Pattern
**Plan**: 029-agentic-work-units
**Spec**: (Pre-specification workshop)
**Created**: 2026-02-04
**Status**: Draft

**Related Documents**:
- `docs/plans/029-agentic-work-units/research-dossier.md`
- `packages/positional-graph/src/interfaces/positional-graph-service.interface.ts`
- `packages/positional-graph/src/adapter/positional-graph.adapter.ts`

---

## Purpose

Define how WorkUnits are stored, loaded, validated, and accessed in the positional-graph system. This is a **greenfield implementation** — no imports from the legacy `@chainglass/workgraph` package.

## Key Questions Addressed

- Where are WorkUnits stored on disk?
- How does the service load and validate units?
- How do AgenticWorkUnit, CodeUnit, and UserInputUnit differ?
- How does reserved parameter routing (`main-prompt`, `main-script`) work?
- How does this integrate with existing `collateInputs()` and node execution?

---

## Overview

The positional-graph system needs its own WorkUnit loading infrastructure. Currently it only has `NarrowWorkUnit` (slug, inputs, outputs). We're adding full work unit types with:

- **Type discrimination**: `'agent' | 'code' | 'user-input'`
- **Type-specific configs**: prompts, scripts, question types
- **Reserved parameter routing**: Access template content via special input names

---

## Storage Layout

### On-Disk Structure

```
<workspace>/
└── .chainglass/
    ├── data/
    │   └── workflows/                    # Graphs live here (existing)
    │       └── <graph-slug>/
    │           ├── graph.yaml
    │           ├── state.json
    │           └── nodes/<nodeId>/
    │               └── node.yaml
    │
    └── units/                            # WorkUnits live here (NEW)
        ├── spec-generator/               # AgenticWorkUnit
        │   ├── unit.yaml                 # Unit definition
        │   └── prompts/
        │       └── main.md               # Prompt template
        │
        ├── test-runner/                  # CodeUnit
        │   ├── unit.yaml
        │   └── scripts/
        │       └── main.sh               # Shell script
        │
        └── user-requirements/            # UserInputUnit
            └── unit.yaml                 # No template file needed
```

### Path Resolution

```typescript
// WorkUnitAdapter (NEW - similar pattern to PositionalGraphAdapter)

class WorkUnitAdapter extends WorkspaceDataAdapterBase {
  readonly domain = 'units';  // → .chainglass/units/

  getUnitDir(ctx: WorkspaceContext, slug: string): string {
    // Returns: <worktree>/.chainglass/units/<slug>/
    return this.pathResolver.join(this.getDomainPath(ctx), slug);
  }

  getUnitYamlPath(ctx: WorkspaceContext, slug: string): string {
    // Returns: <worktree>/.chainglass/units/<slug>/unit.yaml
    return this.pathResolver.join(this.getUnitDir(ctx, slug), 'unit.yaml');
  }

  getTemplatePath(ctx: WorkspaceContext, slug: string, relativePath: string): string {
    // Returns: <worktree>/.chainglass/units/<slug>/<relativePath>
    // Example: .chainglass/units/spec-generator/prompts/main.md
    return this.pathResolver.join(this.getUnitDir(ctx, slug), relativePath);
  }
}
```

---

## Schema Definitions

### unit.yaml Examples

#### AgenticWorkUnit

```yaml
# .chainglass/units/spec-generator/unit.yaml
slug: spec-generator
type: agent
version: 1.0.0
description: Generates specifications from requirements

inputs:
  - name: requirements
    type: data
    data_type: text
    required: true
    description: The requirements to generate a spec from

outputs:
  - name: spec
    type: data
    data_type: text
    required: true
    description: The generated specification

agent:
  prompt_template: prompts/main.md      # Relative to unit folder
  system_prompt: "You are a specification writer."
  supported_agents:
    - claude-code
    - copilot
  estimated_tokens: 2000
```

#### CodeUnit

```yaml
# .chainglass/units/test-runner/unit.yaml
slug: test-runner
type: code
version: 1.0.0
description: Runs tests on generated code

inputs:
  - name: code_file
    type: file
    required: true
  - name: language
    type: data
    data_type: text
    required: true

outputs:
  - name: test_passed
    type: data
    data_type: boolean
    required: true
  - name: test_output
    type: data
    data_type: text
    required: true

code:
  script: scripts/main.sh               # Relative to unit folder
  timeout: 120                          # seconds (default: 60)
```

#### UserInputUnit

```yaml
# .chainglass/units/user-requirements/unit.yaml
slug: user-requirements
type: user-input
version: 1.0.0
description: Collects requirements from user

inputs: []                              # Entry point - no inputs

outputs:
  - name: requirements
    type: data
    data_type: text
    required: true

user_input:
  question_type: text                   # text | single | multi | confirm
  prompt: "Enter the requirements for the code to generate:"
```

---

## TypeScript Types

### Core Types (NEW in positional-graph)

```typescript
// packages/positional-graph/src/interfaces/workunit.types.ts

// ============================================
// Input/Output Declarations
// ============================================

export interface WorkUnitInput {
  name: string;
  type: 'data' | 'file';
  data_type?: 'text' | 'number' | 'boolean' | 'json';  // Required when type='data'
  required: boolean;
  description?: string;
}

export interface WorkUnitOutput {
  name: string;
  type: 'data' | 'file';
  data_type?: 'text' | 'number' | 'boolean' | 'json';
  required: boolean;
  description?: string;
}

// ============================================
// Type-Specific Configs
// ============================================

export interface AgentConfig {
  /** Path to prompt template, relative to unit folder */
  prompt_template: string;
  /** Optional system prompt prefix */
  system_prompt?: string;
  /** Supported agent types */
  supported_agents?: ('claude-code' | 'copilot')[];
  /** Estimated token budget (informational) */
  estimated_tokens?: number;
}

export interface CodeConfig {
  /** Path to script, relative to unit folder */
  script: string;
  /** Execution timeout in seconds (default: 60) */
  timeout?: number;
}

export interface UserInputOption {
  key: string;
  label: string;
  description?: string;
}

export interface UserInputConfig {
  question_type: 'text' | 'single' | 'multi' | 'confirm';
  prompt: string;
  options?: UserInputOption[];  // For single/multi
  default?: string | boolean;   // Default value
}

// ============================================
// Work Unit Types (Discriminated Union)
// ============================================

interface WorkUnitBase {
  slug: string;
  version: string;
  description?: string;
  inputs: WorkUnitInput[];
  outputs: WorkUnitOutput[];
}

export interface AgenticWorkUnit extends WorkUnitBase {
  type: 'agent';
  agent: AgentConfig;
}

export interface CodeUnit extends WorkUnitBase {
  type: 'code';
  code: CodeConfig;
}

export interface UserInputUnit extends WorkUnitBase {
  type: 'user-input';
  user_input: UserInputConfig;
}

export type WorkUnit = AgenticWorkUnit | CodeUnit | UserInputUnit;

// ============================================
// Backward Compatibility
// ============================================

/**
 * NarrowWorkUnit is now a subset of WorkUnit.
 * Keep for collateInputs compatibility during transition.
 */
export type NarrowWorkUnit = Pick<WorkUnit, 'slug' | 'inputs' | 'outputs'>;
```

---

## Zod Schemas

```typescript
// packages/positional-graph/src/schemas/workunit.schema.ts

import { z } from 'zod';

// ============================================
// Primitives
// ============================================

const SlugSchema = z.string().regex(/^[a-z][a-z0-9-]*$/,
  'Slug must start with letter, contain only lowercase letters, numbers, and hyphens');

const IOTypeSchema = z.enum(['data', 'file']);
const DataTypeSchema = z.enum(['text', 'number', 'boolean', 'json']);

// ============================================
// Input/Output Declarations
// ============================================

export const WorkUnitInputSchema = z.object({
  name: z.string().regex(/^[a-z][a-z0-9_]*$/, 'Name must be lowercase with underscores'),
  type: IOTypeSchema,
  data_type: DataTypeSchema.optional(),
  required: z.boolean(),
  description: z.string().optional(),
}).refine(
  (data) => data.type !== 'data' || data.data_type !== undefined,
  { message: "data_type is required when type is 'data'", path: ['data_type'] }
);

export const WorkUnitOutputSchema = WorkUnitInputSchema;  // Same structure

// ============================================
// Type-Specific Configs
// ============================================

export const AgentConfigSchema = z.object({
  prompt_template: z.string().min(1),
  system_prompt: z.string().optional(),
  supported_agents: z.array(z.enum(['claude-code', 'copilot'])).optional(),
  estimated_tokens: z.number().int().min(0).optional(),
});

export const CodeConfigSchema = z.object({
  script: z.string().min(1),
  timeout: z.number().int().min(1).max(3600).default(60).optional(),
});

export const UserInputOptionSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  description: z.string().optional(),
});

export const UserInputConfigSchema = z.object({
  question_type: z.enum(['text', 'single', 'multi', 'confirm']),
  prompt: z.string().min(1),
  options: z.array(UserInputOptionSchema).min(2).optional(),
  default: z.union([z.string(), z.boolean()]).optional(),
}).refine(
  (data) => {
    if (data.question_type === 'single' || data.question_type === 'multi') {
      return data.options !== undefined && data.options.length >= 2;
    }
    return true;
  },
  { message: "options required with at least 2 items for single/multi", path: ['options'] }
);

// ============================================
// Work Unit Schemas (Discriminated Union)
// ============================================

const WorkUnitBaseSchema = z.object({
  slug: SlugSchema,
  version: z.string().min(1),
  description: z.string().optional(),
  inputs: z.array(WorkUnitInputSchema).default([]),
  outputs: z.array(WorkUnitOutputSchema).min(1),
});

export const AgenticWorkUnitSchema = WorkUnitBaseSchema.extend({
  type: z.literal('agent'),
  agent: AgentConfigSchema,
});

export const CodeUnitSchema = WorkUnitBaseSchema.extend({
  type: z.literal('code'),
  code: CodeConfigSchema,
});

export const UserInputUnitSchema = WorkUnitBaseSchema.extend({
  type: z.literal('user-input'),
  user_input: UserInputConfigSchema,
});

export const WorkUnitSchema = z.discriminatedUnion('type', [
  AgenticWorkUnitSchema,
  CodeUnitSchema,
  UserInputUnitSchema,
]);

export type WorkUnit = z.infer<typeof WorkUnitSchema>;
```

---

## Service Interface

```typescript
// packages/positional-graph/src/interfaces/workunit-service.interface.ts

import type { BaseResult, ResultError } from '@chainglass/shared';
import type { WorkspaceContext } from '@chainglass/workflow';
import type { WorkUnit, NarrowWorkUnit } from './workunit.types.js';

// ============================================
// Result Types
// ============================================

export interface UnitListResult extends BaseResult {
  units: Array<{
    slug: string;
    type: 'agent' | 'code' | 'user-input';
    version: string;
    description?: string;
  }>;
}

export interface UnitLoadResult extends BaseResult {
  unit?: WorkUnit;
}

export interface UnitValidateResult extends BaseResult {
  valid: boolean;
  errors: ResultError[];
}

export interface TemplateContentResult extends BaseResult {
  /** The actual template content (prompt text or script) */
  content?: string;
  /** Absolute path to the template file */
  path?: string;
  /** Template type */
  templateType?: 'prompt' | 'script';
}

// ============================================
// Service Interface
// ============================================

export interface IWorkUnitService {
  /**
   * List all available units in workspace.
   */
  list(ctx: WorkspaceContext): Promise<UnitListResult>;

  /**
   * Load full unit definition with type-specific config.
   */
  load(ctx: WorkspaceContext, slug: string): Promise<UnitLoadResult>;

  /**
   * Validate unit.yaml against schema.
   */
  validate(ctx: WorkspaceContext, slug: string): Promise<UnitValidateResult>;

  /**
   * Get template content for reserved parameter routing.
   * - AgenticWorkUnit: returns prompt content
   * - CodeUnit: returns script content
   * - UserInputUnit: returns error (no template)
   */
  getTemplateContent(ctx: WorkspaceContext, slug: string): Promise<TemplateContentResult>;
}

// ============================================
// Loader Interface (Narrow, for collateInputs)
// ============================================

/**
 * IWorkUnitLoader remains narrow for collateInputs compatibility.
 * WorkUnitService implements this structurally (WorkUnit ⊇ NarrowWorkUnit).
 */
export interface IWorkUnitLoader {
  load(ctx: WorkspaceContext, slug: string): Promise<{
    unit?: NarrowWorkUnit;
    errors: ResultError[];
  }>;
}
```

---

## Loading Flow

### Step-by-Step: Loading a WorkUnit

```
┌─────────────────────────────────────────────────────────────────┐
│  1. CLI or Service calls: workUnitService.load(ctx, 'spec-gen') │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  2. WorkUnitAdapter resolves path                               │
│                                                                 │
│     unitDir = <worktree>/.chainglass/units/spec-gen/            │
│     unitYaml = unitDir/unit.yaml                                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  3. Check existence                                             │
│                                                                 │
│     if (!fs.exists(unitYaml)) → return E180 (unit not found)    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  4. Read and parse YAML                                         │
│                                                                 │
│     content = fs.readFile(unitYaml)                             │
│     parsed = yamlParser.parse(content)                          │
│     if (parseError) → return E181 (YAML parse error)            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  5. Validate against Zod schema                                 │
│                                                                 │
│     result = WorkUnitSchema.safeParse(parsed)                   │
│     if (!result.success) → return E182 (schema validation)      │
│                                                                 │
│     Zod discriminates on `type` field:                          │
│       - 'agent'     → AgenticWorkUnitSchema                     │
│       - 'code'      → CodeUnitSchema                            │
│       - 'user-input'→ UserInputUnitSchema                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  6. Return typed WorkUnit                                       │
│                                                                 │
│     return {                                                    │
│       unit: result.data,  // AgenticWorkUnit | CodeUnit | ...   │
│       errors: []                                                │
│     }                                                           │
└─────────────────────────────────────────────────────────────────┘
```

### Step-by-Step: Getting Template Content

```
┌─────────────────────────────────────────────────────────────────┐
│  1. CLI calls: workUnitService.getTemplateContent(ctx, 'spec')  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  2. Load the unit first                                         │
│                                                                 │
│     loadResult = this.load(ctx, slug)                           │
│     if (loadResult.errors.length) → return errors               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  3. Dispatch by unit type                                       │
│                                                                 │
│     switch (unit.type) {                                        │
│       case 'agent':                                             │
│         templatePath = unit.agent.prompt_template               │
│         templateType = 'prompt'                                 │
│         break;                                                  │
│                                                                 │
│       case 'code':                                              │
│         templatePath = unit.code.script                         │
│         templateType = 'script'                                 │
│         break;                                                  │
│                                                                 │
│       case 'user-input':                                        │
│         → return E183 (no template for user-input)              │
│     }                                                           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  4. Resolve and read template file                              │
│                                                                 │
│     unitDir = adapter.getUnitDir(ctx, slug)                     │
│     fullPath = pathResolver.join(unitDir, templatePath)         │
│                                                                 │
│     // Security: Validate path doesn't escape unit folder       │
│     if (!fullPath.startsWith(unitDir)) → return E184 (escape)   │
│                                                                 │
│     content = fs.readFile(fullPath)                             │
│     if (notFound) → return E185 (template not found)            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  5. Return template content                                     │
│                                                                 │
│     return {                                                    │
│       content: content,      // "You are a spec writer..."      │
│       path: fullPath,        // Absolute path                   │
│       templateType: 'prompt',                                   │
│       errors: []                                                │
│     }                                                           │
└─────────────────────────────────────────────────────────────────┘
```

---

## Reserved Parameter Routing

### Concept

When a running agent needs its prompt template, it calls:
```bash
cg wf node get-input-data <graph> <node> main-prompt
```

The CLI detects `main-prompt` is a **reserved parameter name** and routes to `WorkUnitService.getTemplateContent()` instead of normal input resolution.

### Reserved Parameter Names

| Parameter | Unit Type | Returns |
|-----------|-----------|---------|
| `main-prompt` | AgenticWorkUnit | Prompt template content |
| `main-script` | CodeUnit | Script file content |

### CLI Flow

```typescript
// apps/cli/src/commands/positional-graph.command.ts

const RESERVED_INPUT_PARAMS = {
  'main-prompt': { unitType: 'agent', templateType: 'prompt' },
  'main-script': { unitType: 'code', templateType: 'script' },
} as const;

async function handleGetInputData(
  ctx: WorkspaceContext,
  graphSlug: string,
  nodeId: string,
  inputName: string
): Promise<GetInputDataResult> {

  // Check for reserved parameter
  if (inputName in RESERVED_INPUT_PARAMS) {
    const reserved = RESERVED_INPUT_PARAMS[inputName as keyof typeof RESERVED_INPUT_PARAMS];

    // Get the node's unit slug
    const nodeResult = await pgService.showNode(ctx, graphSlug, nodeId);
    if (nodeResult.errors.length) return { errors: nodeResult.errors };

    // Load the unit to check type
    const unitResult = await workUnitService.load(ctx, nodeResult.unitSlug!);
    if (unitResult.errors.length) return { errors: unitResult.errors };

    // Verify unit type matches reserved param
    if (unitResult.unit!.type !== reserved.unitType) {
      return {
        errors: [{
          code: 'E186',
          message: `Reserved parameter '${inputName}' only valid for ${reserved.unitType} units, but node uses ${unitResult.unit!.type} unit`,
        }],
      };
    }

    // Get template content
    const templateResult = await workUnitService.getTemplateContent(ctx, nodeResult.unitSlug!);
    if (templateResult.errors.length) return { errors: templateResult.errors };

    return {
      value: templateResult.content,
      errors: [],
    };
  }

  // Normal input resolution
  return pgService.getInputData(ctx, graphSlug, nodeId, inputName);
}
```

### CLI Output

```bash
$ cg wf node get-input-data my-graph node-abc main-prompt

You are a specification writer.

Given the following requirements:
{{requirements}}

Generate a detailed specification that includes:
1. Overview
2. Technical requirements
3. Acceptance criteria

$ cg wf node get-input-data my-graph node-abc main-prompt --json

{
  "value": "You are a specification writer.\n\nGiven the following requirements:\n{{requirements}}\n\nGenerate a detailed specification...",
  "path": "/home/user/project/.chainglass/units/spec-generator/prompts/main.md",
  "templateType": "prompt",
  "errors": []
}
```

---

## Integration with collateInputs

### How It Works Today

`collateInputs()` uses `IWorkUnitLoader.load()` to get the unit's input declarations:

```typescript
// Current: Only needs slug, inputs, outputs
const { unit } = await workUnitLoader.load(ctx, nodeConfig.unit_slug);
// unit: NarrowWorkUnit = { slug, inputs, outputs }

for (const declaredInput of unit.inputs) {
  // Resolve each input...
}
```

### After WorkUnitService Implementation

`IWorkUnitService` **structurally satisfies** `IWorkUnitLoader`:

```typescript
// WorkUnit has all fields of NarrowWorkUnit, plus more
type WorkUnit = {
  slug: string;        // ✓ NarrowWorkUnit has this
  inputs: [...];       // ✓ NarrowWorkUnit has this
  outputs: [...];      // ✓ NarrowWorkUnit has this
  type: '...';         // + Extra field
  version: '...';      // + Extra field
  agent?: {...};       // + Extra field
  // ...
};

// So WorkUnitService.load() satisfies IWorkUnitLoader.load()
// No code changes needed in collateInputs!
```

### DI Wiring

```typescript
// apps/cli/src/lib/container.ts

// Register the new WorkUnitService
childContainer.register<IWorkUnitService>(
  POSITIONAL_GRAPH_DI_TOKENS.WORKUNIT_SERVICE,
  { useClass: WorkUnitService }
);

// IWorkUnitLoader is satisfied by WorkUnitService (structural typing)
childContainer.register<IWorkUnitLoader>(
  POSITIONAL_GRAPH_DI_TOKENS.WORK_UNIT_LOADER,
  { useFactory: (c) => c.resolve<IWorkUnitService>(POSITIONAL_GRAPH_DI_TOKENS.WORKUNIT_SERVICE) }
);

// REMOVE the old workgraph bridge
// - childContainer.register<IWorkUnitLoader>(..., { useFactory: ... workgraph ... });
```

---

## Error Codes

| Code | Name | Cause |
|------|------|-------|
| E180 | `unitNotFoundError` | Unit folder or unit.yaml doesn't exist |
| E181 | `unitYamlParseError` | YAML syntax error in unit.yaml |
| E182 | `unitSchemaValidationError` | unit.yaml doesn't match WorkUnitSchema |
| E183 | `unitNoTemplateError` | getTemplateContent called on user-input unit |
| E184 | `unitPathEscapeError` | Template path escapes unit folder (security) |
| E185 | `unitTemplateNotFoundError` | Template file doesn't exist |
| E186 | `unitTypeMismatchError` | Reserved param used with wrong unit type |
| E187 | `unitSlugInvalidError` | Slug doesn't match naming pattern |

### Error Factory Functions

```typescript
// packages/positional-graph/src/errors/workunit-errors.ts

export const WORKUNIT_ERROR_CODES = {
  E180: 'E180',
  E181: 'E181',
  E182: 'E182',
  E183: 'E183',
  E184: 'E184',
  E185: 'E185',
  E186: 'E186',
  E187: 'E187',
} as const;

export function unitNotFoundError(slug: string): ResultError {
  return {
    code: 'E180',
    message: `WorkUnit '${slug}' not found`,
    action: `Check the unit exists at .chainglass/units/${slug}/unit.yaml`,
  };
}

export function unitSchemaValidationError(slug: string, issues: string[]): ResultError {
  return {
    code: 'E182',
    message: `WorkUnit '${slug}' has invalid schema: ${issues.join(', ')}`,
    action: 'Fix the unit.yaml according to the schema',
  };
}

// ... etc
```

---

## Testing Strategy

### Unit Test Fixtures

```typescript
// test/unit/positional-graph/workunit-fixtures.ts

export const agenticUnitFixture: AgenticWorkUnit = {
  slug: 'test-agent',
  type: 'agent',
  version: '1.0.0',
  inputs: [{ name: 'input1', type: 'data', data_type: 'text', required: true }],
  outputs: [{ name: 'output1', type: 'data', data_type: 'text', required: true }],
  agent: {
    prompt_template: 'prompts/main.md',
    system_prompt: 'Test system prompt',
  },
};

export const codeUnitFixture: CodeUnit = {
  slug: 'test-code',
  type: 'code',
  version: '1.0.0',
  inputs: [{ name: 'script_input', type: 'file', required: true }],
  outputs: [{ name: 'result', type: 'data', data_type: 'boolean', required: true }],
  code: {
    script: 'scripts/main.sh',
    timeout: 60,
  },
};

export const userInputUnitFixture: UserInputUnit = {
  slug: 'test-user-input',
  type: 'user-input',
  version: '1.0.0',
  inputs: [],
  outputs: [{ name: 'answer', type: 'data', data_type: 'text', required: true }],
  user_input: {
    question_type: 'text',
    prompt: 'Enter your answer:',
  },
};
```

### Stub Service for Tests

```typescript
// test/unit/positional-graph/workunit-test-helpers.ts

export function stubWorkUnitService(units: WorkUnit[]): IWorkUnitService {
  const unitMap = new Map(units.map(u => [u.slug, u]));

  return {
    async list(ctx) {
      return {
        units: units.map(u => ({
          slug: u.slug,
          type: u.type,
          version: u.version
        })),
        errors: [],
      };
    },

    async load(ctx, slug) {
      const unit = unitMap.get(slug);
      if (!unit) {
        return { errors: [unitNotFoundError(slug)] };
      }
      return { unit, errors: [] };
    },

    async validate(ctx, slug) {
      const unit = unitMap.get(slug);
      return { valid: !!unit, errors: [] };
    },

    async getTemplateContent(ctx, slug) {
      const unit = unitMap.get(slug);
      if (!unit) return { errors: [unitNotFoundError(slug)] };

      if (unit.type === 'agent') {
        return {
          content: `Mock prompt for ${slug}`,
          templateType: 'prompt',
          errors: []
        };
      }
      if (unit.type === 'code') {
        return {
          content: `#!/bin/bash\necho "Mock script for ${slug}"`,
          templateType: 'script',
          errors: []
        };
      }
      return { errors: [unitNoTemplateError(slug)] };
    },
  };
}
```

---

## Open Questions

### Q1: Should template content be cached?

**RESOLVED**: No caching — always read from disk. Simpler implementation, ensures freshness, and file reads are fast for small templates.

### Q2: Should we support template placeholders like `{{input_name}}`?

**RESOLVED**: No substitution — return raw template content. Agents handle their own templating. Keeps the service simple and gives agents full control over how they process templates.

### Q3: How to handle missing template files?

**RESOLVED**: Return E185 error with actionable message. The unit.yaml is valid (it passed schema), but the referenced file is missing. This is a deployment/setup issue, not a schema issue.

---

## Implementation Notes (DYK Session 2026-02-04)

These notes capture design decisions from the `/didyouknow` clarity session:

1. **Schema-First (DYK #2)**: Per ADR-0003, Zod schemas in `workunit.schema.ts` are the source of truth. Types in `workunit.types.ts` are derived via `z.infer<>`, not manually defined.

2. **Input Type Compatibility (DYK #1)**: `WorkUnitInput.data_type` is optional at the TypeScript type level (to match `NarrowWorkUnitInput`), but enforced via Zod refine when `type='data'`. This preserves structural compatibility with existing `NarrowWorkUnit` consumers.

3. **Structural Compatibility Testing (DYK #3)**: Use explicit assignment tests (`const narrow: NarrowWorkUnit = unit;`) to verify compatibility, not just conditional types that may not be exercised.

4. **Error Message Actionability (DYK #4)**: Create `formatZodErrors()` helper to transform Zod's developer-hostile messages into user-friendly actionable guidance before passing to E182 factory.

5. **No Backward Compatibility (DYK #5)**: Existing `unit.yaml` files will be updated in Phase 5 to include required `type` and `version` fields. No backward compatibility shim needed.

---

## Implementation Checklist

- [ ] Create `packages/positional-graph/src/interfaces/workunit.types.ts`
- [ ] Create `packages/positional-graph/src/schemas/workunit.schema.ts`
- [ ] Create `packages/positional-graph/src/adapter/workunit.adapter.ts`
- [ ] Create `packages/positional-graph/src/services/workunit.service.ts`
- [ ] Create `packages/positional-graph/src/errors/workunit-errors.ts`
- [ ] Add error codes E180-E187 to positional-graph error registry
- [ ] Update DI container registration
- [ ] Add reserved parameter routing to CLI
- [ ] Create test fixtures and stub service
- [ ] Write unit tests for WorkUnitService
- [ ] Write integration tests for loading flow
- [ ] Update E2E test with enriched unit fixtures
- [ ] Remove workgraph bridge from DI container

---

## Quick Reference

### Common Operations

```bash
# List all units
cg wf unit list

# Show unit details
cg wf unit show spec-generator

# Validate unit
cg wf unit validate spec-generator

# Get template content (reserved param)
cg wf node get-input-data my-graph node-abc main-prompt
cg wf node get-input-data my-graph node-xyz main-script
```

### File Locations

```
Unit definition:  .chainglass/units/<slug>/unit.yaml
Agent prompt:     .chainglass/units/<slug>/<agent.prompt_template>
Code script:      .chainglass/units/<slug>/<code.script>
```

### Type Discrimination

```typescript
function handleUnit(unit: WorkUnit) {
  switch (unit.type) {
    case 'agent':
      // unit is AgenticWorkUnit
      console.log(unit.agent.prompt_template);
      break;
    case 'code':
      // unit is CodeUnit
      console.log(unit.code.script);
      break;
    case 'user-input':
      // unit is UserInputUnit
      console.log(unit.user_input.prompt);
      break;
  }
}
```
