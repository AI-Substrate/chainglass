# Fix Tasks: Phase 2: Web DI + Execution Manager

Apply in order. Re-run review after fixes.

## Critical / High Fixes

### FT-001: Make `start()` idempotent while a workflow is still starting
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/074-actaul-real-agents/apps/web/src/features/074-workflow-execution/workflow-execution-manager.ts
- **Issue**: `start()` only returns `{started:false, already:true}` when the existing handle is already `running`. A second call during the `starting` window creates a second handle and launches a second `drive()` loop for the same workflow.
- **Fix**: Treat `starting` as in-flight and idempotent too. Reuse the existing handle state instead of replacing it, and keep the second call from invoking `drive()` again.
- **Patch hint**:
  ```diff
  - if (existing && existing.status === 'running') {
  + if (existing && (existing.status === 'running' || existing.status === 'starting')) {
        return { started: false, already: true, key };
      }
  ```

### FT-002: Add deterministic lifecycle tests for stop/idempotence
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/074-actaul-real-agents/test/unit/web/features/074-workflow-execution/workflow-execution-manager.test.ts; /Users/jordanknight/substrate/074-actaul-real-agents/packages/positional-graph/src/features/030-orchestration/fake-orchestration-service.ts
- **Issue**: The fake `drive()` returns immediately and ignores abort semantics, so AC3 and AC5 are not actually proved. The current "already running" test waits for completion and never asserts the idempotent return shape.
- **Fix**: Extend `FakeGraphOrchestration` with a pending/deferred drive mode that records `options.signal`, blocks until explicitly released, and lets the test observe when `drive()` is active. Then assert:
  - second `start()` during an active first run returns `{started:false, already:true}`
  - `stop()` aborts the signal, awaits settlement, calls `cleanup()`, and calls `markNodesInterrupted()` with active nodes
  - restart uses a fresh handle after eviction
- **Patch hint**:
  ```diff
  - async drive(options?: DriveOptions): Promise<DriveResult> {
  -   this.driveHistory.push(options);
  -   ...
  -   return this.driveResults[index];
  - }
  + setPendingDrive(pending: Promise<DriveResult>): void {
  +   this.pendingDrive = pending;
  + }
  +
  + async drive(options?: DriveOptions): Promise<DriveResult> {
  +   this.driveHistory.push(options);
  +   if (this.pendingDrive) {
  +     return await this.pendingDrive;
  +   }
  +   ...
  + }
  ```

## Medium / Low Fixes

### FT-003: Reconcile execution-manager ownership and domain artifacts
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/workflow-execution-plan.md; /Users/jordanknight/substrate/074-actaul-real-agents/docs/domains/_platform/positional-graph/domain.md; /Users/jordanknight/substrate/074-actaul-real-agents/docs/domains/domain-map.md; possibly /Users/jordanknight/substrate/074-actaul-real-agents/apps/web/src/features/074-workflow-execution/* if you choose to move code
- **Issue**: The plan declares the manager positional-graph-owned, but the code lives under `apps/web/src/features/074-workflow-execution/` and depends on `IWorkspaceService`. The manifest/domain doc/map do not agree on ownership or dependency direction.
- **Fix**: Choose one owner and make every artifact match. Either move the manager into the positional-graph source tree, or formally classify it as web/workflow-ui/integration-owned and update the manifest/map/docs accordingly.
- **Patch hint**:
  ```diff
  - | `apps/web/src/features/074-workflow-execution/workflow-execution-manager.ts` | positional-graph | internal |
  + | `apps/web/src/features/074-workflow-execution/workflow-execution-manager.ts` | workflow-ui | internal |
  ```
  _(If you keep positional-graph ownership instead, move the files and remove the `IWorkspaceService` dependency from positional-graph-owned code.)_

### FT-004: Make `destroyPod()` terminate before deletion
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/074-actaul-real-agents/packages/positional-graph/src/features/030-orchestration/pod-manager.types.ts; /Users/jordanknight/substrate/074-actaul-real-agents/packages/positional-graph/src/features/030-orchestration/pod-manager.ts; /Users/jordanknight/substrate/074-actaul-real-agents/packages/positional-graph/src/features/030-orchestration/fake-pod-manager.ts; /Users/jordanknight/substrate/074-actaul-real-agents/test/unit/positional-graph/features/030-orchestration/pod-manager.test.ts
- **Issue**: `destroyPod()` still performs a bare delete and never terminates the pod first, which contradicts T004's done-when contract.
- **Fix**: Change the method to terminate before removal, update the interface if it needs to become async, and mirror the behavior in the fake + contract tests.
- **Patch hint**:
  ```diff
  - destroyPod(nodeId: string): void {
  -   this.pods.delete(nodeId);
  - }
  + async destroyPod(nodeId: string): Promise<void> {
  +   const pod = this.pods.get(nodeId);
  +   if (!pod) return;
  +   await pod.terminate().catch(() => {});
  +   this.pods.delete(nodeId);
  + }
  ```

## Re-Review Checklist

- [ ] All critical/high fixes applied
- [ ] Re-run `/plan-7-v2-code-review` and achieve zero HIGH/CRITICAL
