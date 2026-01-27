# Workshop: Data Files & Storage Structure

**Type**: Data Model
**Plan**: 014-workspaces
**Spec**: [workspaces-spec.md](../workspaces-spec.md)
**Data Model Dossier**: [data-model-dossier.md](../data-model-dossier.md)
**Created**: 2026-01-27
**Status**: Draft

**Related Documents**:
- [Phase 4 Tasks](../tasks/phase-4-service-layer-di-integration/tasks.md)
- [Sample Entity Implementation](../../../../packages/workflow/src/entities/sample.ts)
- [Sample Adapter](../../../../packages/workflow/src/adapters/sample.adapter.ts)

---

## Purpose

This workshop provides **concrete, copy-pasteable examples** of every data file in the workspace system. Use this as a reference during implementation to ensure consistent file formats, validation rules, and edge case handling.

## Key Questions Addressed

1. What does each JSON file look like (exact structure)?
2. What validation rules apply to each field?
3. How do files evolve (creation → updates → edge cases)?
4. What are the file naming conventions?
5. How do empty states and missing files behave?

---

## File Tree Overview

```
~/.config/chainglass/
└── workspaces.json                    # ◀ GLOBAL REGISTRY

<any-worktree>/
└── .chainglass/
    ├── config.json                    # ◀ WORKSPACE CONFIG (optional, future)
    └── data/
        ├── samples/                   # ◀ SAMPLE DOMAIN
        │   ├── my-sample.json
        │   └── another-sample.json
        ├── agents/                    # ◀ AGENT DOMAIN (015-better-agents)
        │   └── <agent-slug>/
        │       └── <session-id>/
        │           └── events.ndjson
        ├── workflows/                 # ◀ WORKFLOW DOMAIN (future)
        │   └── <template-slug>/
        │       └── workflow.json
        └── prompts/                   # ◀ PROMPT DOMAIN (future)
            └── <prompt-slug>/
                └── prompt.md
```

---

## 1. Global Registry: `workspaces.json`

### Location

```
~/.config/chainglass/workspaces.json
```

### Full Schema

```typescript
interface WorkspacesRegistry {
  /** Schema version for future migrations */
  version: '1.0';
  
  /** Array of registered workspaces */
  workspaces: WorkspaceEntry[];
}

interface WorkspaceEntry {
  /** URL-safe identifier (lowercase, hyphens only) */
  slug: string;
  
  /** Human-readable display name */
  name: string;
  
  /** Absolute path to MAIN git repo (never worktrees) */
  path: string;
  
  /** ISO 8601 timestamp when workspace was registered */
  createdAt: string;
}
```

### Example: Empty Registry (Fresh Install)

```json
{
  "version": "1.0",
  "workspaces": []
}
```

### Example: Single Workspace

```json
{
  "version": "1.0",
  "workspaces": [
    {
      "slug": "chainglass",
      "name": "Chainglass",
      "path": "/home/jak/substrate/chainglass",
      "createdAt": "2026-01-27T10:00:00.000Z"
    }
  ]
}
```

### Example: Multiple Workspaces

```json
{
  "version": "1.0",
  "workspaces": [
    {
      "slug": "chainglass",
      "name": "Chainglass",
      "path": "/home/jak/substrate/chainglass",
      "createdAt": "2026-01-27T10:00:00.000Z"
    },
    {
      "slug": "my-saas",
      "name": "My SaaS Product",
      "path": "/home/jak/projects/my-saas",
      "createdAt": "2026-01-27T11:30:00.000Z"
    },
    {
      "slug": "docs-site",
      "name": "Documentation Site",
      "path": "/home/jak/websites/docs",
      "createdAt": "2026-01-28T09:15:00.000Z"
    }
  ]
}
```

### Validation Rules

| Field | Rule | Error Code |
|-------|------|------------|
| `version` | Must be `"1.0"` | E084 (invalid data) |
| `slug` | Pattern: `^[a-z][a-z0-9-]*$` | E078 |
| `slug` | Max 50 characters | E078 |
| `slug` | Must be unique in array | E075 |
| `name` | Non-empty string | E084 |
| `name` | Max 100 characters | E084 |
| `path` | Absolute path (starts with `/` or `~`) | E076 |
| `path` | No `..` traversal | E076 |
| `path` | Must exist on filesystem | E076 |
| `path` | Must be a directory | E077 |
| `createdAt` | Valid ISO 8601 | E084 |

### Edge Cases

**File doesn't exist** → Create with empty workspaces array:
```json
{ "version": "1.0", "workspaces": [] }
```

**File is empty** → Same as above, recreate

**File is corrupted JSON** → Return E084, don't attempt recovery

**Path no longer exists** → Keep in registry, return warning on access (E076)

---

## 2. Sample Domain: `<slug>.json`

### Location

```
<worktree>/.chainglass/data/samples/<slug>.json
```

### Full Schema

```typescript
interface SampleFile {
  /** URL-safe identifier, matches filename (without .json) */
  slug: string;
  
  /** Human-readable display name */
  name: string;
  
  /** Arbitrary text content */
  content: string;
  
  /** ISO 8601 timestamp when created */
  createdAt: string;
  
  /** ISO 8601 timestamp when last updated */
  updatedAt: string;
}
```

### Example: Simple Sample

```json
{
  "slug": "hello-world",
  "name": "Hello World",
  "content": "This is a simple test sample to validate the workspace data model.",
  "createdAt": "2026-01-27T12:00:00.000Z",
  "updatedAt": "2026-01-27T12:00:00.000Z"
}
```

### Example: Sample with Rich Content

```json
{
  "slug": "code-snippet",
  "name": "TypeScript Example",
  "content": "```typescript\ninterface Sample {\n  slug: string;\n  name: string;\n  content: string;\n}\n```\n\nThis sample demonstrates multiline content with code blocks.",
  "createdAt": "2026-01-27T12:00:00.000Z",
  "updatedAt": "2026-01-27T14:30:00.000Z"
}
```

### Example: Sample with Special Characters in Content

```json
{
  "slug": "special-chars",
  "name": "Special Characters Test",
  "content": "Line 1\nLine 2\n\nTab:\tafter\n\nQuotes: \"hello\" and 'world'\n\nUnicode: 你好 🌍 café",
  "createdAt": "2026-01-27T12:00:00.000Z",
  "updatedAt": "2026-01-27T12:00:00.000Z"
}
```

### Directory Structure Examples

**Empty domain (no samples)**:
```
<worktree>/.chainglass/data/samples/
  (empty directory, or directory doesn't exist)
```

**Single sample**:
```
<worktree>/.chainglass/data/samples/
  hello-world.json
```

**Multiple samples**:
```
<worktree>/.chainglass/data/samples/
  code-snippet.json
  hello-world.json
  special-chars.json
```

### Validation Rules

| Field | Rule | Error Code |
|-------|------|------------|
| `slug` | Pattern: `^[a-z][a-z0-9-]*$` | E084 |
| `slug` | Max 50 characters | E084 |
| `slug` | Must match filename (without `.json`) | E084 |
| `name` | Non-empty string | E084 |
| `name` | Max 100 characters | E084 |
| `content` | String (can be empty) | E084 |
| `content` | Max 1MB | E084 |
| `createdAt` | Valid ISO 8601 | E084 |
| `updatedAt` | Valid ISO 8601 | E084 |
| `updatedAt` | Must be ≥ `createdAt` | E084 |

### Edge Cases

**Directory doesn't exist** → `list()` returns empty array, `save()` creates directory

**File doesn't exist** → `load()` returns E082 (not found)

**File is corrupted JSON** → `load()` returns E084 (invalid data)

**Slug mismatch (filename vs content)** → Trust filename, log warning

---

## 3. Workspace Config: `config.json` (Future)

### Location

```
<worktree>/.chainglass/config.json
```

### Proposed Schema (for future phases)

```typescript
interface WorkspaceConfig {
  /** Schema version */
  version: '1.0';
  
  /** Default agent for this workspace */
  defaultAgent?: string;
  
  /** Custom settings per domain */
  domains?: {
    agents?: {
      /** Default session timeout in minutes */
      sessionTimeout?: number;
    };
    samples?: {
      /** Max content size in bytes */
      maxContentSize?: number;
    };
  };
}
```

### Example (Future)

```json
{
  "version": "1.0",
  "defaultAgent": "claude-code",
  "domains": {
    "agents": {
      "sessionTimeout": 60
    },
    "samples": {
      "maxContentSize": 1048576
    }
  }
}
```

**Note**: This file is NOT implemented in Phase 4. Documented here for future reference.

---

## 4. Agent Domain: Session Events (015-better-agents)

### Location

```
<worktree>/.chainglass/data/agents/<agent-slug>/<session-id>/events.ndjson
```

### File Format: Newline-Delimited JSON (NDJSON)

Each line is a complete JSON object representing one event:

```ndjson
{"type":"session_start","timestamp":"2026-01-27T12:00:00.000Z","data":{"agentSlug":"claude-code"}}
{"type":"user_message","timestamp":"2026-01-27T12:00:05.000Z","data":{"content":"Hello, help me refactor this code"}}
{"type":"agent_response","timestamp":"2026-01-27T12:00:15.000Z","data":{"content":"I'll help you refactor...","tokens":150}}
{"type":"tool_call","timestamp":"2026-01-27T12:00:20.000Z","data":{"tool":"read_file","args":{"path":"src/main.ts"}}}
{"type":"session_end","timestamp":"2026-01-27T12:30:00.000Z","data":{"reason":"user_closed"}}
```

### Event Schema

```typescript
interface AgentEvent {
  /** Event type identifier */
  type: 'session_start' | 'session_end' | 'user_message' | 'agent_response' | 'tool_call' | 'error';
  
  /** ISO 8601 timestamp */
  timestamp: string;
  
  /** Event-specific payload */
  data: Record<string, unknown>;
}
```

### Directory Structure Example

```
<worktree>/.chainglass/data/agents/
├── claude-code/
│   ├── 2026-01-27-a1b2c3/
│   │   └── events.ndjson
│   └── 2026-01-27-d4e5f6/
│       └── events.ndjson
└── copilot/
    └── 2026-01-28-g7h8i9/
        └── events.ndjson
```

### Naming Convention

| Component | Pattern | Example |
|-----------|---------|---------|
| Agent slug | `^[a-z][a-z0-9-]*$` | `claude-code`, `copilot` |
| Session ID | `YYYY-MM-DD-<random6>` | `2026-01-27-a1b2c3` |

---

## 5. Slug Generation

### Algorithm

```typescript
function generateSlug(name: string): string {
  return name
    .toLowerCase()                    // "My Project" → "my project"
    .trim()                           // Remove leading/trailing whitespace
    .replace(/[^a-z0-9\s-]/g, '')     // Remove special chars
    .replace(/\s+/g, '-')             // Spaces → hyphens
    .replace(/-+/g, '-')              // Collapse multiple hyphens
    .replace(/^-|-$/g, '')            // Remove leading/trailing hyphens
    .slice(0, 50);                    // Max 50 chars
}
```

### Examples

| Input Name | Generated Slug |
|------------|----------------|
| `My Project` | `my-project` |
| `Chainglass` | `chainglass` |
| `My SaaS Product` | `my-saas-product` |
| `  Spaced  Name  ` | `spaced-name` |
| `Special!@#Chars` | `specialchars` |
| `UPPERCASE` | `uppercase` |
| `with-hyphens-already` | `with-hyphens-already` |
| `123-starts-with-number` | `123-starts-with-number` → Error (must start with letter) |
| `` (empty) | → Fallback to `workspace` or error |

### Collision Handling

When slug already exists, append numeric suffix:

```
my-project     # First
my-project-2   # Collision with "My Project"
my-project-3   # Another collision
```

---

## 6. Timestamp Handling

### Format

All timestamps use **ISO 8601 with milliseconds and Z (UTC)**:

```
2026-01-27T12:00:00.000Z
```

### TypeScript Helper

```typescript
function isoNow(): string {
  return new Date().toISOString();
}

// Example output: "2026-01-27T12:00:00.000Z"
```

### Rules

| Scenario | Behavior |
|----------|----------|
| Entity creation | `createdAt` = `updatedAt` = now |
| Entity update | `updatedAt` = now; `createdAt` unchanged |
| Adapter save | **Adapter** overwrites `updatedAt` (per DYK-P3-02) |
| Reading timestamps | Parse with `new Date(timestamp)` |

---

## 7. Path Resolution

### WorkspaceContext Paths

```typescript
interface WorkspaceContext {
  workspaceSlug: string;      // "chainglass"
  workspaceName: string;      // "Chainglass"
  workspacePath: string;      // "/home/jak/substrate/chainglass"
  worktreePath: string;       // "/home/jak/substrate/014-workspaces"
  worktreeBranch: string | null;  // "014-workspaces" or null
  isMainWorktree: boolean;    // false
  hasGit: boolean;            // true
}
```

### Derived Paths

```typescript
function getDomainPath(ctx: WorkspaceContext, domain: string): string {
  return `${ctx.worktreePath}/.chainglass/data/${domain}`;
}

function getEntityPath(ctx: WorkspaceContext, domain: string, slug: string): string {
  return `${ctx.worktreePath}/.chainglass/data/${domain}/${slug}.json`;
}
```

### Examples

| Context | Domain | Slug | Resolved Path |
|---------|--------|------|---------------|
| worktree=/home/jak/substrate/014-workspaces | samples | my-sample | `/home/jak/substrate/014-workspaces/.chainglass/data/samples/my-sample.json` |
| worktree=/home/jak/substrate/chainglass | samples | my-sample | `/home/jak/substrate/chainglass/.chainglass/data/samples/my-sample.json` |
| worktree=/home/jak/projects/my-saas | agents | claude-code | `/home/jak/projects/my-saas/.chainglass/data/agents/claude-code/` |

---

## 8. Error Codes Reference

| Code | Name | Applies To | Trigger |
|------|------|------------|---------|
| E074 | WORKSPACE_NOT_FOUND | Registry | Slug not in registry |
| E075 | WORKSPACE_EXISTS | Registry | Slug already exists |
| E076 | INVALID_PATH | Registry | Path validation failed (relative, traversal, not exists) |
| E077 | NOT_DIRECTORY | Registry | Path is not a directory |
| E078 | INVALID_SLUG | Workspace | Slug format invalid |
| E079 | WORKTREE_DETECTION_FAILED | Git | Git command error |
| E080 | DATA_ROOT_CREATION_FAILED | Domain | Can't create .chainglass/data |
| E081 | DOMAIN_NOT_FOUND | Domain | Domain directory missing |
| E082 | SAMPLE_NOT_FOUND | Sample | Sample file doesn't exist |
| E083 | SAMPLE_EXISTS | Sample | Sample with slug exists (on create) |
| E084 | INVALID_DATA | Any | JSON parse error or validation failure |

---

## 9. JSON Schema Definitions

### Registry Schema

```typescript
export const WORKSPACES_REGISTRY_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  required: ['version', 'workspaces'],
  properties: {
    version: {
      type: 'string',
      const: '1.0',
    },
    workspaces: {
      type: 'array',
      items: {
        type: 'object',
        required: ['slug', 'name', 'path', 'createdAt'],
        properties: {
          slug: {
            type: 'string',
            pattern: '^[a-z][a-z0-9-]*$',
            maxLength: 50,
          },
          name: {
            type: 'string',
            minLength: 1,
            maxLength: 100,
          },
          path: {
            type: 'string',
            minLength: 1,
          },
          createdAt: {
            type: 'string',
            format: 'date-time',
          },
        },
        additionalProperties: false,
      },
    },
  },
  additionalProperties: false,
} as const;
```

### Sample Schema

```typescript
export const SAMPLE_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  required: ['slug', 'name', 'content', 'createdAt', 'updatedAt'],
  properties: {
    slug: {
      type: 'string',
      pattern: '^[a-z][a-z0-9-]*$',
      maxLength: 50,
    },
    name: {
      type: 'string',
      minLength: 1,
      maxLength: 100,
    },
    content: {
      type: 'string',
      maxLength: 1048576, // 1MB
    },
    createdAt: {
      type: 'string',
      format: 'date-time',
    },
    updatedAt: {
      type: 'string',
      format: 'date-time',
    },
  },
  additionalProperties: false,
} as const;
```

---

## 10. Quick Reference: File Operations

### Reading Files

```typescript
// Registry
const registry = await fs.readFile('~/.config/chainglass/workspaces.json', 'utf-8');
const data: WorkspacesRegistry = JSON.parse(registry);

// Sample
const samplePath = `${ctx.worktreePath}/.chainglass/data/samples/${slug}.json`;
const content = await fs.readFile(samplePath, 'utf-8');
const sample: Sample = JSON.parse(content);
```

### Writing Files

```typescript
// Always pretty-print with 2-space indent
const json = JSON.stringify(data, null, 2);
await fs.writeFile(path, json, 'utf-8');
```

### Listing Entities

```typescript
// List all samples in a worktree
const domainPath = `${ctx.worktreePath}/.chainglass/data/samples`;
const files = await fs.readdir(domainPath);
const slugs = files
  .filter(f => f.endsWith('.json'))
  .map(f => f.replace('.json', ''));
```

### Checking Existence

```typescript
// Check if sample exists
const samplePath = `${ctx.worktreePath}/.chainglass/data/samples/${slug}.json`;
const exists = await fs.exists(samplePath);
```

### Deleting Entities

```typescript
// Delete sample
const samplePath = `${ctx.worktreePath}/.chainglass/data/samples/${slug}.json`;
await fs.unlink(samplePath);
```

---

## Open Questions

### Q1: Should we use `.json5` for human-editable files?

**RESOLVED**: No. Standard JSON is better for tooling compatibility. Users shouldn't hand-edit these files.

### Q2: What about file locking for concurrent writes?

**DEFERRED**: Not implementing in Phase 4. Documented as technical debt. Single-user CLI doesn't need it; web server will need it later.

### Q3: Maximum registry size?

**RESOLVED**: No hard limit. Practical limit is ~1000 workspaces before JSON parsing becomes noticeable. Not a concern for typical use.

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-01-27 | Initial workshop document |
