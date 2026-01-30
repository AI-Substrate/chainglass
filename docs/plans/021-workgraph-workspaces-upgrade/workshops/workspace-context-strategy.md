# Workshop: Workspace Context Strategy for WorkGraph Services

**Type**: Storage Design + Integration Pattern
**Plan**: 021-workgraph-workspaces-upgrade
**Spec**: [workgraph-workspaces-upgrade-spec.md](../workgraph-workspaces-upgrade-spec.md)
**Created**: 2026-01-28
**Status**: Draft

**Related Documents**:
- [SampleAdapter (Exemplar)](../../../../packages/workflow/src/adapters/sample.adapter.ts)
- [WorkspaceDataAdapterBase](../../../../packages/workflow/src/adapters/workspace-data-adapter-base.ts)
- [WorkspaceContext Interface](../../../../packages/workflow/src/interfaces/workspace-context.interface.ts)
- [SampleService (Service Layer Pattern)](../../../../packages/workflow/src/services/sample.service.ts)
- [sample.command.ts (CLI Pattern)](../../../../apps/cli/src/commands/sample.command.ts)

---

## Purpose

Design the strategy for making WorkGraph services workspace-aware. This workshop establishes the **canonical pattern** that all workgraph services (WorkGraphService, WorkNodeService, WorkUnitService, BootstrapPromptService) will follow. The decisions made here will serve as the exemplar for future domain migrations.

## Key Questions Addressed

1. **Constructor vs Method Parameter**: How should services receive WorkspaceContext?
2. **Fallback Behavior**: What happens when no context is provided?
3. **Relative vs Absolute Paths**: How should paths be stored in persisted data?
4. **File Path References**: How do we handle path references in node outputs (data.json)?
5. **Base Class vs Pattern**: Should workgraph services extend WorkspaceDataAdapterBase?

---

## Current State Analysis

### Existing Pattern: SampleAdapter (Exemplar)

The `SampleAdapter` class represents the canonical workspace-aware pattern:

```typescript
// packages/workflow/src/adapters/sample.adapter.ts

export class SampleAdapter extends WorkspaceDataAdapterBase implements ISampleAdapter {
  readonly domain = 'samples';

  // Every method receives ctx as FIRST parameter
  async load(ctx: WorkspaceContext, slug: string): Promise<Sample>
  async save(ctx: WorkspaceContext, sample: Sample): Promise<SampleSaveResult>
  async list(ctx: WorkspaceContext): Promise<Sample[]>
  async remove(ctx: WorkspaceContext, slug: string): Promise<SampleRemoveResult>
  async exists(ctx: WorkspaceContext, slug: string): Promise<boolean>
}
```

**Key Characteristics**:
- Context passed to **every method** (not stored in constructor)
- Methods delegate to base class: `this.getEntityPath(ctx, slug)`
- No direct path construction - always via base class helpers
- No caching of context - fresh per call

### Current WorkGraph Services (Migration Targets)

```typescript
// packages/workgraph/src/services/workgraph.service.ts

export class WorkGraphService implements IWorkGraphService {
  // HARDCODED - must change
  private readonly graphsDir = '.chainglass/work-graphs';

  constructor(
    private readonly fs: IFileSystem,
    private readonly pathResolver: IPathResolver,
    private readonly yamlParser: IYamlParser,
    private readonly workUnitService?: IWorkUnitService
  ) {}

  async create(slug: string): Promise<GraphCreateResult> {
    // Uses this.graphsDir directly - NOT workspace-aware
    const graphPath = this.pathResolver.join(this.graphsDir, slug);
    // ...
  }
}
```

**Four Services Need Migration**:

| Service | Hardcoded Path | Line |
|---------|----------------|------|
| `WorkGraphService` | `.chainglass/work-graphs` | 65 |
| `WorkNodeService` | `.chainglass/work-graphs` | 79 |
| `WorkUnitService` | `.chainglass/units` | 41 |
| `BootstrapPromptService` | Both paths | 51-53 |

### CLI Context Resolution Pattern

The CLI uses a consistent pattern for workspace context:

```typescript
// apps/cli/src/commands/sample.command.ts

// 1. Resolve context from CWD or explicit --workspace-path
async function resolveOrOverrideContext(overridePath?: string): Promise<WorkspaceContext | null> {
  const workspaceService = getWorkspaceService();
  const path = overridePath ?? process.cwd();
  return workspaceService.resolveContext(path);
}

// 2. Handle missing context at CLI layer (not service layer)
async function handleSampleAdd(name: string, options: AddOptions): Promise<void> {
  const ctx = await resolveOrOverrideContext(options.workspacePath);
  
  if (!ctx) {
    // Error handling at CLI layer - service never sees null context
    const outputResult = { errors: [{ code: 'E074', message: 'No workspace context found' }] };
    console.log(adapter.format('sample.add', outputResult));
    process.exit(1);
  }

  // Service receives guaranteed non-null context
  const result = await sampleService.add(ctx, name, options.content ?? '');
}
```

---

## Decision 1: Constructor vs Method Parameter

### Options Analyzed

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| **A** | Constructor injection (fixed lifetime) | Simpler API, less boilerplate | Can't change context per-call, awkward for multi-workspace CLI |
| **B** | Method parameter (every call) | Flexible, matches SampleAdapter, stateless | More verbose, repeated parameter |
| **C** | Hybrid (constructor default, method override) | Best of both? | Complex, two code paths, testing burden |

### Analysis

**Option A (Constructor)**:
```typescript
class WorkGraphService {
  constructor(
    private readonly fs: IFileSystem,
    private readonly ctx: WorkspaceContext  // Fixed at construction
  ) {}
  
  async create(slug: string) {
    const path = this.getGraphPath(this.ctx, slug);
  }
}

// Problem: Need new service instance per workspace context
const service1 = new WorkGraphService(fs, ctx1);  // workspace A
const service2 = new WorkGraphService(fs, ctx2);  // workspace B
```

**Problem**: DI containers resolve singletons. Multi-workspace CLI would need service factories or per-call container resolution.

**Option B (Method Parameter)**:
```typescript
class WorkGraphService {
  constructor(
    private readonly fs: IFileSystem
  ) {}
  
  async create(ctx: WorkspaceContext, slug: string) {
    const path = this.getGraphPath(ctx, slug);
  }
}

// Flexible: same service instance, different contexts
await service.create(ctx1, 'graph-a');  // workspace A
await service.create(ctx2, 'graph-b');  // workspace B
```

**Matches**: SampleAdapter, SampleService, established pattern.

**Option C (Hybrid)**:
```typescript
class WorkGraphService {
  constructor(
    private readonly fs: IFileSystem,
    private readonly defaultCtx?: WorkspaceContext
  ) {}
  
  async create(slug: string, ctx?: WorkspaceContext) {
    const effectiveCtx = ctx ?? this.defaultCtx;
    if (!effectiveCtx) throw new Error('No context');
    const path = this.getGraphPath(effectiveCtx, slug);
  }
}
```

**Problems**: 
- Two code paths to test
- Unclear which context is active
- Nullable logic throughout
- Violates "explicit is better than implicit"

### DECISION: Option B - Method Parameter

**Rationale**:
1. **Consistency**: Matches established SampleAdapter pattern exactly
2. **Flexibility**: Single service instance works across multiple workspace contexts
3. **Testability**: Stateless services are easier to test
4. **DI-Friendly**: Works with singleton resolution in containers
5. **Explicit**: Context is always visible at call site

**Method Signature Pattern**:
```typescript
// Context is ALWAYS the first parameter
async methodName(ctx: WorkspaceContext, ...otherParams): Promise<Result>
```

---

## Decision 2: Fallback Behavior

### Question

What happens when a service method is called without a valid WorkspaceContext?

### Options Analyzed

| Option | Description | Risk |
|--------|-------------|------|
| **A** | Throw at service layer | Fail-fast, clear error |
| **B** | Fallback to CWD | Silent behavior change, unexpected paths |
| **C** | Make ctx optional, use CWD default | Hidden state, hard to debug |
| **D** | Handle at CLI layer only | Services never see missing context |

### Analysis

**Option A (Service Throws)**:
```typescript
async create(ctx: WorkspaceContext | null, slug: string) {
  if (!ctx) throw new WorkspaceContextRequiredError();
  // ...
}
```

**Option D (CLI Handles)**:
```typescript
// CLI layer (sample.command.ts pattern)
const ctx = await resolveOrOverrideContext(options.workspacePath);
if (!ctx) {
  // Handle error at CLI
  console.error('Not in a workspace');
  process.exit(1);
}
// Service receives non-null ctx
await service.create(ctx, slug);
```

### DECISION: Option D - CLI Layer Handles Missing Context

**Rationale**:
1. **Matches Exemplar**: This is exactly what `sample.command.ts` does
2. **Type Safety**: Service methods have `ctx: WorkspaceContext` (non-nullable)
3. **Separation of Concerns**: CLI handles user errors, services handle business logic
4. **Better Error Messages**: CLI can provide contextual help (e.g., "Run: cg workspace list")
5. **No Defensive Code**: Services don't need null checks throughout

**Pattern**:
```typescript
// CLI layer (cg wg commands)
const ctx = await resolveOrOverrideContext(options.workspacePath);
if (!ctx) {
  // Human-readable error with actionable advice
  printError({
    code: 'E074',
    message: 'No workspace context found',
    action: 'Current directory is not inside a registered workspace. Run: cg workspace list',
  });
  process.exit(1);
}

// Service layer - ctx is guaranteed non-null
const result = await workGraphService.create(ctx, slug);
```

**Service Interface**:
```typescript
interface IWorkGraphService {
  // ctx is required, not optional
  create(ctx: WorkspaceContext, slug: string): Promise<GraphCreateResult>;
  load(ctx: WorkspaceContext, slug: string): Promise<GraphLoadResult>;
  // ...
}
```

---

## Decision 3: Relative vs Absolute Paths in Stored Data

### Question

How should paths be stored in persisted files (work-graph.yaml, state.json, data.json)?

### Current Behavior

Currently, paths stored in data files are **relative to the implicit CWD**:

```json
// Current data.json (in node's data/ directory)
{
  "outputs": {
    "script": ".chainglass/work-graphs/sample-e2e/nodes/sample-coder-123/data/outputs/script.sh"
  }
}
```

### Options Analyzed

| Option | Example | Pros | Cons |
|--------|---------|------|------|
| **A** | `.chainglass/data/work-graphs/...` | Portable across machines | Still assumes CWD is worktree root |
| **B** | `/home/user/project/.chainglass/data/...` | Unambiguous | Not portable, user-specific |
| **C** | Relative to data file location | `./outputs/script.sh` | Most portable | Requires path resolution logic |
| **D** | Symbolic (workspace-scoped) | `@workspace/data/work-graphs/...` | Clear semantics | Requires resolution |

### Analysis

**Context**: These paths are used by:
1. **Human inspection**: User reads data.json to find outputs
2. **Agent consumption**: LLM agent uses paths to locate/read files
3. **Tool integration**: Other tools may parse these paths

**Option A (Worktree-relative)**:
```json
{
  "script": ".chainglass/data/work-graphs/sample-e2e/nodes/sample-coder-123/data/outputs/script.sh"
}
```
- Works when CWD = worktree root (most common case)
- Agent can construct absolute path: `worktreePath + relativePath`
- Human can `cat` the file from worktree root

**Option C (File-relative)**:
```json
{
  "script": "./outputs/script.sh"
}
```
- Most portable
- Works regardless of worktree location
- Requires knowing the data.json location to resolve

### DECISION: Option A - Worktree-Relative Paths

**Rationale**:
1. **Current Pattern**: This is what the system already uses (just with old prefix)
2. **Agent Compatibility**: Agents receive `ctx.worktreePath`, can resolve easily
3. **Human Usability**: `cat` from worktree root works
4. **Simplicity**: No complex resolution needed - just path join
5. **Git-Friendly**: Relative paths work across clones

**Path Storage Pattern**:
```typescript
// Store paths relative to worktree root
const relativePath = '.chainglass/data/work-graphs/' + graphSlug + '/nodes/' + nodeId + '/data/outputs/' + filename;

// Resolve to absolute when needed
const absolutePath = pathResolver.join(ctx.worktreePath, relativePath);
```

**Migration Note**: The only change is the path prefix:
- Old: `.chainglass/work-graphs/...`
- New: `.chainglass/data/work-graphs/...`

---

## Decision 4: File Path References in Node Outputs

### Question

How do we ensure paths written to `data.json` reference the new location?

### Current data.json Structure

```json
{
  "status": "complete",
  "timestamp": "2026-01-28T10:00:00Z",
  "outputs": {
    "script": ".chainglass/work-graphs/sample-e2e/nodes/sample-coder-123/data/outputs/script.sh"
  },
  "inputs": {
    "requirements": "Create a shell script..."
  }
}
```

### Problem

The path `.chainglass/work-graphs/...` is **computed at write time**. We need to ensure it uses the new prefix.

### Solution

**Where Paths Are Computed**:

The `WorkNodeService.saveOutputData()` method constructs output paths:

```typescript
// packages/workgraph/src/services/worknode.service.ts (current)

async saveOutputData(graphSlug: string, nodeId: string, data: Record<string, unknown>) {
  // Construct path using hardcoded graphsDir
  const outputDir = this.pathResolver.join(
    this.graphsDir,      // ← This is the problem: '.chainglass/work-graphs'
    graphSlug,
    'nodes',
    nodeId,
    'data',
    'outputs'
  );
  // ...
}
```

**Solution - Use Context for Path Construction**:

```typescript
// After migration

async saveOutputData(
  ctx: WorkspaceContext,
  graphSlug: string,
  nodeId: string,
  data: Record<string, unknown>
) {
  // Use helper method with context
  const outputDir = this.getNodeOutputDir(ctx, graphSlug, nodeId);
  // This now returns: <worktreePath>/.chainglass/data/work-graphs/<slug>/nodes/<id>/data/outputs
  
  // When storing path in data.json, make it worktree-relative
  const relativePath = '.chainglass/data/work-graphs/' + graphSlug + '/nodes/' + nodeId + '/data/outputs/' + filename;
  
  data.outputs[filename] = relativePath;
  await this.writeDataJson(ctx, graphSlug, nodeId, data);
}
```

**Key Insight**: The stored path is a **constant string** constructed at write time. By updating the path construction logic in `saveOutputData()`, all new files automatically use the new prefix.

### Path Construction Helpers

Create consistent helpers in each service:

```typescript
// WorkGraphService helpers
protected getGraphsDir(ctx: WorkspaceContext): string {
  return this.pathResolver.join(ctx.worktreePath, '.chainglass/data/work-graphs');
}

protected getGraphPath(ctx: WorkspaceContext, slug: string): string {
  return this.pathResolver.join(this.getGraphsDir(ctx), slug);
}

// WorkNodeService helpers (extends WorkGraphService pattern)
protected getNodePath(ctx: WorkspaceContext, graphSlug: string, nodeId: string): string {
  return this.pathResolver.join(this.getGraphPath(ctx, graphSlug), 'nodes', nodeId);
}

protected getNodeDataDir(ctx: WorkspaceContext, graphSlug: string, nodeId: string): string {
  return this.pathResolver.join(this.getNodePath(ctx, graphSlug, nodeId), 'data');
}

protected getNodeOutputDir(ctx: WorkspaceContext, graphSlug: string, nodeId: string): string {
  return this.pathResolver.join(this.getNodeDataDir(ctx, graphSlug, nodeId), 'outputs');
}

// WorkUnitService helpers
protected getUnitsDir(ctx: WorkspaceContext): string {
  return this.pathResolver.join(ctx.worktreePath, '.chainglass/data/units');
}

protected getUnitPath(ctx: WorkspaceContext, slug: string): string {
  return this.pathResolver.join(this.getUnitsDir(ctx), slug);
}
```

**Constants for Worktree-Relative Paths** (for storage in data.json):

```typescript
// Constants for path construction (no worktreePath prefix)
const GRAPHS_DIR = '.chainglass/data/work-graphs';
const UNITS_DIR = '.chainglass/data/units';

// Used when storing paths in data files
function getRelativeOutputPath(graphSlug: string, nodeId: string, filename: string): string {
  return `${GRAPHS_DIR}/${graphSlug}/nodes/${nodeId}/data/outputs/${filename}`;
}
```

---

## Decision 5: Base Class vs Similar Pattern

### Question

Should WorkGraph services extend `WorkspaceDataAdapterBase` or just follow similar patterns?

### Analysis

**WorkspaceDataAdapterBase** is designed for:
- Flat JSON storage (`<domain>/<slug>.json`)
- Single file per entity
- Standard CRUD operations

**WorkGraph storage structure** is:
```
.chainglass/data/work-graphs/<slug>/
├── work-graph.yaml          # Definition (YAML)
├── state.json               # Execution state (JSON)
└── nodes/
    └── <node-id>/
        ├── node.yaml        # Node definition (YAML)
        └── data/
            ├── data.json    # I/O data (JSON)
            └── outputs/     # Output files
                └── script.sh
```

**Key Differences**:
| Aspect | WorkspaceDataAdapterBase | WorkGraph |
|--------|--------------------------|-----------|
| Entity structure | Flat file | Directory with nested files |
| File format | JSON | YAML + JSON + arbitrary files |
| File naming | `<slug>.json` | `work-graph.yaml`, `node.yaml`, etc. |
| Subdirectories | None | `nodes/<id>/data/outputs/` |

### DECISION: Do NOT Extend - Follow Similar Pattern

**Rationale**:
1. **Structure Mismatch**: WorkGraph is directory-based, not file-based
2. **Multi-Format**: Uses both YAML and JSON (base class is JSON-only)
3. **Complexity**: Nested structure (nodes → data → outputs) doesn't fit flat model
4. **YAGNI**: Creating a `WorkGraphDataAdapterBase` adds abstraction without clear benefit

**Pattern to Follow**:

```typescript
// WorkGraphService follows SIMILAR patterns without extending

export class WorkGraphService implements IWorkGraphService {
  // NO: private readonly graphsDir = '.chainglass/work-graphs';
  // YES: Compute from context

  constructor(
    protected readonly fs: IFileSystem,
    protected readonly pathResolver: IPathResolver,
    protected readonly yamlParser: IYamlParser,
    protected readonly workUnitService?: IWorkUnitService
  ) {}

  // Path helpers (similar to base class, but not inherited)
  protected getGraphsDir(ctx: WorkspaceContext): string {
    return this.pathResolver.join(ctx.worktreePath, '.chainglass/data/work-graphs');
  }

  protected getGraphPath(ctx: WorkspaceContext, slug: string): string {
    return this.pathResolver.join(this.getGraphsDir(ctx), slug);
  }

  // Methods take ctx as first parameter (like SampleAdapter)
  async create(ctx: WorkspaceContext, slug: string): Promise<GraphCreateResult> {
    const graphPath = this.getGraphPath(ctx, slug);
    // ...
  }
}
```

---

## Complete Migration Pattern

### Service Layer Changes

```typescript
// BEFORE: WorkGraphService
export class WorkGraphService implements IWorkGraphService {
  private readonly graphsDir = '.chainglass/work-graphs';

  constructor(
    private readonly fs: IFileSystem,
    private readonly pathResolver: IPathResolver,
    private readonly yamlParser: IYamlParser,
    private readonly workUnitService?: IWorkUnitService
  ) {}

  async create(slug: string): Promise<GraphCreateResult> {
    const graphPath = this.pathResolver.join(this.graphsDir, slug);
    // ...
  }
}

// AFTER: WorkGraphService
export class WorkGraphService implements IWorkGraphService {
  constructor(
    protected readonly fs: IFileSystem,
    protected readonly pathResolver: IPathResolver,
    protected readonly yamlParser: IYamlParser,
    protected readonly workUnitService?: IWorkUnitService
  ) {}

  // Path helpers
  protected getGraphsDir(ctx: WorkspaceContext): string {
    return this.pathResolver.join(ctx.worktreePath, '.chainglass/data/work-graphs');
  }

  protected getGraphPath(ctx: WorkspaceContext, slug: string): string {
    return this.pathResolver.join(this.getGraphsDir(ctx), slug);
  }

  // Methods take ctx as first parameter
  async create(ctx: WorkspaceContext, slug: string): Promise<GraphCreateResult> {
    const graphPath = this.getGraphPath(ctx, slug);
    // ...
  }
}
```

### Interface Changes

```typescript
// BEFORE: IWorkGraphService
export interface IWorkGraphService {
  create(slug: string): Promise<GraphCreateResult>;
  load(slug: string): Promise<GraphLoadResult>;
  show(slug: string): Promise<GraphShowResult>;
  status(slug: string): Promise<GraphStatusResult>;
  addNodeAfter(slug: string, options: AddNodeOptions): Promise<AddNodeResult>;
  removeNode(slug: string, options: RemoveNodeOptions): Promise<RemoveNodeResult>;
}

// AFTER: IWorkGraphService
export interface IWorkGraphService {
  create(ctx: WorkspaceContext, slug: string): Promise<GraphCreateResult>;
  load(ctx: WorkspaceContext, slug: string): Promise<GraphLoadResult>;
  show(ctx: WorkspaceContext, slug: string): Promise<GraphShowResult>;
  status(ctx: WorkspaceContext, slug: string): Promise<GraphStatusResult>;
  addNodeAfter(ctx: WorkspaceContext, slug: string, options: AddNodeOptions): Promise<AddNodeResult>;
  removeNode(ctx: WorkspaceContext, slug: string, options: RemoveNodeOptions): Promise<RemoveNodeResult>;
}
```

### CLI Command Changes

```typescript
// BEFORE: wg create command
async function handleCreate(slug: string, options: CreateOptions): Promise<void> {
  const service = getWorkGraphService();
  const result = await service.create(slug);
}

// AFTER: wg create command (following sample.command.ts pattern)
async function handleCreate(slug: string, options: CreateOptions): Promise<void> {
  // 1. Resolve workspace context (matches sample.command.ts pattern)
  const ctx = await resolveOrOverrideContext(options.workspacePath);
  
  if (!ctx) {
    printError({
      code: 'E074',
      message: 'No workspace context found',
      action: options.workspacePath
        ? `Path '${options.workspacePath}' is not inside a registered workspace`
        : 'Current directory is not inside a registered workspace. Run: cg workspace list',
    });
    process.exit(1);
  }

  // 2. Service receives guaranteed context
  const service = getWorkGraphService();
  const result = await service.create(ctx, slug);
}
```

### Fake Service Changes

```typescript
// BEFORE: FakeWorkGraphService
export class FakeWorkGraphService implements IWorkGraphService {
  private graphs = new Map<string, WorkGraphDefinition>();

  async create(slug: string): Promise<GraphCreateResult> {
    this.graphs.set(slug, { slug, nodes: ['start'], edges: [] });
    return { graphSlug: slug, path: `.chainglass/work-graphs/${slug}`, errors: [] };
  }
}

// AFTER: FakeWorkGraphService with composite keys
export class FakeWorkGraphService implements IWorkGraphService {
  // Composite key: worktreePath|slug
  private graphs = new Map<string, WorkGraphDefinition>();
  private calls: Array<{ method: string; ctx: WorkspaceContext; args: unknown[] }> = [];

  // Helper for composite keys
  private getKey(ctx: WorkspaceContext, slug: string): string {
    return `${ctx.worktreePath}|${slug}`;
  }

  async create(ctx: WorkspaceContext, slug: string): Promise<GraphCreateResult> {
    this.calls.push({ method: 'create', ctx, args: [slug] });
    
    const key = this.getKey(ctx, slug);
    this.graphs.set(key, { slug, nodes: ['start'], edges: [] });
    
    return {
      graphSlug: slug,
      path: `${ctx.worktreePath}/.chainglass/data/work-graphs/${slug}`,
      errors: [],
    };
  }

  // Test inspection API
  getCalls(): Array<{ method: string; ctx: WorkspaceContext; args: unknown[] }> {
    return this.calls;
  }

  reset(): void {
    this.graphs.clear();
    this.calls.length = 0;
  }
}
```

---

## File Structure After Migration

```
<worktreePath>/
└── .chainglass/
    └── data/                           # All per-worktree data (Plan 014 standard)
        ├── samples/                    # Sample domain (exemplar)
        │   └── <slug>.json
        ├── units/                      # WorkUnits (migrated)
        │   └── <slug>/
        │       ├── unit.yaml
        │       └── commands/
        └── work-graphs/                # WorkGraphs (migrated)
            └── <slug>/
                ├── work-graph.yaml
                ├── state.json
                └── nodes/
                    └── <node-id>/
                        ├── node.yaml
                        └── data/
                            ├── data.json
                            └── outputs/
```

---

## Data.json Path Reference Example

**Before Migration**:
```json
{
  "status": "complete",
  "outputs": {
    "script": ".chainglass/work-graphs/sample-e2e/nodes/sample-coder-xxx/data/outputs/script.sh"
  }
}
```

**After Migration**:
```json
{
  "status": "complete",
  "outputs": {
    "script": ".chainglass/data/work-graphs/sample-e2e/nodes/sample-coder-xxx/data/outputs/script.sh"
  }
}
```

**Resolution in Agent/CLI**:
```typescript
// Agent receives ctx from CLI or environment
const ctx = await resolveWorkspaceContext(cwd);

// Read data.json
const dataJson = await readNodeData(ctx, graphSlug, nodeId);

// Resolve relative path to absolute
const scriptRelativePath = dataJson.outputs.script;
const scriptAbsolutePath = pathResolver.join(ctx.worktreePath, scriptRelativePath);
// → /home/user/project/.chainglass/data/work-graphs/sample-e2e/nodes/sample-coder-xxx/data/outputs/script.sh
```

---

## Validation Criteria

After migration, verify:

### Path Construction
- [ ] `WorkGraphService.getGraphsDir(ctx)` returns `<worktreePath>/.chainglass/data/work-graphs`
- [ ] `WorkUnitService.getUnitsDir(ctx)` returns `<worktreePath>/.chainglass/data/units`
- [ ] All hardcoded `.chainglass/work-graphs` references removed
- [ ] All hardcoded `.chainglass/units` references removed

### Context Flow
- [ ] CLI resolves context before calling services
- [ ] Services receive non-null `WorkspaceContext` parameter
- [ ] Fakes use composite keys `worktreePath|slug`
- [ ] Tests pass context to all service method calls

### Stored Paths
- [ ] data.json paths use `.chainglass/data/work-graphs/...` prefix
- [ ] Paths are worktree-relative (no absolute paths in stored data)
- [ ] E2E validation script confirms path format

### E2E Test
```bash
# Run validation
npx tsx docs/how/dev/workgraph-run/e2e-sample-flow.ts

# Verify:
# 1. Files in .chainglass/data/work-graphs/ (new location)
# 2. NO files in .chainglass/work-graphs/ (old location)
# 3. data.json contains .chainglass/data/work-graphs/... paths
```

---

## Summary of Decisions

| Question | Decision | Pattern |
|----------|----------|---------|
| Constructor vs Method Param | **Method Parameter** | `ctx: WorkspaceContext` as first parameter |
| Fallback Behavior | **CLI Handles** | Services receive non-null ctx, CLI exits on missing context |
| Relative vs Absolute Paths | **Worktree-Relative** | `.chainglass/data/work-graphs/...` in stored data |
| File Path References | **Updated Prefix** | Same relative pattern, new `.chainglass/data/` prefix |
| Base Class Extension | **No Extension** | Follow similar patterns without inheritance |

---

## Implementation Checklist

### Phase 1: Type Foundation
- [ ] Import `WorkspaceContext` from `@chainglass/workflow` (or define minimal interface if circular dep)
- [ ] Update `IWorkGraphService` interface with ctx parameter
- [ ] Update `IWorkNodeService` interface with ctx parameter
- [ ] Update `IWorkUnitService` interface with ctx parameter

### Phase 2: Service Layer
- [ ] Remove hardcoded `graphsDir` from `WorkGraphService`
- [ ] Add path helper methods (`getGraphsDir`, `getGraphPath`)
- [ ] Update all methods to take `ctx` as first parameter
- [ ] Repeat for `WorkNodeService`, `WorkUnitService`, `BootstrapPromptService`

### Phase 3: Fake Services
- [ ] Update `FakeWorkGraphService` with composite keys
- [ ] Add call recording: `getCalls()`, `reset()`
- [ ] Repeat for `FakeWorkNodeService`, `FakeWorkUnitService`

### Phase 4: CLI Integration
- [ ] Add `resolveOrOverrideContext()` to wg commands
- [ ] Add `--workspace-path` option to all wg commands
- [ ] Handle missing context at CLI layer

### Phase 5: Tests
- [ ] Update all tests to pass `WorkspaceContext`
- [ ] Add workspace isolation tests
- [ ] Run contract tests with both fakes and real services

### Phase 6: E2E Validation
- [ ] Update `e2e-sample-flow.ts` for new paths
- [ ] Run validation script
- [ ] Confirm no files in legacy locations

---

## Open Questions

### Q1: Should we create a shared `WorkgraphPaths` utility?

**Status**: OPEN

Currently, path helpers would be duplicated across services. Consider:

```typescript
// packages/workgraph/src/utils/workgraph-paths.ts
export const WorkgraphPaths = {
  GRAPHS_DIR: '.chainglass/data/work-graphs',
  UNITS_DIR: '.chainglass/data/units',
  
  getGraphsDir(ctx: WorkspaceContext, pr: IPathResolver): string {
    return pr.join(ctx.worktreePath, this.GRAPHS_DIR);
  },
  
  getGraphPath(ctx: WorkspaceContext, pr: IPathResolver, slug: string): string {
    return pr.join(this.getGraphsDir(ctx, pr), slug);
  },
  // ...
};
```

**Recommendation**: Defer to implementation phase. Start with methods in each service; extract if duplication becomes problematic.

### Q2: E2E harness location awareness

**Status**: RESOLVED

The E2E harness runs in the repo root. After migration:
- It must resolve workspace context from CWD
- Files should appear in `.chainglass/data/work-graphs/` relative to CWD
- Current directory should be a registered workspace (or add registration step)

---

## Changelog

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2026-01-28 | Claude | Initial workshop document |
