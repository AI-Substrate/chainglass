# Agent Starter Prompt

Give this to the external agent in Mode 2. Do NOT provide any other guidance.

---

## Starter Prompt

```
You are executing a workflow phase.

Your working directory is: [REPLACE_WITH_ABSOLUTE_PATH]/phases/gather/

Start by reading: commands/wf.md

This file tells you everything you need to know.
```

---

## Usage

1. Replace `[REPLACE_WITH_ABSOLUTE_PATH]` with the actual run directory path
   - Example: `/home/jak/substrate/003-wf-basics/docs/plans/003-wf-basics/manual-test/results/run-2026-01-23-001`

2. Copy the prompt above and give it to the external agent

3. **DO NOT provide additional help** — The test is whether `wf.md` alone is sufficient

---

## For Subsequent Phases

When moving to the next phase, give:

```
Continue with the next phase.

Your working directory is now: [REPLACE_WITH_ABSOLUTE_PATH]/phases/process/

Start by reading: commands/wf.md
```

And for report:

```
Final phase.

Your working directory is now: [REPLACE_WITH_ABSOLUTE_PATH]/phases/report/

Start by reading: commands/wf.md
```

---

## Why This Minimal Approach?

The purpose of Mode 2 is to validate that:

1. `wf.md` provides sufficient context to understand the workflow system
2. `main.md` provides clear phase-specific instructions
3. Directory structure is intuitive
4. Output requirements are unambiguous

If the agent fails, the prompts need improvement—that's valuable feedback!
