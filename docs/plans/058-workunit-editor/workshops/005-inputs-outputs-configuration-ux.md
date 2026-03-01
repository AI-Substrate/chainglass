# Workshop: Inputs/Outputs Configuration UX

**Type**: CLI Flow (UX/Form Builder)
**Plan**: 058-workunit-editor
**Spec**: See [research-dossier.md](../research-dossier.md)
**Created**: 2026-03-01
**Status**: Draft

**Related Documents**:
- [Workshop 002: Editor UX Flow](./002-editor-ux-flow-navigation.md) — Defined 3-panel layout; right panel left underspecified
- [Workshop 004: IWorkUnitService Write Extension](./004-iworkunitservice-write-extension-design.md) — API: `update(ctx, slug, { inputs?, outputs? })` with full array replacement
- [Research Dossier](../research-dossier.md) — Schema reference, reserved params, prior learnings

**Domain Context**:
- **Primary Domain**: `058-workunit-editor` feature (owns the form UI)
- **Related Domains**: `_platform/positional-graph` (owns `WorkUnitInputSchema`, `WorkUnitOutputSchema`, reserved params), `workflow-ui` (consumes input/output definitions for wiring UI)

---

## Purpose

Design the complete form builder UX for configuring work unit inputs and outputs in the right panel of the editor. This is the missing detail from Workshop 002, which sketched the right panel layout but didn't specify the interaction model for adding, editing, reordering, and deleting input/output entries — or how type-specific constraints and validation surface in the form.

## Key Questions Addressed

1. What form layout pattern do we use for the inputs/outputs lists? (Cards? Table? Accordion?)
2. How does a user add a new input/output entry?
3. How does a user edit an existing entry? (Inline? Expand?)
4. Can users reorder entries? How?
5. How are entries deleted? What safeguards exist?
6. How does real-time Zod schema validation surface in the form?
7. How do type-specific constraints work? (data_type for 'data', options for user-input)
8. How do reserved params (`main-prompt`, `main-script`) display?
9. How does auto-save integrate with form changes?

---

## Decision 1: Form Layout — Expandable Card List

### Options Considered

| Option | Description | Pros | Cons |
|--------|------------|------|------|
| **A. Table/grid with inline editing** | Spreadsheet-style row per entry | Compact, good for scanning | Too cramped in 300px panel, poor for variable-field forms |
| **B. Expandable cards (accordion)** | Collapsed summary → expand for full form | Scannable when collapsed, full form when editing | Extra click to edit, only one expanded at a time |
| **C. Flat card list (always expanded)** | Every field always visible | No hidden state, WYSIWYG | Uses too much vertical space with 3+ entries |
| **D. List with edit modal** | Summary rows, click opens modal | Clean list view | Modal fatigue (per Workshop 002: "prevents modal fatigue") |

### RESOLVED: Option B — Expandable Card List

Each input/output entry renders as a **collapsed card** showing a summary line. Clicking the card expands it to show the full edit form. Only one card expanded at a time (auto-collapse siblings).

**Why this pattern**:
1. The right panel is 300px wide — a table with 5+ columns is unreadable at that width
2. Most of the time, users need to *scan* their inputs/outputs, not edit them. Collapsed cards optimize for the common case
3. When editing, the full form has enough vertical space for all fields without horizontal cramming
4. Auto-collapse ensures the panel doesn't become an infinite scroll of open forms
5. Matches the visual language Workshop 002 sketched (compact cards with name/type/required summary)

### Collapsed Card Layout

```
┌─────────────────────────────────┐
│ ≡  source_code              ✕   │
│    data · text · required       │
└─────────────────────────────────┘
```

| Element | Purpose |
|---------|---------|
| `≡` | Drag handle (reorder) |
| `source_code` | Input name (bold) |
| `✕` | Delete button (hover-reveal) |
| `data · text · required` | Summary: type · data_type · required badge |

### Expanded Card Layout

```
┌─────────────────────────────────┐
│ ≡  source_code              ✕   │
│    data · text · required       │
│ ─────────────────────────────── │
│                                 │
│  Name                           │
│  ┌───────────────────────────┐  │
│  │ source_code               │  │
│  └───────────────────────────┘  │
│  ⚠️ lowercase, underscores only │
│                                 │
│  Type            Data Type      │
│  ┌────────────┐  ┌───────────┐  │
│  │ data     ▾ │  │ text    ▾ │  │
│  └────────────┘  └───────────┘  │
│                                 │
│  ☑ Required                     │
│                                 │
│  Description                    │
│  ┌───────────────────────────┐  │
│  │ The source code to review │  │
│  └───────────────────────────┘  │
│                                 │
└─────────────────────────────────┘
```

### Card States

| State | Visual | Behavior |
|-------|--------|----------|
| **Collapsed** | Summary line only | Click anywhere to expand |
| **Expanded** | Full form visible | Click header to collapse, or click another card |
| **Dragging** | Reduced opacity, drag preview | Other cards show drop indicators |
| **Invalid** | Red left border, error icon in summary | Summary shows first error in parentheses |
| **New (unsaved)** | Subtle highlight border | Auto-expanded on creation |
| **Reserved** | Muted/dimmed, no drag handle, no ✕ | Not editable — see [Reserved Params section](#reserved-parameter-display) |

---

## Decision 2: Add Flow — Inline Append with Auto-Expand

### Options Considered

| Option | Description | Pros | Cons |
|--------|------------|------|------|
| **A. "Add" button → empty row at bottom** | Append empty card, auto-expand | Fast, no modal context switch | Empty card visible before user fills it |
| **B. "Add" button → popover form** | Popover above button with fields | Doesn't disturb card list | Popover positioning in 300px panel is awkward |
| **C. "Add" button → modal** | Full modal for new entry | Plenty of space | Workshop 002 explicitly avoids modal fatigue |

### RESOLVED: Option A — Inline append with auto-expand

```
                INPUTS                    [+]
                  │
            click [+] button
                  │
                  ▼
┌─────────────────────────────────┐
│ ≡  source_code              ✕   │  ← existing (auto-collapses)
│    data · text · required       │
└─────────────────────────────────┘
┌─────────────────────────────────┐
│ ≡  ▌                        ✕   │  ← NEW (auto-expanded, name focused)
│ ─────────────────────────────── │
│                                 │
│  Name                           │
│  ┌───────────────────────────┐  │
│  │ ▌                         │  │  ← cursor here
│  └───────────────────────────┘  │
│                                 │
│  Type            Data Type      │
│  ┌────────────┐  ┌───────────┐  │
│  │ data     ▾ │  │ text    ▾ │  │  ← sensible defaults
│  └────────────┘  └───────────┘  │
│                                 │
│  ☑ Required                     │  ← defaults to true
│                                 │
│  Description                    │
│  ┌───────────────────────────┐  │
│  │                           │  │
│  └───────────────────────────┘  │
│                                 │
└─────────────────────────────────┘
```

### Add Flow Details

1. User clicks `[+]` next to "INPUTS" (or "OUTPUTS") section header
2. New card appended to end of list
3. All other cards auto-collapse
4. New card auto-expands with cursor focused on the Name field
5. Default values applied:
   - `name`: empty (user must fill)
   - `type`: `'data'` (most common)
   - `data_type`: `'text'` (most common for data type)
   - `required`: `true` (safer default — users can uncheck)
   - `description`: empty
6. Card shows validation error on Name field (required, empty)
7. As user types the name, validation runs in real-time
8. Card summary updates live as fields change
9. Auto-save triggers on blur of any field (immediate, not debounced — per Workshop 002 table)

**Why `data`/`text` defaults**: Looking at all sample units in the dossier, `type: data` with `data_type: text` is the most common input configuration. File inputs are the exception, not the rule.

**Why `required: true` default**: A required input that should be optional is a minor annoyance. An optional input that should be required is a runtime bug. Safer to default to `true`.

---

## Decision 3: Edit Flow — Expand-in-Place

Editing an existing entry is simply expanding its card. No separate "edit mode" or "edit button" — the collapsed card **is** the read view, the expanded card **is** the edit view.

### Interaction Model

```
User clicks collapsed card header
          │
          ▼
Previously expanded card collapses (if any)
          │
          ▼
Clicked card expands with full form
          │
          ▼
User edits fields (changes reflected in summary immediately)
          │
          ▼
User clicks another card header (or outside)
          │
          ▼
Current card collapses, auto-save triggers for changed fields
```

### Field Editing Behavior

| Field | Control | Validation | Auto-save Trigger |
|-------|---------|-----------|-------------------|
| **Name** | Text input | Real-time: `/^[a-z][a-z0-9_]*$/`, unique within unit, not reserved | On blur |
| **Type** | Dropdown (`data` / `file`) | Always valid (enum) | On change |
| **Data Type** | Dropdown (`text` / `number` / `boolean` / `json`) | Required when type='data'; hidden when type='file' | On change |
| **Required** | Checkbox | Always valid | On change |
| **Description** | Text input (single line) | Optional, no validation | On blur |

**Why single-line description** (not textarea): Descriptions are short labels used in toolbox tooltips and node wiring dropdowns. They should be concise. A textarea invites paragraph-length descriptions that won't display well elsewhere.

---

## Decision 4: Reorder — Drag Handle with dnd-kit

### Does order matter?

**Yes, for two reasons**:
1. **Display order**: The workflow canvas toolbox and node-edit-modal show inputs in array order. Users expect to control this order.
2. **YAML serialization**: The `inputs[]` / `outputs[]` arrays in `unit.yaml` preserve order. Consistent ordering reduces diff noise.

### Implementation

Use `@dnd-kit/sortable` — already installed and used in the kanban board (`apps/web/src/components/kanban/kanban-card.tsx`).

```tsx
import { DndContext, closestCenter } from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
```

### Reorder UX

```
┌─────────────────────────────────┐
│ ≡  source_code              ✕   │  ← grab ≡ to drag
│    data · text · required       │
└─────────────────────────────────┘
          │ ← drag indicator line
          ▼
┌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┐
╎         drop zone                 ╎  ← visual drop target
└╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┘
┌─────────────────────────────────┐
│ ≡  context                  ✕   │
│    data · text · optional       │
└─────────────────────────────────┘
```

| Aspect | Detail |
|--------|--------|
| **Drag handle** | `≡` (grip icon, `GripVertical` from lucide) — only this activates drag, not the whole card |
| **Drag preview** | Semi-transparent clone of collapsed card |
| **Drop indicator** | Blue line between cards showing insertion point |
| **Keyboard support** | Space to pick up, arrow keys to move, Space to drop (dnd-kit built-in) |
| **Auto-collapse on drag** | Any expanded card collapses when drag starts |
| **Auto-save on drop** | Reorder triggers immediate auto-save of full `inputs[]` / `outputs[]` array |

**Why drag handle, not whole card**: Clicking the card expands it. Dragging the card reorders it. These conflict. A dedicated drag handle eliminates the ambiguity.

---

## Decision 5: Delete — Hover-Reveal with Confirmation

### Delete UX

The `✕` button is **hover-revealed** (hidden by default, visible on card hover) to keep the UI clean.

```
Normal state:
┌─────────────────────────────────┐
│ ≡  source_code                  │  ← no ✕ visible
│    data · text · required       │
└─────────────────────────────────┘

Hover state:
┌─────────────────────────────────┐
│ ≡  source_code              ✕   │  ← ✕ appears on hover
│    data · text · required       │
└─────────────────────────────────┘

Click ✕:
┌─────────────────────────────────┐
│ ⚠️ Delete "source_code"?        │
│                                 │
│     [Cancel]  [Delete]          │  ← inline confirmation
└─────────────────────────────────┘
```

### Delete Safeguards

| Check | When | UX |
|-------|------|-----|
| **Inline confirmation** | Always | Card transforms to confirmation prompt |
| **Last output warning** | Deleting would leave `outputs[]` empty | "⚠️ At least one output is required. This is the last output." |
| **Workflow reference info** | Unit is used in workflows | "(Used in 3 workflows)" shown in confirmation text |
| **Reserved param** | Entry is `main-prompt` or `main-script` | ✕ button not shown — entry is not deletable |

**Why inline confirmation, not modal**: The delete action is scoped to a single card. An inline transform keeps context. A modal for deleting one list entry is overkill.

**Why no "undo delete" instead of confirmation**: Auto-save means the delete persists immediately. A true undo would require tracking deleted items and re-adding them. For v1, inline confirmation is simpler and sufficient. Undo is possible via git (per Workshop 002 Q4 resolution).

### Delete Flow

```
User hovers card → ✕ appears
          │
      click ✕
          │
          ▼
Card transforms to confirmation view
          │
     ┌────┴────┐
     │         │
  [Cancel]  [Delete]
     │         │
     ▼         ▼
  Card        Card removed from list
  restored    Auto-save triggers (sends full array without deleted entry)
```

---

## Decision 6: Validation UX — Inline Errors, Schema-Driven

### Validation Strategy

Validation runs on two levels:

1. **Field-level** (immediate): As the user types/changes a field, validate that field against the Zod schema
2. **Entry-level** (on blur/collapse): When a card collapses or saves, validate the complete entry (cross-field rules like "data_type required when type='data'")

### Field Validation Rules

| Field | Rule | Error Message | Trigger |
|-------|------|---------------|---------|
| **Name** | Required | "Name is required" | On blur if empty |
| **Name** | Pattern: `/^[a-z][a-z0-9_]*$/` | "Must start with lowercase letter, use only lowercase letters, numbers, and underscores" | On keystroke (debounced 200ms) |
| **Name** | Unique within unit | "Duplicate name: '{name}' is already used" | On blur |
| **Name** | Not reserved | "'{name}' is a reserved parameter name" | On blur (note: schema uses underscores, reserved use hyphens — this can't actually happen, but defensive) |
| **Type** | Enum | N/A (dropdown, always valid) | — |
| **Data Type** | Required when type='data' | "Data type is required for data inputs" | When type changes to 'data' and data_type is empty |
| **Required** | Boolean | N/A (checkbox, always valid) | — |
| **Description** | Optional | N/A | — |

### Error Display

```
Invalid field:
┌───────────────────────────────┐
│ source_code               ✕   │
│ ⚠ data · ??? · required       │  ← summary shows "???" for missing data_type
│ ─────────────────────────────  │
│                               │
│  Name                         │
│  ┌─────────────────────────┐  │
│  │ source_code             │  │
│  └─────────────────────────┘  │
│                               │
│  Type            Data Type    │
│  ┌──────────┐  ┌───────────┐  │
│  │ data   ▾ │  │ —       ▾ │  │  ← red border
│  └──────────┘  └───────────┘  │
│  ⚠️ Data type is required      │  ← error message below field
│    for data inputs             │
│                               │
└───────────────────────────────┘
```

### Collapsed Card Error Indicator

When a card has validation errors and is collapsed:

```
┌─────────────────────────────────┐
│ ≡  source_code              ✕   │
│    ⚠ data · ??? · required      │  ← red left border, ⚠ icon, "???" placeholder
└─────────────────────────────────┘
```

The red left border (4px `border-l-4 border-red-500`) provides a glanceable indicator that this entry needs attention without expanding.

### Save-Blocking Behavior

**RESOLVED: Allow save with validation errors, but show a persistent warning.**

Why not block save:
1. Auto-save is the default behavior (per Workshop 002). Blocking save means the editor can't persist partial work.
2. A user might want to save an incomplete input configuration and come back to finish it later.
3. The Zod schema validation on the service side (`WorkUnitSchema.safeParse()`) is the hard gate — the service will reject truly invalid configs with E182.

**Practical flow**:
- UI validates locally and shows inline errors
- Auto-save sends the full `inputs[]` array to `updateWorkUnit(slug, { inputs })` server action
- Server-side Zod validation runs — if it fails, the save error surfaces as "⚠️ Save failed: [reason]"
- The save indicator (from Workshop 002) shows the error: `⚠️ Save failed: inputs[0].data_type is required`

This creates a **two-tier validation** experience:
1. **Soft** (UI-side): Inline errors, red borders — user guidance
2. **Hard** (server-side): Zod schema — prevents invalid YAML from reaching disk

---

## Decision 7: Type-Specific Conditional Fields

### Type ↔ Data Type Relationship

When the user changes the `type` dropdown, the form must react:

```
type = 'data'                    type = 'file'
┌──────────┐  ┌───────────┐     ┌──────────┐
│ data   ▾ │  │ text    ▾ │     │ file   ▾ │    (no data_type field)
└──────────┘  └───────────┘     └──────────┘
               ↑ VISIBLE                         ↑ HIDDEN
```

| `type` value | `data_type` field | `data_type` behavior |
|--------------|-------------------|---------------------|
| `data` | **Visible**, required | Dropdown: `text` / `number` / `boolean` / `json` |
| `file` | **Hidden** | Field removed from form, value set to `undefined` |

### State Transition on Type Change

```
User selects type = 'file' (was 'data')
          │
          ▼
1. data_type field animates out (fade + collapse)
2. data_type value set to undefined in local state
3. Card summary updates: "file · required" (no data_type shown)
4. Auto-save triggers with updated entry (data_type omitted from payload)
```

```
User selects type = 'data' (was 'file')
          │
          ▼
1. data_type field animates in (expand + fade in)
2. data_type defaults to 'text'
3. Card summary updates: "data · text · required"
4. Validation: data_type is now required — already satisfied by default
```

**Why `text` default when switching to `data`**: The user explicitly chose 'data' — they need a data_type. Defaulting to `text` (the most common) is better than leaving it blank and showing an immediate validation error.

### User-Input Unit: Options Sub-Form

For `user-input` type units with `question_type: 'single'` or `question_type: 'multi'`, the outputs section remains standard. But the user-input unit's main panel (per Workshop 002) has a form builder. The **inputs/outputs right panel** itself doesn't change for user-input units — it still shows the same card list.

However, the **user-input configuration** (question type, prompt, options) lives in the main panel's form builder, NOT in the right panel. The right panel only manages the generic `inputs[]` and `outputs[]` arrays that all unit types share.

```
┌────────────────────────────────────────────┬───────────────────┐
│ MAIN PANEL: User-Input Config              │ RIGHT PANEL       │
│                                            │                   │
│ Question Type                              │ INPUTS        [+] │
│ ┌──────────────────────────────────────┐   │                   │
│ │ single  ▾                            │   │ (empty for most   │
│ └──────────────────────────────────────┘   │  user-input units)│
│                                            │                   │
│ Prompt                                     │ OUTPUTS       [+] │
│ ┌──────────────────────────────────────┐   │                   │
│ │ Choose a deployment target           │   │ ┌───────────────┐ │
│ └──────────────────────────────────────┘   │ │ choice        │ │
│                                            │ │ data · text   │ │
│ Options (min 2)                        [+] │ │ required      │ │
│ ┌──────────────────────────────────────┐   │ └───────────────┘ │
│ │ ≡  staging                       ✕   │   │                   │
│ │    "Staging"                          │   │                   │
│ └──────────────────────────────────────┘   │                   │
│ ┌──────────────────────────────────────┐   │                   │
│ │ ≡  production                    ✕   │   │                   │
│ │    "Production"                       │   │                   │
│ └──────────────────────────────────────┘   │                   │
└────────────────────────────────────────────┴───────────────────┘
```

**Why options live in the main panel, not the right panel**:
1. Options are part of the `user_input` config — they're the unit's core content, like a prompt is for agent units
2. The main panel is where type-specific editing happens (per Workshop 002)
3. Options can have long labels and descriptions — they need the main panel's width
4. The right panel's role is consistent across all unit types: metadata + inputs/outputs + usage

### Options Sub-Form Design (Main Panel)

The options form within the user-input main panel uses the **same expandable card pattern** as inputs/outputs. This provides UX consistency:

```
Options (min 2)                              [+]

┌────────────────────────────────────────────────┐
│ ≡  staging                                 ✕   │  ← collapsed
│    "Staging"                                    │
└────────────────────────────────────────────────┘
┌────────────────────────────────────────────────┐
│ ≡  production                              ✕   │  ← expanded
│    "Production"                                 │
│ ────────────────────────────────────────────── │
│                                                │
│  Key                                           │
│  ┌──────────────────────────────────────────┐  │
│  │ production                               │  │
│  └──────────────────────────────────────────┘  │
│                                                │
│  Label                                         │
│  ┌──────────────────────────────────────────┐  │
│  │ Production                               │  │
│  └──────────────────────────────────────────┘  │
│                                                │
│  Description                                   │
│  ┌──────────────────────────────────────────┐  │
│  │ Deploy to production environment         │  │
│  └──────────────────────────────────────────┘  │
│                                                │
└────────────────────────────────────────────────┘
```

**Option validation**:
- `key`: required, should be a simple identifier
- `label`: required, human-readable
- `description`: optional
- Minimum 2 options when `question_type` is `'single'` or `'multi'`
- Delete blocked when at minimum (2 options) — "Minimum 2 options required"

---

## Decision 8: Reserved Parameter Display

Reserved input params (`main-prompt`, `main-script`) are system-managed entries that should be visible but not editable.

### How Reserved Params Appear

```
INPUTS                                    [+]

┌─────────────────────────────────────────────┐
│ 🔒  main-prompt                              │  ← locked icon, no drag handle, no ✕
│     Reserved · Routes to prompt template     │
└─────────────────────────────────────────────┘
┌─────────────────────────────────────────────┐
│ ≡  source_code                          ✕   │  ← normal user-defined input
│    data · text · required                    │
└─────────────────────────────────────────────┘
```

### Reserved Param Rules

| Behavior | Detail |
|----------|--------|
| **Icon** | `🔒` (Lock icon) instead of `≡` (grip) — not draggable |
| **Delete** | ✕ button hidden — cannot be deleted |
| **Click to expand** | Disabled — card is not expandable (nothing to edit) |
| **Visual treatment** | `opacity-60` + `bg-muted/50` — visually dimmed |
| **Position** | Always rendered at top of the inputs list, above user-defined inputs |
| **Summary text** | "Reserved · Routes to prompt template" (or "Routes to script file") |
| **In the data model** | Reserved params are NOT stored in `inputs[]` — they're synthesized by the routing layer at runtime. The UI shows them for informational context only. |

**Why show reserved params at all**: Users see these params in the workflow's input wiring UI (`NodeEditModal`). If they can't find `main-prompt` in the editor's input list, they'll be confused. Showing them as locked entries creates a complete picture.

**Why they're always at the top**: Reserved params are the most important inputs (they carry the actual prompt/script content). Positioning them at top establishes a visual hierarchy: system params → user params.

### Which Reserved Params Show Per Unit Type

| Unit Type | Reserved Params Shown |
|-----------|----------------------|
| `agent` | `main-prompt` |
| `code` | `main-script` |
| `user-input` | (none) |

---

## Decision 9: Auto-Save Integration

Per Workshop 002, the editor uses **debounced auto-save**. Input/output changes save **immediately** (not debounced) because they're discrete structural mutations, not continuous typing.

### Save Triggers for Input/Output Changes

| Action | Save Timing | What's Sent |
|--------|-------------|-------------|
| **Add new entry** | On first valid blur (name populated) | Full `inputs[]` array |
| **Edit field (blur)** | Immediate on blur | Full `inputs[]` array |
| **Edit field (dropdown/checkbox change)** | Immediate on change | Full `inputs[]` array |
| **Reorder (drag drop)** | Immediate on drop | Full `inputs[]` array |
| **Delete entry** | Immediate after confirmation | Full `inputs[]` array |

### Why Full Array Replacement

Per Workshop 004, the API uses full array replacement for inputs/outputs:

```typescript
// Server action call
await updateWorkUnit(worktreePath, slug, {
  inputs: localInputsState  // full array, not a patch
});
```

This means the UI holds the **complete inputs/outputs arrays in local React state**, and sends the entire array on every save. This is simple and eliminates merge conflicts.

### Optimistic Updates

```
User changes source_code.required from true → false
          │
          ▼
1. Local state updates immediately (checkbox unchecks)
2. Card summary updates: "data · text · optional"
3. Server action fires: updateWorkUnit(slug, { inputs: [...] })
4. Save indicator: "Saving..."
          │
     ┌────┴────┐
     │         │
  Success    Failure
     │         │
     ▼         ▼
  "Auto-saved ✓"   "⚠️ Save failed"
                    → Local state rolls back
                    → Checkbox re-checks
                    → Error toast with reason
```

### State Shape

```typescript
// In use-unit-editor-state.ts

interface InputOutputEditorState {
  /** Current inputs array (local state, ahead of server) */
  inputs: WorkUnitInput[];
  /** Current outputs array (local state, ahead of server) */
  outputs: WorkUnitOutput[];
  /** Which card is currently expanded (null = all collapsed) */
  expandedInputId: string | null;  // keyed by name
  expandedOutputId: string | null;
  /** Validation errors per entry */
  inputErrors: Record<string, FieldError[]>;
  outputErrors: Record<string, FieldError[]>;
  /** Save status */
  saveStatus: 'idle' | 'saving' | 'saved' | 'error';
  lastSaveError: string | null;
}

interface FieldError {
  field: string;       // 'name' | 'type' | 'data_type' | 'description'
  message: string;
}
```

---

## Component Architecture

### Component Tree

```
<UnitMetadataPanel>                        ← Right panel root
  ├── <MetadataSection>                    ← Slug, type badge, version, description
  ├── <InputOutputSection                  ← "INPUTS" section
  │     kind="input"
  │     items={inputs}
  │     reservedParams={['main-prompt']}   ← For agent units
  │     onChange={handleInputsChange}
  │   >
  │     <DndContext>
  │       <SortableContext items={inputIds}>
  │         <ReservedParamCard />           ← 🔒 main-prompt (if agent)
  │         <SortableInputCard />           ← ≡ source_code
  │         <SortableInputCard />           ← ≡ context
  │       </SortableContext>
  │     </DndContext>
  │     <AddButton onClick={addInput} />   ← [+]
  │   </InputOutputSection>
  ├── <InputOutputSection                  ← "OUTPUTS" section
  │     kind="output"
  │     items={outputs}
  │     onChange={handleOutputsChange}
  │   >
  │     ...same pattern...
  │   </InputOutputSection>
  ├── <UsageWarning />                     ← ⚠️ Referenced by N workflows
  └── <ActionsSection />                   ← Duplicate, Delete unit
</UnitMetadataPanel>
```

### Key Components

```
apps/web/src/features/058-workunit-editor/
├── components/
│   ├── unit-metadata-panel.tsx           ← Right panel orchestrator
│   ├── input-output-section.tsx          ← Section with header, [+] button, card list
│   ├── input-output-card.tsx             ← Collapsed/expanded card (SortableItem)
│   ├── input-output-form.tsx             ← Expanded card form fields
│   ├── reserved-param-card.tsx           ← 🔒 read-only reserved param display
│   └── user-input-options-editor.tsx     ← Options sub-form (main panel, same card pattern)
```

### Shared Card Component

`InputOutputCard` handles both inputs and outputs — the schema is identical. The `kind` prop is cosmetic only (for labels and `data-testid` prefixes).

```tsx
interface InputOutputCardProps {
  /** 'input' or 'output' — for labeling and test IDs */
  kind: 'input' | 'output';
  /** The entry data */
  entry: WorkUnitInput;  // WorkUnitInput and WorkUnitOutput are the same shape
  /** Whether this card is currently expanded */
  isExpanded: boolean;
  /** Validation errors for this entry */
  errors: FieldError[];
  /** Called when any field changes */
  onChange: (updated: WorkUnitInput) => void;
  /** Called when expand/collapse is toggled */
  onToggleExpand: () => void;
  /** Called when delete is requested (after confirmation) */
  onDelete: () => void;
  /** Whether delete is allowed (false for last output) */
  canDelete: boolean;
  /** Whether this entry is sortable (false for reserved params) */
  sortable?: boolean;
}
```

---

## Validation: Zod Schema as Source of Truth

### Client-Side Validation Approach

Rather than duplicating validation rules in the UI, derive them from the Zod schema:

```typescript
// packages/positional-graph/src/features/029-agentic-work-units/workunit.schema.ts
// Already exports: WorkUnitInputSchema, WorkUnitOutputSchema

// In the UI, validate a single entry:
import { WorkUnitInputSchema } from '@chainglass/positional-graph';

function validateInput(entry: Partial<WorkUnitInput>): FieldError[] {
  const result = WorkUnitInputSchema.safeParse(entry);
  if (result.success) return [];

  return result.error.issues.map(issue => ({
    field: issue.path[0] as string,
    message: issue.message,
  }));
}
```

### Cross-Entry Validation (UI-only)

Some validations require knowledge of all entries, not just one:

| Validation | Scope | When | Error |
|-----------|-------|------|-------|
| Unique names | All inputs (or all outputs) | On name blur | "Duplicate name: '{name}'" |
| At least one output | Outputs array | On delete | "At least one output is required" |
| No reserved name collision | Input names | On name blur | "'{name}' conflicts with reserved parameter" |

These are checked in the `InputOutputSection` component, which has visibility into the full list.

---

## Interaction Sequence: Complete Add-Edit-Reorder-Delete Cycle

### Scenario: Agent unit "sample-coder" with one input (source_code) and one output (review_result)

```
STEP 1: User sees right panel
─────────────────────────────────
INPUTS                        [+]

┌─────────────────────────────┐
│ 🔒  main-prompt              │     ← reserved (agent unit)
│     Reserved · prompt route  │
└─────────────────────────────┘
┌─────────────────────────────┐
│ ≡  source_code          ✕   │     ← existing input
│    data · text · required   │
└─────────────────────────────┘

OUTPUTS                       [+]

┌─────────────────────────────┐
│ ≡  review_result        ✕   │     ← existing output
│    data · text · required   │
└─────────────────────────────┘


STEP 2: User clicks [+] to add an input
────────────────────────────────────────
┌─────────────────────────────┐
│ 🔒  main-prompt              │
│     Reserved · prompt route  │
└─────────────────────────────┘
┌─────────────────────────────┐
│ ≡  source_code          ✕   │     ← auto-collapsed
│    data · text · required   │
└─────────────────────────────┘
┌─────────────────────────────┐
│ ≡  ▌                    ✕   │     ← NEW, expanded
│ ─────────────────────────── │
│                             │
│  Name                       │
│  ┌───────────────────────┐  │
│  │ ▌                     │  │     ← cursor here
│  └───────────────────────┘  │
│  ⚠️ Name is required         │     ← immediate validation
│                             │
│  Type          Data Type    │
│  ┌────────┐  ┌──────────┐  │
│  │ data ▾ │  │ text   ▾ │  │     ← defaults
│  └────────┘  └──────────┘  │
│                             │
│  ☑ Required                 │
│                             │
│  Description                │
│  ┌───────────────────────┐  │
│  │                       │  │
│  └───────────────────────┘  │
│                             │
└─────────────────────────────┘


STEP 3: User types "context_info" in Name field
────────────────────────────────────────────────
│  Name                       │
│  ┌───────────────────────┐  │
│  │ context_info          │  │     ← valid ✓
│  └───────────────────────┘  │
│  ✓ (no error)               │

Summary updates live:
│ ≡  context_info         ✕   │
│    data · text · required   │


STEP 4: User changes Type to 'file'
────────────────────────────────────
│  Type                       │
│  ┌────────────────────────┐ │
│  │ file                 ▾ │ │
│  └────────────────────────┘ │
│                             │     ← Data Type field slides out
│  ☑ Required                 │

Summary updates:
│ ≡  context_info         ✕   │
│    file · required          │     ← no data_type in summary


STEP 5: User blurs out of the card → auto-save triggers
────────────────────────────────────────────────────────
Save indicator: "Saving..."
Server action: updateWorkUnit(slug, {
  inputs: [
    { name: 'source_code', type: 'data', data_type: 'text', required: true, description: '...' },
    { name: 'context_info', type: 'file', required: true }   ← new entry
  ]
})
Save indicator: "Auto-saved ✓"


STEP 6: User drags context_info ABOVE source_code
──────────────────────────────────────────────────
Before:                        After:
┌───────────────────────┐      ┌───────────────────────┐
│ 🔒  main-prompt        │      │ 🔒  main-prompt        │
└───────────────────────┘      └───────────────────────┘
┌───────────────────────┐      ┌───────────────────────┐
│ ≡  source_code    ✕   │      │ ≡  context_info   ✕   │  ← moved up
│    data · text · req  │      │    file · required     │
└───────────────────────┘      └───────────────────────┘
┌───────────────────────┐      ┌───────────────────────┐
│ ≡  context_info   ✕   │      │ ≡  source_code    ✕   │  ← moved down
│    file · required    │      │    data · text · req  │
└───────────────────────┘      └───────────────────────┘

Auto-save triggers with new array order.


STEP 7: User deletes context_info
──────────────────────────────────
Hover → ✕ appears → click ✕

┌─────────────────────────────┐
│ ⚠️ Delete "context_info"?    │
│                             │
│     [Cancel]  [Delete]      │
└─────────────────────────────┘

Click [Delete] → card removed → auto-save triggers
```

---

## Edge Cases & Error Handling

### Empty Name on New Entry

If a user clicks [+] and then immediately clicks away (collapses the card without entering a name):

```
Card collapses with validation error:
┌─────────────────────────────────┐
│ ≡  (unnamed)                ✕   │  ← red left border
│    ⚠ data · text · required     │  ← ⚠ icon indicates error
└─────────────────────────────────┘
```

The unnamed entry is NOT auto-saved (name is required by Zod schema — server would reject). It persists in local state only until:
- User expands it and adds a name → triggers save
- User deletes it → no save needed
- User navigates away → entry is lost (unsaved, no confirmation needed)

### Duplicate Name

```
User types "source_code" (already exists):
│  Name                        │
│  ┌────────────────────────┐  │
│  │ source_code            │  │  ← red border
│  └────────────────────────┘  │
│  ⚠️ Duplicate name: 'source_  │
│  code' is already used        │
```

Duplicate names block save — the server-side Zod validation would also catch this, but the UI provides immediate feedback.

### Rapid-Fire Saves (Debounce Concern)

If a user changes multiple fields in quick succession (type → data_type → required), each triggers an immediate save. To avoid race conditions:

```typescript
// In use-unit-auto-save.ts (or use-unit-editor-state.ts)

// Use a save queue that coalesces rapid changes
const saveInputs = useCallback(
  debounce(async (inputs: WorkUnitInput[]) => {
    await updateWorkUnit(worktreePath, slug, { inputs });
  }, 150),  // 150ms coalesce window for rapid field changes
  [worktreePath, slug]
);
```

The 150ms debounce on structural changes is short enough to feel "immediate" but long enough to coalesce rapid multi-field edits into a single server call.

### Server Rejection (E182)

If the server rejects the save (Zod schema validation failed):

```
Save indicator: "⚠️ Save failed: outputs must have at least 1 element"
          │
          ▼
Local state is NOT rolled back (user's edits preserved)
Error banner persists until next successful save
User fixes the issue → next save succeeds → error clears
```

---

## Accessibility

| Feature | Implementation |
|---------|---------------|
| **Keyboard navigation** | Tab through cards, Enter/Space to expand/collapse |
| **Drag reorder (keyboard)** | dnd-kit provides Space to grab, arrow keys to move, Space to drop |
| **Screen reader labels** | `aria-label="Input: source_code, data type text, required"` on each card |
| **Error announcements** | `aria-live="polite"` region for validation errors |
| **Focus management** | After add: focus name field. After delete: focus previous card or [+] button |
| **Delete confirmation** | Focus trapped in confirmation row until Cancel/Delete |

---

## Styling Reference

Using Tailwind CSS v4 + tailwind-merge (project standard):

```tsx
// Collapsed card
<div className={cn(
  "flex items-center gap-2 px-3 py-2 rounded-md border",
  "bg-card hover:bg-accent/50 cursor-pointer transition-colors",
  hasErrors && "border-l-4 border-l-red-500",
  isExpanded && "border-primary bg-accent/30"
)}>

// Drag handle
<GripVertical className="h-4 w-4 text-muted-foreground cursor-grab active:cursor-grabbing" />

// Delete button (hover reveal)
<button className={cn(
  "opacity-0 group-hover:opacity-100 transition-opacity",
  "h-5 w-5 text-muted-foreground hover:text-destructive"
)}>

// Error message
<p className="text-sm text-destructive mt-1">
  ⚠️ {error.message}
</p>

// Reserved param card
<div className="flex items-center gap-2 px-3 py-2 rounded-md border bg-muted/50 opacity-60">
  <Lock className="h-4 w-4 text-muted-foreground" />
  ...
</div>
```

---

## Test IDs

For e2e and component testing (follows existing `data-testid` pattern):

| Element | data-testid |
|---------|-------------|
| Inputs section | `input-section` |
| Outputs section | `output-section` |
| Add input button | `add-input-button` |
| Add output button | `add-output-button` |
| Input card (collapsed) | `input-card-{name}` |
| Output card (collapsed) | `output-card-{name}` |
| Input name field | `input-name-{index}` |
| Input type dropdown | `input-type-{index}` |
| Input data-type dropdown | `input-data-type-{index}` |
| Input required checkbox | `input-required-{index}` |
| Input description field | `input-description-{index}` |
| Input delete button | `input-delete-{name}` |
| Delete confirmation | `delete-confirm-{name}` |
| Reserved param card | `reserved-param-{name}` |
| Drag handle | `drag-handle-{name}` |

---

## Open Questions

### Q1: Should the right panel scroll independently or scroll with the page?

**RESOLVED**: Independent scroll. The right panel has a fixed height (viewport minus header) and scrolls internally. This prevents the metadata section from scrolling off-screen when the inputs/outputs list is long. Matches PanelShell's existing scroll behavior.

### Q2: Max number of inputs/outputs?

**OPEN**: The Zod schema doesn't enforce a maximum. Should the UI warn at some threshold?
- **Option A**: No limit — let users add as many as they want
- **Option B**: Soft warning at 10+ ("Consider simplifying this unit")
- **Option C**: Hard limit at 20

**Recommendation**: Option A for v1. The form builder pattern handles any length via scrolling. If performance becomes an issue with very long lists, virtualization can be added later.

### Q3: Should there be an "Import from JSON/YAML" option for bulk-adding inputs?

**OPEN**: Power users might want to paste a YAML/JSON block to define inputs/outputs.
- **Recommendation**: Defer to v2. The card-by-card UX is the primary flow. A future "Advanced" toggle could reveal a raw YAML editor for bulk edits.

### Q4: Should changing an input name warn about template references?

**OPEN**: If an agent prompt uses `{{source_code}}` and the user renames the input to `code_input`, the template reference breaks silently.
- **Option A**: Scan the prompt for `{{old_name}}` and warn
- **Option B**: Auto-update `{{old_name}}` → `{{new_name}}` in the template
- **Option C**: Ignore — user is responsible for template consistency

**Recommendation**: Option A for v1 (warn but don't auto-fix). Option B is a nice future enhancement but requires reliable template variable parsing.

---

## Quick Reference

### Form Field Summary

| Field | Type | Default | Validation | Condition |
|-------|------|---------|------------|-----------|
| `name` | text input | (empty) | `/^[a-z][a-z0-9_]*$/`, unique, not reserved | Always |
| `type` | dropdown | `'data'` | `'data'` \| `'file'` | Always |
| `data_type` | dropdown | `'text'` | `'text'` \| `'number'` \| `'boolean'` \| `'json'`, required | Only when `type='data'` |
| `required` | checkbox | `true` | boolean | Always |
| `description` | text input | (empty) | optional string | Always |

### Card State Cheat Sheet

| State | Left Border | Icon | Expandable | Draggable | Deletable |
|-------|-------------|------|-----------|-----------|-----------|
| Normal (collapsed) | default | — | ✅ | ✅ | ✅ (hover) |
| Normal (expanded) | primary | — | ✅ | ❌ (collapse first) | ✅ |
| Invalid (collapsed) | red | ⚠ | ✅ | ✅ | ✅ |
| Reserved | default | 🔒 | ❌ | ❌ | ❌ |
| Dragging | — | — | ❌ | (in progress) | ❌ |

### Server Action for Input/Output Changes

```typescript
// Always sends the full array
await updateWorkUnit(worktreePath, slug, {
  inputs: [
    { name: 'context_info', type: 'file', required: true },
    { name: 'source_code', type: 'data', data_type: 'text', required: true, description: 'Code to review' },
  ]
});

// Outputs updated separately
await updateWorkUnit(worktreePath, slug, {
  outputs: [
    { name: 'review_result', type: 'data', data_type: 'text', required: true, description: 'Review output' },
  ]
});
```
