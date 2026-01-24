# CLI Reference

Complete documentation for workflow CLI commands.

## Command Overview

| Command | Description |
|---------|-------------|
| `cg wf compose <template>` | Create a workflow run from a template |
| `cg phase prepare <phase>` | Prepare a phase for execution |
| `cg phase validate <phase>` | Validate phase inputs or outputs |
| `cg phase finalize <phase>` | Finalize a phase and extract parameters |

All commands support `--json` for machine-readable output.

---

## cg wf compose

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
