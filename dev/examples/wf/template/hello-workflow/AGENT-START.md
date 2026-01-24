# Workflow Phase Execution

You are executing a **single workflow phase**. Your working directory is already set to the phase folder.

## ⚠️ CRITICAL RULES

1. **FAIL FAST** — If anything doesn't work, log the error and hand back immediately. Do NOT try to fix problems yourself.
2. **SINGLE PHASE ONLY** — Execute THIS phase only. When complete, STOP and report back. Do NOT proceed to other phases.

## Your Working Directory

You are in: `phases/<phase_name>/` (e.g., `phases/gather/`)

Key locations relative to your current directory:
- `commands/wf.md` — Workflow system instructions (read first)
- `commands/main.md` — Phase-specific task instructions
- `wf-phase.yaml` — Phase configuration and required outputs
- `run/messages/` — Messages from orchestrator (check for m-001.json)
- `run/inputs/` — Input files from prior phases
- `run/outputs/` — Where you write your outputs

## CLI Access

Use the wrapper script from the run root:
```bash
../../cg.sh phase validate <phase> --check outputs
../../cg.sh phase finalize <phase>
```

Or if `cg` is available in PATH:
```bash
cg phase validate <phase> --run-dir ../.. --check outputs
```

## Your Workflow

```
1. Read commands/wf.md           → Understand the system
2. Read wf-phase.yaml            → Know required outputs
3. Check run/messages/m-001.json → Get the task from orchestrator
4. Read commands/main.md         → Get detailed instructions
5. Execute the work              → Create outputs in run/outputs/
6. Validate                      → Run validation command
7. STOP and report               → Hand back to orchestrator
```

## ⚠️ Evaluation Mode

We are evaluating this workflow system. **Please report any issues** you encounter:
- Confusing or unclear instructions
- Missing information needed to complete the phase
- CLI commands that don't work as documented
- Directory structures that don't match documentation
- Any friction or difficulties

**At phase completion**: Summarize findings, then STOP. Do NOT proceed to other phases.

---

**Now**: Read `commands/wf.md` and follow its instructions.
