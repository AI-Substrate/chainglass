# Agent Workspace Data Model Migration

**Version**: 1.1.0
**Created**: 2026-01-27
**Updated**: 2026-01-27
**Status**: Draft
**Mode**: Full

---

## Research Context

📚 This specification incorporates findings from ADR-0008, Plan 014 (Workspaces), Plan 015 (Better Agents), and the agent-workspace-integration-workshop.md session document.

- **Components affected**: `packages/shared` (EventStorageService, interfaces), `packages/workflow` (new AgentSessionAdapter), `apps/web` (agents page, routes, workspace integration)
- **Critical dependencies**: WorkspaceContext, WorkspaceDataAdapterBase from Plan 014; EventStorageService, AgentSessionStore from Plan 015
- **Modification risks**: Medium - requires migration from old storage path to new workspace-aware path; localStorage sessions need workspace association
- **Link**: See ADR-0008 for split storage architecture, Plan 014 spec for Sample exemplar pattern

---

## Summary

**What**: Migrate agent session storage to follow the workspace data model established in Plan 014. Agent sessions will be stored per-worktree at `<worktree>/.chainglass/data/agents/` following the Sample exemplar pattern. The web UI will integrate agents into the workspace navigation, allowing users to view agent sessions scoped to their selected workspace/worktree.

**Why**: Currently, agent sessions are stored in a non-standard path (`<cwd>/.chainglass/workspaces/default/data/`) and rely on localStorage for session metadata. This doesn't align with ADR-0008's split storage architecture where domain data lives in `<worktree>/.chainglass/data/`. Migrating ensures:
1. Agent sessions are workspace-scoped (different projects have different sessions)
2. Session data can be git-committed for team sharing/debugging
3. Consistent patterns across all domains (samples, agents, future prompts)
4. Cross-machine session resumption via git clone/pull

---

## Goals

1. **Workspace-Scoped Sessions**: Agent sessions belong to a specific worktree, stored at `<worktree>/.chainglass/data/agents/`
2. **Follow Sample Exemplar**: Use same adapter/service/entity/fake patterns as the Sample domain from Plan 014
3. **Server-Side Session Metadata**: Replace localStorage with server-side `sessions.json` per worktree (browser refresh shows current state)
4. **Preserve Event Storage**: Keep NDJSON event format and EventStorageService, just update paths to use WorkspaceContext
5. **UI Integration**: Add agents to workspace navigation (`/workspaces/[slug]/agents`) or workspace picker to existing `/agents` page
6. **Git-Ignore by Default**: Agent data is per-machine; `.chainglass/.gitignore` excludes `data/agents/`
7. **Migration Path**: Provide migration for existing sessions to new location

---

## Non-Goals

1. **Cross-workspace agents**: An agent session cannot span multiple workspaces (out of scope)
2. **Global agent registry**: No `~/.config/chainglass/agents.json` - sessions are purely per-worktree
3. **Real-time sync**: No cloud sync of sessions - git handles collaboration
4. **Breaking existing Plan 015 features**: Tool call cards, SSE, adapter parsing all remain unchanged
5. **CLI agent commands**: Web-only for now; CLI can be added in future plan

---

## Complexity

**Score**: CS-3 (medium)

**Breakdown**:
| Dimension | Score | Rationale |
|-----------|-------|-----------|
| Surface Area (S) | 2 | Multiple packages (shared, workflow, web) and ~15 files changed |
| Integration (I) | 1 | Depends on Plan 014 workspace infrastructure; otherwise internal |
| Data/State (D) | 1 | New sessions.json format; migration of existing data; no DB |
| Novelty (N) | 0 | Well-specified via ADR-0008 and Sample exemplar; copy-paste pattern |
| Non-Functional (F) | 0 | Standard requirements; no special perf/security/compliance |
| Testing/Rollout (T) | 1 | Contract tests + integration tests; migration needs careful testing |

**Total**: P = 2+1+1+0+0+1 = 5 → **CS-3**

**Confidence**: 0.85 (high confidence - following established Sample exemplar pattern)

**Assumptions**:
- Plan 014 workspace infrastructure is complete and stable
- WorkspaceContext and WorkspaceDataAdapterBase are available
- Users have at least one workspace registered before creating agent sessions
- Existing sessions in old path can be migrated or abandoned (user choice)

**Dependencies**:
- WorkspaceContext, WorkspaceDataAdapterBase from `@chainglass/workflow`
- IFileSystem from `@chainglass/shared`
- Existing DI container infrastructure (tsyringe)

**Risks**:
- Migration could lose existing sessions if not handled carefully
- localStorage sessions have no workspace association - need heuristic or user input
- Event files could bloat git history (mitigate: optional gitignore)

**Phases** (suggested):
1. AgentSession Entity + AgentSessionAdapter + Contract Tests
2. AgentEventAdapter (refactor EventStorageService to use WorkspaceContext)
3. Web UI Integration (workspace-scoped agents page)
4. Migration Tool (old path → new path)

---

## Acceptance Criteria

### Agent Session Entity

**AC-01**: AgentSession entity has required fields
- Given agent session creation
- When session is instantiated
- Then it has: id (UUID), type ('claude'|'copilot'), status ('active'|'completed'|'terminated'), createdAt, updatedAt
- And slug is generated from id (or id IS the slug for simplicity)

**AC-02**: AgentSession serializes to/from JSON
- Given an AgentSession instance
- When `toJSON()` is called
- Then it returns valid JSON with camelCase keys and ISO-8601 dates
- And `fromJSON()` can reconstruct the entity

### Agent Session Adapter

**AC-03**: AgentSessionAdapter follows Sample pattern
- Given AgentSessionAdapter extends WorkspaceDataAdapterBase
- When adapter is instantiated with domain='agents'
- Then paths resolve to `<worktreePath>/.chainglass/data/agents/`

**AC-04**: Sessions stored as individual JSON files
- Given workspace context for `/home/jak/substrate/014-workspaces`
- When user creates session with id `abc-123`
- Then file is created at `/home/jak/substrate/014-workspaces/.chainglass/data/agents/abc-123.json`
- And file contains serialized AgentSession

**AC-05**: Session list returns all sessions in worktree
- Given 3 sessions exist in worktree's agents folder
- When `adapter.list(ctx)` is called
- Then returns array of 3 AgentSession entities
- And sessions are ordered by createdAt (newest first)

**AC-06**: FakeAgentSessionAdapter passes contract tests
- Given contract test suite for IAgentSessionAdapter
- When tests run against FakeAgentSessionAdapter
- Then all tests pass
- And when tests run against AgentSessionAdapter
- Then all tests pass identically

### Agent Event Adapter

**AC-07**: Event storage uses WorkspaceContext
- Given workspace context for a worktree
- When event is appended to session `abc-123`
- Then event is written to `<worktreePath>/.chainglass/data/agents/abc-123/events.ndjson`
- And NDJSON format is preserved from Plan 015

**AC-08**: Events are workspace-scoped
- Given events in `014-workspaces/.chainglass/data/agents/sess-1/events.ndjson`
- And events in `015-better-agents/.chainglass/data/agents/sess-2/events.ndjson`
- When events are queried for each workspace context
- Then only the respective workspace's events are returned

**AC-09**: Existing event operations still work
- Given refactored AgentEventAdapter with WorkspaceContext
- When append, getAll, getSince, archive, exists are called
- Then behavior matches original EventStorageService
- And NDJSON parsing still skips malformed lines (DYK-04)

### Web UI Integration

**AC-10**: Agents accessible from workspace
- Given workspace "chainglass" with worktrees
- When user navigates to workspace detail page
- Then "Agents" link/button is visible
- And clicking it shows agent sessions for that workspace

**AC-11**: URL structure includes workspace context
- When user views agents for workspace "chainglass"
- Then URL is `/workspaces/chainglass/agents` or `/agents?workspace=chainglass`
- And page shows only sessions for that workspace

**AC-12**: Session list comes from server (not localStorage)
- Given agent sessions exist in worktree's agents folder
- When user loads agents page
- Then sessions are fetched from server via API
- And browser refresh shows current state
- And localStorage is no longer used for session list

**AC-13**: Create session stores in workspace
- Given user is viewing agents for workspace "chainglass" (worktree: 014-workspaces)
- When user creates a new Claude session
- Then session metadata is saved to `014-workspaces/.chainglass/data/agents/<id>.json`
- And events will be stored in `014-workspaces/.chainglass/data/agents/<id>/events.ndjson`

**AC-14**: Delete session removes permanently
- Given session `sess-123` exists in workspace
- When user deletes the session
- Then session JSON file is permanently deleted
- And events folder is permanently deleted
- And no archive is created (hard delete)

### Workspace Navigation

**AC-15**: Both URL patterns supported with redirect
- Given user visits `/agents` without workspace context
- When page loads
- Then user is redirected to `/workspaces/[first-workspace]/agents`
- And if no workspaces registered, message displays: "Add a workspace to use agents"

**AC-16**: Agents appear nested under workspace
- Given user is viewing `/workspaces/chainglass`
- When page loads
- Then "Agents" link is visible in workspace detail
- And clicking navigates to `/workspaces/chainglass/agents`

### Migration

**AC-17**: Migration tool moves existing sessions
- Given sessions exist at old path `.chainglass/workspaces/default/data/<id>/`
- When migration command/script runs with target workspace
- Then sessions are moved to `<worktree>/.chainglass/data/agents/<id>/`
- And events.ndjson files are preserved

**AC-18**: Migration handles missing workspace gracefully
- Given old sessions exist but no workspace is registered
- When migration runs
- Then warning is shown: "No workspace registered. Please add a workspace first."
- And no data is moved

**AC-19**: Migration is idempotent
- Given migration has already run
- When migration runs again
- Then no duplicate sessions are created
- And already-migrated sessions are skipped

### Error Handling

**AC-20**: Clear error when no workspace selected
- Given user visits `/agents` without workspace context
- When page loads
- Then message displays: "Select a workspace to view agent sessions"
- Or workspace picker is shown

**AC-21**: Clear error for invalid workspace
- Given user visits `/workspaces/nonexistent/agents`
- When page loads
- Then 404 page or error: "Workspace not found"

**AC-22**: Error codes allocated for agent domain
- Given agent operations can fail
- When errors occur
- Then error codes E090-E099 are used (allocated range for agents)
- And errors follow existing SampleError pattern

### TDD Requirements

**AC-23**: FakeAgentSessionAdapter has three-part API
- Given FakeAgentSessionAdapter for testing
- When tests use the fake
- Then State Setup methods are available (addSession, etc.)
- And State Inspection methods are available (getSessions, loadCalls, saveCalls, etc.)
- And Error Injection is available (injectSaveError, etc.)

**AC-24**: Service layer testable with fakes
- Given AgentSessionService with FakeAgentSessionAdapter injected
- When service methods are called in tests
- Then behavior is verifiable without filesystem I/O
- And fake call tracking enables assertion on interactions

---

## Risks & Assumptions

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Migration loses data | Medium | High | Backup before migration; dry-run option |
| localStorage sessions orphaned | Medium | Medium | Document migration path; provide CLI tool |
| Event files bloat git | Medium | Low | Optional .gitignore entry for events.ndjson |
| Workspace not selected | Low | Medium | Default to CWD-detected workspace |

### Assumptions

1. Plan 014 workspace infrastructure is complete and stable
2. WorkspaceDataAdapterBase is available and tested
3. At least one workspace will be registered before agent use
4. Users understand workspace concept from Plan 014
5. Existing localStorage sessions are expendable OR users will migrate

---

## Open Questions

~~All resolved during clarification session 2026-01-27.~~

---

## Testing Strategy

**Approach**: Full TDD
**Rationale**: Following Plan 014 Sample exemplar pattern; all logic must be testable without UI

**Focus Areas**:
- AgentSession entity creation and serialization
- AgentSessionAdapter contract compliance (FakeAgentSessionAdapter ↔ AgentSessionAdapter)
- AgentEventAdapter refactored with WorkspaceContext
- Service layer business logic (session CRUD, event operations)
- Error handling paths (E090-E099 error codes)
- Migration tool correctness

**Excluded**:
- UI component visual testing (rely on type safety and manual verification)
- SSE streaming (already tested in Plan 015)

**Mock Usage**: Fakes Only (no vi.mock/vi.fn per R-TEST-007)
- MUST use full fake implementations that implement interfaces
- MUST follow three-part API: State Setup, State Inspection, Error Injection
- MUST provide test helper methods (reset(), assertion helpers)
- MUST run contract tests against both fake and real implementations

---

## Documentation Strategy

**Location**: docs/how/ only
**Rationale**: Internal architectural change; users don't need README quick-start, developers extending agents need detailed guide

**Content**:
- `docs/how/agents/` - Detailed guide covering:
  - Workspace-scoped agent sessions
  - Data model (session metadata + events)
  - Adding to workspace navigation
  - Migration from Plan 015 structure

**Target Audience**: Developers extending agent functionality
**Maintenance**: Update docs when agent storage or UI patterns change

---

## ADR Seeds (Optional)

### ADR-SEED-01: Agent Storage Location

**Decision Drivers**:
- Consistency with Sample domain pattern (ADR-0008)
- Workspace-scoped data for multi-project users
- Git-native collaboration for team debugging

**Candidate Alternatives**:
- A: Global registry at `~/.config/chainglass/agents/` (rejected - doesn't match workspace model)
- B: **Per-worktree at `<worktree>/.chainglass/data/agents/`** (chosen - matches Sample)
- C: Hybrid global + per-worktree (rejected - adds complexity)

**Stakeholders**: End users, web UI, future CLI

### ADR-SEED-02: Session Metadata vs Events

**Decision Drivers**:
- Session metadata is small, events can be large
- Teams may want to share session existence without full logs
- Git history cleanliness

**Candidate Alternatives**:
- A: All in one file (rejected - events too large)
- B: **Separate: sessions/<id>.json + sessions/<id>/events.ndjson** (chosen)
- C: Sessions.json index file (considered - may add in future)

**Stakeholders**: Git users, teams sharing workspace

---

## Workshop Opportunities

| Topic | Type | Why Workshop | Key Questions |
|-------|------|--------------|---------------|
| UI Navigation Model | CLI Flow | Multiple valid approaches (picker vs nested routes) | Which URL structure? How to handle no-workspace case? Default behavior? |
| Git Commit Strategy | Storage Design | Trade-off between team sharing and git history | Commit all? Metadata only? User choice via .gitignore? |

---

## External Research

No external research required. This plan follows established internal patterns from ADR-0008 and Plan 014.

---

## Clarifications

### Session 2026-01-27

**Q1: Workflow Mode**
- **Answer**: Full (multi-phase with gates)
- **Rationale**: CS-3 feature with 4 distinct phases; needs comprehensive testing

**Q2: Testing Strategy**
- **Answer**: Full TDD (following Plan 014 pattern)
- **Rationale**: Copying Sample exemplar; all adapters need contract tests

**Q3: Mock Usage**
- **Answer**: Fakes only (no vi.mock per R-TEST-007)
- **Rationale**: Match Plan 014 pattern; three-part API for testability

**Q4: Documentation Strategy**
- **Answer**: docs/how/ only
- **Rationale**: Internal architectural change; developers need detailed guide, not quick-start

**Q5: UI Navigation**
- **Answer**: Both routes - `/workspaces/[slug]/agents` (primary) + `/agents` redirects to first workspace
- **Rationale**: Consistent with workspace model while preserving `/agents` bookmark compatibility

**Q6: Git Strategy**
- **Answer**: Gitignore all agent data (per-machine, not shared)
- **Rationale**: Agent sessions are machine-specific; configure via `.chainglass/.gitignore`

**Q7: Session Deletion**
- **Answer**: Hard delete (permanent)
- **Rationale**: Simplicity; no archive complexity needed for per-machine data

### Clarification Summary

| Topic | Status | Resolution |
|-------|--------|------------|
| Workflow Mode | Resolved | Full (multi-phase) |
| Testing Strategy | Resolved | Full TDD with fakes only |
| Mock Usage | Resolved | Fakes only (R-TEST-007) |
| Documentation | Resolved | docs/how/ only |
| UI Navigation | Resolved | Both routes with redirect |
| Git Strategy | Resolved | Gitignore all (.chainglass/.gitignore) |
| Session Deletion | Resolved | Hard delete |

---

## Changelog

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2026-01-27 | Claude | Initial specification |
| 1.1.0 | 2026-01-27 | Claude | Clarifications: Full mode, TDD, fakes-only, docs/how/, both routes with redirect, gitignore all, hard delete |

---

**Next Steps**:
1. Run `/plan-2c-workshop` for UI Navigation Model if needed
2. Run `/plan-2-clarify` to resolve open questions
3. Run `/plan-3-architect` to create implementation plan
