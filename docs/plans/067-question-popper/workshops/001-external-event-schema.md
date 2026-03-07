# Workshop: External Event Schema — Generic Base with First-Class Concepts

> ⚠️ **TRANSPORT SECTIONS SUPERSEDED**: This workshop was written for a file-based architecture. The "File Storage", "Atomic Write Pattern", and file path examples are superseded by the HTTP API approach. The **schema designs** (Zod schemas, question types, answer statuses, chaining model, tmux detection, status values, quick reference) **remain valid** — these define the API request/response shapes now instead of file contents.

**Type**: Data Model
**Plan**: 067-question-popper
**Spec**: [question-popper-spec.md](../question-popper-spec.md)
**Created**: 2026-03-07T03:50:00Z
**Status**: Draft (transport sections superseded by API rewrite)

**Related Documents**:
- [Research Dossier](../research-dossier.md) — findings IA-03, IC-02, IC-08, PL-05, PL-06
- ADR-0007 (minimal SSE payloads)
- ADR-0010 (central domain event notification)

**Domain Context**:
- **Primary Domain**: `question-popper` (NEW business domain)
- **Related Domains**: `_platform/events` (SSE broadcasting), `_platform/state` (reactive counts), `_platform/file-ops` (filesystem)

---

## Purpose

Design the `in.json` / `out.json` schema as a **two-layer system**: a generic external event envelope that any future event type can use, plus typed first-class concept wrappers (starting with question-and-answer) that hide the generic mechanics from callers. The goal is that a CLI user writes `cg question ask "Deploy?"` and never thinks about external events, while the underlying file format is extensible enough to support progress reports, approvals, notifications, or any future event type without schema redesign.

## Key Questions Addressed

- What does in.json look like at the generic level vs. the question level?
- What does out.json look like at the generic level vs. the answer level?
- How do first-class concepts (like questions) wrap the generic layer?
- How does the CLI present a simple interface while the schema stays extensible?
- How do we avoid schema changes when adding new event types?
- What does "needs clarification" look like in the out.json?
- How do question chains work at the schema level?

---

## Conceptual Model

The system has **two layers**. Everything flows through the generic layer; first-class concepts are just typed views over it.

```
┌─────────────────────────────────────────────────────────────┐
│  FIRST-CLASS CONCEPT LAYER (what callers see)               │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ cg question   │  │ cg approval  │  │ cg notify    │      │
│  │ ask / answer  │  │ (future)     │  │ (future)     │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
│         │                  │                  │              │
│  ┌──────▼──────────────────▼──────────────────▼──────┐      │
│  │  Typed constructors + Zod schemas per concept     │      │
│  │  e.g., QuestionInSchema, ApprovalInSchema         │      │
│  └──────────────────────┬────────────────────────────┘      │
│                         │                                    │
├─────────────────────────┼────────────────────────────────────┤
│  GENERIC EVENT LAYER    │  (what the filesystem sees)        │
│                         ▼                                    │
│  ┌───────────────────────────────────────────────────┐      │
│  │  ExternalEventIn { version, type, payload, meta } │      │
│  │  ExternalEventOut { version, type, payload, meta }│      │
│  └───────────────────────────────────────────────────┘      │
│                                                              │
│  .chainglass/data/external-events/{guid}/                    │
│    in.json   ← generic envelope, typed payload               │
│    out.json  ← generic envelope, typed payload               │
└─────────────────────────────────────────────────────────────┘
```

**Why two layers?**
- The generic layer never changes when you add new event types
- The first-class layer gives callers type safety and a simple API
- The file watcher and SSE pipeline only care about the generic envelope
- Tests can create events at either layer

---

## Generic Event Layer

### in.json — Inbound Event Envelope

Every `in.json` file has this shape, regardless of event type:

```typescript
// Generic envelope — the file format
const ExternalEventInSchema = z.object({
  /** Schema version for forward compatibility */
  version: z.literal(1),

  /** Event type discriminator — determines payload shape */
  type: z.string().min(1),

  /** When this event was created (ISO-8601) */
  createdAt: z.string().datetime(),

  /** Who created this event (human-readable identifier) */
  source: z.string().min(1),

  /** Type-specific payload — shape determined by `type` field */
  payload: z.record(z.unknown()),

  /** Optional unstructured metadata — pass-through, not validated */
  meta: z.record(z.unknown()).optional(),
}).strict();

type ExternalEventIn = z.infer<typeof ExternalEventInSchema>;
```

### out.json — Outbound Response Envelope

Every `out.json` file has this shape:

```typescript
const ExternalEventOutSchema = z.object({
  /** Schema version — matches the in.json version */
  version: z.literal(1),

  /** Response status — semantics depend on the event type */
  status: z.string().min(1),

  /** When this response was created (ISO-8601) */
  respondedAt: z.string().datetime(),

  /** Who responded (human-readable identifier) */
  respondedBy: z.string().min(1),

  /** Type-specific response payload */
  payload: z.record(z.unknown()),

  /** Optional unstructured metadata */
  meta: z.record(z.unknown()).optional(),
}).strict();

type ExternalEventOut = z.infer<typeof ExternalEventOutSchema>;
```

### Example: Raw Generic Event (what's on disk)

**in.json** — a question event at the generic level:
```json
{
  "version": 1,
  "type": "question",
  "createdAt": "2026-03-07T03:50:00.000Z",
  "source": "claude-code:agent-1",
  "payload": {
    "questionType": "confirm",
    "text": "Deploy to production?",
    "description": "The test suite passed with 247/247 tests...",
    "options": null,
    "default": false,
    "timeout": 600,
    "previousQuestionId": null
  },
  "meta": {
    "tmux": {
      "session": "059-fix-agents",
      "window": "2",
      "pane": "%5"
    }
  }
}
```

**out.json** — an answer at the generic level:
```json
{
  "version": 1,
  "status": "answered",
  "respondedAt": "2026-03-07T03:51:30.000Z",
  "respondedBy": "user:jordan",
  "payload": {
    "answer": true
  }
}
```

### Why `version: 1`?

Forward compatibility. If we need to change the envelope shape (add required fields, change semantics), we bump the version. Readers check version and dispatch to the right parser. Version 1 is the only version for now.

### Why `meta` is separate from `payload`?

- `payload` is **typed and validated** per event type (via Zod `.strict()`)
- `meta` is **unstructured and pass-through** — writers can stash extra context (agent session IDs, trace IDs, environment info) without breaking validation
- The file watcher and SSE pipeline never inspect `meta`
- UI can optionally display recognized meta keys

### Reserved `meta` Keys

The CLI auto-detects certain environment context and populates `meta` when available. These are optional — if the CLI isn't running in the relevant environment, the keys are simply absent.

| Key | Type | Auto-detected | Description |
|-----|------|--------------|-------------|
| `tmux.session` | `string` | Yes — via `$TMUX` env var | Tmux session name the caller is running in |
| `tmux.window` | `string` | Yes — via `$TMUX_PANE` env var | Tmux window index (e.g., `"0"`, `"1"`) |
| `tmux.pane` | `string` | Yes — via `$TMUX_PANE` env var | Tmux pane ID (e.g., `"%3"`) |

These are stored and passed through to the web UI for display. The UI shows them as contextual info on the question/alert (e.g., "from tmux session `059-fix-agents` window 2"). Future phases will add action buttons (e.g., "Jump to tmux pane") but for now the data is display-only.

### Tmux Detection — Shared Utility (`packages/shared`)

Tmux detection is a **reusable shared utility** in `packages/shared`, not inline in the CLI command. This ensures any future CLI feature (agents, activity-log, deploy scripts, etc.) can include tmux context with a single function call.

**Location**: `packages/shared/src/utils/tmux-context.ts`

```typescript
import { execSync } from 'node:child_process';

export interface TmuxContext {
  session: string;
  window: string;
  pane: string | undefined;
}

/**
 * Detect the current tmux session/window/pane context.
 * Returns undefined if not running inside tmux.
 *
 * Safe to call from any CLI command or Node.js process.
 * Uses $TMUX env var for detection and `tmux display-message` for session/window.
 *
 * @example
 * const tmux = detectTmuxContext();
 * if (tmux) {
 *   console.log(`Running in tmux session: ${tmux.session}, window: ${tmux.window}`);
 * }
 */
export function detectTmuxContext(): TmuxContext | undefined {
  if (!process.env.TMUX) return undefined;

  try {
    return {
      session: execSync('tmux display-message -p "#S"', { encoding: 'utf-8' }).trim(),
      window: execSync('tmux display-message -p "#I"', { encoding: 'utf-8' }).trim(),
      pane: process.env.TMUX_PANE ?? undefined,
    };
  } catch {
    // tmux command failed (e.g., tmux not installed despite $TMUX being set)
    return undefined;
  }
}

/**
 * Wrap tmux context into the meta bag shape expected by ExternalEventIn.
 * Returns undefined if not in tmux (safe to spread into meta).
 *
 * @example
 * const meta = { ...otherMeta, ...getTmuxMeta() };
 */
export function getTmuxMeta(): { tmux: TmuxContext } | undefined {
  const ctx = detectTmuxContext();
  return ctx ? { tmux: ctx } : undefined;
}
```

**Usage in any CLI command** (one-liner):
```typescript
import { getTmuxMeta } from '@chainglass/shared';

const event = createQuestionEvent({
  ...input,
  meta: { ...getTmuxMeta() },  // auto-includes tmux if present, noop if not
});
```

**Why shared, not CLI-local?**
- Terminal domain (Plan 064) already has tmux integration — this utility is broadly useful
- Future features (agent context, build tracking) will want the same detection
- Keeps CLI command handlers thin — one import, one call
- Testable via `FakeTmuxContext` that overrides env vars

Agents don't need to know about tmux at all — the CLI handles it transparently.

---

## First-Class Concept: Question and Answer

The question-and-answer system is a **typed wrapper** over the generic event layer. Callers work with `QuestionIn` and `QuestionOut` types; the wrapper handles serialization to/from the generic `ExternalEventIn`/`ExternalEventOut`.

### Question Payload (in.json payload)

```typescript
const QuestionPayloadSchema = z.object({
  /** Question type — determines UI rendering and answer shape */
  questionType: z.enum(['text', 'single', 'multi', 'confirm']),

  /** The question text — always shown prominently */
  text: z.string().min(1),

  /** Detailed context in markdown — rendered in scrollable area */
  description: z.string().nullable(),

  /** Available options for single/multi choice */
  options: z.array(z.string().min(1)).nullable(),

  /** Default answer value */
  default: z.union([z.string(), z.boolean()]).nullable(),

  /** How long the CLI will block (seconds). 0 = fire-and-forget */
  timeout: z.number().int().min(0),

  /** Soft link to a previous question for chaining */
  previousQuestionId: z.string().nullable(),
}).strict();

type QuestionPayload = z.infer<typeof QuestionPayloadSchema>;
```

### Answer Payload (out.json payload)

```typescript
const AnswerPayloadSchema = z.object({
  /** The answer value — shape depends on questionType */
  answer: z.union([
    z.string(),             // text questions
    z.boolean(),            // confirm questions
    z.array(z.string()),    // multi questions
  ]).nullable(),

  /** Freeform text from the user (always available, regardless of type) */
  text: z.string().nullable(),
}).strict();

type AnswerPayload = z.infer<typeof AnswerPayloadSchema>;
```

### Answer Statuses (out.json status field)

| Status | Meaning | CLI Behavior |
|--------|---------|-------------|
| `answered` | User provided an answer | CLI returns the answer payload |
| `needs-clarification` | User wants more info before answering | CLI returns status + user's clarification text |
| `dismissed` | User explicitly dismissed without answering | CLI returns status (no answer) |

### Needs-Clarification Payload

When status is `needs-clarification`, the payload carries the user's clarification request:

```typescript
const ClarificationPayloadSchema = z.object({
  /** What the user wants to know before answering */
  text: z.string().min(1),
}).strict();
```

**out.json** for needs-clarification:
```json
{
  "version": 1,
  "status": "needs-clarification",
  "respondedAt": "2026-03-07T03:51:30.000Z",
  "respondedBy": "user:jordan",
  "payload": {
    "text": "What test environment was this run against?"
  }
}
```

### Composed Types (what the first-class layer exposes)

These are the types that CLI code and UI code actually import. They compose the generic envelope with the typed payload:

```typescript
/** What you pass to `cg question ask` (or construct programmatically) */
interface QuestionIn {
  questionType: 'text' | 'single' | 'multi' | 'confirm';
  text: string;
  description?: string;
  options?: string[];
  default?: string | boolean;
  timeout?: number;           // default: 600
  previousQuestionId?: string;
  source: string;
  meta?: Record<string, unknown>;
}

/** What you get back from `cg question get` */
interface QuestionOut {
  questionId: string;         // the GUID
  status: 'answered' | 'needs-clarification' | 'dismissed' | 'pending';
  answer?: string | boolean | string[];
  text?: string;              // freeform text (for answered) or clarification text
  respondedAt?: string;
  respondedBy?: string;
}
```

### Constructor Functions (hide the generic layer)

```typescript
/**
 * Create an in.json for a question.
 * Callers use this — they never construct ExternalEventIn directly.
 */
function createQuestionEvent(input: QuestionIn): ExternalEventIn {
  return {
    version: 1,
    type: 'question',
    createdAt: new Date().toISOString(),
    source: input.source,
    payload: {
      questionType: input.questionType,
      text: input.text,
      description: input.description ?? null,
      options: input.options ?? null,
      default: input.default ?? null,
      timeout: input.timeout ?? 600,
      previousQuestionId: input.previousQuestionId ?? null,
    },
    meta: input.meta,
  };
}

/**
 * Parse an in.json into a typed question.
 * Returns null if the event type is not 'question'.
 */
function parseQuestionEvent(event: ExternalEventIn): QuestionPayload | null {
  if (event.type !== 'question') return null;
  return QuestionPayloadSchema.parse(event.payload);
}

/**
 * Create an out.json for an answer.
 */
function createAnswerEvent(
  answer: string | boolean | string[],
  text: string | null,
  respondedBy: string,
): ExternalEventOut {
  return {
    version: 1,
    status: 'answered',
    respondedAt: new Date().toISOString(),
    respondedBy,
    payload: { answer, text },
  };
}

/**
 * Create an out.json for needs-clarification.
 */
function createClarificationEvent(
  clarificationText: string,
  respondedBy: string,
): ExternalEventOut {
  return {
    version: 1,
    status: 'needs-clarification',
    respondedAt: new Date().toISOString(),
    respondedBy,
    payload: { text: clarificationText },
  };
}
```

**Why constructor functions?**
- Callers never see `version`, `type`, `createdAt` — those are implementation details
- Type validation happens at construction time (Zod `.parse()`)
- Adding a new field to the generic envelope never breaks callers
- Easy to test: `createQuestionEvent({ ... })` → assert JSON shape

---

## File Storage

```
.chainglass/data/external-events/
├── 2026-03-07T03-50-00-000Z_a8f3e/     ← GUID directory
│   ├── in.json                           ← question (always present)
│   └── out.json                          ← answer (present when answered)
├── 2026-03-07T03-51-00-000Z_b9c4f/
│   ├── in.json
│   └── out.json
└── 2026-03-07T03-52-00-000Z_c0d5g/
    └── in.json                           ← pending (no out.json yet)
```

### GUID Format

Following the existing convention from workflow-events (IA-03):

```
{ISO-timestamp}_{random-suffix}
```

Example: `2026-03-07T03-50-00-000Z_a8f3e`

**Why this format?**
- Sorts chronologically by default (ls, glob)
- Human-readable creation time
- Random suffix prevents collisions
- Colons replaced with hyphens for filesystem compatibility

### Atomic Write Pattern

To prevent partial reads (PL-07):

```typescript
// Write to temp file, then rename (atomic on same filesystem)
async function writeEventFile(dir: string, filename: string, data: unknown): Promise<void> {
  const tmpPath = path.join(dir, `.${filename}.tmp`);
  const finalPath = path.join(dir, filename);
  await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
  await fs.rename(tmpPath, finalPath);
}
```

---

## How First-Class Concepts Layer On Top

The pattern for adding a new first-class concept (e.g., approvals, progress reports):

### Step 1: Define the payload schema

```typescript
// Example: Approval concept (future)
const ApprovalPayloadSchema = z.object({
  approvalType: z.enum(['deploy', 'release', 'access']),
  description: z.string().min(1),
  requiredApprovers: z.number().int().min(1),
  deadline: z.string().datetime().nullable(),
}).strict();
```

### Step 2: Define the response schema

```typescript
const ApprovalResponseSchema = z.object({
  approved: z.boolean(),
  comment: z.string().nullable(),
}).strict();
```

### Step 3: Create constructor functions

```typescript
function createApprovalEvent(input: ApprovalIn): ExternalEventIn {
  return {
    version: 1,
    type: 'approval',    // ← new type, generic layer unchanged
    createdAt: new Date().toISOString(),
    source: input.source,
    payload: ApprovalPayloadSchema.parse({ ... }),
  };
}
```

### Step 4: Add CLI commands

```bash
cg approval request --type deploy --description "Release v2.1"
cg approval respond {guid} --approve --comment "LGTM"
cg approval status {guid}
```

### Step 5: Add UI rendering

The overlay panel dispatches on `event.type`:

```typescript
function renderEvent(event: ExternalEventIn) {
  switch (event.type) {
    case 'question': return <QuestionPanel payload={event.payload} />;
    case 'approval': return <ApprovalPanel payload={event.payload} />;
    default:         return <GenericEventPanel event={event} />;
  }
}
```

**What stays the same:**
- `in.json` / `out.json` file format (generic envelope)
- File watcher adapter (watches for any `in.json` / `out.json`)
- SSE event broadcasting (emits `{ eventId, type }`)
- CLI polling mechanics (checks for `out.json`)
- Directory structure (`external-events/{guid}/`)

**What changes:**
- New payload schema (Zod)
- New constructor functions
- New CLI subcommand group
- New UI panel component

**Estimated effort per new concept**: ~2-3 files (schema + constructors + UI panel), zero changes to infrastructure.

---

## Validation Strategy

### Write-Time Validation (CLI / API)

```typescript
// When CLI creates a question
const event = createQuestionEvent(input);
ExternalEventInSchema.parse(event);        // validates envelope
QuestionPayloadSchema.parse(event.payload); // validates payload
writeEventFile(dir, 'in.json', event);
```

### Read-Time Validation (UI / API)

```typescript
// When UI reads a question
const raw = JSON.parse(await fs.readFile(inPath, 'utf-8'));
const envelope = ExternalEventInSchema.parse(raw);  // validates envelope

// Type dispatch on envelope.type
if (envelope.type === 'question') {
  const question = QuestionPayloadSchema.parse(envelope.payload);
  // render question UI
} else {
  // unknown type — show generic event view or skip
}
```

### Unknown Type Handling

When the UI encounters a `type` it doesn't recognize:
- **Don't crash**: Show a generic "External event from {source}" in the overlay
- **Don't hide**: The event is still visible (just not rendered with a specialized UI)
- **Log**: Console warn for development awareness

This is critical for forward compatibility — a newer CLI might write event types that an older UI doesn't know about.

---

## Question Type Rendering

| Question Type | in.json payload | UI Rendering | out.json answer type |
|--------------|-----------------|--------------|---------------------|
| `text` | `{ questionType: "text", text: "...", options: null }` | Text input field | `string` |
| `single` | `{ questionType: "single", text: "...", options: ["a", "b", "c"] }` | Radio buttons | `string` (selected option) |
| `multi` | `{ questionType: "multi", text: "...", options: ["a", "b", "c"] }` | Checkboxes | `string[]` (selected options) |
| `confirm` | `{ questionType: "confirm", text: "...", options: null }` | Yes / No buttons | `boolean` |

**All types** also show a freeform text field. The user can type additional context regardless of question type. This goes in `payload.text` in the out.json.

---

## Question Chaining at the Schema Level

Chains are **soft links** — each question is fully independent, but carries a `previousQuestionId` for UI threading.

### Chain Example

**Question 1** (guid: `abc`):
```json
{
  "version": 1,
  "type": "question",
  "createdAt": "2026-03-07T03:50:00.000Z",
  "source": "claude-code:agent-1",
  "payload": {
    "questionType": "confirm",
    "text": "Deploy to production?",
    "description": "All 247 tests passed...",
    "options": null,
    "default": false,
    "timeout": 600,
    "previousQuestionId": null
  }
}
```

**Answer 1** (user says "needs clarification"):
```json
{
  "version": 1,
  "status": "needs-clarification",
  "respondedAt": "2026-03-07T03:51:30.000Z",
  "respondedBy": "user:jordan",
  "payload": {
    "text": "Which environment? Staging or production?"
  }
}
```

**Question 2** (guid: `def`, links back to `abc`):
```json
{
  "version": 1,
  "type": "question",
  "createdAt": "2026-03-07T03:52:00.000Z",
  "source": "claude-code:agent-1",
  "payload": {
    "questionType": "single",
    "text": "Which environment should I deploy to?",
    "description": "You asked for clarification on the target environment...",
    "options": ["staging", "production"],
    "default": "staging",
    "timeout": 600,
    "previousQuestionId": "abc"
  }
}
```

### UI Threading

The UI walks the `previousQuestionId` chain to build a conversation view:

```
┌─ Question from claude-code:agent-1 ─────────── 3 min ago ─┐
│                                                             │
│  [Turn 1]  Deploy to production?                            │
│  All 247 tests passed...                                    │
│                                                             │
│  ✋ You asked: "Which environment? Staging or production?"   │
│                                                             │
│  [Turn 2]  Which environment should I deploy to?            │
│  You asked for clarification on the target environment...   │
│                                                             │
│  ○ staging (default)                                        │
│  ○ production                                               │
│                                                             │
│  Additional context: [________________]                     │
│                                                             │
│  [Submit]  [Needs More Info]  [Dismiss]                     │
└─────────────────────────────────────────────────────────────┘
```

### Chain Resolution

To build the conversation, the UI reads backward:

```typescript
async function resolveChain(questionId: string): Promise<ChainTurn[]> {
  const turns: ChainTurn[] = [];
  let currentId: string | null = questionId;

  while (currentId) {
    const inData = await readInJson(currentId);
    const outData = await readOutJson(currentId);  // may be null
    turns.unshift({ questionId: currentId, question: inData, answer: outData });
    currentId = inData.payload.previousQuestionId;
  }

  return turns;
}
```

**No index needed**: chains are short (typically 2-4 turns) and resolved lazily when the user opens the overlay.

---

## CLI ↔ Schema Mapping

### `cg question ask`

```bash
$ cg question ask \
    --type confirm \
    --text "Deploy to production?" \
    --description "All 247 tests passed. Build artifact: v2.1.0-rc3." \
    --timeout 600 \
    --previous abc123 \
    --source "deploy-script"
```

Maps to:
```
in.json = createQuestionEvent({
  questionType: 'confirm',
  text: 'Deploy to production?',
  description: 'All 247 tests passed...',
  timeout: 600,
  previousQuestionId: 'abc123',
  source: 'deploy-script',
})
```

**Output (blocking, answered)**:
```json
{
  "questionId": "2026-03-07T03-50-00-000Z_a8f3e",
  "status": "answered",
  "answer": true,
  "text": null,
  "respondedAt": "2026-03-07T03:51:30.000Z"
}
```

**Output (blocking, timeout)**:
```json
{
  "questionId": "2026-03-07T03-50-00-000Z_a8f3e",
  "status": "pending"
}
```

**Output (blocking, needs clarification)**:
```json
{
  "questionId": "2026-03-07T03-50-00-000Z_a8f3e",
  "status": "needs-clarification",
  "text": "Which environment? Staging or production?"
}
```

### `cg question get`

```bash
$ cg question get 2026-03-07T03-50-00-000Z_a8f3e
```

Reads `out.json` if present, returns same shape as blocking output.

### `cg question answer`

```bash
$ cg question answer 2026-03-07T03-50-00-000Z_a8f3e --answer "yes"
```

Writes `out.json` directly. Useful for testing and scripting.

### `cg question list`

```bash
$ cg question list
```

Enumerates all GUID directories, reads each `in.json`, checks for `out.json`:

```json
{
  "questions": [
    {
      "questionId": "2026-03-07T03-50-00-000Z_a8f3e",
      "status": "pending",
      "type": "confirm",
      "text": "Deploy to production?",
      "source": "deploy-script",
      "age": "3m"
    },
    {
      "questionId": "2026-03-07T03-49-00-000Z_z1y2x",
      "status": "answered",
      "type": "text",
      "text": "What API key should I use?",
      "source": "claude-code:agent-2",
      "age": "4m"
    }
  ]
}
```

---

## SSE Event Shape

Following ADR-0007 (minimal payloads) and the notification-fetch pattern (PL-10), SSE events contain only identifiers:

```typescript
// SSE event for question asked
{
  type: 'external-event',
  data: {
    eventId: '2026-03-07T03-50-00-000Z_a8f3e',
    eventType: 'question',
    action: 'created',
    source: 'claude-code:agent-1',
  }
}

// SSE event for question answered
{
  type: 'external-event',
  data: {
    eventId: '2026-03-07T03-50-00-000Z_a8f3e',
    eventType: 'question',
    action: 'responded',
    status: 'answered',
  }
}
```

The UI receives the SSE notification, then fetches full data via `GET /api/questions/{eventId}`.

---

## Open Questions

### Q1: Should `meta` support structured sub-schemas per source?

**RESOLVED**: No. Keep `meta` as `Record<string, unknown>` — fully unstructured. If a source needs typed metadata, they should create a first-class concept wrapper that includes those fields in the typed payload. `meta` is the escape hatch for ad-hoc context, not a typed extension point.

### Q2: Should the generic layer have its own CLI (`cg event emit`)?

**RESOLVED**: Not in Plan 067. The generic layer is infrastructure — callers interact with first-class concepts only. A raw `cg event emit` command could be added later for power users and debugging, but it's not needed for the question-and-answer use case.

### Q3: Should in.json include the GUID, or is the directory name sufficient?

**RESOLVED**: The directory name IS the GUID. in.json does not duplicate it. This prevents the guid-in-filename and guid-in-file from getting out of sync. When reading, the GUID comes from the directory name.

### Q4: What if in.json is malformed?

**RESOLVED**: Per PL-07, skip gracefully. If `ExternalEventInSchema.parse()` fails, the UI shows a "malformed event" entry in the history (not an error popup). The file watcher still fires the SSE event, but the UI marks it as unreadable. The CLI `cg question list` also marks it with `status: "error"`.

### Q5: Should out.json be immutable once written?

**RESOLVED**: Yes. Once `out.json` exists, it's final. You cannot change an answer. If the user wants to provide a different answer, the agent must ask a new question (possibly in a chain via `previousQuestionId`). This keeps the system simple and prevents race conditions.

### Q6: How does `payload.text` in out.json differ from `payload.answer`?

**RESOLVED**: `answer` is the structured response (boolean for confirm, string for text, string[] for multi). `text` is the freeform additional context the user typed — it's always a string and always optional. Think of `answer` as the machine-readable value and `text` as the human commentary. For `needs-clarification`, only `text` is present (no `answer`).

---

## Quick Reference

### Generic Envelope Fields

| Field | in.json | out.json | Required | Description |
|-------|---------|----------|----------|-------------|
| `version` | ✅ | ✅ | yes | Schema version (always `1`) |
| `type` | ✅ | — | yes | Event type discriminator |
| `status` | — | ✅ | yes | Response status |
| `createdAt` | ✅ | — | yes | ISO-8601 creation time |
| `respondedAt` | — | ✅ | yes | ISO-8601 response time |
| `source` | ✅ | — | yes | Who created the event |
| `respondedBy` | — | ✅ | yes | Who responded |
| `payload` | ✅ | ✅ | yes | Type-specific data |
| `meta` | ✅ | ✅ | no | Unstructured pass-through |

### Question-Specific Fields (in payload)

| Field | in.json payload | out.json payload | Required | Description |
|-------|----------------|-----------------|----------|-------------|
| `questionType` | ✅ | — | yes | text / single / multi / confirm |
| `text` | ✅ | ✅ | yes (in), no (out) | Question text (in) / freeform commentary (out) |
| `description` | ✅ | — | no | Markdown context |
| `options` | ✅ | — | no | Choices for single/multi |
| `default` | ✅ | — | no | Default answer |
| `timeout` | ✅ | — | yes | CLI block duration (seconds) |
| `previousQuestionId` | ✅ | — | no | Chain link |
| `answer` | — | ✅ | no | Structured answer value |

### Status Values

| Status | Who Writes It | Meaning |
|--------|--------------|---------|
| `answered` | UI / API | User provided an answer |
| `needs-clarification` | UI / API | User wants more info |
| `dismissed` | UI / API | User explicitly dismissed |
| `pending` | (no out.json) | Not yet responded — inferred, not stored |

### Adding a New Event Type Checklist

```
[ ] Define payload Zod schema (packages/shared/src/question-popper/schemas/)
[ ] Define response Zod schema
[ ] Create constructor functions (createXxxEvent, parseXxxEvent)
[ ] Add CLI subcommand group (cg xxx ...)
[ ] Add UI panel component (XxxPanel)
[ ] Add dispatch case in overlay renderer
[ ] (Optional) Add first-class composed types (XxxIn, XxxOut)
[ ] No changes needed to: generic envelope, file watcher, SSE pipeline, directory structure
```
