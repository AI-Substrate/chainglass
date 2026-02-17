# Workshop: Node Starter & Resume Prompt Design

**Type**: CLI Flow + Integration Pattern
**Plan**: 033-real-agent-pods
**Spec**: [real-agent-pods-spec.md](../real-agent-pods-spec.md)
**Created**: 2026-02-16
**Status**: Draft

**Related Documents**:
- [Workshop 03: CLI-First Real Agent Execution](03-cli-first-real-agents.md) (Phase B design — prompt templates, AgentPod changes)
- [Workshop 02: Unified AgentInstance / AgentManagerService Design](02-unified-agent-design.md) (AgentPod wraps IAgentInstance)
- [Plan 034 Agent System Docs](../../how/agent-system/1-overview.md) (AgentInstance lifecycle)
- [Plan 030 Workshop 13: E2E Design](../../030-positional-orchestrator/workshops/13-phase-8-e2e-design.md) (testing patterns)
- [Legacy wf.md](../../../../dev/examples/wf/template/hello-workflow/wf.md) (prior art — phase execution instructions)
- `packages/positional-graph/src/features/030-orchestration/pod.agent.ts` (AgentPod implementation)
- `apps/cli/src/commands/positional-graph.command.ts` (CLI command definitions)

---

## Purpose

Define the exact content and behavior of the two system-supplied prompt files that teach agents the workflow protocol. These prompts are **agnostic to the actual node being run** — they don't contain the task. They explain the workflow system, list the CLI commands, and tell the agent where to find its real instructions. The agent reads its task-specific prompt via CLI.

## Key Questions Addressed

- Q1: What does the generic starter prompt contain? (protocol manual, not task)
- Q2: What does the generic resume prompt contain? (continuation protocol)
- Q3: What CLI commands does the agent need to know about?
- Q4: How does the agent discover its actual task prompt?
- Q5: What parameterization does AgentPod apply before sending the prompt?
- Q6: How does AgentPod decide between starter vs resume prompt?
- Q7: What fail-fast rules apply to WF errors vs regular work errors?
- Q8: How does the question protocol work from the agent's perspective?

---

## Design Principle: Protocol Manual, Not Task

The system prompt is a **protocol manual** — it teaches the agent HOW to operate in the workflow system. It does NOT contain the task itself.

```
┌──────────────────────────────────────────────────────────────┐
│ System provides:  node-starter-prompt.md                      │
│                                                               │
│   "You are in a workflow. Here are the CLI commands.          │
│    Read your task from: cg wf node get-input-data ..."       │
│                                                               │
│   Generic. Same for every agentic node.                       │
│   Parameterized only with graph/node IDs.                     │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│ Agent reads via CLI:                                          │
│                                                               │
│   $ cg wf node collate <graph> <nodeId>                      │
│   $ cg wf node get-input-data <graph> <nodeId> main-prompt   │
│                                                               │
│   Gets task-specific prompt from the work unit definition.    │
│   This is where the REAL instructions live.                   │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│ Agent does the work                                           │
│                                                               │
│   Uses regular tools (code, shell, files) for actual task.    │
│   Uses cg wf commands ONLY for WF-specific operations.       │
└──────────────────────────────────────────────────────────────┘
```

**Why agnostic?** The starter prompt is loaded once from disk and cached. It works for any agentic node — spec-writers, code generators, reviewers, anything. The work unit's prompt template defines the actual task. This separation means:
- System prompt changes don't require changes to any work unit
- Work unit authors don't need to repeat WF protocol instructions
- The protocol evolves independently from task definitions

---

## CLI Commands the Agent Needs

These are the commands agents use to interact with the workflow system. All commands use the `cg` binary relative to CWD (the worktree root).

### Lifecycle Commands

| Command | When | What It Does |
|---------|------|--------------|
| `cg wf node accept <graph> <nodeId>` | First thing | Acknowledge assignment. Transitions `starting → agent-accepted`. |
| `cg wf node end <graph> <nodeId> --message "..."` | When done | Complete the node. All outputs must be saved first. |
| `cg wf node error <graph> <nodeId> --code <code> --message "..."` | On WF error | Report unrecoverable error. Stops execution. |

### Data Commands

| Command | When | What It Does |
|---------|------|--------------|
| `cg wf node collate <graph> <nodeId>` | After accept | Show all resolved inputs as JSON. Overview of available data. |
| `cg wf node get-input-data <graph> <nodeId> <inputName>` | Reading task | Get a specific wired input by name. `main-prompt` is the task prompt. |
| `cg wf node save-output-data <graph> <nodeId> <outputName> <valueJson>` | Saving results | Save a JSON output value. Node must be in running state. |

### Question Commands

| Command | When | What It Does |
|---------|------|--------------|
| `cg wf node ask <graph> <nodeId> --type <type> --text "..."` | Need human input | Ask orchestrator a question. Returns `questionId`. **Agent must STOP after asking.** |
| `cg wf node get-answer <graph> <nodeId> <questionId>` | On resume | Check if a question has been answered. |

### Event Commands

| Command | When | What It Does |
|---------|------|--------------|
| `cg wf node raise-event <graph> <nodeId> <eventType>` | Special cases | Raise arbitrary events (e.g., `node:restart`). |

---

## node-starter-prompt.md

### Full Template

```markdown
# Workflow Agent Instructions

You are an agent operating within a structured workflow system. Your execution
is managed by an orchestrator. Follow these instructions precisely.

## Your Assignment

- **Graph**: {{graphSlug}}
- **Node**: {{nodeId}}
- **Work Unit**: {{unitSlug}}

## Step 1: Accept Your Assignment

Before doing anything else, accept your assignment:

```
cg wf node accept {{graphSlug}} {{nodeId}}
```

This tells the orchestrator you are alive and ready to work.

## Step 2: Read Your Task

Get an overview of all your available inputs:

```
cg wf node collate {{graphSlug}} {{nodeId}}
```

Read your task-specific instructions (the work unit's prompt):

```
cg wf node get-input-data {{graphSlug}} {{nodeId}} main-prompt
```

Read any additional inputs by name:

```
cg wf node get-input-data {{graphSlug}} {{nodeId}} <inputName>
```

Your task instructions and any data from upstream nodes are accessed
through these commands. Do not look for them elsewhere.

## Step 3: Do Your Work

Execute the task described in your instructions. Use your regular tools
(file editing, code generation, shell commands, etc.) for the actual work.
You are not limited to workflow commands — use whatever tools you need.

Only use `cg wf` commands for workflow-specific operations (reading inputs,
saving outputs, reporting status).

## Step 4: Save Your Results

For each output your task requires, save it:

```
cg wf node save-output-data {{graphSlug}} {{nodeId}} <outputName> '<jsonValue>'
```

Save all required outputs before completing.

## Step 5: Complete

When all outputs are saved:

```
cg wf node end {{graphSlug}} {{nodeId}} --message "Brief summary of what you did"
```

After completing, STOP. Do not continue working.

## Asking Questions

If you need clarification from a human before you can continue:

```
cg wf node ask {{graphSlug}} {{nodeId}} --type text --text "Your question here"
```

Question types: `text` (freeform), `single` (pick one), `multi` (pick many),
`confirm` (yes/no). For choice questions, add `--options opt1 opt2 opt3`.

**After asking a question, STOP IMMEDIATELY.** Do not continue working. Do not
guess the answer. You will be resumed later with the answer available.

## Error Handling

If you encounter an error **related to the workflow system** (missing inputs,
CLI failures, unclear instructions, contradictory requirements):

```
cg wf node error {{graphSlug}} {{nodeId}} --code ERROR_CODE --message "What went wrong"
```

**FAIL FAST on workflow errors.** Do not attempt workarounds. Do not retry.
Do not try to fix the system. Report the error and STOP.

If the error is in your **regular work** (a test fails, code doesn't compile,
a file is missing from the project), handle it normally as part of your task.
Only use the error command for workflow-system problems.

## Rules

1. **Accept first** — always accept before doing anything else
2. **Read via CLI** — get your task and inputs through the CLI commands above
3. **Save before ending** — all outputs must be saved before you call end
4. **Stop after asking** — do not continue past a question
5. **Fail fast on WF errors** — report and stop, do not guess or retry
6. **One node only** — you are executing this node only, not the whole graph
```

### Template Variables

| Variable | Source | Example |
|----------|--------|---------|
| `{{graphSlug}}` | `options.graphSlug` | `my-pipeline` |
| `{{nodeId}}` | `this.nodeId` | `spec-writer` |
| `{{unitSlug}}` | `this._unitSlug` | `generate-spec` |

These are the only parameterizations. The prompt is otherwise identical for every agentic node.

### Design Decisions

**D1: No task content in the system prompt**

The prompt tells the agent WHERE to find its task (`get-input-data ... main-prompt`), not WHAT the task is. The work unit's prompt template defines the actual task. This keeps the system prompt generic and cacheable.

**D2: Explicit CLI command syntax**

Every command is shown with full syntax including the graph/node ID placeholders already resolved. The agent doesn't need to figure out which arguments to pass — it copies and runs.

**D3: Two categories of errors**

WF errors (system problems) → fail fast, report via `cg wf node error`.
Work errors (task problems) → handle normally as part of the task.

This prevents agents from erroneously reporting a test failure as a workflow error, which would halt orchestration. It also prevents agents from silently working around a broken CLI command.

**D4: STOP after question and STOP after complete**

Both are explicit. Agents that continue past a question produce work without the answer. Agents that continue after completing may interfere with successor nodes. Both are hard stops.

**D5: `collate` before `get-input-data`**

`collate` gives the agent an overview of ALL available inputs. `get-input-data` reads a specific one. The agent reads collate first to discover what's available, then reads individual inputs. This mirrors how a human would approach an unfamiliar assignment.

**D6: No `cg wf node start` in the prompt**

The agent doesn't call `start` — ODS handles that. The agent calls `accept` (which is a shortcut for `raise-event node:accepted`). This is the two-phase handshake: ODS starts → agent accepts.

---

## node-resume-prompt.md

### Full Template

```markdown
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
```

### Design Decisions

**D7: Minimal resume prompt**

The resume prompt is short because the agent's conversation history already contains:
- The original starter prompt with all CLI commands
- Everything it did before pausing
- The question it asked (if any)

The resume prompt just says: "check for answers, continue, complete." It doesn't re-explain every CLI command.

**D8: No re-listing of all CLI commands**

The agent saw the full command reference in the starter prompt. Repeating it wastes context tokens. The resume prompt references only the commands the agent needs RIGHT NOW: `get-answer`, `save-output-data`, `end`.

**D9: Generic resumption**

The resume prompt doesn't say "you paused because you asked a question." The agent may have paused for other reasons in the future (error cleared, manual restart, timeout recovery). The prompt says "you paused" and lists what to check — generic enough for any resumption reason.

**D10: "Do not repeat work" is explicit**

Without this, agents tend to re-read all inputs and start over. With session resumption (Claude Code `--resume`), the full conversation history is available. The agent should pick up where it left off.

---

## AgentPod Prompt Selection Logic

### Decision: Starter vs Resume

```typescript
// In AgentPod.execute():
const isResume = this._agentInstance.sessionId !== null;
const template = isResume ? loadResumePrompt() : loadStarterPrompt();
const prompt = this.resolveTemplate(template, options);
```

| Condition | Prompt | Why |
|-----------|--------|-----|
| `sessionId === null` | Starter | First run. Agent has no history. Needs full protocol manual. |
| `sessionId !== null` | Resume | Agent was created via `getWithSessionId()` or has run before. Has history. Needs continuation instructions only. |

**Why `sessionId` is the discriminator**: When ODS creates an agent via `agentManager.getNew()`, sessionId is null — the agent hasn't run yet. When created via `agentManager.getWithSessionId()` (inheriting from upstream), or after a previous run updated the sessionId, it's non-null — the agent has context.

**Edge case**: A node inheriting a session from an upstream node gets the RESUME prompt, not the starter. This is correct — the inherited session contains the upstream agent's work, and the current agent continues from that context. The resume prompt tells it to check its history and continue.

### Template Resolution

```typescript
private resolveTemplate(template: string, options: PodExecuteOptions): string {
  return template
    .replaceAll('{{graphSlug}}', options.graphSlug)
    .replaceAll('{{nodeId}}', this.nodeId)
    .replaceAll('{{unitSlug}}', this._unitSlug);
}
```

Three placeholders. No other parameterization. The prompt is otherwise identical for every node.

### File Loading

```typescript
// Both prompts loaded from disk relative to the module directory
// No caching — reload each time for easier development iteration

function loadStarterPrompt(): string {
  const promptPath = resolve(getModuleDir(), 'node-starter-prompt.md');
  return readFileSync(promptPath, 'utf-8');
}

function loadResumePrompt(): string {
  const promptPath = resolve(getModuleDir(), 'node-resume-prompt.md');
  return readFileSync(promptPath, 'utf-8');
}
```

Both files live in `packages/positional-graph/src/features/030-orchestration/` alongside the current `node-starter-prompt.md`. No caching — prompts are small files and reloading on each call makes development iteration easier (edit the prompt, re-run without restart).

---

## Agent Lifecycle Walk-Throughs

### Scenario 1: Fresh Node, Simple Task

```
Agent receives starter prompt (parameterized):

  "Your Assignment: Graph my-pipeline, Node spec-writer, Unit generate-spec"

Agent executes:
  $ cg wf node accept my-pipeline spec-writer
  → "Node spec-writer accepted"

  $ cg wf node collate my-pipeline spec-writer
  → { "main-prompt": { "source": "unit:generate-spec", "type": "data" },
      "requirements": { "source": "node:get-spec", "output": "user_requirements" } }

  $ cg wf node get-input-data my-pipeline spec-writer main-prompt
  → "Write a detailed specification based on the user's requirements.
     Read the 'requirements' input for the raw requirements.
     Output: a JSON spec document as 'detailed_spec'."

  $ cg wf node get-input-data my-pipeline spec-writer requirements
  → "Build a todo app with tags and due dates"

  (Agent does work — writes spec using regular tools)

  $ cg wf node save-output-data my-pipeline spec-writer detailed_spec '{"title":"Todo App","sections":[...]}'
  → "Output saved: detailed_spec"

  $ cg wf node end my-pipeline spec-writer --message "Spec written for todo app"
  → "Node spec-writer completed"

  (Agent STOPS)
```

### Scenario 2: Agent Asks a Question

```
Agent receives starter prompt, accepts, reads task...

  (Agent realizes it needs clarification)

  $ cg wf node ask my-pipeline coder --type single \
      --text "Which testing framework should I use?" \
      --options jest vitest mocha
  → { "questionId": "q-001", "status": "waiting-question" }

  (Agent STOPS — does not continue)

  ... time passes, human answers via separate terminal ...
  $ cg wf node answer my-pipeline coder q-001 "vitest"

  ... orchestrator detects answer, resumes agent ...

Agent receives RESUME prompt:

  "You are resuming work on node coder in graph my-pipeline."

Agent executes:
  $ cg wf node get-answer my-pipeline coder q-001
  → { "answered": true, "answer": "vitest" }

  (Agent continues work with the answer — uses vitest)

  $ cg wf node save-output-data my-pipeline coder implementation '{"files":["src/app.ts","tests/app.test.ts"]}'
  $ cg wf node end my-pipeline coder --message "Implemented with vitest"
  (Agent STOPS)
```

### Scenario 3: WF Error (Fail Fast)

```
Agent receives starter prompt, accepts...

  $ cg wf node get-input-data my-pipeline analyzer requirements
  → Error: E178 - Source node 'get-spec' not complete or wiring error

  (This is a WF error — input wiring is broken. Agent does NOT try to fix it.)

  $ cg wf node error my-pipeline analyzer \
      --code INPUT_WIRING_ERROR \
      --message "Cannot read input 'requirements': source node not complete (E178)"

  (Agent STOPS)
```

### Scenario 4: Work Error (Handle Normally)

```
Agent receives starter prompt, accepts, reads task...

  (Agent is coding and a test fails)

  $ npx vitest run
  → FAIL: 2 tests failed

  (This is a WORK error, not a WF error. Agent handles it normally.)

  (Agent fixes the code, re-runs tests, they pass)

  $ cg wf node save-output-data my-pipeline coder result '{"tests_passing": true}'
  $ cg wf node end my-pipeline coder --message "Implementation complete, all tests pass"
```

### Scenario 5: Session Inheritance (Resume Prompt)

```
Node A (spec-writer) completes with sessionId 'ses-001'.
Node B (reviewer) inherits session from A.

ODS creates: agentManager.getWithSessionId('ses-001', { name: 'my-pipeline/reviewer', ... })
→ AgentInstance has sessionId 'ses-001' (non-null)
→ AgentPod selects RESUME prompt (not starter)

Agent receives resume prompt:

  "You are resuming work on node reviewer in graph my-pipeline.
   Check your conversation history..."

The agent's conversation history (from Claude Code --resume ses-001)
contains everything spec-writer did. The reviewer reads that context
and continues with its own task:

  $ cg wf node accept my-pipeline reviewer
  $ cg wf node collate my-pipeline reviewer
  $ cg wf node get-input-data my-pipeline reviewer main-prompt
  → "Review the specification produced by the upstream node.
     Output 'approved' or 'needs-changes' as 'review_decision'."

  (Agent reviews, using context from inherited session)

  $ cg wf node save-output-data my-pipeline reviewer review_decision '"approved"'
  $ cg wf node end my-pipeline reviewer --message "Spec approved"
```

**Note**: The inherited agent still calls `accept` and reads its own inputs — the resume prompt doesn't skip these steps. The agent needs to discover ITS task (which differs from the upstream node's task), even though it has the upstream node's conversation context.

**Wait — should the inherited agent get the STARTER prompt instead?**

This is a design question. Two options:

**Option A: Resume prompt for inherited sessions** (current design)
- Pro: Agent has conversation context, resume prompt is shorter
- Con: Agent doesn't see the full CLI command reference

**Option B: Starter prompt always for first run of THIS node**
- Pro: Agent gets full protocol manual
- Con: Redundant if session already contains it

**Recommendation: Option B** — use the starter prompt for the first execution of any node, regardless of session inheritance. The `isResume` check should be based on whether THIS POD has run before, not whether the instance has a sessionId.

---

## Revised Prompt Selection Logic

```typescript
// In AgentPod
private _hasExecuted = false;

async execute(options: PodExecuteOptions): Promise<PodExecuteResult> {
  const template = this._hasExecuted ? loadResumePrompt() : loadStarterPrompt();
  const prompt = this.resolveTemplate(template, options);

  this._hasExecuted = true;

  const result = await this._agentInstance.run({
    prompt,
    cwd: options.ctx.worktreePath,
  });
  return this.mapAgentResult(result);
}
```

| Condition | Prompt | Why |
|-----------|--------|-----|
| Pod's first `execute()` call | Starter | Node hasn't run yet. Full protocol manual needed — even if session inherited. |
| Pod's subsequent `execute()` calls | Resume | Agent paused (question, error). Has history. Needs continuation only. |

This means:
- Fresh node → starter prompt ✅
- Inherited session, first run of this node → starter prompt ✅ (agent needs to know ITS task)
- Same node resuming after question → resume prompt ✅
- Same node resuming after error clear → resume prompt ✅

---

## Comparison with Legacy wf.md

The legacy `wf.md` (133 lines) used a different model:

| Aspect | Legacy wf.md | New node-starter-prompt.md |
|--------|-------------|---------------------------|
| Task source | `commands/main.md` file on disk | `cg wf node get-input-data ... main-prompt` via CLI |
| Input source | `run/inputs/` directory | `cg wf node collate` + `get-input-data` via CLI |
| Output target | `run/outputs/` directory | `cg wf node save-output-data` via CLI |
| Validation | `cg.sh phase validate` | Implicit (orchestrator validates on `end`) |
| Finalization | `cg.sh phase finalize` | `cg wf node end` (single step) |
| Binary path | `../../cg.sh` (relative) | `cg` (in PATH) |
| Phase scoping | "Execute ONE phase only" | "You are executing this node only" |
| Fail-fast | Explicit policy section | Explicit, with WF vs work error distinction |

**Key improvement**: Everything goes through CLI commands. The agent doesn't read files from magic directories or run validation scripts. The CLI is the single interface between agent and workflow system.

---

## Error Codes for Agents

When agents call `cg wf node error`, they should use descriptive error codes. The system doesn't enforce a specific set, but these are recommended:

| Error Code | When | Example |
|------------|------|---------|
| `INPUT_WIRING_ERROR` | Cannot read an expected input | E178 from get-input-data |
| `INPUT_MISSING` | Input exists but has no data | collate shows input but get-input-data returns empty |
| `CLI_FAILURE` | A cg wf command failed unexpectedly | Command returned non-zero exit code |
| `INSTRUCTIONS_UNCLEAR` | Cannot understand the task prompt | main-prompt is contradictory or incomplete |
| `OUTPUT_SCHEMA_ERROR` | Cannot produce output in required format | Output schema validation would fail |
| `ACCEPT_FAILED` | Accept command failed | Node not in starting state |

**Agents should NOT use error codes for work problems** (test failures, compilation errors, missing project files). Those are handled as part of the task.

---

## Testing the Prompts

### Unit Test: Template Resolution

```typescript
it('resolves all template variables', () => {
  const template = '{{graphSlug}} / {{nodeId}} / {{unitSlug}}';
  const result = pod.resolveTemplate(template, {
    graphSlug: 'my-graph',
    // nodeId comes from pod constructor
    // unitSlug comes from pod constructor
  });
  expect(result).toBe('my-graph / test-node / test-unit');
  expect(result).not.toContain('{{');
});
```

### Unit Test: Starter vs Resume Selection

```typescript
it('uses starter prompt on first execute', async () => {
  await pod.execute(options);
  expect(loadStarterPromptSpy).toHaveBeenCalled();
  expect(loadResumePromptSpy).not.toHaveBeenCalled();
});

it('uses resume prompt on second execute', async () => {
  await pod.execute(options);  // first
  await pod.execute(options);  // second (resume)
  expect(loadResumePromptSpy).toHaveBeenCalledTimes(1);
});

it('uses starter prompt even with inherited session', async () => {
  // Pod created with instance that has sessionId (inherited)
  const instance = manager.getWithSessionId('ses-001', params);
  const pod = new AgentPod('test-node', instance, 'test-unit');
  await pod.execute(options);
  expect(loadStarterPromptSpy).toHaveBeenCalled();  // starter, not resume
});
```

### Real Agent Test: Agent Follows Protocol

```typescript
describe.skip('Agent follows starter prompt protocol', { timeout: 120_000 }, () => {
  it('agent accepts, reads inputs, saves output, completes', async () => {
    // Setup: 1-node graph with simple task prompt
    // Run: orchestration loop with real Claude Code
    // Assert: node status = complete, output exists
    // Assert: events include node:accepted
  });
});
```

---

## File Locations

```
packages/positional-graph/src/features/030-orchestration/
├── node-starter-prompt.md     ← REPLACE existing 24-line placeholder
├── node-resume-prompt.md      ← NEW
├── pod.agent.ts               ← UPDATE (prompt selection logic, resolveTemplate)
└── ...
```

Both `.md` files are loaded from disk at runtime via `readFileSync` (existing pattern). They are cached after first read.

---

## Open Questions

### Q1: Should `collate` output be human-readable or JSON?

**OPEN**: The starter prompt tells agents to call `collate`. If the output is raw JSON, agents parse it fine. If it's a formatted table, it's more readable but harder to parse programmatically. Current `collate` output is JSON.

**Recommendation**: Keep JSON. Agents handle JSON natively. Add a note in the prompt that the output is JSON.

### Q2: What if `main-prompt` input doesn't exist?

**OPEN**: Not all work units may have a `main-prompt` input. Options:
- A: Require all agentic work units to have `main-prompt` input (convention)
- B: Agent checks `collate` output first, reads whatever inputs are listed
- C: Fall back to work unit description if no `main-prompt`

**Recommendation**: Option A — enforce by convention. The starter prompt says "read your task-specific instructions" and points to `main-prompt`. If a work unit doesn't have one, that's a WF error.

### Q3: Should the resume prompt include the questionId?

**OPEN**: When an agent resumes after a question, it needs the questionId to call `get-answer`. The questionId was returned when it called `ask`. Options:
- A: Agent finds it in conversation history (current design)
- B: AgentPod includes it in the resume prompt as a parameter
- C: Agent calls a hypothetical `cg wf node get-pending-questions` to discover them

**Recommendation**: Option A for now. The agent's conversation history contains the `ask` command output with the questionId. If this proves unreliable in practice, add Option C later.

### Q4: CLI binary name — `cg` or `ppm`?

**RESOLVED**: The CLI binary is `cg` (and `chainglass`). The original task mentioned `ppm` but that is outdated. The `package.json` bin field confirms: `"cg": "./dist/cli.cjs"`. All prompts use `cg`.

---

## Quick Reference

```
STARTER PROMPT (first run of any node):
  - Full protocol manual
  - All CLI commands with syntax
  - Tells agent WHERE to find its task (get-input-data main-prompt)
  - 3 placeholders: {{graphSlug}}, {{nodeId}}, {{unitSlug}}

RESUME PROMPT (subsequent runs of same node):
  - Minimal continuation instructions
  - Check for answers, continue, complete
  - Same 2 placeholders: {{graphSlug}}, {{nodeId}}

PROMPT SELECTION:
  - Pod's first execute() → starter
  - Pod's subsequent execute() → resume
  - Inherited session, first run of THIS node → starter (not resume!)

FAIL-FAST RULE:
  - WF errors (CLI failures, missing inputs) → cg wf node error → STOP
  - Work errors (test failures, code bugs) → handle normally

AGENT WORKFLOW:
  accept → collate → get-input-data → [do work] → save-output-data → end → STOP
```
