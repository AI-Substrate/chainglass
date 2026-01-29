# Research Report: WorkGraph-Workspaces Integration Upgrade

**Generated**: 2026-01-28T07:45:00Z
**Research Query**: "Upgrade workgraph data system to use workspaces system"
**Mode**: Pre-Plan
**Location**: docs/plans/021-workgraph-workspaces-upgrade/research-dossier.md
**FlowSpace**: Available
**Findings**: 65+ findings across 7 research areas

## Executive Summary

### What It Does
The workgraph system (`packages/workgraph/`) manages WorkGraphs (DAGs of WorkNodes) and WorkUnits (reusable templates) stored in `.chainglass/work-graphs/` and `.chainglass/units/`. Currently, these paths are hardcoded relative to CWD. The workspaces system (`packages/workflow/`) provides per-worktree data storage via `WorkspaceContext`, storing domain data in `<worktree>/.chainglass/data/<domain>/`.

### Business Purpose
This upgrade will make workgraph storage workspace-aware, enabling:
1. **Per-worktree isolation**: Each git worktree has its own graphs/units
2. **Git-native collaboration**: WorkGraphs committed to git, merge across branches
3. **Multi-workspace CLI**: Users can operate on any registered workspace
4. **Consistent architecture**: All data domains use same storage pattern

### Key Insights
1. **3 services need modification**: WorkGraphService, WorkUnitService, WorkNodeService all hardcode `.chainglass/` paths
2. **Workspaces system is mature**: WorkspaceContext, WorkspaceDataAdapterBase, and SampleAdapter provide proven patterns
3. **No package dependency exists**: `packages/workgraph` does NOT depend on `packages/workflow` - integration requires DI wiring
4. **10 prior learnings apply**: Established patterns for path resolution, contract testing, and error codes

### Quick Stats
- **Components**: 4 services (WorkGraph, WorkNode, WorkUnit, BootstrapPrompt), 3 fakes, 1 container
- **Hardcoded Paths**: 4 locations with `.chainglass/work-graphs` or `.chainglass/units`
- **Test Coverage**: Contract tests, unit tests, integration tests - all will need path updates
- **Complexity**: Medium - well-established patterns to follow
- **Prior Learnings**: 10 relevant discoveries from workspace implementation

---

## How It Currently Works

### Entry Points

| Entry Point | Type | Location | Purpose |
|-------------|------|----------|---------|
| `cg wg create` | CLI | `apps/cli/src/commands/workgraph.command.ts` | Create WorkGraph |
| `cg wg node add-after` | CLI | `apps/cli/src/commands/workgraph.command.ts` | Add node to graph |
| `cg unit list` | CLI | `apps/cli/src/commands/workgraph.command.ts` | List WorkUnits |
| WorkGraphService | Service | `packages/workgraph/src/services/workgraph.service.ts` | Graph CRUD |
| WorkNodeService | Service | `packages/workgraph/src/services/worknode.service.ts` | Node operations |
| WorkUnitService | Service | `packages/workgraph/src/services/workunit.service.ts` | Unit CRUD |

### Core Execution Flow

1. **CLI resolves container**: `createCliProductionContainer()` in `apps/cli/src/lib/container.ts`
2. **Services injected via DI**: WORKGRAPH_DI_TOKENS tokens resolve services
3. **Path constructed from hardcoded base**:
   ```typescript
   // WorkGraphService line 65
   private readonly graphsDir = '.chainglass/work-graphs';
   
   // Path composition
   const graphPath = this.pathResolver.join(this.graphsDir, slug);
   ```
4. **File operations via IFileSystem**: `fs.exists()`, `fs.readFile()`, `fs.mkdir()`, etc.

### Data Flow

```
CLI Command
    │
    ▼
DI Container (resolves services)
    │
    ▼
WorkGraphService / WorkNodeService / WorkUnitService
    │
    ├── graphsDir = '.chainglass/work-graphs' (HARDCODED)
    │   └── pathResolver.join(graphsDir, graphSlug, ...)
    │
    ├── unitsDir = '.chainglass/units' (HARDCODED)
    │   └── pathResolver.join(unitsDir, unitSlug, ...)
    │
    ▼
IFileSystem (real or fake)
```

### State Management

- **WorkGraph definition**: `work-graph.yaml` in graph directory
- **Runtime state**: `state.json` in graph directory (node statuses)
- **Node config**: `nodes/<id>/node.yaml`
- **Node data**: `nodes/<id>/data/data.json` + `data/outputs/`

---

## Architecture & Design

### Component Map

#### Current Workgraph Components

| Component | Location | Path Dependency |
|-----------|----------|-----------------|
| WorkGraphService | `packages/workgraph/src/services/workgraph.service.ts:65` | `graphsDir = '.chainglass/work-graphs'` |
| WorkNodeService | `packages/workgraph/src/services/worknode.service.ts:79` | `graphsDir = '.chainglass/work-graphs'` |
| WorkUnitService | `packages/workgraph/src/services/workunit.service.ts:41` | `unitsDir = '.chainglass/units'` |
| BootstrapPromptService | `packages/workgraph/src/services/bootstrap-prompt.ts:51-53` | Both `graphsDir` and `unitsDir` |

#### Workspaces Components (Target Pattern)

| Component | Location | Pattern |
|-----------|----------|---------|
| WorkspaceDataAdapterBase | `packages/workflow/src/adapters/workspace-data-adapter-base.ts` | Abstract base, `getDomainPath(ctx)` |
| SampleAdapter | `packages/workflow/src/adapters/sample.adapter.ts` | `domain = 'samples'`, receives `WorkspaceContext` |
| WorkspaceContextResolver | `packages/workflow/src/resolvers/workspace-context.resolver.ts` | Resolves CWD → WorkspaceContext |

### Design Patterns Identified

1. **Dependency Injection (ADR-0004)**: All services use `useFactory` pattern with `IFileSystem`, `IPathResolver`, `IYamlParser`
2. **Contract Testing**: Same tests run against Fake and Real implementations
3. **Three-Part Fake API**: State setup (`setX()`), inspection (`getXCalls()`), error injection (`injectXError()`)
4. **Domain Isolation**: `WorkspaceDataAdapterBase` stores at `<worktree>/.chainglass/data/<domain>/`

### System Boundaries

- **Internal**: WorkGraph ↔ WorkNode ↔ WorkUnit all in `packages/workgraph`
- **Integration Point**: Must receive `WorkspaceContext` from `packages/workflow`
- **No Circular Dependency**: Workgraph will depend on workflow's types only (via shared DI tokens or interfaces)

---

## Dependencies & Integration

### What Workgraph Currently Depends On

| Dependency | Package | Purpose |
|------------|---------|---------|
| IFileSystem | @chainglass/shared | File operations |
| IPathResolver | @chainglass/shared | Path composition |
| IYamlParser | @chainglass/shared | YAML read/write |
| zod | npm | Schema validation |
| yaml | npm | YAML parsing |

### What Workgraph Does NOT Depend On

- **@chainglass/workflow** - No dependency exists (confirmed in `packages/workgraph/package.json:37-42`)
- **WorkspaceContext** - Not currently used
- **WorkspaceContextResolver** - Not injected

### Required New Dependencies

| New Dependency | Source | Purpose |
|----------------|--------|---------|
| WorkspaceContext (type) | Import from @chainglass/workflow or shared | Context for path resolution |
| IWorkspaceContextResolver | Import interface | Resolve CWD → context |

---

## Modification Considerations

### ✅ Safe to Modify

1. **WorkGraphService constructor** - Add `workspaceRoot?: string` parameter
2. **WorkUnitService constructor** - Add `workspaceRoot?: string` parameter  
3. **WorkNodeService constructor** - Add `workspaceRoot?: string` parameter
4. **BootstrapPromptService constructor** - Add `workspaceRoot?: string` parameter
5. **DI container factories** - Wire new dependencies

### ⚠️ Modify with Caution

1. **Path computation** - All 8+ `pathResolver.join()` calls per service
2. **Fake services** - Must update to capture workspace context in calls
3. **Test fixtures** - 20+ test files reference exact path structures

### 🚫 Danger Zones

1. **WorkspaceDataAdapterBase** - Consider NOT extending; workgraph has different storage structure
2. **Error codes** - Workgraph uses E101-E199; don't overlap with workspace E074-E089
3. **CLI backward compat** - If users have existing `.chainglass/work-graphs/` in CWD, migration needed

### Extension Points

1. **Constructor injection** - Add `dataRoot?: string` parameter to all services
2. **Factory pattern** - Update `createWorkgraphProductionContainer()` to accept workspace context
3. **CLI options** - Add `--workspace-path` flag (like sample commands)

---

## Prior Learnings (From 014-workspaces Implementation)

### 📚 PL-01: Path Handling Through IPathResolver (Security)
**Source**: `docs/plans/014-workspaces/research-dossier.md:732`
**Type**: gotcha

**What They Found**:
> All filesystem paths must be routed through IPathResolver interface for consistency and security

**Why This Matters Now**:
WorkGraph already uses IPathResolver - good! But workspace root must be validated for path traversal.

**Action for Current Work**:
Validate workspace path before prefixing to prevent escape attacks.

---

### 📚 PL-02: WorkspaceContext Resolution Must Precede Operations
**Source**: `docs/plans/014-workspaces/tasks/phase-2-workspacecontext-resolution/tasks.md`
**Type**: decision

**What They Found**:
> Services need WorkspaceContext (worktreePath, workspaceSlug) BEFORE accessing per-worktree data

**Why This Matters Now**:
WorkGraphService.create() must receive or resolve WorkspaceContext before creating `.chainglass/work-graphs/` directory.

**Action for Current Work**:
Either inject context into service constructor OR add context parameter to each method.

---

### 📚 PL-03: Split Storage Architecture
**Source**: `docs/plans/014-workspaces/data-model-dossier.md`
**Type**: decision

**What They Found**:
> Two-layer model—global registry at ~/.config/chainglass/ + per-worktree data at <worktree>/.chainglass/

**Why This Matters Now**:
WorkGraphs should be per-worktree (in git), not global. Units could be either.

**Action for Current Work**:
Store both work-graphs and units under `<worktree>/.chainglass/data/` for consistency.

---

### 📚 PL-04: Contract Tests Prevent Integration Bugs
**Source**: `docs/plans/014-workspaces/tasks/phase-1-workspace-entity-registry-adapter-contract-tests/tasks.md:T008`
**Type**: insight

**What They Found**:
> Must write contract tests BEFORE adapter implementation; run against both FakeAdapter and RealAdapter

**Why This Matters Now**:
Updating path logic requires contract tests to verify both fake and real behave identically.

**Action for Current Work**:
Update existing contract tests to use workspace-prefixed paths, run against both implementations.

---

### 📚 PL-05: Git Worktree Detection Graceful Degradation
**Source**: `docs/plans/014-workspaces/tasks/phase-2-workspacecontext-resolution/tasks.md:T019`
**Type**: gotcha

**What They Found**:
> Git < 2.13 or missing git → return [] (empty list), never throw

**Why This Matters Now**:
WorkGraphs may be accessed in non-git folders; must not fail.

**Action for Current Work**:
Fall back to CWD if no workspace context found.

---

### 📚 PL-06: Three-Part Fake API Pattern
**Source**: `docs/plans/014-workspaces/research-dossier.md:380-440`
**Type**: decision

**What They Found**:
> Fakes need: setState(), getCalls() getters, injectError() methods + reset() helper

**Why This Matters Now**:
FakeWorkGraphService already follows this pattern; must preserve and extend for workspace context.

**Action for Current Work**:
Add workspace context to call recording: `{ workspaceRoot: string, slug: string, ... }`.

---

### 📚 PL-07: Error Code Allocation
**Source**: `docs/plans/014-workspaces/tasks/phase-1/tasks.md:T007`
**Type**: decision

**What They Found**:
> Error codes must not overlap; Workspace E074-E081, Sample E082-E089

**Why This Matters Now**:
Workgraph already uses E101-E199; no overlap concerns.

**Action for Current Work**:
No action needed - codes are isolated.

---

### 📚 PL-08: Entity Immutability Pattern
**Source**: `docs/plans/014-workspaces/research-dossier.md:194-237`
**Type**: insight

**What They Found**:
> All entities use: private constructor + static `create(input)` factory + readonly properties

**Why This Matters Now**:
WorkGraph types are already immutable interfaces - consistent.

**Action for Current Work**:
No change needed; pattern already followed.

---

### 📚 PL-09: Composite Key Pattern in Fakes
**Source**: `docs/plans/014-workspaces/tasks/phase-3-sample-domain-exemplar/tasks.md:T031`
**Type**: gotcha

**What They Found**:
> Test data isolation verified via composite key `${worktreePath}|${slug}` in FakeSampleAdapter

**Why This Matters Now**:
FakeWorkGraphService must isolate graphs per-workspace in tests.

**Action for Current Work**:
Update fake to key by `${workspaceRoot}|${graphSlug}` instead of just `graphSlug`.

---

### 📚 PL-10: Sample Domain as Exemplar
**Source**: `docs/plans/014-workspaces/tasks/phase-3-sample-domain-exemplar/tasks.md`
**Type**: insight

**What They Found**:
> Sample domain validates patterns before applying to agents/workflows

**Why This Matters Now**:
SampleAdapter is the reference implementation for workspace-aware storage.

**Action for Current Work**:
Study `SampleAdapter` closely; replicate pattern for workgraph.

---

## Critical Discoveries

### 🚨 Critical Finding 01: 4 Services Have Hardcoded Paths
**Impact**: Critical
**Source**: WG-01, WG-02, WG-03, WG-04
**Files**:
- `packages/workgraph/src/services/workgraph.service.ts:65`
- `packages/workgraph/src/services/worknode.service.ts:79`
- `packages/workgraph/src/services/workunit.service.ts:41`
- `packages/workgraph/src/services/bootstrap-prompt.ts:51-53`

**What**: All four services define private readonly fields for base directories:
```typescript
private readonly graphsDir = '.chainglass/work-graphs';
private readonly unitsDir = '.chainglass/units';
```

**Why It Matters**: Must modify constructor to accept dynamic base path.

**Required Action**: Replace hardcoded paths with constructor-injected `dataRoot` parameter.

---

### 🚨 Critical Finding 02: No Package Dependency Between Workgraph and Workflow
**Impact**: Critical
**Source**: DI-09
**File**: `packages/workgraph/package.json:37-42`

**What**: Workgraph depends only on `@chainglass/shared` + npm packages; no dependency on `@chainglass/workflow`.

**Why It Matters**: Cannot directly import WorkspaceContext from workflow package.

**Required Action**: Either:
1. Add workflow as dependency (creates coupling)
2. Move WorkspaceContext interface to shared (better)
3. Define minimal context type in workgraph (acceptable)

---

### 🚨 Critical Finding 03: Storage Location Change
**Impact**: High
**Source**: WG-01 vs WS-10

**What**: 
- Current: `.chainglass/work-graphs/` and `.chainglass/units/`
- Workspace pattern: `<worktree>/.chainglass/data/<domain>/`

**Why It Matters**: Decision needed - keep existing paths or migrate to `data/` subdirectory?

**Required Action**: Choose path strategy:
- **Option A**: Keep `.chainglass/work-graphs/` (less change)
- **Option B**: Move to `.chainglass/data/work-graphs/` (consistent with Sample)

---

### 🚨 Critical Finding 04: CLI Already Supports --workspace-path
**Impact**: Medium
**Source**: CLI-07
**File**: `apps/cli/src/commands/sample.command.ts:42-43`

**What**: Sample commands implement `--workspace-path <path>` flag pattern.

**Why It Matters**: Workgraph commands should follow same pattern.

**Required Action**: Add `--workspace-path` option to all `cg wg` and `cg unit` commands.

---

## Recommendations

### If Modifying This System

1. **Design Decision First**: Resolve path strategy (Option A vs B in Critical Finding 03)
2. **Type Interface**: Define `WorkGraphContext` or reuse `WorkspaceContext`
3. **Constructor Update**: Add `dataRoot: string` parameter to all 4 services
4. **Factory Update**: Update `createWorkgraphProductionContainer()` to accept context
5. **CLI Update**: Add `--workspace-path` flag to workgraph commands
6. **Test Update**: Update all test fixtures to use workspace-prefixed paths

### Implementation Order

1. **Phase 1**: Define WorkGraphContext type, update service constructors (no behavior change)
2. **Phase 2**: Update DI container to wire workspace context
3. **Phase 3**: Update CLI commands to resolve and pass context
4. **Phase 4**: Update tests, remove legacy support
5. **Phase 5**: Delete any backward compatibility code

### Migration Strategy

Since user requested "deprecate and remove legacy code, no backward compatibility":

1. **No migration path** - users must re-create work-graphs in workspace
2. **Clean break** - old `.chainglass/work-graphs/` at project root ignored
3. **Documentation** - Update docs to explain new workspace-scoped storage

---

## File Inventory

### Core Files to Modify

| File | Lines | Change Type |
|------|-------|-------------|
| `packages/workgraph/src/services/workgraph.service.ts` | 897 | Constructor, path computation |
| `packages/workgraph/src/services/worknode.service.ts` | 1858 | Constructor, path computation |
| `packages/workgraph/src/services/workunit.service.ts` | 426 | Constructor, path computation |
| `packages/workgraph/src/services/bootstrap-prompt.ts` | 271 | Constructor, path computation |
| `packages/workgraph/src/container.ts` | 255 | Factory functions |
| `packages/workgraph/src/fakes/fake-workgraph-service.ts` | 316 | Call recording |
| `packages/workgraph/src/fakes/fake-worknode-service.ts` | 759 | Call recording |
| `packages/workgraph/src/fakes/fake-workunit-service.ts` | 209 | Call recording |
| `apps/cli/src/commands/workgraph.command.ts` | 923 | Add --workspace-path flag |

### Test Files to Update

| File | Purpose |
|------|---------|
| `test/unit/workgraph/workgraph-service.test.ts` | Path fixture updates |
| `test/unit/workgraph/worknode-service.test.ts` | Path fixture updates |
| `test/unit/workgraph/workunit-service.test.ts` | Path fixture updates |
| `test/contracts/workgraph-service.contract.ts` | Add workspace context |
| `test/contracts/worknode-service.contract.ts` | Add workspace context |
| `test/integration/workgraph/*.test.ts` | Full lifecycle with workspace |

---

## Next Steps

**Research complete. Ready to proceed with upgrade.**

1. Run `/plan-1b-specify "upgrade workgraph to use workspaces system"` to create specification
2. Then `/plan-3-architect` to create implementation plan

**Note**: No external research gaps identified - all knowledge is in codebase.

---

## Validation Strategy: Plan 017 E2E Harness

The final validation for this upgrade is **re-running the Plan 017 E2E harness** in both mock and real agent modes.

### What the Harness Tests

The E2E harness at `docs/how/dev/workgraph-run/e2e-sample-flow.ts` creates a 3-node pipeline:

```
[sample-input] → [sample-coder] → [sample-tester]
```

It validates:
1. **Graph creation** (`cg wg create`)
2. **Node addition with input mappings** (`cg wg node add-after -i`)
3. **Direct output pattern** (PENDING → COMPLETE without start)
4. **Agent question/answer flow** (`cg wg node ask/answer`)
5. **Cross-node data flow** (`cg wg node get-input-data/get-input-file`)
6. **Output reading** (`cg wg node get-output-data`)
7. **Graph status validation** (`cg wg status`)

### Two Validation Modes

| Mode | Command | What It Does |
|------|---------|--------------|
| **Mock Mode** | `npx tsx e2e-sample-flow.ts` | Simulates agent work directly; fast (~5s), deterministic |
| **Real Agent Mode** | `npx tsx e2e-sample-flow.ts --with-agent` | Invokes actual Claude Code agent; requires API keys |

### Commands to Execute for Validation

**Prerequisites (from workspace root):**
```bash
# Ensure CLI is built
pnpm build
```

**E2E Validation Commands:**
```bash
# Mock mode (no real agent) - fast, deterministic
npx tsx docs/how/dev/workgraph-run/e2e-sample-flow.ts

# With Claude Code agent
npx tsx docs/how/dev/workgraph-run/e2e-sample-flow.ts --with-agent

# With GitHub Copilot agent
npx tsx docs/how/dev/workgraph-run/e2e-sample-flow.ts --with-agent --copilot
```

### What Success Looks Like

Both modes should output:
```
=================================================================
                    TEST PASSED
=================================================================
```

And exit with code 0.

### Key CLI Commands Exercised

The harness exercises these commands that will need workspace-aware paths:

| Command | Current Path | Workspace Path |
|---------|-------------|----------------|
| `cg wg create <slug>` | `.chainglass/work-graphs/<slug>/` | `<worktree>/.chainglass/data/work-graphs/<slug>/` |
| `cg wg node add-after` | Creates `nodes/<id>/node.yaml` | Same, under workspace |
| `cg wg node save-output-data` | Writes to `nodes/<id>/data/data.json` | Same, under workspace |
| `cg wg node save-output-file` | Copies to `nodes/<id>/data/outputs/` | Same, under workspace |
| `cg wg node get-input-data` | Reads upstream node data | Same, under workspace |
| `cg wg node get-input-file` | Returns path to upstream file | Same, under workspace |
| `cg unit list` | `.chainglass/units/` | `<worktree>/.chainglass/data/units/` |

### Post-Upgrade Validation Steps

After implementing workspace awareness:

1. **Register workspace** (if not in registered workspace):
   ```bash
   cg workspace add "Test" .
   ```

2. **Run mock mode** from workspace root:
   ```bash
   cd docs/how/dev/workgraph-run
   npx tsx e2e-sample-flow.ts
   ```

3. **Verify paths** - check that files are created in workspace-scoped location:
   ```bash
   ls -la <worktree>/.chainglass/data/work-graphs/sample-e2e/
   ls -la <worktree>/.chainglass/data/units/
   ```

4. **Run real agent mode** (optional, for full validation):
   ```bash
   npx tsx e2e-sample-flow.ts --with-agent
   ```

5. **Verify cross-worktree isolation** (if applicable):
   - Run in worktree A → creates graph in A's `.chainglass/data/`
   - Check worktree B → should NOT see A's graph

---

## Appendix: E2E Test File Inventory

**Verified**: 2026-01-28T07:55:44Z (E2E test passed in mock mode)

### Files Created by E2E Test

The E2E test (`e2e-sample-flow.ts`) creates these files that need workspace-aware paths:

#### WorkGraph Files (Currently: `.chainglass/work-graphs/`)

```
.chainglass/work-graphs/sample-e2e/
├── work-graph.yaml              # Graph definition (slug, nodes, edges)
├── state.json                   # Runtime state (node statuses, timestamps)
└── nodes/
    ├── sample-input-860/
    │   ├── node.yaml            # Node definition (unit ref, inputs, outputs)
    │   └── data/
    │       └── data.json        # Output data (spec text)
    ├── sample-coder-248/
    │   ├── node.yaml
    │   └── data/
    │       ├── data.json        # Output data (language)
    │       └── outputs/
    │           └── script.sh    # Output file (generated code)
    └── sample-tester-725/
        ├── node.yaml
        └── data/
            └── data.json        # Output data (success, output)
```

#### WorkUnit Files (Currently: `.chainglass/units/`)

```
.chainglass/units/
├── sample-input/
│   └── unit.yaml                # Unit definition (type, inputs, outputs)
├── sample-coder/
│   ├── unit.yaml
│   └── commands/
│       └── main.md              # Agent prompt template
└── sample-tester/
    ├── unit.yaml
    └── commands/
        └── main.md              # Agent prompt template
```

### Target Workspace Paths (After Upgrade)

| Current Path | New Workspace Path |
|-------------|-------------------|
| `.chainglass/work-graphs/` | `<worktree>/.chainglass/data/work-graphs/` |
| `.chainglass/units/` | `<worktree>/.chainglass/data/units/` |
| `.chainglass/work-graphs/<slug>/state.json` | `<worktree>/.chainglass/data/work-graphs/<slug>/state.json` |
| `.chainglass/work-graphs/<slug>/nodes/<id>/data/` | `<worktree>/.chainglass/data/work-graphs/<slug>/nodes/<id>/data/` |

### Key File Contents

**work-graph.yaml** (graph definition):
```yaml
slug: sample-e2e
version: 1.0.0
created_at: 2026-01-28T07:55:42.356Z
nodes:
  - start
  - sample-input-860
  - sample-coder-248
  - sample-tester-725
edges:
  - from: start
    to: sample-input-860
  - from: sample-input-860
    to: sample-coder-248
  - from: sample-coder-248
    to: sample-tester-725
```

**state.json** (runtime state):
```json
{
  "graph_status": "in_progress",
  "updated_at": "2026-01-28T07:55:44.128Z",
  "nodes": {
    "sample-input-860": { "status": "complete", "completed_at": "..." },
    "sample-coder-248": { "status": "complete", "started_at": "...", "completed_at": "..." },
    "sample-tester-725": { "status": "complete", "started_at": "...", "completed_at": "..." }
  }
}
```

**unit.yaml** (unit definition):
```yaml
slug: sample-input
type: user-input
version: 1.0.0
description: Provides initial specification for code generation
inputs: []
outputs:
  - name: spec
    type: data
    data_type: text
    required: true
    description: The specification for what code to generate
user_input:
  question_type: text
  prompt: "What code would you like to generate?"
```

### Committed Unit Files

The sample units have been copied from `016-agent-units` branch and committed:
```
git add .chainglass/units/
```

These are test fixtures required for the E2E harness to work.

---

## Validation Specification: Post-Migration E2E Test

**Purpose**: Define exactly what the E2E test output should look like after workspace migration is complete. This is our acceptance criteria.

### Pre-Migration State (Current - BASELINE)

```
.chainglass/
├── units/                          # WorkUnits (templates)
│   ├── sample-input/unit.yaml
│   ├── sample-coder/unit.yaml
│   ├── sample-coder/commands/main.md
│   ├── sample-tester/unit.yaml
│   └── sample-tester/commands/main.md
├── work-graphs/                    # WorkGraphs (instances)
│   └── sample-e2e/
│       ├── work-graph.yaml
│       ├── state.json
│       └── nodes/
│           ├── sample-input-860/
│           │   ├── node.yaml
│           │   └── data/data.json
│           ├── sample-coder-248/
│           │   ├── node.yaml
│           │   └── data/
│           │       ├── data.json
│           │       └── outputs/script.sh
│           └── sample-tester-725/
│               ├── node.yaml
│               └── data/data.json
└── data/                           # Workspace-aware domains (existing)
    └── samples/jk-sampel.json
```

### Post-Migration State (Target - EXPECTED)

```
.chainglass/
├── data/                           # ALL per-worktree data under /data/
│   ├── samples/jk-sampel.json      # Existing workspace-aware domain
│   ├── units/                      # WorkUnits (NEW LOCATION)
│   │   ├── sample-input/unit.yaml
│   │   ├── sample-coder/unit.yaml
│   │   ├── sample-coder/commands/main.md
│   │   ├── sample-tester/unit.yaml
│   │   └── sample-tester/commands/main.md
│   └── work-graphs/                # WorkGraphs (NEW LOCATION)
│       └── sample-e2e/
│           ├── work-graph.yaml
│           ├── state.json
│           └── nodes/
│               ├── sample-input-{id}/
│               │   ├── node.yaml
│               │   └── data/data.json
│               ├── sample-coder-{id}/
│               │   ├── node.yaml
│               │   └── data/
│               │       ├── data.json
│               │       └── outputs/script.sh
│               └── sample-tester-{id}/
│                   ├── node.yaml
│                   └── data/data.json
└── (old locations REMOVED - no backwards compatibility)
```

### Validation Commands

**Step 1: Clean slate**
```bash
# Remove any existing test artifacts
rm -rf .chainglass/work-graphs/sample-e2e
rm -rf .chainglass/data/work-graphs/sample-e2e
```

**Step 2: Run E2E test**
```bash
npx tsx docs/how/dev/workgraph-run/e2e-sample-flow.ts
```

**Step 3: Verify files in NEW location**
```bash
# Must exist in workspace-aware location
ls .chainglass/data/work-graphs/sample-e2e/work-graph.yaml
ls .chainglass/data/work-graphs/sample-e2e/state.json
ls .chainglass/data/work-graphs/sample-e2e/nodes/*/node.yaml
ls .chainglass/data/work-graphs/sample-e2e/nodes/*/data/data.json

# Units must be in workspace-aware location
ls .chainglass/data/units/sample-input/unit.yaml
ls .chainglass/data/units/sample-coder/unit.yaml
ls .chainglass/data/units/sample-tester/unit.yaml
```

**Step 4: Verify files NOT in OLD location**
```bash
# Must NOT exist in legacy location
! ls .chainglass/work-graphs/sample-e2e 2>/dev/null
! ls .chainglass/units/sample-input 2>/dev/null
```

**Step 5: Verify file contents**
```bash
# Script output path must reference new location
cat .chainglass/data/work-graphs/sample-e2e/nodes/sample-coder-*/data/data.json | grep ".chainglass/data/work-graphs"
```

### Expected File Contents (Post-Migration)

**data.json** (sample-coder node) - note path change:
```json
{
  "outputs": {
    "language": "bash",
    "script": ".chainglass/data/work-graphs/sample-e2e/nodes/sample-coder-{id}/data/outputs/script.sh"
  },
  "questions": { ... },
  "answers": { ... }
}
```

**Key Change**: The `script` output path MUST reference `.chainglass/data/work-graphs/` not `.chainglass/work-graphs/`.

### E2E Test Output (Expected)

```
=================================================================
           E2E Test: Sample Code Generation Flow
=================================================================
Mode: Mock (no real agents)

Cleaned up existing graph: .chainglass/data/work-graphs/sample-e2e

STEP 1: Create Graph
  ✓ Created graph: sample-e2e

STEP 2: Add Nodes
  ✓ Added node: sample-input-XXX (sample-input)
  ✓ Added node: sample-coder-XXX (sample-coder) -> after sample-input-XXX
  ✓ Added node: sample-tester-XXX (sample-tester) -> after sample-coder-XXX

STEP 3: Execute get-spec (Direct Output)
  ✓ can-run: true (no upstream dependencies)
  ✓ Saved output: spec = "Write a function add(a, b) that returns the sum of two numbers"
  ✓ can-end: true (spec output present)
  ✓ Completed: get-spec -> complete (no start needed!)

STEP 4: Execute generate-code (Agent with Question)
  ✓ can-run: true (get-spec is complete)
  ✓ Started: generate-code -> running
  ✓ Asked question: "Which programming language should I use?"
  ✓ Auto-answered: "bash"
  ✓ Generated mock script: add.sh
  ✓ Saved output: language = "bash"
  ✓ Saved output: script = add.sh
  ✓ Completed: generate-code -> complete

STEP 5: Execute run-verify (Agent Runs Script)
  ✓ can-run: true (generate-code is complete)
  ✓ Started: run-verify -> running
  ✓ Got input: language = "bash"
  ✓ Got input: script = ".chainglass/data/work-graphs/sample-e2e/nodes/sample-coder-XXX/data/outputs/script.sh"
  ✓ Executed script, output: "5"
  ✓ Saved output: success = true
  ✓ Saved output: output = "5"
  ✓ Completed: run-verify -> complete

STEP 6: Read Pipeline Result
  ✓ success = true
  ✓ output = "5"

STEP 7: Validate Final State
  ✓ All nodes complete
  ✓   start: complete
  ✓   sample-input-XXX: complete
  ✓   sample-coder-XXX: complete
  ✓   sample-tester-XXX: complete

=================================================================
                    TEST PASSED
=================================================================
```

**Key Validation Points in Output**:
1. `Cleaned up existing graph: .chainglass/data/work-graphs/sample-e2e` - NEW path
2. `Got input: script = ".chainglass/data/work-graphs/..."` - NEW path in file references

### Automated Validation Script

Create this script to validate migration success:

```bash
#!/bin/bash
# validate-workspace-migration.sh

set -e

echo "=== Workspace Migration Validation ==="

# Clean slate
rm -rf .chainglass/work-graphs/sample-e2e 2>/dev/null || true
rm -rf .chainglass/data/work-graphs/sample-e2e 2>/dev/null || true

# Run E2E
echo "Running E2E test..."
npx tsx docs/how/dev/workgraph-run/e2e-sample-flow.ts

# Validate new location
echo "Checking new location..."
test -f .chainglass/data/work-graphs/sample-e2e/work-graph.yaml || { echo "FAIL: work-graph.yaml not in data/"; exit 1; }
test -f .chainglass/data/work-graphs/sample-e2e/state.json || { echo "FAIL: state.json not in data/"; exit 1; }

# Validate old location is empty
echo "Checking old location is empty..."
if [ -d ".chainglass/work-graphs/sample-e2e" ]; then
  echo "FAIL: Legacy location still has files"
  exit 1
fi

# Validate path references in data.json
echo "Checking path references..."
if ! grep -r ".chainglass/data/work-graphs" .chainglass/data/work-graphs/sample-e2e/nodes/*/data/data.json > /dev/null 2>&1; then
  echo "FAIL: data.json still references old paths"
  exit 1
fi

echo "=== VALIDATION PASSED ==="
```

### Summary: What Changes

| Aspect | Before | After |
|--------|--------|-------|
| WorkGraph storage | `.chainglass/work-graphs/` | `.chainglass/data/work-graphs/` |
| WorkUnit storage | `.chainglass/units/` | `.chainglass/data/units/` |
| File path references | `".chainglass/work-graphs/..."` | `".chainglass/data/work-graphs/..."` |
| Cleanup path in E2E | `.chainglass/work-graphs/sample-e2e` | `.chainglass/data/work-graphs/sample-e2e` |
| Backwards compatibility | N/A | **NONE** - clean break |

---

**Research Complete**: 2026-01-28T08:00:00Z
**Report Location**: docs/plans/021-workgraph-workspaces-upgrade/research-dossier.md
