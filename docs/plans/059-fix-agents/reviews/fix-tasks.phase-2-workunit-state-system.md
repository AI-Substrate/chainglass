# Fix Tasks: Phase 2: WorkUnit State System

Apply in order. Re-run review after fixes.

## Critical / High Fixes

### FT-001: Prevent ServerEventRoute stall after SSE message pruning
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/059-fix-agents/apps/web/src/lib/state/server-event-route.tsx
- **Issue**: `lastProcessedIndexRef` is index-based while `useSSE` defaults to pruning messages (`maxMessages = 1000`), which can cause routing to stop in long-lived sessions.
- **Fix**: Make cursor tracking resilient to pruning (preferred), or disable pruning for this route.
- **Patch hint**:
  ```diff
  -const { messages } = useSSE<ServerEvent>(`/api/events/${route.channel}`);
  +const { messages } = useSSE<ServerEvent>(
  +  `/api/events/${route.channel}`,
  +  undefined,
  +  { maxMessages: 0 }
  +);
  ```

### FT-002: Add focused automated tests for new SSE→state routing
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/059-fix-agents/test/unit/web/state/server-event-route.test.tsx (new), /Users/jordanknight/substrate/059-fix-agents/test/unit/web/state/state-connector.test.tsx (new or extend)
- **Issue**: No targeted tests cover route mapping, remove-instance behavior, burst processing, or source propagation.
- **Fix**: Add focused tests that exercise `ServerEventRoute` with controlled SSE input and assert `state.publish/removeInstance` behavior.
- **Patch hint**:
  ```diff
  +it('processes all queued messages and keeps routing after large streams', () => {
  +  // arrange fake SSE stream > 1000 messages
  +  // assert publish/removeInstance called for new events after pruning threshold
  +});
  +
  +it('tags server-origin source metadata on published state entries', () => {
  +  // assert source.origin === 'server' and channel/eventType fields are preserved
  +});
  ```

## Medium / Low Fixes

### FT-003: Isolate per-event failures in ServerEventRoute loop
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/059-fix-agents/apps/web/src/lib/state/server-event-route.tsx
- **Issue**: One malformed event can abort the effect and skip remaining events.
- **Fix**: Wrap per-event mapping/publish in try/catch, log contextual metadata, continue.
- **Patch hint**:
  ```diff
   for (let i = startIndex; i < messages.length; i++) {
  -  const event = messages[i];
  -  const updates = route.mapEvent(event);
  +  try {
  +    const event = messages[i];
  +    const updates = route.mapEvent(event);
  +    // existing publish/remove logic
  +  } catch (error) {
  +    console.warn('[ServerEventRoute] Failed to process event', {
  +      channel: route.channel,
  +      index: i,
  +      error,
  +    });
  +  }
   }
  ```

### FT-004: Make route domain registration idempotent
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/059-fix-agents/apps/web/src/lib/state/state-connector.tsx
- **Issue**: `registerDomain()` will throw on duplicate registration under remount/HMR when routes are active.
- **Fix**: Guard `registerDomain()` with existing-domain check (same pattern as `registerWorktreeState`).
- **Patch hint**:
  ```diff
   for (const route of SERVER_EVENT_ROUTES) {
  +  const exists = state.listDomains().some((d) => d.domain === route.stateDomain);
  +  if (exists) continue;
     state.registerDomain({
       domain: route.stateDomain,
  ```

### FT-005: Reconcile phase/domain artifact drift
- **Severity**: MEDIUM
- **File(s)**:
  - /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/fix-agents-plan.md
  - /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/tasks/phase-2-workunit-state-system/tasks.md
  - /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/tasks/phase-2-workunit-state-system/tasks.fltplan.md
- **Issue**: Subtask touches `_platform/events` and multiple files not represented in phase manifest/dependency docs.
- **Fix**: Update domain manifest and dependency sections to include this subtask’s actual touched files and `_platform/events` as modified dependency.
- **Patch hint**:
  ```diff
  -| _platform/events | existing | consume | Broadcast SSE events via ISSEBroadcaster |
  +| _platform/events | existing | modify | WorkspaceDomain channel updates + SSE route contracts |
  ```

### FT-006: Update domain docs/map for new routing contracts
- **Severity**: LOW
- **File(s)**:
  - /Users/jordanknight/substrate/059-fix-agents/docs/domains/_platform/events/domain.md
  - /Users/jordanknight/substrate/059-fix-agents/docs/domains/domain-map.md
- **Issue**: WorkspaceDomain contract/concepts and map contract labels are partially stale after ST001-ST004.
- **Fix**: Add WorkUnitState channel to Events contracts/concepts and refresh state domain contract labels in domain map.
- **Patch hint**:
  ```diff
  -| `WorkspaceDomain` | Const object | ... (`Workflows`, `Agents`, `FileChanges`; `Workgraphs` deprecated) |
  +| `WorkspaceDomain` | Const object | ... (`Workflows`, `Agents`, `FileChanges`, `WorkUnitState`; `Workgraphs` deprecated) |
  ```

### FT-007: Doctrine cleanup
- **Severity**: LOW
- **File(s)**:
  - /Users/jordanknight/substrate/059-fix-agents/apps/web/src/lib/state/server-event-route.tsx
  - /Users/jordanknight/substrate/059-fix-agents/apps/web/src/lib/state/state-connector.tsx
  - /Users/jordanknight/substrate/059-fix-agents/packages/shared/src/features/027-central-notify-events/workspace-domain.ts
- **Issue**: Two exported APIs lack explicit return types (`R-CODE-001`); one JSDoc line exceeds width (`R-CODE-005`).
- **Fix**: Add explicit return types and wrap long JSDoc line.
- **Patch hint**:
  ```diff
  -export function ServerEventRoute({ route }: ServerEventRouteProps) {
  +export function ServerEventRoute({ route }: ServerEventRouteProps): null {
  ...
  -export function GlobalStateConnector({ slug, worktreeBranch }: GlobalStateConnectorProps) {
  +export function GlobalStateConnector({ slug, worktreeBranch }: GlobalStateConnectorProps): JSX.Element {
  ```

## Re-Review Checklist

- [ ] All critical/high fixes applied
- [ ] Re-run `/plan-7-v2-code-review` and achieve zero HIGH/CRITICAL
