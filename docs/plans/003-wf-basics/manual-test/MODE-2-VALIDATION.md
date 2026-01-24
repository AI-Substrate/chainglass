# Mode 2: Validation Mode

**Purpose**: Test whether phase prompts are self-sufficient for an external agent.
**Goal**: We ONLY orchestrate. External agent (Claude, etc.) uses ONLY the phase prompts.

> **Critical Test**: Can an external agent complete all 3 phases using ONLY the files in the phase folders?

---

## Prerequisites

1. **Complete Mode 1 first** — Verify all CLI commands work
2. **Build the CLI**: `just build`
3. **External agent ready** — Claude Code, GPT, or similar

---

## The Test

```
┌─────────────────────────────────────────────────────────────────────┐
│ YOU: Only orchestrate (prepare, messages, finalize)                 │
│ EXTERNAL AGENT: Reads prompts, produces outputs, asks questions     │
│                                                                     │
│ CRITICAL: Do NOT help the agent. Give them ONLY the starter prompt. │
│ If they fail, that's VALUABLE FEEDBACK about the prompts!           │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Step 0: Create Fresh Run

```bash
cd /home/jak/substrate/003-wf-basics/docs/plans/003-wf-basics/manual-test

node ../../../../apps/cli/dist/cli.cjs wf compose \
  ../../../../dev/examples/wf/template/hello-workflow \
  --runs-dir ./results

export RUN_DIR="./results/run-$(date +%Y-%m-%d)-001"  # Adjust number if needed
```

---

## GATHER PHASE

### [YOU] Step 1: Prepare and create user input

```bash
# Prepare phase
node ../../../../apps/cli/dist/cli.cjs phase prepare gather --run-dir $RUN_DIR --json

# Create user request message
node ../../../../apps/cli/dist/cli.cjs phase message create gather \
  --run-dir $RUN_DIR \
  --type free_text --from orchestrator \
  --subject "Workflow Request" \
  --body "Process these CSV files and generate a summary report with trends. Focus on the sales data from Q4 2025." \
  --json

# Transfer control to agent (full handover)
node ../../../../apps/cli/dist/cli.cjs phase handover gather --run-dir $RUN_DIR \
  --reason "Handing to agent for gather work" --json
```

### [YOU] Step 2: Start the external agent

Give the agent ONLY the starter prompt. Copy from **AGENT-STARTER-PROMPT.md** or use:

```
You are executing a workflow phase. 

Your working directory is: [ABSOLUTE_PATH_TO_RUN_DIR]/phases/gather/

Start by reading: commands/wf.md

This file tells you everything you need to know.
```

> **DO NOT HELP**: If the agent gets confused, document what confused them. That's the test!

### [AGENT WORKS]

The agent should:
1. Read `commands/wf.md` → Understand workflow system
2. Read `commands/main.md` → Get gather-specific instructions  
3. Read `run/messages/m-001.json` → Get user request
4. Write `run/outputs/acknowledgment.md`
5. Write `run/outputs/gather-data.json`
6. Run validation (if they know to)

### [YOU] Step 3: Validate and complete

When agent signals completion:

```bash
# Validate their outputs
node ../../../../apps/cli/dist/cli.cjs phase validate gather --run-dir $RUN_DIR --check outputs --json

# If valid, finalize
node ../../../../apps/cli/dist/cli.cjs phase finalize gather --run-dir $RUN_DIR --json
```

**If validation fails**: Document what went wrong. Was it:
- Missing file?
- Wrong filename?
- Invalid JSON?
- Schema violation?

---

## PROCESS PHASE  

### [YOU] Step 4: Prepare process

```bash
node ../../../../apps/cli/dist/cli.cjs phase prepare process --run-dir $RUN_DIR --json

# Handover to agent
node ../../../../apps/cli/dist/cli.cjs phase handover process --run-dir $RUN_DIR \
  --reason "Handing to agent for processing" --json
```

### [YOU] Step 5: Direct agent to process phase

```
Continue with the next phase.

Your working directory is now: [ABSOLUTE_PATH_TO_RUN_DIR]/phases/process/

Start by reading: commands/wf.md
```

### [AGENT WORKS]

The agent should:
1. Read prompts (wf.md, main.md)
2. Read inputs from gather (`run/inputs/files/`, `run/inputs/data/`, `run/inputs/params.json`)
3. **Possibly ask a question** via message (this is expected!)
4. Write outputs

### [YOU] Step 6: Handle questions (if any)

```bash
# Check for messages
node ../../../../apps/cli/dist/cli.cjs phase message list process --run-dir $RUN_DIR --json

# If there's an unanswered question from agent:
node ../../../../apps/cli/dist/cli.cjs phase message read process --run-dir $RUN_DIR --id 001 --json

# Answer it
node ../../../../apps/cli/dist/cli.cjs phase message answer process \
  --run-dir $RUN_DIR \
  --id 001 --select C --note "Include both summary and details" --json

# Handover back to agent
node ../../../../apps/cli/dist/cli.cjs phase handover process --run-dir $RUN_DIR \
  --reason "Answer provided, please continue" --json
```

### [YOU] Step 7: Complete process

```bash
node ../../../../apps/cli/dist/cli.cjs phase validate process --run-dir $RUN_DIR --check outputs --json
node ../../../../apps/cli/dist/cli.cjs phase finalize process --run-dir $RUN_DIR --json
```

---

## REPORT PHASE

### [YOU] Step 8: Prepare report

```bash
node ../../../../apps/cli/dist/cli.cjs phase prepare report --run-dir $RUN_DIR --json
node ../../../../apps/cli/dist/cli.cjs phase handover report --run-dir $RUN_DIR \
  --reason "Handing to agent for final report" --json
```

### [YOU] Step 9: Direct agent

```
Final phase.

Your working directory is now: [ABSOLUTE_PATH_TO_RUN_DIR]/phases/report/

Start by reading: commands/wf.md
```

### [AGENT WORKS]

The agent should produce `run/outputs/final-report.md`.

### [YOU] Step 10: Complete workflow

```bash
node ../../../../apps/cli/dist/cli.cjs phase validate report --run-dir $RUN_DIR --check outputs --json
node ../../../../apps/cli/dist/cli.cjs phase finalize report --run-dir $RUN_DIR --json

# Verify all complete
./check-state.sh $RUN_DIR
```

---

## Recording Results

### Success Criteria

| Criteria | Pass/Fail | Notes |
|----------|-----------|-------|
| Agent understood wf.md instructions | | |
| Agent found the message in gather | | |
| Agent wrote correct output files | | |
| Agent used correct output locations | | |
| Agent found inputs from prior phase | | |
| Agent asked question appropriately | | |
| Agent used answer in work | | |
| Final report was generated | | |

### If Agent Failed

Document these for prompt improvement:

1. **Where did they get confused?**
   - Which phase?
   - Which step?
   - What were they trying to do?

2. **What prompt was unclear?**
   - wf.md?
   - main.md?
   - Schema?

3. **What did they produce instead?**
   - Wrong files?
   - Wrong location?
   - Wrong format?

4. **Suggested prompt fixes**:
   - What would have helped?
   - What was missing?

---

## Post-Test Actions

### If Mode 2 Succeeded
- ✅ Prompts are self-sufficient!
- Document any minor friction points
- Consider if improvements would help

### If Mode 2 Failed  
- Document failure points in detail
- Create follow-up tasks for prompt improvements
- Re-run after fixes

---

## Example Failure Documentation

```markdown
## Mode 2 Run: 2026-01-23

### Failure Point: Process Phase

**What happened**: Agent wrote outputs to `outputs/result.md` but didn't 
include `process-data.json`.

**Root cause**: `main.md` mentions both files but doesn't emphasize they're 
BOTH required.

**Suggested fix**: Add explicit checklist to main.md:
- [ ] outputs/result.md (required)  
- [ ] outputs/process-data.json (required)

**Task created**: [prompt-improvement-001.md]
```
