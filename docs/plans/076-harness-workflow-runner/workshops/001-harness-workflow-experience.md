# Workshop: The Harness Workflow Experience

**Type**: CLI Flow
**Plan**: 076-harness-workflow-runner
**Spec**: [harness-workflow-runner-spec.md](../harness-workflow-runner-spec.md)
**Created**: 2026-03-16
**Status**: Draft

**Related Documents**:
- [Harness README](../../../harness/README.md)
- [harness.md (project rules)](../../../docs/project-rules/harness.md)
- [ADR-0014 — First-Class Agentic Development Harness](../../../docs/adr/adr-0014-first-class-agentic-development-harness.md)
- [Research Dossier](../research-dossier.md)

**Domain Context**:
- **Primary Domain**: _(none — harness is external tooling per ADR-0014)_
- **Consumed Domains**: `_platform/positional-graph`, `agents`, `_platform/events`, `workflow-events`

---

## Purpose

This workshop defines the **experience** of using the harness for workflow execution — not the implementation, but the feeling. What does it feel like to sit down, type a command, and watch a workflow run? What should the agent see? What should a human see? How does the harness make it trivially easy to run, observe, debug, and iterate on workflows?

The harness is not a testing tool. It is an **experience engine**. It creates the conditions where a developer (human or AI) can confidently say: "I know this works because I watched it work."

## Key Questions Addressed

- What is the harness vibe and how does workflow running fit into it?
- What does the ideal workflow debugging session look like, command by command?
- What information density does each command provide?
- How does the harness make the orchestration system feel approachable and observable?
- What does "easy" mean in the context of an agent running a workflow?

---

## The Harness Vibe

### What the Harness IS

The harness is a **guide and a toolkit**. It doesn't do the work FOR the agent — it shows the agent HOW to do the work, gives it the tools to do it well, and provides the tight feedback loops that make iteration fast. The harness says: "Here are the commands you need. Here's what to look at. Here's how to tell if it's working. Now go."

Think of it like a workshop with labelled tools on a pegboard, a workbench with good lighting, and a checklist on the wall. The harness doesn't build the cabinet for you — but it makes sure you have sharp tools, can see what you're doing, and know when you've cut something wrong.

The harness philosophy has four pillars:

**1. Guide, don't automate away.** The harness provides the commands and the telemetry. The agent decides what to run, reads the output, diagnoses problems, and fixes them. The harness makes that cycle fast — not automatic. An agent that uses the harness learns how the system works, because the harness shows it the internals at every step.

**2. High-fidelity, short feedback loops.** Every command gives back structured, actionable information. Not "it failed" — but "node X is stuck at 'starting' because pod.execute() threw ENOENT at iteration 7." The agent reads that, knows exactly what to fix, fixes it, and re-runs. Seconds to check, not minutes to debug.

**3. Boot with one command.** `just harness dev` and you're ready. Ports auto-allocate. Auth is bypassed. The container handles its own health. You don't think about infrastructure — you think about what you're building.

**4. Honest feedback loops.** The harness asks "how was that?" Every agent writes a retrospective. Every rough edge becomes a fix task. The harness gets better because the things that use it tell it how to get better.

### What the Harness is NOT

- Not a test framework (Vitest/Playwright handle that)
- Not a CI pipeline (GitHub Actions handles that)
- Not a monitoring system (it's for development, not production)
- Not part of the product (it's external tooling — no domain, no registry entry)

### The Vibe in One Sentence

> The harness is a patient, structured, honest toolkit that makes invisible things visible — and makes the agent the one who acts on what it sees.

---

## Where Workflow Running Fits

The harness already does many things:

```
Capability Map:

┌─────────────────────────────────────────────────────────────────┐
│                     THE HARNESS                                 │
│                                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │
│  │ Health   │  │ Visual   │  │ Agent    │  │  Test Data   │   │
│  │          │  │          │  │          │  │              │   │
│  │ doctor   │  │ screen-  │  │ agent    │  │ test-data    │   │
│  │ health   │  │   shot   │  │   run    │  │   create     │   │
│  │ ports    │  │ console  │  │   tail   │  │   clean      │   │
│  │          │  │   -logs  │  │   list   │  │   status     │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────┘   │
│                                                                 │
│  ┌──────────┐  ┌──────────┐                                    │
│  │ Infra    │  │ Testing  │  ┌──────────────────────────────┐  │
│  │          │  │          │  │                              │  │
│  │ dev      │  │ test     │  │  ★ WORKFLOW EXECUTION ★     │  │
│  │ stop     │  │ results  │  │     (Plan 076)               │  │
│  │ build    │  │ seed     │  │                              │  │
│  │          │  │          │  │  run · status · logs · reset │  │
│  └──────────┘  └──────────┘  └──────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

Workflow execution is **one more thing the harness can do**, not a separate system. It follows the same patterns: structured JSON output, one-command simplicity, honest feedback about what happened.

The existing `test-data` commands already handle the data lifecycle (create units, create template, create workflow, clean, status). Workflow execution extends this with the **doing** part — actually running the orchestration engine and letting you watch.

---

## The Ideal Workflow Session

### Scenario: An Agent Implementing a Workflow Feature

The agent has just made changes to the orchestration system and needs to verify they work. Here's what the experience looks like:

```
┌──────────────────────────────────────────────────────────────────┐
│ STEP 1: SETUP                                                    │
│                                                                  │
│ $ just harness workflow reset                                    │
│                                                                  │
│ {                                                                │
│   "command": "workflow.reset",                                   │
│   "status": "ok",                                                │
│   "data": {                                                      │
│     "cleaned": true,                                             │
│     "created": {                                                 │
│       "units": ["test-agent", "test-code", "test-user-input"],   │
│       "template": "test-workflow-tpl",                           │
│       "workflow": "test-workflow"                                 │
│     }                                                            │
│   }                                                              │
│ }                                                                │
│                                                                  │
│ One command. Clean slate. Fresh test workflow ready.              │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│ STEP 2: RUN                                                      │
│                                                                  │
│ $ just harness workflow run                                      │
│                                                                  │
│ {                                                                │
│   "command": "workflow.run",                                     │
│   "status": "ok",                                                │
│   "data": {                                                      │
│     "workflow": "test-workflow",                                 │
│     "exitReason": "complete",                                    │
│     "iterations": 14,                                            │
│     "duration": "42.3s",                                         │
│     "nodes": {                                                   │
│       "human-input-a1b": "complete",                             │
│       "spec-builder-fa0": "complete",                            │
│       "coder-5ec": "complete",                                   │
│       "reviewer-881": "complete"                                 │
│     },                                                           │
│     "assertions": {                                              │
│       "passed": 12,                                              │
│       "failed": 0,                                               │
│       "total": 12                                                │
│     }                                                            │
│   }                                                              │
│ }                                                                │
│                                                                  │
│ The workflow ran. Every node completed. All assertions passed.   │
│ The agent knows it works without reading logs, without opening   │
│ a browser, without interpreting stdout.                          │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│ STEP 3 (only if something broke): DIAGNOSE                       │
│                                                                  │
│ $ just harness workflow status                                   │
│                                                                  │
│ {                                                                │
│   "command": "workflow.status",                                  │
│   "status": "ok",                                                │
│   "data": {                                                      │
│     "workflow": "test-workflow",                                 │
│     "graphStatus": "running",                                    │
│     "iteration": 7,                                              │
│     "nodes": [                                                   │
│       { "id": "human-input-a1b", "status": "complete",           │
│         "duration": "0.1s" },                                    │
│       { "id": "spec-builder-fa0", "status": "complete",          │
│         "sessionId": "ses_abc123", "duration": "8.2s" },         │
│       { "id": "coder-5ec", "status": "starting",                │
│         "pod": "agent", "adapter": "copilot-sdk",                │
│         "waitingFor": "pod.execute()" },                         │
│       { "id": "reviewer-881", "status": "ready",                │
│         "blockedBy": ["coder-5ec"] }                             │
│     ],                                                           │
│     "lastAction": {                                              │
│       "type": "start-node",                                      │
│       "nodeId": "coder-5ec",                                     │
│       "iteration": 7                                             │
│     }                                                            │
│   }                                                              │
│ }                                                                │
│                                                                  │
│ The agent can see EXACTLY where it's stuck. Node "coder-5ec"     │
│ is in "starting" state, waiting for pod.execute() to return.     │
│ The agent knows it's a pod execution problem, not an ONBAS       │
│ problem, not a graph wiring problem.                             │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│ STEP 4 (if needed): LOGS                                         │
│                                                                  │
│ $ just harness workflow logs                                     │
│                                                                  │
│ {                                                                │
│   "command": "workflow.logs",                                    │
│   "status": "ok",                                                │
│   "data": {                                                      │
│     "events": [                                                  │
│       { "iteration": 1, "type": "status",                        │
│         "message": "Graph: 4 nodes, 0 complete" },               │
│       { "iteration": 2, "type": "idle",                          │
│         "message": "Waiting for human-input completion" },        │
│       { "iteration": 5, "type": "iteration",                     │
│         "action": "start-node", "nodeId": "spec-builder-fa0" },  │
│       { "iteration": 7, "type": "iteration",                     │
│         "action": "start-node", "nodeId": "coder-5ec" },         │
│       { "iteration": 7, "type": "error",                         │
│         "message": "[ODS] Pod execution failed for coder-5ec:    │
│          ENOENT: no such file or directory" }                     │
│     ]                                                            │
│   }                                                              │
│ }                                                                │
│                                                                  │
│ There it is. The exact error. The exact iteration. The exact     │
│ node. The agent can now fix the bug and re-run.                  │
└──────────────────────────────────────────────────────────────────┘
```

### The Key Insight

Notice what the agent DIDN'T have to do:

- Open a browser
- Read server terminal output manually
- Parse unstructured console logs
- Understand the internals of ONBAS/ODS/PodManager
- Know which file to look at for state
- Remember which port the dev server is on
- Set up test data manually

The harness did all of that. The agent typed 1-3 commands and got structured answers.

---

## Command Design: The Experience of Each Command

### `just harness workflow reset`

**Vibe**: "Give me a clean slate."

This is the "I don't care what state things are in, make it fresh" command. It:
1. Cleans any existing test workflow data (units, template, workflow)
2. Creates fresh test data from scratch
3. Returns what it created

**Why it's one command**: An agent shouldn't need to remember "clean first, then create units, then create template, then instantiate." That's 4 commands. The harness should collapse complexity into intent. "Reset" IS the intent.

```bash
$ just harness workflow reset

# Equivalent to:
#   just test-data clean
#   just test-data create env
# But semantically: "I want a fresh workflow to run."
```

**Output**: `{created: {units, template, workflow}}` — the agent knows exactly what was set up.

### `just harness workflow run`

**Vibe**: "Run the workflow and tell me if it worked."

This is the core experience. The command should:
1. Ensure test data exists (auto-reset if missing)
2. Execute the workflow through the real orchestration engine
3. Collect per-iteration telemetry (DriveEvent callbacks)
4. Wait for completion (or timeout)
5. Run assertions against the result
6. Return a structured pass/fail with details

**Information density**: The default output shows the result. Not a stream of logs. The agent gets "it worked" or "it failed at node X on iteration Y because Z."

**Timeout**: Workflows can take minutes with real agents. Default 10 minutes, configurable with `--timeout`.

```bash
# Simple: did it work?
$ just harness workflow run

# Verbose: show me everything as it happens
$ just harness workflow run --verbose

# Quick: skip real agents, use mocks
$ just harness workflow run --dry-run
```

### `just harness workflow status`

**Vibe**: "What's happening right now?"

This is the observability command. Use it mid-execution or after failure. Shows:
- Per-node status with human-readable descriptions
- What ONBAS decided last
- Which pods are active
- How many iterations have elapsed
- What's blocking forward progress

**Why this matters**: When a workflow is stuck, the first question is always "where?" This command answers that instantly. Not "search through logs" — just "ask the harness."

```bash
$ just harness workflow status

# The answer to "what's happening?" should always be
# one command away. Not a debugging session. One command.
```

### `just harness workflow logs`

**Vibe**: "Show me the story of what happened."

This is the forensics command. It reconstructs the execution timeline:
- Every DriveEvent in order
- What ONBAS decided at each iteration
- What ODS dispatched
- Pod creation and execution results
- Errors with full context

**Difference from `status`**: Status is "what's happening NOW." Logs is "what happened OVER TIME." Status is for live debugging. Logs is for post-mortem.

```bash
$ just harness workflow logs

# Show only errors:
$ just harness workflow logs --errors

# Show only a specific node's lifecycle:
$ just harness workflow logs --node spec-builder-fa0
```

---

## The Agent Perspective

### What Makes It "Easy" for an Agent?

Easy doesn't mean "do it for me." Easy means: **I can see what's happening, I know what to try next, and I can check if my fix worked in seconds.**

An agent implementing a workflow feature needs a tight loop:
1. Make a change
2. Check if it works (high fidelity — not just "tests pass," but "actually works")
3. If broken, see exactly WHERE and WHY
4. Fix it
5. Check again

The harness provides the tools for steps 2 and 3. The agent does steps 1, 4, and 5. The harness doesn't need to understand the agent's code — it just needs to show the agent what the orchestration system is doing.

```bash
# Step 2: "Did my change work?"
just harness workflow run

# Step 3: "Where did it break?"
just harness workflow status     # → node X stuck at starting
just harness workflow logs       # → ENOENT at iteration 7

# Step 5: "Did my fix work?"
just harness workflow reset && just harness workflow run
```

The agent learns the system by using it through the harness. Each `status` response teaches it about node lifecycles. Each `logs` response teaches it about the drive loop. The harness is a **teaching tool** as much as a validation tool — the structured output IS the documentation.

### The Debugging Escalation

When things break, the harness provides **progressive disclosure**:

```
Level 1: just harness workflow run
  → "Failed: node coder-5ec stuck at starting"
  → Agent now knows WHICH node failed

Level 2: just harness workflow status
  → Shows node states, pod info, last ONBAS decision
  → Agent now knows WHERE in the lifecycle it failed

Level 3: just harness workflow logs
  → Full event timeline with errors
  → Agent now knows WHY it failed

Level 4: just harness workflow logs --node coder-5ec
  → Everything about that specific node
  → Agent can fix the specific issue
```

Each level adds detail without overwhelming. Level 1 is usually enough. Level 4 is forensic.

### What the Agent Does After Failure

```
1. Read the failure message
2. Fix the code
3. just harness workflow reset && just harness workflow run
4. Check if it passes now
5. Repeat until green
```

This is the loop. The harness doesn't fix things — the agent fixes things. The harness makes the fixing FAST by giving the agent exactly the information it needs, exactly when it needs it, in a format it can parse and act on.

---

## Design Decisions

### D1: Aggregate by Default, Verbose on Request

**Decision**: `workflow run` returns a summary. `--verbose` streams events.

**Why**: An agent running 10 workflows doesn't want 10 pages of drive events. It wants 10 pass/fail results. But when debugging, it wants everything.

### D2: Auto-Reset on Missing Data

**Decision**: `workflow run` checks if test data exists and creates it if missing.

**Why**: The agent shouldn't fail because it forgot to run `reset` first. The harness should be forgiving. If the workflow doesn't exist, create it. If units are missing, create them. Only fail on actual execution problems, not setup problems.

### D3: Assertions Built In

**Decision**: `workflow run` includes built-in assertions (nodes complete, outputs exist, session chains valid).

**Why**: The agent shouldn't need to write its own checks. The harness knows what a successful workflow looks like. It checks for you and tells you if anything is wrong. Same 23 assertions that `test-advanced-pipeline.ts` uses.

### D4: Same Graph Topology as test-pipeline

**Decision**: The test workflow uses the same structure as `scripts/test-advanced-pipeline.ts`.

**Why**: This graph is proven. It exercises parallel fan-out, Q&A, session chains, and context inheritance. If the harness workflow passes, you know the orchestration engine works for real use cases, not toy examples.

### D5: CG CLI for Workflow Operations, Harness for Everything Else

**Decision**: Workflow manipulation (`run`, `stop`, `status`) goes through `cg` CLI. Test data setup and orchestration goes through harness commands.

**Why**: Dogfooding. The `cg` CLI is the product. If `cg wf run` doesn't work, we need to know. The harness wraps it and adds structure, but the product does the work.

### D6: No Container Required for Basic Use

**Decision**: `workflow run` works against the local dev server, not just the Docker container.

**Why**: Most workflow debugging doesn't need a container. The agent is running on the host. The dev server is running on the host. The harness should work wherever the developer is, not force them into Docker for simple validation.

---

## Existing Commands and How They Relate

### What Already Exists (Plan 074 Phase 6)

```
just test-data create env     # Creates units + template + workflow
just test-data clean          # Deletes everything
just test-data status         # Shows what exists
just test-data run            # Runs via `cg wf run`
just test-data stop           # Stops via `cg wf stop`
```

These are the **primitives**. They work. They're fine for manual use. But they're not the experience.

### What Plan 076 Adds

```
just harness workflow reset   # clean + create env (one step)
just harness workflow run     # run + observe + assert (one step)
just harness workflow status  # detailed node-level status
just harness workflow logs    # execution timeline with events
```

These are the **experience layer**. They compose the primitives into intents. "Reset" means "give me a clean slate." "Run" means "execute and tell me if it worked." The experience layer is what makes the harness pleasant to use.

### The Relationship

```
Experience Layer (Plan 076):
  workflow reset  →  calls test-data clean + create env
  workflow run    →  calls test-data run + collects telemetry + asserts
  workflow status →  calls cg wf show --detailed
  workflow logs   →  reads captured drive events

Primitive Layer (Plan 074 Phase 6):
  test-data create env  →  calls cg unit create, cg template save-from, etc.
  test-data run         →  calls cg wf run
  test-data clean       →  calls cg unit delete, cg wf delete, etc.

Product Layer (CG CLI):
  cg wf run     →  OrchestrationService.get() → handle.drive()
  cg wf show    →  IPositionalGraphService.getStatus()
  cg unit create →  IWorkUnitService.create()
```

Three layers, clear boundaries, each adds value.

---

## Quick Reference

```bash
# === WORKFLOW LIFECYCLE ===

# Fresh start (clean + create test data)
just harness workflow reset

# Run the test workflow and check results
just harness workflow run

# Check current execution status (node-level detail)
just harness workflow status

# View execution history and drive events
just harness workflow logs

# View logs for a specific node
just harness workflow logs --node <nodeId>

# Run with verbose streaming output
just harness workflow run --verbose

# Run with custom timeout (default 10 min)
just harness workflow run --timeout 600
```

---

## Open Questions

### Q1: Should `workflow run` block until completion or return immediately?

**RESOLVED**: Block until completion (with timeout). This matches the harness vibe — you ask a question, you get an answer. Not "I started it, go check later." The agent wants to know NOW if it works.

For async workflows, `workflow run --async` could return immediately and let `workflow status` be used for polling. But default is blocking.

### Q2: How to handle Q&A nodes during automated runs?

**OPEN**: Two options:
- **Option A**: Auto-answer with scripted responses (like test-pipeline's QuestionWatcher). Simple, deterministic, but doesn't test real Q&A.
- **Option B**: Expose a `workflow answer` command for interactive Q&A. More realistic but requires the agent to poll and respond.

Recommendation: Option A for `workflow run` (fully automated), with Option B as a future enhancement for interactive testing.

### Q3: Should the harness capture server-side logs during workflow execution?

**RESOLVED**: Yes. The harness must capture server stdout/stderr during workflow execution. This is where `[ODS] Pod execution failed` errors appear. Without this, pod failures are invisible.

Implementation: Capture dev server output during the `workflow run` window and include relevant lines in the `workflow logs` output.

### Q4: Should `workflow run` require the dev server to be running?

**RESOLVED**: Yes. `workflow run` requires the dev server (or the Docker container) to be running. It validates this first and returns a clear error if not. The harness doesn't start servers — it uses them.

```
$ just harness workflow run
{
  "command": "workflow.run",
  "status": "error",
  "error": {
    "code": "E130",
    "message": "Dev server not running. Start with: just dev"
  }
}
```

---

**Workshop Location**: `docs/plans/076-harness-workflow-runner/workshops/001-harness-workflow-experience.md`
