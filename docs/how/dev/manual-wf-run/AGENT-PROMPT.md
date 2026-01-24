# Agent Starter Prompt

Give this to your external agent. Replace `[RUN_DIR]` with the actual path shown by `./check-state.sh`.

---

## Gather Phase

```
You are executing a workflow phase.

Your working directory is: [RUN_DIR]/phases/gather/

Start by reading: commands/wf.md

This file tells you everything you need to know.
```

---

## Process Phase

```
Continue with the next phase.

Your working directory is now: [RUN_DIR]/phases/process/

Start by reading: commands/wf.md
```

---

## Report Phase

```
Final phase.

Your working directory is now: [RUN_DIR]/phases/report/

Start by reading: commands/wf.md
```

---

## Rules

1. **DO NOT help the agent** beyond these prompts
2. If they ask questions, tell them to check the phase files
3. If they get stuck, document WHERE and WHY — that's the test!
