# Manual Test Guide - Workflow Exemplar

This guide provides step-by-step instructions to validate the workflow exemplar.

## Prerequisites

- Node.js installed (for ajv-cli)
- ajv-cli installed globally: `npm install -g ajv-cli`
- YAML parser available (optional, for syntax checking)

## Test 1: Verify Directory Structure

```bash
# Navigate to exemplar directory
cd dev/examples/wf

# Verify template structure exists
ls -la template/hello-workflow/

# Expected output:
# - wf.yaml
# - schemas/
# - templates/
# - phases/

# Verify run example structure exists
ls -la runs/exemplar-run-example-001/

# Expected output:
# - wf.yaml
# - wf-run/
# - phases/
```

**Expected Result**: All directories and top-level files exist.

## Test 2: YAML Syntax Validation

```bash
# Validate wf.yaml parses correctly
cat template/hello-workflow/wf.yaml | npx yaml

# Validate each wf-phase.yaml
cat runs/exemplar-run-example-001/phases/gather/wf-phase.yaml | npx yaml
cat runs/exemplar-run-example-001/phases/process/wf-phase.yaml | npx yaml
cat runs/exemplar-run-example-001/phases/report/wf-phase.yaml | npx yaml
```

**Expected Result**: All YAML files parse without errors, output shows formatted YAML.

## Test 3: JSON Schema Compilation

```bash
# Verify all schemas are valid JSON Schema Draft 2020-12
ajv compile --spec=draft2020 -s template/hello-workflow/schemas/wf.schema.json
ajv compile --spec=draft2020 --strict=false -s template/hello-workflow/schemas/wf-phase.schema.json
ajv compile --spec=draft2020 --strict=false -s template/hello-workflow/schemas/gather-data.schema.json
ajv compile --spec=draft2020 --strict=false -s template/hello-workflow/schemas/process-data.schema.json
ajv compile --spec=draft2020 --strict=false -s template/hello-workflow/schemas/message.schema.json
```

**Expected Result**: All schemas report "is valid". Note: date-time format warnings are expected (AJV doesn't validate formats by default).

## Test 4: Gather Phase Data Validation

```bash
# Validate gather-data.json against schema
ajv validate --spec=draft2020 --strict=false \
  -s template/hello-workflow/schemas/gather-data.schema.json \
  -d runs/exemplar-run-example-001/phases/gather/run/outputs/gather-data.json
```

**Expected Result**: Output shows validation passed.

## Test 5: Process Phase Data Validation

```bash
# Validate process-data.json against schema
ajv validate --spec=draft2020 --strict=false \
  -s template/hello-workflow/schemas/process-data.schema.json \
  -d runs/exemplar-run-example-001/phases/process/run/outputs/process-data.json
```

**Expected Result**: Output shows validation passed.

## Test 6: Phase State Validation (wf-phase.json)

```bash
# Validate all wf-phase.json files against schema
ajv validate --spec=draft2020 --strict=false \
  -s template/hello-workflow/schemas/wf-phase.schema.json \
  -d runs/exemplar-run-example-001/phases/gather/run/wf-data/wf-phase.json

ajv validate --spec=draft2020 --strict=false \
  -s template/hello-workflow/schemas/wf-phase.schema.json \
  -d runs/exemplar-run-example-001/phases/process/run/wf-data/wf-phase.json

ajv validate --spec=draft2020 --strict=false \
  -s template/hello-workflow/schemas/wf-phase.schema.json \
  -d runs/exemplar-run-example-001/phases/report/run/wf-data/wf-phase.json
```

**Expected Result**: All three validations pass.

## Test 7: Verify Phase Content

### Gather Phase

```bash
# Check gather outputs exist
ls runs/exemplar-run-example-001/phases/gather/run/outputs/
# Expected: acknowledgment.md, gather-data.json

# Check gather wf-data exists
ls runs/exemplar-run-example-001/phases/gather/run/wf-data/
# Expected: wf-phase.json, output-params.json

# Verify output-params.json content
cat runs/exemplar-run-example-001/phases/gather/run/wf-data/output-params.json
# Expected: {"item_count": 3, "request_type": "processing"}
```

### Process Phase

```bash
# Check process inputs include from_phase files
ls runs/exemplar-run-example-001/phases/process/run/inputs/files/
# Expected: acknowledgment.md

ls runs/exemplar-run-example-001/phases/process/run/inputs/data/
# Expected: gather-data.json

# Check process outputs
ls runs/exemplar-run-example-001/phases/process/run/outputs/
# Expected: result.md, process-data.json

# Verify output-params.json content
cat runs/exemplar-run-example-001/phases/process/run/wf-data/output-params.json
# Expected: {"processed_count": 3, "status": "success"}
```

### Report Phase

```bash
# Check report inputs include from_phase files
ls runs/exemplar-run-example-001/phases/report/run/inputs/files/
# Expected: result.md

ls runs/exemplar-run-example-001/phases/report/run/inputs/data/
# Expected: process-data.json

# Check report outputs
ls runs/exemplar-run-example-001/phases/report/run/outputs/
# Expected: final-report.md

# Note: Report phase has no output-params.json (terminal phase)
```

## Test 8: Verify wf-status.json

```bash
# Check workflow status
cat runs/exemplar-run-example-001/wf-run/wf-status.json | jq '.'

# Verify all phases are complete
cat runs/exemplar-run-example-001/wf-run/wf-status.json | jq '.phases | to_entries[] | .value.status'
# Expected: "complete" for all 3 phases
```

## Test 9: Message Communication Validation

The message system enables structured communication between agents and orchestrators.

### Message Schema Validation

```bash
# Validate message schema compiles
ajv compile --spec=draft2020 --strict=false -s template/hello-workflow/schemas/message.schema.json
```

### Gather Phase User Input Message

```bash
# Verify gather messages directory exists
ls runs/exemplar-run-example-001/phases/gather/run/messages/
# Expected: m-001.json

# Validate gather message against schema
ajv validate --spec=draft2020 --strict=false \
  -s template/hello-workflow/schemas/message.schema.json \
  -d runs/exemplar-run-example-001/phases/gather/run/messages/m-001.json

# Verify message content
cat runs/exemplar-run-example-001/phases/gather/run/messages/m-001.json | jq '.type, .from'
# Expected: "free_text", "orchestrator"
```

### Process Phase Question/Answer Message

```bash
# Verify process messages directory exists
ls runs/exemplar-run-example-001/phases/process/run/messages/
# Expected: m-001.json

# Validate process message against schema
ajv validate --spec=draft2020 --strict=false \
  -s template/hello-workflow/schemas/message.schema.json \
  -d runs/exemplar-run-example-001/phases/process/run/messages/m-001.json

# Verify message content
cat runs/exemplar-run-example-001/phases/process/run/messages/m-001.json | jq '.type, .from, .answer.selected'
# Expected: "multi_choice", "agent", ["C"]
```

### Status Log Message References

```bash
# Verify gather wf-phase.json has input action with message_id
cat runs/exemplar-run-example-001/phases/gather/run/wf-data/wf-phase.json | jq '.status[] | select(.action == "input")'
# Expected: entry with message_id: "001"

# Verify process wf-phase.json has question/answer actions with message_id
cat runs/exemplar-run-example-001/phases/process/run/wf-data/wf-phase.json | jq '.status[] | select(.action == "question" or .action == "answer")'
# Expected: two entries, both with message_id: "001"
```

**Expected Result**: All message files validate and contain proper structure for their message types.

### Message Types Reference

| Type | Use Case | Answer Fields |
|------|----------|---------------|
| `single_choice` | Pick exactly one option | `selected: ["A"]` (exactly 1) |
| `multi_choice` | Pick one or more options | `selected: ["A", "C"]` (1+) |
| `free_text` | Open text response | `text: "response"` |
| `confirm` | Yes/No confirmation | `confirmed: true/false` |

---

## CLI-Based Testing

These tests use the actual `cg` CLI commands to verify the workflow system works end-to-end.

### Prerequisites

```bash
# Build the CLI first
just build

# Verify CLI is available
pnpm -F @chainglass/cli exec cg --help
```

### Test 10: Compose Workflow from Template

```bash
# Navigate to project root
cd /home/jak/substrate/003-wf-basics

# Compose a new workflow run
pnpm -F @chainglass/cli exec cg wf compose \
  ./dev/examples/wf/template/hello-workflow \
  --runs-dir ./dev/examples/wf/cli-test-runs \
  --json

# Expected output:
# {
#   "success": true,
#   "command": "wf.compose",
#   "data": {
#     "template": "hello-workflow",
#     "runDir": "./dev/examples/wf/cli-test-runs/run-YYYY-MM-DD-001",
#     "phases": [
#       { "name": "gather", "order": 1, "status": "pending" },
#       { "name": "process", "order": 2, "status": "pending" },
#       { "name": "report", "order": 3, "status": "pending" }
#     ]
#   }
# }

# Capture run directory for next tests
RUN_DIR=$(pnpm -F @chainglass/cli exec cg wf compose \
  ./dev/examples/wf/template/hello-workflow \
  --runs-dir ./dev/examples/wf/cli-test-runs \
  --json 2>/dev/null | jq -r '.data.runDir')
echo "Run directory: $RUN_DIR"
```

**Expected Result**: JSON output shows success with 3 phases in pending status.

### Test 11: Prepare Phase

```bash
# Prepare the gather phase
pnpm -F @chainglass/cli exec cg phase prepare gather \
  --run-dir "$RUN_DIR" \
  --json

# Expected output:
# {
#   "success": true,
#   "command": "phase.prepare",
#   "data": {
#     "phase": "gather",
#     "status": "ready",
#     ...
#   }
# }
```

**Expected Result**: Phase prepare succeeds, status changes to "ready".

### Test 12: Validate Phase Inputs

```bash
# Validate gather phase inputs
pnpm -F @chainglass/cli exec cg phase validate gather \
  --run-dir "$RUN_DIR" \
  --check inputs \
  --json

# Expected: May succeed or fail depending on input requirements
```

**Expected Result**: Validation runs without crash. May report missing inputs if gather has file inputs.

### Test 13: Validate Phase Outputs (Expect Failure)

```bash
# Before creating outputs, validation should fail
pnpm -F @chainglass/cli exec cg phase validate gather \
  --run-dir "$RUN_DIR" \
  --check outputs \
  --json

# Expected output:
# {
#   "success": false,
#   "command": "phase.validate",
#   "error": {
#     "code": "E010",
#     "message": "Missing required output: acknowledgment.md",
#     ...
#   }
# }
```

**Expected Result**: Validation fails with E010 - missing outputs.

### Test 14: Create Outputs and Validate

```bash
# Create required output files
mkdir -p "$RUN_DIR/phases/gather/run/outputs"
echo "# Acknowledgment" > "$RUN_DIR/phases/gather/run/outputs/acknowledgment.md"
echo '{"items": [{"id": 1}, {"id": 2}, {"id": 3}], "classification": {"type": "processing"}}' \
  > "$RUN_DIR/phases/gather/run/outputs/gather-data.json"

# Now validation should pass
pnpm -F @chainglass/cli exec cg phase validate gather \
  --run-dir "$RUN_DIR" \
  --check outputs \
  --json

# Expected output:
# {
#   "success": true,
#   "command": "phase.validate",
#   ...
# }
```

**Expected Result**: Validation passes after outputs are created.

### Test 15: Finalize Phase

```bash
# Finalize the gather phase
pnpm -F @chainglass/cli exec cg phase finalize gather \
  --run-dir "$RUN_DIR" \
  --json

# Expected output:
# {
#   "success": true,
#   "command": "phase.finalize",
#   "data": {
#     "phase": "gather",
#     "extractedParams": {
#       "item_count": 3,
#       "request_type": "processing"
#     },
#     "phaseStatus": "complete"
#   }
# }

# Verify output-params.json was created
cat "$RUN_DIR/phases/gather/run/wf-data/output-params.json"
```

**Expected Result**: Finalize succeeds, parameters extracted, status is "complete".

### Test 16: Prepare Next Phase

```bash
# Prepare process phase (should copy from gather)
pnpm -F @chainglass/cli exec cg phase prepare process \
  --run-dir "$RUN_DIR" \
  --json

# Verify files were copied
ls "$RUN_DIR/phases/process/run/inputs/files/"
# Expected: acknowledgment.md

ls "$RUN_DIR/phases/process/run/inputs/data/"
# Expected: gather-data.json
```

**Expected Result**: Process phase prepared, files copied from gather phase.

### Cleanup

```bash
# Remove test runs when done
rm -rf ./dev/examples/wf/cli-test-runs
```

---

## Test Summary

| Test | Description | Pass Criteria |
|------|-------------|---------------|
| 1 | Directory Structure | All directories exist |
| 2 | YAML Syntax | All YAML parses without errors |
| 3 | Schema Compilation | All schemas are valid Draft 2020-12 (incl. message.schema.json) |
| 4 | Gather Data | gather-data.json validates |
| 5 | Process Data | process-data.json validates |
| 6 | Phase State | All wf-phase.json files validate |
| 7 | Phase Content | All expected files exist with correct content |
| 8 | Workflow Status | All phases marked complete |
| 9 | Message Communication | All message files validate; status logs reference message_ids |
| 10 | CLI: Compose | `cg wf compose` creates run folder |
| 11 | CLI: Prepare | `cg phase prepare` sets status to ready |
| 12 | CLI: Validate Inputs | `cg phase validate --check inputs` runs |
| 13 | CLI: Validate Missing | `cg phase validate --check outputs` fails before outputs |
| 14 | CLI: Validate Outputs | `cg phase validate --check outputs` passes after outputs |
| 15 | CLI: Finalize | `cg phase finalize` extracts params |
| 16 | CLI: Cross-Phase | `cg phase prepare` copies from prior phase |

## Troubleshooting

### ajv-cli not found

```bash
npm install -g ajv-cli
```

### date-time format warnings

These are informational only. AJV doesn't validate date-time formats by default, but the schemas are still valid.

### YAML parse errors

Ensure the YAML files don't contain tabs (use spaces for indentation).

---

*Last updated: 2026-01-23*
