# Fix Tasks: Phase 5: Server Restart Recovery

Apply in order. Re-run review after fixes.

## Critical / High Fixes

### FT-001: Make `resumeAll()` persist the intended registry snapshot
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/074-actaul-real-agents/apps/web/src/features/074-workflow-execution/workflow-execution-manager.ts
- **Issue**: `resumeAll()` computes `toResume` and `toKeep`, but the final persistence path serializes only `this.executions`. That drops non-running entries and never explicitly writes the filtered registry state.
- **Fix**: Build the post-resume registry explicitly from `toKeep` plus the resumed/current entries and write it through `this.deps.registry.write(...)`, or remove `toKeep` semantics entirely if only live executions should remain.
- **Patch hint**:
  ```diff
  - if (toKeep.length !== registry.executions.length || resumed > 0) {
  -   this.persistRegistry();
  - }
  + const resumedEntries = [...this.executions.values()].map((handle) => toRegistryEntry(handle));
  + const nextRegistry = {
  +   version: 1,
  +   updatedAt: new Date().toISOString(),
  +   executions: [...toKeep, ...resumedEntries],
  + };
  + this.deps.registry.write(nextRegistry);
  ```

### FT-002: Keep registry state consistent when `start()` fails before `drive()` begins
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/074-actaul-real-agents/apps/web/src/features/074-workflow-execution/workflow-execution-manager.ts
- **Issue**: The manager persists a `starting` handle before workspace resolution and orchestration-handle acquisition. If setup fails in those steps, it broadcasts `failed` but never persists the terminal state or removes the stale handle.
- **Fix**: Wrap pre-drive setup in deterministic failure handling. On workspace/orchestration setup failure, either persist `failed` with the error message or remove the handle entirely so the registry cannot resurrect a bogus `starting` entry.
- **Patch hint**:
  ```diff
    if (!workspaceCtx) {
      handle.status = 'failed';
      handle.lastMessage = 'Failed to resolve workspace context';
      this.broadcastStatus(handle);
  +   this.persistRegistry();
      return { started: false, already: false, key };
    }
  
  - const orchestrationHandle = await this.deps.orchestrationService.get(workspaceCtx, graphSlug);
  + let orchestrationHandle;
  + try {
  +   orchestrationHandle = await this.deps.orchestrationService.get(workspaceCtx, graphSlug);
  + } catch (error) {
  +   handle.status = 'failed';
  +   handle.lastMessage = error instanceof Error ? error.message : String(error);
  +   this.broadcastStatus(handle);
  +   this.persistRegistry();
  +   return { started: false, already: false, key };
  + }
  ```

### FT-003: Replace the false-positive resume test and prove AC2 / AC3 / AC4
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/074-actaul-real-agents/test/unit/web/features/074-workflow-execution/workflow-execution-manager.test.ts
- **Issue**: The happy-path resume test currently passes even when resume fails, there is no direct proof that completed nodes are skipped after resume, and stale-entry cleanup is not asserted against the persisted registry.
- **Fix**: Configure the resumed manager's orchestration fake, assert `running`/`completed` only, add a partially-completed graph-state resume case for AC3, and assert the registry write excludes stale entries for AC4.
- **Patch hint**:
  ```diff
  - await mgr2.resumeAll();
  - await new Promise((r) => setTimeout(r, 50));
  - const status = mgr2.getStatus(existingPath, TEST_SLUG);
  - expect(['running', 'completed', 'failed', 'starting']).toContain(status);
  + configureSimpleGraph((deps2.orchestrationService as FakeOrchestrationService));
  + await mgr2.resumeAll();
  + const status = mgr2.getStatus(existingPath, TEST_SLUG);
  + expect(['running', 'completed']).toContain(status);
  + expect(fakeRegistry.lastWritten?.executions.some((e) => e.worktreePath === stalePath)).toBe(false);
  ```

### FT-004: Align canonical domain ownership for the `074-workflow-execution` slice
- **Severity**: HIGH
- **File(s)**:
  - /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/workflow-execution-plan.md
  - /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/tasks/phase-5-server-restart-recovery/tasks.md
  - /Users/jordanknight/substrate/074-actaul-real-agents/docs/domains/registry.md
  - /Users/jordanknight/substrate/074-actaul-real-agents/docs/domains/domain-map.md
  - /Users/jordanknight/substrate/074-actaul-real-agents/docs/domains/workflow-ui/domain.md
- **Issue**: The same source tree is assigned to `web-integration`, `074-workflow-execution`, and `workflow-ui` support code, but only `workflow-ui` is actually registered as a domain.
- **Fix**: Pick a single registered owner for the execution-support tree (or create/register a new domain), then make the plan manifest, phase dossier, registry, map, and owner `domain.md` all say the same thing.
- **Patch hint**:
  ```diff
  - | apps/web/src/features/074-workflow-execution/execution-registry.ts | web-integration | internal |
  + | apps/web/src/features/074-workflow-execution/execution-registry.ts | workflow-ui | internal |
  ```
  _(Use the chosen canonical owner consistently across every affected artifact.)_

## Medium / Low Fixes

### FT-005: Implement real file-backed corrupt-registry self-healing
- **Severity**: MEDIUM
- **File(s)**:
  - /Users/jordanknight/substrate/074-actaul-real-agents/apps/web/src/features/074-workflow-execution/execution-registry.ts
  - /Users/jordanknight/substrate/074-actaul-real-agents/apps/web/src/features/074-workflow-execution/workflow-execution-manager.ts
  - /Users/jordanknight/substrate/074-actaul-real-agents/test/unit/web/features/074-workflow-execution/execution-registry.test.ts
- **Issue**: The production adapter returns an empty registry on corrupt/invalid JSON but leaves the bad file in place, despite the phase docs/history claiming self-healing deletion.
- **Fix**: Delete corrupt files on parse/schema failure, or make the adapter surface a read failure that the manager removes. Add a test against the real file-backed adapter, not only a throwing fake.
- **Patch hint**:
  ```diff
    if (!result.success) {
      console.warn('[execution-registry] Registry file failed validation, returning empty:', result.error.message);
  +   removeRegistry();
      return createEmptyRegistry();
    }
  ```

### FT-006: Remove the direct `node:fs` dependency from `WorkflowExecutionManager`
- **Severity**: MEDIUM
- **File(s)**:
  - /Users/jordanknight/substrate/074-actaul-real-agents/apps/web/src/features/074-workflow-execution/workflow-execution-manager.ts
  - /Users/jordanknight/substrate/074-actaul-real-agents/apps/web/src/features/074-workflow-execution/workflow-execution-manager.types.ts
  - /Users/jordanknight/substrate/074-actaul-real-agents/apps/web/src/features/074-workflow-execution/create-execution-manager.ts
- **Issue**: The manager reaches directly to `fs.existsSync()` for worktree-existence validation instead of depending on an injected contract.
- **Fix**: Push stale-entry filtering behind an injected dependency (workspace/filesystem existence check) or into the registry/workspace layer so the manager stays interface-first.
- **Patch hint**:
  ```diff
  - if (!fs.existsSync(entry.worktreePath)) {
  + if (!(await this.deps.worktreeExists(entry.worktreePath))) {
  ```

### FT-007: Update the owning domain doc's structure, not just History
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/074-actaul-real-agents/docs/domains/workflow-ui/domain.md _(or the actual owner doc, if ownership changes)_
- **Issue**: The Phase 5 history row exists, but the Source Location / Composition / Concepts sections do not describe the new registry module, registry types/interface, or resume-on-bootstrap flow.
- **Fix**: Document the execution registry layer, debounced persistence, and restart-recovery responsibilities in the actual owner doc.
- **Patch hint**:
  ```diff
  - Supporting: `apps/web/src/features/074-workflow-execution/` — execution hook, button-state utility, manager types
  + Supporting: `apps/web/src/features/074-workflow-execution/` — execution hook, button-state utility, manager types, registry persistence, resume-on-bootstrap recovery
  + | `apps/web/src/features/074-workflow-execution/execution-registry.types.ts` | Registry types | Zod schemas, `IExecutionRegistry`, `toRegistryEntry()` |
  + | `apps/web/src/features/074-workflow-execution/execution-registry.ts` | Registry I/O | read/write/remove with atomic writes |
  ```

## Re-Review Checklist

- [ ] All critical/high fixes applied
- [ ] Medium fixes addressed or consciously deferred with rationale
- [ ] Re-run `/plan-7-v2-code-review` and achieve zero HIGH/CRITICAL
