# CLI Reference

Complete documentation for workflow CLI commands.

## Command Overview

| Command | Description |
|---------|-------------|
| `cg init` | Initialize a Chainglass project with starter templates |
| `cg workflow list` | List all workflow templates |
| `cg workflow info <slug>` | Show workflow details and checkpoint history |
| `cg workflow checkpoint <slug>` | Create a versioned checkpoint from current/ |
| `cg workflow restore <slug> <version>` | Restore a checkpoint to current/ |
| `cg workflow versions <slug>` | List checkpoint versions for a workflow |
| `cg workflow compose <slug>` | Create a run from a checkpoint |
| `cg runs list` | List all workflow runs |
| `cg runs get <run-id>` | Show detailed information about a run |
| `cg phase prepare <phase>` | Prepare a phase for execution |
| `cg phase validate <phase>` | Validate phase inputs or outputs |
| `cg phase finalize <phase>` | Finalize a phase and extract parameters |

All commands support `--json` for machine-readable output.

---

## cg init

Initialize a Chainglass project in the current directory.

### Syntax

```bash
cg init [options]
```

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `--json` | Output as JSON | `false` |
| `-f, --force` | Overwrite existing templates | `false` |

### What It Does

1. Creates `.chainglass/workflows/` directory
2. Creates `.chainglass/runs/` directory
3. Copies bundled starter templates to `workflows/<slug>/current/`
4. Generates `workflow.json` metadata for each template
5. Skips existing workflows (unless `--force`)

### Examples

```bash
# Initialize a new project
cg init

# Force overwrite existing templates
cg init --force

# With JSON output
cg init --json
```

### Output

**Console Output** (default):
```
✓ Project initialized

Created:
  .chainglass/workflows/
  .chainglass/runs/

Templates installed:
  ✓ hello-workflow

Next steps:
  cg workflow list              List available templates
  cg workflow checkpoint <slug> Create first checkpoint
  cg workflow compose <slug>    Create a workflow run
```

**JSON Output** (`--json`):
```json
{
  "success": true,
  "command": "init",
  "timestamp": "2026-01-25T10:00:00.000Z",
  "data": {
    "created": [
      ".chainglass/workflows",
      ".chainglass/runs"
    ],
    "installed": ["hello-workflow"],
    "skipped": []
  }
}
```

---

## cg workflow list

List all workflow templates in the project.

### Syntax

```bash
cg workflow list [options]
```

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `--json` | Output as JSON | `false` |

### Examples

```bash
# List workflows
cg workflow list

# With JSON output
cg workflow list --json
```

### Output

**Console Output** (default):
```
┌─────────────────┬──────────────────┬─────────────┐
│ Slug            │ Name             │ Checkpoints │
├─────────────────┼──────────────────┼─────────────┤
│ hello-workflow  │ Hello Workflow   │ 3           │
│ data-pipeline   │ Data Pipeline    │ 1           │
└─────────────────┴──────────────────┴─────────────┘
```

**JSON Output** (`--json`):
```json
{
  "success": true,
  "command": "workflow.list",
  "timestamp": "2026-01-25T10:00:00.000Z",
  "data": {
    "workflows": [
      {
        "slug": "hello-workflow",
        "name": "Hello Workflow",
        "checkpointCount": 3
      }
    ]
  }
}
```

### Error Codes

| Code | Description | Resolution |
|------|-------------|------------|
| E037 | Directory read failed | Check .chainglass/workflows/ permissions |

---

## cg workflow info

Show detailed information about a workflow template.

### Syntax

```bash
cg workflow info <slug> [options]
```

### Arguments

| Argument | Description |
|----------|-------------|
| `slug` | Workflow template slug |

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `--json` | Output as JSON | `false` |

### Examples

```bash
# View workflow details
cg workflow info hello-workflow

# With JSON output
cg workflow info hello-workflow --json
```

### Output

**Console Output** (default):
```
hello-workflow - Hello Workflow

A starter workflow demonstrating the multi-phase pattern.

Checkpoint History:
  v003-def67890  2026-01-25  "Added validation schema"
  v002-789xyz12  2026-01-24  "Enhanced gather phase"
  v001-abc12345  2026-01-23  "Initial release"
```

**JSON Output** (`--json`):
```json
{
  "success": true,
  "command": "workflow.info",
  "timestamp": "2026-01-25T10:00:00.000Z",
  "data": {
    "slug": "hello-workflow",
    "name": "Hello Workflow",
    "description": "A starter workflow...",
    "versions": [
      {
        "version": "v003-def67890",
        "ordinal": 3,
        "hash": "def67890",
        "created_at": "2026-01-25T10:00:00.000Z",
        "comment": "Added validation schema"
      }
    ]
  }
}
```

### Error Codes

| Code | Description | Resolution |
|------|-------------|------------|
| E030 | Workflow not found | Check slug matches a workflow in .chainglass/workflows/ |

---

## cg workflow checkpoint

Create a checkpoint from the current/ directory.

### Syntax

```bash
cg workflow checkpoint <slug> [options]
```

### Arguments

| Argument | Description |
|----------|-------------|
| `slug` | Workflow template slug |

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `--json` | Output as JSON | `false` |
| `-c, --comment <text>` | Comment describing this checkpoint | (none) |
| `-f, --force` | Create checkpoint even if content unchanged | `false` |

### What It Does

1. Validates `current/wf.yaml` exists and is valid
2. Computes content hash from template files
3. Checks for duplicate content (E035 if unchanged)
4. Creates `checkpoints/v<NNN>-<hash>/` directory
5. Copies all files from `current/` to checkpoint
6. Writes `.checkpoint.json` metadata

### Examples

```bash
# Create a checkpoint
cg workflow checkpoint hello-workflow

# With a comment
cg workflow checkpoint hello-workflow --comment "Initial release"

# Force creation even if unchanged
cg workflow checkpoint hello-workflow --force --comment "Tagged for release"
```

### Output

**Console Output** (default):
```
✓ Checkpoint created

Workflow: hello-workflow
Version: v002-def67890
Comment: Added error handling
```

**JSON Output** (`--json`):
```json
{
  "success": true,
  "command": "workflow.checkpoint",
  "timestamp": "2026-01-25T10:00:00.000Z",
  "data": {
    "slug": "hello-workflow",
    "version": "v002-def67890",
    "ordinal": 2,
    "hash": "def67890",
    "comment": "Added error handling",
    "checkpointPath": ".chainglass/workflows/hello-workflow/checkpoints/v002-def67890"
  }
}
```

### Error Codes

| Code | Description | Resolution |
|------|-------------|------------|
| E030 | Workflow not found | Check slug matches a workflow |
| E035 | Duplicate content | Make changes to current/ or use --force |
| E036 | Invalid template | Ensure current/wf.yaml exists and is valid |
| E038 | Checkpoint failed | Check file permissions and disk space |

---

## cg workflow restore

Restore a checkpoint to current/.

### Syntax

```bash
cg workflow restore <slug> <version> [options]
```

### Arguments

| Argument | Description |
|----------|-------------|
| `slug` | Workflow template slug |
| `version` | Checkpoint version (e.g., `v001` or `v001-abc12345`) |

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `--json` | Output as JSON | `false` |
| `-f, --force` | Skip confirmation prompt | `false` |

### What It Does

1. Resolves version to full checkpoint path
2. Prompts for confirmation (unless `--force`)
3. Removes existing `current/` contents
4. Copies checkpoint contents to `current/`

### Examples

```bash
# Restore (with confirmation prompt)
cg workflow restore hello-workflow v001

# Restore by full version name
cg workflow restore hello-workflow v001-abc12345

# Skip confirmation
cg workflow restore hello-workflow v001 --force
```

### Output

**Console Output** (default):
```
Restore will overwrite current/ for 'hello-workflow'. Continue? (y/N) y

✓ Restored v001-abc12345 to current/
```

**JSON Output** (`--json`):
```json
{
  "success": true,
  "command": "workflow.restore",
  "timestamp": "2026-01-25T10:00:00.000Z",
  "data": {
    "slug": "hello-workflow",
    "version": "v001-abc12345",
    "restoredTo": ".chainglass/workflows/hello-workflow/current"
  }
}
```

### Error Codes

| Code | Description | Resolution |
|------|-------------|------------|
| E030 | Workflow not found | Check slug matches a workflow |
| E033 | Version not found | Check version exists with `cg workflow versions` |
| E039 | Restore failed | Check file permissions |

---

## cg workflow versions

List all checkpoint versions for a workflow.

### Syntax

```bash
cg workflow versions <slug> [options]
```

### Arguments

| Argument | Description |
|----------|-------------|
| `slug` | Workflow template slug |

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `--json` | Output as JSON | `false` |

### Examples

```bash
# List versions (newest first)
cg workflow versions hello-workflow

# With JSON output
cg workflow versions hello-workflow --json
```

### Output

**Console Output** (default):
```
hello-workflow - Checkpoint Versions

  v003-def67890  2026-01-25  "Added validation schema"
  v002-789xyz12  2026-01-24  "Enhanced gather phase"
  v001-abc12345  2026-01-23  "Initial release"
```

**JSON Output** (`--json`):
```json
{
  "success": true,
  "command": "workflow.versions",
  "timestamp": "2026-01-25T10:00:00.000Z",
  "data": {
    "slug": "hello-workflow",
    "versions": [
      {
        "version": "v003-def67890",
        "ordinal": 3,
        "hash": "def67890",
        "created_at": "2026-01-25T10:00:00.000Z",
        "comment": "Added validation schema"
      }
    ]
  }
}
```

### Error Codes

| Code | Description | Resolution |
|------|-------------|------------|
| E030 | Workflow not found | Check slug matches a workflow |

---

## cg workflow compose

Create a new workflow run from a checkpoint.

### Syntax

```bash
cg workflow compose <slug> [options]
```

### Arguments

| Argument | Description |
|----------|-------------|
| `slug` | Workflow template slug |

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `--json` | Output as JSON | `false` |
| `--runs-dir <path>` | Directory for run folders | `.chainglass/runs` |
| `--checkpoint <version>` | Checkpoint version to use | latest |

### What It Does

1. Resolves checkpoint (latest or specified version)
2. Creates versioned run path: `runs/<slug>/<version>/run-YYYY-MM-DD-NNN/`
3. Copies template from checkpoint
4. Writes `wf-status.json` with version metadata

### Examples

```bash
# Compose from latest checkpoint
cg workflow compose hello-workflow

# Compose from specific version
cg workflow compose hello-workflow --checkpoint v001

# With custom runs directory
cg workflow compose hello-workflow --runs-dir ./my-runs
```

### Output

**Console Output** (default):
```
✓ Workflow composed successfully

Template: hello-workflow
Checkpoint: v002-def67890
Run directory: .chainglass/runs/hello-workflow/v002-def67890/run-2026-01-25-001

Phases:
  1. gather (pending)
  2. process (pending)
  3. report (pending)
```

**JSON Output** (`--json`):
```json
{
  "success": true,
  "command": "workflow.compose",
  "timestamp": "2026-01-25T10:00:00.000Z",
  "data": {
    "slug": "hello-workflow",
    "version": "v002-def67890",
    "runDir": ".chainglass/runs/hello-workflow/v002-def67890/run-2026-01-25-001",
    "phases": [
      { "name": "gather", "order": 1, "status": "pending" }
    ]
  }
}
```

### Error Codes

| Code | Description | Resolution |
|------|-------------|------------|
| E030 | Workflow not found | Check slug matches a workflow |
| E033 | Version not found | Check version exists with `cg workflow versions` |
| E034 | No checkpoint exists | Create a checkpoint first with `cg workflow checkpoint` |

---

## cg runs list

List all workflow runs, optionally filtered by workflow or status.

### Syntax

```bash
cg runs list [options]
```

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `-w, --workflow <slug>` | Filter by workflow slug | all workflows |
| `-s, --status <status>` | Filter by status (pending, active, complete, failed) | all statuses |
| `-o, --output <format>` | Output format: table (default), json | `table` |

### What It Does

1. If `--workflow` is specified, lists runs for that workflow only
2. Otherwise, enumerates all workflow directories in `.chainglass/runs/`
3. Aggregates runs from all workflows
4. Sorts by creation date (newest first)
5. Applies status filter if specified

### Examples

```bash
# List all runs across all workflows
cg runs list

# List runs for a specific workflow
cg runs list --workflow hello-workflow

# List only active runs
cg runs list --status active

# List completed runs for a workflow
cg runs list --workflow hello-workflow --status complete

# Get JSON output for automation
cg runs list --output json
```

### Output

**Console Output** (default):
```
NAME                   WORKFLOW         VERSION           STATUS    AGE
run-2026-01-25-003    hello-workflow   v002-def67890     active    5m
run-2026-01-25-002    hello-workflow   v002-def67890     complete  2h
run-2026-01-25-001    data-pipeline    v001-abc12345     complete  1d
```

**JSON Output** (`--output json`):
```json
[
  {
    "slug": "hello-workflow",
    "workflowDir": ".chainglass/runs/hello-workflow/v002-def67890/run-2026-01-25-003",
    "version": "1.0.0",
    "description": null,
    "isCurrent": false,
    "isCheckpoint": false,
    "isRun": true,
    "isTemplate": false,
    "source": "run",
    "checkpoint": {
      "ordinal": 2,
      "hash": "def67890",
      "createdAt": "2026-01-24T10:00:00.000Z",
      "comment": null
    },
    "run": {
      "runId": "run-2026-01-25-003",
      "runDir": ".chainglass/runs/hello-workflow/v002-def67890/run-2026-01-25-003",
      "status": "active",
      "createdAt": "2026-01-25T14:30:00.000Z"
    },
    "phases": []
  }
]
```

### Error Cases

- If no runs exist: Shows "No runs found" with create hint
- If workflow doesn't exist: Silently skipped in aggregation
- Invalid status value: Error with list of valid values

---

## cg runs get

Show detailed information about a specific run including phase status.

### Syntax

```bash
cg runs get <run-id> --workflow <slug> [options]
```

### Arguments

| Argument | Description |
|----------|-------------|
| `run-id` | Run identifier (e.g., `run-2026-01-25-001`) |

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `-w, --workflow <slug>` | Workflow slug (**required**) | — |
| `-o, --output <format>` | Output format: table (default), json | `table` |

### What It Does

1. Lists runs for the specified workflow
2. Finds the run matching the provided run-id
3. Loads full run details via WorkflowAdapter
4. Loads phase data via PhaseAdapter (two-adapter pattern)
5. Formats and displays combined output

### Examples

```bash
# Get run details (workflow is required)
cg runs get run-2026-01-25-001 --workflow hello-workflow

# Get JSON output for automation
cg runs get run-2026-01-25-001 --workflow hello-workflow --output json
```

### Output

**Console Output** (default):
```
Run: run-2026-01-25-001
Workflow: hello-workflow
Version: v002-def67890
Status: active
Created: 2026-01-25T10:00:00.000Z

Phases:
  NAME      STATUS    STARTED   DURATION
  gather    complete  10:05:00  5m 30s
  process   active    10:10:30  -
  report    pending   -         -
```

**JSON Output** (`--output json`):
```json
{
  "slug": "hello-workflow",
  "workflowDir": ".chainglass/runs/hello-workflow/v002-def67890/run-2026-01-25-001",
  "version": "1.0.0",
  "description": null,
  "isCurrent": false,
  "isCheckpoint": false,
  "isRun": true,
  "isTemplate": false,
  "source": "run",
  "checkpoint": {
    "ordinal": 2,
    "hash": "def67890",
    "createdAt": "2026-01-24T10:00:00.000Z",
    "comment": null
  },
  "run": {
    "runId": "run-2026-01-25-001",
    "runDir": ".chainglass/runs/hello-workflow/v002-def67890/run-2026-01-25-001",
    "status": "active",
    "createdAt": "2026-01-25T10:00:00.000Z"
  },
  "phases": [
    {
      "name": "gather",
      "phaseDir": ".../phases/gather",
      "runDir": ".../run-2026-01-25-001",
      "description": "Collect input data",
      "order": 1,
      "status": "complete",
      "facilitator": "agent",
      "state": "active",
      "startedAt": "2026-01-25T10:05:00.000Z",
      "completedAt": "2026-01-25T10:10:30.000Z",
      "duration": 330000,
      "isPending": false,
      "isReady": false,
      "isActive": false,
      "isBlocked": false,
      "isComplete": true,
      "isFailed": false,
      "isDone": true,
      "inputFiles": [],
      "inputParameters": [],
      "inputMessages": [],
      "outputs": [],
      "outputParameters": [],
      "statusHistory": [],
      "messages": []
    }
  ]
}
```

### Error Codes

| Code | Description | Resolution |
|------|-------------|------------|
| — | Run not found | Check run-id with `cg runs list --workflow <slug>` |
| — | Missing --workflow | Provide workflow slug with `-w` or `--workflow` |

---

## cg wf compose (Deprecated)

> **Note**: This command is deprecated. Use `cg workflow compose` instead.

Create a new workflow run from a template.

### Syntax

```bash
cg wf compose <template> [options]
```

### Arguments

| Argument | Description |
|----------|-------------|
| `template` | Template name, relative path, or absolute path |

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `--json` | Output as JSON | `false` |
| `--runs-dir <path>` | Directory for run folders | `.chainglass/runs` |

### Template Resolution

The `<template>` argument is resolved in this order:

1. **Absolute path**: `/path/to/templates/my-workflow`
2. **Tilde expansion**: `~/workflows/my-workflow`
3. **Relative path** (contains `/` or starts with `.`): `./templates/my-workflow`
4. **Template slug**: `my-workflow` → looks in `.chainglass/templates/my-workflow`

### Examples

```bash
# From template slug (default templates directory)
cg wf compose hello-workflow

# From relative path
cg wf compose ./custom-templates/my-workflow

# From absolute path
cg wf compose /home/user/workflows/my-workflow

# With tilde expansion
cg wf compose ~/workflows/my-workflow

# With custom runs directory
cg wf compose hello-workflow --runs-dir ./my-runs

# With JSON output
cg wf compose hello-workflow --json
```

### Output

**Console Output** (default):
```
✓ Workflow composed successfully

Template: hello-workflow
Run directory: .chainglass/runs/run-2026-01-23-001

Phases:
  1. gather (pending)
  2. process (pending)
  3. report (pending)
```

**JSON Output** (`--json`):
```json
{
  "success": true,
  "command": "wf.compose",
  "timestamp": "2026-01-23T14:00:00.000Z",
  "data": {
    "template": "hello-workflow",
    "runDir": ".chainglass/runs/run-2026-01-23-001",
    "phases": [
      { "name": "gather", "order": 1, "status": "pending" },
      { "name": "process", "order": 2, "status": "pending" },
      { "name": "report", "order": 3, "status": "pending" }
    ]
  }
}
```

### Error Codes

| Code | Description | Resolution |
|------|-------------|------------|
| E020 | Template not found | Check template path or slug |
| E020 | Invalid wf.yaml | Fix YAML syntax errors |

---

## cg phase prepare

Prepare a phase for execution by resolving inputs and copying files from prior phases.

### Syntax

```bash
cg phase prepare <phase> --run-dir <path> [options]
```

### Arguments

| Argument | Description |
|----------|-------------|
| `phase` | Phase name to prepare |

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `--run-dir <path>` | Run directory path | **Required** |
| `--json` | Output as JSON | `false` |

### What It Does

1. Checks if the phase exists in the workflow
2. Verifies prior phases are finalized (if `from_phase` inputs exist)
3. Copies files from prior phases to `run/inputs/`
4. Resolves parameters and writes to `run/inputs/params.json`
5. Updates phase status to `ready`

### Examples

```bash
# Prepare the gather phase
cg phase prepare gather --run-dir .chainglass/runs/run-2026-01-23-001

# With JSON output
cg phase prepare gather --run-dir .chainglass/runs/run-2026-01-23-001 --json
```

### Output

**Console Output** (default):
```
✓ Phase prepared successfully

Phase: gather
Status: ready
Run directory: .chainglass/runs/run-2026-01-23-001

Inputs resolved:
  - acknowledgment.md (from gather)
  - gather-data.json (from gather)
```

**JSON Output** (`--json`):
```json
{
  "success": true,
  "command": "phase.prepare",
  "timestamp": "2026-01-23T14:00:00.000Z",
  "data": {
    "phase": "gather",
    "runDir": ".chainglass/runs/run-2026-01-23-001",
    "status": "ready",
    "inputs": {
      "required": ["acknowledgment.md", "gather-data.json"],
      "resolved": [
        { "name": "acknowledgment.md", "path": "...", "exists": true },
        { "name": "gather-data.json", "path": "...", "exists": true }
      ]
    },
    "copiedFromPrior": [
      { "name": "acknowledgment.md", "from": "gather", "to": "..." }
    ]
  }
}
```

### Error Codes

| Code | Description | Resolution |
|------|-------------|------------|
| E001 | Missing required input | Create or provide the missing input file |
| E020 | Phase not found | Check phase name matches wf.yaml |
| E031 | Prior phase not finalized | Run `cg phase finalize` on prior phase first |

---

## cg phase validate

Validate phase inputs or outputs against declared schemas.

### Syntax

```bash
cg phase validate <phase> --run-dir <path> --check <mode> [options]
```

### Arguments

| Argument | Description |
|----------|-------------|
| `phase` | Phase name to validate |

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `--run-dir <path>` | Run directory path | **Required** |
| `--check <mode>` | What to validate: `inputs` or `outputs` | **Required** |
| `--json` | Output as JSON | `false` |

### What It Does

**When `--check inputs`**:
- Verifies all required input files exist
- Validates JSON inputs against schemas (if declared)

**When `--check outputs`**:
- Verifies all required output files exist
- Checks output files are non-empty
- Validates JSON outputs against schemas (if declared)

### Examples

```bash
# Validate inputs before work
cg phase validate gather --run-dir .chainglass/runs/run-2026-01-23-001 --check inputs

# Validate outputs after work (common loop)
cg phase validate gather --run-dir .chainglass/runs/run-2026-01-23-001 --check outputs

# With JSON output
cg phase validate gather --run-dir .chainglass/runs/run-2026-01-23-001 --check outputs --json
```

### Agent Validation Loop

Agents typically run validate in a loop until outputs are correct:

```bash
# Do work, create outputs...

# Validate
cg phase validate gather --run-dir $RUN_DIR --check outputs --json

# If errors, fix issues and re-validate
# If success, proceed to finalize
```

### Output

**Console Output** (success):
```
✓ Validation passed

Phase: gather
Check: outputs

Files validated:
  ✓ acknowledgment.md
  ✓ gather-data.json (schema: schemas/gather-data.schema.json)
```

**Console Output** (failure):
```
✗ Validation failed

Phase: gather
Check: outputs

Errors:
  E010: Missing required output: gather-data.json
        Action: Create the output file in run/outputs/

  E012: Schema validation failed: acknowledgment.json
        Path: /items/0
        Expected: object
        Actual: string
        Action: Fix the value at /items/0 to match schema
```

**JSON Output** (`--json`):
```json
{
  "success": false,
  "command": "phase.validate",
  "timestamp": "2026-01-23T14:00:00.000Z",
  "error": {
    "code": "E010",
    "message": "Missing required output: gather-data.json",
    "action": "Create the output file in run/outputs/",
    "details": [
      { "code": "E010", "message": "Missing required output: gather-data.json" }
    ]
  }
}
```

### Error Codes

| Code | Description | Resolution |
|------|-------------|------------|
| E010 | Missing required output | Create the output file |
| E011 | Empty output file | Add content to the output |
| E012 | Schema validation failed | Fix JSON to match schema |
| E020 | Phase not found | Check phase name |

---

## cg phase finalize

Finalize a phase by extracting output parameters and marking it complete.

### Syntax

```bash
cg phase finalize <phase> --run-dir <path> [options]
```

### Arguments

| Argument | Description |
|----------|-------------|
| `phase` | Phase name to finalize |

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `--run-dir <path>` | Run directory path | **Required** |
| `--json` | Output as JSON | `false` |

### What It Does

1. Extracts values from outputs using `output_parameters` declarations
2. Writes extracted values to `run/wf-data/output-params.json`
3. Updates phase status to `complete`
4. Updates `wf-run/wf-status.json`

### Examples

```bash
# Finalize the gather phase
cg phase finalize gather --run-dir .chainglass/runs/run-2026-01-23-001

# With JSON output
cg phase finalize gather --run-dir .chainglass/runs/run-2026-01-23-001 --json
```

### Output

**Console Output** (default):
```
✓ Phase finalized successfully

Phase: gather
Status: complete

Parameters extracted:
  item_count: 3
  request_type: "processing"
```

**JSON Output** (`--json`):
```json
{
  "success": true,
  "command": "phase.finalize",
  "timestamp": "2026-01-23T14:00:00.000Z",
  "data": {
    "phase": "gather",
    "runDir": ".chainglass/runs/run-2026-01-23-001",
    "extractedParams": {
      "item_count": 3,
      "request_type": "processing"
    },
    "phaseStatus": "complete"
  }
}
```

### Error Codes

| Code | Description | Resolution |
|------|-------------|------------|
| E010 | Missing source file | Create the output file before finalize |
| E012 | Invalid JSON in source | Fix JSON syntax in output file |
| E020 | Phase not found | Check phase name |

---

## Complete Workflow Example

Here's a complete workflow execution from start to finish:

```bash
# Set working variables
TEMPLATE="hello-workflow"
RUN_DIR=""

# Step 1: Compose workflow
echo "=== Composing workflow ==="
RESULT=$(cg wf compose $TEMPLATE --json)
RUN_DIR=$(echo $RESULT | jq -r '.data.runDir')
echo "Run directory: $RUN_DIR"

# Step 2: Execute each phase
for PHASE in gather process report; do
  echo "=== Phase: $PHASE ==="

  # Prepare
  cg phase prepare $PHASE --run-dir $RUN_DIR --json

  # Do work (agent creates outputs)...
  echo "Creating outputs for $PHASE..."
  # ... your work here ...

  # Validate loop
  while true; do
    VALID=$(cg phase validate $PHASE --run-dir $RUN_DIR --check outputs --json)
    SUCCESS=$(echo $VALID | jq -r '.success')
    if [ "$SUCCESS" = "true" ]; then
      echo "Validation passed"
      break
    fi
    echo "Validation failed, fixing..."
    # ... fix issues ...
  done

  # Finalize
  cg phase finalize $PHASE --run-dir $RUN_DIR --json
done

echo "=== Workflow complete ==="
```

---

## Exit Codes

All commands exit with:
- `0` - Success (no errors)
- `1` - Failure (errors present)

Use `--json` output and check the `success` field for programmatic handling.

---

## Next Steps

- [MCP Reference](./4-mcp-reference.md) - MCP tool documentation
- [Template Authoring](./2-template-authoring.md) - Create custom templates
- [Overview](./1-overview.md) - System concepts
