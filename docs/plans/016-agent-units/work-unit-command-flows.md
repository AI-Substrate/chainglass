# Work-Unit Command Flows

Reference document for CLI commands that manage WorkUnits - the reusable building blocks of WorkGraphs.

**Related Documents**:
- [WorkGraph Command Flows](workgraph-command-flows.md) - Graph and node commands (`cg wg`)
- [WorkUnit Data Model](workunit-data-model.md) - Unit definition schemas
- [WorkGraph Data Model](workgraph-data-model.md) - Graph and node schemas

---

## Overview

**WorkUnits** are reusable templates stored in `.chainglass/units/`. They define:
- **Inputs**: What data/files the unit needs
- **Outputs**: What data/files the unit produces
- **Type**: How the unit executes (agent, code, user-input)

Units are independent of work-graphs. The same unit can be used in many work-graphs.

---

## Command Summary

| Command | Purpose |
|---------|---------|
| `cg unit list` | List all available units |
| `cg unit info <slug>` | Show unit details (inputs, outputs, type) |
| `cg unit create <slug> --type <type>` | Scaffold a new unit |
| `cg unit validate <slug>` | Validate unit definition |

---

## List Units

```
$ cg unit list

┌─────────────────────────────────────────────────────────────┐
│ LOAD                                                        │
│   • Scan .chainglass/units/                                 │
│   • Load unit.yaml from each subdirectory                   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ OUTPUT                                                      │
│                                                             │
│   ┌──────────────────┬─────────────┬───────────────────────┐│
│   │ Slug             │ Type        │ Description           ││
│   ├──────────────────┼─────────────┼───────────────────────┤│
│   │ user-input-text  │ user-input  │ Collect free-form text││
│   │ user-input-choice│ user-input  │ Single choice select  ││
│   │ write-poem       │ agent       │ Write a creative poem ││
│   │ format-json      │ code        │ Format/validate JSON  ││
│   └──────────────────┴─────────────┴───────────────────────┘│
│                                                             │
│   4 units found                                             │
└─────────────────────────────────────────────────────────────┘
```

### List Units (JSON output)

```
$ cg unit list --json

[
  {
    "slug": "user-input-text",
    "type": "user-input",
    "version": "1.0.0",
    "description": "Collect free-form text input from user"
  },
  {
    "slug": "write-poem",
    "type": "agent",
    "version": "1.0.0",
    "description": "Write a creative poem about a given topic"
  }
]
```

---

## Unit Info

```
$ cg unit info <slug>

┌─────────────────────────────────────────────────────────────┐
│ INPUT                                                       │
│   slug: "write-poem"                                        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ LOAD                                                        │
│   • Read .chainglass/units/write-poem/unit.yaml             │
│   • Validate against schema                                 │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ OUTPUT                                                      │
│                                                             │
│   Unit: write-poem                                          │
│   Type: agent                                               │
│   Version: 1.0.0                                            │
│   Description: Write a creative poem about a given topic    │
│                                                             │
│   Inputs:                                                   │
│   ┌────────┬──────┬──────────┬─────────────────────────────┐│
│   │ Name   │ Type │ Required │ Description                 ││
│   ├────────┼──────┼──────────┼─────────────────────────────┤│
│   │ text   │ data │ yes      │ The topic to write about    ││
│   └────────┴──────┴──────────┴─────────────────────────────┘│
│                                                             │
│   Outputs:                                                  │
│   ┌────────────┬──────┬──────────┬─────────────────────────┐│
│   │ Name       │ Type │ Required │ Description             ││
│   ├────────────┼──────┼──────────┼─────────────────────────┤│
│   │ poem       │ file │ yes      │ The generated poem      ││
│   │ title      │ data │ yes      │ Title of the poem       ││
│   │ word_count │ data │ yes      │ Word count              ││
│   └────────────┴──────┴──────────┴─────────────────────────┘│
│                                                             │
│   Agent Config:                                             │
│     Prompt: commands/main.md                                │
│     Supported: claude-code, copilot                         │
└─────────────────────────────────────────────────────────────┘
```

### Unit Info (JSON output)

```
$ cg unit info write-poem --json

{
  "slug": "write-poem",
  "type": "agent",
  "version": "1.0.0",
  "description": "Write a creative poem about a given topic",
  "inputs": [
    {
      "name": "text",
      "type": "data",
      "data_type": "text",
      "required": true,
      "description": "The topic to write about"
    }
  ],
  "outputs": [
    {
      "name": "poem",
      "type": "file",
      "required": true,
      "description": "The generated poem"
    },
    {
      "name": "title",
      "type": "data",
      "data_type": "text",
      "required": true,
      "description": "Title of the poem"
    },
    {
      "name": "word_count",
      "type": "data",
      "data_type": "number",
      "required": true,
      "description": "Word count"
    }
  ],
  "agent": {
    "prompt_template": "commands/main.md",
    "supported_agents": ["claude-code", "copilot"]
  }
}
```

---

## Create Unit

```
$ cg unit create <slug> --type <type>

┌─────────────────────────────────────────────────────────────┐
│ INPUT                                                       │
│   slug: "summarize-text"                                    │
│   type: "agent"                                             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ VALIDATE                                                    │
│   • Slug is valid (lowercase, hyphens only)                 │
│   • Unit doesn't already exist                              │
│   • Type is valid (agent, code, user-input)                 │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ CREATE STRUCTURE                                            │
│                                                             │
│   .chainglass/units/summarize-text/                         │
│   ├── unit.yaml           # Unit definition (scaffold)      │
│   └── commands/                                             │
│       └── main.md         # Prompt template (for agent)     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ OUTPUT                                                      │
│   ✓ Created unit 'summarize-text' at:                       │
│     .chainglass/units/summarize-text/                       │
│                                                             │
│   Next steps:                                               │
│     1. Edit unit.yaml to define inputs and outputs          │
│     2. Edit commands/main.md to add your prompt             │
│     3. Run: cg unit validate summarize-text                 │
└─────────────────────────────────────────────────────────────┘
```

### Scaffold Files

**AgentUnit scaffold (unit.yaml)**:
```yaml
slug: summarize-text
type: agent
version: "1.0.0"
description: TODO - describe what this unit does

inputs:
  - name: text
    type: data
    data_type: text
    required: true
    description: TODO - describe this input

outputs:
  - name: result
    type: file
    required: true
    description: TODO - describe this output

agent:
  prompt_template: commands/main.md
```

**AgentUnit scaffold (commands/main.md)**:
```markdown
# Task

TODO - describe the task for the agent

## Inputs

Use `cg wg node $NODE get-input-data text` to get your input.

## Requirements

TODO - list requirements

## Output

Save your result with:
  cg wg node $NODE save-output-file result ./result.md
```

**CodeUnit scaffold (unit.yaml)**:
```yaml
slug: format-data
type: code
version: "1.0.0"
description: TODO - describe what this unit does

inputs:
  - name: input_file
    type: file
    required: true
    description: TODO - describe this input

outputs:
  - name: output_file
    type: file
    required: true
    description: TODO - describe this output

code:
  timeout: 60
```

**CodeUnit scaffold (run.sh)**:
```bash
#!/bin/bash
# Inputs passed as positional arguments
INPUT_FILE="$1"

# TODO: Process the input
# ...

# Save outputs via CLI
cg wg node "$WG_NODE" save-output-file output_file ./output.json
```

**UserInputUnit scaffold (unit.yaml)**:
```yaml
slug: ask-question
type: user-input
version: "1.0.0"
description: TODO - describe what input this collects

inputs: []

outputs:
  - name: text
    type: data
    data_type: text
    required: true
    description: User's response

user_input:
  question_type: text
  prompt: "{{config.prompt}}"
```

---

## Validate Unit

```
$ cg unit validate <slug>

┌─────────────────────────────────────────────────────────────┐
│ INPUT                                                       │
│   slug: "summarize-text"                                    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ LOAD & VALIDATE                                             │
│                                                             │
│   • Read .chainglass/units/summarize-text/unit.yaml         │
│   • Validate against WORK_UNIT_SCHEMA                       │
│   • Check referenced files exist (prompt_template, etc.)    │
│   • Validate data_type present when type="data"             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ SUCCESS                                                     │
│                                                             │
│   ✓ Unit 'summarize-text' is valid                          │
│                                                             │
│   Inputs: 1 (1 required)                                    │
│   Outputs: 2 (2 required, 0 optional)                       │
└─────────────────────────────────────────────────────────────┘
```

### Validate Unit (Errors)

```
$ cg unit validate summarize-text

┌─────────────────────────────────────────────────────────────┐
│ VALIDATION ERRORS                                           │
│                                                             │
│   E010: Missing required field 'data_type'                  │
│     Location: /outputs/1                                    │
│     Context: When type="data", data_type is required        │
│     Fix: Add data_type: "text" | "number" | "boolean" | "json"│
│                                                             │
│   E020: Referenced file not found                           │
│     Location: /agent/prompt_template                        │
│     Expected: commands/main.md                              │
│     Fix: Create the file or update the path                 │
│                                                             │
│   2 errors found                                            │
└─────────────────────────────────────────────────────────────┘
```

---

## Error Codes

| Code | Message | Cause |
|------|---------|-------|
| E001 | Unit not found | Slug doesn't exist in `.chainglass/units/` |
| E002 | Unit already exists | Cannot create - slug already taken |
| E003 | Invalid slug format | Must be lowercase, hyphens only, start with letter |
| E004 | Invalid unit type | Must be: agent, code, user-input |
| E010 | Missing required field | Schema validation - field missing |
| E011 | Invalid type | Schema validation - wrong type |
| E020 | Referenced file not found | prompt_template or script file missing |
| E021 | Invalid file reference | Path escapes unit directory |

---

## Storage Structure

```
.chainglass/units/
├── user-input-text/
│   └── unit.yaml
│
├── user-input-choice/
│   └── unit.yaml
│
├── write-poem/
│   ├── unit.yaml
│   └── commands/
│       └── main.md
│
├── summarize-text/
│   ├── unit.yaml
│   └── commands/
│       └── main.md
│
└── format-json/
    ├── unit.yaml
    └── run.sh
```

**Key points**:
- Each unit is a folder named by its slug
- `unit.yaml` is required (defines the unit)
- AgentUnits have `commands/main.md` (or configured path)
- CodeUnits have `run.*` (well-known entry point)
- UserInputUnits have no additional files

---

## Quick Reference

```bash
# List all units
cg unit list
cg unit list --json

# View unit details
cg unit info write-poem
cg unit info write-poem --json

# Create new unit
cg unit create my-unit --type agent
cg unit create my-script --type code
cg unit create my-prompt --type user-input

# Validate unit
cg unit validate my-unit
```
