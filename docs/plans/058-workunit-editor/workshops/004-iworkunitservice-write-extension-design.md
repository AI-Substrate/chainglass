# Workshop: IWorkUnitService Write Extension Design

**Type**: API Contract + Data Model
**Plan**: 058-workunit-editor
**Spec**: _(pre-spec — research dossier at `research-dossier.md`)_
**Created**: 2026-02-28
**Status**: Draft

**Related Documents**:
- [Research Dossier](../research-dossier.md) — Critical Finding 01: IWorkUnitService Has No Write Operations
- [Positional Graph Domain](../../../domains/_platform/positional-graph/domain.md)
- [Plan 029: Agentic Work Units](../../029-agentic-work-units/agentic-work-units-plan.md)
- [Plan 050: Workflow Page UX](../../050-workflow-page-ux/workflow-page-ux-plan.md)

**Domain Context**:
- **Primary Domain**: `_platform/positional-graph` — owns IWorkUnitService, WorkUnitAdapter, all unit operations
- **Related Domains**: `workflow-ui` (consumer — toolbox, editor UI), `_platform/events` (future catalog change notifications)

---

## Purpose

Design the write extension to `IWorkUnitService` in `_platform/positional-graph` so the work unit editor can perform full CRUD operations through the service layer instead of direct filesystem writes. This workshop resolves the interface shape, operation signatures, result types, error codes, persistence strategy, and testing contract — producing a reference implementors can code against directly.

## Key Questions Addressed

1. Should we extend `IWorkUnitService` in-place or create a separate `IWorkUnitEditorService`?
2. What are the exact method signatures for `create()`, `update()`, `delete()`?
3. How do update operations work — full replacement or field-level patches?
4. What result types and error codes do write operations need?
5. How does atomic persistence work for multi-file mutations (unit.yaml + prompt/script)?
6. What's the concurrency model for simultaneous edits?
7. How do `FakeWorkUnitService` and contract tests evolve?
8. What do the server action signatures look like?

---

## Decision 1: Extension Strategy

### Options Considered

| Option | Description | Pros | Cons |
|--------|------------|------|------|
| **A. Extend IWorkUnitService** | Add `create`, `update*`, `delete` to existing interface | Single interface, all consumers already have it, DI wiring unchanged | Interface grows, read-only consumers pay for write method types |
| **B. Separate IWorkUnitEditorService** | New interface wrapping or extending IWorkUnitService | Clean separation, can guard write access via DI | Extra DI token, extra wiring, must keep in sync |
| **C. CQRS split** | Separate read service + write service, no shared interface | Pure separation, scales independently | Over-engineered for filesystem-based storage, doubles DI complexity |

### **RESOLVED: Option A — Extend IWorkUnitService in-place**

**Rationale**:
1. The **workgraph** (legacy) version already has `create()` on `IWorkUnitService` — this is an established precedent.
2. The contract tests at `test/contracts/workunit-service.contract.ts` already test `create()` — the pattern exists.
3. All consumers resolve via `POSITIONAL_GRAPH_DI_TOKENS.WORKUNIT_SERVICE` — no new token needed.
4. `FakeWorkUnitService` in positional-graph already tracks calls — adding write methods follows the same pattern.
5. Interface growth is manageable: 3 read + 4 write methods = 7 total (typical for a CRUD service).

**Why not B or C**: The storage layer is filesystem-based with no separate read/write stores. CQRS adds complexity without benefit. A separate editor service would create an awkward "which service do I use?" decision for consumers.

---

## Decision 2: Method Inventory

### Current Interface (read-only)

```typescript
interface IWorkUnitService {
  list(ctx: WorkspaceContext): Promise<ListUnitsResult>;
  load(ctx: WorkspaceContext, slug: string): Promise<LoadUnitResult>;
  validate(ctx: WorkspaceContext, slug: string): Promise<ValidateUnitResult>;
}
```

### Extended Interface (full CRUD)

```typescript
interface IWorkUnitService {
  // ── Read operations (existing, unchanged) ──────────────────────
  list(ctx: WorkspaceContext): Promise<ListUnitsResult>;
  load(ctx: WorkspaceContext, slug: string): Promise<LoadUnitResult>;
  validate(ctx: WorkspaceContext, slug: string): Promise<ValidateUnitResult>;

  // ── Write operations (new) ─────────────────────────────────────
  create(ctx: WorkspaceContext, spec: CreateUnitSpec): Promise<CreateUnitResult>;
  update(ctx: WorkspaceContext, slug: string, patch: UpdateUnitPatch): Promise<UpdateUnitResult>;
  delete(ctx: WorkspaceContext, slug: string): Promise<DeleteUnitResult>;
  rename(ctx: WorkspaceContext, oldSlug: string, newSlug: string): Promise<RenameUnitResult>;
}
```

**Why `rename` is separate**: Renaming a slug changes the directory name, all internal references, and the `slug` field in unit.yaml. It's a destructive operation that deserves its own method and error handling rather than being a field on `update()`.

---

## Decision 3: Create Operation

### Signature

```typescript
/**
 * Specification for creating a new work unit.
 */
interface CreateUnitSpec {
  /** Unit slug (must match /^[a-z][a-z0-9-]*$/) */
  slug: string;
  /** Unit type discriminator */
  type: 'agent' | 'code' | 'user-input';
  /** Human-readable description (optional) */
  description?: string;
  /** Semantic version (defaults to "1.0.0") */
  version?: string;
}

/**
 * Result of creating a new work unit.
 */
interface CreateUnitResult {
  /** Created unit slug */
  slug: string;
  /** Absolute path to created unit directory */
  path: string;
  /** Errors encountered during creation */
  errors: ResultError[];
}
```

### What Gets Scaffolded

```
.chainglass/units/<slug>/
├── unit.yaml          ← Populated with type-specific defaults
├── prompts/
│   └── main.md        ← Only for type: agent (empty boilerplate)
└── scripts/
    └── main.sh        ← Only for type: code (empty boilerplate)
```

### Scaffolded unit.yaml by Type

**Agent**:
```yaml
slug: my-agent
type: agent
version: "1.0.0"
description: ""
agent:
  prompt_template: prompts/main.md
  supported_agents:
    - claude-code
inputs: []
outputs:
  - name: result
    type: data
    data_type: text
    required: true
    description: "Agent output"
```

**Code**:
```yaml
slug: my-script
type: code
version: "1.0.0"
description: ""
code:
  script: scripts/main.sh
  timeout: 300
inputs: []
outputs:
  - name: result
    type: data
    data_type: text
    required: true
    description: "Script output"
```

**User Input**:
```yaml
slug: my-question
type: user-input
version: "1.0.0"
description: ""
user_input:
  question_type: text
  prompt: "Enter your response"
inputs: []
outputs:
  - name: answer
    type: data
    data_type: text
    required: true
    description: "User response"
```

### Template File Boilerplate

**`prompts/main.md`** (agent):
```markdown
<!-- Work unit prompt template: {{slug}} -->
<!-- Available inputs: {{#each inputs}}{{name}}{{/each}} -->

Enter your prompt here.
```

**`scripts/main.sh`** (code):
```bash
#!/usr/bin/env bash
# Work unit script: {{slug}}
# Exit 0 for success, non-zero for failure

set -euo pipefail

echo "Hello from {{slug}}"
```

### Create Flow

```
create(ctx, { slug, type, description?, version? })
                │
                ▼
┌──────────────────────────────────────────────┐
│ 1. VALIDATE SLUG                             │
│    adapter.validateSlug(slug)                │
│    → E187 if invalid format                  │
└──────────────────────────────────────────────┘
                │
                ▼
┌──────────────────────────────────────────────┐
│ 2. CHECK DUPLICATE                           │
│    adapter.unitExists(ctx, slug)             │
│    → E188 if already exists                  │
└──────────────────────────────────────────────┘
                │
                ▼
┌──────────────────────────────────────────────┐
│ 3. BUILD DEFAULT CONFIG                      │
│    Apply type-specific defaults              │
│    Merge user-provided description/version   │
└──────────────────────────────────────────────┘
                │
                ▼
┌──────────────────────────────────────────────┐
│ 4. VALIDATE AGAINST SCHEMA                   │
│    WorkUnitSchema.safeParse(config)          │
│    → E182 if defaults are somehow invalid    │
│    (defensive — should never happen)          │
└──────────────────────────────────────────────┘
                │
                ▼
┌──────────────────────────────────────────────┐
│ 5. WRITE TO FILESYSTEM                       │
│    a. mkdir: .chainglass/units/<slug>/        │
│    b. atomicWriteFile: unit.yaml             │
│    c. mkdir + write: prompts/main.md (agent) │
│       OR scripts/main.sh (code)              │
│       OR nothing (user-input)                │
└──────────────────────────────────────────────┘
                │
                ▼
┌──────────────────────────────────────────────┐
│ 6. RETURN RESULT                             │
│    { slug, path, errors: [] }                │
└──────────────────────────────────────────────┘
```

### Create Error Codes

| Code | Name | Trigger |
|------|------|---------|
| E187 | `workunitSlugInvalidError` | Slug fails `/^[a-z][a-z0-9-]*$/` _(existing)_ |
| E188 | `workunitAlreadyExistsError` | Unit directory already exists |
| E182 | `workunitSchemaValidationError` | Generated config fails schema _(defensive, existing)_ |

---

## Decision 4: Update Operation

### Design Choice: Partial Patch, Not Full Replacement

**RESOLVED: Use a typed patch object with optional fields.**

**Why not full replacement**: The editor updates fields incrementally (user changes description, then adds an input, then modifies the prompt). Full replacement forces the caller to re-read, merge, and re-send the entire config — error-prone and race-condition-prone.

**Why not JSON Patch (RFC 6902)**: Over-engineered for a structured YAML file. The fields are well-known — a typed patch is safer and more discoverable than `[{op: "replace", path: "/description", value: "..."}]`.

### Signature

```typescript
/**
 * Patch for updating a work unit.
 * All fields are optional — only provided fields are applied.
 * The `type` field is intentionally NOT patchable (changing type requires delete + create).
 */
interface UpdateUnitPatch {
  /** Update description */
  description?: string;
  /** Update version */
  version?: string;
  /** Replace entire inputs array */
  inputs?: WorkUnitInput[];
  /** Replace entire outputs array */
  outputs?: WorkUnitOutput[];
  /** Update agent-specific config (only valid for type: agent) */
  agent?: Partial<AgentConfig>;
  /** Update code-specific config (only valid for type: code) */
  code?: Partial<CodeConfig>;
  /** Update user-input-specific config (only valid for type: user-input) */
  user_input?: Partial<UserInputConfig>;
}

/**
 * Result of updating a work unit.
 */
interface UpdateUnitResult {
  /** Updated unit slug */
  slug: string;
  /** Errors encountered during update */
  errors: ResultError[];
}
```

### Update Flow

```
update(ctx, slug, patch)
         │
         ▼
┌──────────────────────────────────────────────┐
│ 1. LOAD CURRENT                              │
│    loadInternal(ctx, slug)                   │
│    → E180 if not found                       │
└──────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────┐
│ 2. TYPE-CHECK PATCH                          │
│    If patch.agent && unit.type !== 'agent'   │
│    → E186 type mismatch error                │
│    (same for code, user_input)               │
└──────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────┐
│ 3. MERGE                                     │
│    deepMerge(currentConfig, patch)           │
│    • Top-level scalars: overwrite            │
│    • inputs/outputs: full array replacement  │
│    • agent/code/user_input: shallow merge    │
└──────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────┐
│ 4. VALIDATE MERGED RESULT                    │
│    WorkUnitSchema.safeParse(merged)          │
│    → E182 if merged state is invalid         │
│    (e.g., removed required output)           │
└──────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────┐
│ 5. PERSIST                                   │
│    atomicWriteFile(unit.yaml, merged)        │
└──────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────┐
│ 6. RETURN                                    │
│    { slug, errors: [] }                      │
└──────────────────────────────────────────────┘
```

### Merge Semantics (Critical)

```typescript
// Scalar fields: direct overwrite
if (patch.description !== undefined) merged.description = patch.description;
if (patch.version !== undefined)     merged.version = patch.version;

// Array fields: full replacement (not element-level merge)
if (patch.inputs !== undefined)  merged.inputs = patch.inputs;
if (patch.outputs !== undefined) merged.outputs = patch.outputs;

// Type-specific config: shallow merge (preserves unmentioned fields)
if (patch.agent !== undefined && merged.type === 'agent') {
  merged.agent = { ...merged.agent, ...patch.agent };
}
if (patch.code !== undefined && merged.type === 'code') {
  merged.code = { ...merged.code, ...patch.code };
}
if (patch.user_input !== undefined && merged.type === 'user-input') {
  merged.user_input = { ...merged.user_input, ...patch.user_input };
}
```

**Why inputs/outputs use full array replacement**: Array element identity is ambiguous. Which input is "the same" input being updated? By requiring the caller to send the full array, we avoid element-matching complexity and merge bugs. The UI holds the full input list in local state anyway.

**Why type-specific config uses shallow merge**: These have few fields (`agent` has 4 fields, `code` has 2). Shallow merge lets the caller update one field (e.g., `{ agent: { system_prompt: "new" } }`) without resending `prompt_template` and `supported_agents`.

### Update Error Codes

| Code | Name | Trigger |
|------|------|---------|
| E180 | `workunitNotFoundError` | Unit doesn't exist _(existing)_ |
| E186 | `workunitTypeMismatchError` | Patch has `agent` config for a `code` unit _(existing)_ |
| E182 | `workunitSchemaValidationError` | Merged result fails Zod schema _(existing)_ |

---

## Decision 5: Template Content Updates

### Current Pattern

Template content (`prompts/main.md`, `scripts/main.sh`) is already writable via the rich domain class methods:

```typescript
// AgenticWorkUnitInstance
await unit.getPrompt(ctx);            // reads prompts/main.md
await unit.setPrompt(ctx, content);   // writes prompts/main.md

// CodeUnitInstance
await unit.getScript(ctx);            // reads scripts/main.sh
await unit.setScript(ctx, content);   // writes scripts/main.sh
```

### RESOLVED: Keep template content on domain classes, NOT on IWorkUnitService

**Rationale**:
1. `setPrompt()` / `setScript()` already exist and work — no need to duplicate.
2. The flow is: `load()` → get instance → call `setPrompt()` or `setScript()`.
3. Adding `updatePrompt(ctx, slug, content)` to the service would just be a convenience wrapper around `load()` + `setPrompt()`.
4. Service methods should operate on _metadata_ (unit.yaml); domain class methods operate on _content_ (template files).

### ⚠️ Gap: `setPrompt()` and `setScript()` use `fs.writeFile()`, NOT `atomicWriteFile()`

```typescript
// Current implementation in workunit.classes.ts:
async setPrompt(ctx: WorkspaceContext, content: string): Promise<void> {
  // ...path validation...
  await fs.writeFile(templatePath, content);  // ← NOT atomic!
}
```

**Required Fix (Phase 1 of implementation)**: Change to `atomicWriteFile(fs, templatePath, content)` per PL-07. This is a pre-existing bug, not a design question.

---

## Decision 6: Delete Operation

### RESOLVED: Hard delete with pre-flight safety check

```typescript
/**
 * Result of deleting a work unit.
 */
interface DeleteUnitResult {
  /** Deleted unit slug */
  slug: string;
  /** Whether the unit was actually deleted (false if not found) */
  deleted: boolean;
  /** Errors encountered */
  errors: ResultError[];
}
```

### Delete Flow

```
delete(ctx, slug)
         │
         ▼
┌──────────────────────────────────────────────┐
│ 1. VALIDATE SLUG                             │
│    adapter.validateSlug(slug)                │
│    → E187 if invalid                         │
└──────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────┐
│ 2. CHECK EXISTS                              │
│    adapter.unitExists(ctx, slug)             │
│    → return { deleted: false } if not found  │
│    (idempotent — NOT an error)               │
└──────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────┐
│ 3. REMOVE DIRECTORY                          │
│    fs.rmDir(unitDir, { recursive: true })    │
│    Remove entire .chainglass/units/<slug>/    │
└──────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────┐
│ 4. RETURN                                    │
│    { slug, deleted: true, errors: [] }       │
└──────────────────────────────────────────────┘
```

### Design Decisions

**Why hard delete, not soft delete (archive)**:
1. Work units are local development artifacts, not production data. Users expect "delete" to mean "gone."
2. Git provides the recovery mechanism — deleted files are in the repo history.
3. Soft delete adds a `status: archived` field to the schema, affecting all consumers, for minimal benefit.
4. An "archive" feature could be added later if needed — it would be an additive change.

**Why idempotent (no error on missing unit)**:
1. Filesystem operations are inherently racy — the unit might be deleted between check and action.
2. The intent is "ensure this unit doesn't exist" — if it's already gone, intent is satisfied.
3. Return `deleted: false` so the caller can distinguish between "was removed" and "wasn't there."

**Why no cascade check for graph references**:
1. Graph nodes reference units by `unit_slug` — a reference, not a hard dependency.
2. Deleting a unit means `load()` will return E180 when the graph tries to run that node — a clear error.
3. A cascade check would require scanning all graph definitions — expensive and fragile.
4. The **UI** should warn about references (query graphs for `unit_slug` matches), but the **service** shouldn't block deletion.

---

## Decision 7: Rename Operation

### RESOLVED: Dedicated method, filesystem directory move

```typescript
/**
 * Result of renaming a work unit.
 */
interface RenameUnitResult {
  /** Original slug */
  oldSlug: string;
  /** New slug */
  newSlug: string;
  /** New directory path */
  path: string;
  /** Errors encountered */
  errors: ResultError[];
}
```

### Rename Flow

```
rename(ctx, oldSlug, newSlug)
              │
              ▼
┌──────────────────────────────────────────────┐
│ 1. VALIDATE BOTH SLUGS                       │
│    adapter.validateSlug(oldSlug)             │
│    adapter.validateSlug(newSlug)             │
│    → E187 if either invalid                  │
└──────────────────────────────────────────────┘
              │
              ▼
┌──────────────────────────────────────────────┐
│ 2. CHECK SOURCE EXISTS                       │
│    → E180 if old slug not found              │
└──────────────────────────────────────────────┘
              │
              ▼
┌──────────────────────────────────────────────┐
│ 3. CHECK DESTINATION DOES NOT EXIST          │
│    → E188 if new slug already taken          │
└──────────────────────────────────────────────┘
              │
              ▼
┌──────────────────────────────────────────────┐
│ 4. LOAD & UPDATE SLUG IN unit.yaml           │
│    Read unit.yaml → change slug field        │
│    → newConfig.slug = newSlug                │
│    Validate merged → persist to old location │
└──────────────────────────────────────────────┘
              │
              ▼
┌──────────────────────────────────────────────┐
│ 5. RENAME DIRECTORY                          │
│    fs.rename(oldDir, newDir)                 │
│    .chainglass/units/old → .../units/new     │
└──────────────────────────────────────────────┘
              │
              ▼
┌──────────────────────────────────────────────┐
│ 6. RETURN                                    │
│    { oldSlug, newSlug, path, errors: [] }    │
└──────────────────────────────────────────────┘
```

**⚠️ Important**: Rename does NOT update graph node references. Graph nodes store `unit_slug` in `node.yaml` — those become stale. The UI should warn about this. Updating graph references is a separate operation at the graph service level, not the unit service level.

---

## Decision 8: Atomic Persistence Strategy

### Per PL-07: All mutations must use `atomicWriteFile()`

The existing `atomicWriteFile()` from `packages/workgraph/src/services/atomic-file.ts`:

```typescript
async function atomicWriteFile(
  fs: IFileSystem,
  path: string,
  content: string
): Promise<void> {
  const tmpPath = `${path}.tmp`;
  await fs.writeFile(tmpPath, content);
  await fs.rename(tmpPath, path);
}
```

### Multi-File Write Strategy

**Create** involves writing 2-3 files (unit.yaml + optional template file). This is NOT an atomic transaction — there's no filesystem-level multi-file atomic write.

**RESOLVED: Ordered writes with cleanup on failure**

```typescript
async create(ctx, spec): Promise<CreateUnitResult> {
  const unitDir = adapter.getUnitDir(ctx, spec.slug);

  try {
    // 1. Create directory
    await fs.mkdir(unitDir, { recursive: true });

    // 2. Write unit.yaml (primary file, written first)
    const yamlContent = yamlParser.stringify(config);
    await atomicWriteFile(fs, adapter.getUnitYamlPath(ctx, spec.slug), yamlContent);

    // 3. Write template file if needed
    if (spec.type === 'agent') {
      await fs.mkdir(pathResolver.join(unitDir, 'prompts'), { recursive: true });
      await atomicWriteFile(fs, '...prompts/main.md', boilerplate);
    } else if (spec.type === 'code') {
      await fs.mkdir(pathResolver.join(unitDir, 'scripts'), { recursive: true });
      await atomicWriteFile(fs, '...scripts/main.sh', boilerplate);
    }

    return { slug: spec.slug, path: unitDir, errors: [] };
  } catch (error) {
    // Cleanup on failure: remove partially created directory
    try { await fs.rmDir(unitDir, { recursive: true }); } catch { /* ignore */ }
    return { slug: spec.slug, path: '', errors: [createError(error)] };
  }
}
```

**Update** writes only unit.yaml — single file atomic write, simple case.

### Validate-After-Write Pattern

**RESOLVED: NOT implemented.** The write flow is:
1. Read current state
2. Apply patch
3. Validate merged state via Zod schema
4. Write validated state

Since we validate _before_ writing, a validate-after-write is redundant. If the write itself corrupts the file, `atomicWriteFile()` prevents that via tmp→rename.

---

## Decision 9: Concurrent Edit Handling

### RESOLVED: Last-write-wins with no optimistic locking

**Rationale**:
1. This is a local development tool, not a multi-user SaaS. Concurrent edits are rare.
2. The filesystem already provides last-write-wins semantics.
3. Optimistic locking requires a `version` or `etag` field, compare-and-swap logic, and retry handling — significant complexity for an unlikely scenario.
4. Git handles conflict resolution at the VCS level.

**If needed later**: Add an `etag` field (hash of unit.yaml content) to `LoadUnitResult`. The `update()` method would accept an optional `etag` parameter and return E189 on mismatch. This is a backward-compatible addition.

---

## Decision 10: New Error Codes

### Existing codes (E180-E187) — no changes

| Code | Factory | Purpose |
|------|---------|---------|
| E180 | `workunitNotFoundError(slug)` | Unit directory or unit.yaml missing |
| E181 | `workunitYamlParseError(slug, message)` | YAML syntax error |
| E182 | `workunitSchemaValidationError(slug, issues)` | Zod validation failure |
| E183 | `workunitNoTemplateError(slug)` | User-input type has no template |
| E184 | `workunitPathEscapeError(slug, path)` | Path traversal attempt |
| E185 | `workunitTemplateNotFoundError(slug, path)` | Template file missing |
| E186 | `workunitTypeMismatchError(slug, expected, actual)` | Wrong type-specific config |
| E187 | `workunitSlugInvalidError(slug)` | Slug fails regex |

### New codes (E188-E190)

| Code | Factory | Purpose |
|------|---------|---------|
| E188 | `workunitAlreadyExistsError(slug)` | Create/rename target slug already taken |
| E189 | `workunitConcurrencyError(slug)` | _(reserved)_ Optimistic lock mismatch if added later |
| E190 | `workunitDeleteFailedError(slug, reason)` | Filesystem removal failed |

### Implementation

```typescript
// In workunit-errors.ts — add to existing file:

export function workunitAlreadyExistsError(slug: string): ResultError {
  return {
    code: 'E188',
    message: `Work unit '${slug}' already exists`,
    action: `Choose a different slug or delete the existing unit first`,
  };
}

export function workunitDeleteFailedError(slug: string, reason: string): ResultError {
  return {
    code: 'E190',
    message: `Failed to delete work unit '${slug}': ${reason}`,
    action: `Check file permissions and try again`,
  };
}
```

---

## Complete Interface Definition

This is the **full interface** ready for implementation:

```typescript
// workunit-service.interface.ts (extended)

import type { ResultError } from '@chainglass/shared';
import type { WorkspaceContext } from '@chainglass/workflow';
import type {
  AgentConfig,
  CodeConfig,
  UserInputConfig,
  WorkUnitInput,
  WorkUnitOutput,
} from './workunit.schema.js';
import type {
  AgenticWorkUnitInstance,
  CodeUnitInstance,
  UserInputUnitInstance,
  WorkUnitInstance,
} from './workunit.classes.js';

// ── Existing result types (unchanged) ──────────────────────────

export interface WorkUnitSummary {
  slug: string;
  type: 'agent' | 'code' | 'user-input';
  version: string;
}

export interface ListUnitsResult {
  units: WorkUnitSummary[];
  errors: ResultError[];
}

export interface LoadUnitResult {
  unit?: WorkUnitInstance;
  errors: ResultError[];
}

export interface ValidateUnitResult {
  valid: boolean;
  errors: ResultError[];
}

// ── New types for write operations ─────────────────────────────

export interface CreateUnitSpec {
  slug: string;
  type: 'agent' | 'code' | 'user-input';
  description?: string;
  version?: string;
}

export interface CreateUnitResult {
  slug: string;
  path: string;
  errors: ResultError[];
}

export interface UpdateUnitPatch {
  description?: string;
  version?: string;
  inputs?: WorkUnitInput[];
  outputs?: WorkUnitOutput[];
  agent?: Partial<AgentConfig>;
  code?: Partial<CodeConfig>;
  user_input?: Partial<UserInputConfig>;
}

export interface UpdateUnitResult {
  slug: string;
  errors: ResultError[];
}

export interface DeleteUnitResult {
  slug: string;
  deleted: boolean;
  errors: ResultError[];
}

export interface RenameUnitResult {
  oldSlug: string;
  newSlug: string;
  path: string;
  errors: ResultError[];
}

// ── Extended service interface ─────────────────────────────────

export interface IWorkUnitService {
  // Read operations (existing, unchanged)
  list(ctx: WorkspaceContext): Promise<ListUnitsResult>;
  load(ctx: WorkspaceContext, slug: string): Promise<LoadUnitResult>;
  validate(ctx: WorkspaceContext, slug: string): Promise<ValidateUnitResult>;

  // Write operations (new)
  create(ctx: WorkspaceContext, spec: CreateUnitSpec): Promise<CreateUnitResult>;
  update(ctx: WorkspaceContext, slug: string, patch: UpdateUnitPatch): Promise<UpdateUnitResult>;
  delete(ctx: WorkspaceContext, slug: string): Promise<DeleteUnitResult>;
  rename(ctx: WorkspaceContext, oldSlug: string, newSlug: string): Promise<RenameUnitResult>;
}
```

---

## FakeWorkUnitService Updates

### New Call Tracking

```typescript
// Add to existing FakeWorkUnitService in fake-workunit.service.ts:

// New call tracking arrays
private createCalls: Array<{ ctx: WorkspaceContext; spec: CreateUnitSpec }> = [];
private updateCalls: Array<{ ctx: WorkspaceContext; slug: string; patch: UpdateUnitPatch }> = [];
private deleteCalls: Array<{ ctx: WorkspaceContext; slug: string }> = [];
private renameCalls: Array<{ ctx: WorkspaceContext; oldSlug: string; newSlug: string }> = [];
```

### Fake Behavior

```typescript
// create(): Add to internal units map, return success
async create(ctx: WorkspaceContext, spec: CreateUnitSpec): Promise<CreateUnitResult> {
  this.createCalls.push({ ctx, spec });

  // Check for preset errors
  const presetErrors = this.errors.get(spec.slug);
  if (presetErrors?.length) return { slug: spec.slug, path: '', errors: presetErrors };

  // Check duplicate
  if (this.units.has(spec.slug)) {
    return { slug: spec.slug, path: '', errors: [workunitAlreadyExistsError(spec.slug)] };
  }

  // Add to internal map with sensible defaults
  this.addUnit(buildFakeConfig(spec));
  return { slug: spec.slug, path: `/fake/.chainglass/units/${spec.slug}`, errors: [] };
}

// update(): Modify internal unit config
async update(ctx: WorkspaceContext, slug: string, patch: UpdateUnitPatch): Promise<UpdateUnitResult> {
  this.updateCalls.push({ ctx, slug, patch });

  if (!this.units.has(slug)) {
    return { slug, errors: [workunitNotFoundError(slug)] };
  }

  // Apply patch to internal config (simplified — no Zod validation in fake)
  const config = this.units.get(slug)!;
  if (patch.description !== undefined) config.description = patch.description;
  if (patch.version !== undefined) config.version = patch.version;
  // ... apply remaining fields

  return { slug, errors: [] };
}

// delete(): Remove from internal map
async delete(ctx: WorkspaceContext, slug: string): Promise<DeleteUnitResult> {
  this.deleteCalls.push({ ctx, slug });

  const existed = this.units.has(slug);
  this.removeUnit(slug);
  return { slug, deleted: existed, errors: [] };
}

// rename(): Remove old, add new
async rename(ctx: WorkspaceContext, oldSlug: string, newSlug: string): Promise<RenameUnitResult> {
  this.renameCalls.push({ ctx, oldSlug, newSlug });

  if (!this.units.has(oldSlug)) {
    return { oldSlug, newSlug, path: '', errors: [workunitNotFoundError(oldSlug)] };
  }
  if (this.units.has(newSlug)) {
    return { oldSlug, newSlug, path: '', errors: [workunitAlreadyExistsError(newSlug)] };
  }

  const config = this.units.get(oldSlug)!;
  config.slug = newSlug;
  this.units.delete(oldSlug);
  this.units.set(newSlug, config);

  return { oldSlug, newSlug, path: `/fake/.chainglass/units/${newSlug}`, errors: [] };
}
```

---

## Contract Test Extensions

### New Contract Cases

```typescript
// In workunit-service.contract.ts — add alongside existing tests:

describe('create()', () => {
  it('creates agent unit with scaffolded directory', async () => {
    const result = await service.create(ctx, {
      slug: 'test-agent',
      type: 'agent',
      description: 'A test agent',
    });
    expect(result.errors).toHaveLength(0);
    expect(result.slug).toBe('test-agent');
    expect(result.path).toContain('test-agent');

    // Verify round-trip: load what we created
    const loaded = await service.load(ctx, 'test-agent');
    expect(loaded.unit).toBeDefined();
    expect(loaded.unit!.type).toBe('agent');
    expect(loaded.unit!.description).toBe('A test agent');
  });

  it('creates code unit with script boilerplate', async () => {
    const result = await service.create(ctx, { slug: 'test-code', type: 'code' });
    expect(result.errors).toHaveLength(0);

    const loaded = await service.load(ctx, 'test-code');
    expect(loaded.unit!.type).toBe('code');
  });

  it('creates user-input unit', async () => {
    const result = await service.create(ctx, { slug: 'test-input', type: 'user-input' });
    expect(result.errors).toHaveLength(0);
  });

  it('returns E188 for duplicate slug', async () => {
    await service.create(ctx, { slug: 'dupe', type: 'agent' });
    const result = await service.create(ctx, { slug: 'dupe', type: 'agent' });
    expect(result.errors[0].code).toBe('E188');
  });

  it('returns E187 for invalid slug', async () => {
    const result = await service.create(ctx, { slug: 'Invalid!', type: 'agent' });
    expect(result.errors[0].code).toBe('E187');
  });
});

describe('update()', () => {
  it('updates description', async () => {
    await service.create(ctx, { slug: 'upd', type: 'agent' });
    const result = await service.update(ctx, 'upd', { description: 'Updated' });
    expect(result.errors).toHaveLength(0);

    const loaded = await service.load(ctx, 'upd');
    expect(loaded.unit!.description).toBe('Updated');
  });

  it('replaces inputs array', async () => {
    await service.create(ctx, { slug: 'upd2', type: 'agent' });
    const newInputs = [{
      name: 'source',
      type: 'data' as const,
      data_type: 'text' as const,
      required: true,
    }];
    const result = await service.update(ctx, 'upd2', { inputs: newInputs });
    expect(result.errors).toHaveLength(0);
  });

  it('returns E186 for type-mismatched config', async () => {
    await service.create(ctx, { slug: 'agent1', type: 'agent' });
    const result = await service.update(ctx, 'agent1', {
      code: { script: 'scripts/main.sh' },
    });
    expect(result.errors[0].code).toBe('E186');
  });

  it('returns E180 for non-existent unit', async () => {
    const result = await service.update(ctx, 'ghost', { description: 'nope' });
    expect(result.errors[0].code).toBe('E180');
  });
});

describe('delete()', () => {
  it('deletes existing unit', async () => {
    await service.create(ctx, { slug: 'del1', type: 'agent' });
    const result = await service.delete(ctx, 'del1');
    expect(result.deleted).toBe(true);
    expect(result.errors).toHaveLength(0);

    // Verify gone
    const loaded = await service.load(ctx, 'del1');
    expect(loaded.unit).toBeUndefined();
  });

  it('returns deleted: false for missing unit (idempotent)', async () => {
    const result = await service.delete(ctx, 'nonexistent');
    expect(result.deleted).toBe(false);
    expect(result.errors).toHaveLength(0);
  });
});

describe('rename()', () => {
  it('renames unit and updates slug in config', async () => {
    await service.create(ctx, { slug: 'old-name', type: 'agent' });
    const result = await service.rename(ctx, 'old-name', 'new-name');
    expect(result.errors).toHaveLength(0);
    expect(result.newSlug).toBe('new-name');

    // Old slug gone
    const oldLoad = await service.load(ctx, 'old-name');
    expect(oldLoad.unit).toBeUndefined();

    // New slug exists with correct slug field
    const newLoad = await service.load(ctx, 'new-name');
    expect(newLoad.unit!.slug).toBe('new-name');
  });

  it('returns E188 if target slug already taken', async () => {
    await service.create(ctx, { slug: 'a', type: 'agent' });
    await service.create(ctx, { slug: 'b', type: 'code' });
    const result = await service.rename(ctx, 'a', 'b');
    expect(result.errors[0].code).toBe('E188');
  });
});
```

---

## Server Action Design

### RESOLVED: New `workunit-actions.ts` file

```typescript
// apps/web/app/actions/workunit-actions.ts

'use server';

import type { CreateUnitSpec, UpdateUnitPatch } from '@chainglass/positional-graph';

// ── Create ──────────────────────────────────────────────────────

export async function createWorkUnit(
  worktreePath: string,
  spec: CreateUnitSpec
) {
  const { container } = await resolveContainer(worktreePath);
  const service = container.resolve<IWorkUnitService>(TOKENS.WORKUNIT_SERVICE);
  const ctx = { worktreePath };
  return service.create(ctx, spec);
}

// ── Update Metadata ─────────────────────────────────────────────

export async function updateWorkUnit(
  worktreePath: string,
  slug: string,
  patch: UpdateUnitPatch
) {
  const { container } = await resolveContainer(worktreePath);
  const service = container.resolve<IWorkUnitService>(TOKENS.WORKUNIT_SERVICE);
  const ctx = { worktreePath };
  return service.update(ctx, slug, patch);
}

// ── Update Template Content ─────────────────────────────────────

export async function updateWorkUnitPrompt(
  worktreePath: string,
  slug: string,
  content: string
) {
  const { container } = await resolveContainer(worktreePath);
  const service = container.resolve<IWorkUnitService>(TOKENS.WORKUNIT_SERVICE);
  const ctx = { worktreePath };
  const { unit, errors } = await service.load(ctx, slug);
  if (!unit || errors.length > 0) return { errors };
  if (unit.type !== 'agent') return { errors: [typeMismatchError(slug, 'agent', unit.type)] };
  await (unit as AgenticWorkUnitInstance).setPrompt(ctx, content);
  return { errors: [] };
}

export async function updateWorkUnitScript(
  worktreePath: string,
  slug: string,
  content: string
) {
  const { container } = await resolveContainer(worktreePath);
  const service = container.resolve<IWorkUnitService>(TOKENS.WORKUNIT_SERVICE);
  const ctx = { worktreePath };
  const { unit, errors } = await service.load(ctx, slug);
  if (!unit || errors.length > 0) return { errors };
  if (unit.type !== 'code') return { errors: [typeMismatchError(slug, 'code', unit.type)] };
  await (unit as CodeUnitInstance).setScript(ctx, content);
  return { errors: [] };
}

// ── Delete ──────────────────────────────────────────────────────

export async function deleteWorkUnit(
  worktreePath: string,
  slug: string
) {
  const { container } = await resolveContainer(worktreePath);
  const service = container.resolve<IWorkUnitService>(TOKENS.WORKUNIT_SERVICE);
  const ctx = { worktreePath };
  return service.delete(ctx, slug);
}

// ── Rename ──────────────────────────────────────────────────────

export async function renameWorkUnit(
  worktreePath: string,
  oldSlug: string,
  newSlug: string
) {
  const { container } = await resolveContainer(worktreePath);
  const service = container.resolve<IWorkUnitService>(TOKENS.WORKUNIT_SERVICE);
  const ctx = { worktreePath };
  return service.rename(ctx, oldSlug, newSlug);
}
```

**Why a separate file** (not extending `workflow-actions.ts`):
1. `workflow-actions.ts` already has 28 actions — it's large enough.
2. Work unit CRUD is a distinct concern from workflow graph operations.
3. Separate files enable separate import bundles for tree-shaking.
4. Aligns with the editor feature folder: `058-workunit-editor/`.

---

## Impact on Existing Consumers

### Files That Must Change

| File | Change | Risk |
|------|--------|------|
| `workunit-service.interface.ts` (positional-graph) | Add 4 methods + 5 types | Low — additive |
| `workunit.service.ts` (positional-graph) | Implement `create`, `update`, `delete`, `rename` | Medium — new code |
| `workunit-errors.ts` | Add E188, E190 | Low — additive |
| `fake-workunit.service.ts` (positional-graph) | Add 4 methods + call tracking | Low — follows pattern |
| `workunit.classes.ts` | Fix `setPrompt`/`setScript` to use `atomicWriteFile` | Low — bug fix |
| `index.ts` (029 barrel) | Export new types | Low — additive |
| `workunit-service.contract.ts` | Add contract cases for write methods | Low — additive |
| `fake-workunit-service.ts` (workgraph) | Add matching methods (keep parity) | Medium — dual maintenance |

### Files That Do NOT Change

| File | Why No Change |
|------|---------------|
| `workunit.schema.ts` | Schema validates data, not operations |
| `workunit.adapter.ts` | May need `createUnitDir()` helper, but path methods unchanged |
| `container.ts` | DI wiring unchanged — same token, same factory |
| `workunit.types.ts` | Compile-time assertions unchanged |
| `reserved-params.ts` | Reserved param routing unchanged |

### CLI Refactoring

The existing `cg unit create` in `apps/cli/src/commands/unit.command.ts` already calls `service.create()` using the **workgraph** service. Once the positional-graph version has `create()`, the CLI should be migrated to use the positional-graph service — unifying the implementation.

---

## Implementation Sequence

### Recommended Phase Order

```
Phase 1: Interface + Types + Errors
  ├── Add CreateUnitSpec, UpdateUnitPatch, etc. to interface file
  ├── Add E188, E190 to errors file  
  ├── Export from barrel
  └── Fix setPrompt/setScript to use atomicWriteFile (bug fix)

Phase 2: create() Implementation
  ├── Implement in WorkUnitService
  ├── Add to FakeWorkUnitService (both packages)
  ├── Contract tests for create
  └── Refactor CLI to use positional-graph service

Phase 3: update() + delete() Implementation
  ├── Implement in WorkUnitService
  ├── Add to FakeWorkUnitService
  └── Contract tests

Phase 4: rename() Implementation
  ├── Implement in WorkUnitService
  ├── Add to FakeWorkUnitService
  └── Contract tests

Phase 5: Server Actions
  ├── Create workunit-actions.ts
  └── Integration tests
```

---

## Open Questions

### Q1: Should `WorkUnitAdapter` gain write helper methods?

**OPEN**: The adapter currently only has read helpers (`getUnitDir`, `getUnitYamlPath`, `listUnitSlugs`, `unitExists`, `validateSlug`). Should it gain `createUnitDir()`, `removeUnitDir()`?

- **Option A**: Keep adapter read-only, service calls `fs.mkdir/rmDir` directly.
- **Option B**: Add `createUnitDir(ctx, slug)` and `removeUnitDir(ctx, slug)` for encapsulation.

Leaning toward **B** for consistency — the adapter owns path knowledge.

### Q2: Should the workgraph `IWorkUnitService` be updated in parallel?

**OPEN**: The workgraph package has its own `IWorkUnitService` with `create()` already. It's marked for deprecation but still used by CLI.

- **Option A**: Update both in parallel (maintain parity until workgraph is removed).
- **Option B**: Only update positional-graph, migrate CLI to use it immediately.

Leaning toward **B** — fewer places to maintain.

### Q3: Should `update()` accept a type-change operation?

**RESOLVED**: No. Changing a unit from `agent` to `code` is destructive (agent's prompt file becomes orphaned, code's script file doesn't exist). Use delete + create. The `type` field is intentionally absent from `UpdateUnitPatch`.

---

## Quick Reference

### Method Summary

| Method | Params | Returns | Key Errors |
|--------|--------|---------|------------|
| `create` | `(ctx, spec: CreateUnitSpec)` | `CreateUnitResult` | E187, E188 |
| `update` | `(ctx, slug, patch: UpdateUnitPatch)` | `UpdateUnitResult` | E180, E182, E186 |
| `delete` | `(ctx, slug)` | `DeleteUnitResult` | E187 |
| `rename` | `(ctx, oldSlug, newSlug)` | `RenameUnitResult` | E180, E187, E188 |

### Error Code Cheat Sheet

| Code | Meaning | When |
|------|---------|------|
| E180 | Not found | update/rename source missing |
| E182 | Schema invalid | update produces invalid config |
| E186 | Type mismatch | patch has wrong type-specific config |
| E187 | Bad slug | create/rename with invalid slug |
| E188 | Already exists | create/rename target taken |
| E190 | Delete failed | filesystem error during removal |

### Server Action Cheat Sheet

```typescript
// Create
const result = await createWorkUnit(worktreePath, { slug, type, description });

// Update metadata
const result = await updateWorkUnit(worktreePath, slug, { description, inputs, outputs });

// Update template content
const result = await updateWorkUnitPrompt(worktreePath, slug, promptContent);
const result = await updateWorkUnitScript(worktreePath, slug, scriptContent);

// Delete
const result = await deleteWorkUnit(worktreePath, slug);

// Rename
const result = await renameWorkUnit(worktreePath, oldSlug, newSlug);
```
