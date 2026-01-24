# Multi-Workflow Management System

**Mode**: Full

📚 This specification incorporates findings from the `/plan-1a-explore` research session conducted on 2026-01-24. The research analyzed the current workflow system architecture across 7 specialized subagents covering implementation, dependencies, patterns, testing, interfaces, documentation, and prior learnings.

## Research Context

**Components Affected**:
- `packages/workflow/src/services/workflow.service.ts` - Core compose logic needs extension
- `packages/workflow/src/interfaces/workflow-service.interface.ts` - New methods required
- `apps/cli/src/commands/wf.command.ts` - New CLI commands needed
- `packages/mcp-server/src/tools/workflow.tools.ts` - New MCP tools (management commands excluded per requirements)
- New: `IWorkflowRegistry` service for template management
- New: Checkpoint/restore service for run snapshots

**Critical Dependencies**:
- IFileSystem, IYamlParser, ISchemaValidator, IPathResolver (all have established fakes)
- DI container pattern (createProductionContainer/createTestContainer)
- Output adapter pattern (JSON/Console formatting)
- Existing run folder structure conventions
- wf-status.json and wf-phase.json schemas

**Modification Risks**:
- Clean break from flat run structure (no legacy support)
- wf-status.json schema changes for new versioned structure
- Template versioning adds new state that must be tracked consistently
- Checkpoint/restore introduces new failure modes (corrupted checkpoints, disk space)

**Key Research Findings**:
- Current architecture supports only flat run organization (`.chainglass/runs/run-date-ordinal/`)
- No template versioning exists - templates identified by path only
- No checkpoint/restore capability - phase state tracked but not snapshotable
- No `init` command - no way to set up project structure or hydrate starter templates
- Prior learning PL-06: Embrace idempotency by always re-executing (simplifies state management)
- Prior learning PL-07: Dual state updates (run-level + phase-level) for autonomy + visibility

See research session output for full 65+ findings analysis.

## Summary

**WHAT**: Enable Chainglass to manage multiple workflow templates with versioning, checkpoints, and organized run storage. Provide CLI commands for workflow lifecycle management (create, version, checkpoint, restore, list) and a web-accessible interface for browsing and managing workflows.

**WHY**:
1. **Multi-workflow support** - Production deployments need multiple workflow types (onboarding, review, analysis, etc.) organized separately
2. **Versioning** - As workflows evolve, users need to track which template version created each run for debugging and compliance
3. **Checkpoints** - Long-running workflows need save points to recover from failures without restarting from scratch
4. **Discoverability** - Teams need to browse available workflows, their versions, and run history
5. **Initialization** - New projects need a quick way to set up Chainglass with starter templates

## Goals

1. **G1: Organized Run Storage** - Runs stored under workflow slug and checkpoint: `.chainglass/runs/<wf-slug>/<ordinal>-<hash>/<run-slug>/` (e.g., `.chainglass/runs/my-wf/v001-abc123/run-2026-01-24-001/`)

2. **G2: Multiple Workflow Templates** - System supports many workflow templates stored in `.chainglass/workflows/<wf-slug>/`

3. **G3: Workflow Versioning** - Templates can be versioned via explicit checkpoints; versions are identified by content hash or semantic version

4. **G4: Checkpoint/Restore** - Workflows can be checkpointed (copying entire template to versioned folder) and restored (pulling back to main workflow folder)

5. **G5: Run-to-Version Tracking** - Each run records which workflow slug and version (checkpoint) it was created from

6. **G6: Starter Template Hydration** - `init` command sets up `.chainglass/` structure and hydrates bundled starter workflows

7. **G7: Non-Destructive Init** - Re-running init preserves existing workflows (won't overwrite)

8. **G8: Flexible Template Location** - Commands accept either workflow slug (scanned in `.chainglass/workflows/`) or full path for external templates

9. ~~**G9: CLI-First with Web Parity** - All management operations available via CLI; web UI can read and trigger same operations~~ *[DEFERRED - separate web plan]*

10. **G10: MCP Reserved for Phase Work** - Workflow management commands NOT exposed via MCP server (per requirements: "MCP server is reserved for in-phase workflow work by agents")

## Key Concepts: Workflow Lifecycle

**CRITICAL**: These rules govern workflow template management and must be consistently enforced.

### Folder Semantics

| Folder | Purpose | Mutable? | Composable? |
|--------|---------|----------|-------------|
| `.chainglass/workflows/<slug>/current/` | Working/editing directory | Yes | **No** |
| `.chainglass/workflows/<slug>/checkpoints/<ordinal>-<hash>/` | Saved versions (e.g., `v001-abc123/`) | **No** (immutable) | **Yes** |

### Checkpoint Identification

Each checkpoint has three identifiers:
- **Ordinal**: Human-readable version number (`v001`, `v002`, etc.) - auto-incremented
- **Hash**: Content hash (short SHA-256 prefix, e.g., `abc123`) - guarantees uniqueness
- **Created date**: ISO-8601 timestamp stored in checkpoint metadata

Checkpoint folder naming: `v<NNN>-<hash>/` (e.g., `v001-abc123/`, `v002-def456/`)

### Workflow Metadata

Workflow metadata file: `.chainglass/workflows/<slug>/workflow.json`
```json
{
  "slug": "my-workflow",
  "name": "My Workflow",
  "description": "A workflow for processing customer onboarding",
  "created_at": "2026-01-20T09:00:00Z",
  "updated_at": "2026-01-24T10:30:00Z",
  "tags": ["onboarding", "customer"],
  "author": "team-name"
}
```

Checkpoint metadata file: `checkpoints/v001-abc123/.checkpoint.json`
```json
{
  "ordinal": 1,
  "hash": "abc123def456...",
  "created_at": "2026-01-24T10:30:00Z",
  "comment": "Release 1.0"
}
```

### Rules

1. **`current/` is for editing only** - Users modify templates in `current/`. This is the "working directory" equivalent.

2. **Checkpoints are immutable** - Once created, a checkpoint cannot be modified. Any changes require a new checkpoint.

3. **Compose requires a checkpoint** - `cg wf compose <slug>` must resolve to a checkpoint. Composing from `current/` is not allowed.
   - If no checkpoint exists: Error with guidance to run `cg workflow checkpoint <slug>` first
   - If checkpoint exists: Use latest checkpoint (or explicit `--version <hash>`)

4. ~~**UI auto-checkpoints on save** - When web UI saves a workflow, it automatically creates a checkpoint, ensuring the workflow is immediately composable.~~ *[DEFERRED - separate web plan]*

5. **Starter templates need explicit checkpoint** - Templates hydrated via `cg init` start with only `current/` (no checkpoints). User must run `cg workflow checkpoint <slug>` before first compose.

### Workflow Lifecycle

```
[Edit in current/] → [Checkpoint] → [Compose from checkpoint] → [Run]
       ↑                   │
       └───────────────────┘
         (restore to edit)
```

## Non-Goals

1. **NG1: Database Backend** - Continues filesystem-first approach; no SQLite, PostgreSQL, or other database storage

2. **NG2: Remote Template Registries** - No fetching templates from npm, GitHub, or cloud registries (local filesystem only)

3. **NG3: Automatic Versioning** - Checkpoints are explicitly created by user command, not auto-created on every change

4. **NG4: Legacy Run Support** - No backward compatibility with flat `.chainglass/runs/run-*` structure; clean break from previous format

5. **NG5: Workflow Composition/Chaining** - Multiple workflows running in sequence/parallel is out of scope (single workflow execution only)

6. **NG6: User Authentication** - No login/permissions for web UI (local development tool assumption)

7. **NG7: Template Marketplace** - No sharing, rating, or discovering community templates

8. **NG8: Breaking Phase Service** - Existing PhaseService (prepare/validate/finalize) remains unchanged; runs still work the same way once created

## Complexity

**Score**: CS-4 (large)

**Breakdown**:
| Dimension | Score | Rationale |
|-----------|-------|-----------|
| S (Surface Area) | 2 | Touches workflow package, CLI, web, new services; cross-cutting changes |
| I (Integration) | 1 | Internal dependencies only, but new service integrations with existing adapters |
| D (Data/State) | 2 | New schema for workflows.yaml registry, extended wf-status.json, checkpoint metadata |
| N (Novelty) | 1 | Requirements clear from research; some ambiguity in checkpoint granularity |
| F (Non-Functional) | 1 | Moderate concerns: disk space for checkpoints, atomic operations |
| T (Testing/Rollout) | 2 | Needs integration tests, manual testing, careful rollout for existing users |

**Total**: S(2) + I(1) + D(2) + N(1) + F(1) + T(2) = **9** → **CS-4**

**Confidence**: 0.85 (high confidence based on comprehensive research)

**Assumptions**:
- A1: Web UI integration uses same service layer as CLI (no separate backend)
- A2: Checkpoint storage cost is acceptable (full template copy per version)
- A3: Single-user local development is primary use case (no concurrent write concerns)

**Dependencies**:
- D1: Existing IFileSystem, IPathResolver adapters (stable, well-tested)
- D2: DI container infrastructure (established pattern)
- D3: CLI framework (Commander.js) for new commands
- D4: Web app build pipeline for new pages

**Risks**:
- R1: Disk space growth from checkpoint copies (mitigate: document, optional pruning command later)
- R2: Backward compatibility with flat run structure (mitigate: detect and handle gracefully)
- R3: Atomic checkpoint operations (mitigate: temp folder + rename pattern)

**Phases** (suggested):
1. **Phase 1: Core Infrastructure** - IWorkflowRegistry interface, WorkflowRegistryService, fakes, DI setup
2. **Phase 2: Versioning** - Checkpoint creation, version hashing (ordinal + hash), restore operations
3. **Phase 3: Run Organization** - Update compose() for versioned paths, wf-status.json extensions
4. **Phase 4: Init Command** - `cg init` with starter template hydration
5. **Phase 5: CLI Commands** - `cg workflow list|info|checkpoint|restore|versions`
6. **Phase 6: Documentation & Rollout** - How-to guides, exemplar updates

*Web integration deferred to separate plan.*

## Acceptance Criteria

### Workflow Template Management

**AC-01**: Given `.chainglass/workflows/` directory exists, when I run `cg workflow list`, then I see a table of all workflow templates with name, latest version, and description.

**AC-02**: Given a workflow template at `.chainglass/workflows/my-wf/`, when I run `cg workflow info my-wf`, then I see the workflow details including version history, phase count, and creation date.

**AC-03**: Given a workflow template at `.chainglass/workflows/my-wf/current/`, when I run `cg workflow checkpoint my-wf --comment "Release 1.0"`, then the entire `current/` folder is copied to `.chainglass/workflows/my-wf/checkpoints/v<NNN>-<hash>/` with `.checkpoint.json` containing ordinal, hash, created_at, and comment.

**AC-04**: Given a checkpointed version exists at `.chainglass/workflows/my-wf/checkpoints/v001-abc123/`, when I run `cg workflow restore my-wf v001`, then I am prompted for confirmation before the checkpoint contents replace `.chainglass/workflows/my-wf/current/`.

**AC-04a**: Given I run `cg workflow restore my-wf v001 --force`, then the restore proceeds without confirmation prompt.

**AC-05**: Given I run `cg workflow checkpoint` without a comment, then a checkpoint is created with auto-generated timestamp-based identifier.

### Run Organization

**AC-06**: Given workflow `hello-wf` has checkpoint `v001-abc123`, when I run `cg wf compose hello-wf`, then the run is created at `.chainglass/runs/hello-wf/v001-abc123/run-YYYY-MM-DD-NNN/` using the latest checkpoint.

**AC-06a**: Given workflow `hello-wf` has checkpoints `v001-abc123` and `v002-def456`, when I run `cg wf compose hello-wf --version v001`, then the run uses the specified checkpoint (can reference by ordinal or full name).

**AC-06b**: Given workflow `hello-wf` exists with only `current/` (no checkpoints), when I run `cg wf compose hello-wf`, then I receive error E032 (NO_CHECKPOINT) with message: "Workflow 'hello-wf' has no checkpoints. Run 'cg workflow checkpoint hello-wf' first."

**AC-07**: Given a run created from versioned workflow, when I inspect `wf-run/wf-status.json`, then it contains `workflow.slug`, `workflow.version_hash`, and `workflow.checkpoint_comment` (if any).

**AC-08**: Given runs exist under `.chainglass/runs/wf-slug/version/`, when I run `cg run list --workflow hello-wf`, then I see all runs for that workflow grouped by version.

**AC-09**: Given I run `cg run list` with no `--workflow` filter, then I see all runs grouped by workflow slug and version.

### Initialization

**AC-10**: Given a fresh project with no `.chainglass/` directory, when I run `cg init`, then the directory structure is created with `workflows/`, `runs/`, and starter templates are hydrated.

**AC-11**: Given `.chainglass/workflows/hello-workflow/` already exists, when I run `cg init`, then the existing workflow is preserved (not overwritten) and new starter templates that don't exist are still added.

**AC-12**: ~~Given I run `cg init --list-starters`, then I see the list of bundled starter templates with descriptions.~~ *[NOT NEEDED - removed]*

**AC-13**: ~~Given I run `cg init --skip-starters`, then only the directory structure is created without hydrating any templates.~~ *[NOT NEEDED - removed]*

### Checkpoint & Restore

**AC-14**: Given workflow `my-wf` has checkpoints, when I run `cg workflow versions my-wf`, then I see a table with ordinal (v001, v002), hash, created_at date, and comment for each checkpoint.

**AC-15**: Given I restore checkpoint `v1` to current, when I run `cg wf compose my-wf`, then the run uses the `v1` template (tracked in wf-status.json).

**AC-16**: Given a checkpoint being created, when disk space is insufficient, then the operation fails atomically with clear error message and no partial checkpoint exists.

### Web UI Integration

~~**AC-17**: Given the web app is running, when I navigate to `/workflows`, then I see a list of all workflow templates from `.chainglass/workflows/`.~~ *[DEFERRED - separate web plan]*

~~**AC-17a**: Given I edit a workflow in the web UI and click "Save", then a new checkpoint is automatically created, making the workflow immediately composable.~~ *[DEFERRED - separate web plan]*

~~**AC-18**: Given I click on a workflow in the web UI, when I view the detail page, then I see version history, phase diagram, and recent runs for that workflow.~~ *[DEFERRED - separate web plan]*

~~**AC-19**: Given I view runs in the web UI, when I filter by workflow slug, then only runs for that workflow are shown (across all versions).~~ *[DEFERRED - separate web plan]*

### CLI/Web Parity

~~**AC-20**: Given any workflow management operation available in CLI, then the same operation is achievable through the web UI (same underlying service layer).~~ *[DEFERRED - separate web plan]*

### MCP Exclusion

**AC-21**: Given the MCP server is running, when an agent lists available tools, then NO workflow management tools appear (list, info, checkpoint, restore, init) - only phase operation tools (prepare, validate, finalize, compose).

### Error Handling

**AC-22**: Given I run `cg workflow checkpoint non-existent`, then I receive error E030 (WORKFLOW_NOT_FOUND) with actionable message.

**AC-23**: Given I run `cg workflow restore my-wf invalid-hash`, then I receive error E031 (VERSION_NOT_FOUND) with list of available versions.

**AC-24**: Given checkpoint fails mid-copy due to I/O error, then no partial checkpoint exists (atomic via temp folder pattern) and error includes recovery guidance.

## Risks & Assumptions

### Risks

| ID | Risk | Likelihood | Impact | Mitigation |
|----|------|------------|--------|------------|
| R1 | Disk space bloat from checkpoint copies | Medium | Medium | Document storage implications; future: incremental/delta checkpoints |
| R2 | Atomic checkpoint failure | Low | High | Use temp folder + rename pattern; clean up on failure |
| R3 | Version hash collisions | Very Low | Medium | Use SHA-256 of wf.yaml + schemas content |

### Assumptions

| ID | Assumption | Validation |
|----|------------|------------|
| A1 | Single-user local development is primary use case | Confirmed by existing design (no auth, no locks) |
| A2 | Templates are small enough to copy entirely | Typical templates < 1MB; acceptable |
| A3 | Users prefer explicit versioning over automatic | Matches "checkpoint" mental model from git |
| A4 | Clean break from previous run format acceptable | New system, no legacy data to migrate |

## Open Questions

**Q1**: ✅ RESOLVED - Compose REQUIRES a checkpoint (Option C):
- `current/` is the mutable working/editing directory - NOT composable
- `checkpoints/<hash>/` are saved, immutable, composable versions
- Compose must reference a checkpoint; attempting to compose without one returns error
- UI auto-checkpoints on workflow save (ensuring composable state)
- Starter templates from `cg init` have no checkpoint initially; user must create one before first compose

**Q2**: ⏸️ DEFERRED - Web UI capabilities deferred to separate web plan

**Q3**: ✅ RESOLVED - Starter templates bundled in npm package (Option A):
- Templates shipped with CLI package (e.g., `hello-workflow`)
- `cg init` copies bundled templates to `.chainglass/workflows/<slug>/current/`
- Works offline, version-locked to CLI version
- No checkpoint created on init; user must run `cg workflow checkpoint <slug>` before first compose

**Q4**: ✅ RESOLVED - Prompt for confirmation unless `--force` (Option C):
- Default: Prompt user "This will replace current/ with checkpoint <hash>. Continue? [y/N]"
- With `--force` flag: Silent overwrite (for scripts/automation)
- Protects against accidental loss of uncommitted edits in `current/`

**Q5**: ✅ RESOLVED - Folder structure is Option A:
- `.chainglass/workflows/<slug>/current/` - Active working template
- `.chainglass/workflows/<slug>/checkpoints/<hash>/` - Saved versions

## ADR Seeds (Optional)

### ADR Seed 1: Checkpoint Storage Strategy

**Decision Drivers**:
- Simplicity vs disk efficiency tradeoff
- Atomic operations requirement (no partial checkpoints)
- Recovery/restore speed requirements
- Future incremental checkpoint possibility

**Candidate Alternatives**:
- A: Full copy (entire template folder per checkpoint) - Simple but disk-heavy
- B: Delta/diff storage (only changed files) - Complex but space-efficient
- C: Git-based (use libgit2 or shell out to git) - Leverages existing tooling

**Stakeholders**: CLI users, web UI consumers, operations teams concerned with disk usage

### ADR Seed 2: Version Identification Scheme

**Decision Drivers**:
- Human readability vs uniqueness guarantee
- Compatibility with filesystem naming
- Sortability (chronological ordering)

**Candidate Alternatives**:
- A: Content hash (SHA-256 of wf.yaml + schemas) - Unique, content-addressable
- B: Semantic version (v1.0.0, v1.0.1) - Human-friendly but requires management
- C: Timestamp-based (2026-01-24T10-30-00) - Sortable, unique, no collisions
- D: Hybrid (v1.0.0-abc123) - Semantic + hash suffix for uniqueness

**Stakeholders**: Developers referencing versions, compliance auditors tracking changes

### ~~ADR Seed 3: Web UI Architecture~~ *[DEFERRED - separate web plan]*

## Testing Strategy

**Approach**: Full TDD
**Rationale**: CS-4 complexity with new services (IWorkflowRegistry), schema extensions, and cross-cutting changes across workflow package, CLI, and web. Full TDD ensures robust coverage and catches regressions early.

**Focus Areas**:
- IWorkflowRegistry service (list, register, checkpoint, restore operations)
- Checkpoint atomicity (temp folder + rename pattern)
- Version hash generation and collision handling
- Run path organization (versioned structure: `<slug>/<hash>/<run>/`)
- CLI command parsing and output formatting
- Error handling (E030, E031, E032 codes)

**Excluded**:
- Web UI visual testing (manual verification acceptable)
- Starter template content validation (static files)

**Mock Usage**: Avoid mocks entirely
- Use Fakes (full implementations) following established pattern: FakeFileSystem, FakeWorkflowRegistry, etc.
- Contract tests ensure Fake and Real implementations behave identically
- Integration tests use real filesystem operations with temp directories
- Fixtures from `dev/examples/wf/` serve as test data

## Documentation Strategy

**Location**: Hybrid (README + docs/how/)
**Rationale**: Workflow management is a significant feature needing both quick-start commands and detailed guides.

**Content Split**:
- **README.md**: Brief section on `cg init` for project setup, mention of `cg workflow` commands
- **docs/how/workflows/**: New guide `5-workflow-management.md` covering templates, versioning, checkpoints, restore

**Target Audience**:
- Developers setting up new Chainglass projects
- Teams managing multiple workflow templates
- Users needing version control over workflow evolution

**Maintenance**: Update docs when CLI commands change; version with code

## External Research

**Incorporated**: None (no external research conducted via /deepresearch)

**Key Findings**: N/A

**Applied To**: N/A

## Unresolved Research

**Topics**: None identified - the codebase research was comprehensive and no external research opportunities were flagged.

**Impact**: Low - the feature builds on well-understood filesystem patterns already established in the codebase.

**Recommendation**: Proceed to architecture phase; external research not required.

## Clarifications

### Session 2026-01-24

**Q1: What workflow mode fits this task?**
- **Answer**: B (Full)
- **Rationale**: CS-4 complexity with 7 phases, cross-cutting changes, new services, and schema extensions requires comprehensive gates and multi-phase planning.

**Q2: What testing approach best fits this feature?**
- **Answer**: A (Full TDD)
- **Rationale**: New services and cross-cutting changes require comprehensive unit/integration/e2e tests to ensure reliability.

**Q3: How should mocks/stubs/fakes be used?**
- **Answer**: A (Avoid mocks) + Fakes allowed
- **Rationale**: No mocking libraries; use Fake implementations (FakeFileSystem, FakeWorkflowRegistry) following established codebase pattern. Fakes are full implementations with contract test parity.

**Q4: Where should documentation live?**
- **Answer**: C (Hybrid)
- **Rationale**: Workflow management needs quick-start in README + detailed guide in docs/how/workflows/.

**Q5: Folder structure for workflows?**
- **Answer**: A (`current/` + `checkpoints/<hash>/`)
- **Rationale**: Explicit separation of working template vs saved versions, similar to git working directory vs commits.

**Q6: What happens when compose is run with no checkpoints?**
- **Answer**: C (Error requiring checkpoint)
- **Rationale**: `current/` is mutable editing space; `checkpoints/` are immutable and composable. Compose must use a checkpoint. UI auto-checkpoints on save. Starter templates need explicit first checkpoint.

**Q7: Where do starter templates come from?**
- **Answer**: A (Bundled in npm package)
- **Rationale**: Shipped with CLI, copied to `.chainglass/workflows/<slug>/current/` on `cg init`. Works offline, version-locked.

**Q8: Should restore prompt for confirmation?**
- **Answer**: C (Prompt unless `--force`)
- **Rationale**: Protects against accidental loss of uncommitted edits; `--force` enables automation.

---

**Specification Status**: Clarified
**Created**: 2026-01-24
**Clarified**: 2026-01-24
**Plan Directory**: `docs/plans/006-manage-workflows/`
**Next Step**: Run `/plan-3-architect` to generate the phase-based implementation plan
