# Fix Tasks: Phase 2: Implementation and Contract Tests

Apply in order. Re-run review after fixes.

## Critical / High Fixes

### FT-001: Restore Domain Dependency Direction at Composition Boundary
- **Severity**: HIGH
- **File(s)**:
  - /Users/jordanknight/substrate/059-fix-agents/packages/positional-graph/src/container.ts
  - /Users/jordanknight/substrate/059-fix-agents/packages/positional-graph/src/workflow-events/index.ts
- **Issue**: `_platform/positional-graph` container composes workflow-events implementation internals directly (`WorkflowEventsService`, `WorkflowEventObserverRegistry`), violating declared infrastructure→business direction and contract boundary checks.
- **Fix**:
  1. Move WorkflowEvents composition into a workflow-events-owned registration entrypoint (business-facing module).
  2. Make infrastructure container consume only a stable public contract/provider boundary (or remove composition from infra container and compose at app layer).
  3. Keep DI token binding unchanged for consumers.
- **Patch hint**:
  ```diff
  - import { WorkflowEventObserverRegistry } from './workflow-events/observer-registry.js';
  - import { WorkflowEventsService } from './workflow-events/workflow-events.service.js';
  - export function registerWorkflowEventsServices(...) { ... }
  + // consume workflow-events registration via public boundary
  + import { registerWorkflowEventsServices } from './workflow-events/index.js';
  ```

### FT-002: Enforce Real/Fake Behavioral Contract Parity
- **Severity**: HIGH
- **File(s)**:
  - /Users/jordanknight/substrate/059-fix-agents/test/contracts/workflow-events.contract.ts
  - /Users/jordanknight/substrate/059-fix-agents/test/contracts/workflow-events.contract.test.ts
- **Issue**: Behavioral suite runs only for fake implementation; real implementation receives method-shape conformance only. This leaves AC-05 parity unproven.
- **Fix**:
  1. Run a behavioral subset against real implementation with deterministic fixture/setup.
  2. Include ask→answer→getAnswer and observer behavior checks for real path.
  3. Keep fake-only tests only where fixture limitations are explicit and documented.
- **Patch hint**:
  ```diff
   workflowEventsConformanceTests('WorkflowEventsService (Real)', createReal);
  +workflowEventsBehavioralTests('WorkflowEventsService (Real)', createReal);
  ```

## Medium / Low Fixes

### FT-003: Prove Unsubscribe Behavior with Post-Unsubscribe Emission
- **Severity**: MEDIUM
- **File(s)**:
  - /Users/jordanknight/substrate/059-fix-agents/test/contracts/workflow-events.contract.ts
- **Issue**: Unsubscribe test does not emit any event after `unsub()`, so it does not verify actual handler removal.
- **Fix**: Emit one event after `unsub()` and assert listener invocation count remains unchanged.
- **Patch hint**:
  ```diff
   const unsub = service.onEvent('test-graph', (e) => events.push(e));
   unsub();
  -expect(events).toHaveLength(0);
  +await service.reportError('test-graph', 'node-a', { code: 'E1', message: 'x' });
  +expect(events).toHaveLength(0);
  ```

### FT-004: Use Package/Public Imports in Contract Runner
- **Severity**: MEDIUM
- **File(s)**:
  - /Users/jordanknight/substrate/059-fix-agents/test/contracts/workflow-events.contract.test.ts
- **Issue**: Relative imports reach into package internals across boundaries.
- **Fix**: Import through package aliases/public exports.
- **Patch hint**:
  ```diff
  - import { WorkflowEventsService } from '../../packages/positional-graph/src/workflow-events/workflow-events.service.js';
  + import { WorkflowEventsService } from '@chainglass/positional-graph';
  ```

### FT-005: Add Required 5-Field Test Doc Blocks
- **Severity**: MEDIUM
- **File(s)**:
  - /Users/jordanknight/substrate/059-fix-agents/test/contracts/workflow-events.contract.ts
- **Issue**: Tests are missing mandatory Test Doc comments required by rules/constitution.
- **Fix**: Add Why / Contract / Usage Notes / Quality Contribution / Worked Example blocks to new `it(...)` cases.
- **Patch hint**:
  ```diff
   it('returns a questionId', async () => {
  +  /*
  +  Test Doc:
  +  - Why: ...
  +  - Contract: ...
  +  - Usage Notes: ...
  +  - Quality Contribution: ...
  +  - Worked Example: ...
  +  */
      const result = await service.askQuestion(...);
   });
  ```

### FT-006: Align Domain Docs and Domain Manifest to Actual Phase 2 State
- **Severity**: MEDIUM
- **File(s)**:
  - /Users/jordanknight/substrate/059-fix-agents/docs/domains/workflow-events/domain.md
  - /Users/jordanknight/substrate/059-fix-agents/docs/domains/domain-map.md
  - /Users/jordanknight/substrate/059-fix-agents/docs/plans/061-workflow-events/workflow-events-plan.md
- **Issue**: Docs still show active notifier edge/dependency and manifest omits changed files.
- **Fix**:
  1. Mark notifier dependency/edge as future (Phase 3) or remove until implemented.
  2. Update map health summary rows to match current dependency edges.
  3. Add missing changed files to plan Domain Manifest.
- **Patch hint**:
  ```diff
  - wfEvents -->|"ICentralEventNotifier<br/>SSE broadcast"| events
  + %% Phase 3 planned edge (not active in Phase 2)
  + wfEvents -.->|"ICentralEventNotifier (Phase 3 planned)"| events
  ```

### FT-007: Assert 3-Event Handshake Effect in Contract Suite
- **Severity**: LOW
- **File(s)**:
  - /Users/jordanknight/substrate/059-fix-agents/test/contracts/workflow-events.contract.ts
- **Issue**: AC-03 is currently documented but not directly asserted in changed contract tests.
- **Fix**: Add an assertion that `answerQuestion` causes restart side-effect (or equivalent observable signal) in real-path behavioral tests.
- **Patch hint**:
  ```diff
   await service.answerQuestion('test-graph', 'node-a', questionId, { confirmed: true });
  +expect(await assertNodeRestarted('test-graph', 'node-a')).toBe(true);
  ```

### FT-008: Reuse One Timestamp for askQuestion State + Observer Event
- **Severity**: LOW
- **File(s)**:
  - /Users/jordanknight/substrate/059-fix-agents/packages/positional-graph/src/workflow-events/workflow-events.service.ts
- **Issue**: Separate timestamp creation can create minor state/event mismatch.
- **Fix**: Generate one `askedAt` value and reuse it for both persisted state and observer event payload.
- **Patch hint**:
  ```diff
  - asked_at: new Date().toISOString(),
  + asked_at: askedAt,
  ...
  - const askedAt = new Date().toISOString();
  + const askedAt = new Date().toISOString();
  ```

## Re-Review Checklist

- [ ] All critical/high fixes applied
- [ ] Re-run `/plan-7-v2-code-review` and achieve zero HIGH/CRITICAL
