# Fix Tasks: Phase 3: SSE + GlobalState Plumbing

Apply in order. Re-run review after fixes.

## Critical / High Fixes

### FT-001: Make the workflow-execution key safe for GlobalState paths
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/074-actaul-real-agents/apps/web/src/features/074-workflow-execution/workflow-execution-manager.types.ts; /Users/jordanknight/substrate/074-actaul-real-agents/apps/web/src/lib/state/workflow-execution-route.ts
- **Issue**: The current `ExecutionKey` is `<worktreePath>:<graphSlug>`. When `workflowExecutionRoute` uses that value as `instanceId`, the published state path becomes `workflow-execution:<worktreePath>:<graphSlug>:status`, which `parsePath()` rejects as a 4-segment path.
- **Fix**: Introduce a path-safe public/state key (or a dedicated state-safe ID) and use it consistently for the SSE payload, `workflowExecutionRoute`, and any future UI subscription helpers. Keep raw `worktreePath` / `graphSlug` fields separate for filesystem operations.
- **Patch hint**:
  ```diff
  - export type ExecutionKey = `${string}:${string}`;
  - export function makeExecutionKey(worktreePath: string, graphSlug: string): ExecutionKey {
  -   return `${worktreePath}:${graphSlug}` as ExecutionKey;
  - }
  + export type ExecutionKey = string;
  + export function makeExecutionKey(worktreePath: string, graphSlug: string): ExecutionKey {
  +   return Buffer.from(`${worktreePath}:${graphSlug}`).toString('base64url');
  + }
  ```

### FT-002: Validate worktree paths before invoking execution manager actions
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/074-actaul-real-agents/apps/web/app/actions/workflow-execution-actions.ts
- **Issue**: The new server actions trust client-supplied `worktreePath` values. `resolveContextFromParams()` preserves unmatched paths, so restart/stop/status flows can reach graph-state operations at an unvalidated location.
- **Fix**: Reuse the server-side workspace/worktree validation pattern from `workflow-actions.ts`: resolve a trusted workspace context first, clamp to known worktrees, and only then call the manager. If needed, change `stopWorkflow` / `getWorkflowExecutionStatus` to accept `workspaceSlug` as well so every action can validate before acting.
- **Patch hint**:
  ```diff
  - export async function stopWorkflow(worktreePath: string, graphSlug: string): Promise<ActionResult> {
  + export async function stopWorkflow(
  +   workspaceSlug: string,
  +   worktreePath: string,
  +   graphSlug: string
  + ): Promise<ActionResult> {
        await requireAuth();
  +     const ctx = await resolveWorkspaceContext(workspaceSlug, worktreePath);
  +     if (!ctx) return { ok: false, error: 'Workspace not found' };
        const manager = getWorkflowExecutionManager();
  -     const result = await manager.stop(worktreePath, graphSlug);
  +     const result = await manager.stop(ctx.worktreePath, graphSlug);
  ```

## Medium / Low Fixes

### FT-003: Replace cross-domain internal imports with a formal contract and align domain ownership
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/074-actaul-real-agents/apps/web/src/features/074-workflow-execution/create-execution-manager.ts; /Users/jordanknight/substrate/074-actaul-real-agents/apps/web/src/features/074-workflow-execution/workflow-execution-manager.types.ts; /Users/jordanknight/substrate/074-actaul-real-agents/docs/domains/registry.md; /Users/jordanknight/substrate/074-actaul-real-agents/docs/domains/domain-map.md; /Users/jordanknight/substrate/074-actaul-real-agents/docs/domains/workflow-ui/domain.md
- **Issue**: The phase uses an unregistered `web-integration` owner, `create-execution-manager.ts` binds `_platform/events` internals directly, and the server actions reach an internal `get-manager` file rather than a public facade.
- **Fix**: Choose a registered owner (or formalize `web-integration`), expose a public execution-manager facade, and inject an events-domain contract such as `ISSEBroadcaster` instead of `sseManager`.
- **Patch hint**:
  ```diff
  - readonly broadcast: (channelId: string, eventType: string, data: unknown) => void;
  + readonly broadcaster: ISSEBroadcaster;
  
  - broadcast: sseManager.broadcast.bind(sseManager),
  + broadcaster: container.resolve<ISSEBroadcaster>(EVENTS_DI_TOKENS.SSE_BROADCASTER),
  
  - this.deps.broadcast(SSE_CHANNEL, 'execution-update', payload);
  + this.deps.broadcaster.broadcast(SSE_CHANNEL, 'execution-update', payload);
  ```

### FT-004: Replace mock/timer tests with fakes and add missing action/bridge evidence
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/074-actaul-real-agents/test/unit/web/features/074-workflow-execution/workflow-execution-manager.test.ts; /Users/jordanknight/substrate/074-actaul-real-agents/test/unit/web/state/workflow-execution-route.test.ts
- **Issue**: The new tests use `vi.fn()` and elapsed-time sleeps, which conflicts with repo test doctrine and still leaves server action return shapes plus mounted SSE→GlobalState behavior unproven.
- **Fix**: Use a fake broadcaster with assertion helpers instead of `vi.fn()`, rely on deterministic drive controls (for example `blockDrive()` / `releaseDrive()`), and add one focused action/connector test that proves the bridge end-to-end at the component/service boundary.
- **Patch hint**:
  ```diff
  - const broadcast = vi.fn();
  + const broadcaster = new FakeSSEBroadcaster();
  
  - await new Promise((r) => setTimeout(r, 10));
  + fakeHandle.releaseDrive({ exitReason: 'complete', iterations: 1, totalActions: 0 });
  + await driveSettled;
  
  - const calls = broadcast.mock.calls.filter(...)
  + expect(broadcaster.getBroadcastsForChannel('workflow-execution')).toContainEqual(...)
  ```

## Re-Review Checklist

- [ ] All critical/high fixes applied
- [ ] Re-run `/plan-7-v2-code-review` and achieve zero HIGH/CRITICAL
