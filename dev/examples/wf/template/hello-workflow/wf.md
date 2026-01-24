# Workflow Phase Execution

You are executing a **workflow phase**. This means you are operating within a structured workflow system that provides inputs and expects specific outputs.

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

When your work is complete:

1. Ensure all declared outputs in `wf-phase.yaml` are written to `run/outputs/`
2. Run phase validation:
   ```bash
   cg phase validate <phase_id> --run-dir <path_to_run> --check outputs
   ```

   **What it checks**:
   - All required output files exist in `run/outputs/`
   - No output files are empty (0 bytes)
   - JSON outputs conform to their declared schemas
   - Output parameters can be extracted

   **If validation fails**: Fix the reported errors before proceeding.

   **On success**: Phase outputs become available to downstream phases.

3. Stop and wait - the workflow system handles what comes next

## Output Schemas

Each output declared in `wf-phase.yaml` may have a corresponding JSON Schema in `schemas/`. Read the schema files to understand the exact structure required for each output.

---

**Now**: Read `wf-phase.yaml`, then `run/inputs/*`, then proceed to `commands/main.md`.
