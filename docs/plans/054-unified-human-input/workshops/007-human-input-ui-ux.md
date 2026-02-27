# Workshop: Human Input UI & User Experience

> **Note**: This workshop was written before the engine Q&A protocol was confirmed as deprecated. References to "agent question mode" and "dual mode" are superseded — the `HumanInputModal` is a standalone component for user-input nodes only. The deprecated `QAModal` continues to service legacy dope demo questions separately. All node card states, modal layouts for user-input, multi-output forms, and interaction flows remain valid.

**Type**: UI Design / Interaction Pattern
**Plan**: 054-unified-human-input
**Spec**: [unified-human-input-spec.md](../unified-human-input-spec.md)
**Created**: 2026-02-27
**Status**: Draft

**Related Documents**:
- [Workshop 006: Unified Human Input Design](./006-unified-human-input-design.md) — data model & integration pattern
- [Workshop 003: Per-Instance Work Unit Configuration (Plan 050)](../../050-workflow-page-ux/workshops/003-per-instance-work-unit-configuration.md)
- [QA Modal (current)](../../../../apps/web/src/features/050-workflow-page/components/qa-modal.tsx)
- [WorkflowNodeCard](../../../../apps/web/src/features/050-workflow-page/components/workflow-node-card.tsx)

**Domain Context**:
- **Primary Domain**: `workflow-ui` (owns the modal, node card, editor, all interaction)
- **Related Domains**: `_platform/positional-graph` (provides `NodeStatusResult`, unit config, output storage)

---

## Purpose

Define the visual design, interaction flows, and component layout for unified human input in the workflow editor. This workshop ensures the user sees a single coherent experience whether answering an agent's mid-execution question or providing data to a user-input node — while supporting multi-output nodes with partial save state.

## Key Questions Addressed

- What does a user-input node look like on the canvas in each state?
- How does the Human Input modal layout differ from the current QA modal?
- How do multi-output nodes present in the modal?
- What's the interaction flow from click to completion?
- How does partial save state work visually?

---

## Current State: What Exists Today

### Page Layout (unchanged by this feature)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  ↶ 3  ↷ 0   demo-serial                                      from: (none) │ ← Top bar
├─────────────────────────────────────────────────────────┬────────────────────┤
│                                                         │  Work Units       │
│  ── Line 1 ─────────────────────────────────────────    │                   │
│  ┌──────────────┐     ┌──────────────┐                  │  🔎 Search...     │
│  │ 👤 sample-   │     │ 🤖 sample-   │                  │                   │
│  │    input      │     │    coder     │                  │  ▾ 🤖 Agents (3) │
│  │              │     │              │                  │    sample-coder   │
│  │  ○ Pending   │     │  ○ Pending   │                  │    sample-spec... │
│  └──────────────┘     └──────────────┘                  │                   │
│                                                         │  ▾ ⚙️ Code (1)    │
│  ── Line 2 ─────────────────────────────────────────    │    sample-pr-...  │
│  ┌──────────────┐                                       │                   │
│  │ 🤖 sample-   │                                       │  ▾ 👤 Human (1)  │
│  │    tester     │                                       │    sample-input   │
│  │              │                                       │                   │
│  │  ○ Pending   │                                       │                   │
│  └──────────────┘                                       │                   │
│                                                         │                   │
│  + Add Line                                             │                   │
│                                                         │                   │
└─────────────────────────────────────────────────────────┴────────────────────┘
                                                           260px, resizable
```

### Current QA Modal (agent questions only)

```
┌─ Question ────────────────────────────────────────────┐
│                                                    ✕  │
│  Node: sample-coder-a22                               │
├───────────────────────────────────────────────────────┤
│                                                       │
│  What approach should I take for implementing the     │
│  authentication system?                               │
│                                                       │
│  ┌─────────────────────────────────────────────────┐  │
│  │ Type your answer...                             │  │  ← text input
│  └─────────────────────────────────────────────────┘  │
│                                                       │
│  Additional notes (optional)                          │
│  ┌─────────────────────────────────────────────────┐  │
│  │ Add any additional context...                   │  │  ← always-on freeform
│  │                                                 │  │
│  └─────────────────────────────────────────────────┘  │
│                                                       │
├───────────────────────────────────────────────────────┤
│                           [Cancel]  [Submit Answer]   │
└───────────────────────────────────────────────────────┘
```

### Current Node Card (user-input, broken)

```
┌──────────────────────┐
│ 👤 sample-input      │
│                      │
│  ○ Pending       ⚪  │   ← gray dot, no interaction, stuck forever
└────────────green─────┘
   context bottom border
```

---

## New State: After This Feature

### Node Card States for `user-input` Type

#### State 1: Pending (gates blocking)

When the user-input node is NOT ready (e.g., preceding line not complete):

```
┌──────────────────────┐
│ 👤 sample-input      │
│                      │
│  ○ Pending       ⚪  │   ← standard gray treatment
│  ┌ Preceding Lines ┐ │   ← gate chip shows why blocked
│  └─ ✕ Not complete ┘ │
└────────────green─────┘
```

No click action. Standard `pending` appearance. Same as today.

#### State 2: Awaiting Input (ready, no data yet)

When the user-input node is ready (all gates pass) but hasn't been filled in:

```
┌──────────────────────┐
│ 👤 sample-input      │
│                      │
│  ? Awaiting Input ⚪  │   ← VIOLET badge, clickable
└────────────green─────┘
     ↑                      
     click opens Human Input modal
```

- Badge colour: `bg-violet-50 text-violet-600` (same as `waiting-question`)
- Badge is **clickable** (cursor pointer, hover ring)
- Title tooltip: "Click to provide input"
- `data-testid="input-badge-{nodeId}"`

#### State 3: Partially Filled (multi-output, some saved)

When a multi-output user-input node has some but not all required outputs filled:

```
┌──────────────────────┐
│ 👤 project-config    │
│                      │
│  ? 1/2 filled    ⚪  │   ← VIOLET badge, progress indicator
└────────────green─────┘
     ↑
     click re-opens modal showing saved + unsaved fields
```

- Badge text: `N/M filled` where N = saved count, M = required count
- Still violet — node isn't complete until all required outputs have data
- Clickable to continue filling

#### State 4: Complete (all outputs filled)

```
┌──────────────────────┐
│ 👤 sample-input      │
│                      │
│  ✓ Complete      ⚪  │   ← GREEN badge, standard complete
└────────────green─────┘
```

Standard `complete` treatment. No special behaviour. Same as any other completed node.

---

## Human Input Modal: Unified Design

### Single-Output Node (common case)

The most common user-input unit has one output (e.g., `sample-input` with output `spec`).

```
┌─ Human Input ─────────────────────────────────────────┐
│                                                    ✕  │
│  👤 sample-input                                      │
├───────────────────────────────────────────────────────┤
│                                                       │
│  SPEC                                          text   │ ← output name + type badge
│  ──────────────────────────────────────────────────── │
│  What code would you like to generate?                │ ← prompt from unit.yaml
│                                                       │
│  ┌─────────────────────────────────────────────────┐  │
│  │ Build a REST API for user management with       │  │ ← input field (type depends on
│  │ authentication and pagination...                │  │    question_type: text|single|
│  └─────────────────────────────────────────────────┘  │    multi|confirm)
│                                                       │
│  Additional notes (optional)                          │
│  ┌─────────────────────────────────────────────────┐  │
│  │ Should support both JWT and session auth        │  │ ← always-on freeform
│  │                                                 │  │
│  └─────────────────────────────────────────────────┘  │
│                                                       │
├───────────────────────────────────────────────────────┤
│                              [Cancel]  [Submit]       │
└───────────────────────────────────────────────────────┘
```

**Differences from current QA modal**:
- Header: "Human Input" (not "Question")
- Shows unit slug with 👤 icon below header
- Output name + type label shown above the prompt
- Button text: "Submit" (not "Submit Answer")

### Single-Choice Example

```
┌─ Human Input ─────────────────────────────────────────┐
│                                                    ✕  │
│  👤 db-selector                                       │
├───────────────────────────────────────────────────────┤
│                                                       │
│  DATABASE                                    single   │
│  ──────────────────────────────────────────────────── │
│  Which database should we use?                        │
│                                                       │
│  ┌─────────────────────────────────────────────────┐  │
│  │  ○  PostgreSQL                                  │  │
│  │  ●  MySQL                     ← selected        │  │
│  │  ○  SQLite                                      │  │
│  └─────────────────────────────────────────────────┘  │
│                                                       │
│  Additional notes (optional)                          │
│  ┌─────────────────────────────────────────────────┐  │
│  │ Need MySQL for legacy system compat             │  │
│  └─────────────────────────────────────────────────┘  │
│                                                       │
├───────────────────────────────────────────────────────┤
│                              [Cancel]  [Submit]       │
└───────────────────────────────────────────────────────┘
```

### Multi-Choice + Confirm Examples

```
Multi-choice:                            Confirm:
┌────────────────────────────┐          ┌────────────────────────────┐
│  FEATURES               multi│          │  PROCEED             confirm│
│  ──────────────────────────│          │  ──────────────────────────│
│  Select features to include │          │  Ready to deploy to prod?  │
│                             │          │                            │
│  ☑ Authentication           │          │  ┌─────────┐ ┌──────────┐ │
│  ☑ Pagination               │          │  │   Yes   │ │    No    │ │
│  ☐ File uploads             │          │  └─────────┘ └──────────┘ │
│  ☑ Rate limiting            │          │                            │
└─────────────────────────────┘          └────────────────────────────┘
```

---

### Multi-Output Node (form with multiple fields)

When a unit declares multiple outputs, each output becomes a field in the modal. Each field can be saved independently.

**Example unit.yaml**:
```yaml
slug: project-config
type: user-input
outputs:
  - name: requirements
    type: data
    data_type: text
    required: true
    description: "Describe your project requirements"
  - name: language
    type: data
    data_type: text
    required: true
    description: "Preferred programming language"
  - name: notes
    type: data
    data_type: text
    required: false
    description: "Any additional context"
user_input:
  question_type: text
  prompt: "Describe your project requirements"
```

**Modal layout (fresh — nothing saved yet)**:

```
┌─ Human Input ─────────────────────────────────────────┐
│                                                    ✕  │
│  👤 project-config                          0/2 saved │ ← progress counter
├───────────────────────────────────────────────────────┤
│                                                       │
│  ❶ REQUIREMENTS *                               text  │ ← required (*)
│  ──────────────────────────────────────────────────── │
│  Describe your project requirements                   │ ← prompt (primary output
│                                                       │    uses user_input.prompt)
│  ┌─────────────────────────────────────────────────┐  │
│  │                                                 │  │
│  └─────────────────────────────────────────────────┘  │
│                                           [Save ❶]   │ ← per-field save button
│                                                       │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ │ ← subtle separator
│                                                       │
│  ❷ LANGUAGE *                                   text  │ ← required (*)
│  ──────────────────────────────────────────────────── │
│  Preferred programming language                       │ ← prompt from output description
│                                                       │
│  ┌─────────────────────────────────────────────────┐  │
│  │                                                 │  │
│  └─────────────────────────────────────────────────┘  │
│                                           [Save ❷]   │
│                                                       │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ │
│                                                       │
│  ❸ NOTES                                        text  │ ← optional (no *)
│  ──────────────────────────────────────────────────── │
│  Any additional context                               │
│                                                       │
│  ┌─────────────────────────────────────────────────┐  │
│  │                                                 │  │
│  └─────────────────────────────────────────────────┘  │
│                                           [Save ❸]   │
│                                                       │
├───────────────────────────────────────────────────────┤
│  0 of 2 required fields saved                         │
│                              [Cancel]  [Complete ✓]   │ ← disabled until 2/2
└───────────────────────────────────────────────────────┘
```

**Modal layout (partially filled — re-opened after closing)**:

```
┌─ Human Input ─────────────────────────────────────────┐
│                                                    ✕  │
│  👤 project-config                          1/2 saved │
├───────────────────────────────────────────────────────┤
│                                                       │
│  ✓ REQUIREMENTS *                               text  │ ← saved indicator
│  ──────────────────────────────────────────────────── │
│  Describe your project requirements                   │
│                                                       │
│  ┌─────────────────────────────────────────────────┐  │
│  │ Build a REST API for user management with       │  │ ← pre-populated from
│  │ authentication and pagination                   │  │    previous save
│  └─────────────────────────────────────────────────┘  │
│                                     [Saved ✓] [Edit]  │ ← saved state shown
│                                                       │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ │
│                                                       │
│  ❷ LANGUAGE *                                   text  │ ← not yet saved
│  ──────────────────────────────────────────────────── │
│  Preferred programming language                       │
│                                                       │
│  ┌─────────────────────────────────────────────────┐  │
│  │                                                 │  │ ← empty, needs input
│  └─────────────────────────────────────────────────┘  │
│                                           [Save ❷]   │
│                                                       │
├───────────────────────────────────────────────────────┤
│  1 of 2 required fields saved                         │
│                              [Cancel]  [Complete ✓]   │ ← still disabled
└───────────────────────────────────────────────────────┘
```

**Key multi-output UX decisions**:

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Save per field | Individual `[Save]` buttons | Partial completion between sessions. Close modal, come back later. |
| Complete button | Only enabled when all required outputs saved | Clear progress indicator, prevents accidental incomplete submission |
| Saved field state | Shows ✓ badge, value pre-populated, `[Edit]` to modify | User sees what they've already filled in |
| Field ordering | Primary output first (uses `user_input.prompt`), then remaining by declaration order | Natural reading flow |
| Field prompts | Primary: `user_input.prompt`. Others: output `description` field | Reuses existing schema, no new config needed |
| Question type | Primary: from `user_input.question_type`. Others: default to `text` | Keeps unit.yaml schema simple for v1 |

---

## Interaction Flows

### Flow 1: Single-Output User-Input Node (happy path)

```
User sees node card with "? Awaiting Input" violet badge
    │
    ├── Clicks the badge (or the node card)
    │
    ├── Modal opens with:
    │   • Header: "Human Input"
    │   • Unit slug + icon
    │   • Prompt from unit.yaml user_input.prompt
    │   • Input field matching question_type
    │   • Freeform notes textarea
    │
    ├── User types answer, optionally adds notes
    │
    ├── Clicks [Submit]
    │   │
    │   ├── Server action: submitUserInput()
    │   │   ├── startNode() → starting → agent-accepted
    │   │   ├── saveOutputData(outputName, value)
    │   │   ├── endNode() → complete
    │   │   └── return updated GraphStatusResult
    │   │
    │   ├── UI updates: node card → ✓ Complete (green)
    │   ├── Downstream nodes: gates recalculate, may become ready
    │   └── Modal closes
    │
    └── Done
```

### Flow 2: Multi-Output Node (partial save)

```
User sees node card with "? Awaiting Input" violet badge
    │
    ├── Clicks badge → modal opens
    │   Shows 3 fields: ❶ requirements*, ❷ language*, ❸ notes
    │
    ├── Fills in requirements, clicks [Save ❶]
    │   ├── Server action: saveUserInputField(nodeId, "requirements", value)
    │   │   (writes to data.json only — no status transition yet)
    │   ├── Field shows ✓ saved state
    │   └── Progress: "1/2 required fields saved"
    │
    ├── Gets interrupted, clicks [Cancel] or ✕
    │   ├── Modal closes (partial data preserved in data.json)
    │   ├── Node card shows: "? 1/2 filled" (still violet)
    │   └── No status transition
    │
    ├── Later: clicks node again → modal re-opens
    │   ├── Field ❶ pre-populated with saved value
    │   ├── Field ❷ empty
    │   └── Progress: "1/2 required fields saved"
    │
    ├── Fills in language, clicks [Save ❷]
    │   ├── Server action: saves to data.json
    │   ├── Progress: "2/2 required fields saved"
    │   └── [Complete ✓] button now ENABLED
    │
    ├── Optionally fills notes (not required)
    │
    ├── Clicks [Complete ✓]
    │   ├── Server action: submitUserInput() — walks full lifecycle
    │   │   ├── startNode() → starting → agent-accepted
    │   │   ├── (outputs already saved in data.json from per-field saves)
    │   │   ├── endNode() → complete
    │   │   └── return updated GraphStatusResult
    │   │
    │   ├── UI updates: node card → ✓ Complete (green)
    │   └── Modal closes
    │
    └── Done
```

### Flow 3: Agent Question (existing, unchanged)

```
Agent node running → asks question → status = waiting-question
    │
    ├── Node card shows: "? Question" violet badge (UNCHANGED)
    │
    ├── User clicks badge → modal opens
    │   Header: "Human Input"  ← CHANGED from "Question"
    │   Question text from state.json pendingQuestion
    │   Same 4 input types + freeform
    │
    ├── User answers, clicks [Submit]
    │   ├── answerQuestion() server action (UNCHANGED)
    │   │   ├── svc.answerQuestion() → stores in state.json
    │   │   ├── svc.raiseNodeEvent('node:restart')
    │   │   └── agent resumes
    │   └── Modal closes
    │
    └── Done
```

---

## Modal Routing: How the Editor Decides Which Mode

```typescript
// In workflow-editor.tsx — when a node is clicked for input

function handleInputClick(nodeId: string) {
  const node = findNode(nodeId);
  
  if (node.status === 'waiting-question' && node.pendingQuestion) {
    // Agent question mode — existing flow
    openModal({ mode: 'agent-question', node });
  } 
  else if (node.unitType === 'user-input' && node.status === 'pending' && node.ready) {
    // User-input mode — new flow
    openModal({ mode: 'user-input', node });
  }
  // else: not an input scenario, treat as normal node select
}
```

### Modal Props — Unified Shape

```typescript
interface HumanInputModalProps {
  // Common
  nodeId: string;
  onClose: () => void;
  
  // Mode discrimination
  mode: 'agent-question' | 'user-input';
  
  // Agent question mode
  pendingQuestion?: {
    questionId: string;
    text: string;
    questionType: 'text' | 'single' | 'multi' | 'confirm';
    options?: { key: string; label: string }[];
  };
  onAnswerQuestion?: (answer: { structured: unknown; freeform: string }) => void;
  
  // User-input mode
  unitSlug?: string;
  outputs?: {
    name: string;
    description?: string;
    required: boolean;
    isPrimary: boolean;          // first output = uses user_input config
    questionType: 'text' | 'single' | 'multi' | 'confirm';
    options?: { key: string; label: string }[];
    prompt: string;
    savedValue?: unknown;        // pre-populated from data.json
    isSaved: boolean;
  }[];
  onSaveField?: (outputName: string, value: unknown) => void;
  onComplete?: () => void;       // triggers full lifecycle
}
```

---

## Properties Panel: User-Input Node Selected

When a user-input node is selected (not modal — just clicked on canvas), the right panel shows properties:

```
┌─────────────────────────────┐
│  ← Back   Properties        │
│                              │
│  ┌────────────────────────┐  │
│  │ 👤 sample-input        │  │
│  │    user-input           │  │
│  └────────────────────────┘  │
│                              │
│  STATUS                      │
│  ? Awaiting Input            │  ← violet badge (new)
│                              │
│  CONTEXT                     │
│  🟢 New/Global               │
│                              │
│  GATES                       │
│  🟢 Preceding Lines          │
│  🟢 Transition               │
│  🟢 Serial Neighbor          │
│  🟢 Context Source           │
│  🟢 Inputs Available         │
│                              │
│  INPUTS (0)                  │
│  No inputs declared          │
│                              │
│  OUTPUTS (1)                 │  ← NEW section
│  ● spec — text (not saved)   │  ← shows output save state
│                              │
│  DOWNSTREAM (1)              │
│  → sample-coder-fa1 (spec)   │
│                              │
│  ┌────────────────────────┐  │
│  │ Provide Input...       │  │  ← NEW button (replaces Edit Properties
│  └────────────────────────┘  │     for user-input type nodes)
└──────────────────────────────┘
```

**Key panel changes for user-input nodes**:
- Status shows "Awaiting Input" in violet (matching node card)
- New **Outputs** section showing each output's save state
- Bottom button: "Provide Input..." instead of "Edit Properties..." — opens the Human Input modal

---

## Status Badge Logic

### Display Status Computation

```typescript
type DisplayStatus = NodeStatus | 'awaiting-input' | 'partially-filled';

function getDisplayStatus(node: NodeStatusResult): DisplayStatus {
  // Standard statuses pass through
  if (node.status !== 'pending') return node.status;
  
  // Only user-input nodes get special treatment
  if (node.unitType !== 'user-input') return 'pending';
  
  // Not ready → standard pending
  if (!node.ready) return 'pending';
  
  // Check for partial save state (multi-output)
  if (node.savedOutputCount !== undefined && node.savedOutputCount > 0) {
    return 'partially-filled';
  }
  
  // Ready, no data → awaiting input
  return 'awaiting-input';
}
```

### STATUS_MAP Additions

```typescript
// Add to STATUS_MAP in workflow-node-card.tsx

'awaiting-input': {
  color: '#8B5CF6',
  bgColor: 'bg-violet-50 text-violet-600 dark:bg-violet-950 dark:text-violet-400',
  label: 'Awaiting Input',
  icon: '?',
},

'partially-filled': {
  color: '#8B5CF6',
  bgColor: 'bg-violet-50 text-violet-600 dark:bg-violet-950 dark:text-violet-400',
  label: 'N/M filled',     // dynamic — computed from savedOutputCount/requiredOutputCount
  icon: '?',
},
```

---

## Agent Question Modal: What Changes

The existing QA modal gets these visual changes only:

| Element | Before | After |
|---------|--------|-------|
| Header text | "Question" | "Human Input" |
| Header icon | `?` text | `?` text (same) |
| Submit button | "Submit Answer" | "Submit" |
| Node label | `Node: {nodeId}` | `👤 {unitSlug}` (or `🤖 {unitSlug}` for agents) |

**Everything else stays the same**: violet colour scheme, 4 question types, freeform textarea, cancel/escape behaviour.

---

## Error States

### Missing unit.yaml user_input config

```
┌─ Human Input ─────────────────────────────────────────┐
│                                                    ✕  │
│  👤 broken-unit                                       │
├───────────────────────────────────────────────────────┤
│                                                       │
│  ⚠️  Configuration Error                               │
│                                                       │
│  This unit's user_input configuration is missing or   │
│  malformed. Check the unit.yaml file:                 │
│                                                       │
│  .chainglass/units/broken-unit/unit.yaml              │
│                                                       │
│  Expected: user_input section with question_type      │
│  and prompt fields.                                   │
│                                                       │
├───────────────────────────────────────────────────────┤
│                                          [Close]      │
└───────────────────────────────────────────────────────┘
```

### Save field failure

```
┌─────────────────────────────────────────────────────┐
│                                                      │
│  ❶ REQUIREMENTS *                              text  │
│  ────────────────────────────────────────────────── │
│  Describe your project requirements                  │
│                                                      │
│  ┌───────────────────────────────────────────────┐   │
│  │ Build a REST API for user management          │   │
│  └───────────────────────────────────────────────┘   │
│                                                      │
│  ⚠️ Save failed: E175 — disk write error  [Retry]    │ ← inline error
│                                                      │
└──────────────────────────────────────────────────────┘
```

---

## Responsive Behaviour

The modal is `max-w-lg` (512px) with side margins on small screens. For multi-output modals with many fields, the modal body scrolls vertically with a max height of `80vh`:

```
┌─ Human Input ──────────────┐
│  👤 project-config          │
├────────────────────────────┤
│  ↕ scrollable area          │  ← max-h-[60vh] with overflow-y-auto
│                             │
│  ❶ REQUIREMENTS *     text  │
│  ...                        │
│  ❷ LANGUAGE *         text  │
│  ...                        │
│  ❸ NOTES              text  │
│  ...                        │
│  ❹ DEADLINE           text  │
│  ...                        │
├────────────────────────────┤
│  2/3 required saved         │  ← sticky footer
│         [Cancel] [Complete] │
└─────────────────────────────┘
```

---

## Open Questions

### Q1: Should the freeform textarea appear per-field or once at the bottom?

**RESOLVED**: For **single-output** nodes, freeform is below the structured input (same as current QA modal). For **multi-output** nodes, freeform is NOT shown per-field — instead, a single "Additional notes" area appears at the bottom of the form, stored as metadata. This keeps multi-output forms clean.

### Q2: Should clicking the node card (not just the badge) open the modal for user-input nodes?

**RESOLVED**: Yes — for user-input nodes in `awaiting-input` or `partially-filled` state, clicking **anywhere on the card** opens the modal (not just the badge). The entire card becomes the call-to-action. For agent `waiting-question` nodes, clicking the badge opens the modal (existing behaviour unchanged — clicking the card still selects it for properties panel).

### Q3: Keyboard shortcuts?

**OPEN**: Should Enter key on a selected `awaiting-input` node open the modal? Low priority for v1 — click interaction is sufficient.

---

## Summary

The unified Human Input UI presents a single, consistent experience for all human data collection in workflows:

1. **Node card**: Violet `?` badge with "Awaiting Input" (or "N/M filled") label — clickable to open modal
2. **Modal**: Same layout as QA modal with header "Human Input", output name + type badge, per-field save for multi-output
3. **Partial state**: Multi-output nodes preserve saved fields between modal sessions, show progress on badge
4. **Agent questions**: Rebadged to "Human Input" header, otherwise unchanged in behaviour
5. **Properties panel**: Shows output save state, "Provide Input..." button
6. **Complete flow**: Single-output = one click Submit. Multi-output = save each field, then Complete when all required fields done.
