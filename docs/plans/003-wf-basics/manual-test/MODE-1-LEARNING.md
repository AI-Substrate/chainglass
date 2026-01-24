# Mode 1: Learning Mode

**Purpose**: Walk through the hello-workflow playing BOTH orchestrator and agent roles.
**Goal**: Understand the handover dance, verify CLI commands work, test all interaction patterns.

> **Single Actor Assumption**: Only one party (orchestrator or agent) has control at a time. This is enforced by the Facilitator Model—don't worry about race conditions.

---

## Prerequisites

```bash
cd /home/jak/substrate/003-wf-basics

# Build the CLI
just build

# Verify CLI works
node apps/cli/dist/cli.cjs --version
```

---

## Step 0: Create Fresh Run

```bash
# Navigate to manual test folder
cd docs/plans/003-wf-basics/manual-test

# Create a fresh run (auto-numbered: run-2026-01-23-001, etc.)
node ../../../../apps/cli/dist/cli.cjs wf compose \
  ../../../../dev/examples/wf/template/hello-workflow \
  --runs-dir ./results

# Note the created run folder path
export RUN_DIR="./results/run-$(date +%Y-%m-%d)-001"  # Adjust number if needed

# Verify structure
ls -la $RUN_DIR/phases/
```

**Expected**: You see `gather/`, `process/`, `report/` directories.

---

## GATHER PHASE

### [ORCH] Step 1: Prepare the phase

```bash
node ../../../../apps/cli/dist/cli.cjs phase prepare gather --run-dir $RUN_DIR --json
```

**Expected**: Phase state becomes `active`.

```bash
# Verify state
./check-state.sh $RUN_DIR
```

### [ORCH] Step 2: Create user input message

```bash
node ../../../../apps/cli/dist/cli.cjs phase message create gather \
  --run-dir $RUN_DIR \
  --type free_text --from orchestrator \
  --subject "Workflow Request" \
  --body "Process these CSV files and generate a summary report with trends. Focus on the sales data from Q4 2025." \
  --json
```

**Expected**: Creates `m-001.json` in `phases/gather/run/messages/`.

```bash
# Verify message
cat $RUN_DIR/phases/gather/run/messages/m-001.json
```

---

### 🎭 Switch to AGENT role

---

### [AGENT] Step 3: Read phase instructions

Read these files to understand what the agent sees:

```bash
# Agent's workflow instructions
cat $RUN_DIR/phases/gather/commands/wf.md

# Phase-specific instructions
cat $RUN_DIR/phases/gather/commands/main.md

# User's request message
cat $RUN_DIR/phases/gather/run/messages/m-001.json
```

### [AGENT] Step 4: Simulate agent work

For Mode 1, we copy pre-made outputs instead of doing real work:

```bash
# Copy simulated agent outputs
cp simulated-agent-work/gather/acknowledgment.md $RUN_DIR/phases/gather/run/outputs/
cp simulated-agent-work/gather/gather-data.json $RUN_DIR/phases/gather/run/outputs/

# Verify outputs exist
ls -la $RUN_DIR/phases/gather/run/outputs/
```

### [AGENT] Step 5: Validate outputs

```bash
node ../../../../apps/cli/dist/cli.cjs phase validate gather --run-dir $RUN_DIR --check outputs --json
```

**Expected**: Validation passes (all outputs exist, schemas valid).

---

### 🎭 Switch to ORCHESTRATOR role

---

### [ORCH] Step 6: Finalize gather phase

```bash
node ../../../../apps/cli/dist/cli.cjs phase finalize gather --run-dir $RUN_DIR --json
```

**Expected**: 
- State becomes `complete`
- `output-params.json` created with `item_count` and `request_type`

```bash
# Verify
cat $RUN_DIR/phases/gather/run/wf-data/output-params.json
./check-state.sh $RUN_DIR
```

---

## PROCESS PHASE

### [ORCH] Step 7: Prepare process phase

```bash
node ../../../../apps/cli/dist/cli.cjs phase prepare process --run-dir $RUN_DIR --json
```

**Expected**:
- State becomes `active`
- Inputs copied from gather: `inputs/files/`, `inputs/data/`, `inputs/params.json`

```bash
# Verify inputs were copied
ls -la $RUN_DIR/phases/process/run/inputs/
cat $RUN_DIR/phases/process/run/inputs/params.json
```

---

### 🎭 Switch to AGENT role

---

### [AGENT] Step 8: Read inputs from gather

```bash
# Read files from prior phase
cat $RUN_DIR/phases/process/run/inputs/files/acknowledgment.md
cat $RUN_DIR/phases/process/run/inputs/data/gather-data.json

# Read extracted parameters
cat $RUN_DIR/phases/process/run/inputs/params.json
```

### [AGENT] Step 9: Agent asks a question

This is the key interaction pattern—agent needs clarification:

```bash
node ../../../../apps/cli/dist/cli.cjs phase message create process \
  --run-dir $RUN_DIR \
  --type multi_choice --from agent \
  --subject "Output format selection" \
  --body "The gathered data contains both summary and detailed records. How should I structure the processed output?" \
  --options "A:Summary only,B:Detailed only,C:Both" \
  --json
```

**Expected**: Creates `m-001.json` in `phases/process/run/messages/`.

```bash
# Verify question
cat $RUN_DIR/phases/process/run/messages/m-001.json
```

---

### 🎭 Switch to ORCHESTRATOR role

---

### [ORCH] Step 10: Answer the question

```bash
node ../../../../apps/cli/dist/cli.cjs phase message answer process \
  --run-dir $RUN_DIR \
  --id 001 --select C --note "Include both - stakeholders need summary, devs need details" \
  --json
```

**Expected**: `answer` field added to `m-001.json`.

```bash
# Verify answer
cat $RUN_DIR/phases/process/run/messages/m-001.json
```

---

### 🎭 Switch to AGENT role

---

### [AGENT] Step 11: Complete work with answer

```bash
# Copy simulated outputs
cp simulated-agent-work/process/result.md $RUN_DIR/phases/process/run/outputs/
cp simulated-agent-work/process/process-data.json $RUN_DIR/phases/process/run/outputs/

# Verify
ls -la $RUN_DIR/phases/process/run/outputs/
```

### [AGENT] Step 12: Validate outputs

```bash
node ../../../../apps/cli/dist/cli.cjs phase validate process --run-dir $RUN_DIR --check outputs --json
```

---

### 🎭 Switch to ORCHESTRATOR role

---

### [ORCH] Step 13: Finalize process phase

```bash
node ../../../../apps/cli/dist/cli.cjs phase finalize process --run-dir $RUN_DIR --json
```

```bash
# Verify
./check-state.sh $RUN_DIR
```

---

## REPORT PHASE

### [ORCH] Step 14: Prepare report phase

```bash
node ../../../../apps/cli/dist/cli.cjs phase prepare report --run-dir $RUN_DIR --json
```

**Expected**: Inputs from process copied to report phase.

```bash
ls -la $RUN_DIR/phases/report/run/inputs/
```

---

### 🎭 Switch to AGENT role

---

### [AGENT] Step 15: Create final report

```bash
# Copy simulated output
cp simulated-agent-work/report/final-report.md $RUN_DIR/phases/report/run/outputs/

# Verify
ls -la $RUN_DIR/phases/report/run/outputs/
```

### [AGENT] Step 16: Validate outputs

```bash
node ../../../../apps/cli/dist/cli.cjs phase validate report --run-dir $RUN_DIR --check outputs --json
```

---

### 🎭 Switch to ORCHESTRATOR role

---

### [ORCH] Step 17: Finalize report phase

```bash
node ../../../../apps/cli/dist/cli.cjs phase finalize report --run-dir $RUN_DIR --json
```

---

## Final Verification

```bash
# Check all phases complete
./check-state.sh $RUN_DIR

# Expected output:
# gather:  complete
# process: complete
# report:  complete
```

---

## Mode 1 Checklist

| Pattern | Phase | Tested | Notes |
|---------|-------|--------|-------|
| Orchestrator provides user input | gather | [ ] | `m-001.json` with free_text |
| Agent reads message | gather | [ ] | Cat the message file |
| Agent produces outputs | gather | [ ] | acknowledgment.md, gather-data.json |
| Files copied from prior phase | process | [ ] | inputs/files/, inputs/data/ |
| Parameters from prior phase | process | [ ] | params.json with item_count |
| Agent asks multi-choice question | process | [ ] | message create --from agent |
| Orchestrator answers question | process | [ ] | message answer --select C |
| Agent uses answer | process | [ ] | Output reflects selection |
| Terminal phase works | report | [ ] | Final report generated |

---

## Troubleshooting

### "Phase not found"
- Check you're using correct phase name: `gather`, `process`, `report` (lowercase)
- Verify `$RUN_DIR` is set correctly

### "Message already answered"
- You can only answer a message once
- Start fresh with a new compose if needed

### "Validation failed"
- Check output file names match exactly what's in `wf-phase.yaml`
- Ensure JSON files are valid JSON
- Check schema requirements

### State out of sync
- Use `./check-state.sh $RUN_DIR` to see current state
- Each phase must be `complete` before next can `prepare`

---

## Next Steps

After completing Mode 1 successfully:
1. Document any issues in the execution log
2. Proceed to **MODE-2-VALIDATION.md** for the real test with an external agent
