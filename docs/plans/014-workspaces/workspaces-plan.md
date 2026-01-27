# Workspaces Implementation Plan

**Plan Version**: 1.0.1
**Created**: 2026-01-27
**Spec**: [./workspaces-spec.md](./workspaces-spec.md)
**Status**: VALIDATED (plan-4 passed)

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Technical Context](#technical-context)
3. [Critical Research Findings](#critical-research-findings)
4. [Testing Philosophy](#testing-philosophy)
5. [Implementation Phases](#implementation-phases)
   - [Phase 1: Workspace Entity + Registry Adapter + Contract Tests](#phase-1-workspace-entity--registry-adapter--contract-tests)
   - [Phase 2: WorkspaceContext Resolution + Worktree Discovery](#phase-2-workspacecontext-resolution--worktree-discovery)
   - [Phase 3: Sample Domain (Exemplar)](#phase-3-sample-domain-exemplar)
   - [Phase 4: Service Layer + DI Integration](#phase-4-service-layer--di-integration)
   - [Phase 5: CLI Commands](#phase-5-cli-commands)
   - [Phase 6: Web UI](#phase-6-web-ui)
   - [Phase 7: Documentation](#phase-7-documentation)
6. [Cross-Cutting Concerns](#cross-cutting-concerns)
7. [Complexity Tracking](#complexity-tracking)
8. [Progress Tracking](#progress-tracking)
9. [Change Footnotes Ledger](#change-footnotes-ledger)

---

## Executive Summary

**Problem**: Users work across multiple projects simultaneously. Chainglass lacks a way to organize, navigate, and store per-project data that travels with git branches and merges across teams.

**Solution**:
- Global registry (`~/.config/chainglass/workspaces.json`) tracks which folders are workspaces
- Per-worktree data storage (`<worktree>/.chainglass/data/`) enables git-native collaboration
- Sample domain validates patterns before applying to agents/workflows/prompts
- Web UI left menu provides navigation hierarchy; CLI provides full access
- Full TDD with fakes and contract tests ensures reliability

**Expected Outcomes**:
- Users can register any folder as a workspace
- Git repos auto-discover worktrees
- Data created in feature branches merges to main
- Web UI shows workspaces → worktrees → samples in left menu
- CLI provides `cg workspace` and `cg sample` command groups

**Success Metrics**:
- AC-01 through AC-30 from spec verified
- Contract tests pass for both Fake and Real adapters
- Chainglass repo (8 worktrees) used to validate end-to-end

---

## Technical Context

### Current System State

- Workflow system stores data in `.chainglass/workflows/` and `.chainglass/runs/`
- No concept of workspace registration or navigation
- Web UI has existing left menu patterns in `apps/web/src/lib/navigation-utils.ts`
- CLI has command group pattern in `apps/cli/src/commands/workflow.command.ts`

### Integration Requirements

- IFileSystem, IPathResolver from `@chainglass/shared`
- DI container pattern from `packages/workflow/src/container.ts`
- Entity pattern from `packages/workflow/src/entities/workflow.ts`
- Fake pattern from `packages/workflow/src/fakes/fake-workflow-adapter.ts`

### Constraints and Limitations

- Fakes only - no vi.mock/vi.fn per R-TEST-007
- Child container isolation per test
- useFactory pattern for DI registrations
- Server-side data (no client-side state for workspaces)

### Assumptions

- Git CLI available for worktree detection (graceful fallback if not)
- User has write access to `~/.config/chainglass/`
- Web server runs as same user as CLI (filesystem access)

---

## Critical Research Findings

### Critical Discovery 01: Split Storage Architecture

**Impact**: Critical
**Sources**: [Data Model Dossier, Research Dossier]

**What**: Workspaces use two-layer storage - global registry for workspace list, per-worktree for domain data.

**Why It Matters**: Enables workspace list to survive project deletion while domain data travels with git.

**Solution**:
```
~/.config/chainglass/workspaces.json  # Global registry
<worktree>/.chainglass/data/          # Per-worktree domain data
```

**Action Required**: WorkspaceAdapter reads/writes registry; WorkspaceDataAdapterBase handles per-worktree data.

**Affects Phases**: 1, 2, 3, 4

---

### Critical Discovery 02: WorkspaceDataAdapterBase Pattern

**Impact**: Critical
**Sources**: [Data Model Dossier I1-02, I1-03]

**What**: Base class provides common functionality for all domain adapters (samples, agents, workflows, prompts).

**Why It Matters**: DRY principle - path resolution, JSON I/O, directory creation shared across domains.

**Solution**:
```typescript
abstract class WorkspaceDataAdapterBase<TEntity> {
  abstract readonly domain: string;
  protected getDomainPath(ctx: WorkspaceContext): string { ... }
  protected getEntityPath(ctx: WorkspaceContext, slug: string): string { ... }
  async ensureStructure(ctx: WorkspaceContext): Promise<Result<void>> { ... }
  async listSlugs(ctx: WorkspaceContext): Promise<Result<string[]>> { ... }
  protected async readJson<T>(path: string): Promise<Result<T>> { ... }
  protected async writeJson<T>(path: string, data: T): Promise<Result<void>> { ... }
}
```

**Action Required**: Implement base class before Sample domain; Sample extends it.

**Affects Phases**: 3, 4

---

### Critical Discovery 03: Contract Tests for Adapter Parity

**Impact**: Critical
**Sources**: [Constitution §3.3, I1-03, R1-07]

**What**: FakeWorkspaceAdapter and WorkspaceAdapter must pass identical contract tests.

**Why It Matters**: Prevents fake drift; ensures tests validate real behavior.

**Solution**:
```typescript
function workspaceAdapterContractTests(createContext: () => TestContext) {
  describe('load()', () => { ... });
  describe('save()', () => { ... });
  describe('list()', () => { ... });
  // Same tests run against Fake and Real
}

workspaceAdapterContractTests(() => ({ adapter: new FakeWorkspaceAdapter() }));
workspaceAdapterContractTests(() => ({ adapter: new WorkspaceAdapter(...) }));
```

**Action Required**: Write contract tests BEFORE implementation; run against both adapters.

**Affects Phases**: 1, 3

---

### High Discovery 04: Git Worktree Detection Fallback

**Impact**: High
**Sources**: [R1-02, R1-06, AC-27]

**What**: Worktree discovery relies on git CLI; must gracefully degrade when git unavailable or too old.

**Why It Matters**: Non-git workspaces must work; old git versions shouldn't crash.

**Solution**:
```typescript
async detectWorktrees(workspacePath: string): Promise<Worktree[]> {
  try {
    const version = await this.getGitVersion();
    if (version < '2.13') return []; // Too old, no worktree support

    const output = await exec('git worktree list --porcelain', { cwd: workspacePath });
    return this.parseWorktreeOutput(output);
  } catch {
    return []; // Git not available, graceful degradation
  }
}
```

**Action Required**: Implement version detection; fallback to empty array; E079 error code for explicit failures.

**Affects Phases**: 2

---

### High Discovery 05: Path Security and Validation

**Impact**: High
**Sources**: [R1-03, PL-01]

**What**: All paths must use IPathResolver; validate absolute, no traversal, no tilde in stored paths.

**Why It Matters**: Prevents directory traversal attacks; ensures consistent path handling.

**Solution**:
```typescript
validateWorkspacePath(path: string): Result<string> {
  if (!this.pathResolver.isAbsolute(path)) {
    return err(E076, 'Path must be absolute');
  }
  if (path.includes('..')) {
    return err(E076, 'Path cannot contain ..');
  }
  // Expand tilde before storing
  const expanded = this.pathResolver.expandHome(path);
  return ok(expanded);
}
```

**Action Required**: Validate on add; store canonical paths; use pathResolver.join() for all path operations. Extract `expandTilde()` from WorkflowService:677-682 to IPathResolver interface (DYK session 2026-01-27).

**Affects Phases**: 1, 4

---

### High Discovery 06: Error Code Standardization (E074-E081)

**Impact**: High
**Sources**: [R1-05, Spec §Error Handling]

**What**: Workspace errors allocated E074-E081; each needs factory function with code, message, action, path.

**Why It Matters**: Consistent error handling; actionable user guidance.

**Solution**:
```typescript
export const WorkspaceErrors = {
  notFound: (slug: string) => ({
    code: 'E074',
    message: `Workspace '${slug}' not found`,
    action: 'Run: cg workspace list',
    path: '~/.config/chainglass/workspaces.json'
  }),
  exists: (slug: string) => ({
    code: 'E075',
    message: `Workspace '${slug}' already exists`,
    action: `Remove existing: cg workspace remove ${slug}`,
    path: '~/.config/chainglass/workspaces.json'
  }),
  // ... E076-E081
};
```

**Action Required**: Create error factory functions; use in all adapter/service error paths.

**Affects Phases**: 1, 2, 3, 4, 5

---

### High Discovery 07: Entity Factory Pattern

**Impact**: High
**Sources**: [I1-01, Constitution §Principle 2]

**What**: Entities use private constructor + static factory methods; enforce invariants in factory.

**Why It Matters**: Prevents invalid entity states; consistent creation pattern.

**Solution**:
```typescript
export class Workspace {
  readonly slug: string;
  readonly name: string;
  readonly path: string;
  readonly createdAt: Date;

  private constructor(slug, name, path, createdAt) { ... }

  static create(input: WorkspaceInput): Workspace {
    const slug = slugify(input.name);
    return new Workspace(slug, input.name, input.path, new Date());
  }

  // No fromJSON() - adapter handles deserialization via create()
  toJSON(): WorkspaceJSON { ... }
}
```

**Action Required**: Copy pattern from Workflow entity; include slug generation. Adapter handles JSON deserialization.

**Affects Phases**: 1, 3

---

### High Discovery 08: DI Container Registration Pattern

**Impact**: High
**Sources**: [I1-05, Constitution §Anti-Patterns]

**What**: Use useFactory pattern; child containers for test isolation; separate prod/test container functions.

**Why It Matters**: RSC compatible (no decorators); test isolation; swappable implementations.

**Solution**:
```typescript
export function createWorkspaceProductionContainer(): DependencyContainer {
  const child = container.createChildContainer();

  child.register<IWorkspaceAdapter>(TOKENS.WORKSPACE_ADAPTER, {
    useFactory: (c) => new WorkspaceAdapter(
      c.resolve(SHARED_TOKENS.FILESYSTEM),
      c.resolve(SHARED_TOKENS.PATH_RESOLVER)
    ),
  });

  return child;
}
```

**Action Required**: Add workspace tokens; create container functions; wire up in CLI and Web.

**Affects Phases**: 4, 5, 6

---

### Medium Discovery 09: User Config Directory Permissions

**Impact**: Medium
**Sources**: [R1-01]

**What**: `~/.config/chainglass/` may not exist or be writable; need pre-flight checks.

**Why It Matters**: First-time users need directory creation; permission errors need clear guidance.

**Solution**:
```typescript
async ensureConfigDir(): Promise<Result<void>> {
  const dir = this.getUserConfigDir();
  try {
    await this.fs.mkdir(dir, { recursive: true });
    // Test write capability
    const testFile = path.join(dir, '.write-test');
    await this.fs.writeFile(testFile, '');
    await this.fs.unlink(testFile);
    return ok();
  } catch (e) {
    return err(E080, `Cannot create config: ${e.message}`,
      'Ensure ~/.config is writable: chmod 755 ~/.config');
  }
}
```

**Action Required**: Check on first registry write; provide clear remediation.

**Affects Phases**: 1

---

### Medium Discovery 10: Web API Route Pattern

**Impact**: Medium
**Sources**: [I1-07]

**What**: Web routes use `dynamic = 'force-dynamic'`, Zod validation, lazy container resolution.

**Why It Matters**: Server-side data; consistent validation; DI integration.

**Solution**:
```typescript
export const dynamic = 'force-dynamic';

const AddWorkspaceSchema = z.object({
  name: z.string().min(1),
  path: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const body = await req.json();
  const validated = AddWorkspaceSchema.parse(body);

  const container = getContainer();
  const service = container.resolve(TOKENS.WORKSPACE_SERVICE);

  const result = await service.add(validated.name, validated.path);
  return NextResponse.json(result, { status: 201 });
}
```

**Action Required**: Follow pattern for workspace and sample routes.

**Affects Phases**: 6

---

## Testing Philosophy

### Testing Approach

**Selected Approach**: Full TDD
**Rationale**: User specified TDD-first headless architecture; all logic testable without UI

### Test-Driven Development

- Write tests FIRST (RED)
- Implement minimal code (GREEN)
- Refactor for quality (REFACTOR)

### Test Documentation

Every test includes:
```typescript
/*
Test Doc:
- Why: [business/bug/regression reason]
- Contract: [plain-English invariant]
- Usage Notes: [how to call/configure]
- Quality Contribution: [what failure catches]
- Worked Example: [inputs/outputs]
*/
```

### Mock Usage

**Policy**: Fakes Only (no vi.mock/vi.fn per R-TEST-007)
- MUST use full fake implementations
- MUST follow three-part API: State Setup, State Inspection, Error Injection
- MUST provide reset() helper for test isolation
- MUST run contract tests against both fake and real

### Verification Commands

Run these commands to verify quality gates at any phase:

```bash
# Quick check (recommended before each commit)
just fft                    # Fix, Format, Test

# Full quality suite (required before phase completion)
just check                  # Runs: lint, typecheck, test

# Individual checks
just test                   # Run all tests
just typecheck              # TypeScript strict mode
just lint                   # Biome linter
just build                  # Build all packages

# Package-specific tests
pnpm test --filter @chainglass/workflow    # Workflow package only
pnpm test --filter @chainglass/cli         # CLI package only
pnpm test --filter @chainglass/web         # Web package only
```

**Phase Completion Gate**: All phases require `just check` to pass before marking complete.

---

## Implementation Phases

### Phase 1: Workspace Entity + Registry Adapter + Contract Tests

**Objective**: Create foundational Workspace entity, registry adapter interface, fake implementation, and contract tests.

**Deliverables**:
- Workspace entity with factory methods and toJSON()
- IWorkspaceAdapter interface for registry operations
- FakeWorkspaceAdapter with three-part API
- WorkspaceAdapter (real) for ~/.config/chainglass/workspaces.json
- Contract tests verifying fake-real parity
- Error codes E074-E081 with factory functions

**Dependencies**: None (foundational phase)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Config dir permissions | Low | High | Pre-flight check, clear error E080 |
| Path validation edge cases | Medium | Medium | Comprehensive unit tests |

### Tasks (Full TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 1.1 | [ ] | Define Workspace entity interface and WorkspaceJSON type | 1 | Types compile, match spec | - | `packages/workflow/src/entities/workspace.ts` |
| 1.2 | [ ] | Write unit tests for Workspace.create() factory | 2 | Tests cover: slug generation, required fields, defaults | - | TDD: tests first |
| 1.3 | [ ] | Implement Workspace entity with factory methods | 2 | All 1.2 tests pass | - | Private constructor pattern |
| 1.4 | [ ] | Write unit tests for Workspace.toJSON() | 2 | Tests cover: serialization, Date→ISO, undefined→null | - | |
| 1.5 | [ ] | Implement toJSON() | 1 | All 1.4 tests pass | - | No fromJSON - adapter handles |
| 1.6 | [ ] | Define IWorkspaceAdapter interface | 1 | Interface compiles, documents methods | - | `packages/workflow/src/interfaces/workspace-adapter.interface.ts` |
| 1.7 | [ ] | Create workspace error codes (E074-E081) with factory functions | 2 | Each error has code, message, action, path | - | `packages/workflow/src/errors/workspace-errors.ts` |
| 1.8 | [ ] | Write contract tests for IWorkspaceAdapter | 3 | Tests cover: load, save, list, remove, exists | - | `test/contracts/workspace-adapter.contract.test.ts` |
| 1.9 | [ ] | Implement FakeWorkspaceAdapter with three-part API | 2 | Contract tests pass, state setup/inspection/error injection works | - | `packages/workflow/src/fakes/fake-workspace-adapter.ts` |
| 1.10 | [ ] | Implement WorkspaceAdapter (real) with JSON file I/O | 3 | Contract tests pass against real adapter | - | `packages/workflow/src/adapters/workspace.adapter.ts` |
| 1.11 | [ ] | Add path validation (absolute, no traversal, tilde expansion) | 2 | Security tests pass, E076/E077 returned for invalid paths | - | |
| 1.12 | [ ] | Add config directory creation with permission check | 2 | E080 returned if can't write, creates dir if missing | - | |

### Test Examples

```typescript
describe('Workspace entity', () => {
  describe('create()', () => {
    it('should generate slug from name', () => {
      /*
      Test Doc:
      - Why: Slugs are URL-safe identifiers used for lookups
      - Contract: Workspace.create() generates slug from name (lowercase, hyphenated)
      - Usage Notes: Name "My Project" → slug "my-project"
      - Quality Contribution: Prevents invalid slugs in registry
      - Worked Example: create({ name: "My Project", path: "/tmp/test" }) → slug: "my-project"
      */
      const ws = Workspace.create({ name: 'My Project', path: '/tmp/test' });
      expect(ws.slug).toBe('my-project');
    });
  });
});
```

### Non-Happy-Path Coverage
- [ ] Invalid path (relative, contains ..)
- [ ] Slug collision handling
- [ ] Registry file corrupt JSON
- [ ] Permission denied on config dir

### Acceptance Criteria
- [ ] All entity tests passing
- [ ] Contract tests pass for both Fake and Real adapters
- [ ] Error codes E074-E081 implemented with factories
- [ ] Path validation rejects invalid paths

---

### Phase 2: WorkspaceContext Resolution + Worktree Discovery

**Objective**: Implement WorkspaceContext creation from paths and git worktree discovery.

**Deliverables**:
- WorkspaceContext interface
- resolveFromPath() to find workspace from CWD
- Git worktree detection with graceful fallback
- Worktree info parsing

**Dependencies**: Phase 1 complete

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Git version variations | Low | Medium | Version detection, fallback |
| Git not installed | Low | Low | Graceful degradation |

### Tasks (Full TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 2.1 | [ ] | Define WorkspaceContext interface and Worktree type | 1 | Types compile, match dossier | - | |
| 2.2 | [ ] | Write tests for resolveFromPath() with registered workspace | 2 | Tests cover: CWD in workspace, nested path | - | |
| 2.3 | [ ] | Write tests for resolveFromPath() with unregistered path | 1 | Returns null for unregistered | - | |
| 2.4 | [ ] | Implement resolveFromPath() in WorkspaceService | 2 | All resolution tests pass | - | |
| 2.5 | [ ] | Write tests for git worktree detection | 2 | Tests cover: git available, git missing, old version | - | Mock git commands |
| 2.6 | [ ] | Write tests for git worktree list parsing | 2 | Tests cover: --porcelain format, branch extraction | - | |
| 2.7 | [ ] | Implement detectWorktrees() with version check | 3 | All worktree tests pass, graceful fallback works | - | |
| 2.8 | [ ] | Write tests for worktree path to main repo resolution | 2 | Tests cover: in worktree, in main repo | - | |
| 2.9 | [ ] | Implement getMainRepoPath() using git rev-parse | 2 | Tests pass, returns main repo for worktrees | - | |
| 2.10 | [ ] | Add hasGit detection for workspace info | 1 | WorkspaceInfo.hasGit reflects .git presence | - | |

### Test Examples

```typescript
describe('WorkspaceContext resolution', () => {
  it('should resolve context from CWD in registered workspace', async () => {
    /*
    Test Doc:
    - Why: CLI commands resolve workspace from current directory
    - Contract: resolveFromPath() returns WorkspaceContext when CWD is in registered workspace
    - Usage Notes: CWD /home/user/project/src → workspace "project"
    - Quality Contribution: Enables seamless CLI experience without explicit --workspace
    - Worked Example: CWD="/home/jak/substrate/014-workspaces/src" → slug="chainglass"
    */
    const ctx = await service.resolveFromPath('/home/jak/substrate/014-workspaces/src');
    expect(ctx?.slug).toBe('chainglass');
    expect(ctx?.worktreePath).toBe('/home/jak/substrate/014-workspaces');
  });
});
```

### Acceptance Criteria
- [ ] WorkspaceContext resolved from any path in workspace
- [ ] Worktrees discovered for git repos
- [ ] Graceful fallback when git unavailable
- [ ] E079 error for explicit git failures

---

### Phase 3: Sample Domain (Exemplar)

**Objective**: Implement Sample domain to validate workspace data model patterns before real domains.

**Deliverables**:
- Sample entity with CRUD
- WorkspaceDataAdapterBase class
- ISampleAdapter interface
- FakeSampleAdapter with three-part API
- SampleAdapter (real)
- Contract tests for sample adapter

**Dependencies**: Phase 2 complete

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Data directory creation | Low | Medium | ensureStructure() before writes |

### Tasks (Full TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 3.1 | [ ] | Define Sample entity interface | 1 | Types compile | - | `packages/workflow/src/entities/sample.ts` |
| 3.2 | [ ] | Write tests for Sample.create() | 1 | Tests cover: slug gen, timestamps | - | |
| 3.3 | [ ] | Implement Sample entity | 1 | Tests pass | - | |
| 3.4 | [ ] | Define ISampleAdapter interface | 1 | Interface compiles | - | `packages/workflow/src/interfaces/sample-adapter.interface.ts` |
| 3.5 | [ ] | Implement WorkspaceDataAdapterBase | 3 | Base class compiles, provides common methods | - | `packages/workflow/src/adapters/workspace-data-adapter-base.ts` |
| 3.6 | [ ] | Write contract tests for ISampleAdapter | 3 | Tests cover: load, save, list, delete, exists | - | `test/contracts/sample-adapter.contract.test.ts` |
| 3.7 | [ ] | Implement FakeSampleAdapter | 2 | Contract tests pass, three-part API works | - | `packages/workflow/src/fakes/fake-sample-adapter.ts` |
| 3.8 | [ ] | Implement SampleAdapter extending base | 2 | Contract tests pass against real adapter | - | `packages/workflow/src/adapters/sample.adapter.ts` |
| 3.9 | [ ] | Test data isolation between worktrees | 2 | Different WorkspaceContexts have isolated data | - | |
| 3.10 | [ ] | Test ensureStructure() creates directories | 1 | .chainglass/data/samples/ created on first write | - | |

### Acceptance Criteria
- [ ] Sample CRUD works with WorkspaceContext
- [ ] Data stored in `<worktree>/.chainglass/data/samples/`
- [ ] Contract tests pass for both adapters
- [ ] WorkspaceDataAdapterBase reusable for future domains

---

### Phase 4: Service Layer + DI Integration

**Objective**: Implement WorkspaceService and SampleService with DI container integration.

**Deliverables**:
- IWorkspaceService interface
- WorkspaceService implementation
- ISampleService interface
- SampleService implementation
- DI tokens and container functions
- Service unit tests using fakes

**Dependencies**: Phase 3 complete

### Tasks (Full TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 4.1 | [ ] | Define IWorkspaceService interface | 1 | Interface compiles, matches dossier | - | `packages/workflow/src/interfaces/workspace-service.interface.ts` |
| 4.2 | [ ] | Write tests for WorkspaceService.add() | 2 | Tests cover: success, duplicate slug, invalid path | - | Use FakeWorkspaceAdapter |
| 4.3 | [ ] | Write tests for WorkspaceService.list() | 1 | Tests cover: empty, multiple | - | |
| 4.4 | [ ] | Write tests for WorkspaceService.getInfo() with worktrees | 2 | Tests cover: no git, with worktrees | - | |
| 4.5 | [ ] | Implement WorkspaceService | 3 | All service tests pass | - | `packages/workflow/src/services/workspace.service.ts` |
| 4.6 | [ ] | Define ISampleService interface | 1 | Interface compiles | - | |
| 4.7 | [ ] | Write tests for SampleService CRUD | 2 | Tests cover: add, list, get, delete | - | Use FakeSampleAdapter |
| 4.8 | [ ] | Implement SampleService | 2 | All service tests pass | - | `packages/workflow/src/services/sample.service.ts` |
| 4.9 | [ ] | Add WORKSPACE_DI_TOKENS | 1 | Tokens defined | - | `packages/workflow/src/di-tokens.ts` |
| 4.10 | [ ] | Create workspace container functions | 2 | Production and test containers work | - | `packages/workflow/src/container.ts` |
| 4.11 | [ ] | Export new types from package index | 1 | Types importable from @chainglass/workflow | - | |

### Acceptance Criteria
- [ ] WorkspaceService fully tested with fakes
- [ ] SampleService fully tested with fakes
- [ ] DI containers properly wire dependencies
- [ ] Services never throw, return Result types

---

### Phase 5: CLI Commands

**Objective**: Implement CLI commands for workspace and sample management.

**Deliverables**:
- `cg workspace add/list/remove/info` commands
- `cg sample add/list/info/delete` commands
- `--worktree` flag for context override
- `--json` flag for machine-readable output

**Dependencies**: Phase 4 complete

### Tasks (Full TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 5.1 | [ ] | Create workspace command group structure | 1 | `cg workspace` shows subcommands | - | `apps/cli/src/commands/workspace.command.ts` |
| 5.2 | [ ] | Implement `cg workspace add <name> <path>` | 2 | Adds workspace, shows confirmation | - | |
| 5.3 | [ ] | Implement `cg workspace list [--json]` | 2 | Lists workspaces, JSON output works | - | |
| 5.4 | [ ] | Implement `cg workspace info <slug>` | 2 | Shows workspace details + worktrees | - | |
| 5.5 | [ ] | Implement `cg workspace remove <slug>` | 2 | Removes from registry, shows confirmation | - | |
| 5.6 | [ ] | Add `--allow-worktree` flag for add | 1 | Overrides worktree warning | - | AC-05 |
| 5.7 | [ ] | Create sample command group structure | 1 | `cg sample` shows subcommands | - | `apps/cli/src/commands/sample.command.ts` |
| 5.8 | [ ] | Implement `cg sample add <name> --content <text>` | 2 | Creates sample in current worktree | - | |
| 5.9 | [ ] | Implement `cg sample list [--json]` | 1 | Lists samples in current worktree | - | |
| 5.10 | [ ] | Implement `cg sample info <slug>` | 1 | Shows sample details | - | |
| 5.11 | [ ] | Implement `cg sample delete <slug>` | 1 | Deletes sample | - | |
| 5.12 | [ ] | Add `--worktree <path>` flag to sample commands | 2 | Overrides CWD-based context | - | AC-23 |
| 5.13 | [ ] | Register commands in main CLI | 1 | Commands accessible | - | |
| 5.14 | [ ] | Write CLI integration tests | 2 | E2E tests for key flows | - | |

### Acceptance Criteria
- [ ] All workspace commands work (AC-01 through AC-06)
- [ ] All sample commands work (AC-10 through AC-13)
- [ ] `--worktree` override works (AC-23)
- [ ] Error messages include E074-E081 codes

---

### Phase 6: Web UI

**Objective**: Implement web UI with workspaces in left menu and sample CRUD pages.

**Deliverables**:
- Workspaces section in left menu
- Workspace list with worktree expansion
- Worktree context selection
- Sample list/create/delete pages
- API routes for workspace and sample operations

**Dependencies**: Phase 5 complete

### Tasks (Full TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 6.1 | [ ] | Create `/api/workspaces` route (GET, POST) | 2 | List and add workspaces via API | - | `apps/web/app/api/workspaces/route.ts` |
| 6.2 | [ ] | Create `/api/workspaces/[slug]` route (GET, DELETE) | 2 | Get info and remove workspace | - | |
| 6.3 | [ ] | Create `/api/workspaces/[slug]/samples` route (GET, POST) | 2 | List and add samples for worktree | - | |
| 6.4 | [ ] | Create `/api/workspaces/[slug]/samples/[sampleSlug]` route (DELETE) | 1 | Delete sample | - | |
| 6.5 | [ ] | Add "Workspaces" nav item to navigation-utils.ts | 1 | Shows in left menu | - | AC-14 |
| 6.6 | [ ] | Create WorkspaceNav component with expansion | 3 | Shows workspaces, expands to worktrees | - | `apps/web/src/components/workspaces/workspace-nav.tsx` |
| 6.7 | [ ] | Integrate WorkspaceNav in layout left menu | 2 | Workspaces section visible on all pages | - | AC-14, AC-15 |
| 6.8 | [ ] | Create /workspaces page (list view) | 2 | Shows all workspaces with add form | - | `apps/web/app/(dashboard)/workspaces/page.tsx` |
| 6.9 | [ ] | Create /workspaces/[slug] page (detail view) | 2 | Shows workspace info and worktrees | - | |
| 6.10 | [ ] | Create worktree context state management | 2 | Selected worktree persists in URL | - | AC-16 |
| 6.11 | [ ] | Create /workspaces/[slug]/samples page | 2 | Lists samples for selected worktree | - | AC-19 |
| 6.12 | [ ] | Add sample create form | 2 | Creates sample via API | - | AC-20 |
| 6.13 | [ ] | Add sample delete action | 1 | Deletes sample via API | - | AC-21 |
| 6.14 | [ ] | Implement add workspace form | 2 | Adds workspace via API | - | AC-17 |
| 6.15 | [ ] | Implement remove workspace action | 1 | Removes workspace via API | - | AC-18 |

### Acceptance Criteria
- [ ] Workspaces appear in left menu (AC-14)
- [ ] Worktrees expandable (AC-15)
- [ ] Context selection works (AC-16)
- [ ] Sample CRUD works in web (AC-19, AC-20, AC-21)
- [ ] Server-side data (browser refresh works)

---

### Phase 7: Documentation

**Objective**: Document workspace feature for users and developers.

**Deliverables**:
- README.md workspace section
- docs/how/workspaces/ detailed guides

**Dependencies**: Phase 6 complete

### Tasks (Lightweight Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 7.1 | [ ] | Survey existing docs/how/ structure | 1 | Document placement decision | - | |
| 7.2 | [ ] | Update README.md with workspace quick-start | 2 | Basic commands documented | - | |
| 7.3 | [ ] | Create docs/how/workspaces/1-overview.md | 2 | Concepts and data model explained | - | |
| 7.4 | [ ] | Create docs/how/workspaces/2-cli-usage.md | 2 | All CLI commands documented | - | |
| 7.5 | [ ] | Create docs/how/workspaces/3-web-ui.md | 2 | Web UI usage documented | - | |
| 7.6 | [ ] | Create docs/how/workspaces/4-adding-domains.md | 2 | How to add new domains (using Sample template) | - | |

### Acceptance Criteria
- [ ] README has quick-start section
- [ ] Detailed guides in docs/how/workspaces/
- [ ] Examples are tested and working

---

## Cross-Cutting Concerns

### Security Considerations

- **Path validation**: All paths through IPathResolver; reject traversal
- **Input validation**: Zod schemas for API requests
- **No secrets in registry**: Only paths, names, timestamps

### Observability

- **Logging**: Use ILogger for all operations
- **Errors**: All errors include E0XX codes
- **Metrics**: Count workspace add/remove operations

### Documentation

- **Location**: Hybrid (README + docs/how/workspaces/)
- **Audience**: CLI users (quick reference), developers (detailed guides)
- **Maintenance**: Update when CLI/API changes

---

## Complexity Tracking

| Component | CS | Label | Breakdown (S,I,D,N,F,T) | Justification | Mitigation |
|-----------|-----|-------|------------------------|---------------|------------|
| WorkspaceDataAdapterBase | 3 | Medium | S=1,I=0,D=1,N=1,F=0,T=1 | Base class for all domain adapters | Comprehensive unit tests |
| Git worktree detection | 3 | Medium | S=1,I=1,D=0,N=1,F=0,T=1 | External CLI, version variations | Fallback strategy |
| Web UI left menu | 3 | Medium | S=2,I=0,D=0,N=1,F=0,T=1 | Cross-cutting UI change | Incremental addition |

---

## Progress Tracking

### Phase Completion Checklist

- [x] Phase 1: Workspace Entity + Registry Adapter - COMPLETE (2026-01-27)
- [ ] Phase 2: WorkspaceContext Resolution - NOT STARTED
- [ ] Phase 3: Sample Domain - NOT STARTED
- [ ] Phase 4: Service Layer + DI - NOT STARTED
- [ ] Phase 5: CLI Commands - NOT STARTED
- [ ] Phase 6: Web UI - NOT STARTED
- [ ] Phase 7: Documentation - NOT STARTED

### STOP Rule

**IMPORTANT**: This plan must be validated before creating tasks. After writing this plan:
1. Run `/plan-4-complete-the-plan` to validate readiness
2. Only proceed to `/plan-5-phase-tasks-and-brief` after validation passes

---

## Change Footnotes Ledger

**NOTE**: This section will be populated during implementation by plan-6a-update-progress.

**Footnote Numbering Authority**: plan-6a-update-progress is the single source of truth for footnote numbering.

**Initial State**:
```markdown
[^1]: [To be added during implementation via plan-6a]
[^2]: [To be added during implementation via plan-6a]
...
```
