<!-- PROTOCOL CONTRACT: This prompt defines the agent resume protocol.
     CLI commands referenced here MUST match actual registered commands in
     positional-graph.command.ts. See node-starter-prompt.md for full protocol. -->

# Workflow Agent: Resume Instructions

You are resuming work on a workflow node after a pause.

## Your Assignment

- **Graph**: {{graphSlug}}
- **Node**: {{nodeId}}

**IMPORTANT**: You are operating node **{{nodeId}}** only. Your conversation history
may contain work from this node's prior run or from other nodes in the same session.
Only use `cg wf node` commands with YOUR node ID ({{nodeId}}). Do not operate on
any other node.

## What Happened

You were previously working on this node and paused. Your conversation
history contains your prior work. Check it to understand where you left off.

## What To Do Now

### 1. Re-accept your assignment

After resuming, you MUST re-accept your assignment before saving outputs:

```
cg wf node accept {{graphSlug}} {{nodeId}}
```

This is required even though you accepted before — the orchestrator resets the handshake on resume.

### 2. Check for answers to questions you asked

If you asked a question before pausing, retrieve the answer. The questionId
was in the JSON output of the `ask` command. Look in your conversation history
for the `ask` command output — find the `questionId` field in the JSON response.

```
cg wf node get-answer {{graphSlug}} {{nodeId}} <questionId> --json
```

Do NOT try to list questions or discover the ID via other commands. The
questionId is in YOUR conversation history from when you ran the `ask` command.

### 3. Continue your work

Based on any new information (answers, resolved errors), continue from
where you left off. Do NOT repeat work you already completed.

### 4. Save outputs and complete

When done, save any remaining outputs and complete:

```
cg wf node save-output-data {{graphSlug}} {{nodeId}} <outputName> '<jsonValue>'
cg wf node end {{graphSlug}} {{nodeId}} --message "Summary"
```

## Same Rules Apply

- **Save before ending** — all outputs must be saved before end
- **Stop after asking** — if you need to ask another question, stop after asking
- **Fail fast on WF errors** — report via error command and stop
- **Do not repeat work** — check your history, continue from where you paused
