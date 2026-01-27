# Workspace Data Model Dossier

**Version**: 1.0.0
**Created**: 2026-01-27
**Status**: Draft

---

## Executive Summary

This document defines the data model for Chainglass workspaces, establishing a foundation that supports multiple features (agents, workflows, prompts, tools) while enabling git-based collaboration and cross-machine continuity.

**Key Design Decisions**:
1. **Split storage**: Global registry (user config) + per-worktree data (git-committed)
2. **Worktree-centric**: Data lives in the worktree you're working in, not centralized
3. **Git-native**: All workspace data commits to git, enabling merge-based sharing
4. **Domain-based**: Each feature (agents, workflows, etc.) owns its own data subdirectory

---

## Storage Architecture

### Two-Layer Model

```
┌─────────────────────────────────────────────────────────────────┐
│                     GLOBAL (User Config)                        │
│              ~/.config/chainglass/workspaces.json               │
│                                                                 │
│   Purpose: Track which repos are "workspaces" for UI display    │
│   Contains: Slug, name, path to main git repo                   │
│   Scope: User-level, not shared, not committed                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ references
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   LOCAL (Per-Worktree)                          │
│              <worktree-path>/.chainglass/                       │
│                                                                 │
│   Purpose: Store actual workspace data (agents, workflows...)   │
│   Contains: Domain-specific data files                          │
│   Scope: Git-committed, merges across branches, shared by team  │
└─────────────────────────────────────────────────────────────────┘
```

### Why This Split?

| Concern | Solution |
|---------|----------|
| "Which folders should the UI track?" | Global registry |
| "Where does agent session data live?" | Per-worktree `.chainglass/` |
| "How do I share workflow templates?" | Commit to git, merge branches |
| "Can I resume a session from another machine?" | Yes - data is in git |
| "What if I have multiple worktrees?" | Each has its own `.chainglass/` |

---

## Global Registry

### Location

```
~/.config/chainglass/workspaces.json
```

### Schema

```typescript
interface WorkspacesRegistry {
  version: "1.0";
  workspaces: WorkspaceEntry[];
}

interface WorkspaceEntry {
  slug: string;        // URL-safe identifier, e.g., "chainglass"
  name: string;        // Display name, e.g., "Chainglass"
  path: string;        // Absolute path to MAIN git repo (not worktrees)
  createdAt: string;   // ISO 8601 timestamp
}
```

### Example

```json
{
  "version": "1.0",
  "workspaces": [
    {
      "slug": "chainglass",
      "name": "Chainglass",
      "path": "/home/jak/substrate/014-workspaces",
      "createdAt": "2026-01-27T10:00:00Z"
    },
    {
      "slug": "my-saas",
      "name": "My SaaS Product",
      "path": "/home/jak/projects/my-saas",
      "createdAt": "2026-01-27T11:30:00Z"
    }
  ]
}
```

### Key Points

- **Only main repos**: Registry points to the main git repository, never to worktrees
- **Worktrees auto-discovered**: `git worktree list` finds them at runtime
- **Slug uniqueness**: Enforced on add; collisions append numeric suffix
- **Path validation**: Must exist and be a directory; warning if no `.git`

---

## Per-Worktree Data

### Location

```
<worktree-path>/.chainglass/
```

Every worktree (including the main working directory) can have its own `.chainglass/` folder.

### Directory Structure

```
.chainglass/
├── config.json                    # Optional workspace-local settings
└── data/
    ├── agents/                    # Agent sessions domain
    │   └── <agent-slug>/          # e.g., "claude-code", "copilot"
    │       └── <session-id>/      # e.g., "2026-01-27-a1b2c3"
    │           └── events.ndjson  # Append-only event log
    │
    ├── workflows/                 # Workflow templates domain
    │   └── <template-slug>/
    │       ├── workflow.json      # Template definition
    │       └── phases/
    │           └── *.md           # Phase definitions
    │
    ├── prompts/                   # Custom prompts domain (future)
    │   └── <prompt-slug>/
    │       └── prompt.md
    │
    └── tools/                     # Custom tools domain (future)
        └── <tool-slug>/
            └── tool.json
```

### Domain Isolation

Each domain (agents, workflows, prompts, tools) owns its subdirectory completely. Domains:
- Define their own internal structure
- Have their own adapter interface
- Can evolve independently
- Are discoverable by listing `data/` subdirectories

---

## Core Types

### Workspace Entity

```typescript
/**
 * Workspace as stored in the registry.
 * Immutable value object with factory creation.
 */
interface Workspace {
  readonly slug: string;
  readonly name: string;
  readonly path: string;        // Main git repo path
  readonly createdAt: string;
}
```

### WorkspaceInfo (Runtime)

```typescript
/**
 * Extended workspace info with runtime-discovered data.
 * Not persisted - computed on demand.
 */
interface WorkspaceInfo extends Workspace {
  readonly hasGit: boolean;
  readonly worktrees: Worktree[];
}

interface Worktree {
  readonly path: string;        // Absolute path to worktree
  readonly branch: string;      // Current branch name
}
```

### WorkspaceContext

```typescript
/**
 * Runtime context passed to domain adapters.
 * Provides paths for data operations.
 */
interface WorkspaceContext {
  readonly slug: string;
  readonly name: string;
  readonly mainRepoPath: string;    // Registered path (main git repo)
  readonly worktreePath: string;    // Current worktree (may equal mainRepoPath)
  readonly dataRoot: string;        // <worktreePath>/.chainglass/data
  readonly configPath: string;      // <worktreePath>/.chainglass/config.json
}
```

---

## Resolution Logic

### Problem

Given a current working directory, determine:
1. Which workspace (if any) we're in
2. Which worktree's `.chainglass/` to use for data

### Algorithm

```
resolveWorkspace(cwd: string): WorkspaceContext | null

1. Walk up from CWD looking for .git (find git root)
2. If git root is a worktree:
   a. Get main repo path via `git rev-parse --git-common-dir`
   b. worktreePath = git root (the worktree)
   c. mainRepoPath = resolved main repo
3. Else:
   a. worktreePath = git root
   b. mainRepoPath = git root
4. Look up mainRepoPath in registry
5. If found:
   a. Return WorkspaceContext with worktreePath for data operations
6. If not found:
   a. Return null (not a registered workspace)
```

### Override Flag

CLI commands support `--worktree <path>` to explicitly specify where data operations occur:

```bash
# Default: detect from CWD
cg agents sessions

# Explicit: use this path for data
cg agents sessions --worktree /home/jak/substrate/014-workspaces

# Works with main repo too (not just git worktrees)
cg agents sessions --worktree /home/jak/substrate/chainglass
```

The `--worktree` flag accepts **any git working directory**:
- A git worktree created via `git worktree add`
- The main git repo folder (someone working directly on main/branches there)
- Any path with a `.git` folder

When `--worktree` is provided:
- Use that path for `.chainglass/` data operations
- Resolve workspace by finding git root → main repo → registry lookup
- Useful for operating on any working directory from anywhere

**Note**: `--workspace <slug>` is only for registry-level commands (info, remove) where you're querying the workspace itself, not doing data operations.

### Examples

**Scenario 1: In main repo**
```
CWD: /home/jak/substrate/014-workspaces
Git root: /home/jak/substrate/014-workspaces
Is worktree: No
mainRepoPath: /home/jak/substrate/014-workspaces
worktreePath: /home/jak/substrate/014-workspaces
dataRoot: /home/jak/substrate/014-workspaces/.chainglass/data
```

**Scenario 2: In a worktree**
```
CWD: /home/jak/substrate/feature-branch/src
Git root: /home/jak/substrate/feature-branch
Is worktree: Yes (of 014-workspaces)
mainRepoPath: /home/jak/substrate/014-workspaces
worktreePath: /home/jak/substrate/feature-branch
dataRoot: /home/jak/substrate/feature-branch/.chainglass/data
```

**Scenario 3: Explicit worktree override**
```
CWD: /tmp/random
Flag: --worktree /home/jak/substrate/014-workspaces
Detects: 014-workspaces is worktree of chainglass main repo
mainRepoPath: /home/jak/substrate/chainglass
worktreePath: /home/jak/substrate/014-workspaces
dataRoot: /home/jak/substrate/014-workspaces/.chainglass/data
```

---

## Domain Adapter Pattern

### Base Class: WorkspaceDataAdapterBase

All domain adapters extend a common base class that provides shared functionality:

```typescript
/**
 * Base class for all workspace domain adapters.
 * Provides common file operations, path resolution, and structure management.
 */
abstract class WorkspaceDataAdapterBase<TEntity> {
  abstract readonly domain: string;  // "samples", "agents", "prompts", etc.

  constructor(
    protected readonly fs: IFileSystem,
    protected readonly pathResolver: IPathResolver
  ) {}

  // ─── Path Resolution ───────────────────────────────────────────────

  /**
   * Get the domain's data folder path.
   * Returns: <worktree>/.chainglass/data/<domain>/
   */
  protected getDomainPath(ctx: WorkspaceContext): string {
    return this.pathResolver.join(ctx.dataRoot, this.domain);
  }

  /**
   * Get path to a specific entity file.
   * Returns: <worktree>/.chainglass/data/<domain>/<slug>.json
   */
  protected getEntityPath(ctx: WorkspaceContext, slug: string): string {
    return this.pathResolver.join(this.getDomainPath(ctx), `${slug}.json`);
  }

  // ─── Structure Management ──────────────────────────────────────────

  /**
   * Ensure domain directory exists. Called before write operations.
   */
  async ensureStructure(ctx: WorkspaceContext): Promise<Result<void>> {
    const domainPath = this.getDomainPath(ctx);
    // Create <worktree>/.chainglass/data/<domain>/ if needed
    return this.fs.mkdir(domainPath, { recursive: true });
  }

  // ─── Common Operations ─────────────────────────────────────────────

  /**
   * List all entity slugs in this domain.
   */
  async listSlugs(ctx: WorkspaceContext): Promise<Result<string[]>> {
    const domainPath = this.getDomainPath(ctx);
    // List .json files, strip extension to get slugs
  }

  /**
   * Check if an entity exists.
   */
  async exists(ctx: WorkspaceContext, slug: string): Promise<Result<boolean>> {
    const path = this.getEntityPath(ctx, slug);
    return this.fs.exists(path);
  }

  /**
   * Delete an entity by slug.
   */
  async deleteEntity(ctx: WorkspaceContext, slug: string): Promise<Result<void>> {
    const path = this.getEntityPath(ctx, slug);
    return this.fs.unlink(path);
  }

  // ─── JSON Helpers ──────────────────────────────────────────────────

  /**
   * Read and parse a JSON file.
   */
  protected async readJson<T>(path: string): Promise<Result<T>> {
    const content = await this.fs.readFile(path, 'utf-8');
    // Parse JSON, handle errors
  }

  /**
   * Write data as JSON to a file.
   */
  protected async writeJson<T>(path: string, data: T): Promise<Result<void>> {
    const content = JSON.stringify(data, null, 2);
    return this.fs.writeFile(path, content, 'utf-8');
  }
}
```

**What the base class provides**:
| Functionality | Method | Description |
|---------------|--------|-------------|
| Path resolution | `getDomainPath()` | Domain folder path |
| Path resolution | `getEntityPath()` | Entity file path |
| Structure | `ensureStructure()` | Create directories |
| CRUD | `listSlugs()` | List entities in domain |
| CRUD | `exists()` | Check entity exists |
| CRUD | `deleteEntity()` | Remove entity |
| I/O | `readJson()` | Parse JSON file |
| I/O | `writeJson()` | Write JSON file |

**What derived classes add**:
- `domain` property (the domain name)
- `load()` method with entity-specific parsing
- `save()` method with entity-specific validation
- Domain-specific methods (e.g., `appendEvent()` for agents)

---

### Example: Agent Data Adapter

```typescript
interface IAgentDataAdapter extends IDomainDataAdapter {
  readonly domain: "agents";

  // Session management
  createSession(ctx: WorkspaceContext, agentSlug: string): Promise<Result<string>>;

  // Event operations
  appendEvent(ctx: WorkspaceContext, agentSlug: string, sessionId: string, event: AgentEvent): Promise<Result<void>>;
  getEvents(ctx: WorkspaceContext, agentSlug: string, sessionId: string, since?: string): Promise<Result<AgentEvent[]>>;

  // Discovery
  listSessions(ctx: WorkspaceContext, agentSlug: string): Promise<Result<string[]>>;
  listAgents(ctx: WorkspaceContext): Promise<Result<string[]>>;
}
```

### Example: Workflow Data Adapter

```typescript
interface IWorkflowDataAdapter extends IDomainDataAdapter {
  readonly domain: "workflows";

  // Template operations
  saveTemplate(ctx: WorkspaceContext, template: WorkflowTemplate): Promise<Result<void>>;
  getTemplate(ctx: WorkspaceContext, slug: string): Promise<Result<WorkflowTemplate>>;
  listTemplates(ctx: WorkspaceContext): Promise<Result<string[]>>;
  deleteTemplate(ctx: WorkspaceContext, slug: string): Promise<Result<void>>;
}
```

### Adapter Resolution

Domain adapters receive `WorkspaceContext` and derive their paths:

```typescript
class AgentDataAdapter implements IAgentDataAdapter {
  readonly domain = "agents";

  private getSessionPath(ctx: WorkspaceContext, agentSlug: string, sessionId: string): string {
    return path.join(ctx.dataRoot, this.domain, agentSlug, sessionId);
  }

  private getEventsFile(ctx: WorkspaceContext, agentSlug: string, sessionId: string): string {
    return path.join(this.getSessionPath(ctx, agentSlug, sessionId), "events.ndjson");
  }
}
```

---

## Git Workflow

### What Gets Committed

**Everything in `.chainglass/`** is committed to git:

| Domain | Content | Why Commit? |
|--------|---------|-------------|
| agents | Session events | Resume sessions, review what happened on other machines |
| workflows | Templates | Share templates across team, merge improvements |
| prompts | Custom prompts | Team-shared prompts, version controlled |
| tools | Tool configs | Shared tool definitions |

### Typical Workflow

```
1. Create feature branch + worktree
   $ git worktree add ../feature-branch -b feature/new-workflow

2. Work in worktree, data accumulates
   ../feature-branch/.chainglass/data/workflows/my-template/...
   ../feature-branch/.chainglass/data/agents/claude-code/...

3. Commit workspace data with feature
   $ git add .chainglass/
   $ git commit -m "Add new workflow template"

4. Merge to main
   $ git checkout main
   $ git merge feature/new-workflow

5. Main now has the workflow template
   ./main/.chainglass/data/workflows/my-template/...

6. Other worktrees get it after merge/rebase
```

### Merge Conflicts

Conflicts in `.chainglass/` are **expected and desired**:
- Treated like code conflicts
- Resolved manually or with merge tools
- Enables intentional curation of shared resources

### .gitignore Considerations

By default, nothing is ignored. Teams may choose to ignore certain data:

```gitignore
# Optional: Ignore agent sessions (keep templates, prompts)
# .chainglass/data/agents/

# Optional: Ignore large session files only
# .chainglass/data/agents/**/events.ndjson
```

---

## Service Layer

### IWorkspaceService

```typescript
interface IWorkspaceService {
  // Registry operations
  list(): Promise<Result<Workspace[]>>;
  get(slug: string): Promise<Result<Workspace>>;
  add(name: string, path: string): Promise<Result<Workspace>>;
  remove(slug: string): Promise<Result<void>>;

  // Runtime info (includes worktree discovery)
  getInfo(slug: string): Promise<Result<WorkspaceInfo>>;

  // Context resolution
  getContext(slug: string, worktreePath?: string): Promise<Result<WorkspaceContext>>;
  resolveFromPath(path: string): Promise<Result<WorkspaceContext | null>>;
}
```

### Dependency Flow

```
┌──────────────┐     ┌───────────────────┐     ┌──────────────────┐
│  CLI / Web   │────▶│ IWorkspaceService │────▶│ IWorkspaceAdapter│
│   Commands   │     │                   │     │  (registry I/O)  │
└──────────────┘     └───────────────────┘     └──────────────────┘
                              │
                              │ provides WorkspaceContext
                              ▼
                     ┌───────────────────┐
                     │  Domain Adapters  │
                     │  (agents, etc.)   │
                     └───────────────────┘
```

---

## Exemplar Domain: Sample

The **Sample** domain is intentionally simple - it exists to validate the workspace data model patterns before applying them to real domains (agents, workflows, prompts).

### Purpose

- Validate WorkspaceContext flows through to domain adapters
- Prove per-worktree data storage in `.chainglass/data/<domain>/`
- Demonstrate Entity + Adapter + Fake + Service pattern
- Test CRUD operations and entity listing
- Provide copy-paste template for real domains

### Sample Entity

```typescript
interface Sample {
  slug: string;        // identifier, e.g., "my-sample"
  name: string;        // display name
  content: string;     // arbitrary text content
  createdAt: string;   // ISO timestamp
  updatedAt: string;   // ISO timestamp
}
```

### Storage Structure

```
<worktree>/.chainglass/data/samples/
  my-sample.json
  another-sample.json
```

**File format** (`my-sample.json`):
```json
{
  "slug": "my-sample",
  "name": "My Sample",
  "content": "This is sample content to validate the workspace data model.",
  "createdAt": "2026-01-27T12:00:00Z",
  "updatedAt": "2026-01-27T12:00:00Z"
}
```

### Sample Adapter Interface

```typescript
interface ISampleAdapter {
  load(ctx: WorkspaceContext, slug: string): Promise<Result<Sample>>;
  save(ctx: WorkspaceContext, sample: Sample): Promise<Result<void>>;
  list(ctx: WorkspaceContext): Promise<Result<Sample[]>>;
  delete(ctx: WorkspaceContext, slug: string): Promise<Result<void>>;
  exists(ctx: WorkspaceContext, slug: string): Promise<Result<boolean>>;
}
```

### Sample Adapter Implementation

```typescript
class SampleAdapter extends WorkspaceDataAdapterBase<Sample> implements ISampleAdapter {
  readonly domain = "samples";

  async load(ctx: WorkspaceContext, slug: string): Promise<Result<Sample>> {
    const path = this.getEntityPath(ctx, slug);
    return this.readJson<Sample>(path);
  }

  async save(ctx: WorkspaceContext, sample: Sample): Promise<Result<void>> {
    await this.ensureStructure(ctx);
    const path = this.getEntityPath(ctx, sample.slug);
    return this.writeJson(path, sample);
  }

  async list(ctx: WorkspaceContext): Promise<Result<Sample[]>> {
    const slugsResult = await this.listSlugs(ctx);
    if (!slugsResult.ok) return slugsResult;

    const samples: Sample[] = [];
    for (const slug of slugsResult.value) {
      const sampleResult = await this.load(ctx, slug);
      if (sampleResult.ok) samples.push(sampleResult.value);
    }
    return { ok: true, value: samples };
  }

  async delete(ctx: WorkspaceContext, slug: string): Promise<Result<void>> {
    return this.deleteEntity(ctx, slug);
  }

  async exists(ctx: WorkspaceContext, slug: string): Promise<Result<boolean>> {
    return super.exists(ctx, slug);
  }
}
```

### Fake Sample Adapter

```typescript
class FakeSampleAdapter implements ISampleAdapter {
  // ─── State Setup ───────────────────────────────────────────────────
  samples: Map<string, Sample> = new Map();  // slug → Sample

  loadError?: Error;
  saveError?: Error;
  listError?: Error;
  deleteError?: Error;

  // ─── State Inspection ──────────────────────────────────────────────
  loadCalls: Array<{ ctx: WorkspaceContext; slug: string }> = [];
  saveCalls: Array<{ ctx: WorkspaceContext; sample: Sample }> = [];
  listCalls: Array<{ ctx: WorkspaceContext }> = [];
  deleteCalls: Array<{ ctx: WorkspaceContext; slug: string }> = [];

  // ─── Implementation ────────────────────────────────────────────────
  async load(ctx: WorkspaceContext, slug: string): Promise<Result<Sample>> {
    this.loadCalls.push({ ctx, slug });
    if (this.loadError) return { ok: false, error: this.loadError };
    const sample = this.samples.get(slug);
    if (!sample) return { ok: false, error: new EntityNotFoundError('Sample', slug) };
    return { ok: true, value: sample };
  }

  async save(ctx: WorkspaceContext, sample: Sample): Promise<Result<void>> {
    this.saveCalls.push({ ctx, sample });
    if (this.saveError) return { ok: false, error: this.saveError };
    this.samples.set(sample.slug, sample);
    return { ok: true, value: undefined };
  }

  async list(ctx: WorkspaceContext): Promise<Result<Sample[]>> {
    this.listCalls.push({ ctx });
    if (this.listError) return { ok: false, error: this.listError };
    return { ok: true, value: Array.from(this.samples.values()) };
  }

  async delete(ctx: WorkspaceContext, slug: string): Promise<Result<void>> {
    this.deleteCalls.push({ ctx, slug });
    if (this.deleteError) return { ok: false, error: this.deleteError };
    this.samples.delete(slug);
    return { ok: true, value: undefined };
  }

  async exists(ctx: WorkspaceContext, slug: string): Promise<Result<boolean>> {
    return { ok: true, value: this.samples.has(slug) };
  }

  // ─── Test Helpers ──────────────────────────────────────────────────
  reset(): void {
    this.samples.clear();
    this.loadError = undefined;
    this.saveError = undefined;
    this.listError = undefined;
    this.deleteError = undefined;
    this.loadCalls = [];
    this.saveCalls = [];
    this.listCalls = [];
    this.deleteCalls = [];
  }
}
```

### What Sample Validates

| Aspect | Validated By |
|--------|--------------|
| WorkspaceContext passing | All adapter methods receive `ctx` |
| Path resolution | `getEntityPath()` builds correct paths |
| Domain isolation | Data goes to `data/samples/` subfolder |
| CRUD operations | load, save, list, delete, exists |
| Base class inheritance | SampleAdapter extends WorkspaceDataAdapterBase |
| Fake three-part API | State setup, inspection, error injection |
| Git workflow | Create samples in worktree, merge to main |

### After Sample Works

Once Sample is validated end-to-end (entity → adapter → fake → service → CLI → tests), apply the same pattern to:

1. **Agents** - session storage for 015-better-agents
2. **Workflows** - migrate existing `.chainglass/workflows/`
3. **Prompts** - shared prompt templates
4. **Tools** - custom tool configurations

---

## Integration with Better-Agents Spec

The better-agents spec (015) defines agent session storage. This data model supersedes the storage structure proposed there.

### Updated Storage Path

**Before** (015 spec draft):
```
.chainglass/workspaces/<workspace-slug>/data/<agent-slug>/<session-id>/
```

**After** (this model):
```
<worktree>/.chainglass/data/agents/<agent-slug>/<session-id>/
```

### Key Changes

1. No `workspaces/` subdirectory - the `.chainglass/` is already workspace-scoped
2. Explicit `agents/` domain folder for clarity
3. Path is relative to current worktree, not a fixed location

### AgentDataAdapter Integration

The `IAgentDataAdapter` from 015 receives `WorkspaceContext`:

```typescript
// Getting events for an agent session
const workspaceService = container.resolve(IWorkspaceService);
const agentAdapter = container.resolve(IAgentDataAdapter);

// Resolve from CWD (or explicit --worktree path)
const worktreePath = options.worktree ?? process.cwd();
const ctx = await workspaceService.resolveFromPath(worktreePath);

if (ctx) {
  const events = await agentAdapter.getEvents(ctx, "claude-code", "2026-01-27-abc");
  // Reads from: <worktreePath>/.chainglass/data/agents/claude-code/2026-01-27-abc/events.ndjson
}
```

---

## Web UI Implications

### Workspace List Page (`/workspaces`)

- Reads from global registry
- Shows all registered workspaces
- For each workspace, can expand to show discovered worktrees

### Workspace Detail View

- Select a workspace → shows worktrees
- Select a worktree → sets context for data operations
- Agent sessions, workflows, etc. read from selected worktree's `.chainglass/`

### API Routes

```
GET  /api/workspaces                    # List from registry
POST /api/workspaces                    # Add to registry
DELETE /api/workspaces/:slug            # Remove from registry

GET  /api/workspaces/:slug              # Get workspace info + worktrees
GET  /api/workspaces/:slug/context      # Get WorkspaceContext for a worktree
     ?worktree=/path/to/worktree        # Optional: specific worktree

# Domain-specific routes receive workspace context
GET  /api/workspaces/:slug/agents/sessions
     ?worktree=/path/to/worktree
```

---

## Error Codes

| Code | Name | Description |
|------|------|-------------|
| E074 | WORKSPACE_NOT_FOUND | Workspace slug not in registry |
| E075 | WORKSPACE_EXISTS | Slug already exists in registry |
| E076 | PATH_NOT_FOUND | Registered path doesn't exist |
| E077 | PATH_NOT_DIRECTORY | Path exists but is not a directory |
| E078 | SLUG_INVALID | Slug contains invalid characters |
| E079 | WORKTREE_DETECTION_FAILED | Git command failed during worktree detection |
| E080 | DATA_ROOT_CREATION_FAILED | Could not create .chainglass/data directory |
| E081 | DOMAIN_NOT_FOUND | Requested domain doesn't exist |

---

## Migration Path

### From 015-better-agents Draft

If any data was created under the old proposed structure:
```
.chainglass/workspaces/<slug>/data/...
```

Migration:
1. Move contents to `.chainglass/data/...`
2. Remove empty `workspaces/` directory

### Future: Cross-Machine Sync

Current model defers cross-machine sync (beyond git). Future options:
- Cloud sync of `~/.config/chainglass/` (registry)
- Git handles `.chainglass/` data sync
- Optional: CRDTs for real-time collaboration

---

## Summary

| Aspect | Decision |
|--------|----------|
| Registry location | `~/.config/chainglass/workspaces.json` |
| Data location | `<worktree>/.chainglass/data/` |
| Data persistence | Git-committed |
| Worktree handling | Each worktree has own `.chainglass/` |
| Domain isolation | Subdirectories under `data/` |
| Context resolution | CWD-based with `--worktree` override |
| Merge strategy | Standard git merge, conflicts expected |
| Adapter pattern | `WorkspaceDataAdapterBase` with domain-specific subclasses |
| Exemplar domain | Sample (validates patterns before real domains) |

---

## Development & Testing

### Test Workspace

Use the Chainglass repo itself for development validation:

```
Main repo:  /home/jak/substrate/chainglass (main)
Worktrees:  /home/jak/substrate/002-agents
            /home/jak/substrate/003-wf-basics
            /home/jak/substrate/005-web-slick
            /home/jak/substrate/007-manage-workflows
            /home/jak/substrate/008-web-extras
            /home/jak/substrate/013-ci
            /home/jak/substrate/014-workspaces  ← current
            /home/jak/substrate/015-better-agents
```

**Register once**:
```json
{ "slug": "chainglass", "name": "Chainglass", "path": "/home/jak/substrate/chainglass" }
```

**Validates**:
- Worktree discovery (8 worktrees)
- Per-worktree data isolation
- CWD resolution across worktrees
- Merge workflow (data created in feature branch merges to main)

---

## Open Questions

None currently - model workshopped and agreed.

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-01-27 | Initial data model dossier |
| 1.1.0 | 2026-01-27 | Added WorkspaceDataAdapterBase class, Sample exemplar domain |
| 1.1.1 | 2026-01-27 | Clarified --worktree flag works with any git working directory |
