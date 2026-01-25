# Mode 1: Full E2E Test (Clean Slate → Complete Workflow)

**Purpose**: Walk through the complete workflow management lifecycle from scratch.
**Goal**: Validate project initialization, checkpoint versioning, versioned runs, and phase execution.

> **Single Actor Assumption**: Only one party (orchestrator or agent) has control at a time. This is enforced by the Facilitator Model.

---

## Prerequisites

### 1. Build the CLI

```bash
cd /home/jak/substrate/007-manage-workflows

# Build the CLI
just build

# Verify CLI works
node apps/cli/dist/cli.cjs --version
```

### 2. Set up the `cg` alias (DYK-03)

For convenience, set up an alias to avoid typing the full path:

```bash
# Add to your shell (bash/zsh):
alias cg='node /home/jak/substrate/007-manage-workflows/apps/cli/dist/cli.cjs'

# Verify alias works
cg --version
```

### 3. Navigate to the manual test folder

```bash
cd /home/jak/substrate/007-manage-workflows/docs/plans/007-manage-workflows/tasks/phase-6-documentation-rollout/manual-test
```

---

## PART 1: Project Initialization

### Step 1: Clean Slate (DYK-02)

Start from absolute nothing:

```bash
./01-clean-slate.sh
```

This removes `.chainglass/` entirely and clears `.current-run`.

**Expected**: No `.chainglass/` directory exists.

```bash
# Verify clean state
ls -la .chainglass/ 2>&1 || echo "✓ .chainglass/ does not exist (clean slate)"
```

### Step 2: Initialize Project (DYK-01)

```bash
./02-init-project.sh
```

This runs `cg init` with exit code checking.

**Expected**:
- `.chainglass/workflows/` directory created
- `.chainglass/runs/` directory created
- `hello-workflow` template installed in `workflows/hello-workflow/current/`

```bash
# Verify structure
ls -la .chainglass/
ls -la .chainglass/workflows/hello-workflow/
cat .chainglass/workflows/hello-workflow/workflow.json
```

### Step 3: Verify Initial State

```bash
./check-state.sh
```

**Expected**:
- Workflow list shows `hello-workflow` with 0 checkpoints
- No runs exist yet

---

## PART 2: Template Versioning

### Step 4: Create First Checkpoint

```bash
./03-create-checkpoint.sh
```

This creates the first checkpoint and tests duplicate detection (E035).

**Expected**:
1. First checkpoint: `v001-<hash>` created
2. Second checkpoint attempt: E035 error (unchanged content)
3. Force checkpoint: `v002-<hash>` created

```bash
# Verify checkpoints (DYK-04: hash visibility)
cg workflow versions hello-workflow
ls -la .chainglass/workflows/hello-workflow/checkpoints/
```

**Checkpoint Structure**:
```
checkpoints/
├── v001-<hash>/
│   ├── .checkpoint.json    # Metadata: ordinal, hash, created_at, comment
│   ├── wf.yaml             # Workflow definition snapshot
│   └── phases/             # Phase definitions
└── v002-<hash>/
    └── ...
```

### Step 5: Verify Version History

```bash
cg workflow versions hello-workflow
```

**Expected**: Shows v002, then v001 (newest first).

---

## PART 3: Versioned Run Creation

### Step 6: Compose Run from Checkpoint

```bash
./04-compose-run.sh
```

This composes a new run from the latest checkpoint.

**Expected**:
- Run created at `runs/hello-workflow/v002-<hash>/run-YYYY-MM-DD-NNN/`
- `.current-run` file updated with run path
- `wf-status.json` contains version metadata

```bash
# Verify versioned run path
cat .current-run
ls -la "$(cat .current-run)"
```

### Step 7: Verify wf-status.json Metadata (DYK-05)

```bash
./check-state.sh
```

**Expected**:
- `wf-status.json` shows:
  - `workflow.slug`: "hello-workflow"
  - `workflow.version_hash`: matches checkpoint hash (non-empty)
  - `workflow.checkpoint_comment`: matches checkpoint comment (may be empty)

```bash
# Direct verification
cat "$(cat .current-run)/wf-run/wf-status.json" | jq '.workflow'
```

---

## PART 4: Phase Execution (Gather)

The bundled `hello-workflow` template has a single `gather` phase.

### Step 8: Start Gather Phase

```bash
./05-start-gather.sh
```

This:
1. Prepares the gather phase
2. Creates the user request message from orchestrator-inputs/

**Expected**:
- Phase state: `ready`
- Message `m-001.json` created in `phases/gather/run/messages/`

```bash
./check-state.sh
```

---

### 🎭 Switch to AGENT role

---

### [AGENT] Step 9: Read Phase Instructions

The agent sees:

```bash
RUN_DIR=$(cat .current-run)

# Workflow instructions
cat "$RUN_DIR/phases/gather/commands/wf.md"

# Phase-specific instructions
cat "$RUN_DIR/phases/gather/commands/main.md"

# User's request
cat "$RUN_DIR/phases/gather/run/messages/m-001.json"
```

### [AGENT] Step 10: Simulate Agent Work

For Mode 1, we copy pre-made outputs:

```bash
RUN_DIR=$(cat .current-run)

# Copy simulated output
cp simulated-agent-work/gather/response.md "$RUN_DIR/phases/gather/run/outputs/"

# Verify
ls -la "$RUN_DIR/phases/gather/run/outputs/"
```

### [AGENT] Step 11: Validate Outputs

```bash
RUN_DIR=$(cat .current-run)
cg phase validate gather --run-dir "$RUN_DIR" --check outputs --json
```

**Expected**: Validation passes.

---

### 🎭 Switch to ORCHESTRATOR role

---

### Step 12: Complete Gather Phase

```bash
./06-complete-gather.sh
```

This validates and finalizes the gather phase.

**Expected**:
- Validation passes
- Phase state: `complete`
- Output parameters extracted

```bash
./check-state.sh
```

---

## Final Verification

### All Components Verified

```bash
./check-state.sh

# Expected:
# ═══════════════════════════════════════════════════════════
# Workflow Management State Report
# ═══════════════════════════════════════════════════════════
#
# Workflows:
#   hello-workflow  2 checkpoints
#
# Current Run: runs/hello-workflow/v002-<hash>/run-YYYY-MM-DD-NNN/
#
# wf-status.json:
#   slug: hello-workflow
#   version_hash: <hash>
#   checkpoint_comment: <comment>
#
# Phase States:
#   gather: complete (facilitator: orchestrator)
#            └── outputs: 1 file(s)
#
# ═══════════════════════════════════════════════════════════
```

---

## Mode 1 Validation Checklist

| # | Pattern | Verified | Notes |
|---|---------|----------|-------|
| 1 | Clean slate removes .chainglass/ | [ ] | 01-clean-slate.sh |
| 2 | cg init creates structure | [ ] | workflows/ + runs/ |
| 3 | hello-workflow template hydrated | [ ] | current/wf.yaml exists |
| 4 | workflow.json auto-created | [ ] | Has slug, name, description |
| 5 | cg workflow list shows 0 checkpoints | [ ] | Before first checkpoint |
| 6 | First checkpoint creates v001-* | [ ] | .checkpoint.json has metadata |
| 7 | Duplicate detection (E035) | [ ] | Second checkpoint errors |
| 8 | Force creates v002-* | [ ] | --force overrides E035 |
| 9 | Version history newest-first | [ ] | v002 before v001 |
| 10 | Versioned run path | [ ] | runs/<slug>/<version>/run-* |
| 11 | wf-status.json has slug | [ ] | Non-empty string |
| 12 | wf-status.json has version_hash | [ ] | Matches checkpoint |
| 13 | Phase lifecycle works | [ ] | prepare → validate → finalize |
| 14 | Phase completes | [ ] | State: complete |

---

## Troubleshooting

### "Command not found: cg"
- Set up the alias: `alias cg='node /path/to/apps/cli/dist/cli.cjs'`
- Or use full path in scripts

### "Workflow not found" (E030)
- Check workflow slug matches exactly: `hello-workflow`
- Verify `.chainglass/workflows/hello-workflow/` exists

### "No checkpoints" (E034)
- Run `cg workflow checkpoint hello-workflow` first
- Verify `checkpoints/` directory has at least one version

### "Template unchanged" (E035)
- Make changes to `current/` before checkpoint
- Or use `--force` for intentional duplicate

### "Phase validation failed"
- Check output filename matches `wf-phase.yaml` requirements
- For hello-workflow: `outputs/response.md` (not `acknowledgment.md`)

### ".current-run not found"
- Run `./04-compose-run.sh` first
- Or manually: `cg workflow compose hello-workflow`

---

## Next Steps

After completing Mode 1 successfully:
1. Document any issues in the execution log
2. Proceed to **MODE-2-AGENT-VALIDATION.md** for the external agent test
