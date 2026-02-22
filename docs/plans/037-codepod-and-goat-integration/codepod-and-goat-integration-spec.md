# CodePod Completion and GOAT Integration Testing

**Mode**: Full
**Testing**: Full TDD
**Mock Policy**: Avoid mocks entirely — fakes only
**Documentation**: No new docs — workshops are the docs, `dev/test-graphs/README.md` catalogues fixtures
**File Management**: PlanPak

📚 This specification incorporates findings from Plan 036 Workshops 05-07:
- [05-real-integration-testing.md](../036-cli-orchestration-driver/workshops/05-real-integration-testing.md)
- [06-finishing-codepod.md](../036-cli-orchestration-driver/workshops/06-finishing-codepod.md)
- [07-test-graph-fixtures-and-goat.md](../036-cli-orchestration-driver/workshops/07-test-graph-fixtures-and-goat.md)

---

## Research Context

**Components affected**:
- `CodePod` (`pod.code.ts`) — incomplete, runs empty script
- `IScriptRunner` — interface exists, no real implementation
- `ODS` (`ods.ts`) — needs `workUnitLoader` dep for script path resolution
- `PodManager` / `PodCreateParams` — needs `scriptPath` for code variants
- `FakeAgentInstance` — needs `onRun` callback for integration test agent simulation
- DI containers — CLI + positional-graph need `ScriptRunner` registration

**Critical dependencies**:
- Plan 036 (drive() loop, formatGraphStatus, DriveEvent, CLI command) — COMPLETE
- Plan 030 (orchestration engine: ONBAS, ODS, run(), settle) — COMPLETE
- Plan 032 (node event system: raiseEvent, handlers, settle) — COMPLETE
- Workspace registration system — required for CLI resolution from temp workspaces

**Modification risks**:
- CodePod constructor change affects PodManager, ODS, and all existing pod tests
- ODS dependency addition (workUnitLoader) affects DI container registration
- FakeAgentInstance change is cross-package (shared → positional-graph tests)

**Link**: See Plan 036 Workshops 05-07 for detailed analysis.

---

## Summary

CodePod (the execution container for code-type work units) is incomplete — it runs an empty script with no graph context. This plan finishes CodePod so it can actually execute scripts, then uses that capability to build a comprehensive integration test suite proving the entire orchestration pipeline works end-to-end.

The centrepiece is the GOAT graph — a single graph fixture that exercises every orchestration scenario (serial progression, parallel fan-out, manual transitions, error recovery, question/answer cycles, multi-input aggregation). Simulation scripts "play the agent role" by calling CLI commands (`cg wf node accept/save-output-data/end`), proving the real system works without requiring real LLM agents.

These same graph fixtures are designed for later reuse with real agents — the only change is swapping `type: code` units for `type: agent` units. Same graph structure, same assertions, different executors.

---

## Goals

- **Finish CodePod**: Make code work units actually execute scripts with full graph context (`CG_GRAPH_SLUG`, `CG_NODE_ID`, `CG_WORKSPACE_PATH` env vars)
- **Build real ScriptRunner**: A subprocess executor using `child_process.spawn` that runs bash scripts
- **Create test graph fixture library**: Pre-made graphs stored in `dev/test-graphs/` that can be deployed to temp workspaces, driven, and validated
- **Build the GOAT graph**: A comprehensive fixture exercising every orchestration scenario in one graph (serial, parallel, errors, questions, transitions, aggregation)
- **Prove drive() works end-to-end**: Integration tests using real orchestration engine + real graph state + simulation scripts that call CLI commands — no canned fakes in the hot path
- **Build a standalone demo script**: `just drive-demo` shows each step visually — graph creation, progression through statuses, completion
- **Enable future real agent testing**: Same graph structures reusable with `type: agent` work units, same assertions validate both paths

---

## Non-Goals

- Real agent execution (that's Spec C / a future plan)
- Web integration or SSE streaming (consumer domain, future plan)
- Agent event wiring to terminal output (OQ-01 from Plan 036)
- New CLI commands beyond what exists (all needed commands already registered)
- Work unit creation CLI (`cg wf unit create`) — units written to disk directly
- Graph import/export from YAML (graphs created via service API)
- Performance optimization of drive() polling delays (defaults are fine)

---

## Complexity

**Score**: CS-4 (large)
**Breakdown**: S=2, I=1, D=0, N=1, F=0, T=2
**Confidence**: 0.80
**Assumptions**:
- Workshop designs are validated and ready to implement
- Existing e2e patterns (`createTestServiceStack`, `createOrchestrationStack`) work as documented
- Workspace registration/unregistration is reliable for temp directories
- `raiseNodeEvent` works correctly when called from within a `run()` iteration (event → disk → next settle)

**Dependencies**:
- Plan 036 complete (drive(), formatGraphStatus, CLI command) ✅
- Plan 030 orchestration engine ✅
- Plan 032 node event system ✅
- Workspace registration system functional

**Risks**:
- CodePod constructor change has cascade to PodManager, ODS, all pod tests
- ScriptRunner subprocess execution may have platform-specific issues (Windows)
- Workspace registry state pollution if tests crash before cleanup
- GOAT graph multi-step test sequence is complex to debug when it fails

**Phases** (suggested):
1. CodePod completion + real ScriptRunner
2. Test graph infrastructure (withTestGraph helper, workspace lifecycle)
3. Simple test graphs (simple-serial, parallel-fan-out, error-recovery)
4. GOAT graph + standalone demo script

---

## Acceptance Criteria

### CodePod Completion

- AC-01: CodePod receives `scriptPath` from work unit config via `PodCreateParams`
- AC-02: CodePod passes `CG_GRAPH_SLUG`, `CG_NODE_ID`, `CG_WORKSPACE_PATH` as environment variables to the script
- AC-03: CodePod passes `INPUT_*` env vars for each input (already exists — verify preserved)
- AC-04: Real `ScriptRunner` executes bash scripts via `child_process.spawn`
- AC-05: ScriptRunner returns `exitCode`, `stdout`, `stderr` from subprocess
- AC-06: ScriptRunner supports `kill()` for termination
- AC-07: ODS resolves script path from work unit config via `workUnitLoader` dependency
- AC-08: CodePod stores `unitSlug` (parity with AgentPod)

### Test Graph Infrastructure

- AC-09: Test graphs stored in `dev/test-graphs/<name>/` with `graph.setup.ts` + `units/`
- AC-10: `withTestGraph()` helper creates temp workspace, registers it, copies units, creates graph, runs test, cleans up
- AC-11: Workspace registered via service (not CLI subprocess) for reliability
- AC-12: Work units copied to `.chainglass/units/` in temp workspace with correct structure
- AC-13: `addNode()` validates units exist (existing behavior — verify it works with copied fixtures)
- AC-14: All `.sh` scripts made executable (`chmod +x`) after copy

### Simulation Scripts

- AC-15: Standard simulation script calls `cg wf node accept`, `save-output-data`, `end` using env vars
- AC-16: Error simulation script calls `cg wf node error` and exits non-zero
- AC-17: Question simulation script calls `cg wf node ask` and exits (node paused)
- AC-18: Recovery simulation script fails on first run, succeeds on retry (marker file pattern)
- AC-19: All scripts pass `--workspace-path "$CG_WORKSPACE_PATH"` for correct CLI resolution

### Integration Tests

- AC-20: Integration test: `simple-serial` graph drives to completion (exit 0)
- AC-21: Integration test: `parallel-fan-out` graph drives to completion (all parallel nodes run)
- AC-22: Integration test: `error-recovery` graph — node fails, drive exits, error visible in status
- AC-23: Integration test: graph status view shows correct glyphs at each stage

### GOAT Graph

- AC-24: GOAT graph has 6 lines covering all scenarios (user-input, serial, parallel, error, question, aggregation)
- AC-25: GOAT test drives through all 4 intervention steps (manual transition, error clear, question answer)
- AC-26: GOAT test validates all nodes complete, all outputs saved, graph `isComplete`
- AC-27: GOAT test assertions reusable for both code-unit and agent-unit variants

### Standalone Demo

- AC-28: `scripts/drive-demo.ts` creates a graph, drives it, shows visual progression
- AC-29: `just drive-demo` runs the demo
- AC-30: Demo shows formatGraphStatus output at each iteration with real progression (⚪ → 🔶 → ✅)

### Quality

- AC-31: `just fft` clean (all existing + new tests pass)
- AC-32: No `vi.mock` / `jest.mock` — fakes only
- AC-33: ADR-0012 domain boundaries respected (CodePod is pod-domain, ScriptRunner is pod-domain, drive is orchestration-domain)

---

## Risks & Assumptions

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| CodePod constructor change cascades to many tests | Medium | Medium | Change is additive (new optional fields), not breaking |
| ScriptRunner subprocess has platform issues (Windows) | Low | Low | Linux/Mac only for now, Windows support deferred |
| Workspace registry pollution from crashed tests | Medium | Medium | `finally` block ensures cleanup; print workspace path for manual cleanup |
| `raiseNodeEvent` inside `run()` causes state race | Low | High | Events persist to disk atomically; `run()` reloads from disk each iteration |
| GOAT multi-step sequence hard to debug | Medium | Medium | Each step has clear assertions; keep workspace for post-mortem |
| Work unit fixtures not found by `addNode()` | Medium | High | Copy step runs before graph creation; verify with unit list |

---

## Testing Strategy

- **Approach**: Full TDD
- **Rationale**: Complex infrastructure (CodePod, ScriptRunner, ODS wiring) plus integration tests that prove the full orchestration pipeline. RED-GREEN-REFACTOR for all production code.
- **Focus Areas**:
  - ScriptRunner subprocess execution (exit codes, stdout/stderr, env vars, kill)
  - CodePod script path resolution and graph context env vars
  - Integration tests with real graph state, real events, real CLI commands
  - GOAT graph multi-step sequence (serial → parallel → error → question → completion)
- **Excluded**: Simulation scripts themselves (they ARE the test — if they fail, the integration test fails)
- **Mock Usage**: Avoid mocks entirely. All test doubles implement real interfaces (FakeScriptRunner, FakeAgentInstance, FakePodManager). No `vi.mock` / `jest.mock`.

---

## Documentation Strategy

- **Location**: No new documentation files
- **Rationale**: Workshops 05-07 serve as comprehensive design docs. `dev/test-graphs/README.md` catalogues the test graph fixtures. Code is self-documenting via Test Doc blocks and inline comments.
- **Target Audience**: Future plan implementers building on the orchestration system
- **Maintenance**: Update `dev/test-graphs/README.md` when new test graphs are added

---

## Clarifications

### Session 2026-02-18

**Q1: Workflow mode?**
- **Answer**: Full (B) — CS-4, multi-phase, cross-cutting infrastructure + integration tests.

**Q2: Testing approach?**
- **Answer**: Full TDD (A) — complex infrastructure needs rigorous RED-GREEN-REFACTOR.

**Q3: Mock policy?**
- **Answer**: Avoid mocks entirely (A) — fakes only, per project constitution. No `vi.spyOn`.

**Q4: Documentation strategy?**
- **Answer**: No new docs (D) — workshops ARE the docs. `dev/test-graphs/README.md` for fixture catalogue.

**Q5: File management?**
- **Answer**: PlanPak (A) — feature folders for plan-scoped files. Note: most changes are cross-plan-edits to existing 030-orchestration. PlanPak folder for ScriptRunner and test infrastructure.

**Q6 (OQ-01): ScriptRunner executor detection?**
- **Answer**: Bash only (A) — scripts use shebangs for other runtimes. Keep ScriptRunner simple.
- **Updated**: OQ-01 in spec marked RESOLVED.

**Q7 (OQ-02): GOAT test structure?**
- **Answer**: Single GOAT test (A) — multiple `drive()` calls with interventions between. Focused graphs (simple-serial, etc.) test individual scenarios. GOAT proves the full combined sequence.
- **Updated**: OQ-02 in spec marked RESOLVED.

**Q8 (OQ-03): Agent-unit variants now or deferred?**
- **Answer**: Defer (B) — code-unit variants only for now. Agent-unit variants built when real agent testing plan begins. The reuse strategy is designed but not exercised yet.
- **Updated**: OQ-03 in spec marked RESOLVED.

### Coverage Summary

| Category | Status |
|----------|--------|
| Workflow Mode | ✅ Resolved — Full |
| Testing Strategy | ✅ Resolved — Full TDD, fakes only |
| Documentation | ✅ Resolved — No new docs |
| File Management | ✅ Resolved — PlanPak |
| OQ-01 (ScriptRunner) | ✅ Resolved — Bash only |
| OQ-02 (GOAT structure) | ✅ Resolved — Single test, multiple drives |
| OQ-03 (Agent variants) | ✅ Resolved — Deferred |
| Outstanding | None |

---

## Open Questions

- OQ-01: ~~Should `ScriptRunner` detect file extension?~~ **RESOLVED**: Bash only — scripts use shebangs for other runtimes. Keep ScriptRunner simple.
- OQ-02: ~~Should the GOAT graph test be a single large test or broken into smaller focused tests?~~ **RESOLVED**: Single GOAT test with multiple drive() calls + interventions between. Focused graphs test individual scenarios.
- OQ-03: ~~Should we also create agent-unit variants now?~~ **RESOLVED**: Deferred to real agent testing plan. Code-unit variants only for now.

---

## ADR Seeds (Optional)

**Decision: Script execution model for CodePod**
- Decision Drivers: Code work units need to run scripts that call CLI commands to interact with the graph. Scripts need graph context (slug, nodeId, workspace path).
- Candidate Alternatives:
  - A: Env vars only (`CG_GRAPH_SLUG`, `CG_NODE_ID`, `CG_WORKSPACE_PATH`) — simple, bash-friendly
  - B: JSON config file passed as arg — structured, but requires parsing in every script
  - C: Template resolution in script (like AgentPod prompt templates) — powerful, but scripts aren't templates
- Stakeholders: Workflow system, future code work unit authors

---

## Workshop Opportunities

| Topic | Type | Why Workshop | Key Questions |
|-------|------|--------------|---------------|
| Script execution environment | Integration Pattern | Scripts call CLI from subprocess — env var design, exit code semantics, output capture | How do scripts report structured outputs? Should scripts get a "run context" JSON file? |
| GOAT test sequencing | State Machine | Multi-step test with interventions between drive() calls — complex state management | How to detect which intervention is needed? How to verify intermediate states? |

**Note**: Workshops 05-07 from Plan 036 already cover most design decisions. These additional opportunities are for edge cases discovered during implementation.
