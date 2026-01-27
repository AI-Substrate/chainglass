# Workspaces Feature Specification

**Version**: 2.0.0
**Created**: 2026-01-27
**Updated**: 2026-01-27
**Status**: Draft
**Mode**: Full

## Research Context

This specification incorporates findings from `research-dossier.md` and `data-model-dossier.md`.

- **Components affected**: packages/workflow (entities, adapters, services, fakes), packages/shared (DI tokens, result types), apps/web (pages, API routes, components, left menu), apps/cli (commands)
- **Critical dependencies**: IFileSystem, IPathResolver from shared; existing Entity/Adapter/Service patterns from workflow package
- **Modification risks**: Low - new feature with isolated storage; no changes to existing workflow/phase schemas
- **Prior learnings**: 15 applicable discoveries including path security (PL-01), factory patterns (PL-02), error code allocation (PL-05), contract testing (PL-12)
- **Data model**: See `data-model-dossier.md` for complete storage architecture, WorkspaceContext, and adapter patterns

---

## Summary

**What**: Workspaces are folders registered within Chainglass. Users can add any folder as a workspace - it doesn't need to be a git repo. For git repos, the system auto-discovers worktrees and displays them under the parent workspace. Each workspace/worktree stores its own data (samples, agents, workflows, prompts) in `.chainglass/data/`. For git repos, this data commits to git and merges across branches. The web UI shows workspaces in the left menu, letting users navigate between them and see different data in each.

**Why**: Users work across multiple projects simultaneously. Workspaces provide the navigation hierarchy in the web app. For git-enabled workspaces, the worktree-centric data model enables collaboration: create data in a feature branch, merge to main, team members get it. This establishes a foundation for future domains (agents, workflows, prompts, tools) to store per-workspace data.

---

## Goals

1. **Workspace Registry**: Users register any folder as a workspace with a friendly name; stored in `~/.config/chainglass/workspaces.json`
2. **Worktree Discovery**: For git repos, system auto-discovers worktrees and displays them under their parent workspace
3. **Per-Workspace Data**: Each workspace (or worktree) has its own `.chainglass/data/` folder for domain data (samples, agents, etc.)
4. **Git-Native Collaboration**: For git repos, `.chainglass/` data commits to git, merges across branches, syncs via push/pull
5. **Web UI Navigation**: Workspaces appear in left menu; selecting a worktree sets context for data operations
6. **Sample Exemplar Domain**: Validate data model patterns with a simple "Sample" domain before real domains
7. **Multi-Surface Access**: Same workspace/data accessible via CLI, web UI, and future MCP tools
8. **TDD-First**: All logic implemented headless with fakes and contract tests before real adapters
9. **Server-Side Data**: Web UI reads from server on each request (browser refresh shows current state)

---

## Non-Goals

1. **Workflow migration** - Moving existing `.chainglass/workflows/` to new structure is future work
2. **Agent integration** - 015-better-agents will integrate later using established patterns
3. **Remote sync beyond git** - Cloud sync of registry is out of scope; git handles data sync
4. **Workspace-specific configuration** - Future enhancement (`.chainglass/config.json`)
5. **MCP tools** - Optional future phase, not required for initial delivery
6. **Folder creation/deletion** - Workspaces reference existing folders; we don't create or delete them

---

## Complexity

**Score**: CS-3 (medium)

**Breakdown**:
| Dimension | Score | Rationale |
|-----------|-------|-----------|
| Surface Area (S) | 2 | Multiple packages (workflow, shared, web, cli) and ~25 new files |
| Integration (I) | 1 | Git CLI for worktree detection; otherwise internal |
| Data/State (D) | 1 | New JSON registry + per-worktree data folders; no migrations |
| Novelty (N) | 0 | Well-specified via data-model-dossier; follows established patterns |
| Non-Functional (F) | 0 | Standard requirements; no special perf/security/compliance |
| Testing/Rollout (T) | 1 | Contract tests + integration tests; no feature flags needed |

**Total**: P = 2+1+1+0+0+1 = 5 → **CS-3**

**Confidence**: 0.90 (high confidence - data model workshopped and documented in detail)

**Assumptions**:
- Git CLI available if user wants worktree detection (not required for basic workspace functionality)
- User has write access to `~/.config/chainglass/`
- Workspaces can be any folder (git optional - warning if no `.git`, but works fine)
- Web server has filesystem access to user's home directory and project folders

**Dependencies**:
- IFileSystem, IPathResolver from @chainglass/shared
- getUserConfigDir() utility for config path resolution
- Existing DI container infrastructure (tsyringe)

**Risks**:
- Git worktree detection relies on parsing `git worktree list` output (format may vary)
- Slug collisions if user adds workspaces with similar names (mitigate: append numeric suffix)
- Large number of worktrees could slow discovery (mitigate: cache with TTL)

**Phases** (suggested):
1. Workspace Entity + Registry Adapter + Contract Tests
2. WorkspaceContext Resolution + Worktree Discovery
3. Sample Domain (entity, adapter, fake) to validate data model
4. WorkspaceDataAdapterBase + Service Layer
5. CLI Commands (workspace + sample)
6. Web UI (left menu, workspace pages, sample CRUD)

---

## Acceptance Criteria

### Workspace Registry (CLI)

**AC-01**: User can add a workspace by providing a name and folder path
- Given a valid folder path (any folder, git optional)
- When user runs `cg workspace add "Chainglass" /home/jak/substrate/chainglass`
- Then workspace is saved to `~/.config/chainglass/workspaces.json`
- And workspace appears in list with generated slug "chainglass"

**AC-02**: User can list all registered workspaces
- Given one or more workspaces exist
- When user runs `cg workspace list`
- Then all workspaces display with name (slug) and path
- And output supports `--json` flag for machine-readable format

**AC-03**: User can remove a workspace by slug
- Given a workspace exists with slug "my-project"
- When user runs `cg workspace remove my-project`
- Then workspace is removed from registry
- And the actual folder on disk is NOT deleted
- And any `.chainglass/` data in the folder is NOT deleted

**AC-04**: User can view workspace info including discovered worktrees
- Given workspace "chainglass" exists at `/home/jak/substrate/chainglass`
- And main repo has 8 worktrees
- When user runs `cg workspace info chainglass`
- Then details show name, slug, path, created date
- And all 8 worktrees are listed with their paths and branches

### Git Worktree Handling (Git Repos Only)

**AC-05**: System warns when adding a git worktree as workspace
- Given `/home/jak/substrate/014-workspaces` is a git worktree (not main repo)
- When user runs `cg workspace add "Feature" /home/jak/substrate/014-workspaces`
- Then warning displays: "This path is a git worktree. Consider adding the main repository instead."
- And command fails unless `--allow-worktree` flag provided
- Note: This check only applies to git-enabled folders

**AC-06**: Worktrees are auto-discovered at runtime (git repos only)
- Given workspace "chainglass" registered at a git repo with worktrees
- When user views workspace info (CLI or web)
- Then worktrees are discovered via `git worktree list`
- And displayed under parent workspace with branch names
- And no separate "add" action needed - they just show up
- Note: Non-git workspaces simply have no worktrees to discover

### Per-Workspace Data Storage

**AC-07**: Data is stored in the workspace/worktree where work happens
- Given user is working in `/home/jak/substrate/014-workspaces` (a workspace or worktree)
- When user creates a sample via CLI or web
- Then sample is saved to `/home/jak/substrate/014-workspaces/.chainglass/data/samples/`
- And NOT to any other location or global config

**AC-08**: Different workspaces/worktrees have isolated data
- Given samples exist in `014-workspaces/.chainglass/data/samples/`
- And different samples exist in `015-better-agents/.chainglass/data/samples/`
- When user views samples in web UI for each workspace/worktree
- Then each shows its own samples (different data)

**AC-09**: Data merges via git (git repos only)
- Given sample "test-sample" created in a git worktree
- When user commits `.chainglass/` and merges to main
- Then main branch now has "test-sample"
- And other worktrees get it after merge/rebase
- Note: Non-git workspaces still store data locally, just without git sync

### Sample Exemplar Domain

**AC-10**: User can create a sample via CLI
- Given workspace context resolved from CWD or `--worktree` flag
- When user runs `cg sample add "My Sample" --content "Test content"`
- Then sample is saved to `<worktree>/.chainglass/data/samples/my-sample.json`
- With slug, name, content, createdAt, updatedAt fields

**AC-11**: User can list samples in current worktree
- Given samples exist in current worktree's `.chainglass/data/samples/`
- When user runs `cg sample list`
- Then all samples display with slug and name
- And `--json` flag provides machine-readable output

**AC-12**: User can view sample details
- Given sample "my-sample" exists
- When user runs `cg sample info my-sample`
- Then displays slug, name, content, timestamps

**AC-13**: User can delete a sample
- Given sample "old-sample" exists
- When user runs `cg sample delete old-sample`
- Then sample file is removed from `.chainglass/data/samples/`

### Web UI - Workspaces

**AC-14**: Workspaces appear in left menu
- Given workspaces exist in registry
- When user views any page in web app
- Then left menu shows "Workspaces" section
- And each workspace is listed with name

**AC-15**: Workspace expands to show worktrees
- Given workspace "chainglass" has multiple worktrees
- When user clicks/expands "chainglass" in left menu
- Then worktrees are listed with their branch names
- And user can select a worktree to set context

**AC-16**: Selecting worktree sets context for data operations
- Given user selects worktree "014-workspaces" in left menu
- When user views samples page
- Then samples from `014-workspaces/.chainglass/data/samples/` are shown
- And page URL includes worktree context (query param or path)

**AC-17**: Web UI allows adding workspaces
- Given user is viewing workspaces management area
- When user fills form with name and path and submits
- Then workspace is added to registry via API
- And left menu updates to show new workspace

**AC-18**: Web UI allows removing workspaces
- Given workspace "old-project" exists
- When user clicks remove button and confirms
- Then workspace is removed from registry via API
- And left menu updates without "old-project"

### Web UI - Samples (Exemplar)

**AC-19**: Web UI displays sample list for selected worktree
- Given worktree selected and samples exist
- When user navigates to samples page
- Then all samples in that worktree display
- And page works with browser refresh (server-side data)

**AC-20**: Web UI allows creating samples
- Given worktree selected
- When user fills sample form (name, content) and submits
- Then sample is created in worktree's `.chainglass/data/samples/`
- And list refreshes to show new sample

**AC-21**: Web UI allows deleting samples
- Given sample exists in selected worktree
- When user clicks delete button and confirms
- Then sample is removed
- And list refreshes without that sample

### Context Resolution

**AC-22**: CLI resolves workspace context from CWD
- Given CWD is `/home/jak/substrate/014-workspaces/src`
- And `014-workspaces` is a worktree of registered workspace "chainglass"
- When user runs `cg sample list` (no flags)
- Then samples from `014-workspaces/.chainglass/data/samples/` are shown

**AC-23**: CLI allows explicit worktree override
- Given CWD is `/tmp/random`
- When user runs `cg sample list --worktree /home/jak/substrate/014-workspaces`
- Then samples from `014-workspaces/.chainglass/data/samples/` are shown
- And `--worktree` works with any git working directory (main or worktree)

### Error Handling

**AC-24**: Clear error when workspace path doesn't exist
- Given `/nonexistent/path` does not exist
- When user runs `cg workspace add "Test" /nonexistent/path`
- Then error displays with code E076: "Path does not exist"

**AC-25**: Clear error when workspace slug already exists
- Given workspace with slug "my-project" exists
- When user runs `cg workspace add "My Project" /different/path`
- Then error displays with code E075: "Workspace already exists"

**AC-26**: Clear error when workspace not found
- Given no workspace with slug "unknown"
- When user runs `cg workspace info unknown`
- Then error displays with code E074: "Workspace not found"

**AC-27**: Warning when path has no .git folder
- Given `/home/jak/docs` exists but has no `.git`
- When user runs `cg workspace add "Docs" /home/jak/docs`
- Then warning displays: "No .git folder found. Git features (worktree discovery) won't work."
- And workspace is added anyway

### TDD Requirements

**AC-28**: FakeWorkspaceAdapter passes same contract tests as real adapter
- Given contract test suite for IWorkspaceAdapter
- When tests run against FakeWorkspaceAdapter
- Then all tests pass
- And when tests run against WorkspaceAdapter
- Then all tests pass identically

**AC-29**: FakeSampleAdapter passes same contract tests as real adapter
- Given contract test suite for ISampleAdapter
- When tests run against FakeSampleAdapter
- Then all tests pass
- And when tests run against SampleAdapter
- Then all tests pass identically

**AC-30**: Service layers testable with fake adapters
- Given WorkspaceService with FakeWorkspaceAdapter injected
- And SampleService with FakeSampleAdapter injected
- When service methods are called in tests
- Then behavior is verifiable without filesystem I/O
- And fake call tracking enables assertion on interactions

---

## Data Model Summary

See `data-model-dossier.md` for complete details. Key points:

### Two-Layer Storage
```
~/.config/chainglass/workspaces.json    # Registry (which repos to track)
<worktree>/.chainglass/data/            # Domain data (samples, agents, etc.)
```

### WorkspaceContext
```typescript
interface WorkspaceContext {
  slug: string;           // "chainglass"
  name: string;           // "Chainglass"
  mainRepoPath: string;   // /home/jak/substrate/chainglass
  worktreePath: string;   // /home/jak/substrate/014-workspaces
  dataRoot: string;       // <worktreePath>/.chainglass/data
}
```

### WorkspaceDataAdapterBase
Base class providing common functionality for domain adapters:
- Path resolution (`getDomainPath()`, `getEntityPath()`)
- Structure management (`ensureStructure()`)
- CRUD operations (`listSlugs()`, `exists()`, `deleteEntity()`)
- JSON helpers (`readJson()`, `writeJson()`)

### Sample Domain (Exemplar)
Simple domain to validate patterns before agents/workflows/prompts:
```
<worktree>/.chainglass/data/samples/
  my-sample.json
  another-sample.json
```

---

## Risks & Assumptions

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Git worktree detection varies by git version | Low | Medium | Test on multiple git versions; graceful fallback if parsing fails |
| User config directory permissions | Low | High | Clear error message with remediation steps |
| Slug collision from similar names | Medium | Low | Append numeric suffix on collision (my-project-2) |
| Large worktree count performance | Low | Low | Cache worktree list with short TTL |
| Merge conflicts in `.chainglass/` | Medium | Low | Expected and desired - treat like code conflicts |

### Assumptions

1. Users have git installed if they want worktree detection
2. `~/.config/chainglass/` directory can be created if it doesn't exist
3. Workspace paths are absolute (relative paths expanded on add)
4. Slug generation uses consistent algorithm (lowercase, hyphenate spaces, strip special chars)
5. Web server has filesystem access to user's home directory and project folders
6. Users understand git and worktrees (power users)
7. `.chainglass/` data should be committed (not gitignored by default)

---

## Open Questions

All questions resolved during data model workshop. See `data-model-dossier.md` and Clarifications section below.

---

## ADR Seeds (Optional)

### ADR-SEED-01: Split Storage Architecture

**Decision Drivers**:
- Workspace registry is user-level (survives project deletion)
- Domain data should travel with git (team collaboration)
- Each worktree needs isolated data

**Candidate Alternatives**:
- A: All in `~/.config/chainglass/` (rejected - data divorced from project)
- B: All in `.chainglass/` per-project (rejected - registry wouldn't work)
- C: **Split - registry global, data per-worktree** (chosen)

**Stakeholders**: End users, CLI, Web server, teams collaborating via git

### ADR-SEED-02: Sample as Exemplar Domain

**Decision Drivers**:
- Need to validate data model patterns before real domains
- Should be simple but exercise full CRUD
- Provides copy-paste template for future domains

**Candidate Alternatives**:
- A: Start with agents (too complex)
- B: Start with workflows (already exists, migration needed)
- C: **Start with Sample** (simple, purpose-built, disposable)

**Stakeholders**: Developers, future domain implementers

---

## ADRs

- ADR-0008: Workspace Split Storage Data Model (2026-01-27) – status: Accepted

---

## Testing Strategy

**Approach**: Full TDD
**Rationale**: User specified TDD-first headless architecture; all logic must be testable without UI

**Focus Areas**:
- Workspace entity creation and serialization
- WorkspaceContext resolution from paths (CWD, worktrees, explicit override)
- Registry adapter contract compliance (FakeWorkspaceAdapter ↔ WorkspaceAdapter)
- Sample adapter contract compliance (FakeSampleAdapter ↔ SampleAdapter)
- WorkspaceDataAdapterBase shared functionality
- Service layer business logic (workspace CRUD, sample CRUD, worktree discovery)
- Error handling paths (E074-E081 error codes)
- CLI command integration
- Web API route handlers

**Excluded**:
- UI component visual testing (rely on type safety and manual verification)
- Git CLI version variations (test primary format, graceful fallback for others)

**Mock Usage**: Fakes Only (no vi.mock/vi.fn per R-TEST-007)
- MUST use full fake implementations that implement interfaces
- MUST follow three-part API: State Setup, State Inspection, Error Injection
- MUST provide test helper methods (reset(), assertion helpers)
- MUST run contract tests against both fake and real implementations

---

## Documentation Strategy

**Location**: Hybrid (README + docs/how/)
**Rationale**: User-facing feature needing both quick-start and detailed guides

**Content Split**:
- **README.md**: Quick-start for workspace commands (`cg workspace add/list/remove/info`), basic concepts
- **docs/how/workspaces/**: Detailed guide covering:
  - Data model (registry vs. per-worktree data)
  - Git workflow (creating data, committing, merging)
  - Worktree handling and discovery
  - Adding new domains (using Sample as template)
  - Troubleshooting

**Target Audience**:
- CLI users (quick reference)
- Developers extending workspace functionality (detailed docs)

**Maintenance**: Update docs when CLI interface or behavior changes

---

## Development Validation

Use Chainglass repo itself to validate implementation:

```
Main repo:  /home/jak/substrate/chainglass (main)
Worktrees:  /home/jak/substrate/002-agents
            /home/jak/substrate/003-wf-basics
            /home/jak/substrate/005-web-slick
            /home/jak/substrate/007-manage-workflows
            /home/jak/substrate/008-web-extras
            /home/jak/substrate/013-ci
            /home/jak/substrate/014-workspaces  ← current development
            /home/jak/substrate/015-better-agents
```

**Test Scenarios**:
1. Register "chainglass" workspace pointing to main repo
2. Create samples in `014-workspaces` via CLI
3. Create different samples in `015-better-agents` via CLI
4. View both in web UI, confirm different data
5. Commit samples in `014-workspaces`, merge to main
6. Verify main now has the samples

---

## Clarifications

### Session 2026-01-27 (Data Model Workshop)

**Q1: Storage Location**
- **Answer**: Split - registry in `~/.config/chainglass/`, data in `<worktree>/.chainglass/data/`
- **Rationale**: Registry is user-level (survives project deletion), data travels with git (team collaboration)

**Q2: Worktree Data Isolation**
- **Answer**: Each worktree has its own `.chainglass/data/`
- **Rationale**: Enables git-native workflow - create in branch, merge to main

**Q3: What Gets Committed**
- **Answer**: Everything in `.chainglass/`
- **Rationale**: Resume sessions from other machines, share templates, merge conflicts desired

**Q4: Exemplar Domain**
- **Answer**: Sample - simple CRUD to validate patterns
- **Rationale**: Workflows too complex, agents depend on other spec; Sample is purpose-built

**Q5: Adapter Base Class**
- **Answer**: Yes - `WorkspaceDataAdapterBase` with shared functionality
- **Rationale**: DRY for path resolution, JSON I/O, structure management

**Q6: Override Flag Naming**
- **Answer**: `--worktree <path>` for data operations, `--workspace <slug>` for registry queries
- **Rationale**: `--worktree` says "use this path for data", works with any git working directory

**Q7: Active Workspace Concept**
- **Answer**: Removed entirely
- **Rationale**: Users work across many workspaces in many windows; "active" adds complexity without value

**Q8: Web UI Placement**
- **Answer**: Left menu as its own subsection (will broaden prominence in future plan)
- **Rationale**: Provides navigation hierarchy; future plans may make it more prominent

### Clarification Summary

| Topic | Status | Resolution |
|-------|--------|------------|
| Storage Architecture | Resolved | Split - registry global, data per-worktree |
| Data Isolation | Resolved | Each worktree has own `.chainglass/data/` |
| Git Workflow | Resolved | Commit everything, merge conflicts expected |
| Exemplar Domain | Resolved | Sample - validates patterns before real domains |
| Adapter Pattern | Resolved | WorkspaceDataAdapterBase with domain subclasses |
| CLI Override | Resolved | `--worktree <path>` for data, `--workspace <slug>` for registry |
| Active Workspace | Resolved | Concept removed - unnecessary |
| Web UI | Resolved | Left menu subsection, expand later |

---

## Changelog

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2026-01-27 | Claude | Initial specification |
| 1.1.0 | 2026-01-27 | Claude | Clarifications: Full mode, TDD, fakes-only, hybrid docs, removed active workspace concept |
| 2.0.0 | 2026-01-27 | Claude | Major overhaul: Split storage model, worktree-centric data, Sample exemplar domain, WorkspaceDataAdapterBase, web UI left menu, development validation with Chainglass repo |
| 2.0.1 | 2026-01-27 | Claude | Clarified workspaces are any folder (git optional); git features (worktree discovery, merge) only apply to git repos |

---

**Next Steps**:
1. Run `/plan-2-clarify` if any questions remain
2. Run `/plan-3-architect` to create implementation plan
