# Entity JSON Validation Guide

Per **Phase 6: Service Unification & Validation** of the entity-upgrade plan, this guide walks through validating that the refactored services return proper entity JSON.

> **Prerequisites**: The main workflow test (see [README.md](./README.md)) should be completed first. This guide validates entity output format after the workflow runs successfully.

---

## Quick Start

```bash
cd docs/how/dev/manual-wf-run

# 1. Run a complete workflow first (if not already done)
./01-compose.sh
./02-start-gather.sh
# ... complete workflow phases ...
./08-complete-report.sh

# 2. Validate entity JSON format
./09-validate-entity-json.sh

# 3. Validate runs commands
./10-validate-runs-commands.sh
```

---

## What We're Validating

### Entity JSON Structure

After Phase 6 refactoring:
- **Workflow entity** has properties: `slug`, `workflowDir`, `version`, `isCurrent`, `isCheckpoint`, `isRun`, `isTemplate`, `source`, `checkpoint`, `run`, `phases`
- **Phase entity** has properties: `name`, `phaseDir`, `runDir`, `description`, `order`, `status`, `state`, `facilitator`, `startedAt`, `completedAt`, `duration`, `isPending`, `isReady`, `isActive`, `isBlocked`, `isComplete`, `isFailed`, `isDone`, `inputFiles`, `inputParameters`, `inputMessages`, `outputs`, `outputParameters`, `statusHistory`, `messages`

### XOR Invariant

Workflow entities must satisfy exactly one of:
- `isCurrent=true` (editable template from current/)
- `isCheckpoint=true` (frozen snapshot from checkpoints/)
- `isRun=true` (execution from runs/)

For runs, both `checkpoint` and `run` metadata must be populated.

---

## Step-by-Step Validation

### Step 1: Create a Fresh Workflow Run

```bash
./01-compose.sh
```

**Expected**: Creates run folder in `dev/examples/wf/runs/run-YYYY-MM-DD-NNN/`

### Step 2: Complete at Least One Phase

```bash
./02-start-gather.sh
# Agent works...
./03-complete-gather.sh
```

**Expected**: Gather phase reaches `status: complete`

### Step 3: Validate Entity JSON Format

```bash
./09-validate-entity-json.sh
```

**Expected Output**:
```
═══════════════════════════════════════════════════════════
Entity JSON Format Validation
═══════════════════════════════════════════════════════════

─────────────────────────────────────────────────────────────
Test 1: Workflow Entity JSON (from cg runs get)
─────────────────────────────────────────────────────────────
Validating Workflow entity structure...
  [OK] slug: hello-workflow
  [OK] workflowDir: /path/to/run
  [OK] isCurrent: false
  [OK] isCheckpoint: false
  [OK] isRun: true
  [OK] source: run
  ...

✅ Entity JSON Validation: PASSED
```

### Step 4: Validate Runs Commands

```bash
./10-validate-runs-commands.sh
```

**Expected Output**:
```
═══════════════════════════════════════════════════════════
Runs Commands Validation
═══════════════════════════════════════════════════════════

─────────────────────────────────────────────────────────────
Test 1: cg runs list (table format)
─────────────────────────────────────────────────────────────
  [OK] Command executed successfully

─────────────────────────────────────────────────────────────
Test 2: cg runs list (JSON format)
─────────────────────────────────────────────────────────────
  [OK] Found 1 run(s)
  [OK] isRun: true (entity format)

✅ Runs Commands Validation: PASSED
```

---

## Troubleshooting

### "isRun not present"
The CLI may be returning DTO format instead of entity format. This indicates Phase 6 refactoring is not yet complete.

### "COMMAND_FAILED"
Check that:
1. CLI is built: `pnpm --filter @chainglass/cli build`
2. Workflow exists in registry if using `--workflow` flag

### "Missing key: X"
Entity structure may differ from expected. Check:
- `expected-outputs/workflow-run.json` for expected Workflow schema
- `expected-outputs/phase-complete.json` for expected Phase schema

---

## Recording Results

After validation, document results in:
- [Phase 6 Execution Log](../../../plans/010-entity-upgrade/tasks/phase-6-service-unification-validation/execution.log.md)

**If validation passed**: Note T018/T019 gates satisfied.

**If validation failed**: Document:
1. Which test failed?
2. What was the actual vs expected output?
3. Which task needs attention?

---

## Expected Output Schemas

The `expected-outputs/` directory contains JSON schemas that define valid entity structures:

| File | Purpose |
|------|---------|
| `workflow-run.json` | Workflow entity loaded from a run (isRun=true) |
| `phase-complete.json` | Phase entity after completion (status=complete) |

These schemas align with the TypeScript interfaces in:
- `/packages/workflow/src/entities/workflow.ts` → `WorkflowJSON`
- `/packages/workflow/src/entities/phase.ts` → `PhaseJSON`

---

## Validation Gates

This guide supports two validation gates from Phase 6:

| Gate | Task | Validation Script | Status |
|------|------|-------------------|--------|
| GATE 1 | T018 | `09-validate-entity-json.sh` | All [OK] |
| GATE 2 | T019 | `10-validate-runs-commands.sh` | All [OK] |

Both gates must pass before Phase 6 can be merged.
