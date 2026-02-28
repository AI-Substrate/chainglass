# Workshop: Work Unit Question Definition Schema

> **SUPERSEDED by [Workshop 010: Single-Question Simplification](./010-single-question-simplification.md)**. The `fields[]` schema designed here is not needed. Each user-input node asks one question and produces one output. Multiple questions = multiple nodes on a line. The existing `user_input` config (question_type + prompt + options) is sufficient. No schema changes required.

**Type**: Data Model / Schema Design
**Plan**: 054-unified-human-input
**Spec**: [unified-human-input-spec.md](../unified-human-input-spec.md)
**Created**: 2026-02-27
**Status**: Superseded

**Related Documents**:
- [Workshop 008: Save & Persistence Strategy](./008-save-persistence-strategy.md)
- [WorkUnit Schema](../../../../packages/positional-graph/src/features/029-agentic-work-units/workunit.schema.ts)
- [Workshop 003 (Plan 050): Per-Instance Work Unit Configuration](../../050-workflow-page-ux/workshops/003-per-instance-work-unit-configuration.md)

**Domain Context**:
- **Primary Domain**: `_platform/positional-graph` (owns unit.yaml schema, WorkUnit types)
- **Related Domains**: `workflow-ui` (reads the schema to render modal fields)

---

## Purpose

Define how user-input work units declare their questions — especially when a unit has multiple outputs that each need different question types. The current schema supports exactly one question (`user_input.question_type` + `user_input.prompt`), but the plan requires multi-output nodes where each output can have its own prompt, type, and options.

## Current State

### Schema (single question only)

```yaml
# unit.yaml — current structure
slug: sample-input
type: user-input
outputs:
  - name: spec
    type: data
    data_type: text
    required: true
user_input:
  question_type: text          # one type for the whole unit
  prompt: "What code would you like?"  # one prompt for the whole unit
```

### What Exists

```typescript
// workunit.schema.ts
UserInputConfigSchema = z.object({
  question_type: z.enum(['text', 'single', 'multi', 'confirm']),
  prompt: z.string().min(1),
  options: z.array(UserInputOptionSchema).min(2).optional(),
  default: z.union([z.string(), z.boolean()]).optional(),
});
```

### All 9 Existing User-Input Units

| Unit | Outputs | Question Type | Relationship |
|------|---------|--------------|--------------|
| sample-input | 1 (spec) | text | 1:1 |
| setup (simple-serial) | 1 (instructions) | text | 1:1 |
| human-input (advanced-pipeline) | 1 (requirements) | text | 1:1 |
| user-setup (goat) | 1 (instructions) | text | 1:1 |
| setup (parallel-fan-out) | 1 (config) | text | 1:1 |
| get-spec (real-agent-serial) | 1 (spec) | text | 1:1 |
| get-spec (real-agent-parallel) | 1 (spec) | text | 1:1 |
| setup (simple-serial dev) | 1 (instructions) | text | 1:1 |
| setup (error-recovery) | 1 (task) | text | 1:1 |

**Pattern**: Every existing user-input unit has exactly 1 output and 1 text question. No multi-choice examples exist in any unit.yaml file. No multi-output user-input units exist.

---

## The Problem

A user-input unit with multiple outputs needs per-output question configuration:

```yaml
# Desired: a project setup unit that collects 3 pieces of data
slug: project-setup
type: user-input
outputs:
  - name: requirements     # text input
  - name: language          # single-choice (TypeScript, Python, Go)
  - name: priority          # confirm (high priority? yes/no)
```

With the current schema, there's one `user_input` block for the whole unit. How do we map different question types to different outputs?

---

## Options Evaluated

### Option A: `fields` Array Inside `user_input`

```yaml
slug: project-setup
type: user-input
outputs:
  - name: requirements
    type: data
    data_type: text
    required: true
  - name: language
    type: data
    data_type: text
    required: true
  - name: priority
    type: data
    data_type: boolean
    required: false

user_input:
  fields:
    - output: requirements
      question_type: text
      prompt: "Describe your project requirements"
    - output: language
      question_type: single
      prompt: "Preferred programming language?"
      options:
        - key: typescript
          label: TypeScript
        - key: python
          label: Python
        - key: go
          label: Go
    - output: priority
      question_type: confirm
      prompt: "Is this high priority?"
      default: false
```

**Pros**: Explicit mapping from question to output. Clean separation — `outputs` declares the data contract, `user_input.fields` declares the UI presentation. Question config stays scoped to `user_input` block.

**Cons**: New `fields` array is a schema addition. Need to validate that every field references a declared output.

### Option B: `question` Config Inline on Each Output

```yaml
slug: project-setup
type: user-input
outputs:
  - name: requirements
    type: data
    data_type: text
    required: true
    question:
      question_type: text
      prompt: "Describe your project requirements"
  - name: language
    type: data
    data_type: text
    required: true
    question:
      question_type: single
      prompt: "Preferred language?"
      options:
        - key: typescript
          label: TypeScript
        - key: python
          label: Python
  - name: priority
    type: data
    data_type: boolean
    required: false
    question:
      question_type: confirm
      prompt: "Is this high priority?"
      default: false
```

**Pros**: Co-located — the question is right next to the output it populates. Natural to read. No separate mapping needed.

**Cons**: Modifies `WorkUnitOutputSchema` which is shared by agent/code/user-input units. Agent and code outputs would ignore the `question` field. Muddies the output declaration with UI concerns.

### Option C: Keep Single `user_input`, Infer Others from Output Description

```yaml
slug: project-setup
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
  - name: priority
    type: data
    data_type: boolean
    required: false
    description: "Is this high priority?"

user_input:
  question_type: text
  prompt: "Describe your project requirements"  # primary only
```

**Pros**: No schema changes. Simple.

**Cons**: All additional outputs default to `text` type — can't have single-choice or confirm for secondary outputs. The `description` field is doing double duty (documentation AND prompt). No way to attach options to non-primary outputs.

---

## Recommendation: Option A — `fields` Array ✅

Option A is the cleanest design because:

1. **Separation of concerns**: `outputs` declares the data contract (what flows downstream). `user_input.fields` declares how humans provide that data (presentation). These are different concerns that happen to be 1:1 mapped.

2. **Type safety**: Each field has its own `question_type`, `prompt`, `options`, and `default`. Single-choice for one output, text for another, confirm for a third — all explicit.

3. **Backward compatibility**: Existing units with `user_input.question_type` + `user_input.prompt` (no `fields`) continue to work. The schema supports both modes:
   - **Legacy**: `user_input` without `fields` → single question mapped to the first required output
   - **New**: `user_input` with `fields` → one question per output

4. **Doesn't pollute shared schemas**: `WorkUnitOutputSchema` stays clean. Agent/code units are unaffected.

5. **Validation**: Can validate that every `field.output` references a declared output name, and that every required output has a corresponding field.

---

## Schema Design

### Updated `UserInputConfigSchema`

```typescript
// workunit.schema.ts

/**
 * Per-output field definition for multi-question user-input units.
 */
export const UserInputFieldSchema = z.object({
  /** Must match a declared output name */
  output: z.string().min(1, 'output name cannot be empty'),
  /** Question type for this field */
  question_type: z.enum(['text', 'single', 'multi', 'confirm']),
  /** Prompt text shown to the user */
  prompt: z.string().min(1, 'prompt cannot be empty'),
  /** Options for single/multi choice */
  options: z.array(UserInputOptionSchema).min(2).optional(),
  /** Default value */
  default: z.union([z.string(), z.boolean()]).optional(),
});

/**
 * User input configuration — supports both legacy single-question
 * and new multi-field modes.
 *
 * Legacy mode: question_type + prompt (no fields array)
 * Multi-field mode: fields array with per-output config
 */
export const UserInputConfigSchema = z
  .object({
    // Legacy fields (kept for backward compat)
    question_type: z.enum(['text', 'single', 'multi', 'confirm']).optional(),
    prompt: z.string().min(1).optional(),
    options: z.array(UserInputOptionSchema).min(2).optional(),
    default: z.union([z.string(), z.boolean()]).optional(),
    // New: per-output fields
    fields: z.array(UserInputFieldSchema).min(1).optional(),
  })
  .refine(
    (data) => {
      // Must have either legacy (question_type + prompt) or new (fields)
      const hasLegacy = data.question_type !== undefined && data.prompt !== undefined;
      const hasFields = data.fields !== undefined && data.fields.length > 0;
      return hasLegacy || hasFields;
    },
    {
      message: 'Must provide either (question_type + prompt) or fields array',
      path: ['fields'],
    }
  )
  .refine(
    (data) => {
      // Options required for single/multi in legacy mode
      if (data.question_type === 'single' || data.question_type === 'multi') {
        return data.options !== undefined && data.options.length >= 2;
      }
      return true;
    },
    {
      message: 'options with at least 2 items required for single/multi question types',
      path: ['options'],
    }
  )
  .refine(
    (data) => {
      // Options required for single/multi in fields mode
      if (data.fields) {
        return data.fields.every((f) => {
          if (f.question_type === 'single' || f.question_type === 'multi') {
            return f.options !== undefined && f.options.length >= 2;
          }
          return true;
        });
      }
      return true;
    },
    {
      message: 'options with at least 2 items required for single/multi field question types',
      path: ['fields'],
    }
  );
```

### Normalization: Legacy → Fields

The UI and server actions always work with a normalized `fields[]` array. A helper function converts legacy format:

```typescript
/**
 * Normalize user_input config to always return a fields array.
 * Legacy single-question config gets wrapped into a one-element fields array.
 */
function normalizeUserInputFields(
  config: UserInputConfig,
  outputs: WorkUnitOutput[]
): UserInputField[] {
  // New mode: fields array provided
  if (config.fields && config.fields.length > 0) {
    return config.fields;
  }

  // Legacy mode: single question_type + prompt → map to first required output
  const primaryOutput = outputs.find((o) => o.required) ?? outputs[0];
  if (!primaryOutput || !config.question_type || !config.prompt) return [];

  return [{
    output: primaryOutput.name,
    question_type: config.question_type,
    prompt: config.prompt,
    options: config.options,
    default: config.default,
  }];
}
```

---

## YAML Examples

### Single-Output (legacy format — unchanged)

```yaml
# Backward compatible — existing units keep working exactly as-is
slug: sample-input
type: user-input
version: 1.0.0
outputs:
  - name: spec
    type: data
    data_type: text
    required: true

user_input:
  question_type: text
  prompt: "What code would you like to generate?"
```

### Single-Output with Choice (legacy format)

```yaml
slug: db-selector
type: user-input
version: 1.0.0
outputs:
  - name: database
    type: data
    data_type: text
    required: true

user_input:
  question_type: single
  prompt: "Which database should we use?"
  options:
    - key: postgres
      label: PostgreSQL
      description: Best for complex queries
    - key: mysql
      label: MySQL
      description: Good for simple CRUD
    - key: sqlite
      label: SQLite
      description: Embedded, no server needed
```

### Multi-Output with Per-Field Questions (new format)

```yaml
slug: project-setup
type: user-input
version: 1.0.0
description: Collect project configuration from user

outputs:
  - name: requirements
    type: data
    data_type: text
    required: true
    description: The project requirements
  - name: language
    type: data
    data_type: text
    required: true
    description: Chosen programming language
  - name: priority
    type: data
    data_type: boolean
    required: false
    description: Whether this is high priority

user_input:
  fields:
    - output: requirements
      question_type: text
      prompt: "Describe your project requirements"
    - output: language
      question_type: single
      prompt: "Preferred programming language?"
      options:
        - key: typescript
          label: TypeScript
        - key: python
          label: Python
        - key: go
          label: Go
    - output: priority
      question_type: confirm
      prompt: "Is this high priority?"
      default: false
```

### Multi-Output Mixed Types (new format)

```yaml
slug: deployment-config
type: user-input
version: 1.0.0

outputs:
  - name: environment
    type: data
    data_type: text
    required: true
  - name: features
    type: data
    data_type: json
    required: true
  - name: approve
    type: data
    data_type: boolean
    required: true
  - name: notes
    type: data
    data_type: text
    required: false

user_input:
  fields:
    - output: environment
      question_type: single
      prompt: "Target environment?"
      options:
        - key: staging
          label: Staging
        - key: production
          label: Production
    - output: features
      question_type: multi
      prompt: "Which features to deploy?"
      options:
        - key: auth
          label: Authentication
        - key: billing
          label: Billing
        - key: notifications
          label: Notifications
        - key: analytics
          label: Analytics
    - output: approve
      question_type: confirm
      prompt: "Approve deployment?"
    - output: notes
      question_type: text
      prompt: "Any deployment notes?"
```

---

## Validation Rules

| Rule | Applies To | Error |
|------|-----------|-------|
| Must have `(question_type + prompt)` OR `fields[]` | user_input block | "Must provide either (question_type + prompt) or fields array" |
| Cannot have both legacy and fields | user_input block | Optional — if both present, `fields` takes precedence |
| Each `field.output` must match a declared output name | fields[] | "Field output 'X' does not match any declared output" |
| Every required output should have a corresponding field | fields[] | Warning (not error) — missing fields default to text with output description as prompt |
| `options` required for `single`/`multi` fields | fields[] | "options with at least 2 items required..." |
| `options` must have `min(2)` items | fields[].options | "At least 2 options required" |

### What Happens If a Required Output Has No Field?

If a user-input unit has `fields[]` but a required output isn't in the list:
- **Default**: Create a text field with the output's `description` as the prompt
- **If no description**: Use `"Provide value for '{output_name}'"` as fallback prompt
- **Rationale**: Failing silently is better than blocking. The user still gets asked for every required output.

---

## How the Modal Uses This

```
1. Load unit.yaml for the node's unit_slug
2. Normalize: call normalizeUserInputFields(config, outputs)
3. For each field in the normalized array:
   - Render the appropriate input widget (text/single/multi/confirm)
   - Show the prompt
   - Show options if applicable
   - Show saved value from data.json (if partially filled)
   - Show per-field [Save] button
4. Footer: show "N/M required fields saved" + [Complete ✓]
```

The normalization step means the modal component **always** works with a `fields[]` array — it never needs to handle the legacy vs new distinction.

---

## Open Questions

### Q1: Should `fields` support ordering independent of output order?

**RESOLVED**: Yes — the fields array defines the presentation order. This allows prompts to flow naturally (e.g., ask "what language?" before "describe requirements" even if the output declaration order is different). If no fields array (legacy mode), the single question maps to the first required output.

### Q2: Can a field map to a non-required output?

**RESOLVED**: Yes — optional outputs can have fields. The [Save] button works the same way. The field just won't block the [Complete ✓] button.

### Q3: Should we support a `fields` entry with no matching output (pure display text)?

**RESOLVED**: No for v1. Every field must map to an output. Decorative text (section headers, instructions) can be added via field `description` in a future version.

---

## Summary

User-input work units define their questions via a `fields` array in the `user_input` block, where each field maps to a declared output:

1. **Legacy mode** (backward compat): `user_input.question_type` + `user_input.prompt` → maps to first required output
2. **Multi-field mode** (new): `user_input.fields[]` with per-output `question_type`, `prompt`, `options`, `default`
3. **Normalization**: UI always works with a `fields[]` array — a helper converts legacy format
4. **Validation**: Each field's `output` must reference a declared output; missing required outputs get default text fields
5. **Schema change**: `UserInputConfigSchema` gets an optional `fields` array; `UserInputFieldSchema` is new. Backward compatible — existing units unchanged.
