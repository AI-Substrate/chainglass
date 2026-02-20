# Workshop: Spec C Concept Drift Remediation

**Type**: Integration Pattern
**Plan**: 033-real-agent-pods
**Spec**: [spec-c-real-agent-e2e-tests.md](../spec-c-real-agent-e2e-tests.md)
**Created**: 2026-02-20
**Status**: Draft

**Related Documents**:
- [Plan 037 spec](../../037-codepod-and-goat-integration/codepod-and-goat-integration-spec.md)
- [Workshop 09: Disk Loader and Orchestration Wiring](../../037-codepod-and-goat-integration/workshops/09-disk-loader-and-orchestration-wiring.md)
- [Workshop 08: Fire-and-Forget Sync](../../037-codepod-and-goat-integration/workshops/08-fire-and-forget-sync.md)
- [GOAT integration test](../../../../test/integration/orchestration-drive.test.ts)

---

## Purpose

Spec C was written before Plans 036 and 037 were implemented. Since then, ~20 commits landed significant infrastructure that changes what Spec C needs to do, how it should do it, and what's already done. This workshop catalogs every drift point so the plan can be written against reality, not stale assumptions.

## Key Questions Addressed

- What did Spec C assume that has since changed?
- What does Spec C ask for that already exists?
- What new infrastructure should Spec C leverage that didn't exist when it was written?
- What Spec C assumptions are now wrong and need correction?

---

## Part 1: What Spec C Assumed vs What Exists Now

### Infrastructure Spec C Didn't Know About

| Thing | Spec C Assumed | What Actually Exists (post-037) |
|-------|---------------|-------------------------------|
| **Test graph runner** | Tests would use `createTestServiceStack()` + manual workspace wiring | `withTestGraph(fixtureName, testFn)` handles full lifecycle: mkdtemp → register workspace → copy units → wire service → test → unregister → cleanup |
| **Orchestration stack** | Tests would wire ONBAS/ODS/EHS/PodManager manually | `createTestOrchestrationStack(service, ctx, workUnitService)` returns ready-to-use stack with real ScriptRunner |
| **Work unit service** | Tests would use `FakeWorkUnitService` | `buildDiskWorkUnitService(workspacePath)` reads real unit.yaml from disk — shared by graph service AND ODS |
| **Workspace registration** | Tests would call `cg workspace add` via CLI subprocess | `withTestGraph` uses `WorkspaceService.add()` directly (in-process, no subprocess) |
| **GOAT graph** | GOAT was a concept in Workshop 07 — not yet built | GOAT fixture exists at `dev/test-graphs/goat/` with 9 units, 8 scripts, and a passing 52-second integration test |
| **Simulation scripts** | Scripts were theoretical (Workshop 07 pseudocode) | 4 proven script patterns: standard (accept/save/end), error (deliberate fail), recovery (marker file retry), question (marker file + ask) |
| **completeUserInputNode** | Would need to figure out event sequence | Helper exists: `startNode → raiseNodeEvent(accepted) → saveOutputData → endNode` |
| **Drive parameters** | Workshop 08 hadn't been written | `TEST_DRIVE_OPTIONS` proven: maxIterations:100, actionDelayMs:50, idleDelayMs:1500 |
| **FakeAgentInstance.onRun** | Mentioned as needed in Spec C research context | Implemented and tested in Phase 2 — callback fires during `run()` |
| **Assertions** | Would need custom assertion code | `assertGraphComplete`, `assertNodeComplete`, `assertNodeFailed`, `assertNodeWaitingQuestion`, `assertOutputExists` all exist |
| **Error recovery flow** | Theoretical | Proven: `clearErrorAndRestart()` helper, marker file scripts, ONBAS handles restart-pending correctly |
| **Question/answer flow** | Theoretical | Proven: `answerNodeQuestion()` helper, marker file scripts, question:ask → answer → node:restart flow works |

### Things Spec C Got Right (Still Valid)

| Assumption | Status |
|------------|--------|
| `describe.skip` for real agent tests | ✅ Still correct — real agents cost money, need auth |
| Structural assertions only (no content) | ✅ Still correct — LLM output is non-deterministic |
| Simple 2-3 node graph for real agent E2E | ✅ Still good — GOAT is for code-unit testing, real agents need simpler graphs |
| Session inheritance is the key thing to prove | ✅ Still the main gap — untested end-to-end with real agents |
| Parallel execution with independent sessions | ✅ Still valid goal |
| AC-34 through AC-40 | ✅ All still valid acceptance criteria |

---

## Part 2: Spec C References That Need Updating

### Section: "What Specs A and B Deliver"

| Component | Spec C Says | Reality |
|-----------|-------------|---------|
| ODS → AgentManagerService wiring | "Prerequisite" | ✅ Done in Plan 035 |
| AgentPod wraps IAgentInstance | "Prerequisite" | ✅ Done in Plan 035 |
| Plan 030 E2E updated with FakeAgentManagerService | "Prerequisite" | ✅ Done in Plan 035 |
| node-starter-prompt.md | "Prerequisite" | ✅ Exists at `packages/positional-graph/src/features/030-orchestration/` |
| node-resume-prompt.md | "Prerequisite" | ✅ Exists |
| `cg wf run` CLI driver loop | "Prerequisite" | ✅ Done in Plan 036 |
| PodManager execution tracking | "Prerequisite" | ✅ Done in Plan 036 |

**All prerequisites are met.** The "Depends On" section is satisfied.

### Section: "Test Graph Design"

Spec C proposes:
```
Line 0: get-spec (user-input, pre-completed before test)
Line 1: spec-writer (agent, serial) → reviewer (agent, serial, inherits session)
```

**This is still good** but can now be built using `withTestGraph` infrastructure instead of manual wiring. The fixture would live at `dev/test-graphs/real-agent-serial/` with `type: agent` unit.yaml files + prompt templates.

### Section: "GOAT Graph (Comprehensive E2E)"

Spec C says:
> Plan 037 builds it with `type: code` work units (simulation scripts). When Spec C is implemented, the same graph structure and assertions can be reused with `type: agent` work units.

**This is exactly what happened.** The GOAT graph exists with `units/` (code type). Spec C would add `units-agent/` alongside it. However, the GOAT is likely too complex for real agent testing (9 nodes × 30-120s each = 5-18 minutes, $$$ in API calls). The simple 2-3 node graph from Spec C's test graph design is better for real agents.

---

## Part 3: Concrete Changes Needed in Spec C

### 1. Remove "Prerequisites" Framing

All prerequisites are complete. Spec C should reference Plans 035/036/037 as **delivered dependencies**, not pending work.

### 2. Use withTestGraph Infrastructure

Instead of:
```typescript
const { service, ctx, workspacePath } = await createTestServiceStack(workspaceSlug);
await registerWorkspace(workspaceSlug, workspacePath);
// ... manual unit copy, chmod, etc.
```

Use:
```typescript
await withTestGraph('real-agent-serial', async (tgc) => {
  // Everything already set up — workspace registered, units copied, service ready
  const workUnitService = buildDiskWorkUnitService(tgc.workspacePath);
  const { orchestrationService, agentManager } = createTestOrchestrationStack(
    tgc.service, tgc.ctx, workUnitService
  );
  // ... configure real agent manager instead of fake
});
```

**Key difference**: For real agents, we need a REAL `AgentManagerService` instead of `FakeAgentManagerService`. The `createTestOrchestrationStack` currently hardcodes `FakeAgentManagerService`. Options:
- A) Add a parameter to `createTestOrchestrationStack` for agent manager override
- B) Create a separate `createRealAgentOrchestrationStack` function
- C) Wire the orchestration stack manually in the real agent test (acceptable for `describe.skip` tests)

### 3. Create Agent Unit Fixtures

New fixture: `dev/test-graphs/real-agent-serial/units/`
```
units/
  get-spec/unit.yaml          # type: user-input (same as GOAT user-setup)
  spec-writer/
    unit.yaml                  # type: agent, agent.prompt_template: prompts/main.md
    prompts/main.md            # "Read the spec input and write a brief summary..."
  reviewer/
    unit.yaml                  # type: agent, agent.prompt_template: prompts/main.md
    prompts/main.md            # "Review the summary and output approved/needs-changes..."
```

### 4. Update Test Count

Spec C says "3858+ tests". Current count is **3956 tests**. Not a blocker but should be updated.

### 5. Add Plan 037 Discoveries to Research Context

Key discoveries from Plans 036-037 that affect Spec C implementation:
- `node:started` doesn't exist — use `service.startNode()`
- Event source for accepted/completed must be `agent` or `executor`
- PodManager writes to `.chainglass/graphs/<slug>/` (need `ensureGraphsDir`)
- Input/output names: underscores only
- `triggerTransition` takes the manual line's own lineId
- `node:restart` sources: `human` or `orchestrator`
- `question:answer` does NOT auto-restart — needs explicit `node:restart`
- ONBAS handles `restart-pending` correctly (resolves to ready)

### 6. Simplify Scope

Spec C's complexity is now **lower** than estimated (CS-3) because:
- No test infrastructure to build (it exists)
- No workspace lifecycle to figure out (proven)
- No event flow to discover (documented)
- Just: create agent fixtures + write `describe.skip` tests using proven patterns

Could be **CS-2** (small) now.

---

## Part 4: What's Actually New Work vs Already Done

| Spec C AC | Status | Work Remaining |
|-----------|--------|----------------|
| AC-34: Real agent E2E with 2-3 nodes | **NEW** | Create agent fixtures, write test with real AgentManagerService |
| AC-35: Verify accept/read/save/complete | **PATTERN EXISTS** | Assertions exist; just apply to real agent test |
| AC-36: Session inheritance | **NEW** | Core test — prove second node inherits session |
| AC-37: Parallel execution | **NEW** | Create parallel fixture, prove independent sessions |
| AC-38: describe.skip | **TRIVIAL** | Just use `describe.skip` |
| AC-39: Structural assertions | **PATTERN EXISTS** | Use existing `assertNodeComplete`, `assertOutputExists` |
| AC-40: No regression | **TRIVIAL** | `just fft` |

**Net new work**: ~3 things:
1. Agent unit fixtures (unit.yaml + prompts/main.md) — maybe 30 minutes
2. Real AgentManagerService wiring in test — needs research on how to construct real one outside DI
3. Write 3 `describe.skip` tests (serial, session inheritance, parallel) — using proven withTestGraph pattern

---

## Part 5: Risk Reassessment

| Risk from Spec C | Original Assessment | Post-037 Assessment |
|-------------------|--------------------|--------------------|
| Real agents may not follow instructions | Medium | **Same** — still LLM-dependent |
| Tests are slow (30-120s each) | Expected | **Same** — inherent to real agents |
| Auth may expire | Medium | **Same** — `describe.skip` handles |
| Non-deterministic output | High | **Lower** — structural assertions proven in GOAT |
| Test infrastructure complexity | Medium | **ELIMINATED** — withTestGraph, assertions, helpers all proven |
| Workspace lifecycle issues | Medium | **ELIMINATED** — proven in 4 integration tests |
| Event flow correctness | Medium | **ELIMINATED** — GOAT proved all 8 scenarios |

---

## Decision Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Spec C is still valid | Yes, with updates | ACs are good, infrastructure is better than expected |
| Complexity downgrade | CS-3 → CS-2 | All infrastructure exists; just fixtures + skip tests |
| Use withTestGraph | Yes | Proven pattern, no manual wiring |
| Agent fixtures location | `dev/test-graphs/real-agent-serial/` | Consistent with existing fixture structure |
| GOAT agent variant | Defer | Too expensive/slow for real agents; simple graph is better |
| createTestOrchestrationStack | Option C (manual wiring) | `describe.skip` tests don't need shared helpers |

---

## Open Questions

### Q1: How to construct real AgentManagerService outside DI container?

**OPEN**: Need to research whether we can instantiate `AgentManagerService` directly or must use the CLI's production DI container. The CLI container registers real adapters (Claude Code, Copilot). May need `createCliProductionContainer().resolve(AGENT_DI_TOKENS.AGENT_MANAGER_SERVICE)`.

### Q2: Should we create `units-agent/` in the GOAT fixture?

**RESOLVED: No (for now).** Too complex for real agent testing. Simple 2-3 node graph is better. Add GOAT agent variant in a future plan if needed.

### Q3: Does the real AgentManagerService need workspace context?

**OPEN**: Real agents need `workspace` in their instance options. Check if `getNew({ name, type, workspace })` works with real adapters in the test workspace context.
