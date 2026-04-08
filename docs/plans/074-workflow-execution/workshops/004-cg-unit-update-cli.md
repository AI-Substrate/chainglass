# Workshop: cg unit update CLI Command

**Type**: CLI Flow
**Plan**: 074-workflow-execution
**Spec**: [workflow-execution-spec.md](../workflow-execution-spec.md)
**Created**: 2026-03-14
**Status**: Draft

**Related Documents**:
- [Workshop 003: Harness Test-Data CLI](003-harness-test-data-cli.md)
- [Unit Schema](../../../../packages/positional-graph/src/features/029-agentic-work-units/workunit.schema.ts)

**Domain Context**:
- **Primary Domain**: `_platform/positional-graph` — owns work unit CRUD
- **Related Domains**: Harness (consumer for test-data dogfooding)

---

## Purpose

Design the `cg unit update` CLI command that the harness test-data CLI can dogfood for hydrating work unit definitions (inputs, outputs, type-specific config). The service method `WorkUnitService.update()` already exists — this workshop designs the CLI surface.

## Key Questions Addressed

- How do you set complex arrays (inputs/outputs) from the command line?
- How does the harness invoke unit update programmatically?
- How do units relate to templates and instances (copied vs referenced)?
- What's the patch merge strategy and how does the CLI express it?

---

## Background: How Units Relate to Templates

Understanding this is critical for knowing WHY the harness needs `cg unit update`:

```
.chainglass/units/sample-coder/         ← Global unit definitions (source of truth)
    └── unit.yaml
    └── prompts/main.md

            │  cg template save-from
            ▼  (FULL COPY — directory + prompts + scripts)

.chainglass/templates/workflows/my-tpl/
    └── units/sample-coder/             ← Snapshot: copied at save-from time
        └── unit.yaml
        └── prompts/main.md

            │  cg template instantiate
            ▼  (FULL COPY from template)

.chainglass/data/workflows/my-workflow/
    └── (nodes reference unit by slug — resolved at runtime)
```

**Key insight**: Templates and instances copy units. So the harness must:
1. Create/update units in `.chainglass/units/` first
2. THEN save-from to create the template (captures the updated units)
3. THEN instantiate to create the workflow (captures from template)

This is why `cg unit update` matters — the harness needs to set inputs/outputs on units BEFORE template creation.

---

## What Already Exists

### WorkUnitService.update() — The Service Method

**File**: `packages/positional-graph/src/features/029-agentic-work-units/workunit.service.ts` (lines 267-329)

**Merge strategy**:
- **Scalars** (`description`, `version`): overwrite if defined
- **Arrays** (`inputs`, `outputs`): wholesale replacement if defined
- **Type-configs** (`agent`, `code`, `user_input`): shallow merge (spread)

**Validation**: Full Zod re-validation after patch applied. Invalid → returns errors, no write.

**Write**: Atomic file write (`atomicWriteFile()`).

### UpdateUnitPatch — The Patch Type

```typescript
interface UpdateUnitPatch {
  // Scalars (overwrite)
  description?: string;
  version?: string;

  // Arrays (wholesale replace)
  inputs?: Array<{
    name: string;           // /^[a-z][a-z0-9_]*$/  (underscores, not hyphens)
    type: 'data' | 'file';
    data_type?: 'text' | 'number' | 'boolean' | 'json';  // required when type='data'
    required: boolean;
    description?: string;
  }>;
  outputs?: Array<{
    name: string;
    type: 'data' | 'file';
    data_type?: 'text' | 'number' | 'boolean' | 'json';
    required: boolean;
    description?: string;
  }>;

  // Type-configs (shallow merge)
  agent?: Partial<{
    prompt_template: string;
    system_prompt: string;
    supported_agents: ('claude-code' | 'copilot')[];
    estimated_tokens: number;
  }>;
  code?: Partial<{
    script: string;
    timeout: number;
  }>;
  user_input?: Partial<{
    question_type: 'text' | 'single' | 'multi' | 'confirm';
    prompt: string;
    options?: Array<{ key: string; label: string; description?: string }>;
    default?: string | boolean;
  }>;
}
```

### What's NOT Wired Yet

- **No `cg unit update` CLI command** — the service exists, the CLI command does not
- **No `cg unit delete` CLI command** — service exists, CLI command does not
- **`cg unit create` has a bug** — calls `service.create(ctx, slug, options.type)` instead of `service.create(ctx, { slug, type: options.type })`

---

## Command Design

### The Problem: Arrays From the Command Line

Inputs and outputs are arrays of objects with 4-5 fields each. CLI options for this are inherently awkward. Three viable approaches:

| Approach | Example | Pros | Cons |
|----------|---------|------|------|
| **JSON blob** | `--inputs '[{"name":"spec",...}]'` | Exact, complete | Ugly, quote-escaping nightmare |
| **Structured repeatable** | `--add-input name:spec,type:data,data_type:text,required:true` | Readable | Custom parser, limited nesting |
| **Patch file** | `--patch patch.yaml` | Clean, any complexity | Requires temp file |

**Decision: All three, for different use cases.**

1. **`--patch <file>`** — Primary method for complex updates. YAML or JSON file containing the `UpdateUnitPatch`. Best for harness automation.
2. **`--set <key=value>`** — Scalar updates from CLI. Simple and familiar.
3. **`--add-input / --add-output`** — Structured repeatable flags for one-at-a-time I/O definitions.
4. **`--inputs-json / --outputs-json`** — JSON string for wholesale array replacement.

---

## Command Specification

### `cg unit update <slug>`

```
$ cg unit update <slug> [options]

Options:
  --description <text>          Update unit description
  --version <semver>            Update version string
  --patch <file>                Apply a YAML/JSON patch file (full UpdateUnitPatch)
  --set <key=value>             Set a type-config property (repeatable)
                                  Agent: --set prompt_template=prompts/main.md
                                  Code:  --set script=scripts/run.sh --set timeout=60
                                  User:  --set question_type=text --set prompt="What?"
  --add-input <spec>            Add an input (comma-separated fields, repeatable)
                                  Format: name:<n>,type:<t>[,data_type:<dt>],required:<bool>[,description:<d>]
  --add-output <spec>           Add an output (same format as --add-input)
  --inputs-json <json>          Replace all inputs (JSON array string)
  --outputs-json <json>         Replace all outputs (JSON array string)
  --json                        Output as JSON
  --workspace-path <path>       Override workspace context
```

---

## Usage Examples

### Simple scalar update

```
$ cg unit update test-agent --description "Updated test agent" --version 2.0.0

✓ Unit test-agent updated
  description: "Updated test agent"
  version: "2.0.0"
```

### Set type-config properties

```
$ cg unit update test-agent --set prompt_template=prompts/v2.md --set estimated_tokens=3000

✓ Unit test-agent updated
  agent.prompt_template: "prompts/v2.md"
  agent.estimated_tokens: 3000
```

```
$ cg unit update test-code --set script=scripts/run.sh --set timeout=120

✓ Unit test-code updated
  code.script: "scripts/run.sh"
  code.timeout: 120
```

```
$ cg unit update test-user-input --set question_type=single --set prompt="Pick one:"

✓ Unit test-user-input updated
  user_input.question_type: "single"
  user_input.prompt: "Pick one:"
```

### Add inputs/outputs one at a time

```
$ cg unit update test-agent \
    --add-input name:spec,type:data,data_type:text,required:true,description:Specification \
    --add-input name:context,type:data,data_type:json,required:false

✓ Unit test-agent updated
  inputs: 2 items
    spec (data/text, required)
    context (data/json, optional)
```

```
$ cg unit update test-agent \
    --add-output name:result,type:data,data_type:text,required:true \
    --add-output name:summary,type:data,data_type:text,required:false

✓ Unit test-agent updated
  outputs: 2 items
    result (data/text, required)
    summary (data/text, optional)
```

**Important**: `--add-input` and `--add-output` are ADDITIVE to existing arrays. They append, not replace. For wholesale replacement, use `--inputs-json` or `--patch`.

### JSON array replacement

```
$ cg unit update test-agent --inputs-json '[
  {"name":"spec","type":"data","data_type":"text","required":true},
  {"name":"context","type":"data","data_type":"json","required":false}
]'

✓ Unit test-agent updated
  inputs: 2 items (replaced)
```

### Patch file (the harness's preferred method)

```yaml
# patch.yaml
description: Test agent unit for harness validation
inputs:
  - name: spec
    type: data
    data_type: text
    required: true
    description: Specification to implement
outputs:
  - name: result
    type: data
    data_type: text
    required: true
    description: Implementation result
  - name: summary
    type: data
    data_type: text
    required: false
    description: Brief summary
agent:
  prompt_template: prompts/main.md
  supported_agents:
    - claude-code
  estimated_tokens: 1000
```

```
$ cg unit update test-agent --patch patch.yaml

✓ Unit test-agent updated (from patch file)
  description: "Test agent unit for harness validation"
  inputs: 1 item
  outputs: 2 items
  agent.prompt_template: "prompts/main.md"
  agent.supported_agents: ["claude-code"]
  agent.estimated_tokens: 1000
```

### JSON output

```
$ cg unit update test-agent --description "Updated" --json

{
  "slug": "test-agent",
  "errors": []
}
```

### Error case

```
$ cg unit update nonexistent --description "oops"

✗ Unit not found: nonexistent (E180)
  Run: cg unit list
```

```
$ cg unit update test-agent --set timeout=60

✗ Update failed (E182)
  'timeout' is a code config property but test-agent is type 'agent'
```

---

## How --set Routes to Type-Configs

The `--set` flag is type-aware. The service detects the unit's type and routes the key to the correct config section:

```typescript
function routeSetFlags(
  sets: string[],
  unitType: 'agent' | 'code' | 'user-input'
): Partial<UpdateUnitPatch> {
  const patch: Partial<UpdateUnitPatch> = {};
  const configProps = parseKeyValuePairs(sets);

  // Agent-specific keys
  const AGENT_KEYS = new Set([
    'prompt_template', 'system_prompt', 'supported_agents', 'estimated_tokens'
  ]);
  // Code-specific keys
  const CODE_KEYS = new Set(['script', 'timeout']);
  // User-input-specific keys
  const USER_INPUT_KEYS = new Set([
    'question_type', 'prompt', 'options', 'default'
  ]);

  const typeConfig: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(configProps)) {
    const keySet = unitType === 'agent' ? AGENT_KEYS
      : unitType === 'code' ? CODE_KEYS
      : USER_INPUT_KEYS;

    if (keySet.has(key)) {
      typeConfig[key] = value;
    } else {
      // Unknown key — error
      throw new Error(`Unknown property '${key}' for unit type '${unitType}'`);
    }
  }

  if (Object.keys(typeConfig).length > 0) {
    if (unitType === 'agent') patch.agent = typeConfig;
    else if (unitType === 'code') patch.code = typeConfig;
    else patch.user_input = typeConfig;
  }

  return patch;
}
```

**Why type-aware routing?** Users shouldn't need to know the YAML nesting. `--set timeout=60` on a code unit just works. `--set timeout=60` on an agent unit errors clearly.

---

## How --add-input Parsing Works

```typescript
function parseStructuredInput(spec: string): WorkUnitInput {
  const fields = spec.split(',');
  const obj: Record<string, unknown> = {};

  for (const field of fields) {
    const colonIndex = field.indexOf(':');
    if (colonIndex === -1) throw new Error(`Invalid field format: ${field}. Expected key:value`);
    const key = field.slice(0, colonIndex).trim();
    const value = field.slice(colonIndex + 1).trim();

    if (key === 'required') {
      obj[key] = value === 'true';
    } else {
      obj[key] = value;
    }
  }

  // Validate via Zod
  const result = WorkUnitInputSchema.safeParse(obj);
  if (!result.success) {
    throw new Error(`Invalid input spec: ${result.error.issues.map(i => i.message).join(', ')}`);
  }
  return result.data;
}
```

Example: `name:spec,type:data,data_type:text,required:true,description:The spec`
→ `{ name: "spec", type: "data", data_type: "text", required: true, description: "The spec" }`

---

## How the Harness Uses This

Workshop 003 defined the harness test-data CLI. With `cg unit update`, the harness becomes fully dogfooded:

```typescript
// harness/src/test-data/create-units.ts

async function createAndHydrateUnit(
  slug: string,
  type: 'agent' | 'code' | 'user-input',
  patchFile: string,
  options: CgExecOptions
): Promise<void> {
  // Step 1: Create scaffold
  await runCg(['unit', 'create', slug, '--type', type], options);

  // Step 2: Hydrate with full definition via patch file
  const patchPath = path.resolve(HARNESS_ROOT, 'test-data/patches', patchFile);
  await runCg(['unit', 'update', slug, '--patch', patchPath], options);

  // Step 3: Validate
  await runCg(['unit', 'validate', slug], options);
}
```

**Patch files** live in `harness/test-data/patches/`:
```
harness/test-data/patches/
├── test-agent.yaml
├── test-code.yaml
└── test-user-input.yaml
```

These are checked into git — deterministic, reviewable, versionable.

### Terminal output (agent sees everything):

```
  ▸ cg unit create test-agent --type agent --workspace-path /path --json
  ▸ cg unit update test-agent --patch harness/test-data/patches/test-agent.yaml --workspace-path /path --json
  ▸ cg unit validate test-agent --workspace-path /path --json
```

---

## Also Needed: `cg unit delete`

The service method exists but no CLI command. Simple addition:

```
$ cg unit delete <slug>

✓ Unit test-agent deleted
```

```
$ cg unit delete nonexistent

✓ Unit nonexistent deleted (was already absent)
```

Idempotent — no error if unit doesn't exist (matches service behavior).

---

## Command Registration

```typescript
// In unit.command.ts — add alongside existing commands

unit
  .command('update <slug>')
  .description(
    'Update a unit definition.\n\n' +
    'Merge strategy: scalars overwrite, arrays replace wholesale,\n' +
    'type-configs shallow-merge.\n\n' +
    'Examples:\n' +
    '  cg unit update my-agent --description "New desc"\n' +
    '  cg unit update my-agent --set prompt_template=prompts/v2.md\n' +
    '  cg unit update my-agent --add-input name:spec,type:data,data_type:text,required:true\n' +
    '  cg unit update my-agent --patch patch.yaml'
  )
  .option('--description <text>', 'Update unit description')
  .option('--version <semver>', 'Update version string')
  .option('--patch <file>', 'Apply YAML/JSON patch file (full UpdateUnitPatch)')
  .option(
    '--set <key=value>',
    'Set a type-config property (repeatable)',
    (v: string, a: string[]) => [...a, v],
    [] as string[]
  )
  .option(
    '--add-input <spec>',
    'Add input (format: name:n,type:t,data_type:dt,required:bool)',
    (v: string, a: string[]) => [...a, v],
    [] as string[]
  )
  .option(
    '--add-output <spec>',
    'Add output (same format as --add-input)',
    (v: string, a: string[]) => [...a, v],
    [] as string[]
  )
  .option('--inputs-json <json>', 'Replace all inputs (JSON array)')
  .option('--outputs-json <json>', 'Replace all outputs (JSON array)')
  .action(
    wrapAction(async (slug: string, options: UpdateUnitOptions, cmd: Command) => {
      const parentOpts = cmd.parent?.opts() ?? {};
      await handleUnitUpdate(slug, {
        ...options,
        json: parentOpts.json,
        workspacePath: parentOpts.workspacePath,
      });
    })
  );

unit
  .command('delete <slug>')
  .description('Delete a unit and its directory')
  .action(
    wrapAction(async (slug: string, _options: unknown, cmd: Command) => {
      const parentOpts = cmd.parent?.opts() ?? {};
      await handleUnitDelete(slug, {
        json: parentOpts.json,
        workspacePath: parentOpts.workspacePath,
      });
    })
  );
```

---

## Error Codes

| Code | Message | Cause |
|------|---------|-------|
| `E180` | Unit not found | Slug doesn't exist in `.chainglass/units/` |
| `E182` | Schema validation failed | Patch results in invalid unit.yaml |
| `E187` | Unit already exists | `create` on existing slug (use `update` instead) |
| `E108` | Invalid arguments | Bad `--add-input` format, unknown `--set` key |

---

## Open Questions

### Q1: Should --add-input append or replace?

**RESOLVED**: Append. `--add-input` adds to existing inputs. For wholesale replacement, use `--inputs-json` or `--patch`. This matches the intuitive meaning of "add". The service's `UpdateUnitPatch.inputs` replaces wholesale — the CLI handler merges `--add-input` items with the current inputs before calling `update()`.

### Q2: Should this be in Plan 074 scope?

**RESOLVED**: Yes, but lightweight. The service already exists. The CLI command is ~80 lines of wiring + ~40 lines of parsing. It's needed for the harness test-data commands to be fully dogfooded. Include in the harness test-data phase.

### Q3: What about the existing `cg unit create` bug?

**RESOLVED**: Fix it in the same phase. It's a one-line fix: change `service.create(ctx, slug, options.type)` to `service.create(ctx, { slug, type: options.type })`. Include in the unit CLI improvements alongside `update` and `delete`.

---

## Quick Reference

```bash
# Scalar updates
cg unit update my-agent --description "New description"
cg unit update my-agent --version 2.0.0

# Type-config properties (auto-routed by unit type)
cg unit update my-agent --set prompt_template=prompts/v2.md
cg unit update my-code --set timeout=120
cg unit update my-input --set question_type=single

# Add inputs/outputs (append)
cg unit update my-agent --add-input name:spec,type:data,data_type:text,required:true
cg unit update my-agent --add-output name:result,type:data,data_type:text,required:true

# Replace inputs/outputs (wholesale)
cg unit update my-agent --inputs-json '[{"name":"spec","type":"data","data_type":"text","required":true}]'

# Patch file (best for automation)
cg unit update my-agent --patch harness/test-data/patches/test-agent.yaml

# Delete
cg unit delete my-agent
```
