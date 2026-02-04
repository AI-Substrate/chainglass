# Q&A Protocol: Complete Command Sequence

This document provides a detailed walkthrough of the Question and Answer interaction flow in the Positional Graph system, from node start through question emission, orchestrator answer, and agent resumption.

## Visual State Machine

```
┌─────────┐     start      ┌─────────┐      ask       ┌──────────────────┐
│ pending │ ──────────────▶│ running │ ──────────────▶│ waiting-question │
└─────────┘                └─────────┘                └──────────────────┘
                                 ▲                             │
                                 │         answer              │
                                 └─────────────────────────────┘
                                 │
                                 ▼
                            ┌──────────┐
                            │ complete │
                            └──────────┘
```

---

## CLI Commands Reference

### Command 1: Node Start
```bash
cg wf node start <graph> <nodeId> [--json] [--workspace-path <path>]
```
**Purpose:** Transition a node from `pending` → `running`

**Parameters:**
- `graph`: Graph slug identifier
- `nodeId`: Node ID to start
- `--json`: Output as JSON (optional)
- `--workspace-path`: Override workspace path (optional)

### Command 2: Ask Question
```bash
cg wf node ask <graph> <nodeId> --type <type> --text <text> [--options <values...>] [--json]
```
**Purpose:** Transition a node from `running` → `waiting-question`

**Parameters:**
- `graph`: Graph slug identifier
- `nodeId`: Node ID to ask question from
- `--type`: Question type (required) - one of: `text`, `single`, `multi`, `confirm`
- `--text`: Question text to display (required)
- `--options`: Answer options for single/multi choice questions (optional, repeatable)

**Returns:** `questionId` (format: `YYYY-MM-DDTHH:mm:ss.sssZ_<6-hex-digits>`)

### Command 3: Answer Question
```bash
cg wf node answer <graph> <nodeId> <questionId> <answer> [--json]
```
**Purpose:** Provide answer and transition node from `waiting-question` → `running`

**Parameters:**
- `graph`: Graph slug identifier
- `nodeId`: Node ID being answered
- `questionId`: Question ID from `ask` command
- `answer`: Answer value (parsed as JSON if valid, otherwise used as string)

### Command 4: Get Answer
```bash
cg wf node get-answer <graph> <nodeId> <questionId> [--json]
```
**Purpose:** Retrieve answer to a question (polling pattern)

**Parameters:**
- `graph`: Graph slug identifier
- `nodeId`: Node ID that asked the question
- `questionId`: Question ID from `ask` command

**Returns:**
- `answered: true, answer: <value>` (if answered)
- `answered: false` (if not yet answered)

---

## Step-by-Step Flow

### Step 1: Node Starts

**CLI Command:**
```bash
cg wf node start my-graph coder-node-123 --json
```

**What happens internally:**

1. **CLI Handler** (`handleNodeStart` in `positional-graph.command.ts`):
   ```typescript
   await service.startNode(ctx, 'my-graph', 'coder-node-123')
   ```

2. **Service Method** (`PositionalGraphService.startNode`):
   - Validates node exists in graph
   - Checks current status is `pending` (implicit - no entry in state.json)
   - Calls `transitionNodeState(..., 'running', ['pending'])`

3. **State Change** (persisted to `.chainglass/data/workflows/my-graph/state.json`):
   ```json
   {
     "graph_status": "in_progress",
     "updated_at": "2026-02-04T10:30:00.000Z",
     "nodes": {
       "coder-node-123": {
         "status": "running",
         "started_at": "2026-02-04T10:30:00.000Z"
       }
     }
   }
   ```

4. **Response:**
   ```json
   {
     "ok": true,
     "data": {
       "nodeId": "coder-node-123",
       "status": "running",
       "startedAt": "2026-02-04T10:30:00.000Z"
     }
   }
   ```

---

### Step 2: Agent Asks a Question

**CLI Command:**
```bash
cg wf node ask my-graph coder-node-123 \
  --type single \
  --text "Which programming language should I use?" \
  --options "TypeScript" "Python" "Rust" \
  --json
```

**What happens internally:**

1. **CLI Handler** (`handleNodeAsk`):
   ```typescript
   await service.askQuestion(ctx, 'my-graph', 'coder-node-123', {
     type: 'single',
     text: 'Which programming language should I use?',
     options: ['TypeScript', 'Python', 'Rust']
   })
   ```

2. **Service Method** (`PositionalGraphService.askQuestion`):
   - **Validates** node is in `running` state (returns `E176` if not)
   - **Generates** question ID: `2026-02-04T10:30:05.123Z_a1b2c3`
     ```typescript
     const questionId = `${new Date().toISOString()}_${randomBytes(3).toString('hex')}`
     ```
   - **Creates** question object
   - **Transitions** node to `waiting-question`
   - **Persists** state atomically

3. **State Change:**
   ```json
   {
     "graph_status": "in_progress",
     "updated_at": "2026-02-04T10:30:05.123Z",
     "nodes": {
       "coder-node-123": {
         "status": "waiting-question",
         "started_at": "2026-02-04T10:30:00.000Z",
         "pending_question_id": "2026-02-04T10:30:05.123Z_a1b2c3"
       }
     },
     "questions": [
       {
         "question_id": "2026-02-04T10:30:05.123Z_a1b2c3",
         "node_id": "coder-node-123",
         "type": "single",
         "text": "Which programming language should I use?",
         "options": ["TypeScript", "Python", "Rust"],
         "asked_at": "2026-02-04T10:30:05.123Z"
       }
     ]
   }
   ```

4. **Response:**
   ```json
   {
     "ok": true,
     "data": {
       "nodeId": "coder-node-123",
       "questionId": "2026-02-04T10:30:05.123Z_a1b2c3",
       "status": "waiting-question"
     }
   }
   ```

5. **Agent behavior:** After receiving the response, the agent **STOPS AND EXITS**. It cannot proceed until the orchestrator answers.

---

### Step 3: Orchestrator Answers the Question

**CLI Command:**
```bash
cg wf node answer my-graph coder-node-123 \
  "2026-02-04T10:30:05.123Z_a1b2c3" \
  "TypeScript" \
  --json
```

**What happens internally:**

1. **CLI Handler** (`handleNodeAnswer`):
   ```typescript
   // CLI attempts JSON.parse on answer, falls back to string
   const parsedAnswer = tryParseJSON('TypeScript') ?? 'TypeScript'
   await service.answerQuestion(ctx, 'my-graph', 'coder-node-123', questionId, parsedAnswer)
   ```

2. **Service Method** (`PositionalGraphService.answerQuestion`):
   - **Validates** node is in `waiting-question` state (returns `E177` if not)
   - **Finds** question by ID in `state.questions[]` (returns `E173` if not found)
   - **Verifies** `pending_question_id` matches (ensures correct node)
   - **Updates** question with answer
   - **Transitions** node back to `running`
   - **Clears** `pending_question_id`
   - **Persists** state atomically

3. **State Change:**
   ```json
   {
     "graph_status": "in_progress",
     "updated_at": "2026-02-04T10:30:30.000Z",
     "nodes": {
       "coder-node-123": {
         "status": "running",
         "started_at": "2026-02-04T10:30:00.000Z"
       }
     },
     "questions": [
       {
         "question_id": "2026-02-04T10:30:05.123Z_a1b2c3",
         "node_id": "coder-node-123",
         "type": "single",
         "text": "Which programming language should I use?",
         "options": ["TypeScript", "Python", "Rust"],
         "asked_at": "2026-02-04T10:30:05.123Z",
         "answer": "TypeScript",
         "answered_at": "2026-02-04T10:30:30.000Z"
       }
     ]
   }
   ```

4. **Response:**
   ```json
   {
     "ok": true,
     "data": {
       "nodeId": "coder-node-123",
       "questionId": "2026-02-04T10:30:05.123Z_a1b2c3",
       "status": "running"
     }
   }
   ```

---

### Step 4: Agent Retrieves Answer (After Re-invocation)

The orchestrator re-invokes the agent with context that a question was answered. The agent then retrieves the answer:

**CLI Command:**
```bash
cg wf node get-answer my-graph coder-node-123 \
  "2026-02-04T10:30:05.123Z_a1b2c3" \
  --json
```

**What happens internally:**

1. **CLI Handler** (`handleNodeGetAnswer`):
   ```typescript
   await service.getAnswer(ctx, 'my-graph', 'coder-node-123', questionId)
   ```

2. **Service Method** (`PositionalGraphService.getAnswer`):
   - **Finds** question by ID in `state.questions[]`
   - **Checks** if `answered_at` is set
   - **Returns** answer if answered, or `answered: false` if not

3. **Response (answered):**
   ```json
   {
     "ok": true,
     "data": {
       "nodeId": "coder-node-123",
       "questionId": "2026-02-04T10:30:05.123Z_a1b2c3",
       "answered": true,
       "answer": "TypeScript"
     }
   }
   ```

---

## Complete Sequence Diagram

```
┌─────────┐          ┌─────────────┐          ┌──────────────┐          ┌───────────┐
│  Agent  │          │     CLI     │          │   Service    │          │state.json │
└────┬────┘          └──────┬──────┘          └──────┬───────┘          └─────┬─────┘
     │                      │                        │                        │
     │  cg wf node start    │                        │                        │
     │─────────────────────▶│   startNode()          │                        │
     │                      │───────────────────────▶│   read state           │
     │                      │                        │───────────────────────▶│
     │                      │                        │◀───────────────────────│
     │                      │                        │   write: running       │
     │                      │                        │───────────────────────▶│
     │  {status: running}   │◀───────────────────────│                        │
     │◀─────────────────────│                        │                        │
     │                      │                        │                        │
     │  cg wf node ask      │                        │                        │
     │─────────────────────▶│   askQuestion()        │                        │
     │                      │───────────────────────▶│   read state           │
     │                      │                        │───────────────────────▶│
     │                      │                        │◀───────────────────────│
     │                      │                        │   write: waiting +     │
     │                      │                        │   question object      │
     │                      │                        │───────────────────────▶│
     │  {questionId: ...}   │◀───────────────────────│                        │
     │◀─────────────────────│                        │                        │
     │                      │                        │                        │
     │  *** AGENT EXITS *** │                        │                        │
     │                      │                        │                        │
┌────┴────┐                 │                        │                        │
│Orchestr │                 │                        │                        │
└────┬────┘                 │                        │                        │
     │  cg wf node answer   │                        │                        │
     │─────────────────────▶│   answerQuestion()     │                        │
     │                      │───────────────────────▶│   read state           │
     │                      │                        │───────────────────────▶│
     │                      │                        │◀───────────────────────│
     │                      │                        │   write: running +     │
     │                      │                        │   answer in question   │
     │                      │                        │───────────────────────▶│
     │  {status: running}   │◀───────────────────────│                        │
     │◀─────────────────────│                        │                        │
     │                      │                        │                        │
     │  *** RE-INVOKE AGENT ***                      │                        │
     │                      │                        │                        │
┌────┴────┐                 │                        │                        │
│  Agent  │                 │                        │                        │
└────┬────┘                 │                        │                        │
     │  cg wf node get-answer                        │                        │
     │─────────────────────▶│   getAnswer()          │                        │
     │                      │───────────────────────▶│   read state           │
     │                      │                        │───────────────────────▶│
     │                      │                        │◀───────────────────────│
     │  {answered: true,    │◀───────────────────────│                        │
     │   answer: "TS"}      │                        │                        │
     │◀─────────────────────│                        │                        │
     │                      │                        │                        │
     │  Agent continues...  │                        │                        │
     ▼                      ▼                        ▼                        ▼
```

---

## Service Method Signatures

All methods are in `packages/positional-graph/src/services/positional-graph.service.ts`

### startNode
```typescript
async startNode(
  ctx: WorkspaceContext,
  graphSlug: string,
  nodeId: string
): Promise<StartNodeResult>
```

**Returns:**
```typescript
{
  nodeId?: string;
  status?: 'running';
  startedAt?: string;
  errors: ResultError[];
}
```

**Valid Transitions:** `pending` → `running` only

### askQuestion
```typescript
async askQuestion(
  ctx: WorkspaceContext,
  graphSlug: string,
  nodeId: string,
  options: AskQuestionOptions
): Promise<AskQuestionResult>
```

**Options:**
```typescript
{
  type: 'text' | 'single' | 'multi' | 'confirm';
  text: string;
  options?: string[];           // For single/multi
  default?: string | boolean;   // Optional default
}
```

**Returns:**
```typescript
{
  nodeId?: string;
  questionId?: string;
  status?: 'waiting-question';
  errors: ResultError[];
}
```

**Valid Transitions:** `running` → `waiting-question`

### answerQuestion
```typescript
async answerQuestion(
  ctx: WorkspaceContext,
  graphSlug: string,
  nodeId: string,
  questionId: string,
  answer: unknown
): Promise<AnswerQuestionResult>
```

**Returns:**
```typescript
{
  nodeId?: string;
  questionId?: string;
  status?: 'running';
  errors: ResultError[];
}
```

**Valid Transitions:** `waiting-question` → `running`

### getAnswer
```typescript
async getAnswer(
  ctx: WorkspaceContext,
  graphSlug: string,
  nodeId: string,
  questionId: string
): Promise<GetAnswerResult>
```

**Returns:**
```typescript
{
  nodeId?: string;
  questionId?: string;
  answered: boolean;
  answer?: unknown;
  errors: ResultError[];
}
```

**Behavior:**
- Returns `{ answered: true, answer: <value>, errors: [] }` if answered
- Returns `{ answered: false, errors: [] }` if not yet answered
- Returns `{ answered: false, errors: [E173] }` if question ID invalid

---

## Data Structures

### Node Execution Status Enum
```typescript
type NodeExecutionStatus =
  | 'running'
  | 'waiting-question'
  | 'blocked-error'
  | 'complete'
```

**Note:** Nodes without an entry in state.json are implicitly `pending`

### Question Schema
Stored in `state.json` in the `questions[]` array:

```typescript
interface Question {
  question_id: string;              // YYYY-MM-DDTHH:mm:ss.sssZ_<6-hex>
  node_id: string;                  // Node that asked
  type: 'text' | 'single' | 'multi' | 'confirm';
  text: string;                     // Question text for display
  options?: string[];               // For single/multi choice
  default?: string | boolean;       // Optional default value
  asked_at: string;                 // ISO datetime when asked
  answer?: unknown;                 // Stored answer (set by answerQuestion)
  answered_at?: string;             // ISO datetime when answered (optional)
}
```

### NodeStateEntry Schema
Stored in `state.json` in the `nodes[nodeId]` object:

```typescript
interface NodeStateEntry {
  status: NodeExecutionStatus;      // Current execution status
  started_at?: string;              // ISO datetime (set on running)
  completed_at?: string;            // ISO datetime (set on complete)
  pending_question_id?: string;     // Question ID node is waiting for
  error?: NodeStateEntryError;      // Error details if blocked-error
}
```

### State Schema
Persisted at `.chainglass/data/workflows/<graph>/state.json`:

```typescript
interface State {
  graph_status: 'pending' | 'in_progress' | 'complete' | 'failed';
  updated_at: string;               // ISO datetime of last update
  nodes?: Record<string, NodeStateEntry>;      // All node states
  transitions?: Record<string, TransitionEntry>; // Transition tracking
  questions?: Question[];           // All questions for all nodes
}
```

---

## Error Scenarios

| Error Code | Scenario | CLI Response |
|------------|----------|--------------|
| **E176** | `ask` when node not running | `Node 'coder-node-123' is not running (current: pending)` |
| **E177** | `answer` when node not waiting | `Node 'coder-node-123' is not waiting for an answer` |
| **E173** | `answer`/`get-answer` with invalid question ID | `Question '...' not found` |

---

## Key Implementation Details

### Question ID Format
Format: `ISO_TIMESTAMP_RANDOMHEX` (e.g., `2026-02-04T10:30:05.123Z_a1b2c3`)
- Sortable by time
- Human-debuggable
- Collision-resistant (6 random hex digits)

### Atomic State Persistence
All state changes are written in a single atomic file operation via `atomicWriteFile()`. This ensures no partial updates or race conditions.

### No Blocking Waits
The `get-answer` command returns immediately:
- If answered: `{ answered: true, answer: <value> }`
- If not answered: `{ answered: false }`

This enables polling patterns for agents that need to wait for answers.

### Answer Types
Answers can be any JSON type:
- String: `"TypeScript"`
- Number: `42`
- Boolean: `true`
- Array: `["option1", "option2"]`
- Object: `{"key": "value"}`
- Null: `null`

The CLI parses the answer as JSON if valid, otherwise treats it as a string.

### State Location
State is persisted at: `.chainglass/data/workflows/<graph>/state.json`

---

## Async Polling Pattern

The `get-answer` command enables polling patterns for agents:

```typescript
// Agent polling loop pseudocode
async function waitForAnswer(graphSlug, nodeId, questionId, maxWaitMs = 30000) {
  const pollIntervalMs = 500;
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    const result = await service.getAnswer(ctx, graphSlug, nodeId, questionId);

    if (result.errors.length > 0) {
      throw new Error(`Question error: ${result.errors[0].message}`);
    }

    if (result.answered) {
      return result.answer;  // Got the answer!
    }

    // Not answered yet, wait and retry
    await delay(pollIntervalMs);
  }

  throw new Error('Timeout waiting for answer');
}
```

---

## Critical Implementation Properties

1. **No blocking waits:** Service methods return immediately; polling is explicit
2. **Atomic transactions:** Single state file write for all changes
3. **Idempotent:** Same command twice has same effect (already in desired state)
4. **Rich error context:** E codes with actionable messages
5. **Backward compatible:** Questions array optional in state schema
6. **Lossless answer storage:** Answers can be any JSON type, not just strings

---

## Related Files

- **CLI Commands:** `apps/cli/src/commands/positional-graph.command.ts`
- **Service:** `packages/positional-graph/src/services/positional-graph.service.ts`
- **Types:** `packages/positional-graph/src/types/`
- **Errors:** `packages/positional-graph/src/errors/positional-graph-errors.ts`
- **State Schema:** `packages/positional-graph/src/schemas/state.schema.ts`
