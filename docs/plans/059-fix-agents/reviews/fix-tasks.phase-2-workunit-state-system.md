# Fix Tasks: Phase 2: WorkUnit State System

Apply in order. Re-run review after fixes.

## Critical / High Fixes

### FT-001: Wire AgentWorkUnitBridge into production lifecycle
- **Severity**: HIGH
- **File(s)**:
  - /Users/jordanknight/substrate/059-fix-agents/apps/web/src/lib/di-container.ts
  - /Users/jordanknight/substrate/059-fix-agents/apps/web/app/api/agents/route.ts (or agent lifecycle owner)
  - /Users/jordanknight/substrate/059-fix-agents/apps/web/app/api/agents/[id]/route.ts (or agent lifecycle owner)
- **Issue**: Bridge is implemented but not instantiated/used in production flow.
- **Fix**: Register a singleton bridge and invoke register/update/unregister on real lifecycle transitions.
- **Patch hint**:
  ```diff
  + let agentWorkUnitBridge: AgentWorkUnitBridge | null = null;
  + childContainer.register(AGENTS_DI_TOKENS.AGENT_WORK_UNIT_BRIDGE, {
  +   useFactory: (c) => {
  +     if (agentWorkUnitBridge) return agentWorkUnitBridge;
  +     const wus = c.resolve(POSITIONAL_GRAPH_DI_TOKENS.WORK_UNIT_STATE_SERVICE);
  +     const wf = c.resolve(WORKFLOW_DI_TOKENS.WORKFLOW_EVENTS_SERVICE);
  +     agentWorkUnitBridge = new AgentWorkUnitBridge(wus, wf);
  +     return agentWorkUnitBridge;
  +   },
  + });
  ```

### FT-002: Reconcile spec/phase acceptance criteria with delivered status-only contract
- **Severity**: HIGH
- **File(s)**:
  - /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/fix-agents-spec.md
  - /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/tasks/phase-2-workunit-state-system/tasks.md
  - /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/tasks/phase-2-workunit-state-system/execution.log.md
- **Issue**: AC text still expects Q&A-era methods (`askQuestion`, `answerQuestion`, etc.) while implementation intentionally removed them.
- **Fix**: Either (A) update AC-09/AC-13 and related phase text to status-observer model, or (B) implement missing APIs and tests.
- **Patch hint**:
  ```diff
  - AC-09: ... methods: register, unregister, updateStatus, askQuestion, answerQuestion, onAnswer, ...
  + AC-09: ... methods: register, unregister, updateStatus, getUnit, getUnits, getUnitBySourceRef, tidyUp
  
  - AC-13: Fake... getPublished, getQuestions, getAnswers
  + AC-13: Fake... getRegistered, getRegisteredCount, reset
  ```

### FT-003: Remove direct filesystem dependencies from service layer (or codify exception)
- **Severity**: HIGH
- **File(s)**:
  - /Users/jordanknight/substrate/059-fix-agents/apps/web/src/lib/work-unit-state/work-unit-state.service.ts
  - /Users/jordanknight/substrate/059-fix-agents/docs/project-rules/architecture.md (if choosing exception)
- **Issue**: Service imports `node:fs`/`node:path` directly, violating documented dependency-direction rule.
- **Fix**: Inject file/path abstraction adapter into service OR document/approve explicit architecture exception.
- **Patch hint**:
  ```diff
  - import * as fs from 'node:fs';
  - import * as path from 'node:path';
  + import type { IFileSystem, IPathResolver } from '@chainglass/shared/interfaces';
  
  - constructor(private readonly worktreePath: string, ...)
  + constructor(
  +   private readonly fs: IFileSystem,
  +   private readonly paths: IPathResolver,
  +   private readonly worktreePath: string,
  +   ...
  + )
  ```

## Medium / Low Fixes

### FT-004: Use workspace resolver output for persistence path
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/059-fix-agents/apps/web/src/lib/di-container.ts
- **Issue**: Context resolver is resolved but ignored; fallback uses `process.cwd()`.
- **Fix**: Resolve workspace/worktree path from context resolver and pass that into WorkUnitStateService.
- **Patch hint**:
  ```diff
  - const worktreePath = process.cwd();
  + const ctx = contextResolver.resolveFromPath(process.cwd());
  + const worktreePath = ctx?.worktreePath ?? process.cwd();
  ```

### FT-005: Reconcile Domain Manifest with touched files
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/fix-agents-plan.md
- **Issue**: Several phase-touched files are missing from `## Domain Manifest`.
- **Fix**: Add missing rows for route descriptor, shared barrels/token exports, and bridge test file (or explicit exclusion rule for artifact classes).
- **Patch hint**:
  ```diff
  + | `apps/web/src/lib/state/work-unit-state-route.ts` | _platform/state | cross-domain | SSE→state descriptor for work-unit-state |
  + | `packages/shared/src/interfaces/index.ts` | work-unit-state | contract | Re-export new interface |
  + | `test/unit/web/work-unit-state/agent-work-unit-bridge.test.ts` | agents | internal-test | Verifies bridge behavior |
  ```

### FT-006: Update agents domain doc currency
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/059-fix-agents/docs/domains/agents/domain.md
- **Issue**: Dependency/composition/history still marks bridge usage as future.
- **Fix**: Update dependency wording and add a Phase 2 history row.
- **Patch hint**:
  ```diff
  - | `work-unit-state` | IWorkUnitStateService | Future: AgentWorkUnitBridge publishes status/questions |
  + | `work-unit-state` | IWorkUnitStateService | AgentWorkUnitBridge publishes status transitions |
  + | 059-fix-agents Phase 2 | AgentWorkUnitBridge + workflow-events observer wiring | 2026-03-02 |
  ```

### FT-007: Refresh domain-map labels and health summary
- **Severity**: LOW
- **File(s)**: /Users/jordanknight/substrate/059-fix-agents/docs/domains/domain-map.md
- **Issue**: Edge labels and agents health summary are stale for workflow-events dependency.
- **Fix**: Remove outdated phase labels and include workflow-events contract/provider in agents summary row.
- **Patch hint**:
  ```diff
  - agents -->|"IWorkflowEvents<br/>onQuestionAsked<br/>(Phase 3)"| wfEvents
  + agents -->|"IWorkflowEvents<br/>onQuestionAsked"| wfEvents
  
  - Contracts In: ... IWorkUnitStateService ...
  + Contracts In: ... IWorkUnitStateService, IWorkflowEvents ...
  ```

### FT-008: Strengthen real-implementation persistence evidence and timestamp assertions
- **Severity**: MEDIUM
- **File(s)**:
  - /Users/jordanknight/substrate/059-fix-agents/test/contracts/work-unit-state.contract.test.ts
  - /Users/jordanknight/substrate/059-fix-agents/test/contracts/work-unit-state.contract.ts
- **Issue**: Real persistence/hydration checks are shallow; lastActivityAt assertion is weak.
- **Fix**: Add explicit real-service persistence/hydration tests and assert timestamp changes deterministically.
- **Patch hint**:
  ```diff
  + it('hydrates stale data and removes expired entries on startup', () => {
  +   // seed tmp work-unit-state.json with stale + protected entries
  +   // instantiate real service
  +   // assert stale idle removed, working/waiting_input retained
  + });
  
  - expect(after).toBeTruthy();
  + expect(after).not.toBe(before);
  ```

### FT-009: Add required Test Doc blocks in new tests
- **Severity**: MEDIUM
- **File(s)**:
  - /Users/jordanknight/substrate/059-fix-agents/test/contracts/work-unit-state.contract.ts
  - /Users/jordanknight/substrate/059-fix-agents/test/unit/web/work-unit-state/agent-work-unit-bridge.test.ts
- **Issue**: Tests omit mandatory 5-field Test Doc format required by project rules.
- **Fix**: Add Test Doc block (Why, Contract, Usage Notes, Quality Contribution, Worked Example) for each test case.
- **Patch hint**:
  ```diff
    it('should register agent in WorkUnitStateService', () => {
  +   /*
  +   Test Doc:
  +   - Why: Prevent regressions in bridge registration wiring.
  +   - Contract: registerAgent creates a work-unit entry with agent creator metadata.
  +   - Usage Notes: Call registerAgent once per lifecycle start.
  +   - Quality Contribution: Catches missing or malformed registration payloads.
  +   - Worked Example: registerAgent('agent-1', ...) => getUnit('agent-1') defined.
  +   */
  ```

## Re-Review Checklist

- [ ] All critical/high fixes applied
- [ ] Re-run `/plan-7-v2-code-review` and achieve zero HIGH/CRITICAL
