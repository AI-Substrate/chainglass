# Fix Tasks: Phase 2: Question Concept — Types, Schemas, Service

Apply in order. Re-run review after fixes.

## Critical / High Fixes

### FT-001: Make `out.json` writes truly first-write-wins
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/067-question-popper/apps/web/src/features/067-question-popper/lib/question-popper.service.ts
- **Issue**: `atomicWriteOut()` uses `renameSync(tmp, out)`, but `renameSync()` overwrites an existing target. Two writers can both pass the existence checks and the later rename silently replaces the first response.
- **Fix**: Claim the final `out.json` path with an exclusive write (`wx`) or another collision-safe primitive that fails with `EEXIST`, then cover the behavior with a focused race/double-write test.
- **Patch hint**:
  ```diff
  - fs.writeFileSync(tmpPath, JSON.stringify(response, null, 2));
  - if (fs.existsSync(outPath)) { ... }
  - fs.renameSync(tmpPath, outPath);
  + try {
  +   fs.writeFileSync(outPath, JSON.stringify(response, null, 2), { flag: 'wx' });
  + } catch (error) {
  +   if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
  +     throw new Error(`Response already written for event ${id} (race)`);
  +   }
  +   throw error;
  + } finally {
  +   if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
  + }
  ```

### FT-002: Sync the domain map for both new Plan 067 domains
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/067-question-popper/docs/domains/domain-map.md
- **Issue**: The mandatory domain topology artifact still has no `_platform/external-events` or `question-popper` nodes, no health rows, and no labeled dependency edges for the new contracts.
- **Fix**: Add both domains to the Mermaid map, label the edges with the actual contracts, and update the Domain Health Summary to include both domains.
- **Patch hint**:
  ```diff
  +  externalEvents["_platform/external-events<br/>EventPopperRequest, generateEventId"]
  +  questionPopper["question-popper<br/>IQuestionPopperService, QuestionPayloadSchema"]
  +  questionPopper -->|EventPopperRequest / generateEventId()| externalEvents
  +  externalEvents -->|WorkspaceDomain| events
  +  questionPopper -->|ICentralEventNotifier / WorkspaceDomain.EventPopper| events
  ```

## Medium / Low Fixes

### FT-003: Replace deep shared-module imports with public barrels
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/067-question-popper/apps/web/src/features/067-question-popper/lib/question-popper.service.ts, /Users/jordanknight/substrate/067-question-popper/apps/web/src/lib/di-container.ts, /Users/jordanknight/substrate/067-question-popper/test/contracts/question-popper.contract.ts, /Users/jordanknight/substrate/067-question-popper/test/contracts/question-popper.contract.test.ts
- **Issue**: Consumers still import `@chainglass/shared/interfaces/question-popper.interface` and `@chainglass/shared/features/027-central-notify-events/fake-central-event-notifier` directly instead of using the exported barrels.
- **Fix**: Switch imports to `@chainglass/shared/interfaces` and `@chainglass/shared/features/027-central-notify-events`; only add extra re-exports if a real public need remains.
- **Patch hint**:
  ```diff
  - import type { IQuestionPopperService } from '@chainglass/shared/interfaces/question-popper.interface';
  - import { FakeCentralEventNotifier } from '@chainglass/shared/features/027-central-notify-events/fake-central-event-notifier';
  + import type { IQuestionPopperService } from '@chainglass/shared/interfaces';
  + import { FakeCentralEventNotifier } from '@chainglass/shared/features/027-central-notify-events';
  ```

### FT-004: Close the missing AC-03 / AC-04 test gaps
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/067-question-popper/test/contracts/question-popper.contract.ts
- **Issue**: The suite never explicitly verifies the `multi` question variant, timeout default/override persistence, or that an unread alert has no response payload before acknowledgment.
- **Fix**: Add targeted contract/schema assertions for those behaviors, then rerun the phase build/test command used in this review.
- **Patch hint**:
  ```diff
  + it('C13: multi questions persist string[] answers', async () => { ... })
  + it('C14: timeout defaults to 600 and preserves explicit overrides', async () => { ... })
  + it('C15: unread alerts have no response before acknowledgeAlert', async () => { ... })
  ```

### FT-005: Expand Test Doc blocks to the full 5-field format
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/067-question-popper/test/contracts/question-popper.contract.ts, /Users/jordanknight/substrate/067-question-popper/test/contracts/question-popper.contract.test.ts
- **Issue**: The new tests only include `Why` and `Contract`, missing `Usage Notes`, `Quality Contribution`, and `Worked Example`.
- **Fix**: Update every new `Test Doc` block to the complete project-required format.
- **Patch hint**:
  ```diff
    /*
    Test Doc:
    - Why: ...
    - Contract: ...
  + - Usage Notes: ...
  + - Quality Contribution: ...
  + - Worked Example: ...
    */
  ```

### FT-006: Finish the documentation sync for Event Popper ownership
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/067-question-popper/docs/domains/_platform/events/domain.md, /Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/plan.md
- **Issue**: `_platform/events/domain.md` still omits `WorkspaceDomain.EventPopper`, and the plan Domain Manifest still leaves several changed files without documented ownership.
- **Fix**: Update `_platform/events/domain.md` Contracts/Concepts/History, and expand the plan Domain Manifest (or add an artifact section) so every changed file is traceable.
- **Patch hint**:
  ```diff
  - | `WorkspaceDomain` | Const object | ... | Channel name registry (`Workflows`, `Agents`, `FileChanges`, `WorkUnitState`; ... ) |
  + | `WorkspaceDomain` | Const object | ... | Channel name registry (`Workflows`, `Agents`, `FileChanges`, `WorkUnitState`, `EventPopper`; ... ) |
  +
  + ## Concepts
  + | Concept | Entry Point | What It Does |
  + |---------|-------------|-------------|
  + | Event Popper channel | `WorkspaceDomain.EventPopper` | Routes question/alert lifecycle SSE events |
  ```

## Re-Review Checklist

- [ ] All critical/high fixes applied
- [ ] Re-run `/plan-7-v2-code-review` and achieve zero HIGH/CRITICAL
