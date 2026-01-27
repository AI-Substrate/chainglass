# Research Report: Workspace Concept for Chainglass

**Generated**: 2026-01-27
**Research Query**: "Add workspace concept to Chainglass - folders/git repos as hierarchy, stored in ~/.config/chainglass as JSON, TDD-first headless design"
**Mode**: Plan-Associated
**Location**: docs/plans/014-workspaces/research-dossier.md
**FlowSpace**: Available
**Findings**: 55+ across 7 subagents

## Executive Summary

### What It Does
Workspaces are a hierarchical organizational concept for Chainglass representing folders (typically git repositories) that users work in. Each workspace can have sub-workspaces (git worktrees), and workflow runs are tied to workspaces for tracking execution history.

### Business Purpose
Provides the primary navigation hierarchy in the web app, letting users organize, switch between, and track work across multiple projects. Enables features like "show all workflow runs in this workspace" and future extensibility for workspace-specific tools, prompts, and settings.

### Key Insights
1. **Existing patterns are highly reusable** - Entity, Adapter, Service, Fake patterns from Workflow package provide complete blueprint
2. **Storage location confirmed** - `~/.config/chainglass/workspaces.json` for user-level workspace registry
3. **TDD-first means FakeWorkspaceAdapter + contract tests before any real implementation**
4. **Headless architecture** - All logic testable without UI, server-side data access

### Quick Stats
- **Similar Components**: Workflow package has ~15 files to mirror
- **Dependencies**: Reuse IFileSystem, IPathResolver, IConfigService from shared
- **Test Coverage**: Contract test pattern ensures 100% fake/real parity
- **Prior Learnings**: 15 directly applicable discoveries from previous plans

## Design Constraints

Per user requirements:

1. **Headless-first (TDD)** - All logic must be testable without UI
2. **Server-side** - Data accessible via browser refresh, no client-side state
3. **Storage in `~/.config/chainglass/`** - User-level JSON files (not project-level `.chainglass/`)

---

## How Existing Entities Work (Pattern to Follow)

### Entity Pattern
```typescript
// packages/workflow/src/entities/workflow.ts
export class Workflow {
  readonly slug: string;
  readonly workflowDir: string;
  readonly isCurrent: boolean;
  // ... readonly properties

  private constructor(...) { /* ... */ }

  static createCurrent(input: CurrentWorkflowInput): Workflow {
    return new Workflow(slug, workflowDir, true, null, null);
  }

  toJSON(): WorkflowJSON {
    return {
      slug: this.slug,
      // undefined -> null, Date -> ISO string
    };
  }
}
```

**Key characteristics**:
- Readonly properties for immutability
- Private constructor prevents direct instantiation
- Static factory methods enforce invariants
- `toJSON()` for serialization with explicit transformation rules

### Adapter Pattern
```typescript
// packages/workflow/src/adapters/workflow.adapter.ts
export class WorkflowAdapter implements IWorkflowAdapter {
  constructor(
    private readonly fs: IFileSystem,
    private readonly pathResolver: IPathResolver,
  ) {}

  async loadCurrent(slug: string): Promise<Workflow> {
    // Read from filesystem, create entity via factory
  }
}
```

**Key characteristics**:
- Injected dependencies (IFileSystem, IPathResolver)
- Handles all I/O operations
- Returns entities via factory methods
- Throws domain-specific errors (EntityNotFoundError)

### Service Pattern
```typescript
// packages/workflow/src/services/workflow-registry.service.ts
export class WorkflowRegistryService implements IWorkflowRegistry {
  async list(workflowsDir: string): Promise<ListResult> {
    // Never throws - returns errors in result.errors
    return { workflows: [...], errors: [] };
  }
}
```

**Key characteristics**:
- Never throws exceptions for business logic
- Returns Result types with errors array
- Orchestrates adapters and validators
- Empty errors array = success

### Fake Pattern (Three-Part API)
```typescript
export class FakeWorkflowAdapter implements IWorkflowAdapter {
  // 1. State Setup
  setWorkspace(workspace: Workspace): void { ... }

  // 2. State Inspection
  getLoadCalls(): string[] { ... }

  // 3. Error Injection
  setError(slug: string, error: Error): void { ... }

  // Plus: reset() for test isolation
}
```

---

## Proposed Workspace Architecture

### Storage Structure (`~/.config/chainglass/`)
```
~/.config/chainglass/
├── config.yaml              # Existing user config
├── secrets.env              # Existing secrets
└── workspaces.json          # NEW: Workspace registry
```

### workspaces.json Schema
```typescript
interface WorkspacesJSON {
  version: "1.0";
  workspaces: WorkspaceJSON[];
  activeWorkspace: string | null;  // slug of currently active workspace
}

interface WorkspaceJSON {
  slug: string;                    // unique identifier (derived from name)
  name: string;                    // user-provided display name
  path: string;                    // absolute path to folder
  createdAt: string;               // ISO-8601 timestamp
  lastAccessedAt: string | null;   // ISO-8601 timestamp
  isWorktree: boolean;             // true if git worktree (not main)
  parentWorkspace: string | null;  // slug of parent if worktree
  metadata: {
    gitRemote: string | null;      // detected git remote URL
    gitBranch: string | null;      // current branch
  };
}
```

### Workspace Entity
```typescript
// packages/workspace/src/entities/workspace.ts (or packages/workflow/src/entities/workspace.ts)
export class Workspace {
  readonly slug: string;
  readonly name: string;
  readonly path: string;
  readonly isWorktree: boolean;
  readonly parentWorkspace: string | null;
  readonly createdAt: Date;
  readonly lastAccessedAt: Date | null;
  readonly metadata: WorkspaceMetadata;

  private constructor(
    slug: string,
    name: string,
    path: string,
    isWorktree: boolean,
    parentWorkspace: string | null,
    createdAt: Date,
    lastAccessedAt: Date | null,
    metadata: WorkspaceMetadata
  ) {
    this.slug = slug;
    this.name = name;
    this.path = path;
    this.isWorktree = isWorktree;
    this.parentWorkspace = parentWorkspace;
    this.createdAt = createdAt;
    this.lastAccessedAt = lastAccessedAt;
    this.metadata = metadata;
  }

  static create(input: WorkspaceCreateInput): Workspace {
    const slug = slugify(input.name);
    return new Workspace(
      slug,
      input.name,
      input.path,
      input.isWorktree ?? false,
      input.parentWorkspace ?? null,
      new Date(),
      null,
      input.metadata ?? { gitRemote: null, gitBranch: null }
    );
  }

  static fromJSON(json: WorkspaceJSON): Workspace {
    return new Workspace(
      json.slug,
      json.name,
      json.path,
      json.isWorktree,
      json.parentWorkspace,
      new Date(json.createdAt),
      json.lastAccessedAt ? new Date(json.lastAccessedAt) : null,
      json.metadata
    );
  }

  get isMainWorkspace(): boolean {
    return !this.isWorktree;
  }

  toJSON(): WorkspaceJSON {
    return {
      slug: this.slug,
      name: this.name,
      path: this.path,
      createdAt: this.createdAt.toISOString(),
      lastAccessedAt: this.lastAccessedAt?.toISOString() ?? null,
      isWorktree: this.isWorktree,
      parentWorkspace: this.parentWorkspace,
      metadata: { ...this.metadata },
    };
  }
}

interface WorkspaceCreateInput {
  name: string;
  path: string;
  isWorktree?: boolean;
  parentWorkspace?: string;
  metadata?: WorkspaceMetadata;
}

interface WorkspaceMetadata {
  gitRemote: string | null;
  gitBranch: string | null;
}
```

### IWorkspaceAdapter Interface
```typescript
// packages/workflow/src/interfaces/workspace-adapter.interface.ts
export interface IWorkspaceAdapter {
  /**
   * Load all workspaces from storage.
   */
  loadAll(): Promise<Workspace[]>;

  /**
   * Load a specific workspace by slug.
   * @throws EntityNotFoundError if not found
   */
  load(slug: string): Promise<Workspace>;

  /**
   * Check if workspace exists.
   */
  exists(slug: string): Promise<boolean>;

  /**
   * Save a workspace to storage (create or update).
   */
  save(workspace: Workspace): Promise<void>;

  /**
   * Remove a workspace from storage.
   * Does NOT delete the actual folder.
   */
  remove(slug: string): Promise<void>;

  /**
   * Get active workspace slug, or null if none set.
   */
  getActive(): Promise<string | null>;

  /**
   * Set the active workspace.
   */
  setActive(slug: string | null): Promise<void>;

  /**
   * Detect worktrees for a workspace path using git.
   */
  detectWorktrees(workspacePath: string): Promise<WorktreeInfo[]>;
}

export interface WorktreeInfo {
  path: string;
  branch: string;
  isMain: boolean;
}
```

### IWorkspaceService Interface
```typescript
// packages/workflow/src/interfaces/workspace-service.interface.ts
export interface WorkspaceAddResult extends BaseResult {
  workspace?: Workspace;
  warning?: string;  // e.g., "This is a git worktree"
}

export interface WorkspaceListResult extends BaseResult {
  workspaces: Workspace[];
  activeSlug: string | null;
}

export interface WorkspaceGetResult extends BaseResult {
  workspace?: Workspace;
  worktrees?: Workspace[];  // discovered sub-workspaces
}

export interface WorkspaceSwitchResult extends BaseResult {
  previousSlug: string | null;
  currentSlug: string;
}

export interface WorkspaceRemoveResult extends BaseResult {
  removedSlug: string;
}

export interface IWorkspaceService {
  /**
   * Add a new workspace by name and path.
   * Returns warning if path is a worktree (with override option).
   */
  add(name: string, path: string, options?: { allowWorktree?: boolean }): Promise<WorkspaceAddResult>;

  /**
   * Remove a workspace by slug.
   * Does NOT delete the actual folder.
   */
  remove(slug: string): Promise<WorkspaceRemoveResult>;

  /**
   * List all workspaces with active indicator.
   */
  list(): Promise<WorkspaceListResult>;

  /**
   * Get workspace info by slug, including discovered worktrees.
   */
  get(slug: string): Promise<WorkspaceGetResult>;

  /**
   * Switch active workspace.
   */
  switch(slug: string): Promise<WorkspaceSwitchResult>;

  /**
   * Auto-discover and add worktrees for a workspace.
   */
  discoverWorktrees(slug: string): Promise<WorkspaceListResult>;
}
```

---

## Testing Architecture (TDD-First)

### FakeWorkspaceAdapter Implementation
```typescript
// packages/workflow/src/fakes/fake-workspace-adapter.ts
export interface LoadCall {
  slug: string;
  timestamp: number;
}

export interface SaveCall {
  workspace: Workspace;
  timestamp: number;
}

export class FakeWorkspaceAdapter implements IWorkspaceAdapter {
  // === State Storage ===
  private workspaces = new Map<string, Workspace>();
  private activeSlug: string | null = null;
  private worktreeResults = new Map<string, WorktreeInfo[]>();

  // === Call Tracking ===
  private _loadCalls: LoadCall[] = [];
  private _loadAllCalls: number[] = [];
  private _saveCalls: SaveCall[] = [];
  private _removeCalls: string[] = [];

  // === Error Injection ===
  private errorOnSlug = new Map<string, Error>();

  // === State Setup Methods ===
  setWorkspace(workspace: Workspace): void {
    this.workspaces.set(workspace.slug, workspace);
  }

  setWorkspaces(workspaces: Workspace[]): void {
    this.workspaces.clear();
    for (const ws of workspaces) {
      this.workspaces.set(ws.slug, ws);
    }
  }

  setActiveSlug(slug: string | null): void {
    this.activeSlug = slug;
  }

  setWorktreeResult(path: string, worktrees: WorktreeInfo[]): void {
    this.worktreeResults.set(path, worktrees);
  }

  // === State Inspection Methods ===
  get loadCalls(): LoadCall[] {
    return [...this._loadCalls];
  }

  get loadAllCalls(): number[] {
    return [...this._loadAllCalls];
  }

  get saveCalls(): SaveCall[] {
    return [...this._saveCalls];
  }

  get removeCalls(): string[] {
    return [...this._removeCalls];
  }

  getLastSaveCall(): SaveCall | undefined {
    return this._saveCalls[this._saveCalls.length - 1];
  }

  // === Error Injection Methods ===
  setError(slug: string, error: Error): void {
    this.errorOnSlug.set(slug, error);
  }

  clearError(slug: string): void {
    this.errorOnSlug.delete(slug);
  }

  // === Interface Implementation ===
  async loadAll(): Promise<Workspace[]> {
    this._loadAllCalls.push(Date.now());
    return Array.from(this.workspaces.values());
  }

  async load(slug: string): Promise<Workspace> {
    this._loadCalls.push({ slug, timestamp: Date.now() });

    if (this.errorOnSlug.has(slug)) {
      throw this.errorOnSlug.get(slug)!;
    }

    const ws = this.workspaces.get(slug);
    if (!ws) {
      throw new EntityNotFoundError('Workspace', slug, '~/.config/chainglass/workspaces.json');
    }
    return ws;
  }

  async exists(slug: string): Promise<boolean> {
    return this.workspaces.has(slug);
  }

  async save(workspace: Workspace): Promise<void> {
    this._saveCalls.push({ workspace, timestamp: Date.now() });
    this.workspaces.set(workspace.slug, workspace);
  }

  async remove(slug: string): Promise<void> {
    this._removeCalls.push(slug);
    this.workspaces.delete(slug);
  }

  async getActive(): Promise<string | null> {
    return this.activeSlug;
  }

  async setActive(slug: string | null): Promise<void> {
    this.activeSlug = slug;
  }

  async detectWorktrees(workspacePath: string): Promise<WorktreeInfo[]> {
    return this.worktreeResults.get(workspacePath) ?? [];
  }

  // === Test Utility ===
  reset(): void {
    this.workspaces.clear();
    this.activeSlug = null;
    this.worktreeResults.clear();
    this._loadCalls = [];
    this._loadAllCalls = [];
    this._saveCalls = [];
    this._removeCalls = [];
    this.errorOnSlug.clear();
  }
}
```

### Contract Tests
```typescript
// test/contracts/workspace-adapter.contract.ts
export function workspaceAdapterContractTests(
  createContext: () => {
    adapter: IWorkspaceAdapter;
    setup: () => Promise<void>;
    cleanup?: () => Promise<void>;
  }
) {
  describe('IWorkspaceAdapter contract', () => {
    let ctx: ReturnType<typeof createContext>;

    beforeEach(async () => {
      ctx = createContext();
      await ctx.setup();
    });

    afterEach(async () => {
      await ctx.cleanup?.();
    });

    describe('load()', () => {
      it('throws EntityNotFoundError for missing workspace', async () => {
        await expect(ctx.adapter.load('nonexistent'))
          .rejects.toThrow(EntityNotFoundError);
      });

      it('returns workspace after save', async () => {
        const ws = Workspace.create({ name: 'Test', path: '/tmp/test' });
        await ctx.adapter.save(ws);

        const loaded = await ctx.adapter.load(ws.slug);
        expect(loaded.slug).toBe(ws.slug);
        expect(loaded.name).toBe(ws.name);
        expect(loaded.path).toBe(ws.path);
      });
    });

    describe('loadAll()', () => {
      it('returns empty array when no workspaces', async () => {
        const all = await ctx.adapter.loadAll();
        expect(all).toEqual([]);
      });

      it('returns all saved workspaces', async () => {
        const ws1 = Workspace.create({ name: 'One', path: '/tmp/one' });
        const ws2 = Workspace.create({ name: 'Two', path: '/tmp/two' });
        await ctx.adapter.save(ws1);
        await ctx.adapter.save(ws2);

        const all = await ctx.adapter.loadAll();
        expect(all).toHaveLength(2);
        expect(all.map(w => w.slug).sort()).toEqual(['one', 'two']);
      });
    });

    describe('exists()', () => {
      it('returns false for missing workspace', async () => {
        expect(await ctx.adapter.exists('nonexistent')).toBe(false);
      });

      it('returns true after save', async () => {
        const ws = Workspace.create({ name: 'Test', path: '/tmp/test' });
        await ctx.adapter.save(ws);
        expect(await ctx.adapter.exists(ws.slug)).toBe(true);
      });
    });

    describe('remove()', () => {
      it('makes workspace not exist', async () => {
        const ws = Workspace.create({ name: 'Test', path: '/tmp/test' });
        await ctx.adapter.save(ws);
        await ctx.adapter.remove(ws.slug);
        expect(await ctx.adapter.exists(ws.slug)).toBe(false);
      });
    });

    describe('active workspace', () => {
      it('returns null when no active workspace', async () => {
        expect(await ctx.adapter.getActive()).toBeNull();
      });

      it('returns slug after setActive', async () => {
        const ws = Workspace.create({ name: 'Test', path: '/tmp/test' });
        await ctx.adapter.save(ws);
        await ctx.adapter.setActive(ws.slug);
        expect(await ctx.adapter.getActive()).toBe(ws.slug);
      });

      it('can clear active with null', async () => {
        const ws = Workspace.create({ name: 'Test', path: '/tmp/test' });
        await ctx.adapter.save(ws);
        await ctx.adapter.setActive(ws.slug);
        await ctx.adapter.setActive(null);
        expect(await ctx.adapter.getActive()).toBeNull();
      });
    });
  });
}

// Run against FakeWorkspaceAdapter
describe('FakeWorkspaceAdapter contract', () => {
  workspaceAdapterContractTests(() => ({
    adapter: new FakeWorkspaceAdapter(),
    setup: async () => {},
  }));
});

// Run against real WorkspaceAdapter (integration)
describe('WorkspaceAdapter contract', () => {
  let tempConfigDir: string;

  workspaceAdapterContractTests(() => ({
    adapter: new WorkspaceAdapter(
      new NodeFileSystemAdapter(),
      new PathResolverAdapter(),
      tempConfigDir  // injected config dir for testing
    ),
    setup: async () => {
      tempConfigDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ws-test-'));
    },
    cleanup: async () => {
      await fs.rm(tempConfigDir, { recursive: true, force: true });
    },
  }));
});
```

---

## Web UI Integration (Server-Side)

### API Route Handler
```typescript
// apps/web/app/api/workspaces/route.ts
import { createWorkspaceProductionContainer, WORKSPACE_DI_TOKENS } from '@chainglass/workflow';
import type { IWorkspaceService } from '@chainglass/workflow';

export async function GET(): Promise<Response> {
  const container = createWorkspaceProductionContainer();
  const service = container.resolve<IWorkspaceService>(WORKSPACE_DI_TOKENS.WORKSPACE_SERVICE);

  const result = await service.list();

  if (result.errors.length > 0) {
    return Response.json({ success: false, errors: result.errors }, { status: 500 });
  }

  return Response.json({
    success: true,
    data: {
      workspaces: result.workspaces.map(w => w.toJSON()),
      activeSlug: result.activeSlug,
    },
  });
}

export async function POST(request: Request): Promise<Response> {
  const { name, path, allowWorktree } = await request.json();

  const container = createWorkspaceProductionContainer();
  const service = container.resolve<IWorkspaceService>(WORKSPACE_DI_TOKENS.WORKSPACE_SERVICE);

  const result = await service.add(name, path, { allowWorktree });

  if (result.errors.length > 0) {
    return Response.json({ success: false, errors: result.errors }, { status: 400 });
  }

  return Response.json({
    success: true,
    data: {
      workspace: result.workspace?.toJSON(),
      warning: result.warning,
    },
  }, { status: 201 });
}
```

### Server Component Page
```typescript
// apps/web/app/(dashboard)/workspaces/page.tsx
import { getWorkspaceService } from '@/lib/workspace-server';
import { WorkspaceList } from '@/components/workspaces/workspace-list';
import { AddWorkspaceForm } from '@/components/workspaces/add-workspace-form';

export default async function WorkspacesPage() {
  const service = getWorkspaceService();
  const result = await service.list();

  if (result.errors.length > 0) {
    return (
      <div className="p-4">
        <h1 className="text-2xl font-bold mb-4">Workspaces</h1>
        <div className="text-red-500">
          Error loading workspaces: {result.errors[0].message}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Workspaces</h1>
      <AddWorkspaceForm />
      <WorkspaceList
        workspaces={result.workspaces.map(w => w.toJSON())}
        activeSlug={result.activeSlug}
      />
    </div>
  );
}
```

---

## Prior Learnings Applied

| ID | Type | Key Insight | Action for Workspace |
|----|------|-------------|---------------------|
| PL-01 | security | All paths through IPathResolver | Inject into WorkspaceAdapter |
| PL-02 | pattern | Factory pattern for invariants | Private constructor + static create() |
| PL-03 | gotcha | Tilde expansion not automatic | expandTilde() before path operations |
| PL-04 | gotcha | import.meta.url fails in CJS | Use getModuleDir() for bundled assets |
| PL-05 | allocation | Error codes must not overlap | Use E074-E081 for workspace |
| PL-06 | architecture | copyDirectory() in IFileSystem | Use for workspace template copying |
| PL-07 | gotcha | Recursive copy needs explicit handling | Trust IFileSystem.copyDirectory() |
| PL-08 | gotcha | Hash determinism needs file sorting | Sort paths before hashing if needed |
| PL-09 | architecture | Embed schemas in TypeScript | No JSON file loading at runtime |
| PL-10 | ux | Progressive disclosure in CLI | `cg workspace list` shows all by default |
| PL-11 | serialization | toJSON() rules must be explicit | camelCase, undefined->null, Date->ISO |
| PL-12 | testing | Contract tests prevent fake drift | workspaceAdapterContractTests() |
| PL-13 | pattern | Fake three-part API | State setup, inspection, error injection |
| PL-14 | gotcha | STDIO must stay clean for MCP | No console.log in module-level code |
| PL-15 | gotcha | Process checks must be cross-platform | Use process.kill(pid, 0) not shell |

---

## Critical Discoveries

### Discovery 01: Storage Location is User-Level
**Impact**: Critical
**What**: Workspaces stored in `~/.config/chainglass/workspaces.json`, NOT project-level `.chainglass/`
**Why It Matters**: User can access workspaces from any directory; workspace list survives project deletion
**Required Action**: WorkspaceAdapter reads/writes to user config directory via `getUserConfigDir()`

### Discovery 02: Git Worktree Detection Required
**Impact**: High
**What**: When adding a workspace, must detect if path is a git worktree vs main repo
**Why It Matters**: Warn user to add main workspace instead; auto-discover worktrees as sub-workspaces
**Required Action**: Implement `git worktree list` parsing in WorkspaceAdapter.detectWorktrees()

### Discovery 03: Workflow Runs Should Reference Workspace
**Impact**: Medium (Future Enhancement)
**What**: Workflow runs should reference their workspace for history queries
**Why It Matters**: Enables "show all runs in workspace X" feature
**Required Action**: Consider adding `workspaceSlug` field to wf-status.json (out of scope for initial implementation)

### Discovery 04: Headless-First Architecture
**Impact**: Critical
**What**: All logic must be testable without UI; data must be server-side accessible
**Why It Matters**: TDD requires FakeWorkspaceAdapter before real implementation; browser refresh must show current state
**Required Action**: Service layer has no UI dependencies; web uses Server Components reading from service

### Discovery 05: Slug Generation Must Be Deterministic
**Impact**: Medium
**What**: Workspace slugs derived from names must be deterministic and URL-safe
**Why It Matters**: Slugs used for lookup, URLs, and cross-references
**Required Action**: Use consistent slugify function (lowercase, hyphen-separated, no special chars)

---

## Modification Considerations

### Safe to Modify
1. **packages/shared/src/di-tokens.ts** - Add WORKSPACE_DI_TOKENS
2. **packages/shared/src/interfaces/results/** - Add workspace result types
3. **apps/web/app/(dashboard)/** - Add workspaces page
4. **packages/workflow/src/entities/** - Add Workspace entity
5. **packages/workflow/src/interfaces/** - Add workspace interfaces
6. **packages/workflow/src/fakes/** - Add FakeWorkspaceAdapter, FakeWorkspaceService

### Modify with Caution
1. **packages/workflow/src/container.ts** - Add workspace registrations to DI
2. **~/.config/chainglass/** - User data, needs migration strategy if schema changes

### Danger Zones
1. **Existing workflow/phase entities** - Don't add workspace references yet
2. **wf-status.json schema** - Breaking change if modified

### Extension Points
1. **DI Container** - Add workspace registrations
2. **CLI Commands** - Add `cg workspace` command group
3. **MCP Tools** - Add `workspace_list`, `workspace_add`, etc.

---

## Error Code Allocation

Based on existing allocations:
- E001-E012: Phase operations
- E020-E029: Workflow operations
- E030-E039: Checkpoint/versioning
- E040-E049: Init operations
- E050-E059: Run operations
- E060-E069: Message operations

**Workspace error codes: E074-E081**

```typescript
export const WorkspaceErrorCodes = {
  WORKSPACE_NOT_FOUND: 'E074',
  WORKSPACE_ALREADY_EXISTS: 'E075',
  INVALID_WORKSPACE_PATH: 'E076',
  WORKSPACE_PATH_NOT_DIRECTORY: 'E077',
  WORKSPACE_IS_WORKTREE: 'E078',  // Warning, not error
  WORKSPACE_CONFIG_CORRUPT: 'E079',
  WORKSPACE_SLUG_CONFLICT: 'E080',
} as const;
```

---

## Recommended Implementation Order (TDD)

### Phase 1: Entity + Fake Adapter
- Workspace entity with factory methods
- WorkspaceJSON type definition
- FakeWorkspaceAdapter with three-part API
- Contract tests for IWorkspaceAdapter
- Unit tests for Workspace entity

### Phase 2: Service Layer
- IWorkspaceService interface
- WorkspaceService implementation
- FakeWorkspaceService with call tracking
- Service unit tests using FakeWorkspaceAdapter

### Phase 3: Real Adapter
- WorkspaceAdapter (JSON file I/O to ~/.config/chainglass/)
- Git worktree detection via shell command
- Contract test verification (same tests, real adapter)
- Integration tests with temp directories

### Phase 4: Web Integration
- API routes (GET/POST/DELETE /api/workspaces)
- Server Components for workspaces page
- WorkspaceList, WorkspaceCard components
- Worktree discovery UI

### Phase 5: CLI Commands
- `cg workspace add <name> <path>`
- `cg workspace list [--json]`
- `cg workspace info <slug>`
- `cg workspace remove <slug>`
- `cg workspace switch <slug>`

### Phase 6: MCP Tools (Optional)
- `workspace_list` tool
- `workspace_add` tool
- `workspace_info` tool

---

## File Inventory (Proposed)

### Core Files to Create
| File | Purpose |
|------|---------|
| packages/workflow/src/entities/workspace.ts | Workspace entity class |
| packages/workflow/src/interfaces/workspace-adapter.interface.ts | IWorkspaceAdapter interface |
| packages/workflow/src/interfaces/workspace-service.interface.ts | IWorkspaceService interface |
| packages/workflow/src/adapters/workspace.adapter.ts | WorkspaceAdapter implementation |
| packages/workflow/src/services/workspace.service.ts | WorkspaceService implementation |
| packages/workflow/src/fakes/fake-workspace-adapter.ts | FakeWorkspaceAdapter |
| packages/workflow/src/fakes/fake-workspace-service.ts | FakeWorkspaceService |
| packages/workflow/src/errors/workspace-errors.ts | Workspace error classes |

### Test Files to Create
| File | Purpose |
|------|---------|
| test/unit/workspace/workspace-entity.test.ts | Entity unit tests |
| test/unit/workspace/fake-workspace-adapter.test.ts | Fake adapter tests |
| test/unit/workspace/workspace-service.test.ts | Service unit tests |
| test/contracts/workspace-adapter.contract.ts | Contract tests |
| test/integration/workspace/workspace-adapter.test.ts | Real adapter integration |

### Web Files to Create
| File | Purpose |
|------|---------|
| apps/web/app/api/workspaces/route.ts | API route handler |
| apps/web/app/(dashboard)/workspaces/page.tsx | Workspaces page |
| apps/web/src/components/workspaces/workspace-list.tsx | List component |
| apps/web/src/components/workspaces/workspace-card.tsx | Card component |
| apps/web/src/components/workspaces/add-workspace-form.tsx | Add form component |

---

## Next Steps

1. **To create specification**: Run `/plan-1b-specify "workspace feature"`
2. **To clarify requirements**: Ask questions about specific aspects
3. **To start implementation**: Run `/plan-3-architect` after specification

---

**Research Complete**: 2026-01-27
**Report Location**: docs/plans/014-workspaces/research-dossier.md
