# Advanced E2E Pipeline: Context Engine Redesign + Multi-Agent Test

**Mode**: Full
**File Management**: PlanPak

📚 This specification incorporates findings from `research-dossier.md`

## Research Context

- **Components affected**: `agent-context.ts` (replace engine), `orchestrator-settings.schema.ts` (add fields), `reality.types.ts` / `reality.builder.ts` (wire new fields), `positional-graph.service.ts` (readiness gate + status exposure), `reality.view.ts` (delete unused helper)
- **Critical dependencies**: Single production consumer (`ods.ts:156`), `IAgentContextService` interface unchanged, `ContextSourceResult` type unchanged
- **Modification risks**: `positional-graph.service.ts` is ~2500 lines — changes touch `getNodeStatus()` and `addNode()`. `ods.ts` fire-and-forget timing caused flake in plan 038 — no changes needed there for this plan.
- **Link**: See `research-dossier.md` for full analysis

## Summary

The current 5-rule backward-walk context inheritance engine produces incorrect results when parallel agent nodes sit between a source and target node — the reviewer inherits from a parallel worker instead of from the spec-writer. This blocks multi-line workflows where context must skip over lines of parallel workers.

This plan replaces the engine with the "Global Session + Left Neighbor" model (6 flat rules, ~70 lines, no cross-line walks) and proves it works by building a centrepiece E2E test: a 6-node, 4-line pipeline with human input, Q&A loops, parallel fan-out with context isolation, and serial aggregation — all driven by real Copilot agents.

## Goals

1. **Correct context inheritance across parallel lines** — a reviewer on line 3 should inherit the global session (spec-writer on line 1), not a parallel worker's session on line 2
2. **Explicit context isolation** — `noContext: true` gives a node a fresh session; parallel scheduling and context isolation are orthogonal concerns
3. **Explicit context redirection** — `contextFrom: nodeId` lets a node inherit from any specific completed node, overriding default inheritance
4. **Input-gated `contextFrom`** — a node with `contextFrom` does not show as ready until the target node exists and is complete (readiness gate, not just runtime guard)
5. **Full orchestration shakedown** — as we implement and test, if anything in ONBAS, ODS, reality builder, event handlers, or any other orchestration component is found not working correctly, report findings in detail ready for workshopping and fix within this plan. No specific audit boundary — organic discovery during implementation and E2E testing. This is the full stress test before committing this system to the web world.
6. **Prove the system works end-to-end** — a repeatable, human-watchable E2E test that exercises Q&A, parallel fan-out, context isolation, global session inheritance, and serial aggregation with real LLM agents
7. **Human-in-the-loop mode** — the E2E script supports both scripted (deterministic, CI-safe) and interactive (human answers questions at terminal) modes via the same orchestration stack
8. **Delete dead code** — remove `getFirstAgentOnPreviousLine()` from `reality.view.ts` (backward walk helper no longer needed)

## Non-Goals

1. **No changes anticipated to ONBAS or ODS** — the research dossier suggests these are unchanged, but Goal 5 (full shakedown) may reveal otherwise. If the audit surfaces issues, they will be workshopped and fixed within this plan rather than deferred.
2. **No changes to the DI container** — same class name, same interface registration
3. **No `compactBefore` node setting** — `IAgentAdapter.compact()` exists but automatic pre-execution compaction is deferred to a future plan
4. **No CLI command changes** — all new settings (`noContext`, `contextFrom`) are set programmatically via `addNode()`, not via new CLI subcommands
5. **No web app fixes** — web compile errors are deliberately left for a future plan (per plan 034, Q6)
6. **No template/workflow-template system** — `contextFrom` uses concrete node IDs set by code; template-based ID resolution is future work

## Complexity

- **Score**: CS-3 (medium)
- **Breakdown**: S=1, I=0, D=1, N=0, F=0, T=2
  - Surface Area (S=1): ~8 production files modified, but changes are small and well-scoped
  - Integration (I=0): Purely internal; no external service changes
  - Data/State (D=1): Schema additions (`noContext`, `contextFrom`) to orchestrator settings; new readiness gate field
  - Novelty (N=0): Fully specified by three workshops — no ambiguity remains
  - Non-Functional (F=0): No performance, security, or compliance concerns
  - Testing/Rollout (T=2): Three test tiers — unit tests for engine rules, fixture-based integration, real-agent E2E script
- **Confidence**: 0.92
- **Assumptions**:
  - The single production consumer (`ods.ts:156`) means replacement is surgically contained
  - `ContextSourceResult` type and `IAgentContextService` interface do not change
  - Existing Q&A event flow (`answerQuestion` → `node:restart` → `ready`) works as documented
  - `withTestGraph` fixture pattern handles the advanced pipeline's 6-unit structure
- **Dependencies**: None external. Depends on existing ONBAS line ordering, ODS dispatch, Q&A event system — audit in early phase will confirm correctness or surface changes.
- **Risks**: Real agent E2E runs are non-deterministic (30-120s); structural assertions only, no content assertions. Shakedown audit may reveal ONBAS/ODS changes needed, expanding scope.
- **Phases**: Context engine replacement → orchestration audit + fixes → fixture creation → E2E script → verification with real agents

## Acceptance Criteria

1. **AC-1**: When a serial node at pos 0 on line N has no `contextFrom`, it inherits the session of the global agent (first non-`noContext` agent in the graph), regardless of how many lines of parallel/noContext agents sit between them
2. **AC-2**: When a node has `noContext: true`, it receives a fresh session — regardless of execution mode or position
3. **AC-3**: When a node has `contextFrom: <nodeId>`, it inherits the session of the specified node. The node does not show as ready (via ONBAS) until the target node exists and is complete
4. **AC-4**: When a parallel node at pos > 0 has no `noContext`, it receives a fresh session automatically (independent workers)
5. **AC-5**: When a serial node at pos > 0 walks left, it inherits from the nearest agent to its left on the same line (skipping only non-agent nodes like code and user-input)
6. **AC-6**: The left-hand rule is absolute within a line — serial nodes inherit from their left agent neighbor even if that neighbor is parallel or has `noContext`
7. **AC-7**: The `getFirstAgentOnPreviousLine()` helper on RealityView is deleted (not deprecated)
8. **AC-8**: The E2E pipeline test completes with `exitReason === 'complete'` and all 6 nodes in `complete` status
9. **AC-9**: Session IDs prove context inheritance: spec-writer (1-0), reviewer (3-0), and summariser (3-1) share the same session ID
10. **AC-10**: Session IDs prove context isolation: programmer-a (2-0) and programmer-b (2-1) each have unique session IDs different from each other and from the spec-writer
11. **AC-11**: The Q&A handshake works end-to-end: spec-writer asks a question, the script detects and answers it, the agent resumes and produces outputs reflecting the answer
12. **AC-12**: Parallel nodes on line 2 do not start until line 1 is complete (ONBAS line ordering, verified by timing assertions)
13. **AC-13**: All agent nodes produce non-empty outputs matching their defined output schemas
14. **AC-14**: A shakedown audit of ONBAS, ODS, reality builder, and event handlers is completed. Any issues found are workshopped and resolved within this plan — no known orchestration bugs are deferred to future plans

## Risks & Assumptions

| Risk | Mitigation | Impact |
|------|-----------|--------|
| Real agent E2E runs take 30-120s and are non-deterministic | Structural assertions only (session IDs, statuses, output existence) — never assert on LLM output content | Test flake |
| `positional-graph.service.ts` is large (~2500 lines) | Changes are additive and scoped to `getNodeStatus()` and `addNode()` only | Merge conflict risk |
| Q&A handshake timing — `answerQuestion` + `node:restart` is a 2-step protocol | Use existing `answerNodeQuestion()` helper that does both steps atomically | Race condition |
| Old tests depend on old engine behaviour | Rewrite test suite entirely for new rules — no incremental migration | Test gap during transition |
| `noContext` flag on storage — existing graphs lack it | Default is `false`, additive schema change — existing graphs unaffected | Backward compatibility |

**Assumptions**:
- `ods.ts` is the ONLY production consumer of `getContextSource()` (verified by research dossier)
- `reality.pendingQuestions` is populated by the reality builder from `state.questions[]` (verified)
- `withTestGraph` can handle 6 work units across 4 lines (extrapolation from existing 2-node tests)
- Copilot SDK `createSession` / `resumeSession` handles session inheritance correctly when given an existing session ID

## Open Questions

*All open questions were resolved during workshops. See Workshop 01 (OQ1-OQ5) and Workshop 03 (OQ1-OQ6) for resolution history.*

No open questions remain.

## ADR Seeds (Optional)

### ADR Seed 1: Context Engine Replacement Strategy

- **Decision Drivers**: Current backward-walk engine cannot skip lines with agent nodes; single production consumer makes full replacement low-risk; new model is simpler (6 flat rules vs 5 with ordering dependencies)
- **Candidate Alternatives**:
  - A: Full replacement of `getContextSource()` with new engine (chosen — clean break, same interface)
  - B: Patch existing engine with "walk-invisibility" for noContext nodes (rejected — adds complexity to already complex logic)
  - C: Add `contextFrom` to all nodes and make everything explicit (rejected — too much ceremony for simple graphs)
- **Stakeholders**: Workflow engine consumers, E2E test infrastructure

### ADR Seed 2: Parallel Scheduling vs Context Isolation Orthogonality

- **Decision Drivers**: Old model coupled `parallel` execution with `new` context; users couldn't have parallel nodes that share context; makes two independent concerns implicitly linked
- **Candidate Alternatives**:
  - A: Keep coupling — parallel always means fresh (rejected — limits expressiveness)
  - B: Make orthogonal — `parallel` is scheduling, `noContext` is context (chosen — explicit, composable)
- **Stakeholders**: Graph designers, workflow template authors

## Workshop Opportunities

All workshop opportunities have been addressed:

| Topic | Type | Workshop | Status |
|-------|------|----------|--------|
| Context inheritance model | State Machine | [Workshop 03](./workshops/03-simplified-context-model.md) | ✅ Complete |
| E2E test design + Q&A flow | Integration Pattern | [Workshop 01](./workshops/01-multi-line-qa-e2e-test-design.md) | ✅ Complete |
| Backward walk analysis (historical) | State Machine | [Workshop 02](./workshops/02-context-backward-walk-scenarios.md) | ⚠️ Deprecated (led to Workshop 03) |

No further workshops needed before architecture.

## Testing Strategy

- **Approach**: Full TDD
- **Rationale**: This is the full shakedown of the orchestration system before committing to the web world — correctness must be proven at every layer
- **Focus Areas**:
  - Context engine rules (R0-R5): exhaustive unit tests for all 6 rules, all 7 scenarios from Workshop 03
  - `contextFrom` readiness gate: unit tests for input gate behaviour
  - Real-agent E2E: structural assertions (session IDs, statuses, output existence)
  - Q&A handshake: scripted answer flow end-to-end
- **Excluded**: LLM output content — never assert on what the agent writes, only that it wrote something
- **Mock Usage**: No fakes, no mocks — real implementations only. This is a real-world shakedown; the context engine tests use real `PositionalGraphReality` objects, and the E2E test uses real Copilot agents.

## Documentation Strategy

- **Location**: docs/how/ only
- **Rationale**: Symlink `docs/how/context-inheritance.md` → Workshop 03 already exists. E2E script usage will also live in docs/how/
- **Target Audience**: Developers building workflows and future contributors to the orchestration engine
- **Maintenance**: Updated when context rules change or new E2E patterns are added

## Clarifications

### Session 2026-02-21

**Q1: Workflow Mode** → **Full**
Rationale: CS-3 feature with multiple phases, orchestration audit, and three test tiers. All gates required.

**Q2: Testing Strategy** → **Full TDD, no fakes, no mocks**
Rationale: Real-world shakedown — real `PositionalGraphReality` objects for unit tests, real Copilot agents for E2E. No fakes, no mocks.

**Q3: Documentation Strategy** → **docs/how/ only**
Rationale: Symlink `docs/how/context-inheritance.md` → Workshop 03 already exists. E2E script usage docs will go in `docs/how/` too.

**Q4: Shakedown audit scope** → **No specific boundary**
Rationale: Not a formal scoped audit — if anything is found not working during implementation or E2E testing, report the detail ready for workshopping and fix within this plan. Organic discovery, not a checklist.

**Q5: FakeAgentContextService** → **Update to match new engine**
Rationale: ODS unit tests rely on it. Update to implement the new 6-rule logic so fake stays in sync with real. (The "no fakes" policy applies to *this plan's* tests — existing infrastructure fakes are maintained.)

### Coverage Summary

| Category | Status | Notes |
|----------|--------|-------|
| Workflow Mode | ✅ Resolved | Full |
| Testing Strategy | ✅ Resolved | Full TDD, no fakes/mocks for this plan's tests |
| Mock/Stub Policy | ✅ Resolved | Real implementations only; existing infra fakes maintained |
| Documentation Strategy | ✅ Resolved | docs/how/ only |
| File Management | ✅ Resolved | PlanPak |
| Shakedown Scope | ✅ Resolved | Organic — fix what we find |
| FakeAgentContextService | ✅ Resolved | Update to match new engine |
| Context Rules (R0-R5) | ✅ Pre-resolved | Workshop 03 |
| Q&A Flow | ✅ Pre-resolved | Workshop 01 |
| Data Model | ✅ Pre-resolved | Research dossier |
| Edge Cases | ✅ Pre-resolved | Workshop 03 scenarios 1-7 |
| Outstanding | None | — |
