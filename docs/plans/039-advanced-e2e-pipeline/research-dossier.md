# Research Dossier: Plan 039 — Advanced E2E Pipeline

**Generated**: 2026-02-21T02:52:00Z
**Research Query**: "Research and prepare for the spec and plan — simplified context model + advanced E2E test"
**Plan**: 039-advanced-e2e-pipeline
**FlowSpace**: Available (not primary tool for this research)
**Findings**: 42 across 5 subagents

## Executive Summary

### What We're Building
1. Replace the 5-rule backward-walk context engine with the "Global Session + Left Neighbor" model (Workshop 03)
2. Build the centrepiece E2E test proving Q&A, parallel fan-out, context isolation, and session inheritance with real Copilot agents (Workshop 01)

### Key Insights
1. **Single production consumer**: Only `ods.ts:156` calls `getContextSource()` — the replacement is surgically contained
2. **NodeStatusResult gap**: The status API only carries `execution`, not the full `orchestratorSettings` struct — we need to thread `noContext` and `contextFrom` through the status pipeline
3. **contextFrom needs a readiness gate**: New 6th boolean in `ReadinessDetail` — target node must exist AND be complete before the node shows as ready
4. **No `getPendingQuestions` API**: E2E test must use `loadGraphState()` → `state.questions[]` to discover pending questions

### Quick Stats
- **Files to modify**: ~8 production files + ~4 test files
- **Files to create**: 1 E2E script + 6 fixture units
- **Production consumer**: 1 (ODS)
- **Test consumers**: 7 files using AgentContextService or FakeAgentContextService
- **Prior learnings surfaced**: 15+ from plans 019, 034, 035

## Data Flow: Orchestrator Settings (Schema → Storage → Reality)

The complete pipeline for how node settings reach the context engine:

```
1. Schema:        NodeOrchestratorSettingsSchema    (orchestrator-settings.schema.ts:22-26)
                  ↓ { execution, waitForPrevious }
2. Storage:       NodeConfig.orchestratorSettings    (node.schema.ts:24)
                  ↓ Written by addNode() (service.ts:704-714)
3. Status API:    NodeStatusResult.execution          (interface.ts:246)
                  ↓ Read by getNodeStatus() (service.ts:1091)
4. Reality:       NodeReality.execution               (reality.types.ts:58)
                  ↓ Mapped by reality.builder.ts:58
5. Context:       getContextSource() reads NodeReality (agent-context.ts:27)
```

**GAP**: `NodeStatusResult` only exposes `execution`, not the full settings struct. To add `noContext` and `contextFrom`, we must either:
- **(A)** Add individual fields to `NodeStatusResult` and `NodeReality`
- **(B)** Expose the full `orchestratorSettings` on `NodeStatusResult`

**Recommendation: (A)** — flatter, avoids nested optional access in the context engine.

## Input Readiness Gates

Current gates in `ReadinessDetail` (reality.types.ts:30-37):

| Gate | Computed In | Logic |
|------|-------------|-------|
| `precedingLinesComplete` | service.ts:1061-1069 | All nodes on all earlier lines = complete |
| `transitionOpen` | service.ts:1071-1077 | Manual transition triggered (or auto) |
| `serialNeighborComplete` | service.ts:1079-1085 | Left serial neighbor complete (or pos 0) |
| `inputsAvailable` | service.ts:1100 | `inputPack.ok` — all required data inputs resolved |
| `unitFound` | service.ts:1101 | WorkUnit loaded successfully |

**New gate needed**: `contextFromReady` — if `contextFrom` is set, the target node must exist AND be complete.

Location: After `serialNeighborComplete` in `getNodeStatus()` (~service.ts:1087). The `ready` boolean is `canRunResult.canRun` which AND's all gates.

## Context Engine Consumers

**Single production call**: `ods.ts:156` — `this.deps.contextService.getContextSource(reality, node.nodeId)`

| Category | Files | Count |
|----------|-------|-------|
| Production code | `ods.ts` | 1 |
| Interface/types | `agent-context.types.ts`, `agent-context.schema.ts`, `ods.types.ts` | 3 |
| Implementations | `agent-context.ts`, `fake-agent-context.ts` | 2 |
| DI container | `container.ts:114-119` | 1 |
| Tests (real) | e2e, integration, scripts, graph-test-runner | 5 |
| Tests (fake) | ods unit tests | 2 |

**Replacement impact**: Modify the function body, update the fake, rewrite the unit tests. No interface changes needed — `IAgentContextService` and `ContextSourceResult` stay the same.

## Q&A Flow (Programmatic)

The E2E test answers questions via service calls, not CLI:

```
1. answerQuestion(ctx, slug, nodeId, questionId, answer)
   → raise('question:answer') → records answer, NO status transition
   → node stays in waiting-question

2. raiseNodeEvent(ctx, slug, nodeId, 'node:restart', {reason}, 'orchestrator')
   → handleNodeRestart() → status = 'restart-pending', clears pending_question_id

3. getNodeStatus() maps 'restart-pending' → 'ready' (service.ts:1053)

4. ONBAS sees 'ready' → returns start-node → ODS dispatches

The answerNodeQuestion() helper in dev/test-graphs/shared/helpers.ts does both steps.
```

**Question discovery**: No `getPendingQuestions()` API exists. Test must call `loadGraphState()` and inspect `state.questions[]`, or check `getNodeStatus().pendingQuestion` when status is `waiting-question`. The reality builder already exposes `reality.pendingQuestions` as a filtered list.

## Prior Learnings (Critical)

### Session & Context
- **Subscribe before send**: Event listeners MUST be registered before `sendAndWait()` (PL-12)
- **Copilot session destruction**: `compact()` can destroy sessions — defensive checks needed (PL-04)
- **Workspace-scoped storage**: Sessions at `<worktree>/.chainglass/data/agents/` (ADR-0008)
- **Storage-first**: Disk append before SSE broadcast (PL-01)

### E2E Testing
- **Three-tier architecture**: Unit (fakes) → Real Integration (skipIf) → CLI E2E (skipIf) (Workshop 01, Plan 034)
- **Non-deterministic assertions**: Test structural outcomes (sessionId exists, status transitions) NOT agent output content
- **Poll for sessionId**: ODS fire-and-forget means poll `pod.sessionId` with timeout
- **Manual graph advancement**: Wiring tests advance graph manually; protocol tests let agents drive

### Code Quality
- **NDJSON corruption**: Silent skip corrupted lines (PL-07)
- **Path traversal**: Validate sessionId at every adapter entry (PL-09)
- **TypeScript unions**: Intersection (`&`) not extends for discriminated union additions (PL-14)

## Modification Risk Assessment

### Safe to Modify
- `agent-context.ts` — isolated pure function, single consumer, comprehensive tests
- `orchestrator-settings.schema.ts` — additive change (new optional fields)
- `reality.types.ts` — additive change (new readonly fields)

### Modify with Caution
- `positional-graph.service.ts` — large file (~2500 lines), changes touch `getNodeStatus()` and `addNode()`
- `reality.builder.ts` — must stay in sync with `NodeStatusResult` interface

### Danger Zones
- `ods.ts` — fire-and-forget timing, session ID persistence chain. Changes here caused GOAT test flake in plan 038
- `onbas.ts` — stateless rules engine. NO changes needed for this plan, do not touch

## Files Inventory

### Production Files to Modify

| File | Change | Risk |
|------|--------|------|
| `packages/positional-graph/src/schemas/orchestrator-settings.schema.ts` | Add `noContext`, `contextFrom` | Low |
| `packages/positional-graph/src/features/030-orchestration/agent-context.ts` | Replace engine (~70 lines) | Low (isolated) |
| `packages/positional-graph/src/features/030-orchestration/reality.types.ts` | Add `noContext?`, `contextFrom?` to NodeReality | Low |
| `packages/positional-graph/src/features/030-orchestration/reality.builder.ts` | Wire new fields from status result | Low |
| `packages/positional-graph/src/features/030-orchestration/reality.view.ts` | Delete `getFirstAgentOnPreviousLine()` | Low |
| `packages/positional-graph/src/interfaces/positional-graph-service.interface.ts` | Add fields to NodeStatusResult | Medium |
| `packages/positional-graph/src/services/positional-graph.service.ts` | Add contextFrom gate + expose fields in getNodeStatus() | Medium |
| `packages/positional-graph/src/schemas/node.schema.ts` | Already supports full struct (no change needed) | None |

### Test Files to Modify/Create

| File | Change |
|------|--------|
| `test/unit/.../agent-context.test.ts` | Rewrite for new rules (R0-R5) |
| `test/unit/.../fake-agent-context.ts` | Update if interface changes |
| `dev/test-graphs/advanced-pipeline/units/*` | Create 6 work unit fixtures |
| `scripts/test-advanced-pipeline.ts` | Create E2E test script |

### Files NOT Changing
- `ods.ts` — no changes, uses same `IAgentContextService` interface
- `onbas.ts` — no changes
- `ods.types.ts` — no changes (interface stays same)
- `container.ts` — no changes (same class name, same interface)

## Next Steps

1. **`/plan-1b-specify`** — Create the feature specification for plan 039
2. **`/plan-3-architect`** — Phase the implementation (context engine first, then E2E test)
3. No external research needed — all questions answered by codebase exploration

---

**Research Complete**: 2026-02-21T02:55:00Z
**Report Location**: `docs/plans/039-advanced-e2e-pipeline/research-dossier.md`
