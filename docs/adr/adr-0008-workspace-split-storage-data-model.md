---
title: "ADR-0008: Workspace Split Storage Data Model"
status: "Accepted"
date: "2026-01-27"
authors: "Development Team"
tags: ["architecture", "storage", "workspace", "data-model", "git-native"]
supersedes: ""
superseded_by: ""
---

# ADR-0008: Workspace Split Storage Data Model

## Status

Accepted

## Context

Chainglass users work across multiple projects simultaneously. The system needs a data model that supports:

1. **Multi-project navigation** - Users switch between registered workspaces in the UI
2. **Git-native collaboration** - Team members share data via git (merge workflows, not cloud sync)
3. **Per-worktree isolation** - Each git worktree has independent data (feature branches don't pollute main)
4. **Cross-machine continuity** - Users resume work from different machines via git clone/pull
5. **Domain extensibility** - New domains (agents, workflows, prompts) integrate cleanly
6. **Filesystem-first philosophy** - Aligns with existing workflow system patterns (no database dependency)

The key tension: where should workspace metadata (registry) live vs. actual domain data (agents, samples, etc.)?

## Decision

Implement a **split storage architecture** with two distinct layers:

**Layer 1: Global Registry** (`~/.config/chainglass/workspaces.json`)
- Tracks which folders are registered as workspaces
- Contains: slug, display name, path to main repo, creation timestamp
- User-level scope, not committed to git, survives project deletion

**Layer 2: Per-Worktree Data** (`<worktree>/.chainglass/data/`)
- Stores actual domain data (samples, agents, workflows, prompts)
- Git-committed, merges across branches, shared with team
- Each git worktree has its own independent `.chainglass/` directory

Context resolution walks up from CWD to find registered workspace, then uses the worktree path for data operations. Domains own subdirectories under `data/` (e.g., `data/samples/`, `data/agents/`).

## Consequences

### Positive

- **POS-001**: Git-native collaboration - domain data commits to git, enabling team sharing via merge workflows
- **POS-002**: Per-worktree isolation - feature branch data doesn't appear in main until merged
- **POS-003**: Cross-machine continuity - clone repo, all workspace data comes with it
- **POS-004**: Clean separation - registry survives project deletion; data lives with project
- **POS-005**: Domain extensibility - new domains add subdirectories without modifying registry schema
- **POS-006**: Merge conflicts are features - treat data like code (visible, resolvable diffs)
- **POS-007**: Filesystem-first - no database dependency, works offline, aligns with workflow patterns

### Negative

- **NEG-001**: Two storage locations to manage - registry in `~/.config/`, data in project
- **NEG-002**: Worktree discovery adds latency - must call `git worktree list` (mitigated by caching)
- **NEG-003**: Web server requires same-user access - reads from `~/.config/` owned by server process user
- **NEG-004**: Workspace metadata not portable - registry doesn't travel with repo (intentional trade-off)
- **NEG-005**: Git version dependency - worktree detection requires git ≥2.13

## Alternatives Considered

### Centralized Database (PostgreSQL/SQLite)

- **ALT-001**: **Description**: Single database stores both registry and all domain data. Standard RDBMS with tables for workspaces, agents, workflows, sessions.
- **ALT-002**: **Rejection Reason**: Breaks git-native requirement. Data doesn't commit to git, preventing team sharing via merge workflows. Cross-machine sync would require separate mechanism.

### Single Global JSON File

- **ALT-003**: **Description**: All workspace data in one `~/.config/chainglass/workspaces.json` file including agents, workflows, and all sessions nested under each workspace.
- **ALT-004**: **Rejection Reason**: Violates per-worktree isolation - multiple worktrees would share same data. Merge conflicts unmanageable (entire tree conflicts). Not git-committed.

### Per-Repo Only (No Global Registry)

- **ALT-005**: **Description**: Eliminate global registry. Discover workspaces by scanning filesystem for `.chainglass/` directories.
- **ALT-006**: **Rejection Reason**: Filesystem scan too slow (thousands of directories). No explicit workspace list for UI. Can't store workspace metadata (display name, created timestamp).

### SQLite Per-Workspace

- **ALT-007**: **Description**: Each workspace gets its own SQLite database in `<workspace>/.chainglass/workspace.db`, committed to git.
- **ALT-008**: **Rejection Reason**: Binary merge conflicts unreadable. Team members both add sessions → merge becomes binary conflict requiring manual resolution. Breaks append-only event pattern (NDJSON more appropriate).

### Mixed Persistence (Daemon + Filesystem)

- **ALT-009**: **Description**: Templates in `.chainglass/` (git-committed), runtime data (sessions, events) in background daemon's database at `~/.config/chainglass/runtime.db`.
- **ALT-010**: **Rejection Reason**: Daemon dependency contradicts filesystem-first philosophy. Breaks cross-machine resume (sessions not in git). Adds operational complexity (daemon lifecycle management).

## Implementation Notes

- **IMP-001**: Registry adapter implements `IWorkspaceRegistryAdapter` with CRUD operations; FakeWorkspaceRegistryAdapter provides three-part test API (state setup, call inspection, error injection)
- **IMP-002**: Domain adapters extend `WorkspaceDataAdapterBase` which handles path resolution, JSON I/O, and directory structure creation - reduces boilerplate for new domains
- **IMP-003**: WorkspaceContext includes both `mainRepoPath` (where registered) and `worktreePath` (where user is working) for accurate context resolution
- **IMP-004**: Slug generation uses `slugify` library with strict mode; collision handling appends numeric suffix (e.g., `my-project-2`)
- **IMP-005**: Error codes E074-E081 allocated for workspace operations, E082-E089 for sample domain
- **IMP-006**: Contract tests verify Fake-Real adapter parity; no vi.mock() per R-TEST-007
- **IMP-007**: Same-user deployment constraint: web server must run as user who owns `~/.config/chainglass/` (documented as local dev tool)

## References

- **REF-001**: [Workspaces Spec](../plans/014-workspaces/workspaces-spec.md)
- **REF-002**: [Workspaces Plan](../plans/014-workspaces/workspaces-plan.md)
- **REF-003**: [Data Model Dossier](../plans/014-workspaces/data-model-dossier.md) - Complete storage architecture with diagrams
- **REF-004**: [ADR-0002: Exemplar-Driven Development](./adr-0002-exemplar-driven-development.md) - Pattern this ADR follows
- **REF-005**: [ADR-0004: Dependency Injection](./adr-0004-dependency-injection-container-architecture.md) - DI token patterns used
- **REF-006**: [Workspaces Documentation](../how/workspaces/1-overview.md) - User-facing guide
