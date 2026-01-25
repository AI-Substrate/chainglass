# Mode 2: Agent Validation Test (External Agent)

**Purpose**: Test whether phase prompts are self-sufficient for an external agent.
**Goal**: We ONLY orchestrate. External agent (Claude, GPT, etc.) uses ONLY the phase prompts.

> **Critical Test**: Can an external agent complete the gather phase using ONLY the files in the phase folders?

---

## Prerequisites

1. **Complete Mode 1 first** — Verify all CLI commands work
2. **Build the CLI**: `just build`
3. **Set up `cg` alias**: `alias cg='node /path/to/apps/cli/dist/cli.cjs'`
4. **External agent ready** — Claude Code, ChatGPT, or similar

---

## The Test

```
┌─────────────────────────────────────────────────────────────────────┐
│ YOU: Only orchestrate (init, checkpoint, compose, prepare, finalize)│
│ EXTERNAL AGENT: Reads prompts, produces outputs                     │
│                                                                     │
│ CRITICAL: Do NOT help the agent. Give them ONLY the starter prompt. │
│ If they fail, that's VALUABLE FEEDBACK about the prompts!           │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Setup: Fresh Versioned Run

### Step 0: Create a Fresh Run

```bash
cd /home/jak/substrate/007-manage-workflows/docs/plans/007-manage-workflows/tasks/phase-6-documentation-rollout/manual-test

# If needed, initialize (skip if already done in Mode 1)
./01-clean-slate.sh
./02-init-project.sh
./03-create-checkpoint.sh

# Compose a new run
./04-compose-run.sh

# Verify run created
cat .current-run
./check-state.sh
```

---

## GATHER PHASE

### [YOU] Step 1: Prepare the Phase

```bash
RUN_DIR=$(cat .current-run)

# Prepare gather phase
cg phase prepare gather --run-dir "$RUN_DIR" --json

# Create user request message
cg phase message create gather \
  --run-dir "$RUN_DIR" \
  --type free_text --from orchestrator \
  --subject "Your Request" \
  --body "Please help me understand the Chainglass workflow system and provide a response demonstrating you understood the task." \
  --json
```

### [YOU] Step 2: Start the External Agent

Give the agent **ONLY** this starter prompt (copy exactly):

---

## Agent Starter Prompt

```
You are executing a workflow phase.

Your working directory is:
[REPLACE_WITH_ABSOLUTE_PATH]/phases/gather/

Start by reading: commands/main.md

This file tells you everything you need to know.
```

**Replace `[REPLACE_WITH_ABSOLUTE_PATH]` with the actual path from `cat .current-run`.**

Example:
```
Your working directory is:
/home/jak/substrate/007-manage-workflows/.chainglass/runs/hello-workflow/v002-abc12345/run-2026-01-26-001/phases/gather/
```

---

### [AGENT WORKS]

The agent should:
1. Read `commands/main.md` → Get gather-specific instructions
2. Read `run/messages/m-001.json` → Get user request
3. Write `run/outputs/response.md` → Create their response
4. (Optionally) Run validation if they know to

> **DO NOT HELP**: If the agent gets confused, document what confused them. That's the test!

---

### [YOU] Step 3: Validate and Complete

When agent signals completion:

```bash
RUN_DIR=$(cat .current-run)

# Validate their outputs
cg phase validate gather --run-dir "$RUN_DIR" --check outputs --json

# If valid, finalize
cg phase finalize gather --run-dir "$RUN_DIR" --json

# Verify completion
./check-state.sh
```

**If validation fails**: Document what went wrong:
- Missing file?
- Wrong filename? (expected `response.md`)
- Invalid format?

---

## Recording Results

### Success Criteria

| Criteria | Pass/Fail | Notes |
|----------|-----------|-------|
| Agent found commands/main.md | | |
| Agent understood the instructions | | |
| Agent found run/messages/m-001.json | | |
| Agent wrote to correct location (run/outputs/) | | |
| Agent used correct filename (response.md) | | |
| Output content was appropriate | | |
| Agent did NOT need additional help | | |

### If Agent Failed

Document these for prompt improvement:

1. **Where did they get confused?**
   - Which file?
   - Which instruction?
   - What were they trying to do?

2. **What prompt was unclear?**
   - commands/main.md?
   - Directory structure explanation?
   - Output requirements?

3. **What did they produce instead?**
   - Wrong files?
   - Wrong location?
   - Wrong format?

4. **Suggested prompt fixes**:
   - What would have helped?
   - What was missing?

---

## Example Failure Documentation

```markdown
## Mode 2 Run: 2026-01-26

### Failure Point: Output Location

**What happened**: Agent wrote outputs to `outputs/result.md` instead of
`run/outputs/response.md`.

**Root cause**: Agent didn't understand the `run/` subdirectory structure.

**Suggested fix**: Add explicit path example to main.md:
- Full path: `run/outputs/response.md`
- NOT: `outputs/response.md`

**Task created**: [prompt-improvement-001.md]
```

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

## Validation Checklist

| # | Validation | Pass/Fail | Notes |
|---|------------|-----------|-------|
| 1 | Agent started from main.md only | | |
| 2 | Agent found all necessary files | | |
| 3 | Agent understood output requirements | | |
| 4 | Agent wrote correct output file | | |
| 5 | Output passed validation | | |
| 6 | No extra help was needed | | |

---

## Success Declaration

**Mode 2 Passed**: □ Yes / □ No

**If Yes**: The prompt system is validated for the hello-workflow gather phase.

**If No**: Document improvements needed and create follow-up tasks.

---

## Notes

- This test uses the **bundled hello-workflow** template (single gather phase)
- The template is intentionally simple to test the minimal viable prompt structure
- More complex multi-phase workflows would need additional Mode 2 testing
- Consider testing with multiple LLM providers (Claude, GPT, etc.) for robustness
