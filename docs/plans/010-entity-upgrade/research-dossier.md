# Research Dossier: Entity Architecture & kubectl-Style CLI for Workflow Management

**Generated**: 2026-01-26T10:15:00Z
**Research Query**: "Entity modeling for workflows, runs, phases - are they solid entities with factories? kubectl-style CLI patterns. Runs listing capability. Web integration."
**Mode**: Pre-Plan Research
**FlowSpace**: Available
**Findings**: 82 total (IA-10, DC-10, PS-10, IC-10, QT-10, DE-10, PL-20)

---

## Executive Summary

### What Exists
Your concern is validated: **Workflows, Runs, and Phases are diffuse concepts expressed entirely through services**. There are no entity classes that can be instantiated from a folder path. The "identity" of each concept is a filesystem path plus scattered JSON files.

### Business Impact
This works for CLI-only usage but creates friction for:
1. **Web integration** - No single object to serialize for API responses
2. **State inspection** - Must call multiple services to understand "a run"
3. **Testing** - Services are tested, but no entity invariants to verify
4. **Discoverability** - `cg runs list` is impossible without an entity that knows how to find itself

### Key Recommendations
1. **Create Entity Classes** with static factory methods (`Workflow.fromPath()`, `WorkflowRun.fromPath()`)
2. **Add `cg runs list` command** following kubectl patterns
3. **Adopt kubectl conventions** for hierarchical CLI structure
4. **Entity-first for web** - entities become the serialization boundary for API responses

---

## How It Currently Works

### Entry Points

| Entry Point | Type | Location | Purpose |
|------------|------|----------|---------|
| `IWorkflowRegistry` | Service Interface | `packages/workflow/src/interfaces/workflow-registry.interface.ts` | Template management |
| `IWorkflowService` | Service Interface | `packages/workflow/src/interfaces/workflow-service.interface.ts` | Run composition |
| `IPhaseService` | Service Interface | `packages/workflow/src/interfaces/phase-service.interface.ts` | Phase lifecycle |

### Core Execution Flow

1. **Template Discovery**: `IWorkflowRegistry.list()` scans `.chainglass/workflows/` filesystem
2. **Run Creation**: `IWorkflowService.compose()` creates folder structure at `.chainglass/runs/<slug>/<version>/run-YYYY-MM-DD-NNN/`
3. **Phase Execution**: `IPhaseService.prepare/validate/finalize()` reads/writes JSON files in phase folders
4. **State Storage**: `wf-status.json` tracks run state, `wf-phase.json` tracks phase state

### Data Flow
```
Filesystem → Service.method() → Result DTO → Console/JSON Output
     ↑                                              |
     └──────── State written back ─────────────────┘
```

### State Management

- **No in-memory entities** - State is always read from filesystem, modified, written back
- **Dual state files** - `wf-status.json` (run-level) and `wf-phase.json` (phase-level) per DYK insights
- **Path-as-identity** - The folder path IS the "primary key"

---

## The Problem: Diffuse Concepts

### Current Representation

| Concept | Current Model | Why It's Diffuse |
|---------|---------------|-----------------|
| **Workflow** | `WfDefinition` (DTO interface) | Loaded from `wf.yaml`, no factory, no methods |
| **WorkflowRun** | `WfStatus` (DTO interface) + folder path | No class, no hydration from path |
| **Phase** | String name + service calls | Not even a DTO - just two strings (name, runDir) |
| **Checkpoint** | Folder naming convention (`v001-hash`) | Versioning via naming, no version entity |

### Code Evidence

```typescript
// NO: There is no way to do this today
const workflow = Workflow.fromPath('.chainglass/workflows/hello-wf');
const run = WorkflowRun.load('.chainglass/runs/hello-wf/v001/run-2026-01-25-001');
const phase = run.getPhase('gather');

// YES: Current approach - services with path strings
const registry = container.resolve<IWorkflowRegistry>(...);
const result = await registry.info('.chainglass/workflows', 'hello-wf');
if (result.errors.length === 0) {
  const workflowDTO = result.workflow;  // Just data, no methods
}
```

### Implications

1. **No run listing**: Services don't know how to discover runs - only create them
2. **No entity lifecycle**: Objects are ephemeral between service calls
3. **No behavioral encapsulation**: All behavior lives in services
4. **Web friction**: Must map DTOs to API responses manually for every endpoint

---

## Detailed Research Findings

### IA: Implementation Archaeology (Entity Patterns)

#### IA-01: Core Workflow Entity Representation
**Node ID**: `type:packages/workflow/src/types/wf.types.ts:WfDefinition`

The `Workflow` concept is represented by a TypeScript interface (`WfDefinition`) that mirrors `wf.schema.json`, not a class instance.

```typescript
export interface WfDefinition {
  name: string;                                    // Workflow slug
  version: string;                                 // Semantic version
  description?: string;
  phases: Record<string, PhaseDefinition>;         // Phase defs by name
}
```

**Analysis**: This is a data transfer object (DTO) shape, not an entity that can be instantiated. There is no:
- Constructor or factory method
- Hydration logic from folder paths
- State management or identity
- Entity methods (save, delete, etc.)

#### IA-02: WorkflowRun State Tracking
**Node ID**: `type:packages/workflow/src/types/wf-status.types.ts:WfStatus`

The `WorkflowRun` concept is represented by the `WfStatus` interface (stored in `wf-run/wf-status.json`).

```typescript
export interface WfStatus {
  workflow: WfStatusWorkflow;                      // Metadata about template
  run: WfStatusRun {                               // Metadata about this run
    id: string;
    created_at: string;
    status: RunStatus;                             // pending|active|complete|failed
  };
  phases: Record<string, WfStatusPhase>;           // Per-phase status
}
```

**Analysis**:
- **No entity class.** WfStatus is a DTO that mirrors `wf-status.schema.json`
- **No factory.** Services load it from filesystem via `fs.readFile()` and `JSON.parse()`
- **State is implicit.** The only "identity" is the run ID (`id`) and path, not an object reference

#### IA-03: Phase as Service-Mediated Concept
**Node ID**: `type:packages/workflow/src/interfaces/phase-service.interface.ts:IPhaseService`

`Phase` is not an entity at all—it's an orchestration concept expressed entirely through the `IPhaseService` interface.

```typescript
interface IPhaseService {
  prepare(phase: string, runDir: string): Promise<PrepareResult>;
  validate(phase: string, runDir: string, check: ValidateCheckMode): Promise<ValidateResult>;
  finalize(phase: string, runDir: string): Promise<FinalizeResult>;
  accept(phase: string, runDir: string, options?: AcceptOptions): Promise<AcceptResult>;
  preflight(phase: string, runDir: string, options?: PreflightOptions): Promise<PreflightResult>;
  handover(phase: string, runDir: string, options?: HandoverOptions): Promise<HandoverResult>;
}
```

**Analysis**:
- **Completely service-driven.** Phase identity is just two strings: `phase` name and `runDir` path
- **No persistence layer.** Phase state is implicitly stored in multiple JSON files
- **Operations are stateless.** Each service method is idempotent

#### IA-04: No Entity Hydration from Paths

The codebase provides **no methods to load Workflow, WorkflowRun, or Phase entities from a folder path.**

**Attempted searches**:
- Grep for `fromPath`, `load`, `hydrate`, `fromDirectory` → **No matches**
- Pattern: Services always take path strings as input
- Services always use `IFileSystem.readFile()` and `JSON.parse()` inline

#### IA-05: DI Container Uses Service Factories, Not Entity Factories

The DI container registers **service factories** using `tsyringe`'s `useFactory` pattern, not entity builders.

```typescript
export function createWorkflowProductionContainer(): DependencyContainer {
  const childContainer = container.createChildContainer();

  childContainer.register<IWorkflowRegistry>(WORKFLOW_DI_TOKENS.WORKFLOW_REGISTRY, {
    useFactory: (c) =>
      new WorkflowRegistryService(
        c.resolve<IFileSystem>(SHARED_DI_TOKENS.FILESYSTEM),
        c.resolve<IPathResolver>(SHARED_DI_TOKENS.PATH_RESOLVER),
        c.resolve<IYamlParser>(WORKFLOW_DI_TOKENS.YAML_PARSER),
        c.resolve<IHashGenerator>(WORKFLOW_DI_TOKENS.HASH_GENERATOR)
      ),
  });
}
```

---

### DC: Dependency & Service Architecture

#### DC-01: Three Distinct Service Layers

The architecture implements three **separate, composable services**:

1. **IWorkflowService** - Workflow composition (creates runs from templates)
2. **IWorkflowRegistry** - Workflow template management (list, info, checkpoint, restore, versions)
3. **IPhaseService** - Phase lifecycle operations (prepare, validate, finalize, accept, preflight, handover)

#### DC-02: Services Access Data via DI Adapters

No service directly accesses filesystem, YAML parsing, or schema validation:

- **IFileSystem** - Node adapter: `NodeFileSystemAdapter`
- **IYamlParser** - YAML adapter: `YamlParserAdapter`
- **ISchemaValidator** - AJV adapter: `SchemaValidatorAdapter`
- **IPathResolver** - Path security adapter: `PathResolverAdapter`
- **IHashGenerator** - SHA256 adapter: `HashGeneratorAdapter`

#### DC-03: Business Logic in Services, Domain Objects as DTOs

**All business logic lives in services.** Domain objects are lightweight data structures:

- **Domain DTOs**: `ComposeResult`, `PrepareResult`, `ValidateResult`, `CheckpointResult`
- **Immutable Config Objects**: `PhaseDefinition`, `WfDefinition`, `WfStatus`
- **No domain logic** - no methods, just properties

#### DC-04: Methods for Listing, Loading, and Manipulating

**Listing Operations:**
- `IWorkflowRegistry.list(workflowsDir)` → `ListResult` with `workflows[]`
- `IWorkflowRegistry.versions(workflowsDir, slug)` → `VersionsResult` with `versions[]`
- **MISSING**: No method to list runs

**Info/Loading Operations:**
- `IWorkflowRegistry.info(workflowsDir, slug)` → `InfoResult`
- `IWorkflowService.compose(template, runsDir, options)` → `ComposeResult`

**Manipulation Operations:**
- `IWorkflowRegistry.checkpoint()`, `restore()`
- `IPhaseService.finalize()`, `accept()`, `handover()`

---

### PS: CLI Command Structure Analysis

#### PS-01: Current Workflow CLI Architecture

```
cg workflow <subcommand> [args] [options]
```

Current subcommands:
- `cg workflow list [--json]`
- `cg workflow info <slug> [--json]`
- `cg workflow checkpoint <slug> [--json] [-c, --comment] [-f, --force]`
- `cg workflow restore <slug> <version> [--json] [-f, --force]`
- `cg workflow versions <slug> [--json]`
- `cg workflow compose <slug> [--json] [--runs-dir] [--checkpoint]`

#### PS-05: Run Listing Command - CRITICAL GAP

**Currently: MISSING**

There is NO command to list or query workflow runs. The compose command creates runs, but users cannot:
- List all runs
- List runs for a specific workflow
- Filter runs by version
- Inspect run metadata

**From specification** (manage-workflows-spec.md):
```
AC-08: Given runs exist under `.chainglass/runs/wf-slug/version/`, when I run
`cg run list --workflow hello-wf`, then I see all runs for that workflow grouped by version.
```

This is a **DEFERRED acceptance criterion** - not yet implemented.

#### PS-07: Output Format Support

**Supported Formats**:
1. **Console (default)**: Human-readable text
2. **JSON (--json flag)**: CommandResponse envelope

**Missing vs kubectl**:
- No `-o yaml`
- No `-o wide`
- No `-o name`
- No custom columns

---

### IC: kubectl Pattern Recommendations

#### IC-02: The `get` Pattern

```bash
# kubectl
kubectl get pods              # List all
kubectl get pod my-pod        # Get single

# Proposed cg
cg workflow list              # List all
cg workflow get my-wf         # Get single (alias for info)
cg runs list                  # List all runs
cg runs get run-2026-01-25    # Get single run
```

#### IC-03: The `describe` Pattern

```bash
# kubectl
kubectl describe pod my-pod   # Rich multi-section detail

# Proposed cg
cg workflow get my-wf --describe
# OR: cg workflow describe my-wf

# Output includes:
# - Checkpoint history
# - Phase definitions
# - Recent runs
# - Health status
```

#### IC-04: Context Switching

```bash
# Set run context (persists)
cg config set run-dir .chainglass/runs/hello-wf/v001/run-2026-01-25-001

# View current context
cg config current-run

# Override per-command
cg phase get gather --run-dir /other/path

# Auto-detect from CWD
cd .chainglass/runs/hello-wf/v001/run-2026-01-25-001
cg phase list  # Uses CWD
```

#### IC-05: Output Format Patterns

```bash
cg runs list                  # Default table
cg runs list -o json          # Full JSON
cg runs list -o yaml          # YAML output
cg runs list -o wide          # Extended columns
cg runs list -o name          # Just names (scripting)
```

#### IC-06: Filtering

```bash
cg runs list --workflow my-wf           # By workflow
cg runs list --status active            # By status
cg runs list --since 7d                 # By date
cg runs list --workflow my-wf --status failed --since 7d  # Combined
```

---

### QT: Schema & Data Model Analysis

#### QT-01: wf-status.json Schema

**Location**: `packages/workflow/schemas/wf-status.schema.json`

**Top-Level Requirements**:
- `workflow` - Workflow template metadata
- `run` - Run execution metadata
- `phases` - Phase status tracking

#### QT-02: Run State Fields

```json
{
  "id": "string",
  "created_at": "date-time",
  "status": "pending|active|complete|failed"
}
```

#### QT-03: Phase State Fields

```typescript
interface WfStatusPhase {
  order: number;
  status: PhaseRunStatus;  // pending|ready|active|blocked|accepted|complete|failed
  started_at?: string;
  completed_at?: string;
}
```

#### QT-08: Entity Property Mapping - WorkflowRun

```typescript
// Proposed entity properties
runId: string;                    // wf-status.json > run.id
workflowSlug: string;             // wf-status.json > workflow.slug
workflowVersion: string;          // wf-status.json > workflow.version
checkpointHash: string;           // wf-status.json > workflow.version_hash
createdAt: DateTime;              // wf-status.json > run.created_at
runStatus: RunStatus;             // wf-status.json > run.status
phaseStatuses: Map<string, PhaseRunStatus>;
completedPhaseCount: number;      // Derived
progressPercent: number;          // Derived
```

---

### DE: Web Integration Analysis

#### DE-01: Existing API Infrastructure

**Status**: Partially established at `/apps/web/app/api/`

- **SSE Endpoint**: `/api/events/[channel]` provides real-time streaming
- **Health Check**: `/api/health` endpoint
- **Gap**: No REST endpoints for workflow CRUD

#### DE-04: Service Injection Pattern

```typescript
export function createProductionContainer(config?: IConfigService): DependencyContainer {
  const childContainer = container.createChildContainer();

  childContainer.register<ILogger>(DI_TOKENS.LOGGER, {
    useFactory: () => new PinoLoggerAdapter(),
  });
}
```

**Critical**: Web uses **decorator-free TSyringe pattern** because decorators may not survive React Server Component compilation.

#### DE-09: Error-to-HTTP Mapping

| Error Code | HTTP Status | Meaning |
|------------|-------------|---------|
| E030 | 404 | WORKFLOW_NOT_FOUND |
| E033 | 404 | VERSION_NOT_FOUND |
| E034 | 400 | NO_CHECKPOINT |
| E035 | 409 | DUPLICATE_CONTENT |
| E036 | 400 | INVALID_TEMPLATE |

---

## Proposed Entity Architecture

### Core Insight: Entity Adapters

The key refactor is introducing **entity adapters** that sit between filesystem and services:

```
Current:  Filesystem → Services → DTOs → Consumer assembles "entity" mentally
Proposed: Filesystem → EntityAdapter → Entity → Services use Entity
```

### Entity Adapter Interface

```typescript
// packages/workflow/src/adapters/entity-adapter.interface.ts
export interface IEntityAdapter<T, TPath = string> {
  /**
   * Hydrate entity from filesystem path
   */
  fromPath(path: TPath): Promise<T>;

  /**
   * Check if entity exists at path
   */
  exists(path: TPath): Promise<boolean>;
}

// Specialized adapters
export interface IWorkflowAdapter extends IEntityAdapter<Workflow, { workflowsDir: string; slug: string }> {
  list(workflowsDir: string): Promise<Workflow[]>;
}

export interface IRunAdapter extends IEntityAdapter<WorkflowRun, string> {
  list(runsDir: string, filter?: RunFilter): Promise<WorkflowRun[]>;
}

export interface IPhaseAdapter extends IEntityAdapter<Phase, { runDir: string; phaseName: string }> {
  listForRun(runDir: string): Promise<Phase[]>;
}
```

### Entity Classes (Graph-Navigable, Lazy-Loading)

```typescript
// packages/workflow/src/entities/Workflow.ts
export class Workflow {
  private _checkpoints?: Checkpoint[];
  private _runs?: Run[];

  constructor(
    readonly slug: string,
    readonly name: string,
    readonly version: string,
    readonly description: string | undefined,
    readonly phaseDefinitions: ReadonlyMap<string, PhaseDefinition>,
    readonly workflowDir: string,
    private readonly checkpointAdapter: ICheckpointAdapter,
    private readonly runAdapter: IRunAdapter
  ) {}

  // ===== Computed Properties =====
  get phaseCount(): number {
    return this.phaseDefinitions.size;
  }

  // ===== Child Navigation (lazy) =====
  async checkpoints(): Promise<Checkpoint[]> {
    if (!this._checkpoints) {
      this._checkpoints = await this.checkpointAdapter.list(this.workflowDir);
      // Inject parent reference
      this._checkpoints.forEach(c => c._setWorkflow(this));
    }
    return this._checkpoints;
  }

  async latestCheckpoint(): Promise<Checkpoint | undefined> {
    const all = await this.checkpoints();
    return all[0];
  }

  async hasCheckpoints(): Promise<boolean> {
    return (await this.checkpoints()).length > 0;
  }

  async runs(): Promise<Run[]> {
    if (!this._runs) {
      this._runs = await this.runAdapter.list({ workflow: this.slug });
      this._runs.forEach(r => r._setWorkflow(this));
    }
    return this._runs;
  }

  // ===== Cache Control =====
  invalidateCache(): void {
    this._checkpoints = undefined;
    this._runs = undefined;
  }

  // ===== Serialization =====
  toJSON(): object {
    return {
      slug: this.slug,
      name: this.name,
      version: this.version,
      description: this.description,
      phaseCount: this.phaseCount,
      workflowDir: this.workflowDir,
    };
  }
}

// packages/workflow/src/entities/Checkpoint.ts
export class Checkpoint {
  private _workflow?: Workflow;
  private _runs?: Run[];

  constructor(
    readonly version: string,        // e.g., 'v001-abc12345'
    readonly hash: string,           // e.g., 'abc12345'
    readonly ordinal: number,        // e.g., 1
    readonly comment: string | undefined,
    readonly createdAt: Date,
    readonly checkpointDir: string,
    private readonly runAdapter: IRunAdapter,
    private readonly workflowAdapter: IWorkflowAdapter
  ) {}

  // ===== Parent Navigation =====
  async workflow(): Promise<Workflow> {
    if (!this._workflow) {
      const slug = this.deriveWorkflowSlug();
      this._workflow = await this.workflowAdapter.fromSlug(slug);
    }
    return this._workflow;
  }

  _setWorkflow(wf: Workflow): void {
    this._workflow = wf;
  }

  // ===== Child Navigation (lazy) =====
  async runs(): Promise<Run[]> {
    if (!this._runs) {
      this._runs = await this.runAdapter.list({
        workflow: this.deriveWorkflowSlug(),
        version: this.version
      });
      this._runs.forEach(r => r._setCheckpoint(this));
    }
    return this._runs;
  }

  // ===== Path Derivation =====
  private deriveWorkflowSlug(): string {
    // checkpointDir = .chainglass/workflows/hello-wf/checkpoints/v001-abc123
    return path.basename(path.dirname(path.dirname(this.checkpointDir)));
  }

  toJSON(): object {
    return {
      version: this.version,
      hash: this.hash,
      ordinal: this.ordinal,
      comment: this.comment,
      createdAt: this.createdAt.toISOString(),
    };
  }
}
```

```typescript
// packages/workflow/src/entities/Run.ts
export class Run {
  private _workflow?: Workflow;
  private _checkpoint?: Checkpoint;
  private _phases?: Phase[];

  constructor(
    readonly runId: string,
    readonly status: RunStatus,
    readonly createdAt: Date,
    readonly runDir: string,
    readonly checkpointVersion: string,  // e.g., 'v001-abc12345'
    private readonly workflowAdapter: IWorkflowAdapter,
    private readonly checkpointAdapter: ICheckpointAdapter,
    private readonly phaseAdapter: IPhaseAdapter
  ) {}

  // ===== Path-Derived Properties =====
  get workflowSlug(): string {
    // runDir = .chainglass/runs/hello-wf/v001-abc123/run-2026-01-25-001
    return path.basename(path.dirname(path.dirname(this.runDir)));
  }

  // ===== Parent Navigation (lazy, path-derived) =====
  async workflow(): Promise<Workflow> {
    if (!this._workflow) {
      this._workflow = await this.workflowAdapter.fromSlug(this.workflowSlug);
    }
    return this._workflow;
  }

  async checkpoint(): Promise<Checkpoint> {
    if (!this._checkpoint) {
      const wf = await this.workflow();
      const checkpoints = await wf.checkpoints();
      this._checkpoint = checkpoints.find(c => c.version === this.checkpointVersion);
    }
    return this._checkpoint!;
  }

  _setWorkflow(wf: Workflow): void { this._workflow = wf; }
  _setCheckpoint(cp: Checkpoint): void { this._checkpoint = cp; }

  // ===== Child Navigation (lazy) =====
  async phases(): Promise<Phase[]> {
    if (!this._phases) {
      this._phases = await this.phaseAdapter.listForRun(this.runDir);
      this._phases.forEach(p => p._setRun(this));
    }
    return this._phases;
  }

  async getPhase(name: string): Promise<Phase | undefined> {
    const all = await this.phases();
    return all.find(p => p.name === name);
  }

  // ===== Computed Properties =====
  get isComplete(): boolean { return this.status === 'complete'; }
  get isFailed(): boolean { return this.status === 'failed'; }
  get isActive(): boolean { return this.status === 'active'; }

  async currentPhase(): Promise<Phase | undefined> {
    const all = await this.phases();
    return all.find(p => p.isActive);
  }

  async progress(): Promise<{ completed: number; total: number; percent: number }> {
    const all = await this.phases();
    const total = all.length;
    const completed = all.filter(p => p.isComplete).length;
    return { total, completed, percent: Math.round((completed / total) * 100) };
  }

  // ===== Serialization =====
  toJSON(): object {
    return {
      runId: this.runId,
      workflowSlug: this.workflowSlug,
      checkpointVersion: this.checkpointVersion,
      status: this.status,
      createdAt: this.createdAt.toISOString(),
      runDir: this.runDir,
    };
  }

  // Include phases in full serialization
  async toFullJSON(): Promise<object> {
    const phases = await this.phases();
    const progress = await this.progress();
    return {
      ...this.toJSON(),
      progress,
      phases: phases.map(p => p.toJSON()),
    };
  }
}

// packages/workflow/src/entities/Phase.ts
export class Phase {
  private _run?: Run;

  constructor(
    readonly name: string,
    readonly order: number,
    readonly status: PhaseRunStatus,
    readonly description: string | undefined,
    readonly startedAt: Date | undefined,
    readonly completedAt: Date | undefined,
    readonly phaseDir: string,
    private readonly runAdapter: IRunAdapter
  ) {}

  // ===== Parent Navigation (lazy, path-derived) =====
  async run(): Promise<Run> {
    if (!this._run) {
      // phaseDir = .../run-2026-01-25-001/phases/gather
      const runDir = path.dirname(path.dirname(this.phaseDir));
      this._run = await this.runAdapter.fromPath(runDir);
    }
    return this._run;
  }

  // Shortcut: climb two levels
  async workflow(): Promise<Workflow> {
    return (await this.run()).workflow();
  }

  async checkpoint(): Promise<Checkpoint> {
    return (await this.run()).checkpoint();
  }

  _setRun(run: Run): void { this._run = run; }

  // ===== Status Helpers =====
  get isPending(): boolean { return this.status === 'pending'; }
  get isReady(): boolean { return this.status === 'ready'; }
  get isActive(): boolean { return this.status === 'active'; }
  get isBlocked(): boolean { return this.status === 'blocked'; }
  get isComplete(): boolean { return this.status === 'complete'; }
  get isFailed(): boolean { return this.status === 'failed'; }
  get isDone(): boolean { return this.isComplete || this.isFailed; }

  get duration(): number | undefined {
    if (this.startedAt && this.completedAt) {
      return this.completedAt.getTime() - this.startedAt.getTime();
    }
    return undefined;
  }

  // ===== Serialization =====
  toJSON(): object {
    return {
      name: this.name,
      order: this.order,
      status: this.status,
      description: this.description,
      startedAt: this.startedAt?.toISOString(),
      completedAt: this.completedAt?.toISOString(),
      duration: this.duration,
    };
  }
}
```

### Adapter Implementations

```typescript
// packages/workflow/src/adapters/workflow.adapter.ts
export class WorkflowAdapter implements IWorkflowAdapter {
  constructor(
    private readonly fs: IFileSystem,
    private readonly yamlParser: IYamlParser,
    private readonly pathResolver: IPathResolver
  ) {}

  async fromPath(args: { workflowsDir: string; slug: string }): Promise<Workflow> {
    const { workflowsDir, slug } = args;
    const workflowDir = this.pathResolver.join(workflowsDir, slug);

    // Read workflow.json for metadata
    const metadataPath = this.pathResolver.join(workflowDir, 'workflow.json');
    const metadata = JSON.parse(await this.fs.readFile(metadataPath));

    // Read current/wf.yaml for definition
    const wfYamlPath = this.pathResolver.join(workflowDir, 'current', 'wf.yaml');
    const wfDef = await this.yamlParser.parse(await this.fs.readFile(wfYamlPath));

    // Discover checkpoints
    const checkpointsDir = this.pathResolver.join(workflowDir, 'checkpoints');
    const checkpoints = await this.discoverCheckpoints(checkpointsDir);

    return new Workflow(
      slug,
      wfDef.name,
      wfDef.version,
      wfDef.description,
      new Map(Object.entries(wfDef.phases)),
      checkpoints,
      workflowDir
    );
  }

  async list(workflowsDir: string): Promise<Workflow[]> {
    const entries = await this.fs.listDirectories(workflowsDir);
    const workflows: Workflow[] = [];

    for (const entry of entries) {
      if (await this.exists({ workflowsDir, slug: entry })) {
        workflows.push(await this.fromPath({ workflowsDir, slug: entry }));
      }
    }

    return workflows;
  }

  async exists(args: { workflowsDir: string; slug: string }): Promise<boolean> {
    const metadataPath = this.pathResolver.join(args.workflowsDir, args.slug, 'workflow.json');
    return this.fs.exists(metadataPath);
  }
}

// packages/workflow/src/adapters/run.adapter.ts
export class RunAdapter implements IRunAdapter {
  constructor(
    private readonly fs: IFileSystem,
    private readonly pathResolver: IPathResolver,
    private readonly phaseAdapter: IPhaseAdapter
  ) {}

  async fromPath(runDir: string): Promise<WorkflowRun> {
    const statusPath = this.pathResolver.join(runDir, 'wf-run', 'wf-status.json');
    const wfStatus: WfStatus = JSON.parse(await this.fs.readFile(statusPath));

    // Hydrate phases
    const phases = new Map<string, Phase>();
    for (const [name, phaseStatus] of Object.entries(wfStatus.phases)) {
      phases.set(name, await this.phaseAdapter.fromPath({ runDir, phaseName: name }));
    }

    return new WorkflowRun(
      wfStatus.run.id,
      wfStatus.workflow.slug ?? wfStatus.workflow.name,
      wfStatus.workflow.version,
      wfStatus.workflow.version_hash,
      wfStatus.run.status,
      phases,
      new Date(wfStatus.run.created_at),
      runDir
    );
  }

  async list(runsDir: string, filter?: RunFilter): Promise<WorkflowRun[]> {
    const runs: WorkflowRun[] = [];

    // Scan: runsDir/<slug>/<version>/run-*
    const slugDirs = filter?.workflow
      ? [this.pathResolver.join(runsDir, filter.workflow)]
      : await this.fs.listDirectories(runsDir);

    for (const slugDir of slugDirs) {
      if (!await this.fs.exists(slugDir)) continue;

      const versionDirs = await this.fs.listDirectories(slugDir);
      for (const versionDir of versionDirs) {
        const runDirs = await this.fs.listDirectories(versionDir);
        for (const runDir of runDirs) {
          const run = await this.fromPath(runDir);

          // Apply filters
          if (filter?.status && run.status !== filter.status) continue;
          if (filter?.since && run.createdAt < filter.since) continue;

          runs.push(run);
        }
      }
    }

    return runs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async exists(runDir: string): Promise<boolean> {
    const statusPath = this.pathResolver.join(runDir, 'wf-run', 'wf-status.json');
    return this.fs.exists(statusPath);
  }
}

export interface RunFilter {
  workflow?: string;
  status?: RunStatus;
  since?: Date;
}
```

### How Services Use Adapters

```typescript
// Services delegate to adapters for entity hydration
class WorkflowService implements IWorkflowService {
  constructor(
    private readonly workflowAdapter: IWorkflowAdapter,
    private readonly runAdapter: IRunAdapter,
    // ... other deps
  ) {}

  async compose(slug: string, runsDir: string): Promise<ComposeResult> {
    // Get the entity first
    const workflow = await this.workflowAdapter.fromPath({ workflowsDir, slug });

    // Use entity properties
    if (!workflow.hasCheckpoints) {
      return this.errorResult('E034', 'No checkpoints exist');
    }

    // ... create run folder ...

    // Return hydrated entity in result
    const run = await this.runAdapter.fromPath(runDir);
    return { errors: [], run, runDir };
  }
}
```
```

---

## kubectl-Style CLI Design

### Proposed Command Structure

```
cg
├── config                    # Configuration management
│   ├── current-context       # Show current run context
│   └── set-context           # Set default run directory
├── workflow                  # Template management
│   ├── list                  # List all workflow templates
│   ├── get <slug>            # Get workflow details
│   ├── describe <slug>       # Detailed workflow info
│   ├── checkpoint <slug>     # Create version checkpoint
│   ├── versions <slug>       # List checkpoint versions
│   └── restore <slug> <ver>  # Restore to checkpoint
├── runs                      # Run instances
│   ├── list                  # List all runs
│   ├── list --workflow       # Filter by workflow
│   ├── get <run-id>          # Get run details
│   └── describe <run-id>     # Detailed run info
└── phase                     # Phase operations
    ├── list                  # List phases in current run
    ├── get <phase>           # Get phase details
    ├── prepare <phase>       # Prepare phase
    ├── validate <phase>      # Validate phase
    └── finalize <phase>      # Finalize phase
```

### Output Examples

```bash
# Default table
cg runs list
# NAME                   WORKFLOW    VERSION    STATUS     PHASE     AGE
# run-2026-01-25-001     hello-wf    v001       complete   gather    2h
# run-2026-01-25-002     hello-wf    v002       active     process   15m

# Wide format
cg runs list -o wide
# NAME                   WORKFLOW    VERSION    STATUS     PHASE     STARTED              DURATION
# run-2026-01-25-001     hello-wf    v001       complete   gather    2026-01-25T10:00:00  45m

# Names only
cg runs list -o name
# run-2026-01-25-001
# run-2026-01-25-002
```

---

## Implementation Roadmap

### Phase A: Entity Graph Foundation (Priority 1)

| Task | Description |
|------|-------------|
| A1 | Create IEntityAdapter interface in packages/workflow |
| A2 | Create Workflow entity with checkpoints(), runs() lazy navigation |
| A3 | Create Checkpoint entity with workflow() parent + runs() children |
| A4 | Create Run entity with workflow(), checkpoint() parents + phases() children |
| A5 | Create Phase entity with run(), workflow(), checkpoint() parent navigation |
| A6 | Implement WorkflowAdapter with fromSlug(), fromPath(), list() |
| A7 | Implement CheckpointAdapter with list(), fromPath() |
| A8 | Implement RunAdapter with list(filter), fromPath() |
| A9 | Implement PhaseAdapter with listForRun(), fromPath() |
| A10 | Register adapters in DI container |
| A11 | Write tests: navigate down (Workflow → Checkpoint → Run → Phase) |
| A12 | Write tests: navigate up (Phase → Run → Checkpoint → Workflow) |
| A13 | Write tests: entry from any point (Phase.fromPath then climb) |

### Phase B: Runs CLI Commands (Priority 1)

| Task | Description |
|------|-------------|
| B1 | Create registerRunsCommands() in apps/cli |
| B2 | Implement `cg runs list` using RunAdapter.list() |
| B3 | Add --workflow filter flag |
| B4 | Add --status filter flag |
| B5 | Add -o/--output format support (json, wide, name) |
| B6 | Implement `cg runs get <run-id>` |
| B7 | Add ConsoleOutputAdapter cases for runs.list, runs.get |
| B8 | Add JsonOutputAdapter cases |

### Phase C: Service Refactor to Use Adapters (Priority 2)

| Task | Description |
|------|-------------|
| C1 | Inject IWorkflowAdapter into WorkflowService |
| C2 | Inject IRunAdapter into WorkflowService |
| C3 | Update compose() to return WorkflowRun entity (not just path) |
| C4 | Update registry.info() to delegate to WorkflowAdapter |
| C5 | Update existing tests to use adapter-based patterns |

### Phase D: kubectl-Style CLI Polish (Priority 3)

| Task | Description |
|------|-------------|
| D1 | Add `get` as alias for `info` on workflow |
| D2 | Add `ls` as alias for `list` |
| D3 | Add cg config set-run-dir for context |
| D4 | Auto-detect run context from CWD |

### Phase E: Web Integration (Priority 3)

| Task | Description |
|------|-------------|
| E1 | Create /api/workflows REST route using WorkflowAdapter |
| E2 | Create /api/runs route using RunAdapter |
| E3 | Entity.toJSON() provides serialization |
| E4 | Create useWorkflows() hook |
| E5 | Create useRuns() hook |

---

## Prior Learnings Applied

### Critical (Must Follow)

| ID | Learning | Action |
|----|----------|--------|
| PL-01 | Error code collision | Reserve E040-E049 for run commands |
| PL-07 | Interface-only constructors | Entity constructors accept only interfaces |
| PL-08 | Result objects never throw | Repository methods return Result<Entity[]> |
| PL-10 | Path security | Use pathResolver.join() for all path operations |
| PL-18 | Fakes-only testing | Create FakeWorkflowRepository, no vi.mock() |

### High Priority

| ID | Learning | Action |
|----|----------|--------|
| PL-04 | CLI container factory | Register IWorkflowRepository in container |
| PL-12 | Contract tests | Add repository contract tests |
| PL-09 | Output adapter pattern | Add runs command cases to adapters |

---

## Critical Discoveries

### Discovery 01: No Entity Hydration Exists
**Impact**: Critical
**What**: Services return DTOs, never entities. No `fromPath()` anywhere.
**Required Action**: Create entity layer with factory methods.

### Discovery 02: No Run Discovery Capability
**Impact**: Critical
**What**: `IWorkflowService.compose()` creates runs; nothing lists them.
**Required Action**: Add `IWorkflowRepository.listRuns()` scanning filesystem.

### Discovery 03: Phase Is Not Even a DTO
**Impact**: High
**What**: Phase is represented by two strings (name + runDir) passed to services.
**Required Action**: Create Phase entity with state accessors.

### Discovery 04: Web Ready for Integration
**Impact**: Medium
**What**: DI container, SSE infrastructure, result types all compatible with web.
**Required Action**: Add REST routes and hooks using existing patterns.

---

## Entity Graph Model

### The Graph Structure

```
Workflow (template)
│
├── .checkpoints[] ────────► Checkpoint[]
│                               │
│                               └── .runs[] ────► Run[]
│                                                   │
│                                                   └── .phases[] ────► Phase[]
│
└── .runs[] ───────────────► Run[] (all runs across all checkpoints)


Upward Navigation (parent refs):
  Phase.run ──────────► Run
  Run.checkpoint ─────► Checkpoint
  Run.workflow ───────► Workflow
  Checkpoint.workflow ► Workflow
```

### Entry From Any Point

The graph is navigable from any entry point - you don't have to start from Workflow:

```typescript
// === ENTRY: Start from Workflow - drill down ===
const wf = await Workflow.fromPath(workflowsDir, 'hello-wf');
const checkpoints = await wf.checkpoints();           // lazy load
const runs = await checkpoints[0].runs();             // lazy load
const phase = await runs[0].getPhase('gather');       // lazy load

// === ENTRY: Start from Phase folder - climb up ===
const phase = await Phase.fromPath(runDir, 'gather');
const run = await phase.run();                        // derives parent from path
const checkpoint = await run.checkpoint();            // derives parent from path
const wf = await checkpoint.workflow();               // derives parent from path

// === ENTRY: Start from Run folder - go both ways ===
const run = await Run.fromPath(runDir);
const phases = await run.phases();                    // down: lazy load children
const wf = await run.workflow();                      // up: derive parent
```

### Path-Based Parent Derivation

Parent references are derived from filesystem paths - no stored back-references needed:

```typescript
// Run path structure:
// .chainglass/runs/<slug>/<version>/run-YYYY-MM-DD-NNN/
//
// Example: .chainglass/runs/hello-wf/v001-abc123/run-2026-01-25-001/

class Run {
  constructor(readonly runDir: string, ...) {}

  // Derive workflow slug from path
  get workflowSlug(): string {
    // runDir = .chainglass/runs/hello-wf/v001-abc123/run-2026-01-25-001
    // parent.parent.parent.name = hello-wf
    return path.basename(path.dirname(path.dirname(path.dirname(this.runDir))));
  }

  // Derive checkpoint version from path
  get checkpointVersion(): string {
    // parent.name = v001-abc123
    return path.basename(path.dirname(this.runDir));
  }

  // Navigate to parent workflow (lazy)
  async workflow(): Promise<Workflow> {
    const workflowsDir = this.deriveWorkflowsDir();
    return this.workflowAdapter.fromPath({ workflowsDir, slug: this.workflowSlug });
  }

  // Navigate to parent checkpoint (lazy)
  async checkpoint(): Promise<Checkpoint> {
    const wf = await this.workflow();
    const checkpoints = await wf.checkpoints();
    return checkpoints.find(c => c.version === this.checkpointVersion)!;
  }
}
```

### Lazy Loading Pattern

Children are loaded on-demand, not upfront:

```typescript
class Workflow {
  private _checkpoints?: Checkpoint[];
  private _runs?: Run[];

  // Lazy: only loads when accessed
  async checkpoints(): Promise<Checkpoint[]> {
    if (!this._checkpoints) {
      this._checkpoints = await this.checkpointAdapter.list(this.workflowDir);
    }
    return this._checkpoints;
  }

  // Lazy: only loads when accessed
  async runs(): Promise<Run[]> {
    if (!this._runs) {
      this._runs = await this.runAdapter.list(this.runsDir, { workflow: this.slug });
    }
    return this._runs;
  }

  // Force reload (cache invalidation)
  async refreshCheckpoints(): Promise<Checkpoint[]> {
    this._checkpoints = undefined;
    return this.checkpoints();
  }
}
```

### Complete Navigation Examples

```typescript
// Example 1: Find all failed runs for a workflow
const wf = await Workflow.fromPath(workflowsDir, 'hello-wf');
const allRuns = await wf.runs();
const failedRuns = allRuns.filter(r => r.isFailed);

// Example 2: Get the workflow that produced a phase
const phase = await Phase.fromPath(runDir, 'process');
const wf = await (await phase.run()).workflow();
console.log(`Phase belongs to workflow: ${wf.name}`);

// Example 3: List all runs from a specific checkpoint
const wf = await Workflow.fromPath(workflowsDir, 'hello-wf');
const checkpoints = await wf.checkpoints();
const v2Checkpoint = checkpoints.find(c => c.version.startsWith('v002'));
const v2Runs = await v2Checkpoint.runs();

// Example 4: Climb from phase to workflow in one chain
const phase = await Phase.fromPath(runDir, 'gather');
const workflowName = (await (await phase.run()).workflow()).name;
```

---

## Design Philosophy: Entities First, Not Emergent

### The Anti-Pattern (Current State)
```typescript
// Entity is EMERGENT from service calls - diffuse, scattered
const registryResult = await registry.info(workflowsDir, slug);
const versionsResult = await registry.versions(workflowsDir, slug);
const statusJson = await fs.readFile(path.join(runDir, 'wf-status.json'));
// Now I have to mentally assemble "a workflow" from these pieces
```

### The Pattern (Target State)
```typescript
// Entity is FIRST-CLASS - single source of truth
const workflow = await Workflow.fromPath(workflowsDir, slug);
// workflow IS the thing, not pieces of data about the thing

// Services USE entities, not the other way around
const run = await workflow.compose(runsDir);  // Returns entity
const phase = run.getPhase('gather');          // Returns entity
```

### Key Principle: Entity Adapters

Instead of services returning DTOs that consumers must assemble, create **entity adapters** that:
1. Know how to hydrate themselves from filesystem paths
2. Encapsulate their own identity and state
3. Expose methods that delegate to services internally
4. Are the serialization boundary for web/API

```typescript
// Entity adapter pattern
interface IEntityAdapter<T> {
  fromPath(path: string): Promise<T>;
  toJSON(): object;  // For API serialization
}

class WorkflowAdapter implements IEntityAdapter<Workflow> {
  constructor(
    private readonly fs: IFileSystem,
    private readonly yamlParser: IYamlParser,
    private readonly registry: IWorkflowRegistry
  ) {}

  async fromPath(workflowDir: string): Promise<Workflow> {
    // Hydration logic encapsulated here
    // Services don't need to know how to assemble entities
  }
}
```

### What This Is NOT

- **NOT a plugin system** - all entities are hardcoded, first-class
- **NOT complex DDD** - simple entity classes with clear purpose
- **NOT abstracting for hypothetical future** - solving today's problems
- **NOT replacing services** - services still do work, entities represent state

---

## Recommendations Summary

| Priority | Recommendation | Effort | Impact |
|----------|----------------|--------|--------|
| **P1** | Create entity adapter layer (IEntityAdapter + implementations) | 2-3 days | Foundation for everything |
| **P1** | Create entity classes (Workflow, WorkflowRun, Phase) | 1-2 days | First-class citizens |
| **P1** | Add `cg runs list` command | 1 day | Critical missing feature |
| **P2** | Refactor services to use adapters | 2 days | Clean architecture |
| **P2** | Add filtering (--workflow, --status, -o) | 1 day | Usability |
| **P3** | kubectl-style aliases (get, ls) | 0.5 day | Polish |
| **P3** | Web REST routes using adapters | 1-2 days | Entity.toJSON() ready |

---

## Key Design Decisions

### Decision 1: Navigable Entity Graph
**Choice**: Entities form a **bidirectional graph** with lazy loading
**Why**: Enter from any point (Workflow, Checkpoint, Run, or Phase) and navigate the full hierarchy. No need to know the parent to explore children, no need to load everything upfront.

### Decision 2: Path-Based Parent Derivation
**Choice**: Parent references derived from **filesystem paths**, not stored
**Why**: The path `.chainglass/runs/hello-wf/v001-abc123/run-001/phases/gather` contains all ancestry information. No need to store back-references - just parse the path.

### Decision 3: Adapters vs Repository Pattern
**Choice**: Use **adapters** (not repositories)
**Why**: Adapters emphasize "converting filesystem to entity" which is exactly what we need. Repositories imply more complex persistence patterns we don't have.

### Decision 4: Entities Are Readonly Snapshots
**Choice**: Entities are **readonly** with lazy-loaded children
**Why**: Mutations happen through services. Entities represent a snapshot of filesystem state. Call `invalidateCache()` after mutations to refresh.

### Decision 5: toJSON() on Every Entity
**Choice**: Each entity has `toJSON()` and optionally `toFullJSON()` methods
**Why**: `toJSON()` for lightweight serialization, `toFullJSON()` includes lazy-loaded children for complete API responses.

### Decision 6: Internal `_set*` Methods for Graph Assembly
**Choice**: Entities have internal `_setParent()` methods
**Why**: When loading children, the adapter can inject the parent reference to avoid redundant lookups. e.g., `wf.checkpoints()` returns checkpoints that already know their parent workflow.

---

## Next Steps

1. **Review this dossier** and confirm entity/adapter architecture
2. **Run `/plan-1b-specify`** to create formal specification
3. **Run `/plan-3-architect`** to generate phased implementation plan

---

**Research Complete**: 2026-01-26T10:15:00Z
