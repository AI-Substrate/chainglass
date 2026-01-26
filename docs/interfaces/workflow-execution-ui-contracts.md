# Workflow Execution UI - Interface & Data Contract Documentation

**Document ID**: IC-DOC-001  
**Date**: 2026-01-26  
**Purpose**: Comprehensive reference for all data contracts and interfaces used in workflow execution UI

---

## Overview

This document catalogs the interfaces, types, and data contracts that define the workflow execution UI layer. These contracts connect the `@chainglass/workflow` package (backend domain logic) with the `apps/web` React UI (frontend visualization).

**Key Design Principles** (from Plan 010):
1. **Unified Entity Model**: Workflow/Run/Checkpoint use same structure, different populated state
2. **Factory Pattern**: Enforces XOR invariant (isCurrent XOR isCheckpoint XOR isRun)
3. **Explicit Serialization**: `toJSON()` converts Date→ISO string, undefined→null, camelCase keys
4. **Type Safety**: TypeScript interfaces mirror JSON schemas for validation

---

## IC-01: Workflow Entity Interface

**Location**: `packages/workflow/src/entities/workflow.ts`  
**Purpose**: Unified model for workflows loaded from current/, checkpoints/, or runs/

### Core Interface

```typescript
export class Workflow {
  // Identity & Source
  readonly slug: string;                      // Workflow directory name
  readonly workflowDir: string;               // Absolute path to source
  readonly version: string;                   // Semantic version from wf.yaml
  readonly description: string | undefined;   // Optional description
  
  // Phases
  readonly phases: ReadonlyArray<Phase>;      // Ordered phases
  
  // Source Discriminators (XOR invariant enforced)
  readonly isCurrent: boolean;                // From current/ (editable)
  readonly checkpoint: CheckpointMetadata | null;  // From checkpoints/
  readonly run: RunMetadata | null;                // From runs/
  
  // Factory Methods (constructor is private)
  static createCurrent(input: CurrentWorkflowInput): Workflow;
  static createCheckpoint(input: CheckpointWorkflowInput): Workflow;
  static createRun(input: RunWorkflowInput): Workflow;
  
  // Computed Properties
  get isCheckpoint(): boolean;  // checkpoint !== null && run === null
  get isRun(): boolean;         // run !== null
  get isTemplate(): boolean;    // isCurrent || isCheckpoint
  get source(): 'current' | 'checkpoint' | 'run';
  
  // Serialization
  toJSON(): WorkflowJSON;
}
```

### Supporting Types

```typescript
export interface CheckpointMetadata {
  readonly ordinal: number;        // 1-based version (e.g., 1 for v001)
  readonly hash: string;           // 8-character content hash
  readonly createdAt: Date;        // Creation timestamp
  readonly comment?: string;       // Optional description
}

export interface RunMetadata {
  readonly runId: string;          // e.g., 'run-2026-01-25-001'
  readonly runDir: string;         // Absolute path to run directory
  readonly status: RunStatus;      // 'pending' | 'active' | 'complete' | 'failed'
  readonly createdAt: Date;        // Creation timestamp
}

export interface WorkflowJSON {
  slug: string;
  workflowDir: string;
  version: string;
  description: string | null;      // undefined→null in JSON
  isCurrent: boolean;
  isCheckpoint: boolean;
  isRun: boolean;
  isTemplate: boolean;
  source: 'current' | 'checkpoint' | 'run';
  checkpoint: CheckpointMetadataJSON | null;
  run: RunMetadataJSON | null;
  phases: (PhaseJSON | Phase)[];   // Serialized or raw phases
}
```

**Design Decisions**:
- **Factory Pattern**: Private constructor + static factories enforce XOR invariant
- **Immutability**: All fields readonly, phases frozen array
- **Explicit JSON**: `toJSON()` handles Date→ISO, undefined→null conversions

---

## IC-02: Phase Entity Interface

**Location**: `packages/workflow/src/entities/phase.ts`  
**Purpose**: Unified model for template and run phases with 20+ nested properties

### Core Interface

```typescript
export class Phase {
  // ===== Identity =====
  readonly name: string;           // Phase name (e.g., 'gather', 'process')
  readonly phaseDir: string;       // Absolute path to phase directory
  readonly runDir: string;         // Absolute path to run directory
  
  // ===== From Definition =====
  readonly description: string;    // Human-readable description
  readonly order: number;          // Execution order (1-based)
  
  // ===== Runtime State =====
  readonly status: PhaseRunStatus; // See IC-04 for status types
  readonly facilitator: Facilitator; // 'agent' | 'orchestrator'
  readonly state: PhaseState;      // See IC-04 for state types
  readonly startedAt: Date | undefined;
  readonly completedAt: Date | undefined;
  
  // ===== Input Files =====
  readonly inputFiles: ReadonlyArray<PhaseInputFile>;
  
  // ===== Input Parameters =====
  readonly inputParameters: ReadonlyArray<PhaseInputParameter>;
  
  // ===== Input Messages =====
  readonly inputMessages: ReadonlyArray<PhaseInputMessage>;
  
  // ===== Output Files =====
  readonly outputs: ReadonlyArray<PhaseOutput>;
  
  // ===== Output Parameters =====
  readonly outputParameters: ReadonlyArray<PhaseOutputParameter>;
  
  // ===== Status History =====
  readonly statusHistory: ReadonlyArray<PhaseStatusEntry>;
  
  // ===== Messages =====
  readonly messages: ReadonlyArray<unknown>; // Loaded from messages/ folder
  
  // Computed Properties
  get duration(): number | undefined;  // ms between start and completion
  get isPending(): boolean;
  get isReady(): boolean;
  get isActive(): boolean;
  get isBlocked(): boolean;
  get isComplete(): boolean;
  get isFailed(): boolean;
  get isDone(): boolean;
  
  // Serialization
  toJSON(): PhaseJSON;
}
```

### Nested Input/Output Types

```typescript
export interface PhaseInputFile {
  readonly name: string;
  readonly required: boolean;
  readonly description?: string;
  readonly fromPhase?: string;     // Source phase for cross-phase inputs
  readonly exists: boolean;        // Runtime state
  readonly path: string;           // Absolute path
}

export interface PhaseInputParameter {
  readonly name: string;
  readonly required: boolean;
  readonly description?: string;
  readonly fromPhase?: string;
  readonly value: unknown | undefined; // Resolved value
}

export interface PhaseInputMessage {
  readonly id: string;             // Message ID (e.g., '001')
  readonly type: 'single_choice' | 'multi_choice' | 'free_text' | 'confirm';
  readonly from: 'agent' | 'orchestrator';
  readonly required: boolean;
  readonly subject: string;
  readonly prompt?: string;
  readonly options?: ReadonlyArray<PhaseMessageOption>;
  readonly description?: string;
  readonly exists: boolean;        // Message file exists
  readonly answered: boolean;      // Answer provided
}

export interface PhaseMessageOption {
  readonly key: string;            // Single letter (A, B, C, etc.)
  readonly label: string;
  readonly description?: string;
}

export interface PhaseOutput {
  readonly name: string;
  readonly type: 'file';
  readonly required: boolean;
  readonly schema?: string;        // Path to JSON schema
  readonly description?: string;
  readonly exists: boolean;        // Output file exists
  readonly valid: boolean;         // Schema validation passed
  readonly path: string;
}

export interface PhaseOutputParameter {
  readonly name: string;
  readonly source: string;         // Source output file
  readonly query: string;          // Dot-notation extraction path
  readonly description?: string;
  readonly value: unknown | undefined; // Extracted value
}

export interface PhaseStatusEntry {
  readonly timestamp: string;      // ISO 8601
  readonly from: Facilitator;
  readonly action: ActionType;     // See IC-04
  readonly messageId?: string;
  readonly comment?: string;
  readonly data?: Record<string, unknown>;
}
```

**Key Invariant**: Template Phase ≡ Run Phase (same fields, different values)
- **Template**: exists=false, value=undefined, status='pending'
- **Run**: exists=true/false, value=populated, status=runtime

---

## IC-03: SSE Event Schemas

**Location**: `apps/web/src/lib/schemas/sse-events.schema.ts`  
**Purpose**: Server-Sent Event contracts for real-time workflow updates

### Discriminated Union

```typescript
import { z } from 'zod';

// Base event structure
const baseEventSchema = z.object({
  id: z.string().optional(),           // For deduplication
  timestamp: z.string().datetime(),    // ISO 8601
});

// Discriminated union of all event types
export const sseEventSchema = z.discriminatedUnion('type', [
  workflowStatusEventSchema,
  taskUpdateEventSchema,
  heartbeatEventSchema,
]);

export type SSEEvent = z.infer<typeof sseEventSchema>;
```

### Event Types

```typescript
// Workflow status update
export type WorkflowStatusEvent = {
  type: 'workflow_status';
  id?: string;
  timestamp: string;
  data: {
    workflowId: string;
    phase: 'pending' | 'running' | 'completed' | 'failed';
    progress?: number;  // 0-100
  };
};

// Task update (Kanban board)
export type TaskUpdateEvent = {
  type: 'task_update';
  id?: string;
  timestamp: string;
  data: {
    taskId: string;
    columnId: string;
    position: number;
  };
};

// Heartbeat (keep-alive)
export type HeartbeatEvent = {
  type: 'heartbeat';
  id?: string;
  timestamp: string;
  data: {};  // Empty object
};
```

**Usage**: SSEManager validates incoming events, UI components subscribe to specific event types.

---

## IC-04: Run Status & Phase State Types

**Location**: `packages/workflow/src/types/wf-status.types.ts` and `wf-phase.types.ts`  
**Purpose**: Type-safe status tracking for runs and phases

### Run Status

```typescript
/**
 * Overall run status
 */
export type RunStatus = 'pending' | 'active' | 'complete' | 'failed';

/**
 * Phase status within a run
 */
export type PhaseRunStatus =
  | 'pending'   // Not started
  | 'ready'     // Inputs satisfied, can start
  | 'active'    // Currently executing
  | 'blocked'   // Waiting for input/question
  | 'accepted'  // Agent accepted control
  | 'complete'  // Successfully finished
  | 'failed';   // Failed with error
```

### Phase State & Actions

```typescript
/**
 * Current phase state (mirrors PhaseRunStatus)
 */
export type PhaseState =
  | 'pending'
  | 'ready'
  | 'active'
  | 'blocked'
  | 'accepted'
  | 'complete'
  | 'failed';

/**
 * Who controls the phase
 */
export type Facilitator = 'agent' | 'orchestrator';

/**
 * Actions logged in status history
 */
export type ActionType =
  | 'prepare'    // Phase preparation
  | 'input'      // Input provided
  | 'handover'   // Control transferred
  | 'accept'     // Agent accepted
  | 'preflight'  // Pre-execution check
  | 'question'   // Message created
  | 'error'      // Error occurred
  | 'answer'     // Message answered
  | 'finalize';  // Phase finalized
```

### Status Tracking Interface

```typescript
export interface WfStatus {
  workflow: WfStatusWorkflow;
  run: WfStatusRun;
  phases: Record<string, WfStatusPhase>;  // Keyed by phase name
}

export interface WfStatusWorkflow {
  name: string;              // Workflow slug
  version: string;           // Semantic version
  template_path: string;     // Path to template
  slug?: string;             // Optional registry slug
  version_hash?: string;     // 8-char checkpoint hash
  checkpoint_comment?: string;
}

export interface WfStatusRun {
  id: string;                // Run identifier
  created_at: string;        // ISO 8601
  status: RunStatus;
}

export interface WfStatusPhase {
  order: number;             // Execution order (1-based)
  status: PhaseRunStatus;
  started_at?: string;       // ISO 8601
  completed_at?: string;     // ISO 8601
}
```

---

## IC-05: Message Interface (Questions & Answers)

**Location**: `packages/workflow/src/types/message.types.ts` and `interfaces/message-service.interface.ts`  
**Purpose**: Agent-orchestrator communication during phase execution

### Message Types

```typescript
/**
 * Message type determines answer format
 */
export type MessageType = 'single_choice' | 'multi_choice' | 'free_text' | 'confirm';

export interface Message {
  id: string;                // 3-digit sequential (e.g., '001')
  created_at: string;        // ISO 8601
  from: 'agent' | 'orchestrator';
  type: MessageType;
  subject: string;           // Brief subject line
  body: string;              // Full message text
  note?: string | null;      // Creator's note
  options?: MessageOption[]; // For choice types
  answer?: MessageAnswer;    // Added when answered
}

export interface MessageOption {
  key: string;               // Single letter (A, B, C, etc.)
  label: string;             // Short label
  description?: string;      // Detailed description
}

export interface MessageAnswer {
  answered_at: string;       // ISO 8601
  selected?: string[];       // For single/multi choice
  text?: string;             // For free_text
  confirmed?: boolean;       // For confirm
  note?: string | null;      // Answerer's rationale
}
```

### Message Service Interface

```typescript
export interface MessageContent {
  subject: string;
  body: string;
  note?: string | null;
  options?: Array<{
    key: string;
    label: string;
    description?: string;
  }>;
}

export interface AnswerInput {
  selected?: string[];       // single_choice: exactly 1, multi_choice: 1+
  text?: string;             // free_text only
  confirmed?: boolean;       // confirm only
  note?: string | null;
}

export interface IMessageService {
  create(
    phase: string,
    runDir: string,
    type: MessageType,
    content: MessageContent,
    from?: 'agent' | 'orchestrator'
  ): Promise<MessageCreateResult>;

  answer(
    phase: string,
    runDir: string,
    id: string,
    answer: AnswerInput,
    from?: 'agent' | 'orchestrator'
  ): Promise<MessageAnswerResult>;

  list(phase: string, runDir: string): Promise<MessageListResult>;
  read(phase: string, runDir: string, id: string): Promise<MessageReadResult>;
}
```

**Error Codes** (E060-E064):
- **E060**: MESSAGE_NOT_FOUND
- **E061**: MESSAGE_TYPE_MISMATCH
- **E062**: MESSAGE_AWAITING_ANSWER
- **E063**: MESSAGE_ALREADY_ANSWERED
- **E064**: MESSAGE_VALIDATION_FAILED

---

## IC-06: React Flow Node & Edge Types

**Location**: `apps/web/src/data/fixtures/flow.fixture.ts` and `components/workflow/index.ts`  
**Purpose**: Custom node types for workflow visualization

### Node Data Interface

```typescript
import type { Node, Edge } from '@xyflow/react';

/**
 * Custom node data for workflow visualization
 */
export interface WorkflowNodeData {
  label: string;
  status?: 'pending' | 'running' | 'completed' | 'failed';
  description?: string;
  [key: string]: unknown;  // Extensible for custom data
}

export type WorkflowNode = Node<WorkflowNodeData>;
export type WorkflowEdge = Edge;
```

### Node Type Registry

```typescript
import type { NodeTypes } from '@xyflow/react';

/**
 * Node types mapping for ReactFlow registration
 * Pass to <ReactFlow nodeTypes={nodeTypes} />
 */
export const nodeTypes: NodeTypes = {
  workflow: WorkflowNode,  // Standard workflow steps
  phase: PhaseNode,        // Workflow phases
  agent: AgentNode,        // AI agent nodes
};
```

### Example Flow Structure

```typescript
const DEMO_FLOW: { nodes: WorkflowNode[]; edges: WorkflowEdge[] } = {
  nodes: [
    {
      id: 'node-1',
      type: 'workflow',
      position: { x: 0, y: 0 },
      data: {
        label: 'Source Code',
        status: 'completed',
        description: 'Git repository checkout',
      },
    },
    // ... more nodes
  ],
  edges: [
    { id: 'edge-1-2', source: 'node-1', target: 'node-2' },
    // ... more edges
  ],
};
```

**Node Type Semantics**:
- **workflow**: Generic workflow step
- **phase**: Specific workflow phase (maps to Phase entity)
- **agent**: AI agent execution node

---

## IC-07: Kanban Board Types

**Location**: `apps/web/src/data/fixtures/board.fixture.ts`  
**Purpose**: Task board visualization for workflow execution

### Board Structure

```typescript
export type CardId = string;
export type ColumnId = string;

export interface Card {
  id: CardId;
  title: string;
  description?: string;
  priority?: 'low' | 'medium' | 'high';
  labels?: string[];
}

export interface Column {
  id: ColumnId;
  title: string;
  cards: Card[];
}

export interface BoardState {
  columns: Column[];  // Nested array structure for dnd-kit
}
```

**Design Decision** (DYK-04): Nested column arrays for dnd-kit compatibility (not normalized map).

---

## IC-08: Workflow Definition Types

**Location**: `packages/workflow/src/types/wf.types.ts`  
**Purpose**: Schema for workflow template files (wf.yaml)

### Workflow Definition

```typescript
export interface WfDefinition {
  name: string;              // Slug format: ^[a-z][a-z0-9-]*$
  version: string;           // Semantic: ^\d+\.\d+\.\d+$
  description?: string;
  phases: Record<string, PhaseDefinition>;
}

export interface PhaseDefinition {
  description: string;
  order: number;             // 1-based execution order
  inputs?: InputDeclaration;
  outputs: Output[];
  output_parameters?: OutputParameter[];
}
```

### Input Declarations

```typescript
export interface InputDeclaration {
  files?: FileInput[];
  parameters?: ParameterInput[];
  messages?: MessageInput[];
}

export interface FileInput {
  name: string;              // Must match source output if from_phase set
  required: boolean;
  description?: string;
  from_phase?: string;       // Cross-phase dependency
}

export interface ParameterInput {
  name: string;              // Must match source output_parameter
  required: boolean;
  description?: string;
  from_phase?: string;
}

export interface MessageInput {
  id: string;                // Becomes m-{id}.json
  type: 'single_choice' | 'multi_choice' | 'free_text' | 'confirm';
  from: 'agent' | 'orchestrator';
  required: boolean;
  subject: string;
  prompt?: string;           // Guidance for UI/agent
  options?: MessageOption[];
  description?: string;
}
```

### Output Declarations

```typescript
export interface Output {
  name: string;
  type: 'file';              // Only file supported currently
  required: boolean;
  schema?: string;           // Relative path to JSON schema
  description?: string;
}

export interface OutputParameter {
  name: string;              // For downstream reference
  source: string;            // Source output file
  query: string;             // Dot-notation path (e.g., 'items.length')
  description?: string;
}
```

**Schema Compliance**: Types mirror `wf.schema.json` for validation.

---

## IC-09: Workflow Adapter Interface

**Location**: `packages/workflow/src/interfaces/workflow-adapter.interface.ts`  
**Purpose**: Filesystem access layer for workflows, checkpoints, and runs

### Core Interface

```typescript
export interface RunListFilter {
  status?: RunStatus;        // Filter by run status
  since?: Date;              // Created after date
  before?: Date;             // Created before date
  limit?: number;            // Max results
  offset?: number;           // Pagination offset
  sortBy?: 'created' | 'status';
  sortOrder?: 'asc' | 'desc';
}

export interface IWorkflowAdapter {
  /**
   * Load workflow from current/ directory
   */
  loadCurrent(slug: string): Promise<Workflow>;

  /**
   * Load workflow from checkpoint
   */
  loadCheckpoint(slug: string, ordinal: number): Promise<Workflow>;

  /**
   * Load workflow from run
   */
  loadRun(slug: string, runId: string): Promise<Workflow>;

  /**
   * List available checkpoints for a workflow
   */
  listCheckpoints(slug: string): Promise<CheckpointMetadata[]>;

  /**
   * List runs with optional filtering
   */
  listRuns(slug: string, filter?: RunListFilter): Promise<RunMetadata[]>;

  /**
   * Check if workflow exists in current/
   */
  exists(slug: string): Promise<boolean>;
}
```

**Design**: Pure data adapter, no business logic. Service layer consumes this for higher-level operations.

---

## IC-10: Phase State Tracking Schema

**Location**: `packages/workflow/src/types/wf-phase.types.ts`  
**Purpose**: Phase lifecycle and history tracking (wf-data/wf-phase.json)

### Phase State File

```typescript
export interface WfPhaseState {
  phase: string;             // Phase name (e.g., 'gather', 'process')
  facilitator: Facilitator;  // 'agent' | 'orchestrator'
  state: PhaseState;         // Current phase state
  status: StatusEntry[];     // Append-only history
}

export interface StatusEntry {
  timestamp: string;         // ISO 8601
  from: Facilitator;
  action: ActionType;        // Type of action performed
  message_id?: string;       // For input/question/answer actions
  comment?: string;          // Human-readable description
  data?: Record<string, unknown>; // Optional payload
}
```

**Action Flow Example**:

```typescript
// Phase lifecycle status entries
[
  { timestamp: "2026-01-26T10:00:00Z", from: "agent", action: "prepare" },
  { timestamp: "2026-01-26T10:01:00Z", from: "agent", action: "question", message_id: "001" },
  { timestamp: "2026-01-26T10:05:00Z", from: "orchestrator", action: "answer", message_id: "001" },
  { timestamp: "2026-01-26T10:06:00Z", from: "agent", action: "finalize" },
]
```

**Append-Only**: Status array is never modified, only appended for audit trail.

---

## Cross-Reference Map

| UI Component | Backend Interface | Data Contract |
|--------------|-------------------|---------------|
| Workflow Viewer | `Workflow.toJSON()` | `WorkflowJSON` (IC-01) |
| Phase Detail Panel | `Phase.toJSON()` | `PhaseJSON` (IC-02) |
| ReactFlow Canvas | `nodeTypes` | `WorkflowNode/Edge` (IC-06) |
| Kanban Board | `BoardState` | `Column/Card` (IC-07) |
| SSE Listener | `sseEventSchema` | `SSEEvent` (IC-03) |
| Run Status Display | `WfStatus` | Run/Phase status types (IC-04) |
| Message Dialog | `IMessageService` | `Message/MessageAnswer` (IC-05) |

---

## Key Design Patterns

### 1. Factory Pattern (IC-01)
- **Problem**: Enforce XOR invariant (workflow is exactly one source type)
- **Solution**: Private constructor + static factory methods
- **Benefits**: Compile-time safety, clear creation semantics

### 2. Discriminated Unions (IC-03, IC-04)
- **Problem**: Type-safe event/status handling
- **Solution**: Union types with literal discriminators
- **Benefits**: TypeScript exhaustiveness checking, no runtime errors

### 3. Explicit Serialization (IC-01, IC-02)
- **Problem**: JavaScript Date/undefined not JSON-serializable
- **Solution**: `toJSON()` methods with explicit conversions
- **Benefits**: Predictable API responses, no surprises

### 4. Result Objects (IC-05, IC-09)
- **Problem**: Error handling without exceptions
- **Solution**: Return `{ data, errors }` objects
- **Benefits**: Explicit error handling, no control flow via exceptions

---

## Testing Strategy

### Entity Testing
- **Constructor Validation**: Ensure factories enforce invariants
- **Serialization**: Verify `toJSON()` output matches schema
- **Computed Properties**: Test getters for all states

### Schema Validation
- **Zod Schemas**: Test SSE event parsing with valid/invalid data
- **Type Guards**: Verify discriminated union narrowing

### Fixture Testing
- **React Flow**: Ensure demo flows match expected node/edge types
- **Kanban**: Verify board state structure for dnd-kit

---

## Future Enhancements

1. **Streaming Updates**: Extend SSE events for partial phase progress
2. **Batch Operations**: Add bulk message create/answer APIs
3. **Real-time Collaboration**: Multi-user status updates via SSE
4. **GraphQL Integration**: Consider GraphQL for complex queries
5. **Optimistic Updates**: Client-side state prediction for UX

---

## References

- **Plan 010**: Entity Upgrade Design (unified Workflow/Run/Checkpoint model)
- **DYK-02**: Factory pattern for XOR invariant enforcement
- **DYK-03**: toJSON() serialization rules
- **DYK-04**: Nested arrays for dnd-kit compatibility
- **DYK-06**: ReactFlow nodeTypes registration requirement

---

**Document Status**: ✅ Complete  
**Last Updated**: 2026-01-26  
**Reviewer**: Pending
