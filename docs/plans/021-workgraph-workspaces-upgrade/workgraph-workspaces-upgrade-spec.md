# WorkGraph-Workspaces Integration Upgrade

**Version**: 1.0.0
**Created**: 2026-01-28
**Status**: Draft
**Mode**: Full

📚 This specification incorporates findings from `research-dossier.md`.

---

## Research Context

This specification builds on comprehensive research conducted using FlowSpace MCP with 7 parallel subagents. Key findings:

- **Components affected**: 4 services (WorkGraphService, WorkNodeService, WorkUnitService, BootstrapPromptService), 3 fakes, 1 container, 1 CLI command file
- **Critical dependencies**: WorkspaceContext from workflow package; IFileSystem, IPathResolver, IYamlParser from shared
- **Modification risks**: Medium - well-established patterns from Plan 014 to follow; no database migrations
- **Prior learnings**: 10 directly applicable discoveries from workspace implementation (PL-01 through PL-10)
- **Link**: See `research-dossier.md` for full 65+ findings across 7 research areas

---

## Summary

**What**: Upgrade the workgraph data system to use the workspaces system established in Plan 014. Currently, WorkGraphs and WorkUnits are stored with hardcoded paths (`.chainglass/work-graphs/` and `.chainglass/units/`). After this upgrade, they will be stored in workspace-scoped locations (`<worktree>/.chainglass/data/work-graphs/` and `<worktree>/.chainglass/data/units/`), enabling per-worktree data isolation and git-native collaboration.

**Why**: 
1. **Per-worktree isolation**: Each git worktree has its own graphs and units, preventing cross-contamination
2. **Git-native collaboration**: WorkGraphs and units can be committed to git and merge across branches
3. **Consistent architecture**: All data domains (samples, agents, workflows, workgraphs) use the same storage pattern
4. **Multi-workspace CLI**: Users can operate on any registered workspace with `--worktree` flag

---

## Goals

1. **Workspace-Aware Storage**: WorkGraphs stored at `<worktree>/.chainglass/data/work-graphs/<slug>/` instead of `.chainglass/work-graphs/<slug>/`
2. **Workspace-Aware Units**: WorkUnits stored at `<worktree>/.chainglass/data/units/<slug>/` instead of `.chainglass/units/<slug>/`
3. **Context Resolution**: Services receive WorkspaceContext (directly or via resolver) to determine storage location
4. **CLI Integration**: All `cg wg` and `cg unit` commands support `--worktree <path>` flag for explicit context
5. **Clean Break**: No backward compatibility with legacy paths; all legacy code removed
6. **E2E Validation**: Plan 017 E2E harness passes in both mock and real-agent modes with new paths
7. **Pattern Consistency**: Follow established patterns from SampleAdapter and WorkspaceDataAdapterBase

---

## Non-Goals

1. **Extending WorkspaceDataAdapterBase**: WorkGraph has different storage structure (YAML + nested directories vs flat JSON); may not extend base class
2. **Migration tooling**: Users re-create work-graphs in workspace; no migration scripts
3. **Backward compatibility**: Old paths not supported; clean break by design
4. **Web UI changes**: Web integration is future work; this is CLI/service-layer only
5. **New features**: This is infrastructure upgrade only; no new workgraph capabilities

---

## Complexity

**Score**: CS-3 (medium)

**Breakdown**:

| Dimension | Score | Rationale |
|-----------|-------|-----------|
| Surface Area (S) | 2 | 4 services + 3 fakes + container + CLI + 20+ test files |
| Integration (I) | 1 | WorkspaceContext import from workflow package; established pattern |
| Data/State (D) | 1 | Path structure change; no schema changes; no migrations |
| Novelty (N) | 0 | Well-specified; proven patterns from Plan 014 Sample domain |
| Non-Functional (F) | 0 | Standard requirements; no special perf/security concerns |
| Testing/Rollout (T) | 1 | Contract tests + E2E validation; no feature flags needed |

**Total**: P = 2+1+1+0+0+1 = 5 → **CS-3**

**Confidence**: 0.85 (high - proven patterns, thorough research, working E2E harness for validation)

**Assumptions**:
- WorkspaceContext interface can be imported from @chainglass/workflow (or types extracted to shared)
- Git worktree detection gracefully degrades in non-git folders
- E2E test harness serves as primary validation mechanism
- User has already run Plan 014 (workspace system exists)

**Dependencies**:
- Plan 014 workspaces implementation (complete)
- WorkspaceContext, WorkspaceContextResolver from @chainglass/workflow
- IFileSystem, IPathResolver, IYamlParser from @chainglass/shared
- E2E test harness at `docs/how/dev/workgraph-run/e2e-sample-flow.ts`

**Risks**:

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Type import creates circular dependency | Low | High | Extract WorkspaceContext to shared package if needed |
| Path changes break file references in data.json | Medium | High | Validate with E2E; check `script` output path contains new prefix |
| Test fixture path hardcoding | High | Low | Systematic grep for `.chainglass/work-graphs` and `.chainglass/units` |
| CLI flag naming inconsistency | Low | Medium | Follow Sample command pattern: `--worktree <path>` |

**Phases** (suggested):

1. **Type Foundation**: Import/define WorkspaceContext; update service constructors to accept context
2. **Service Layer**: Update path resolution in all 4 services; update fakes for composite keys
3. **Container Wiring**: Update DI factories to wire workspace context
4. **CLI Integration**: Add `--worktree` flag to all workgraph/unit commands
5. **Test Migration**: Update all tests to use workspace-prefixed paths
6. **E2E Validation**: Run Plan 017 harness to verify end-to-end functionality
7. **Legacy Cleanup**: Remove any fallback code, update documentation

---

## Acceptance Criteria

### Path Migration (Core)

**AC-01**: WorkGraphs created in workspace-scoped location
- Given workspace context with `worktreePath = /home/jak/project`
- When user runs `cg wg create sample-e2e`
- Then graph is created at `/home/jak/project/.chainglass/data/work-graphs/sample-e2e/`
- And NOT at `/home/jak/project/.chainglass/work-graphs/sample-e2e/`

**AC-02**: WorkUnits loaded from workspace-scoped location
- Given workspace context with `worktreePath = /home/jak/project`
- When user runs `cg unit list`
- Then units are listed from `/home/jak/project/.chainglass/data/units/`
- And NOT from `/home/jak/project/.chainglass/units/`

**AC-03**: WorkGraph nodes created in workspace-scoped location
- Given existing graph `sample-e2e` in workspace
- When user runs `cg wg node add-after start -u sample-input`
- Then node is created at `<worktree>/.chainglass/data/work-graphs/sample-e2e/nodes/<id>/`
- And node.yaml and data/ directories are in new location

**AC-04**: Output file paths reference new location
- Given node `sample-coder-XXX` saves output file `script.sh`
- When node data is written via `cg wg node save-output-data`
- Then `data.json` contains path `.chainglass/data/work-graphs/sample-e2e/nodes/sample-coder-XXX/data/outputs/script.sh`
- And NOT path `.chainglass/work-graphs/...`

### Workspace Context (Integration)

**AC-05**: Services accept WorkspaceContext for path resolution
- Given WorkGraphService constructor
- Then it accepts `workspaceContext?: WorkspaceContext` parameter
- And uses `ctx.worktreePath` as base for path resolution when provided

**AC-06**: CLI resolves workspace context from CWD
- Given CWD is `/home/jak/substrate/021-workgraph-workspaces-upgrade/`
- And this path is a registered workspace or worktree
- When user runs `cg wg create test-graph` (no flags)
- Then context is resolved from CWD
- And graph created in that worktree's `.chainglass/data/work-graphs/`

**AC-07**: CLI allows explicit worktree override
- Given CWD is `/tmp/random`
- When user runs `cg wg create test-graph --worktree /home/jak/project`
- Then graph is created in `/home/jak/project/.chainglass/data/work-graphs/`
- And `--worktree` works with any valid path

### Fake Services (Testing)

**AC-08**: FakeWorkGraphService uses composite keys
- Given test creates graphs in two different workspace contexts
- When graphs are keyed by `${worktreePath}|${graphSlug}`
- Then tests can verify per-workspace isolation
- And no cross-contamination between contexts

**AC-09**: Fakes record workspace context in calls
- Given FakeWorkGraphService.create() is called with context
- When getCalls() is invoked
- Then call records include `{ workspaceContext: { worktreePath: '...' }, slug: '...' }`

### E2E Validation

**AC-10**: E2E harness passes in mock mode with new paths
- When running `npx tsx docs/how/dev/workgraph-run/e2e-sample-flow.ts`
- Then all steps complete successfully
- And output shows `Cleaned up existing graph: .chainglass/data/work-graphs/sample-e2e`
- And file paths in output reference `.chainglass/data/work-graphs/`
- And exit code is 0

**AC-11**: E2E harness passes in agent mode with new paths
- When running `npx tsx docs/how/dev/workgraph-run/e2e-sample-flow.ts --with-agent`
- Then all steps complete successfully
- And files created in workspace-scoped location
- And exit code is 0

**AC-12**: Files NOT created in legacy location
- After running E2E harness
- When checking `.chainglass/work-graphs/sample-e2e/`
- Then directory does not exist
- And all data is in `.chainglass/data/work-graphs/sample-e2e/`

### Legacy Removal

**AC-13**: No hardcoded legacy paths in services
- When grepping for `.chainglass/work-graphs` in packages/workgraph/
- Then zero matches found (outside comments/docs)

**AC-14**: No hardcoded legacy paths in CLI
- When grepping for `.chainglass/units` in apps/cli/
- Then zero matches found (outside comments/docs)

**AC-15**: No backward compatibility code
- Then no fallback logic checking both old and new paths
- And no migration utilities
- And clean single-path implementation

---

## Risks & Assumptions

### Risks

1. **Type Import Strategy**: WorkspaceContext lives in @chainglass/workflow; importing creates coupling
   - Mitigation: Extract interface to @chainglass/shared if circular dependency detected

2. **Test Fixture Updates**: 20+ test files reference exact paths
   - Mitigation: Systematic search-replace; run full test suite after changes

3. **E2E Harness Dependencies**: Harness itself may have hardcoded paths
   - Mitigation: Update `e2e-sample-flow.ts` as part of implementation

4. **File Path References in Data**: `data.json` contains file paths that must change
   - Mitigation: AC-04 explicitly validates this; E2E captures it

### Assumptions

1. Plan 014 workspace system is fully implemented and working
2. WorkspaceContextResolver can resolve CWD to context reliably
3. Git graceful degradation works (non-git folders still functional)
4. Sample units exist in `.chainglass/units/` and need to move to `.chainglass/data/units/`
5. No external systems depend on current path structure

---

## Open Questions

1. **Q1**: Should WorkGraphService extend WorkspaceDataAdapterBase or just use similar patterns?
   - **Context**: WorkGraph has YAML + nested directories vs Sample's flat JSON
   - **Recommendation**: Do NOT extend; use similar constructor pattern with `(fs, pathResolver, yamlParser, workspaceContext?)`

2. **Q2**: Where should WorkspaceContext interface live?
   - **Option A**: Import from @chainglass/workflow (creates dependency)
   - **Option B**: Extract to @chainglass/shared (cleaner but requires package change)
   - **Option C**: Define minimal interface in workgraph package (acceptable duplication)
   - **Recommendation**: Option A initially; refactor to B if issues

3. **Q3**: Should existing `.chainglass/units/` fixtures be auto-moved?
   - **Context**: Test fixtures are tracked in git
   - **Recommendation**: Manual move as part of implementation; update .gitignore if needed

---

## ADR Seeds (Optional)

### ADR-SEED-01: No Extension of WorkspaceDataAdapterBase

**Decision Drivers**:
- WorkGraph uses YAML for definitions, JSON for state
- WorkGraph has nested directory structure (nodes/<id>/data/)
- WorkspaceDataAdapterBase designed for flat JSON entities

**Candidate Alternatives**:
- A: Extend WorkspaceDataAdapterBase and override heavily (rejected - worse than not extending)
- B: Create WorkGraphDataAdapterBase as separate base (rejected - YAGNI)
- C: **Follow similar patterns without inheritance** (chosen)

**Stakeholders**: workgraph package maintainers

### ADR-SEED-02: Constructor Injection vs Method Parameter

**Decision Drivers**:
- Services need workspace context for all operations
- Context may change between calls (multi-workspace CLI)
- Existing services have no context parameter

**Candidate Alternatives**:
- A: Inject context in constructor, fixed for service lifetime (simpler)
- B: Pass context as first parameter to every method (more flexible)
- C: **Hybrid - optional constructor param, method param overrides** (balanced)

**Stakeholders**: CLI implementers, service consumers

---

## Workshop Opportunities

| Topic | Type | Why Workshop | Key Questions | Status |
|-------|------|--------------|---------------|--------|
| Path Resolution Strategy | Storage Design | Multiple valid approaches exist; affects all services | 1) Constructor vs method param? 2) Fallback behavior when no context? 3) Relative vs absolute paths in stored data? 4) How to handle path references in node outputs? | ✅ **COMPLETE** |
| Type Sharing Architecture | Integration Pattern | WorkspaceContext needed across packages | 1) Import from workflow or shared? 2) Full interface or minimal subset? 3) How to avoid circular deps? | Resolved: Extract to shared |

**Workshop Complete**: See `workshops/workspace-context-strategy.md` for detailed design decisions:
- **Constructor vs Method Param**: Method Parameter (`ctx: WorkspaceContext` as first param)
- **Fallback Behavior**: CLI layer handles missing context (services receive non-null ctx)
- **Path Storage**: Worktree-relative paths (`.chainglass/data/work-graphs/...`)
- **Base Class**: No extension - follow similar patterns without inheritance

---

## Validation Specification

### E2E Test Commands (Reference)

```bash
# Prerequisites
pnpm build

# Mock mode (fast, deterministic) - PRIMARY VALIDATION
npx tsx docs/how/dev/workgraph-run/e2e-sample-flow.ts

# With Claude Code agent
npx tsx docs/how/dev/workgraph-run/e2e-sample-flow.ts --with-agent

# With GitHub Copilot agent  
npx tsx docs/how/dev/workgraph-run/e2e-sample-flow.ts --with-agent --copilot
```

### File Structure Validation

**Pre-Migration (Current)**:
```
.chainglass/
├── units/                          # Legacy location
│   ├── sample-input/unit.yaml
│   ├── sample-coder/unit.yaml + commands/
│   └── sample-tester/unit.yaml + commands/
└── work-graphs/                    # Legacy location
    └── sample-e2e/
        ├── work-graph.yaml
        ├── state.json
        └── nodes/
```

**Post-Migration (Target)**:
```
.chainglass/
└── data/                           # All per-worktree data
    ├── units/                      # NEW location
    │   ├── sample-input/unit.yaml
    │   ├── sample-coder/unit.yaml + commands/
    │   └── sample-tester/unit.yaml + commands/
    └── work-graphs/                # NEW location
        └── sample-e2e/
            ├── work-graph.yaml
            ├── state.json
            └── nodes/
```

### Automated Validation Script

Post-implementation, run:

```bash
#!/bin/bash
set -e

echo "=== Workspace Migration Validation ==="

# Clean slate
rm -rf .chainglass/work-graphs/sample-e2e 2>/dev/null || true
rm -rf .chainglass/data/work-graphs/sample-e2e 2>/dev/null || true

# Run E2E
npx tsx docs/how/dev/workgraph-run/e2e-sample-flow.ts

# Verify NEW location exists
test -f .chainglass/data/work-graphs/sample-e2e/work-graph.yaml || { echo "FAIL: work-graph.yaml not in new location"; exit 1; }
test -f .chainglass/data/work-graphs/sample-e2e/state.json || { echo "FAIL: state.json not in new location"; exit 1; }

# Verify OLD location does NOT exist
! test -d .chainglass/work-graphs/sample-e2e || { echo "FAIL: Files in legacy location"; exit 1; }

# Verify file path references
grep -q ".chainglass/data/work-graphs" .chainglass/data/work-graphs/sample-e2e/nodes/sample-coder-*/data/data.json || { echo "FAIL: Path reference not updated"; exit 1; }

echo "=== VALIDATION PASSED ==="
```

---

## Testing Strategy

**Approach**: Full TDD

**Rationale**: User selected comprehensive testing approach despite the changes being primarily path updates. Ensures confidence in cross-cutting changes across 4 services, 3 fakes, and 20+ test files.

**Focus Areas**:
- Contract tests for WorkGraphService, WorkNodeService, WorkUnitService with WorkspaceContext
- Fake service composite key isolation (`${worktreePath}|${slug}`)
- E2E harness validation with new paths
- Path reference correctness in output files (data.json script paths)

**Excluded**:
- UI component testing (no web changes in scope)
- Git worktree detection edge cases (graceful degradation already tested in Plan 014)

**Mock Usage**: Fakes Only (no vi.mock/vi.fn per R-TEST-007)
- MUST use full fake implementations (FakeWorkGraphService, FakeWorkNodeService, FakeWorkUnitService)
- MUST follow three-part API: State Setup (`setX()`), State Inspection (`getXCalls()`), Error Injection (`injectXError()`)
- MUST provide test helper methods (`reset()`, assertion helpers)
- MUST run contract tests against both fake and real implementations

---

## Documentation Strategy

**Location**: docs/how/ only

**Rationale**: User selected detailed documentation despite this being an infrastructure change. Will document the workspace-aware storage architecture for future maintainers.

**Content**:
- `docs/how/dev/workgraph-workspaces.md`: Architecture guide explaining workspace-scoped storage patterns
- Update `docs/how/dev/workgraph-run/README.md`: E2E test documentation with new paths

**Target Audience**: Developers extending workgraph functionality; future domain implementers

**Maintenance**: Update docs when storage path patterns change

---

## Clarifications

### Session 2026-01-28

**Q1: Workflow Mode**
- **Answer**: B - Full (multi-phase, comprehensive gates)
- **Rationale**: CS-3 complexity with cross-cutting changes across 4 services, 3 fakes, and 20+ test files justifies full workflow

**Q2: Testing Strategy**
- **Answer**: A - Full TDD (comprehensive unit/integration/e2e)
- **Rationale**: User selected comprehensive testing for confidence in cross-cutting path changes

**Q3: Mock Usage**
- **Answer**: A - Fakes Only (full fake implementations, no vi.mock/vi.fn per R-TEST-007)
- **Rationale**: Consistent with existing patterns and codebase convention; three-part Fake API

**Q4: Documentation Strategy**
- **Answer**: B - docs/how/ only
- **Rationale**: User requested detailed documentation for workspace-aware storage architecture

**Q5: WorkspaceContext Passing (Constructor vs Method)**
- **Answer**: DEFERRED TO WORKSHOP
- **Rationale**: User indicated this needs proper workshop exploration before committing

**Q6: WorkspaceContext Interface Location**
- **Answer**: B - Extract to @chainglass/shared
- **Rationale**: Cleaner architecture; no circular dependency risk; workgraph doesn't depend on workflow

**Q7: Test Fixture Migration**
- **Answer**: A - Manual move during implementation (git mv)
- **Rationale**: Clean break; single source of truth; `git mv .chainglass/units/ .chainglass/data/units/`

**Q8: Workshop Before Architecture**
- **Answer**: A - Yes, workshop "Path Resolution Strategy" before architecture
- **Rationale**: User indicated context passing design needs proper exploration

### Clarification Summary

| Topic | Status | Resolution |
|-------|--------|------------|
| Workflow Mode | Resolved | Full (B) |
| Testing Strategy | Resolved | Full TDD (A) |
| Mock Usage | Resolved | Fakes Only (A) |
| Documentation Strategy | Resolved | docs/how/ only (B) |
| Context Passing | **Workshop Required** | Run /plan-2c-workshop |
| Interface Location | Resolved | Extract to @chainglass/shared (B) |
| Fixture Migration | Resolved | Manual git mv (A) |
| Workshop Gate | Resolved | Yes, workshop before architecture |

---

## Changelog

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2026-01-28 | Claude | Initial specification from research dossier |
| 1.1.0 | 2026-01-28 | Claude | Added Testing Strategy, Documentation Strategy, Clarifications from Q&A session |

---

**Next Steps**:
1. ~~Run `/plan-2c-workshop "Path Resolution Strategy"`~~ ✅ COMPLETE - see `workshops/workspace-context-strategy.md`
2. **NEXT**: Run `/plan-3-architect` to create phased implementation plan
3. Implement per phase with E2E validation at end
