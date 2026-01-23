# Research Report: Accept/Handover/Preflight Workflow Commands

**Generated**: 2026-01-23T22:05:00Z
**Research Query**: "Workshop accept, handover, and preflight commands - understand if validate already covers preflight, design the agent control flow"
**Mode**: Pre-Plan (Preparing for future subtask)
**FlowSpace**: Not used (targeted investigation)
**Findings**: Comprehensive

---

## Executive Summary

### What Currently Exists

The **schema and types** define 9 ActionTypes including `accept`, `handover`, and `preflight`:
```typescript
type ActionType = 
  | 'prepare'   // ✅ CLI implemented
  | 'input'     // ⚠️ No CLI (orchestrator manually creates message files)
  | 'handover'  // ❌ NO CLI - needs implementation
  | 'accept'    // ❌ NO CLI - needs implementation  
  | 'preflight' // ❌ NO CLI - needs implementation
  | 'question'  // ✅ Logged by message create (from: agent)
  | 'error'     // ⚠️ No CLI (errors returned in result objects)
  | 'answer'    // ✅ Logged by message answer
  | 'finalize'  // ✅ CLI implemented
```

### The User's Clarified Flow

```
Agent accepts phase → runs preflight → [if error: log error + handover back]
                                     → [if OK: do work → finalize → handover]

Messages/questions do NOT need handover (dialogue within a turn)
Logging errors does NOT auto-handover (agent decides when to hand back)
```

### Key Discovery: Validate ≠ Preflight

| Command | What It Does | When Used |
|---------|--------------|-----------|
| `validate --check inputs` | File existence + schema check | Before work starts |
| `validate --check outputs` | File existence + non-empty + schema | After work completes |
| `preflight` (proposed) | Logs action + may run validate inputs | Agent's first action after accept |

**Verdict**: Preflight could WRAP `validate --check inputs` but is semantically different:
- `validate` = stateless file check
- `preflight` = action logged to status history, signals agent readiness

---

## Detailed Findings

### 1. Exemplar Shows the Full Dance

From `dev/examples/wf/runs/run-example-001/phases/gather/run/wf-data/wf-phase.json`:

```json
{
  "phase": "gather",
  "facilitator": "orchestrator", 
  "state": "complete",
  "status": [
    { "from": "orchestrator", "action": "prepare", "comment": "Phase prepared..." },
    { "from": "orchestrator", "action": "input", "message_id": "001", "comment": "User input..." },
    { "from": "orchestrator", "action": "handover", "comment": "Control passed to agent" },
    { "from": "agent", "action": "accept", "comment": "Agent acknowledges control" },
    { "from": "agent", "action": "preflight", "comment": "Preflight passed: config OK, inputs OK" },
    { "from": "agent", "action": "finalize", "comment": "Phase complete..." }
  ]
}
```

**Pattern**: `prepare → input → handover → accept → preflight → [work] → finalize`

### 2. Process Phase Shows Q&A Without Extra Handover

From `dev/examples/wf/runs/run-example-001/phases/process/run/wf-data/wf-phase.json`:

```json
{
  "status": [
    { "from": "orchestrator", "action": "prepare" },
    { "from": "orchestrator", "action": "handover", "comment": "Control passed to agent" },
    { "from": "agent", "action": "accept" },
    { "from": "agent", "action": "preflight" },
    { "from": "agent", "action": "question", "message_id": "001" },  // Agent asks
    { "from": "orchestrator", "action": "answer", "message_id": "001" },  // Orch answers
    { "from": "orchestrator", "action": "handover" },  // Control back to agent
    { "from": "agent", "action": "accept" },  // Agent re-accepts
    { "from": "agent", "action": "finalize" }  // Complete
  ]
}
```

**Insight**: After Q&A, there IS a handover/accept cycle! The orchestrator hands back after answering.

### 3. PhaseState Transitions

From `packages/workflow/src/types/wf-phase.types.ts`:

```typescript
type PhaseState = 'pending' | 'active' | 'blocked' | 'accepted' | 'complete' | 'failed';
```

**State Machine** (current understanding):
```
pending → (prepare) → ready/active → (accept) → accepted → (work) → complete/failed
                              ↓
                         (error) → blocked → (handover back) → pending?
```

### 4. What CLI Commands Need to Do

#### `cg phase accept <phase>`
**Purpose**: Agent logs that it's taking control of a phase

**What it does**:
1. Read `wf-phase.json`
2. Verify current facilitator (should be orchestrator after handover)
3. Append status entry: `{ from: "agent", action: "accept", comment: "..." }`
4. Update facilitator to "agent"
5. Optionally update state to "accepted"

**Options**:
- `--run-dir <path>` (required)
- `--comment <text>` (optional)
- `--json` (output format)

#### `cg phase preflight <phase>`
**Purpose**: Agent validates it can proceed with the phase

**What it does**:
1. Run `validate --check inputs` internally
2. If errors: append status entry: `{ from: "agent", action: "preflight", data: { errors: [...] } }`
3. If OK: append status entry: `{ from: "agent", action: "preflight", comment: "Preflight passed" }`
4. Return result (agent decides whether to handover on error)

**Options**:
- `--run-dir <path>` (required)
- `--json` (output format)

#### `cg phase handover <phase>`
**Purpose**: Transfer control from one facilitator to another

**What it does**:
1. Read `wf-phase.json`
2. Verify caller is current facilitator
3. Append status entry: `{ from: currentFacilitator, action: "handover", comment: "..." }`
4. Switch facilitator field to other party
5. Optionally update state (if handing back due to error, may set "blocked")

**Options**:
- `--run-dir <path>` (required)
- `--reason <text>` (optional - why handing over)
- `--error` (flag - indicates handover due to error, sets state to "blocked")
- `--json` (output format)

### 5. Error Flow (User's Clarification)

```
Agent runs preflight → errors found
Agent logs error: { from: "agent", action: "error", data: { code: "E001", ... } }
Agent decides to handover: { from: "agent", action: "handover", reason: "Preflight failed" }
Orchestrator receives control, phase state: "blocked"
```

**Key**: Agent CHOOSES when to handover. Logging an error doesn't auto-handover.

### 6. Why Messages Don't Need Handover

Messages are **dialogue within a facilitator's control period**:

```
Agent has control:
  - Agent asks question (creates message, logs "question")
  - Orchestrator answers (adds answer, logs "answer") 
  - But control didn't transfer! Agent still has it.
  
Only when agent is DONE (or stuck) does it handover.
```

The exemplar shows this pattern:
- `question` logged from agent
- `answer` logged from orchestrator
- `handover` then `accept` to resume agent

This means the **message answer action should trigger a handover + accept**!

---

## Architecture Implications

### Service Layer Changes

```typescript
// packages/workflow/src/interfaces/phase-service.interface.ts

interface IPhaseService {
  // Existing
  prepare(phase: string, runDir: string): Promise<PrepareResult>;
  validate(phase: string, runDir: string, check: ValidateCheckMode): Promise<ValidateResult>;
  finalize(phase: string, runDir: string): Promise<FinalizeResult>;
  
  // NEW
  accept(phase: string, runDir: string, options?: AcceptOptions): Promise<AcceptResult>;
  preflight(phase: string, runDir: string): Promise<PreflightResult>;
  handover(phase: string, runDir: string, options?: HandoverOptions): Promise<HandoverResult>;
  logError(phase: string, runDir: string, error: WfError): Promise<LogErrorResult>;
}

interface AcceptOptions {
  comment?: string;
}

interface HandoverOptions {
  reason?: string;
  dueToError?: boolean;  // If true, sets state to "blocked"
}
```

### Result Types

```typescript
interface AcceptResult {
  success: boolean;
  errors: WfError[];
  facilitator: Facilitator;  // Now "agent"
  state: PhaseState;
}

interface PreflightResult {
  success: boolean;
  errors: WfError[];  // From validate --check inputs
  checks: {
    configValid: boolean;
    inputsExist: boolean;
    schemasValid: boolean;
  };
}

interface HandoverResult {
  success: boolean;
  errors: WfError[];
  fromFacilitator: Facilitator;
  toFacilitator: Facilitator;
  state: PhaseState;  // May be "blocked" if error handover
}
```

### New Error Codes

| Code | Name | Description |
|------|------|-------------|
| E070 | WRONG_FACILITATOR | Attempted action by non-controlling facilitator |
| E071 | INVALID_STATE_TRANSITION | Phase state doesn't allow this action |
| E072 | PREFLIGHT_FAILED | Preflight checks failed (wraps E001, E010, etc.) |
| E073 | HANDOVER_REJECTED | Cannot handover in current state |

---

## CLI Design

### Command Group

```bash
# Agent accepts phase (after orchestrator handover)
cg phase accept <phase> --run-dir <path> [--comment "text"] [--json]

# Agent runs preflight checks
cg phase preflight <phase> --run-dir <path> [--json]

# Either party hands over control
cg phase handover <phase> --run-dir <path> [--reason "text"] [--error] [--json]

# Log an error (optional - errors can also be in result objects)
cg phase error <phase> --run-dir <path> --code E001 --message "text" [--json]
```

### Example Session

```bash
# Orchestrator prepares and hands over
cg phase prepare gather --run-dir ./runs/test-001
cg phase handover gather --run-dir ./runs/test-001 --reason "Ready for agent"

# Agent accepts and preflights
cg phase accept gather --run-dir ./runs/test-001 --comment "Agent taking control"
cg phase preflight gather --run-dir ./runs/test-001
# → { "success": true, "checks": { "configValid": true, ... } }

# Agent does work...

# Agent finalizes and hands back
cg phase finalize gather --run-dir ./runs/test-001
cg phase handover gather --run-dir ./runs/test-001 --reason "Phase complete"

# Error scenario
cg phase preflight process --run-dir ./runs/test-001
# → { "success": false, "errors": [{ "code": "E001", "message": "Missing input..." }] }
cg phase handover process --run-dir ./runs/test-001 --error --reason "Preflight failed"
```

---

## Impact on Manual Test Harness

### Current Status (Without Handover Commands)

The manual test can only test:
- ✅ prepare/validate/finalize CLI commands
- ✅ message create/answer/list/read commands
- ❌ Cannot properly log accept/preflight/handover in status history

### What Manual Test Should Document

The MODE-1-LEARNING.md guide should:
1. **Document the intended flow** (even if CLI doesn't exist yet)
2. **Manually edit wf-phase.json** to add status entries where CLI is missing
3. **Note**: "When `cg phase accept/preflight/handover` commands are implemented, replace manual JSON edits with CLI calls"

### Proposed Test Flow With Commands

```bash
# GATHER PHASE
cg phase prepare gather --run-dir $RUN
cg phase message create --phase gather --run-dir $RUN --from orchestrator --type free_text ...
cg phase handover gather --run-dir $RUN --reason "Ready for agent"

# (Switch to agent role)
cg phase accept gather --run-dir $RUN --comment "Agent taking gather phase"
cg phase preflight gather --run-dir $RUN
# ... do work ...
cg phase validate gather --run-dir $RUN --check outputs
cg phase finalize gather --run-dir $RUN
cg phase handover gather --run-dir $RUN --reason "Phase complete"

# PROCESS PHASE
cg phase prepare process --run-dir $RUN
cg phase handover process --run-dir $RUN --reason "Ready for agent"

# (Switch to agent role)
cg phase accept process --run-dir $RUN
cg phase preflight process --run-dir $RUN
cg phase message create --phase process --run-dir $RUN --from agent --type multi_choice ...

# (Switch to orchestrator role)
cg phase message answer --phase process --run-dir $RUN --id 001 --select C
# Note: After answering, orchestrator should handover back!
cg phase handover process --run-dir $RUN --reason "Answer provided"

# (Switch to agent role)
cg phase accept process --run-dir $RUN --comment "Resuming after Q&A"
# ... continue work ...
```

---

## Subtask Requirements

### New Subtask: Implement Accept/Handover/Preflight Commands

**Scope**:
1. Add methods to `IPhaseService`: `accept()`, `preflight()`, `handover()`, `logError()`
2. Implement in `PhaseService` with proper state machine logic
3. Add CLI commands: `cg phase accept|preflight|handover|error`
4. Add MCP tools (future, not in this subtask)
5. Add error codes E070-E073
6. Unit tests + contract tests
7. Update output adapters

**Task Estimate**: ~20 tasks, similar to message CLI subtask

**Dependencies**:
- Manual test harness should be run FIRST (validates current system)
- This subtask follows after, then manual test can be re-run with full CLI

**NOT in scope**:
- MCP tools (deferred to Phase 5)
- Automatic facilitator validation (can be added later)

---

## Questions for User (Resolved)

✅ **Q1**: Should `preflight` automatically run `validate --check inputs`?
**A**: Yes, wrap validate inputs - but preflight is the logged action.

✅ **Q2**: Should `handover` after error set state to "blocked"?
**A**: Yes, use `--error` flag to indicate error handover, sets state to "blocked".

✅ **Q3**: Who can handover? Only current facilitator?
**A**: Yes, verify caller is current facilitator. (Error code E070 if wrong.)

✅ **Q4**: Does message answer auto-handover?
**A**: Looking at exemplar - YES! After answer, there's handover → accept.
But this could be a convention (orchestrator manually calls handover) rather than automatic.
**Decision**: Keep it manual. Orchestrator calls handover after answering.

---

## Next Steps

1. **Update manual test harness subtask** with:
   - Document the intended handover flow
   - Add section on "Commands Not Yet Implemented"
   - Show where manual JSON edits are needed

2. **Create new subtask dossier** for:
   - "Implement Accept/Handover/Preflight CLI Commands"
   - Under Phase 3: Phase Operations (same as message CLI)
   - ~20 tasks estimated

3. **Sequence**:
   - Run manual test harness with current CLI (partial flow)
   - Implement handover commands
   - Re-run manual test harness with full CLI

---

## References

| File | Purpose |
|------|---------|
| `packages/workflow/src/types/wf-phase.types.ts:14-31` | ActionType, PhaseState definitions |
| `packages/workflow/src/schemas/index.ts:305-307` | Schema for handover/accept/preflight |
| `dev/examples/wf/runs/run-example-001/phases/*/run/wf-data/wf-phase.json` | Exemplar showing full flow |
| `apps/cli/src/commands/phase.command.ts` | Current CLI commands (prepare/validate/finalize) |
| `packages/workflow/src/services/phase.service.ts` | PhaseService implementation |
| `packages/workflow/src/interfaces/phase-service.interface.ts` | Service interface |

---

**Research Complete**: 2026-01-23T22:05:00Z
