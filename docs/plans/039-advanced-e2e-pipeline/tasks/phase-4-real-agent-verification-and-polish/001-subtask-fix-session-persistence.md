# Subtask 001: Fix Session Persistence Timing in ODS

## Parent Context

**Parent Plan:** [View Plan](../../advanced-e2e-pipeline-plan.md)
**Parent Phase:** Phase 4: Real Agent Verification and Polish
**Parent Task(s):** [4.6: Report and fix any orchestration issues found](../../advanced-e2e-pipeline-plan.md#phase-4-real-agent-verification-and-polish)

**Why This Subtask:**
Phase 3 E2E run scored 15/17. Two failures traced to session persistence timing in ODS — PodManager's in-memory session cache isn't reliably populated when the next node needs to inherit. Additionally, the E2E script's adapter factory counter drifts because spec-writer (global agent) calls `getNew()` on every Q&A restart. See [Workshop 04](../../workshops/04-e2e-shakedown-findings.md) for full analysis.

---

## Executive Briefing

### Purpose
Fix the session persistence timing bug in ODS that causes context inheritance to silently fail. Without this fix, any multi-node workflow where node B inherits from node A may get a fresh session instead — losing conversation continuity.

### What We're Building
Two surgical fixes:
1. **ODS**: Check for existing pod before calling `buildPodParams()` on restart — skip the agent factory if pod already exists
2. **E2E Script**: Fix adapter label assignment so labels match actual nodes, not factory call order

### Unblocks
- E2E assertion: `session chain: reviewer = summariser` (currently fails)
- E2E assertion: `isolation: programmer-a ≠ spec-writer` (fails due to label mismatch)
- Full 17/17 pass on the advanced pipeline E2E

### Example
**Before**: Reviewer dispatched → PodManager lookup for spec-writer session → returns the session from memory (was set in fire-and-forget `.then()`) → BUT on restart, ODS calls `buildPodParams()` → `getNew()` → creates unnecessary new adapter → counter drifts
**After**: Reviewer dispatched → existing pod found → reuses same adapter → correct session inheritance

---

## Objectives & Scope

### Objective
Fix 2 bugs found during Phase 3 E2E shakedown so all 17 assertions pass.

### Goals
- ✅ ODS skips `buildPodParams()` when existing pod found for a restarting node
- ✅ E2E script labels match actual node dispatch (not factory counter)
- ✅ 17/17 assertions pass on re-run

### Non-Goals
- ❌ Refactoring ODS fire-and-forget pattern (works correctly when pod is reused)
- ❌ Synchronous session persistence (not needed if pod reuse works)
- ❌ PodManager disk persistence changes (in-memory Map is sufficient within a single drive)

---

## Root Cause Analysis

### Bug 1: Adapter factory called on restart (label drift + unnecessary work)

**Path**: ODS `handleAgentOrCode()` → `buildPodParams()` → context engine returns `source: 'new'` for spec-writer (it's the global agent, R3) → `getNew()` calls adapter factory → counter++ → BUT `createPod()` returns the EXISTING pod, discarding the new adapter.

**Fix**: In `handleAgentOrCode()`, check `podManager.getPod(nodeId)` BEFORE calling `buildPodParams()`. If pod exists, skip the rebuild — the existing pod has the correct adapter from the first dispatch.

### Bug 2: Session inheritance lookup may fail on reviewer

**Path**: ODS `buildPodParams()` for reviewer → context engine returns `source: 'inherit', fromNodeId: 'spec-writer-xxx'` → `podManager.getSessionId('spec-writer-xxx')` → should return the session ID from the `.then()` callback that ran when spec-writer completed.

**Analysis**: The `.then()` callback writes to the in-memory Map. The Map IS populated by the time reviewer dispatches (spec-writer completed iterations ago, and the `.then()` fires as a microtask when the promise resolves). The 15/17 run showed `session chain: spec-writer = reviewer` PASSED — so this actually works. The real failure was `reviewer = summariser` and `programmer-a isolation`.

**Revised diagnosis**: Bug 1 (factory counter drift) causes the wrong session IDs to be attributed to the wrong nodes in the assertion output. Fixing Bug 1 may resolve all failures.

---

## Tasks

| Status | ID | Task | CS | Type | Dependencies | Absolute Path(s) | Validation | Subtasks | Notes |
|--------|------|------|-----|------|-------------|-------------------|-----------|----------|-------|
| [ ] | ST001 | In ODS `handleAgentOrCode()`, check `podManager.getPod(nodeId)` before `buildPodParams()`. If existing pod found, skip rebuild and reuse it. | 2 | Core | – | `/home/jak/substrate/033-real-agent-pods/packages/positional-graph/src/features/030-orchestration/ods.ts` | Existing pod reused on restart; factory NOT called for restarting nodes | – | ~line 115-130 |
| [ ] | ST002 | Fix E2E script adapter label assignment: use a `Map<string, string>` keyed by nodeId instead of counter. Assign label when ODS dispatches (via pod creation), not when factory is called. | 2 | Core | – | `/home/jak/substrate/033-real-agent-pods/scripts/test-advanced-pipeline.ts` | Labels match actual nodes in output | – | Replace counter with nodeId→label map |
| [ ] | ST003 | Re-run E2E test: `just test-advanced-pipeline` | 2 | Verify | ST001, ST002 | `/home/jak/substrate/033-real-agent-pods/scripts/test-advanced-pipeline.ts` | 17/17 assertions pass; exit code 0 | – | May need timeout increase |
| [ ] | ST004 | Run `just fft` — full quality gate | 1 | Verify | ST003 | All | Lint + format + test pass | – | |

---

## Alignment Brief

### Workshop Reference
See [Workshop 04: E2E Shakedown Findings](../../workshops/04-e2e-shakedown-findings.md) for complete analysis with code traces, session ID evidence, and flow diagrams.

### Key Code Locations

| File | Line | What |
|------|------|------|
| `ods.ts` | ~115 | `handleAgentOrCode()` — dispatch entry point |
| `ods.ts` | ~117 | `buildPodParams()` call — should be conditional |
| `ods.ts` | ~129 | `podManager.createPod()` — returns existing if found |
| `ods.ts` | ~139-142 | Fire-and-forget `.then()` — sets session in Map |
| `pod-manager.ts` | ~27-28 | `createPod()` reuse check |
| `agent-manager-service.ts` | ~35 | `getNew()` calls adapter factory |
| `agent-manager-service.ts` | ~53-56 | `getWithSessionId()` reuses existing instance |

### Implementation Outline

**ST001**: In `ods.ts handleAgentOrCode()` (~line 115), add:
```typescript
// Reuse existing pod on restart (skip factory + buildPodParams)
const existingPod = this.deps.podManager.getPod(nodeId);
if (existingPod) {
  existingPod.execute({...}).then(() => { /* persist session */ });
  return { ok: true, request, newStatus: 'starting', sessionId: existingPod.sessionId };
}
// ... existing buildPodParams + createPod flow for first dispatch
```

**ST002**: In the E2E script, replace the counter-based factory with a label map:
```typescript
const labelMap = new Map<string, string>();
// After buildAdvancedPipeline(), populate labelMap with nodeId → label
labelMap.set(ids.specId, 'spec-writer');
labelMap.set(ids.progAId, 'programmer-a');
// ... etc
```
Then in the factory, look up the label by the adapter's assigned node (may need the AgentManagerService to pass node info to factory).

### Commands to Run
```bash
# After ST001-ST002
just test-advanced-pipeline    # 17/17 expected
just fft                       # quality gate
```

### Risks
| Risk | Severity | Mitigation |
|------|----------|------------|
| Pod reuse changes execution semantics | Medium | AgentPod already has `_hasExecuted` flag for starter vs resume prompt selection — reuse is the designed path |
| Label fix requires AgentManagerService API change | Low | May just assign labels after graph build using nodeId map instead of factory counter |

---

## Phase Footnote Stubs

| Footnote | Task | Description |
|----------|------|-------------|
| | | |

---

## Evidence Artifacts

- **Execution log**: `docs/plans/039-advanced-e2e-pipeline/tasks/phase-4-real-agent-verification-and-polish/001-subtask-fix-session-persistence.execution.log.md`

---

## Discoveries & Learnings

| Date | Task | Type | Discovery | Resolution | References |
|------|------|------|-----------|------------|------------|
| | | | | | |

**Types**: `gotcha` | `research-needed` | `unexpected-behavior` | `workaround` | `decision` | `debt` | `insight`

---

## After Subtask Completion

**This subtask resolves a blocker for:**
- Parent Task: [4.6: Report and fix any orchestration issues found](../../advanced-e2e-pipeline-plan.md#phase-4-real-agent-verification-and-polish)

**When all ST### tasks complete:**

1. **Record completion** in parent execution log
2. **Resume parent phase work** — remaining Phase 4 tasks (4.1-4.5, 4.7-4.9) can proceed
3. **Run**: `/plan-6-implement-phase --phase "Phase 4" --plan "/home/jak/substrate/033-real-agent-pods/docs/plans/039-advanced-e2e-pipeline/advanced-e2e-pipeline-plan.md"`
