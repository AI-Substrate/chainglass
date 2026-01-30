# WorkUnit Data Model

This document defines the data model for WorkUnits - the reusable building blocks of WorkGraphs.

---

## Overview

**WorkUnits** are reusable templates that define a unit of work. They are stored in `.chainglass/units/` and can be referenced by multiple WorkGraphs.

Three unit types:
1. **AgentUnit** - Work executed by an LLM agent (Claude Code, Copilot)
2. **CodeUnit** - Work executed by a script/code
3. **UserInputUnit** - Work that collects human input

---

## File Storage

```
.chainglass/units/
├── write-poem/                    # AgentUnit example
│   ├── unit.yaml                  # Unit definition
│   └── commands/
│       └── main.md                # Prompt template for agent
│
├── format-json/                   # CodeUnit example
│   ├── unit.yaml
│   └── scripts/
│       └── format.ts              # Script to execute
│
├── user-input-text/               # UserInputUnit example
│   └── unit.yaml                  # No commands/scripts needed
│
└── user-input-choice/             # UserInputUnit example
    └── unit.yaml
```

---

## Base WorkUnit Schema

All unit types share these common properties.

### unit.yaml (base)

```yaml
# Common to all unit types
slug: write-poem                   # Unique identifier (matches folder name)
type: agent                        # "agent" | "code" | "user-input"
version: 1.0.0                     # Semantic version
description: Write a creative poem # Human-readable description

# Input/Output declarations
inputs:
  - name: topic
    type: data                     # "data" | "file"
    data_type: text                # For data: "text" | "number" | "boolean" | "json"
    required: true
    description: The topic to write about

  - name: reference
    type: file                     # File inputs reference upstream file outputs
    required: false
    description: Optional reference material

outputs:
  - name: poem
    type: file
    required: true
    description: The generated poem

  - name: title
    type: data
    data_type: text
    required: true
    description: Title of the poem

  - name: word_count
    type: data
    data_type: number
    required: true
    description: Word count of the poem

  - name: notes
    type: file
    required: false                # Optional outputs allowed
    description: Author notes
```

---

## AgentUnit Schema

Extends base with agent-specific configuration.

### unit.yaml (AgentUnit)

```yaml
slug: write-poem
type: agent
version: 1.0.0
description: Write a creative poem about a given topic

inputs:
  - name: topic
    type: data
    data_type: text
    required: true

outputs:
  - name: poem
    type: file
    required: true
  - name: title
    type: data
    data_type: text
    required: true

# Agent-specific configuration
agent:
  # Path to prompt template (relative to unit folder)
  prompt_template: commands/main.md

  # Optional: System prompt prefix
  system_prompt: |
    You are a creative poet with expertise in various forms and styles.

  # Optional: Supported agent types (defaults to all)
  supported_agents:
    - claude-code
    - copilot

  # Optional: Estimated token budget (informational)
  estimated_tokens: 5000
```

### commands/main.md (AgentUnit prompt)

```markdown
# Write Poem

Write a creative poem about: {{topic}}

## Requirements

1. The poem should be 8-16 lines
2. Use vivid imagery and metaphor
3. The poem should evoke emotion

## Output

Save your poem to a file called `poem.md`.
```

**Note**: `{{topic}}` placeholders could be expanded by the CLI when building the bootstrap prompt, or the agent reads inputs dynamically via `get-input-data`.

---

## CodeUnit Schema

Extends base with code execution configuration. CodeUnits use a **convention-over-configuration** approach with a well-known script filename.

### File Structure

```
.chainglass/units/format-json/
├── unit.yaml                      # Unit definition (inputs/outputs only)
└── run                            # Well-known entry point (any language)
```

The entry point is always named `run` (with appropriate extension for the language):
- `run.sh` - Bash script
- `run.py` - Python script
- `run.ts` - TypeScript (executed via ts-node or similar)
- `run.js` - JavaScript
- `run` - Executable binary

### unit.yaml (CodeUnit)

```yaml
slug: format-json
type: code
version: 1.0.0
description: Format and validate JSON files

inputs:
  - name: input_file
    type: file
    required: true
    description: JSON file to format

outputs:
  - name: formatted_file
    type: file
    required: true
    description: Formatted JSON file
  - name: valid
    type: data
    data_type: boolean
    required: true
    description: Whether the JSON was valid

# Code-specific configuration (minimal for v1)
code:
  # Optional: Timeout in seconds (default: 60)
  timeout: 30
```

Note: No `script` or `runtime` field - the CLI detects the `run.*` file and executes it appropriately.

### run.sh (CodeUnit script example)

```bash
#!/bin/bash
# Inputs passed as positional arguments in declaration order
# $1 = input_file (path to the file)

INPUT_FILE="$1"

# Do the work...
jq '.' "$INPUT_FILE" > formatted.json

# Outputs: script is responsible for calling CLI to save outputs
cg wg node "$WG_NODE" save-output-file formatted_file ./formatted.json
cg wg node "$WG_NODE" save-output-data valid true
```

### Input Passing (KISS approach)

Inputs are passed as **positional CLI arguments** in declaration order:

```bash
# For a unit with inputs: [input_file, config_json]
./run.sh /path/to/input.json '{"indent": 2}'
```

- **File inputs**: Path to the upstream file is passed
- **Data inputs**: Value is passed as string

The script can also access the node slug via `WG_NODE` environment variable to call CLI commands for saving outputs.

### Output Saving

CodeUnit scripts save outputs the same way agents do - by calling CLI commands:

```bash
# Save file output
cg wg node "$WG_NODE" save-output-file <name> <path>

# Save data output
cg wg node "$WG_NODE" save-output-data <name> <value>
```

This keeps the output mechanism consistent across all unit types.

---

## UserInputUnit Schema

Simplified unit for collecting human input.

**Key principle**: Users can **always include text** with any answer type. Selecting "A" doesn't prevent adding context or explanation.

### Standard Outputs

All UserInputUnit types produce these outputs:

| Output | Type | Description |
|--------|------|-------------|
| `text` | data (text) | Free-form text (always available, may be empty) |
| `selection` | data (text) | Selected key(s) - for single/multi types |
| `confirmed` | data (boolean) | Yes/no result - for confirm type |

### unit.yaml (UserInputUnit - text only)

```yaml
slug: user-input-text
type: user-input
version: 1.0.0
description: Collect free-form text input from user

inputs: []                         # UserInputUnits typically have no inputs

outputs:
  - name: text
    type: data
    data_type: text
    required: true
    description: User's text response

user_input:
  question_type: text
  prompt: "{{config.prompt}}"      # Configurable at node creation
```

### unit.yaml (UserInputUnit - single choice)

```yaml
slug: user-input-choice
type: user-input
version: 1.0.0
description: User selects one option from a list

inputs: []

outputs:
  - name: selection
    type: data
    data_type: text
    required: true
    description: Key of selected option (e.g., "A")
  - name: text
    type: data
    data_type: text
    required: false                # Optional - user may add context
    description: Additional text provided with selection

user_input:
  question_type: single
  prompt: "{{config.prompt}}"
  options: "{{config.options}}"    # Array of {key, label}
```

### unit.yaml (UserInputUnit - multi choice)

```yaml
slug: user-input-multi
type: user-input
version: 1.0.0
description: User selects one or more options

inputs: []

outputs:
  - name: selection
    type: data
    data_type: json                # Array of keys: ["A", "C"]
    required: true
    description: Keys of selected options
  - name: text
    type: data
    data_type: text
    required: false
    description: Additional text provided with selection

user_input:
  question_type: multi
  prompt: "{{config.prompt}}"
  options: "{{config.options}}"
```

### unit.yaml (UserInputUnit - confirm)

```yaml
slug: user-input-confirm
type: user-input
version: 1.0.0
description: User confirms yes or no

inputs: []

outputs:
  - name: confirmed
    type: data
    data_type: boolean
    required: true
    description: True if user confirmed
  - name: text
    type: data
    data_type: text
    required: false
    description: Additional text (e.g., reason for declining)

user_input:
  question_type: confirm
  prompt: "{{config.prompt}}"
```

### Answer Storage (in data.json)

```json
{
  "outputs": {
    "selection": "A",
    "text": "I chose A because it better fits the project style"
  }
}
```

Or for multi-choice:

```json
{
  "outputs": {
    "selection": ["A", "C"],
    "text": "Both options are needed for full coverage"
  }
}
```

---

## TypeScript Types

```typescript
// ============================================
// Base Types
// ============================================

/** Input/output type discriminator */
type IOType = 'data' | 'file';

/** Data type for data I/O */
type DataType = 'text' | 'number' | 'boolean' | 'json';

/** Unit type discriminator */
type UnitType = 'agent' | 'code' | 'user-input';

/** Input declaration */
interface InputDeclaration {
  name: string;
  type: IOType;
  dataType?: DataType;     // Required when type='data'
  required: boolean;
  description?: string;
}

/** Output declaration */
interface OutputDeclaration {
  name: string;
  type: IOType;
  dataType?: DataType;     // Required when type='data'
  required: boolean;
  description?: string;
}

// ============================================
// Base WorkUnit
// ============================================

interface WorkUnitBase {
  slug: string;
  type: UnitType;
  version: string;
  description?: string;
  inputs: InputDeclaration[];
  outputs: OutputDeclaration[];
}

// ============================================
// AgentUnit
// ============================================

interface AgentConfig {
  promptTemplate: string;         // Path relative to unit folder
  systemPrompt?: string;
  supportedAgents?: ('claude-code' | 'copilot')[];
  estimatedTokens?: number;
}

interface AgentUnit extends WorkUnitBase {
  type: 'agent';
  agent: AgentConfig;
}

// ============================================
// CodeUnit
// ============================================

interface CodeConfig {
  timeout?: number;               // Seconds, default 60
}

interface CodeUnit extends WorkUnitBase {
  type: 'code';
  code?: CodeConfig;              // Optional - only needed if overriding defaults
}

// ============================================
// UserInputUnit
// ============================================

type QuestionType = 'text' | 'single' | 'multi' | 'confirm';

interface UserInputOption {
  key: string;
  label: string;
  description?: string;
}

interface UserInputConfig {
  questionType: QuestionType;
  prompt: string;                 // May contain {{config.*}} placeholders
  options?: UserInputOption[] | string;  // Static array or "{{config.options}}"
}

interface UserInputUnit extends WorkUnitBase {
  type: 'user-input';
  userInput: UserInputConfig;
}

/**
 * User input answer structure.
 * Text is always available (may be empty).
 * Selection/confirmed depends on question type.
 */
interface UserInputAnswer {
  text?: string;                  // Always allowed
  selection?: string | string[];  // For single (string) or multi (string[])
  confirmed?: boolean;            // For confirm type
}

// ============================================
// Union Type
// ============================================

type WorkUnit = AgentUnit | CodeUnit | UserInputUnit;
```

---

## JSON Schema (for unit.yaml validation)

The JSON Schema validates unit.yaml files with **helpful error messages**.

### Design Principles

1. **Discriminated union on `type`** - Different required fields per type
2. **Input/output validation** - Ensure dataType present when type='data'
3. **Slug format** - Lowercase, hyphens only, starts with letter
4. **Helpful errors** - Each field has description for error context

### Full Schema

```typescript
// Embedded schema (like existing WF_SCHEMA pattern)
export const WORK_UNIT_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://chainglass.dev/schemas/work-unit.schema.json',
  title: 'Work Unit Definition',
  description: 'Schema for work unit definition files (unit.yaml)',
  type: 'object',
  required: ['slug', 'type', 'version', 'outputs'],
  properties: {
    slug: {
      type: 'string',
      pattern: '^[a-z][a-z0-9-]*$',
      description: 'Unique identifier (lowercase, hyphens, must match folder name)',
    },
    type: {
      type: 'string',
      enum: ['agent', 'code', 'user-input'],
      description: 'Unit type: agent (LLM), code (script), or user-input (human)',
    },
    version: {
      type: 'string',
      pattern: '^\\d+\\.\\d+\\.\\d+$',
      description: 'Semantic version (e.g., "1.0.0")',
    },
    description: {
      type: 'string',
      description: 'Human-readable description of what this unit does',
    },
    inputs: {
      type: 'array',
      items: { $ref: '#/$defs/ioDeclaration' },
      default: [],
      description: 'Input declarations (empty array if no inputs needed)',
    },
    outputs: {
      type: 'array',
      items: { $ref: '#/$defs/ioDeclaration' },
      minItems: 1,
      description: 'Output declarations (at least one required)',
    },
    agent: {
      $ref: '#/$defs/agentConfig',
      description: 'Agent-specific config (required when type="agent")',
    },
    code: {
      $ref: '#/$defs/codeConfig',
      description: 'Code-specific config (optional when type="code")',
    },
    user_input: {
      $ref: '#/$defs/userInputConfig',
      description: 'User input config (required when type="user-input")',
    },
  },

  // Type-specific requirements
  allOf: [
    {
      if: { properties: { type: { const: 'agent' } }, required: ['type'] },
      then: { required: ['agent'] },
    },
    {
      if: { properties: { type: { const: 'user-input' } }, required: ['type'] },
      then: { required: ['user_input'] },
    },
  ],

  $defs: {
    // ─────────────────────────────────────────────────────────────
    // Input/Output Declaration
    // ─────────────────────────────────────────────────────────────
    ioDeclaration: {
      type: 'object',
      required: ['name', 'type', 'required'],
      properties: {
        name: {
          type: 'string',
          pattern: '^[a-z][a-z0-9_]*$',
          description: 'Input/output name (lowercase, underscores allowed)',
        },
        type: {
          type: 'string',
          enum: ['data', 'file'],
          description: '"data" for values, "file" for file references',
        },
        data_type: {
          type: 'string',
          enum: ['text', 'number', 'boolean', 'json'],
          description: 'Data type (required when type="data")',
        },
        required: {
          type: 'boolean',
          description: 'Whether this input/output is required',
        },
        description: {
          type: 'string',
          description: 'Human-readable description',
        },
      },
      // data_type required when type="data"
      if: { properties: { type: { const: 'data' } } },
      then: { required: ['name', 'type', 'required', 'data_type'] },
    },

    // ─────────────────────────────────────────────────────────────
    // Agent Config
    // ─────────────────────────────────────────────────────────────
    agentConfig: {
      type: 'object',
      required: ['prompt_template'],
      properties: {
        prompt_template: {
          type: 'string',
          description: 'Path to prompt file relative to unit folder (e.g., "commands/main.md")',
        },
        system_prompt: {
          type: 'string',
          description: 'Optional system prompt prefix for the agent',
        },
        supported_agents: {
          type: 'array',
          items: { enum: ['claude-code', 'copilot'] },
          description: 'Which agent types can execute this unit (default: all)',
        },
        estimated_tokens: {
          type: 'integer',
          minimum: 0,
          description: 'Estimated token budget (informational)',
        },
      },
    },

    // ─────────────────────────────────────────────────────────────
    // Code Config
    // ─────────────────────────────────────────────────────────────
    codeConfig: {
      type: 'object',
      properties: {
        timeout: {
          type: 'integer',
          minimum: 1,
          maximum: 3600,
          default: 60,
          description: 'Execution timeout in seconds (default: 60)',
        },
      },
    },

    // ─────────────────────────────────────────────────────────────
    // User Input Config
    // ─────────────────────────────────────────────────────────────
    userInputConfig: {
      type: 'object',
      required: ['question_type', 'prompt'],
      properties: {
        question_type: {
          type: 'string',
          enum: ['text', 'single', 'multi', 'confirm'],
          description: 'Type of user input to collect',
        },
        prompt: {
          type: 'string',
          description: 'Prompt text (may contain {{config.X}} placeholders)',
        },
        options: {
          oneOf: [
            {
              type: 'array',
              items: { $ref: '#/$defs/userInputOption' },
              minItems: 2,
            },
            {
              type: 'string',
              pattern: '^\\{\\{config\\.',
              description: 'Placeholder for runtime config (e.g., "{{config.options}}")',
            },
          ],
          description: 'Options for single/multi choice (required for those types)',
        },
      },
      // Options required for single/multi
      allOf: [
        {
          if: { properties: { question_type: { const: 'single' } } },
          then: { required: ['question_type', 'prompt', 'options'] },
        },
        {
          if: { properties: { question_type: { const: 'multi' } } },
          then: { required: ['question_type', 'prompt', 'options'] },
        },
      ],
    },

    userInputOption: {
      type: 'object',
      required: ['key', 'label'],
      properties: {
        key: {
          type: 'string',
          pattern: '^[A-Z]$',
          description: 'Single letter key (A, B, C, etc.)',
        },
        label: {
          type: 'string',
          minLength: 1,
          description: 'Display label for the option',
        },
        description: {
          type: 'string',
          description: 'Longer description of the option',
        },
      },
    },
  },
} as const;
```

### Example Validation Errors

The schema validator (using AJV) produces errors like:

```
E010: Missing required field 'prompt_template'
  Location: /agent
  Fix: Add prompt_template path, e.g.: prompt_template: "commands/main.md"

E011: Invalid type for 'version'
  Location: /version
  Expected: string matching "X.Y.Z" pattern
  Got: 1.0 (number)
  Fix: Use quoted string: version: "1.0.0"

E012: Invalid enum value for 'type'
  Location: /inputs/0/type
  Expected: "data" | "file"
  Got: "string"
  Fix: Use type: "data" with data_type: "text"

E010: Missing required field 'data_type'
  Location: /outputs/0
  Context: When type="data", data_type is required
  Fix: Add data_type: "text" | "number" | "boolean" | "json"
```

### Minimal Valid Examples

**AgentUnit (minimal)**:
```yaml
slug: write-poem
type: agent
version: "1.0.0"
outputs:
  - name: poem
    type: file
    required: true
agent:
  prompt_template: commands/main.md
```

**CodeUnit (minimal)**:
```yaml
slug: format-json
type: code
version: "1.0.0"
outputs:
  - name: result
    type: file
    required: true
```

**UserInputUnit (minimal)**:
```yaml
slug: ask-topic
type: user-input
version: "1.0.0"
outputs:
  - name: text
    type: data
    data_type: text
    required: true
user_input:
  question_type: text
  prompt: "{{config.prompt}}"
```

---

## Open Questions

### Q1: Config placeholders in UserInputUnit

**RESOLVED**:

Two mechanisms for user input:

1. **UserInputUnit** - Pre-planned input at a specific graph location. Config is set at node creation via `--config prompt="..." --config options="..."`. The `{{config.X}}` placeholders are resolved when the node is added to the graph.

2. **Agent `ask` command** - Dynamic questions during AgentUnit execution. Agent can ask any question, any time, multiple times per session. Full flexibility. See `workgraph-command-flows.md` for the ask/answer flow.

UserInputUnit is for structured, predictable input points. Agent `ask` is for dynamic clarification during work.

### Q2: CodeUnit I/O mechanism

**RESOLVED**:
- Inputs: Positional CLI arguments in declaration order
- Outputs: Script calls `cg wg node $WG_NODE save-output-*` commands (same as agents)
- Node slug available via `WG_NODE` environment variable

### Q3: Type validation for data outputs

**RESOLVED**: Option A - Strict validation with helpful errors.

- `number` must be a number, not `"42"`
- `boolean` must be `true`/`false`, not `"yes"`
- Errors include context, expected type, got type, and fix suggestion

See "Example Validation Errors" in the JSON Schema section above.

### Q4: Unit versioning and compatibility

**RESOLVED**: Options B + C - Always use latest, out of scope for v1.

- Nodes always use the current unit definition (no version pinning)
- Breaking changes to a unit affect all graphs using it
- Use git for versioning if needed
- Version pinning may be added in future versions

### Q5: Input mapping names

**RESOLVED**: Option A - Names must match exactly.

- Output `topic` wires to input `topic`
- If names don't match, can't connect directly
- Can add "mapping" or "transform" nodes later if needed
- KISS for v1

---

## Implementation Notes

### Package Location

```
packages/workgraph/
├── src/
│   ├── entities/
│   │   └── work-unit.ts          # WorkUnit entity class
│   ├── interfaces/
│   │   └── unit-loader.interface.ts
│   ├── schemas/
│   │   └── work-unit.schema.ts   # Embedded JSON Schema
│   ├── services/
│   │   └── unit-loader.service.ts # Load/validate units from filesystem
│   └── types/
│       └── work-unit.types.ts    # TypeScript types
```

### Loading Pattern

```typescript
// UnitLoader service
interface IUnitLoader {
  /** List all available units */
  list(): Promise<WorkUnitSummary[]>;

  /** Load a unit by slug */
  load(slug: string): Promise<WorkUnit>;

  /** Validate a unit definition */
  validate(unit: unknown): ValidationResult;
}
```

---

## Next Steps

After finalizing WorkUnit model:
1. Define WorkGraph data model (work-graph.yaml, state.json)
2. Define WorkNode data model (node.yaml, data.json)
3. Define input/output resolution logic
