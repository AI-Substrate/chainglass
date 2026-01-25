# Gather Phase - Hello Workflow

Welcome to the **gather** phase of the Hello Workflow.

## Objective

Process the user's initial request and provide a helpful response.

## Directory Structure

```
run/
├── messages/           # User ↔ Agent communication
│   └── m-001.json      # User's request (free_text)
├── outputs/            # Your output files
│   └── response.md     # Your response
└── wf-data/            # Workflow metadata (managed by CLI)
    └── wf-phase.json   # Phase state tracking
```

## Input

Read the user's request from `messages/m-001.json`.

## Required Output

**`outputs/response.md`** - Your response to the user's request

Write a helpful response based on what the user asked for.

## Workflow

1. Read `messages/m-001.json` to understand the request
2. Write your response to `outputs/response.md`
3. Run `cg phase validate gather --run-dir .` to verify outputs
4. Run `cg phase finalize gather --run-dir .` when complete

## Getting Help

- `cg phase --help` - Phase management commands
- `cg wf --help` - Workflow commands
- `cg workflow --help` - Template management
