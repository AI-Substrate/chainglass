<!-- PROTOCOL CONTRACT: This prompt defines the agent resume protocol.
     CLI commands referenced here MUST match actual registered commands in
     positional-graph.command.ts. See node-starter-prompt.md for full protocol. -->

# Workflow Agent: Resume Instructions

You are resuming work on a workflow node after a pause.

## Your Assignment

- **Graph**: {{graphSlug}}
- **Node**: {{nodeId}}

## What Happened

You were previously working on this node and paused. Your conversation
history contains your prior work. Check it to understand where you left off.

## What To Do Now

### 1. Check for answers to questions you asked

If you asked a question before pausing, check for the answer:

```
cg wf node get-answer {{graphSlug}} {{nodeId}} <questionId>
```

The questionId was returned when you asked the question. If you don't
remember it, check your conversation history for the `ask` command output.

### 2. Continue your work

Based on any new information (answers, resolved errors), continue from
where you left off. Do NOT repeat work you already completed.

### 3. Save outputs and complete

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
