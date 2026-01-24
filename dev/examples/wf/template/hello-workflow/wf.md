# Workflow Phase Execution

You are executing a **workflow phase**. This means you are operating within a structured workflow system that provides inputs and expects specific outputs.

## ⚠️ FAIL FAST POLICY

**DO NOT attempt to fix problems yourself.** If you encounter:
- Missing files or directories
- CLI commands that fail or behave unexpectedly
- Instructions that are unclear or contradictory
- Validation errors you cannot resolve
- Any blocking issue

**Instead:**
1. Log the error with details (what you tried, what happened)
2. Hand back to orchestrator immediately
3. Do NOT try workarounds, do NOT create missing infrastructure

This helps us identify documentation/tooling gaps. Your job is to execute the phase, not debug the system.

## Before You Begin

1. **Read the phase configuration**: `wf-phase.yaml`
   - This defines what inputs are available to you
   - This defines what outputs you must produce
   - Note any phase-specific metadata

2. **Read your inputs**: Check the `run/inputs/` directory
   - `files/` - All input files from prior phases (both .md and .json)
   - `params.json` - Extracted parameters from prior phases
   - These are your working materials for this phase

3. **Load your main instructions**: `commands/main.md`
   - This contains the detailed prompt for this phase's work
   - Follow its instructions completely

## Your Workflow

```
1. Read wf-phase.yaml              → Understand the contract
2. Read run/inputs/*               → Get your inputs
3. Read commands/main.md           → Get your instructions
4. Execute the phase work          → Follow main.md
5. Write outputs to run/outputs/   → Complete the contract
```

## Output Locations

All outputs go under `run/outputs/` (flat directory):

- **Files**: `run/outputs/`
  - Your primary deliverables (reports, analyses, documentation)
  - Example: `run/outputs/acknowledgment.md`, `run/outputs/result.md`

- **Structured Data**: `run/outputs/`
  - JSON outputs that conform to declared schemas
  - Example: `run/outputs/gather-data.json`, `run/outputs/process-data.json`

- **Workflow Data**: `run/wf-data/`
  - `wf-phase.json` - Phase state tracking (managed by CLI)
  - `output-params.json` - Extracted parameters (on finalize)

> **Note**: Unlike inputs (which use `files/` and `data/` subdirectories), outputs are flat — all files go directly in `run/outputs/`.

## Phase Completion

When your work is complete, follow these steps **exactly**:

### Step 1: Write Outputs
Ensure all declared outputs in `wf-phase.yaml` are written to `run/outputs/`

### Step 2: Validate (REQUIRED)
```bash
../../cg.sh phase validate <phase_id> --check outputs
```

> **Note**: `cg` is not in PATH. Use `../../cg.sh` from your phase directory.

**What it checks**:
- All required output files exist in `run/outputs/`
- No output files are empty (0 bytes)
- JSON outputs conform to their declared schemas
- Output parameters can be extracted

**If validation fails**: 
- Log the exact error message
- Skip to Step 4 (report failure to orchestrator)

### Step 3: Finalize (REQUIRED — only if validation passed)
```bash
../../cg.sh phase finalize <phase_id>
```

This extracts output parameters and marks the phase complete.

### Step 4: Report and STOP (REQUIRED)
Report your completion status to the orchestrator:

```
---
PHASE COMPLETE: <phase_id>

Validation: PASSED | FAILED
Finalization: PASSED | FAILED | SKIPPED

Outputs created:
- <list files in run/outputs/>

Issues encountered:
- <any problems or none>

STOPPING. Awaiting orchestrator instructions.
---
```

**After reporting: STOP IMMEDIATELY. Do NOT proceed to any other phase.**

## 🛑 CRITICAL: Single Phase Only

**You are executing ONE phase only.** When this phase is complete:
- Complete steps 1-4 above
- **STOP** — do not read or execute any other phase

The orchestrator controls phase transitions. Even if you can see other phase folders, you must not execute them.

## Output Schemas

Each output declared in `wf-phase.yaml` may have a corresponding JSON Schema in `schemas/`. Read the schema files to understand the exact structure required for each output.

---

**Now**: Read `wf-phase.yaml`, then `run/inputs/*`, then proceed to `commands/main.md`.
