# MCP Reference

Complete documentation for workflow MCP tools.

## Tool Overview

| Tool | Description |
|------|-------------|
| `wf_compose` | Create a workflow run from a template |
| `phase_prepare` | Prepare a phase for execution |
| `phase_validate` | Validate phase inputs or outputs |
| `phase_finalize` | Finalize a phase and extract parameters |

All tools return JSON responses in the CommandResponse envelope format.

---

## Response Envelope

All MCP tools return responses in a consistent JSON envelope format:

### Success Response

```json
{
  "success": true,
  "command": "wf.compose",
  "timestamp": "2026-01-23T14:00:00.000Z",
  "data": {
    // Tool-specific response data
  }
}
```

### Error Response

```json
{
  "success": false,
  "command": "wf.compose",
  "timestamp": "2026-01-23T14:00:00.000Z",
  "error": {
    "code": "E020",
    "message": "Template not found: missing-template",
    "action": "Check template name or path",
    "details": [
      { "code": "E020", "message": "..." }
    ]
  }
}
```

---

## Tool Annotations

Each tool has annotations that describe its behavior for safety and optimization:

| Tool | readOnlyHint | destructiveHint | idempotentHint | openWorldHint |
|------|--------------|-----------------|----------------|---------------|
| `wf_compose` | `false` | `false` | `false` | `false` |
| `phase_prepare` | `false` | `false` | `true` | `false` |
| `phase_validate` | `true` | `false` | `true` | `false` |
| `phase_finalize` | `false` | `false` | `true` | `false` |

**Annotation Meanings**:

- **readOnlyHint**: `true` if the tool only reads data without modifying filesystem
- **destructiveHint**: `true` if the tool might delete or overwrite data irrecoverably
- **idempotentHint**: `true` if calling the tool multiple times has same effect as once
- **openWorldHint**: `true` if the tool accesses external services beyond local filesystem

---

## wf_compose

Create a new workflow run from a template.

### Input Schema

```json
{
  "template_slug": {
    "type": "string",
    "description": "Template slug (name) or path to template directory. Examples: 'hello-workflow', './templates/my-template'"
  },
  "runs_dir": {
    "type": "string",
    "default": ".chainglass/runs",
    "description": "Directory where run folders are created. Defaults to '.chainglass/runs'"
  }
}
```

### Annotations

| Annotation | Value | Reason |
|------------|-------|--------|
| readOnlyHint | `false` | Creates files and folders |
| destructiveHint | `false` | Never deletes existing data |
| idempotentHint | `false` | Each call creates a NEW run folder |
| openWorldHint | `false` | Local filesystem only |

### Example Request

```json
{
  "template_slug": "hello-workflow",
  "runs_dir": ".chainglass/runs"
}
```

### Example Response (Success)

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

### Example Response (Error)

```json
{
  "success": false,
  "command": "wf.compose",
  "timestamp": "2026-01-23T14:00:00.000Z",
  "error": {
    "code": "E020",
    "message": "Template not found: missing-workflow",
    "action": "Check template name or look in .chainglass/templates/"
  }
}
```

---

## phase_prepare

Prepare a workflow phase for execution by resolving inputs and copying files from prior phases.

### Input Schema

```json
{
  "phase": {
    "type": "string",
    "description": "Name of the phase to prepare. Example: 'gather'"
  },
  "run_dir": {
    "type": "string",
    "description": "Path to the run directory created by wf_compose"
  }
}
```

### Annotations

| Annotation | Value | Reason |
|------------|-------|--------|
| readOnlyHint | `false` | Copies files, updates status |
| destructiveHint | `false` | Never deletes existing data |
| idempotentHint | `true` | Safe to call multiple times |
| openWorldHint | `false` | Local filesystem only |

### Example Request

```json
{
  "phase": "gather",
  "run_dir": ".chainglass/runs/run-2026-01-23-001"
}
```

### Example Response (Success)

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
    "copiedFromPrior": []
  }
}
```

### Error Codes

| Code | Description |
|------|-------------|
| E001 | Missing required input file |
| E020 | Phase not found |
| E031 | Prior phase not finalized |

---

## phase_validate

Validate phase inputs or outputs against their declared schemas.

### Input Schema

```json
{
  "phase": {
    "type": "string",
    "description": "Name of the phase to validate. Example: 'gather'"
  },
  "run_dir": {
    "type": "string",
    "description": "Path to the run directory"
  },
  "check": {
    "type": "string",
    "enum": ["inputs", "outputs"],
    "default": "outputs",
    "description": "What to validate: 'inputs' or 'outputs'. Defaults to 'outputs'"
  }
}
```

### Annotations

| Annotation | Value | Reason |
|------------|-------|--------|
| readOnlyHint | `true` | Pure read operation |
| destructiveHint | `false` | Never modifies anything |
| idempotentHint | `true` | Same inputs = same outputs |
| openWorldHint | `false` | Local filesystem only |

### Example Request

```json
{
  "phase": "gather",
  "run_dir": ".chainglass/runs/run-2026-01-23-001",
  "check": "outputs"
}
```

### Example Response (Success)

```json
{
  "success": true,
  "command": "phase.validate",
  "timestamp": "2026-01-23T14:00:00.000Z",
  "data": {
    "phase": "gather",
    "runDir": ".chainglass/runs/run-2026-01-23-001",
    "check": "outputs",
    "files": {
      "required": ["acknowledgment.md", "gather-data.json"],
      "validated": [
        { "name": "acknowledgment.md", "path": "...", "valid": true },
        { "name": "gather-data.json", "path": "...", "valid": true, "schema": "..." }
      ]
    }
  }
}
```

### Example Response (Validation Failure)

```json
{
  "success": false,
  "command": "phase.validate",
  "timestamp": "2026-01-23T14:00:00.000Z",
  "error": {
    "code": "E012",
    "message": "Schema validation failed",
    "action": "Fix JSON to match schema",
    "details": [
      {
        "code": "E012",
        "message": "Expected /items/0 to be object, got string",
        "path": "/items/0",
        "expected": "object",
        "actual": "string"
      }
    ]
  }
}
```

### Error Codes

| Code | Description |
|------|-------------|
| E010 | Missing required output |
| E011 | Empty output file |
| E012 | Schema validation failed |
| E020 | Phase not found |

---

## phase_finalize

Finalize a workflow phase by extracting output parameters and marking it complete.

### Input Schema

```json
{
  "phase": {
    "type": "string",
    "description": "Name of the phase to finalize. Example: 'gather'"
  },
  "run_dir": {
    "type": "string",
    "description": "Path to the run directory"
  }
}
```

### Annotations

| Annotation | Value | Reason |
|------------|-------|--------|
| readOnlyHint | `false` | Writes output-params.json |
| destructiveHint | `false` | Never deletes existing data |
| idempotentHint | `true` | Re-extracts safely |
| openWorldHint | `false` | Local filesystem only |

### Example Request

```json
{
  "phase": "gather",
  "run_dir": ".chainglass/runs/run-2026-01-23-001"
}
```

### Example Response (Success)

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

| Code | Description |
|------|-------------|
| E010 | Missing source file for parameter extraction |
| E012 | Invalid JSON in source file |
| E020 | Phase not found |

---

## Complete Workflow Example

Here's how an agent might use the MCP tools to execute a complete workflow:

```
1. wf_compose { "template_slug": "hello-workflow" }
   → Captures run_dir from response

2. phase_prepare { "phase": "gather", "run_dir": "..." }
   → Phase is now ready

3. (Agent creates outputs...)

4. phase_validate { "phase": "gather", "run_dir": "...", "check": "outputs" }
   → Check success field, fix errors if needed

5. phase_finalize { "phase": "gather", "run_dir": "..." }
   → Parameters extracted, phase complete

6. phase_prepare { "phase": "process", "run_dir": "..." }
   → Next phase ready (inputs copied from gather)

7. (Repeat steps 3-6 for remaining phases)
```

---

## Integration with MCP Clients

### Starting the MCP Server

```bash
# Start MCP server in STDIO mode
cg mcp --stdio
```

### Server Capabilities

The MCP server exposes:
- **Tools**: `check_health`, `wf_compose`, `phase_prepare`, `phase_validate`, `phase_finalize`
- **Resources**: None (workflow state is in filesystem)
- **Prompts**: None

### Error Handling

Always check the `success` field in responses:

```typescript
const response = await client.callTool('wf_compose', { template_slug: 'hello-workflow' });
const result = JSON.parse(response.content[0].text);

if (!result.success) {
  console.error(`Error ${result.error.code}: ${result.error.message}`);
  console.error(`Action: ${result.error.action}`);
  return;
}

const runDir = result.data.runDir;
```

---

## Next Steps

- [CLI Reference](./3-cli-reference.md) - CLI command documentation
- [Template Authoring](./2-template-authoring.md) - Create custom templates
- [Overview](./1-overview.md) - System concepts
