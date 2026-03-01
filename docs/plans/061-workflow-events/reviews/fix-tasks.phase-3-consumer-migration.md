# Fix Tasks: Phase 3: Consumer Migration

Apply in order. Re-run review after fixes.

## Critical / High Fixes

### FT-001: Surface restart failures in WorkflowEvents handshake
- **Severity**: HIGH
- **File(s)**:  
  - /Users/jordanknight/substrate/059-fix-agents/packages/positional-graph/src/workflow-events/workflow-events.service.ts
- **Issue**: `answerQuestion()` does not check `RaiseNodeEventResult.errors` from `node:restart`, so restart failures can be silently treated as success.
- **Fix**: Capture restart result, check `errors`, and throw `WorkflowEventError` with structured details when non-empty.
- **Patch hint**:
  ```diff
  -    try {
  -      await this.pgService.raiseNodeEvent(
  +    try {
  +      const restartResult = await this.pgService.raiseNodeEvent(
           ctx,
           graphSlug,
           nodeId,
           WorkflowEventType.NodeRestart,
           { reason: 'question-answered' },
           'human'
         );
  +      if (restartResult.errors && restartResult.errors.length > 0) {
  +        throw new WorkflowEventError(
  +          `Answer recorded but node restart failed: ${restartResult.errors.map((e) => e.message).join(', ')}`,
  +          restartResult.errors
  +        );
  +      }
       } catch (restartError) {
  ```

### FT-002: Update positional-graph domain contract docs after Q&A API deletion
- **Severity**: HIGH
- **File(s)**:  
  - /Users/jordanknight/substrate/059-fix-agents/docs/domains/_platform/positional-graph/domain.md
- **Issue**: Domain contract text still states `IPositionalGraphService` owns Q&A protocol after methods/types were removed.
- **Fix**: Remove Q&A ownership from contract description and add Plan 061 Phase 3 history entry describing Q&A API removal/migration to WorkflowEvents.
- **Patch hint**:
  ```diff
  -| `IPositionalGraphService` | Interface | ... | ... output storage, Q&A protocol |
  +| `IPositionalGraphService` | Interface | ... | ... output storage, node events/orchestration core |
  ...
  +| 061-P3 | Removed PGService Q&A methods/types; consumers migrated to workflow-events convenience API | 2026-03-01 |
  ```

## Medium / Low Fixes

### FT-003: Preserve structured errors for invalid questionId path
- **Severity**: MEDIUM
- **File(s)**:  
  - /Users/jordanknight/substrate/059-fix-agents/packages/positional-graph/src/workflow-events/workflow-events.service.ts
- **Issue**: Missing-question branch throws plain `Error`, causing generic fallback errors in CLI/web.
- **Fix**: Throw `WorkflowEventError` with a structured `ResultError` payload.
- **Patch hint**:
  ```diff
  -    if (!askEvent) {
  -      throw new Error(`Question ${questionId} not found in node ${nodeId} events`);
  -    }
  +    if (!askEvent) {
  +      throw new WorkflowEventError(
  +        `Question ${questionId} not found in node ${nodeId} events`,
  +        [{ code: 'E173', message: `Question ${questionId} not found`, action: 'Use a valid questionId from question:ask event' }]
  +      );
  +    }
  ```

### FT-004: Synchronize domain artifacts and map with Phase 3 changes
- **Severity**: MEDIUM
- **File(s)**:  
  - /Users/jordanknight/substrate/059-fix-agents/docs/domains/workflow-ui/domain.md  
  - /Users/jordanknight/substrate/059-fix-agents/docs/domains/domain-map.md  
  - /Users/jordanknight/substrate/059-fix-agents/docs/plans/061-workflow-events/workflow-events-plan.md
- **Issue**: Workflow UI gotcha text, workflow-events map node/edge details, and plan Domain Manifest are out of sync with current implementation.
- **Fix**: Update gotcha/history, add missing map contract/edge details, and include all touched phase files in Domain Manifest.
- **Patch hint**:
  ```diff
  -Q&A is a two-step handshake ... Both steps happen in the server action.
  +Q&A delegation now uses IWorkflowEvents.answerQuestion(); handshake remains internal to workflow-events.
  ```

### FT-005: Strengthen AC-11/AC-12 verification and test documentation compliance
- **Severity**: MEDIUM
- **File(s)**:  
  - /Users/jordanknight/substrate/059-fix-agents/test/integration/positional-graph/cli-event-commands.test.ts  
  - (add focused tests for) /Users/jordanknight/substrate/059-fix-agents/apps/web/app/actions/workflow-actions.ts and /Users/jordanknight/substrate/059-fix-agents/dev/test-graphs/shared/helpers.ts
- **Issue**: Consumer migration evidence is mostly service-level; new tests also miss required 5-field Test Doc comments.
- **Fix**: Add focused migration assertions for web/helper paths and include required Test Doc blocks in new tests.
- **Patch hint**:
  ```diff
   it('full ask → answer → get-answer cycle', async () => {
  +  /*
  +  Test Doc:
  +  - Why: ...
  +  - Contract: ...
  +  - Usage Notes: ...
  +  - Quality Contribution: ...
  +  - Worked Example: ...
  +  */
      ...
   });
  ```

### FT-006: Improve execution evidence reproducibility
- **Severity**: LOW
- **File(s)**:  
  - /Users/jordanknight/substrate/059-fix-agents/docs/plans/061-workflow-events/tasks/phase-3-consumer-migration/execution.log.md
- **Issue**: Full-suite pass claim is not accompanied by command output snippet/hash.
- **Fix**: Add exact command(s), pass summary, and output references for reproducible verification.

## Re-Review Checklist

- [ ] All critical/high fixes applied
- [ ] Re-run `/plan-7-v2-code-review` and achieve zero HIGH/CRITICAL
