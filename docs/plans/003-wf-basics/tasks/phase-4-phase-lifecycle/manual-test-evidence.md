# Phase 4: Phase Lifecycle - Manual Test Evidence

**Date**: 2026-01-22
**AC Tested**: AC-18, AC-19, AC-19a, AC-39, AC-40

---

## Test Environment Setup

```bash
# Setup templates directory
mkdir -p .chainglass/templates
cp -r dev/examples/wf/template/hello-workflow .chainglass/templates/
```

---

## Full Workflow Test (AC-19, AC-19a)

### 1. Compose Workflow

```bash
$ node apps/cli/dist/cli.cjs wf compose .chainglass/templates/hello-workflow \
    --runs-dir .chainglass/runs --json
```

**Output:**
```json
{
  "success": true,
  "command": "wf.compose",
  "timestamp": "2026-01-22T13:47:26.297Z",
  "data": {
    "runDir": ".chainglass/runs/run-2026-01-22-001",
    "template": "hello-workflow",
    "phases": [
      {"name": "gather", "order": 1, "status": "pending"},
      {"name": "process", "order": 2, "status": "pending"},
      {"name": "report", "order": 3, "status": "pending"}
    ]
  }
}
```

---

### 2. Gather Phase Cycle

#### 2.1 Prepare
```bash
$ node apps/cli/dist/cli.cjs phase prepare gather \
    --run-dir .chainglass/runs/run-2026-01-22-001 --json
```

**Output:** `{"success":true,"command":"phase.prepare",...,"status":"ready"}`

#### 2.2 Create Outputs (Simulated Agent Work)
```bash
mkdir -p phases/gather/run/outputs
# Create acknowledgment.md and gather-data.json matching schema
```

#### 2.3 Validate Outputs
```bash
$ node apps/cli/dist/cli.cjs phase validate gather \
    --run-dir .chainglass/runs/run-2026-01-22-001 --check outputs --json
```

**Output:** `{"success":true,"command":"phase.validate",...,"files":{"validated":[...]}}`

#### 2.4 Finalize (AC-18)
```bash
$ node apps/cli/dist/cli.cjs phase finalize gather \
    --run-dir .chainglass/runs/run-2026-01-22-001 --json
```

**Output:**
```json
{
  "success": true,
  "command": "phase.finalize",
  "timestamp": "2026-01-22T13:48:39.383Z",
  "data": {
    "phase": "gather",
    "runDir": ".chainglass/runs/run-2026-01-22-001",
    "extractedParams": {
      "item_count": 3,
      "request_type": "processing"
    },
    "phaseStatus": "complete"
  }
}
```

**Side Effects Verified:**
- `wf-status.json`: `phases.gather.status = "complete"`
- `output-params.json`: `{"item_count":3,"request_type":"processing"}`
- `wf-phase.json`: `state = "complete"`, status[] includes finalize action

---

### 3. Process Phase Cycle

#### 3.1 Prepare
```bash
$ node apps/cli/dist/cli.cjs phase prepare process \
    --run-dir .chainglass/runs/run-2026-01-22-001 --json
```

**Output:**
```json
{
  "success": true,
  "data": {
    "status": "ready",
    "copiedFromPrior": [
      {"from": ".../gather/.../acknowledgment.md", "to": ".../process/.../acknowledgment.md"},
      {"from": ".../gather/.../gather-data.json", "to": ".../process/.../gather-data.json"}
    ]
  }
}
```

**params.json verified:**
```json
{"item_count": 3}
```

#### 3.2 Create Outputs → 3.3 Validate → 3.4 Finalize
All succeeded with `extractedParams: {"processed_count":3,"status":"success"}`

---

### 4. Report Phase Cycle

#### 4.1 Prepare
Files copied from process phase: result.md, process-data.json

#### 4.2 Create Output → 4.3 Validate → 4.4 Finalize
```bash
$ node apps/cli/dist/cli.cjs phase finalize report \
    --run-dir .chainglass/runs/run-2026-01-22-001 --json
```

**Output:** `"extractedParams":{},"phaseStatus":"complete"}`

*(Report is terminal phase with no output_parameters)*

---

## Final State Verification

```bash
$ cat wf-run/wf-status.json | jq '.phases | map_values(.status)'
```

**Output:**
```json
{
  "gather": "complete",
  "process": "complete",
  "report": "complete"
}
```

---

## Idempotency Test (AC-39)

### Test: Finalize twice returns same success
```bash
# First finalize
$ cg phase finalize gather --run-dir ... --json
# Output: {"success":true,...,"extractedParams":{"item_count":3,...}}

# Second finalize (re-extracts and overwrites)
$ cg phase finalize gather --run-dir ... --json
# Output: {"success":true,...,"extractedParams":{"item_count":3,...}}
```

Both calls succeed. Per DYK Insight #4: Always re-extract and overwrite.

---

## Error Handling Test (AC-40)

### Test: Retry after failure works
```bash
# Try finalize without outputs (fails with E010)
$ cg phase finalize gather --run-dir ... --json
# Output: {"success":false,"error":{"code":"E010",...}}

# Create outputs, retry finalize (succeeds)
$ cg phase finalize gather --run-dir ... --json
# Output: {"success":true,...}
```

Re-entrant: no manual cleanup required.

---

## Summary

| AC | Description | Status |
|----|-------------|--------|
| AC-18 | finalize creates output-params.json | ✅ PASS |
| AC-18a | JSON output includes extractedParams | ✅ PASS |
| AC-19 | Full manual test flow succeeds | ✅ PASS |
| AC-19a | Full flow works with --json | ✅ PASS |
| AC-39 | finalize twice returns same result | ✅ PASS |
| AC-40 | Commands retry without cleanup | ✅ PASS |

All acceptance criteria verified.
