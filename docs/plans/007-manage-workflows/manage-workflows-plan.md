# Multi-Workflow Management System Implementation Plan

**Plan Version**: 1.1.0
**Created**: 2026-01-24
**Spec**: [./manage-workflows-spec.md](./manage-workflows-spec.md)
**Status**: READY

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Technical Context](#technical-context)
3. [Critical Research Findings](#critical-research-findings)
4. [Testing Philosophy](#testing-philosophy)
5. [Phase 0: Exemplar Creation](#phase-0-exemplar-creation-adr-0002-precondition)
6. [Phase 1: Core IWorkflowRegistry Infrastructure](#phase-1-core-iworkflowregistry-infrastructure)
7. [Phase 2: Checkpoint & Versioning System](#phase-2-checkpoint--versioning-system)
8. [Phase 3: Compose Extension for Versioned Runs](#phase-3-compose-extension-for-versioned-runs)
9. [Phase 4: Init Command with Starter Templates](#phase-4-init-command-with-starter-templates)
10. [Phase 5: CLI Commands](#phase-5-cli-commands)
11. [Phase 6: Documentation & Rollout](#phase-6-documentation--rollout)
12. [Cross-Cutting Concerns](#cross-cutting-concerns)
13. [Complexity Tracking](#complexity-tracking)
14. [Progress Tracking](#progress-tracking)
15. [ADR Ledger](#adr-ledger)
16. [Deviation Ledger](#deviation-ledger)
17. [Change Footnotes Ledger](#change-footnotes-ledger)

---

## Executive Summary

**Problem Statement**: Chainglass currently supports a single flat run structure with no template versioning, making it difficult for teams to manage multiple workflow templates, track template evolution, and ensure reproducible runs from specific template versions.

**Solution Approach**:
- Introduce multi-workflow template management with `current/` and `checkpoints/` folder semantics
- Implement explicit checkpoint-based versioning (ordinal + content hash)
- Extend `compose()` to require checkpoints and use versioned run paths
- Add `cg init` command for project setup with bundled starter templates
- Provide complete CLI workflow management commands

**Expected Outcomes**:
- Teams can manage multiple workflow templates in `.chainglass/workflows/<slug>/`
- All runs are traceable to specific template checkpoints
- New projects get up and running quickly with `cg init`
- Template evolution is tracked through immutable checkpoints

**Success Metrics**:
- All 24 acceptance criteria from spec pass
- Contract tests verify Fake/Real implementation parity
- Integration tests cover full compose workflow with versioned paths

---

## Technical Context

### Current System State

The existing `WorkflowService.compose()` method:
- Resolves templates from `.chainglass/templates/` or `~/.config/chainglass/templates/`
- Creates flat run folders at `.chainglass/runs/run-YYYY-MM-DD-NNN/`
- Tracks template via `template_path` field in `wf-status.json`
- No versioning, no checkpoints, no multi-workflow organization

### Integration Requirements

| Integration Point | Current State | Required Change |
|-------------------|---------------|-----------------|
| WorkflowService.compose() | Flat runs, path-based templates | Versioned paths, checkpoint resolution |
| wf-status.json | Basic workflow metadata | Add slug, version_hash, checkpoint_comment |
| CLI commands | Only `cg wf compose` | Add `cg init`, `cg workflow *` suite |
| Output adapters | Commands for compose/phase/message | Add workflow.* command formatters |
| DI container | Manual instantiation in CLI | Register IWorkflowRegistry |

### Constraints and Limitations

1. **IFileSystem lacks atomic rename** - Must use content-hash naming for atomicity (S2-03)
2. **No IHashGenerator interface** - Must create one for checkpoint content hashing (S2-04)
3. **CLI DI violation exists** - Known TODOs for container integration (S4-04)
4. **Error code E031 collision** - PhaseService uses E031 (PRIOR_NOT_FINALIZED); need resolution

### Assumptions

| ID | Assumption | Validation |
|----|------------|------------|
| A1 | Templates < 1MB typical | Acceptable copy overhead |
| A2 | Single-user local dev primary use case | No concurrency concerns |
| A3 | Users prefer explicit versioning | Matches git mental model |
| A4 | Clean break from legacy runs acceptable | New system, no migration |

---

## Critical Research Findings

### CRITICAL DISCOVERY 01: Error Code E031 Collision
**Impact**: Critical
**Sources**: [S1-02, S3-02]
**Problem**: PhaseService already uses E031 for PRIOR_NOT_FINALIZED. Spec defines E031 as VERSION_NOT_FOUND.
**Solution**: Reassign workflow registry error codes to E033-E039 range:
- E030: WORKFLOW_NOT_FOUND (per spec)
- E033: VERSION_NOT_FOUND (was E031)
- E034: NO_CHECKPOINT (was E032)

**Action Required**: Define WorkflowRegistryErrorCodes in new range, update spec documentation.
**Affects Phases**: Phase 1, Phase 2

---

### CRITICAL DISCOVERY 02: IFileSystem Lacks Atomic Rename
**Impact**: Critical
**Sources**: [S2-03]
**Problem**: No `rename()` or `move()` in IFileSystem interface. Atomic checkpoint creation requires workaround.
**Solution**: Use content-hash based naming pattern:
1. Generate hash before writing
2. Create checkpoint folder with final name (`v<NNN>-<hash>/`)
3. Write all files directly to final location
4. On failure, clean up incomplete folder

```typescript
// ✅ CORRECT - Deterministic naming, no rename needed
const hash = await hashGenerator.sha256(content);
const checkpointDir = `checkpoints/v${ordinal}-${hash}`;
await fs.mkdir(checkpointDir, { recursive: true });
await fs.writeFile(`${checkpointDir}/wf.yaml`, content);
```

**Action Required**: Implement IHashGenerator interface; use hash-first naming pattern.
**Affects Phases**: Phase 2

---

### CRITICAL DISCOVERY 03: workflow.json Creation Lifecycle Undefined
**Impact**: Critical
**Sources**: [S3-01]
**Problem**: Spec defines workflow.json but not when it's created. Three scenarios:
1. Created during `cg init` for bundled templates
2. Created on first `cg workflow checkpoint`
3. Required upfront (error if missing)

**Solution**: Hybrid approach:
- `cg init` creates workflow.json for bundled templates
- First checkpoint auto-generates workflow.json from wf.yaml metadata if missing
- `cg workflow list` requires workflow.json, errors with actionable guidance

**Action Required**: Implement workflow.json auto-generation in checkpoint flow.
**Affects Phases**: Phase 1, Phase 2, Phase 4

---

### CRITICAL DISCOVERY 04: CLI Commands Bypass DI Container
**Impact**: Critical
**Sources**: [S4-04]
**Problem**: All CLI command handlers directly instantiate adapters:
```typescript
// ❌ Current pattern in wf.command.ts, phase.command.ts, message.command.ts
function createWorkflowService(): IWorkflowService {
  const fs = new NodeFileSystemAdapter();  // Direct instantiation!
  // ...
}
```

**Solution**: Create shared CLI container factory in apps/cli/src/lib/container.ts:
```typescript
export function getCliContainer(): DependencyContainer {
  if (!cliContainer) {
    cliContainer = createWorkflowProductionContainer();
  }
  return cliContainer;
}
```

**Action Required**: Refactor CLI commands to use container; register new services.
**Affects Phases**: Phase 1, Phase 5

---

### High Discovery 05: Ordinal Generation Must Handle Gaps
**Impact**: High
**Sources**: [S3-02, S1-02]
**Problem**: Checkpoints may have gaps (v001, v003, v004 - missing v002). Next ordinal must be max+1.
**Solution**: Follow existing pattern in WorkflowService.getNextRunOrdinal():
```typescript
const ordinals = entries.filter(match).map(extractOrdinal);
return ordinals.length === 0 ? 1 : Math.max(...ordinals) + 1;
```

**Action Required**: Implement getNextCheckpointOrdinal() following run ordinal pattern.
**Affects Phases**: Phase 2

---

### High Discovery 06: Bundled Templates Need npm Packaging
**Impact**: High
**Sources**: [S3-04]
**Problem**: Templates must be bundled in npm package for offline `cg init`. Current build doesn't include templates.
**Solution**:
1. Create `apps/cli/assets/templates/` directory
2. Update esbuild.config.ts to copy assets to dist/
3. Use `import.meta.url` to resolve template paths at runtime

**Action Required**: Create template bundling infrastructure; update build config.
**Affects Phases**: Phase 4

---

### High Discovery 07: Service Dependencies Must Use Interfaces Only
**Impact**: High
**Sources**: [S1-01, S4-01]
**Problem**: IWorkflowRegistry must follow established constructor injection pattern.
**Solution**: Constructor accepts only interfaces:
```typescript
export class WorkflowRegistryService implements IWorkflowRegistry {
  constructor(
    private readonly fs: IFileSystem,
    private readonly pathResolver: IPathResolver,
    private readonly yamlParser: IYamlParser,
    private readonly hashGenerator: IHashGenerator,  // NEW interface
  ) {}
}
```

**Action Required**: Create IHashGenerator interface and implementations.
**Affects Phases**: Phase 1, Phase 2

---

### High Discovery 08: Result Objects Never Throw
**Impact**: High
**Sources**: [S1-05]
**Problem**: All service methods must return structured results, never throw exceptions.
**Solution**: Follow ComposeResult pattern:
```typescript
export interface CheckpointResult extends BaseResult {
  errors: ResultError[];  // Empty on success
  checkpointPath: string;
  ordinal: number;
  hash: string;
  createdAt: string;
}
```

**Action Required**: Define result types for all registry operations.
**Affects Phases**: Phase 1, Phase 2

---

### High Discovery 09: Output Adapter Requires Command Dispatch
**Impact**: High
**Sources**: [S1-07, S4-07]
**Problem**: New commands need cases in ConsoleOutputAdapter.formatSuccess()/formatFailure().
**Solution**: Add cases for:
- `workflow.list`, `workflow.info`, `workflow.checkpoint`
- `workflow.restore`, `workflow.versions`, `init`

**Action Required**: Update ConsoleOutputAdapter with new command formatters.
**Affects Phases**: Phase 5

---

### Medium Discovery 10: Path Security via IPathResolver
**Impact**: Medium
**Sources**: [S2-05, S3-07]
**Problem**: Slug validation and path traversal prevention required.
**Solution**:
- Validate slug format: `^[a-z][a-z0-9-]*$`
- Use `pathResolver.join()` for safe path composition
- Never use `resolvePath()` with user-provided relative paths

**Action Required**: Add slug validation; use join() consistently.
**Affects Phases**: Phase 1, Phase 2

---

### Medium Discovery 11: Hash Collision Detection
**Impact**: Medium
**Sources**: [S3-03]
**Problem**: Two checkpoints could have identical content hash. Need detection and error.
**Solution**: Before creating checkpoint:
1. Compute content hash
2. Check if `checkpoints/v*-<hash>/` already exists
3. If exists, error E035 (DUPLICATE_CONTENT): "Template unchanged since v00X"

**Action Required**: Add duplicate content detection in checkpoint flow.
**Affects Phases**: Phase 2

---

### Medium Discovery 12: Empty current/ Handling
**Impact**: Medium
**Sources**: [S3-05]
**Problem**: What if `current/` has no wf.yaml or is empty?
**Solution**: Checkpoint requires valid wf.yaml:
- Error E036 (INVALID_TEMPLATE) if current/wf.yaml missing
- Error E021 (YAML_PARSE_ERROR) if wf.yaml invalid
- Warn if referenced phases missing but allow checkpoint

**Action Required**: Validate wf.yaml before checkpoint; log warnings for missing phases.
**Affects Phases**: Phase 2

---

### Medium Discovery 13: wf-status.json Schema Extension
**Impact**: Medium
**Sources**: [S1-08]
**Problem**: wf-status.json needs new fields for versioning.
**Solution**: Extend schema and types:
```typescript
interface WfStatusWorkflow {
  name: string;
  version: string;
  template_path: string;
  slug: string;           // NEW
  version_hash: string;   // NEW
  checkpoint_comment?: string; // NEW
}
```

**Action Required**: Update wf-status.schema.json and WfStatus type.
**Affects Phases**: Phase 3

---

### Low Discovery 14: MCP Tool Exclusion
**Impact**: Low
**Sources**: [S2-07]
**Problem**: Spec requires workflow management NOT exposed via MCP.
**Solution**: Do not register any registry tools in MCP server. Document exclusion.
**Action Required**: No MCP tool registration; add comment explaining exclusion.
**Affects Phases**: Phase 5

---

### Low Discovery 15: Unchanged Template Detection
**Impact**: Low
**Sources**: [S3-08]
**Problem**: User may run checkpoint twice without changes.
**Solution**:
- Compare content hash to latest checkpoint
- Error E035 (DUPLICATE_CONTENT) with guidance
- Allow `--force` to create intentional duplicate

**Action Required**: Add hash comparison; support --force flag.
**Affects Phases**: Phase 2

---

## Testing Philosophy

### Testing Approach
**Selected Approach**: Full TDD
**Rationale**: CS-4 complexity with new services (IWorkflowRegistry), cross-cutting changes, and critical checkpoint/restore operations requires comprehensive test coverage.
**Focus Areas**:
- IWorkflowRegistry service (list, checkpoint, restore, versions operations)
- Checkpoint atomicity (hash-first naming pattern)
- Version ordinal generation
- Run path organization (versioned structure)
- CLI command parsing and output formatting
- Error handling (E030, E033, E034 codes)

### Test-Driven Development
- Write tests FIRST (RED)
- Implement minimal code (GREEN)
- Refactor for quality (REFACTOR)

### Test Documentation (when tests are written)
Every test must include:
```typescript
/*
Test Doc:
- Why: [what business/bug/regression reason this test proves]
- Contract: [plain-English invariant(s) this test asserts]
- Usage Notes: [how a developer should call/configure the API; gotchas]
- Quality Contribution: [what failure this will catch]
- Worked Example: [inputs/outputs summarized for scanning]
*/
```

### Mock Usage
**Policy**: Avoid mocks entirely (per spec)
- Use Fakes (FakeFileSystem, FakeWorkflowRegistry, etc.) following established pattern
- Contract tests ensure Fake and Real implementations behave identically
- Integration tests use real filesystem operations with temp directories
- Fixtures from `dev/examples/wf/` serve as test data (per ADR-0002)

### Test Execution Commands

**Per-Phase Verification**:
```bash
# Run tests for specific phase
just test -- test/unit/workflow/registry*.test.ts   # Phase 1
just test -- test/unit/workflow/checkpoint*.test.ts # Phase 2
just test -- test/unit/workflow/compose*.test.ts    # Phase 3
just test -- test/unit/cli/init*.test.ts            # Phase 4
just test -- test/unit/cli/workflow*.test.ts        # Phase 5

# Run contract tests
just test -- test/contracts/workflow-registry.contract.ts

# Run all tests with coverage
just test -- --coverage --coverage-threshold-lines=80
```

**Build Verification**:
```bash
# Verify TypeScript compiles
just typecheck

# Verify linting passes
just lint

# Verify build succeeds (includes template bundling for Phase 4)
just build

# Verify bundled templates exist (Phase 4)
ls -la apps/cli/dist/assets/templates/
```

**Full Quality Gate**:
```bash
just check   # Runs: typecheck, lint, test, build
```

---

## Phase 0: Exemplar Creation (ADR-0002 Precondition)

**Objective**: Create exemplar files before implementation begins (per ADR-0002 IMP-004).

**Deliverables**:
- Exemplar workflow template in dev/examples/wf/
- Exemplar checkpoint structure
- Exemplar wf-status.json with versioned fields

**Tasks**:

| # | Status | Task | CS | Success Criteria | Log | Notes |
|-----|--------|------|----|------------------|-----|-------|
| 0.1 | [ ] | Create exemplar workflow template | 1 | dev/examples/wf/hello-workflow/ with wf.yaml, workflow.json, phases/ | - | |
| 0.2 | [ ] | Create exemplar checkpoint structure | 1 | dev/examples/wf/hello-workflow/checkpoints/v001-abc123/ with .checkpoint.json | - | |
| 0.3 | [ ] | Create exemplar versioned wf-status.json | 1 | dev/examples/wf/versioned-run/wf-run/wf-status.json with slug, version_hash fields | - | |

**Acceptance Criteria**:
- [ ] Exemplar files exist and are version-controlled
- [ ] Exemplar structures match spec definitions
- [ ] Tests can reference exemplars as fixtures

---

## Phase 1: Core IWorkflowRegistry Infrastructure

**Objective**: Create the foundational IWorkflowRegistry interface, FakeWorkflowRegistry, and DI container integration.

**Deliverables**:
- IWorkflowRegistry interface with list(), info(), getCheckpointDir() methods
- FakeWorkflowRegistry with call capture and presets
- IHashGenerator interface and HashGeneratorAdapter
- WorkflowRegistryErrorCodes (E030, E033-E036)
- DI container registration
- Contract tests for Fake/Real parity

**Dependencies**: None (foundational phase)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Interface design iteration | Medium | Medium | Start with minimal interface, extend in Phase 2 |
| Error code collision discovered | Low | High | Reserve E033-E039 range explicitly |

### Tasks (Full TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|-----|--------|------|----|------------------|-----|-------|
| 1.1 | [ ] | Write tests for IHashGenerator interface | 2 | Tests: sha256("test") returns 64-char hex, same input = same output, different input = different output | - | Create test/unit/shared/hash-generator.test.ts |
| 1.2 | [ ] | Implement IHashGenerator and HashGeneratorAdapter | 2 | Tests from 1.1 pass; uses node:crypto; registered via useFactory pattern (per ADR-0004) | - | packages/shared/src/interfaces/hash-generator.interface.ts, packages/shared/src/adapters/hash-generator.adapter.ts |
| 1.3 | [ ] | Write tests for IWorkflowRegistry.list() | 2 | Tests cover: empty registry, multiple workflows, workflow.json parsing | - | |
| 1.4 | [ ] | Write tests for IWorkflowRegistry.info() | 2 | Tests cover: found, not found (E030), checkpoint count | - | |
| 1.5 | [ ] | Define WorkflowRegistryErrorCodes | 1 | E030, E033-E036 defined with semantic keys | - | packages/workflow/src/services/workflow-registry.service.ts |
| 1.6 | [ ] | Define WorkflowInfo and result types | 2 | ListResult, InfoResult, BaseResult extension | - | packages/shared/src/interfaces/results/ |
| 1.7 | [ ] | Create IWorkflowRegistry interface | 2 | Interface compiles, exports properly | - | packages/workflow/src/interfaces/ |
| 1.8 | [ ] | Create FakeWorkflowRegistry with call capture | 3 | Fake implements full interface, has test helpers | - | packages/workflow/src/fakes/ |
| 1.9 | [ ] | Implement WorkflowRegistryService.list() | 3 | Tests from 1.3 pass using real implementation | - | |
| 1.10 | [ ] | Implement WorkflowRegistryService.info() | 2 | Tests from 1.4 pass | - | |
| 1.11 | [ ] | Add WORKFLOW_REGISTRY token to di-tokens.ts | 1 | Token defined in WORKFLOW_DI_TOKENS | - | packages/shared/src/di-tokens.ts |
| 1.12 | [ ] | Register in createWorkflowProductionContainer | 2 | useFactory pattern, all deps resolved | - | packages/workflow/src/container.ts |
| 1.13 | [ ] | Register in createWorkflowTestContainer | 2 | useValue with FakeWorkflowRegistry | - | |
| 1.14 | [ ] | Write contract tests for registry | 2 | Same tests pass for Fake and Real on 8+ scenarios | - | test/contracts/workflow-registry.contract.ts |
| 1.15 | [ ] | Update package.json exports | 1 | IWorkflowRegistry, FakeWorkflowRegistry, IHashGenerator exported | - | |
| 1.16 | [ ] | Create CLI container factory (ADR-0004 remediation) | 2 | getCliContainer() returns configured container; resolves IWorkflowRegistry | - | apps/cli/src/lib/container.ts |

### Test Examples (Write First!)

```typescript
describe('WorkflowRegistryService.list()', () => {
  let service: WorkflowRegistryService;
  let fakeFs: FakeFileSystem;

  beforeEach(() => {
    fakeFs = new FakeFileSystem();
    service = createTestWorkflowRegistry(fakeFs);
  });

  test('should return empty array when no workflows exist', async () => {
    /*
    Test Doc:
    - Why: Verify graceful handling of empty registry
    - Contract: list() returns empty array when .chainglass/workflows/ is empty
    - Usage Notes: Create workflows dir first if needed
    - Quality Contribution: Prevents null/undefined errors in empty state
    - Worked Example: list('.chainglass/workflows') → []
    */
    fakeFs.setDirectoryContents('.chainglass/workflows', []);

    const result = await service.list('.chainglass/workflows');

    expect(result.errors).toHaveLength(0);
    expect(result.workflows).toEqual([]);
  });

  test('should parse workflow.json for each workflow', async () => {
    /*
    Test Doc:
    - Why: Verify workflow metadata extraction
    - Contract: Each workflow directory with workflow.json becomes WorkflowInfo
    - Usage Notes: workflow.json must be valid JSON
    - Quality Contribution: Ensures list shows correct metadata
    - Worked Example: workflows/hello-wf/workflow.json → WorkflowInfo
    */
    fakeFs.setDirectoryContents('.chainglass/workflows', ['hello-wf', 'analysis-wf']);
    fakeFs.setFileContent('.chainglass/workflows/hello-wf/workflow.json', JSON.stringify({
      slug: 'hello-wf',
      name: 'Hello Workflow',
      description: 'A starter workflow',
      created_at: '2026-01-24T10:00:00Z',
    }));

    const result = await service.list('.chainglass/workflows');

    expect(result.workflows).toHaveLength(2);
    expect(result.workflows[0].slug).toBe('hello-wf');
    expect(result.workflows[0].name).toBe('Hello Workflow');
  });
});
```

### Non-Happy-Path Coverage
- [ ] Registry directory doesn't exist (create or error?)
- [ ] workflow.json missing in workflow directory
- [ ] workflow.json malformed JSON
- [ ] Permission denied reading workflow directory
- [ ] Concurrent list calls (should be safe - read-only)

### Acceptance Criteria
- [ ] All 16 unit tests passing: 3 hash-generator, 5 list(), 4 info(), 4 contract tests
- [ ] Test coverage > 80% for packages/workflow/src/services/workflow-registry.service.ts
- [ ] No mocks used - only FakeFileSystem, FakeWorkflowRegistry with call capture
- [ ] Contract tests verify 8+ scenarios: empty list, single workflow, multiple workflows, not found, malformed JSON, missing workflow.json, checkpoint count, version history
- [ ] All error codes E030, E033-E036 have dedicated error path tests
- [ ] All path operations use IPathResolver.join() - no direct path.join() calls
- [ ] IWorkflowRegistry, IHashGenerator exported from @chainglass/shared
- [ ] getCliContainer() factory created and resolves all registry dependencies
- [ ] `just check` passes (typecheck + lint + test + build)

---

## Phase 2: Checkpoint & Versioning System

**Objective**: Implement checkpoint creation, version ordinal generation, and content hashing.

**Deliverables**:
- WorkflowRegistryService.checkpoint() method
- WorkflowRegistryService.restore() method
- WorkflowRegistryService.versions() method
- Ordinal generation with gap handling
- Content hash generation and collision detection
- workflow.json auto-generation
- .checkpoint.json metadata files

**Dependencies**: Phase 1 must be complete (IWorkflowRegistry infrastructure)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Partial checkpoint on I/O error | Low | High | Hash-first naming; cleanup on failure |
| Hash collision (same content) | Low | Medium | Detect and error with guidance |
| Ordinal overflow (>999) | Very Low | Low | Use 4-digit ordinals if needed |

### Tasks (Full TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|-----|--------|------|----|------------------|-----|-------|
| 2.1 | [ ] | Write tests for ordinal generation | 2 | Tests: empty→1, [v001]→2, [v001,v002,v003]→4, [v001,v003,v004]→5 (gaps), [v005]→6 (skip) | - | |
| 2.2 | [ ] | Write tests for content hash generation | 2 | Tests cover: wf.yaml + schemas, consistent hash | - | |
| 2.3 | [ ] | Write tests for checkpoint creation | 3 | Tests cover: success, empty current, missing wf.yaml | - | |
| 2.4 | [ ] | Write tests for duplicate content detection | 2 | Tests cover: same hash as existing, --force override | - | |
| 2.5 | [ ] | Write tests for workflow.json auto-generation | 2 | Tests cover: missing, present, merge | - | |
| 2.6 | [ ] | Write tests for .checkpoint.json metadata | 2 | Tests cover: ordinal, hash, created_at, comment | - | |
| 2.7 | [ ] | Implement getNextCheckpointOrdinal() | 2 | Tests from 2.1 pass; handles gaps | - | |
| 2.8 | [ ] | Implement generateCheckpointHash() | 2 | Tests from 2.2 pass; sorts files for consistency | - | |
| 2.9 | [ ] | Implement checkpoint() method | 3 | Tests from 2.3 pass; atomic copy pattern | - | |
| 2.10 | [ ] | Implement duplicate detection | 2 | Tests from 2.4 pass; E035 error | - | |
| 2.11 | [ ] | Implement workflow.json auto-generation | 2 | Tests from 2.5 pass | - | |
| 2.12 | [ ] | Implement .checkpoint.json creation | 2 | Tests from 2.6 pass | - | |
| 2.13 | [ ] | Write tests for restore() method | 3 | Tests cover: success, version not found (E033), no checkpoint (E034) | - | |
| 2.14 | [ ] | Write tests for versions() method | 2 | Tests cover: list all, sorted by ordinal | - | |
| 2.15 | [ ] | Implement restore() method | 3 | Tests from 2.13 pass; copies checkpoint to current | - | |
| 2.16 | [ ] | Implement versions() method | 2 | Tests from 2.14 pass | - | |
| 2.17 | [ ] | Update FakeWorkflowRegistry for new methods | 2 | Fake supports checkpoint, restore, versions | - | |
| 2.18 | [ ] | Contract tests for checkpoint/restore | 2 | Same tests pass for Fake and Real | - | |

### Test Examples (Write First!)

```typescript
describe('WorkflowRegistryService.checkpoint()', () => {
  test('should create checkpoint with ordinal and hash', async () => {
    /*
    Test Doc:
    - Why: Core checkpoint creation flow
    - Contract: checkpoint() creates versioned folder with metadata
    - Usage Notes: current/ must have valid wf.yaml
    - Quality Contribution: Ensures checkpoints are properly structured
    - Worked Example: checkpoint('hello-wf') → v001-abc123/
    */
    fakeFs.setFileContent('.chainglass/workflows/hello-wf/current/wf.yaml',
      'name: Hello\nversion: 1.0.0\n');

    const result = await service.checkpoint('hello-wf', {
      workflowsDir: '.chainglass/workflows',
      comment: 'Initial release'
    });

    expect(result.errors).toHaveLength(0);
    expect(result.ordinal).toBe(1);
    expect(result.hash).toMatch(/^[a-f0-9]{8}$/);
    expect(fakeFs.exists(`.chainglass/workflows/hello-wf/checkpoints/v001-${result.hash}`)).toBe(true);
  });

  test('should error E034 when current/ has no wf.yaml', async () => {
    /*
    Test Doc:
    - Why: Prevent checkpoint of invalid template
    - Contract: checkpoint() returns E034 if current/wf.yaml missing
    - Usage Notes: Ensure wf.yaml exists before checkpoint
    - Quality Contribution: Catches misconfigured templates early
    - Worked Example: checkpoint('empty-wf') → E034 NO_VALID_TEMPLATE
    */
    fakeFs.setDirectoryContents('.chainglass/workflows/empty-wf/current', []);

    const result = await service.checkpoint('empty-wf', {
      workflowsDir: '.chainglass/workflows'
    });

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe('E034');
    expect(result.errors[0].action).toContain('wf.yaml');
  });
});
```

### Non-Happy-Path Coverage
- [ ] current/ directory doesn't exist
- [ ] wf.yaml fails schema validation
- [ ] Disk full during copy
- [ ] Permission denied writing checkpoints/
- [ ] Restore with dirty current/ (prompt unless --force)
- [ ] Restore non-existent version

### Acceptance Criteria
- [ ] All 18 unit tests passing: 4 ordinal, 3 hash, 4 checkpoint, 2 duplicate, 2 workflow.json, 3 restore
- [ ] Ordinal generation: empty→1, [v001,v003,v004]→5 (max+1 with gaps), tested with 5 scenarios
- [ ] Content hash: 8-char SHA-256 prefix, deterministic (same content = same hash)
- [ ] Duplicate detection: E035 error includes previous version reference, allows --force override
- [ ] workflow.json auto-generated with slug, name, created_at from wf.yaml metadata
- [ ] .checkpoint.json contains: ordinal (number), hash (string), created_at (ISO8601), comment (optional string)
- [ ] Restore prompts user unless --force; declined restore returns canceled result
- [ ] `just check` passes

---

## Phase 3: Compose Extension for Versioned Runs

**Objective**: Extend WorkflowService.compose() to use checkpoint-based versioned run paths.

**Deliverables**:
- compose() requires checkpoint (error E034 if none)
- compose() resolves checkpoint by ordinal or "latest"
- Run path: `.chainglass/runs/<slug>/<ordinal>-<hash>/<run>/`
- wf-status.json extended with slug, version_hash, checkpoint_comment
- Updated wf-status.schema.json

**Dependencies**: Phase 2 must be complete (checkpoint system)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Breaking existing compose behavior | Medium | High | Feature flag for migration period (optional) |
| Run path too long for some filesystems | Low | Low | Document path length limitations |

### Tasks (Full TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|-----|--------|------|----|------------------|-----|-------|
| 3.1 | [ ] | Write tests for checkpoint resolution | 2 | Tests cover: latest, by ordinal, not found | - | |
| 3.2 | [ ] | Write tests for versioned run path creation | 2 | Tests cover: path format, ordinal in path | - | |
| 3.3 | [ ] | Write tests for wf-status.json extension | 2 | Tests cover: new fields populated correctly | - | |
| 3.4 | [ ] | Write tests for E034 when no checkpoint | 2 | Tests cover: error message, action guidance | - | |
| 3.5 | [ ] | Update wf-status.schema.json | 2 | Schema includes slug, version_hash, checkpoint_comment | - | |
| 3.6 | [ ] | Update WfStatus type definitions | 1 | TypeScript types match schema | - | |
| 3.7 | [ ] | Extend compose() signature | 2 | Accepts checkpoint version parameter | - | |
| 3.8 | [ ] | Implement checkpoint resolution in compose() | 3 | Tests from 3.1 pass | - | |
| 3.9 | [ ] | Implement versioned run path creation | 2 | Tests from 3.2 pass | - | |
| 3.10 | [ ] | Extend wf-status.json creation | 2 | Tests from 3.3 pass | - | |
| 3.11 | [ ] | Implement E034 error handling | 2 | Tests from 3.4 pass | - | |
| 3.12 | [ ] | Update FakeWorkflowService | 2 | Fake supports new compose signature | - | |
| 3.13 | [ ] | Integration test: full compose flow | 3 | Sequence: checkpoint('hello-wf')→compose('hello-wf')→verify runDir matches `.chainglass/runs/hello-wf/v001-<hash>/run-YYYY-MM-DD-001/` | - | |

### Test Examples (Write First!)

```typescript
describe('WorkflowService.compose() with checkpoints', () => {
  test('should create run under versioned path', async () => {
    /*
    Test Doc:
    - Why: Verify versioned run organization
    - Contract: compose() creates run at /<slug>/<version>/<run>/
    - Usage Notes: Checkpoint must exist before compose
    - Quality Contribution: Ensures runs traceable to template versions
    - Worked Example: compose('hello-wf') → runs/hello-wf/v001-abc123/run-2026-01-24-001/
    */
    // Setup: workflow with checkpoint
    setupWorkflowWithCheckpoint(fakeFs, 'hello-wf', 'v001-abc123');

    const result = await service.compose('hello-wf', '.chainglass/runs');

    expect(result.errors).toHaveLength(0);
    expect(result.runDir).toMatch(/\.chainglass\/runs\/hello-wf\/v001-abc123\/run-2026-01-24-001/);
  });

  test('should error E034 when workflow has no checkpoints', async () => {
    /*
    Test Doc:
    - Why: Enforce checkpoint requirement
    - Contract: compose() returns E034 if no checkpoints exist
    - Usage Notes: Run 'cg workflow checkpoint' first
    - Quality Contribution: Prevents running from mutable current/
    - Worked Example: compose('new-wf') with only current/ → E034
    */
    setupWorkflowCurrentOnly(fakeFs, 'new-wf');

    const result = await service.compose('new-wf', '.chainglass/runs');

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe('E034');
    expect(result.errors[0].message).toContain('no checkpoints');
    expect(result.errors[0].action).toContain('cg workflow checkpoint');
  });
});
```

### Non-Happy-Path Coverage
- [ ] Checkpoint directory corrupted/incomplete
- [ ] Version specified doesn't exist
- [ ] Concurrent compose calls to same workflow
- [ ] Runs directory doesn't exist (should create)

### Acceptance Criteria
- [ ] All 13 unit tests passing: 3 resolution, 3 path, 3 wf-status, 2 E034, 2 integration
- [ ] compose() returns E034 (NO_CHECKPOINT) with message "no checkpoints" and action "cg workflow checkpoint <slug>"
- [ ] Run path format: `.chainglass/runs/<slug>/v<NNN>-<hash>/run-YYYY-MM-DD-NNN/`
- [ ] wf-status.json includes: workflow.slug (string), workflow.version_hash (8-char hex), workflow.checkpoint_comment (optional string)
- [ ] wf-status.schema.json updated with new fields; schema validation passes
- [ ] --checkpoint flag accepts ordinal (v001) or full name (v001-abc123); defaults to latest
- [ ] Legacy flat run paths no longer created; all runs use versioned structure
- [ ] `just check` passes

---

## Phase 4: Init Command with Starter Templates

**Objective**: Implement `cg init` command with bundled starter template hydration.

**Deliverables**:
- Bundled starter templates in apps/cli/assets/templates/
- esbuild config updated to bundle templates
- `cg init` command handler
- Non-destructive init (preserves existing workflows)
- Template discovery via import.meta.url

**Dependencies**: Phase 1 must be complete (workflow.json structure)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Template bundling fails in esbuild | Medium | High | Test build process early |
| import.meta.url resolution varies by env | Medium | Medium | Use path.dirname + fileURLToPath pattern |

### Tasks (Full TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|-----|--------|------|----|------------------|-----|-------|
| 4.1 | [ ] | Create starter template structure | 2 | hello-workflow/wf.yaml (name, version, phases), hello-workflow/workflow.json (slug, name, description, created_at), hello-workflow/phases/gather/commands/main.md | - | apps/cli/assets/templates/hello-workflow/ |
| 4.2 | [ ] | Update esbuild.config.ts for assets | 2 | Copy plugin: assets/templates/ → dist/assets/templates/; verify dist/assets/templates/hello-workflow/wf.yaml exists after build | - | |
| 4.3 | [ ] | Write tests for template discovery | 2 | Tests cover: bundled path resolution | - | |
| 4.4 | [ ] | Write tests for init directory creation | 2 | Tests cover: .chainglass/workflows, .chainglass/runs | - | |
| 4.5 | [ ] | Write tests for template hydration | 3 | Tests cover: copy to current/, workflow.json created | - | |
| 4.6 | [ ] | Write tests for non-destructive init | 2 | Tests cover: existing workflow preserved, new added | - | |
| 4.7 | [ ] | Implement getBundledTemplatesPath() | 2 | Tests from 4.3 pass | - | apps/cli/src/lib/templates.ts |
| 4.8 | [ ] | Implement createDirectoryStructure() | 2 | Tests from 4.4 pass | - | |
| 4.9 | [ ] | Implement hydrateStarterTemplates() | 3 | Tests from 4.5 pass | - | |
| 4.10 | [ ] | Implement collision detection | 2 | Tests from 4.6 pass; skips existing | - | |
| 4.11 | [ ] | Create init command handler | 2 | Command registered, calls hydration | - | apps/cli/src/commands/init.command.ts |
| 4.12 | [ ] | Integration test: cg init | 2 | Full init creates structure and templates | - | |

### Test Examples (Write First!)

```typescript
describe('cg init', () => {
  test('should create .chainglass directory structure', async () => {
    /*
    Test Doc:
    - Why: Verify project initialization
    - Contract: init creates workflows/ and runs/ directories
    - Usage Notes: Run from project root
    - Quality Contribution: Ensures consistent project setup
    - Worked Example: cg init → .chainglass/{workflows,runs}/
    */
    const result = await handleInit({ projectDir: tempDir });

    expect(result.errors).toHaveLength(0);
    expect(fakeFs.exists(`${tempDir}/.chainglass/workflows`)).toBe(true);
    expect(fakeFs.exists(`${tempDir}/.chainglass/runs`)).toBe(true);
  });

  test('should hydrate bundled starter templates', async () => {
    /*
    Test Doc:
    - Why: Verify starter template installation
    - Contract: init copies bundled templates to workflows/<slug>/current/
    - Usage Notes: Templates bundled in npm package
    - Quality Contribution: Gets users started quickly
    - Worked Example: cg init → workflows/hello-workflow/current/wf.yaml
    */
    const result = await handleInit({ projectDir: tempDir });

    expect(fakeFs.exists(`${tempDir}/.chainglass/workflows/hello-workflow/current/wf.yaml`)).toBe(true);
    expect(fakeFs.exists(`${tempDir}/.chainglass/workflows/hello-workflow/workflow.json`)).toBe(true);
  });

  test('should preserve existing workflows', async () => {
    /*
    Test Doc:
    - Why: Non-destructive initialization
    - Contract: init skips workflows that already exist
    - Usage Notes: Safe to re-run
    - Quality Contribution: Prevents accidental data loss
    - Worked Example: existing hello-workflow → preserved, new added
    */
    fakeFs.setFileContent(`${tempDir}/.chainglass/workflows/hello-workflow/workflow.json`,
      '{"slug":"hello-workflow","name":"Custom"}');

    const result = await handleInit({ projectDir: tempDir });

    expect(result.skipped).toContain('hello-workflow');
    const content = fakeFs.readFile(`${tempDir}/.chainglass/workflows/hello-workflow/workflow.json`);
    expect(content).toContain('Custom'); // Original preserved
  });
});
```

### Non-Happy-Path Coverage
- [ ] Project already initialized (graceful skip)
- [ ] Permission denied creating directories
- [ ] Bundled templates not found (corrupted installation)
- [ ] Template copy fails mid-way

### Acceptance Criteria
- [ ] All 12 tests passing: 2 discovery, 2 directory, 3 hydration, 2 non-destructive, 2 collision, 1 integration
- [ ] Bundled templates in dist/assets/templates/hello-workflow/ after `just build`
- [ ] cg init creates: .chainglass/workflows/, .chainglass/runs/
- [ ] Existing workflows preserved: re-running init skips workflows that exist
- [ ] workflow.json created for each starter: slug, name, description, created_at fields
- [ ] Build verification: `ls apps/cli/dist/assets/templates/hello-workflow/wf.yaml` succeeds
- [ ] `just check` passes

---

## Phase 5: CLI Commands

**Objective**: Implement all workflow management CLI commands.

**Deliverables**:
- `cg workflow list` command
- `cg workflow info <slug>` command
- `cg workflow checkpoint <slug>` command
- `cg workflow restore <slug> <version>` command
- `cg workflow versions <slug>` command
- Output adapter cases for all commands
- --json flag support for all commands

**Dependencies**: Phases 1, 2, 3 must be complete

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Command naming conflicts | Low | Low | Use 'workflow' subcommand group |
| Output formatting inconsistent | Medium | Medium | Follow existing adapter patterns exactly |

### Tasks (Full TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|-----|--------|------|----|------------------|-----|-------|
| 5.1 | [ ] | Write tests for workflow list command | 2 | Tests cover: table output, JSON output, empty | - | |
| 5.2 | [ ] | Write tests for workflow info command | 2 | Tests cover: found, not found, version history | - | |
| 5.3 | [ ] | Write tests for workflow checkpoint command | 2 | Tests cover: success, --comment, --force | - | |
| 5.4 | [ ] | Write tests for workflow restore command | 2 | Tests cover: success, --force, prompt simulation | - | |
| 5.5 | [ ] | Write tests for workflow versions command | 2 | Tests cover: list versions, sort order | - | |
| 5.6 | [ ] | Add ConsoleOutputAdapter cases | 3 | workflow.list, .info, .checkpoint, .restore, .versions | - | |
| 5.7 | [ ] | Add JsonOutputAdapter cases (if needed) | 1 | Generic envelope handles new commands | - | |
| 5.8 | [ ] | Implement registerWorkflowCommands() | 2 | All 5 commands registered with options | - | apps/cli/src/commands/workflow.command.ts |
| 5.9 | [ ] | Implement handleWorkflowList() | 2 | Tests from 5.1 pass | - | |
| 5.10 | [ ] | Implement handleWorkflowInfo() | 2 | Tests from 5.2 pass | - | |
| 5.11 | [ ] | Implement handleWorkflowCheckpoint() | 2 | Tests from 5.3 pass | - | |
| 5.12 | [ ] | Implement handleWorkflowRestore() | 3 | Tests from 5.4 pass; prompts "Restore will overwrite current/ - continue? (y/N)"; --force skips prompt; declined returns canceled | - | |
| 5.13 | [ ] | Implement handleWorkflowVersions() | 2 | Tests from 5.5 pass | - | |
| 5.14 | [ ] | Register in cg.ts createProgram | 1 | Commands appear in help | - | |
| 5.15 | [ ] | Update existing wf compose for new paths | 2 | cg wf compose resolves via IWorkflowRegistry; --checkpoint optional (defaults latest); no checkpoint→E034; uses getCliContainer() | - | |
| 5.16 | [ ] | Integration test: full CLI workflow | 2 | Sequence: cg init→cg workflow checkpoint hello-wf→cg wf compose hello-wf→cg workflow list; all succeed | - | |
| 5.17 | [ ] | Verify MCP tool exclusion (negative test) | 1 | MCP server does NOT expose workflow.list, workflow.checkpoint, etc. (per ADR-0001 NEG-005) | - | |

### Test Examples (Write First!)

```typescript
describe('cg workflow list', () => {
  test('should display table of workflows', async () => {
    /*
    Test Doc:
    - Why: Verify list command output
    - Contract: list displays name, version count, description
    - Usage Notes: Run from project with .chainglass/workflows/
    - Quality Contribution: Ensures discoverability
    - Worked Example: cg workflow list → table with hello-wf, 2 versions
    */
    setupWorkflowsWithCheckpoints(fakeFs, [
      { slug: 'hello-wf', name: 'Hello', checkpoints: 2 },
      { slug: 'analysis-wf', name: 'Analysis', checkpoints: 1 },
    ]);

    const output = await runCommand('workflow', 'list');

    expect(output).toContain('hello-wf');
    expect(output).toContain('Hello');
    expect(output).toContain('2 checkpoints');
  });
});
```

### Non-Happy-Path Coverage
- [ ] No workflows found (helpful message)
- [ ] Invalid slug format in commands
- [ ] Network error (should not happen - local only)
- [ ] Prompt timeout on restore

### Acceptance Criteria
- [ ] All 17 tests passing: 3 list, 3 info, 3 checkpoint, 3 restore, 3 versions, 1 integration, 1 MCP exclusion
- [ ] All 5 workflow commands work: list, info, checkpoint, restore, versions
- [ ] --json flag produces valid JSON with consistent envelope structure
- [ ] Output formatting consistent with existing commands (wf.compose, phase.prepare patterns)
- [ ] Help text accurate: `cg workflow --help` shows all 5 subcommands with descriptions
- [ ] Restore prompts "Restore will overwrite current/ - continue? (y/N)"; skips with --force
- [ ] MCP server does NOT register workflow management tools (verified by negative test)
- [ ] CLI commands use getCliContainer() - no direct adapter instantiation
- [ ] `just check` passes

---

## Phase 6: Documentation & Rollout

**Objective**: Document the feature and prepare for release.

**Deliverables**:
- README.md updated with cg init section
- docs/how/workflows/5-workflow-management.md guide
- Error code documentation
- Migration guide from flat runs (informational)

**Dependencies**: All implementation phases complete

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Documentation drift | Medium | Low | Include doc updates in phase acceptance criteria |
| Examples don't match implementation | Low | Medium | Use real command outputs in docs |

### Tasks (Lightweight Approach for Documentation)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|-----|--------|------|----|------------------|-----|-------|
| 6.1 | [ ] | Survey existing docs/how/ directories | 1 | Document existing structure, identify conflicts | - | |
| 6.2 | [ ] | Update README.md with cg init | 2 | Getting started section includes init | - | |
| 6.3 | [ ] | Create docs/how/workflows/5-workflow-management.md | 3 | 1000+ words covering: template structure, checkpoint workflow, restore flow, error resolution (E030-E036 examples) | - | |
| 6.4 | [ ] | Document error codes E030, E033-E036 | 1 | E030 WORKFLOW_NOT_FOUND, E033 VERSION_NOT_FOUND, E034 NO_CHECKPOINT, E035 DUPLICATE_CONTENT, E036 INVALID_TEMPLATE; each with cause + remediation | - | |
| 6.5 | [ ] | Create migration notes for flat runs | 1 | Informational guide for legacy awareness | - | |
| 6.6 | [ ] | Review documentation for accuracy | 1 | All commands tested, outputs verified | - | |
| 6.7 | [ ] | Run full test suite | 1 | All tests pass, no regressions | - | |

### Acceptance Criteria
- [ ] README.md has cg init section
- [ ] Comprehensive workflow management guide exists
- [ ] All error codes documented
- [ ] No broken links
- [ ] All examples work as documented

---

## Cross-Cutting Concerns

### Security Considerations

- **Path traversal prevention**: All path operations use IPathResolver.join()
- **Slug validation**: Enforce `^[a-z][a-z0-9-]*$` pattern
- **No sensitive data in checkpoints**: Templates are user-authored, no secrets

### Observability

- **Logging**: Use injected ILogger for all operations
- **Error codes**: All errors have unique codes for debugging
- **Result tracing**: Each result includes operation metadata

### Documentation

- **Location**: Hybrid (README + docs/how/)
- **Structure**: Per Documentation Strategy in spec
- **Update schedule**: Update with each phase completion

---

## Complexity Tracking

| Component | CS | Label | Breakdown (S,I,D,N,F,T) | Justification | Mitigation |
|-----------|-----|-------|------------------------|---------------|------------|
| WorkflowRegistryService | 4 | Large | S=2,I=1,D=2,N=1,F=1,T=2 | New service, multiple methods, checkpoint system | Full TDD, contract tests |
| IHashGenerator | 2 | Small | S=1,I=0,D=0,N=0,F=0,T=1 | Single method, well-defined | Interface-first, adapter pattern |
| compose() Extension | 3 | Medium | S=1,I=1,D=1,N=1,F=1,T=1 | Extends existing service | Careful testing of path logic |
| CLI Commands | 3 | Medium | S=1,I=1,D=0,N=1,F=0,T=2 | Multiple commands, output formatting | Follow existing patterns |
| Init + Templates | 3 | Medium | S=2,I=0,D=1,N=1,F=0,T=1 | Bundling complexity | Early build testing |

---

## Progress Tracking

### Phase Completion Checklist
- [x] Phase 0: Exemplar Creation (ADR-0002 Precondition) - COMPLETE
- [x] Phase 1: Core IWorkflowRegistry Infrastructure - COMPLETE
- [x] Phase 2: Checkpoint & Versioning System - COMPLETE
- [x] Phase 3: Compose Extension for Versioned Runs - COMPLETE
- [x] Phase 4: Init Command with Starter Templates - COMPLETE
- [x] Phase 5: CLI Commands - COMPLETE
- [x] Phase 6: Documentation & Rollout - COMPLETE

### STOP Rule
**IMPORTANT**: This plan must be complete before creating tasks. After writing this plan:
1. Run `/plan-4-complete-the-plan` to validate readiness
2. Only proceed to `/plan-5-phase-tasks-and-brief` after validation passes

---

## ADR Ledger

| ADR | Status | Affects Phases | Constraint Mapping | Validation |
|-----|--------|----------------|-------------------|------------|
| ADR-0001 | Accepted | Phase 5 | MCP tool exclusion (NEG-005) | Task 5.17: negative test verifies no workflow tools registered |
| ADR-0002 | Accepted | All | Exemplar-driven testing (IMP-004) | Fixtures in dev/examples/wf/; no generated mocks |
| ADR-0003 | Accepted | Phase 1 | Config pre-load pattern | IWorkflowRegistry does not require config (stateless); if needed, add via constructor injection |
| ADR-0004 | Accepted | Phase 1, 5 | DI useFactory pattern (IMP-001) | Task 1.16: getCliContainer() factory; Task 5.15: commands use container |

**ADR Compliance Verification**:
- Phase 1 Acceptance Criteria: "registered via useFactory pattern (per ADR-0004)"
- Phase 5 Acceptance Criteria: "CLI commands use getCliContainer() - no direct adapter instantiation"
- Testing Philosophy: "Fixtures from dev/examples/wf/ serve as test data (per ADR-0002)"

**Recommendation**: Consider ADR for checkpoint storage strategy (full copy vs delta) after Phase 2 implementation experience.

---

## Deviation Ledger

| Principle Violated | Why Needed | Simpler Alternative Rejected | Risk Mitigation |
|-------------------|------------|------------------------------|-----------------|
| E031 error code reuse | PhaseService already uses E031 | Renumber Phase errors | Use E033 for VERSION_NOT_FOUND instead |
| CLI DI container bypass continues in Phase 5 | Existing pattern from Discovery 04 | Full refactor of all CLI commands | Task 1.16 creates getCliContainer(); new commands use it; existing commands migrate incrementally |

**Resolved Deviations** (no longer violations):
- IHashGenerator location: Moved to packages/shared per architecture rules (Task 1.2)

---

## Subtasks Registry

Mid-implementation detours requiring structured tracking.

| ID | Created | Phase | Parent Task | Reason | Status | Dossier |
|----|---------|-------|-------------|--------|--------|---------|
| 001-subtask-e2e-manual-test-harness | 2026-01-25 | Phase 6: Documentation & Rollout | T007 | Comprehensive E2E manual test from clean slate through complete workflow lifecycle | [x] Complete | [Link](tasks/phase-6-documentation-rollout/001-subtask-e2e-manual-test-harness.md) |

---

## Change Footnotes Ledger

**NOTE**: This section will be populated during implementation by plan-6a-update-progress.

**Footnote Numbering Authority**: plan-6a-update-progress is the **single source of truth** for footnote numbering across the entire plan.

[^1]: [To be added during implementation via plan-6a]
[^2]: [To be added during implementation via plan-6a]
[^3]: [To be added during implementation via plan-6a]

---

*Plan Version 1.1.0 - Created 2026-01-24, Updated 2026-01-24 (remediation applied)*
