# Work Unit API Reference

Work Units define the configuration, inputs, outputs, and templates for nodes in a positional graph workflow. This document covers the WorkUnit type system, service API, CLI commands, and error handling.

## Type Definitions

Work Units use a discriminated union based on the `type` field. Each type has specific configuration and behavior.

### AgenticWorkUnit (type: 'agent')

Agent units are executed by AI agents and have a prompt template that guides the agent's behavior.

```yaml
slug: sample-coder
type: agent
version: 1.0.0
description: Generates code based on specification

inputs:
  - name: spec
    type: data
    data_type: text
    required: true
    description: The specification for what code to generate

outputs:
  - name: language
    type: data
    data_type: text
    required: true
    description: The programming language chosen
  - name: code
    type: file
    required: true
    description: The generated code file

agent:
  prompt_template: prompts/main.md
  supported_agents:
    - claude-code
  estimated_tokens: 2000
```

**Key Fields:**
- `agent.prompt_template`: Path to the prompt template file (relative to unit folder)
- `agent.supported_agents`: List of agent types that can execute this unit
- `agent.estimated_tokens`: Token count hint for prompt sizing

### CodeUnit (type: 'code')

Code units execute shell scripts or programs without AI agent involvement.

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

**Key Fields:**
- `code.script`: Path to the script file (relative to unit folder)
- `code.timeout`: Maximum execution time in seconds

### UserInputUnit (type: 'user-input')

User input units collect data directly from users without executing code or AI prompts.

```yaml
slug: sample-input
type: user-input
version: 1.0.0
description: Provides initial specification for code generation

inputs: []

outputs:
  - name: spec
    type: data
    data_type: text
    required: true
    description: The specification for what code to generate

user_input:
  question_type: text
  prompt: "What code would you like to generate?"
```

**Key Fields:**
- `user_input.question_type`: One of `text`, `single`, `multi`, `confirm`
- `user_input.prompt`: The question text to display to the user
- `user_input.options`: For `single`/`multi` types, the available choices

**Important:** User input units have no template. Calling `get-template` on a user-input unit returns error E183.

## Service API

The `IWorkUnitService` interface provides programmatic access to work units.

### Methods

```typescript
interface IWorkUnitService {
  // List all unit slugs in the workspace
  list(ctx: IWorkspaceContext): Promise<WorkUnitListResult>;

  // Load a full unit definition by slug
  load(ctx: IWorkspaceContext, slug: string): Promise<WorkUnitLoadResult>;

  // Validate a unit without loading the full definition
  validate(ctx: IWorkspaceContext, slug: string): Promise<WorkUnitValidateResult>;

  // Get the template content (prompt or script)
  getTemplateContent(ctx: IWorkspaceContext, slug: string): Promise<WorkUnitTemplateResult>;
}
```

### Load Result

The `load()` method returns a rich domain object with type-specific methods:

```typescript
// For AgenticWorkUnit
const result = await service.load(ctx, 'sample-coder');
if (result.unit?.type === 'agent') {
  const prompt = await result.unit.getPrompt();  // Returns prompt content
}

// For CodeUnit
const result = await service.load(ctx, 'sample-pr-creator');
if (result.unit?.type === 'code') {
  const script = await result.unit.getScript();  // Returns script content
}
```

## CLI Commands

All work unit commands are under `cg wf unit`. Use `--json` for machine-readable output.

### List Units

```bash
cg wf unit list [--workspace-path <path>]
```

Lists all available units in the workspace.

**Response:**
```json
{
  "success": true,
  "data": {
    "units": [
      {"slug": "sample-coder", "type": "agent", "version": "1.0.0"},
      {"slug": "sample-pr-creator", "type": "code", "version": "1.0.0"},
      {"slug": "sample-input", "type": "user-input", "version": "1.0.0"}
    ]
  }
}
```

### Get Unit Info

```bash
cg wf unit info <slug> [--workspace-path <path>]
```

Returns full unit definition including inputs, outputs, and type-specific configuration.

**Response:**
```json
{
  "success": true,
  "data": {
    "unit": {
      "slug": "sample-coder",
      "type": "agent",
      "version": "1.0.0",
      "inputs": [...],
      "outputs": [...],
      "agent": {
        "prompt_template": "prompts/main.md",
        "supported_agents": ["claude-code"],
        "estimated_tokens": 2000
      }
    }
  }
}
```

### Get Template Content

```bash
cg wf unit get-template <slug> [--workspace-path <path>]
```

Returns the template content (prompt for agents, script for code units).

**Response:**
```json
{
  "success": true,
  "data": {
    "content": "# Code Generator\n\nYou are generating code...",
    "templateType": "prompt",
    "templatePath": "prompts/main.md"
  }
}
```

### Reserved Parameters

Reserved parameters provide template access during workflow execution through `get-input-data`:

```bash
cg wf node get-input-data <graph> <nodeId> main-prompt   # For agent units
cg wf node get-input-data <graph> <nodeId> main-script   # For code units
```

Reserved parameters work regardless of node state (pending, running, or complete) because templates are static configuration.

**Type Matching:**
- `main-prompt` → requires `type: agent`
- `main-script` → requires `type: code`

Using the wrong reserved parameter for a unit type returns error E186.

## Error Reference

Work unit operations use error codes E180-E187.

| Code | Error | Cause | Action |
|------|-------|-------|--------|
| E180 | Unit Not Found | Unit folder or unit.yaml doesn't exist | Check the unit exists at `.chainglass/units/<slug>/unit.yaml` |
| E181 | YAML Parse Error | Syntax error in unit.yaml | Fix the YAML syntax error in unit.yaml |
| E182 | Schema Validation Error | unit.yaml doesn't match WorkUnitSchema | Ensure 'type' is one of: agent, code, user-input |
| E183 | No Template | `get-template` called on user-input unit | User-input units collect input directly; use agent or code units for templates |
| E184 | Path Escape | Template path tries to escape unit folder | Use relative paths that stay within the unit folder |
| E185 | Template Not Found | Template file doesn't exist | Create the template file at the specified path |
| E186 | Type Mismatch | Reserved param used with wrong unit type | Use `main-prompt` with agent units, `main-script` with code units |
| E187 | Invalid Slug | Slug doesn't match naming pattern | Slug must start with a letter and contain only lowercase letters, numbers, and hyphens |

## File Structure

Work units are stored at:

```
<workspace>/.chainglass/units/<slug>/
  unit.yaml           # Unit definition (required)
  prompts/            # For agent units
    main.md           # Prompt template
  scripts/            # For code units
    main.sh           # Script file
```

The unit path is **always** `.chainglass/units/`, not `.chainglass/data/units/` (which is a legacy path).

## Examples

### Creating an Agent Unit

1. Create the directory structure:
```bash
mkdir -p .chainglass/units/my-analyzer/prompts
```

2. Create `unit.yaml`:
```yaml
slug: my-analyzer
type: agent
version: 1.0.0
description: Analyzes code for issues

inputs:
  - name: code
    type: file
    required: true

outputs:
  - name: issues
    type: data
    data_type: text
    required: true

agent:
  prompt_template: prompts/main.md
  supported_agents:
    - claude-code
```

3. Create `prompts/main.md`:
```markdown
# Code Analyzer

You are analyzing code for potential issues.

## Step 1: Get the Code

```bash
cg wf node get-input-file $GRAPH $NODE code
```

## Step 2: Analyze and Save Results

```bash
cg wf node save-output-data $GRAPH $NODE issues "<analysis>"
cg wf node end $GRAPH $NODE
```
```

### Using Q&A Protocol with Agent Units

Agent units can interact with users through the Q&A protocol. See [qnaloop.md](../../plans/029-agentic-work-units/doco/qnaloop.md) for the complete command sequence:

1. Agent asks a question: `cg wf node ask <graph> <nodeId> --type single --text "..." --options ...`
2. Agent exits immediately (node status becomes `waiting-question`)
3. Orchestrator answers: `cg wf node answer <graph> <nodeId> <questionId> --value "..."`
4. Agent resumes (node status returns to `running`)
5. Agent retrieves answer: `cg wf node get-answer <graph> <nodeId> <questionId>`

## Related Documentation

- [Positional Graph Overview](./1-overview.md) — Core concepts and data model
- [Positional Graph CLI](./2-cli-usage.md) — Graph structure commands
- [Execution CLI Reference](../positional-graph-execution/2-cli-reference.md) — Node lifecycle commands
- [Q&A Protocol](../../plans/029-agentic-work-units/doco/qnaloop.md) — Agent-orchestrator interaction
