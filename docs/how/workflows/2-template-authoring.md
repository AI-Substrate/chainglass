# Template Authoring Guide

This guide explains how to create custom workflow templates.

## Template Structure

A workflow template is a directory containing:

```
my-workflow/
├── wf.yaml                  # Workflow definition (required)
├── schemas/                 # JSON Schema files for validation
│   ├── output-data.schema.json
│   └── other-output.schema.json
├── templates/               # Template files
│   └── wf.md                # Standard workflow prompt
└── phases/                  # Phase-specific configuration
    ├── phase-one/
    │   └── commands/
    │       └── main.md      # Phase instructions
    └── phase-two/
        └── commands/
            └── main.md
```

## wf.yaml Schema

The `wf.yaml` file defines your workflow. Here's the complete structure:

```yaml
# Required: Workflow metadata
name: my-workflow           # Slug format (lowercase, hyphens)
version: "1.0.0"           # Semantic version
description: "Description of what this workflow does"

# Required: Phase definitions
phases:
  phase-name:               # Phase slug (lowercase, hyphens)
    description: "What this phase does"
    order: 1                # Execution order (1-based)

    inputs:                 # Optional: Input declarations
      files: [...]          # File inputs
      parameters: [...]     # Parameter inputs from prior phases
      messages: [...]       # Message communication

    outputs: [...]          # Required: Output declarations

    output_parameters: [...] # Optional: Parameters to extract
```

## Phase Definition

### Basic Phase

```yaml
phases:
  gather:
    description: "Collect input data"
    order: 1
    outputs:
      - name: data.json
        type: file
        required: true
        schema: schemas/data.schema.json
        description: "Collected data"
```

### Phase with Inputs from Prior Phase

```yaml
phases:
  process:
    description: "Process the gathered data"
    order: 2

    inputs:
      files:
        - name: data.json
          required: true
          from_phase: gather
          description: "Data from gather phase"
      parameters:
        - name: item_count
          required: true
          from_phase: gather
          description: "Number of items"

    outputs:
      - name: result.json
        type: file
        required: true
        schema: schemas/result.schema.json
```

## Input Declarations

### File Inputs

File inputs are files that must exist before the phase can execute.

```yaml
inputs:
  files:
    - name: source-data.json    # File name (relative to inputs/)
      required: true            # Whether required for phase start
      from_phase: gather        # Optional: Copy from prior phase
      description: "Source data to process"
```

When `from_phase` is specified:
- The file is copied from `phases/{from_phase}/run/outputs/` during `cg phase prepare`
- The source and destination names must match

Files are organized in the run directory:
- `run/inputs/files/` - Human-readable files (.md, .txt)
- `run/inputs/data/` - Structured data files (.json)

### Parameter Inputs

Parameters are values extracted from prior phase outputs using `output_parameters`.

```yaml
inputs:
  parameters:
    - name: item_count          # Must match output_parameter name
      required: true
      from_phase: gather        # Phase that published this parameter
      description: "Number of items to process"
```

Parameters are resolved during `cg phase prepare` and written to `run/inputs/params.json`.

### Message Inputs

Messages enable structured communication between agents and orchestrators.

```yaml
inputs:
  messages:
    - id: "001"                 # 3-digit ID (becomes m-001.json)
      type: "single_choice"     # Message type
      from: "orchestrator"      # Who creates this message
      required: true            # Whether message must exist
      subject: "Task Priority"
      prompt: "How urgent is this task?"
      options:                  # For choice types only
        - key: "A"
          label: "High"
          description: "Complete within 1 hour"
        - key: "B"
          label: "Normal"
          description: "Complete within 1 day"
      description: "Priority selection from user"
```

**Message Types**:

| Type | Use Case | Answer Fields |
|------|----------|---------------|
| `single_choice` | Pick exactly one option | `selected: ["A"]` (exactly 1) |
| `multi_choice` | Pick one or more options | `selected: ["A", "C"]` (1+) |
| `free_text` | Open text response | `text: "response"` |
| `confirm` | Yes/No confirmation | `confirmed: true/false` |

**Message Sources** (`from` field):
- `orchestrator`: Created by human/system before phase starts
- `agent`: Created by agent during phase execution

## Output Declarations

Outputs are files that the phase must produce.

```yaml
outputs:
  - name: result.md           # Output file name
    type: file                # Currently only "file" supported
    required: true            # Whether required for phase completion
    description: "Human-readable result"

  - name: data.json
    type: file
    required: true
    schema: schemas/data.schema.json   # JSON Schema for validation
    description: "Structured output data"
```

Outputs are written to `run/outputs/` and validated by `cg phase validate`.

### Schema Validation

When a `schema` path is specified, `cg phase validate` validates the output JSON against the schema.

```yaml
outputs:
  - name: data.json
    type: file
    required: true
    schema: schemas/data.schema.json   # Relative to template root
```

Schemas must be JSON Schema Draft 2020-12:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.com/schemas/data.schema.json",
  "title": "Output Data",
  "type": "object",
  "required": ["items"],
  "properties": {
    "items": {
      "type": "array",
      "items": { "type": "object" }
    }
  }
}
```

## Output Parameters

Output parameters extract values from outputs for downstream phases.

```yaml
output_parameters:
  - name: item_count          # Parameter name for downstream
    source: data.json         # Source output file
    query: "items.length"     # Dot-notation path
    description: "Number of items processed"

  - name: status
    source: data.json
    query: "summary.status"
    description: "Processing status"
```

**Query Syntax**: Simple dot-notation path traversal:
- `items.length` - Array length (JavaScript property)
- `summary.status` - Nested object property
- `results.0.name` - Array index access

Parameters are extracted during `cg phase finalize` and written to `run/wf-data/output-params.json`.

## Complete Example

Here's a complete 3-phase workflow template:

```yaml
name: hello-workflow
version: "1.0.0"
description: "Example workflow with gather, process, and report phases"

phases:
  gather:
    description: "Collect and acknowledge input data"
    order: 1

    inputs:
      messages:
        - id: "001"
          type: "free_text"
          from: "orchestrator"
          required: true
          subject: "Workflow Request"
          prompt: "What would you like to accomplish?"

    outputs:
      - name: acknowledgment.md
        type: file
        required: true
        description: "Acknowledgment of the request"
      - name: gather-data.json
        type: file
        required: true
        schema: schemas/gather-data.schema.json

    output_parameters:
      - name: item_count
        source: gather-data.json
        query: "items.length"
      - name: request_type
        source: gather-data.json
        query: "classification.type"

  process:
    description: "Process the gathered data"
    order: 2

    inputs:
      files:
        - name: acknowledgment.md
          required: true
          from_phase: gather
        - name: gather-data.json
          required: true
          from_phase: gather
      parameters:
        - name: item_count
          required: true
          from_phase: gather

    outputs:
      - name: result.md
        type: file
        required: true
      - name: process-data.json
        type: file
        required: true
        schema: schemas/process-data.schema.json

    output_parameters:
      - name: processed_count
        source: process-data.json
        query: "summary.processed_count"
      - name: status
        source: process-data.json
        query: "summary.status"

  report:
    description: "Generate final report"
    order: 3

    inputs:
      files:
        - name: result.md
          required: true
          from_phase: process
        - name: process-data.json
          required: true
          from_phase: process
      parameters:
        - name: processed_count
          required: true
          from_phase: process

    outputs:
      - name: final-report.md
        type: file
        required: true

    # Terminal phase: no output_parameters needed
```

## Template Location

Templates can be stored in:

1. **Default templates directory**: `.chainglass/templates/<slug>/`
2. **Custom path**: Any directory path

When using `cg wf compose`:

```bash
# From default directory (looks for .chainglass/templates/my-workflow/)
cg wf compose my-workflow

# From relative path
cg wf compose ./custom-templates/my-workflow

# From absolute path
cg wf compose /path/to/templates/my-workflow

# With tilde expansion
cg wf compose ~/workflows/my-workflow
```

## Phase Command Files

Each phase can have a `commands/main.md` file with instructions for agents:

```
phases/gather/commands/main.md
```

This file should explain:
- What the phase needs to accomplish
- Where to find inputs (`run/inputs/files/`, `run/inputs/data/`)
- Where to write outputs (`run/outputs/`)
- What validation criteria must be met

## Best Practices

### Naming Conventions

- **Workflow name**: lowercase with hyphens (`my-workflow`)
- **Phase names**: lowercase with hyphens (`gather`, `process-data`)
- **Output files**: lowercase with hyphens (`output-data.json`)
- **Schema files**: Match output name with `.schema.json` suffix

### Phase Design

1. **Single Responsibility**: Each phase should do one thing well
2. **Explicit Contracts**: Declare all inputs and outputs
3. **Schema Validation**: Always validate JSON outputs
4. **Parameter Publishing**: Extract values needed by downstream phases

### Input/Output Patterns

1. **First phase**: Typically has no file inputs (uses messages or external data)
2. **Middle phases**: Use `from_phase` to chain data
3. **Terminal phase**: Usually has no `output_parameters`

### Error Handling

- Make required outputs truly required
- Use schemas to catch data format issues early
- Document expected formats in descriptions

## Next Steps

- [CLI Reference](./3-cli-reference.md) - Complete command documentation
- [MCP Reference](./4-mcp-reference.md) - MCP tool documentation
- [Overview](./1-overview.md) - System concepts
