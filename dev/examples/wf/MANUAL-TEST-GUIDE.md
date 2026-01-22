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
ls -la runs/run-example-001/

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
cat runs/run-example-001/phases/gather/wf-phase.yaml | npx yaml
cat runs/run-example-001/phases/process/wf-phase.yaml | npx yaml
cat runs/run-example-001/phases/report/wf-phase.yaml | npx yaml
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
  -d runs/run-example-001/phases/gather/run/outputs/gather-data.json
```

**Expected Result**: Output shows validation passed.

## Test 5: Process Phase Data Validation

```bash
# Validate process-data.json against schema
ajv validate --spec=draft2020 --strict=false \
  -s template/hello-workflow/schemas/process-data.schema.json \
  -d runs/run-example-001/phases/process/run/outputs/process-data.json
```

**Expected Result**: Output shows validation passed.

## Test 6: Phase State Validation (wf-phase.json)

```bash
# Validate all wf-phase.json files against schema
ajv validate --spec=draft2020 --strict=false \
  -s template/hello-workflow/schemas/wf-phase.schema.json \
  -d runs/run-example-001/phases/gather/run/wf-data/wf-phase.json

ajv validate --spec=draft2020 --strict=false \
  -s template/hello-workflow/schemas/wf-phase.schema.json \
  -d runs/run-example-001/phases/process/run/wf-data/wf-phase.json

ajv validate --spec=draft2020 --strict=false \
  -s template/hello-workflow/schemas/wf-phase.schema.json \
  -d runs/run-example-001/phases/report/run/wf-data/wf-phase.json
```

**Expected Result**: All three validations pass.

## Test 7: Verify Phase Content

### Gather Phase

```bash
# Check gather outputs exist
ls runs/run-example-001/phases/gather/run/outputs/
# Expected: acknowledgment.md, gather-data.json

# Check gather wf-data exists
ls runs/run-example-001/phases/gather/run/wf-data/
# Expected: wf-phase.json, output-params.json

# Verify output-params.json content
cat runs/run-example-001/phases/gather/run/wf-data/output-params.json
# Expected: {"item_count": 3, "request_type": "processing"}
```

### Process Phase

```bash
# Check process inputs include from_phase files
ls runs/run-example-001/phases/process/run/inputs/files/
# Expected: acknowledgment.md

ls runs/run-example-001/phases/process/run/inputs/data/
# Expected: gather-data.json

# Check process outputs
ls runs/run-example-001/phases/process/run/outputs/
# Expected: result.md, process-data.json

# Verify output-params.json content
cat runs/run-example-001/phases/process/run/wf-data/output-params.json
# Expected: {"processed_count": 3, "status": "success"}
```

### Report Phase

```bash
# Check report inputs include from_phase files
ls runs/run-example-001/phases/report/run/inputs/files/
# Expected: result.md

ls runs/run-example-001/phases/report/run/inputs/data/
# Expected: process-data.json

# Check report outputs
ls runs/run-example-001/phases/report/run/outputs/
# Expected: final-report.md

# Note: Report phase has no output-params.json (terminal phase)
```

## Test 8: Verify wf-status.json

```bash
# Check workflow status
cat runs/run-example-001/wf-run/wf-status.json | jq '.'

# Verify all phases are complete
cat runs/run-example-001/wf-run/wf-status.json | jq '.phases | to_entries[] | .value.status'
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
ls runs/run-example-001/phases/gather/run/messages/
# Expected: m-001.json

# Validate gather message against schema
ajv validate --spec=draft2020 --strict=false \
  -s template/hello-workflow/schemas/message.schema.json \
  -d runs/run-example-001/phases/gather/run/messages/m-001.json

# Verify message content
cat runs/run-example-001/phases/gather/run/messages/m-001.json | jq '.type, .from'
# Expected: "free_text", "orchestrator"
```

### Process Phase Question/Answer Message

```bash
# Verify process messages directory exists
ls runs/run-example-001/phases/process/run/messages/
# Expected: m-001.json

# Validate process message against schema
ajv validate --spec=draft2020 --strict=false \
  -s template/hello-workflow/schemas/message.schema.json \
  -d runs/run-example-001/phases/process/run/messages/m-001.json

# Verify message content
cat runs/run-example-001/phases/process/run/messages/m-001.json | jq '.type, .from, .answer.selected'
# Expected: "multi_choice", "agent", ["C"]
```

### Status Log Message References

```bash
# Verify gather wf-phase.json has input action with message_id
cat runs/run-example-001/phases/gather/run/wf-data/wf-phase.json | jq '.status[] | select(.action == "input")'
# Expected: entry with message_id: "001"

# Verify process wf-phase.json has question/answer actions with message_id
cat runs/run-example-001/phases/process/run/wf-data/wf-phase.json | jq '.status[] | select(.action == "question" or .action == "answer")'
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

*Last updated: 2026-01-22*
